import os
import logging
import numpy as np

logger = logging.getLogger(__name__)

# Lazy initialization of SentenceTransformer model
_model_instance = None

def get_sentence_transformer():
    global _model_instance
    if _model_instance is None:
        try:
            from sentence_transformers import SentenceTransformer
            # Load a lightweight, fast, 384-dimensional model (approx 120MB)
            logger.info("Loading SentenceTransformer model (all-MiniLM-L6-v2)...")
            _model_instance = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("SentenceTransformer model loaded successfully.")
        except Exception as e:
            logger.error(f"Failed to load SentenceTransformer: {e}")
            raise
    return _model_instance

def match_products(extracted_items: list, db_products: list, corrections: list = None) -> list:
    """
    Perform semantic matching using Sentence Transformers and FAISS.
    
    extracted_items: list of dicts, e.g. [{"name": "extracted_item_name", ...}]
    db_products: list of existing products from database, e.g. [{"id": "123", "name": "Product A"}]
    corrections: list of prior user corrections, e.g. [{"raw_name": "ext_name", "matched_product_id": "123"}]
    """
    if not extracted_items:
        return []
        
    # Create correction lookup map (case-insensitive)
    correction_map = {}
    if corrections:
        for c in corrections:
            raw = c.get("raw_name", "").strip().lower()
            if raw:
                correction_map[raw] = c.get("matched_product_id")

    # If no db_products exist, return items marked as new products
    if not db_products:
        for item in extracted_items:
            item["matched_product_id"] = None
            item["confidence"] = 0.0
        return extracted_items

    try:
        import faiss
        model = get_sentence_transformer()
        
        # 1. Generate embeddings for existing database products
        db_names = [p["name"] for p in db_products]
        logger.info(f"Generating embeddings for {len(db_names)} database products...")
        db_embeddings = model.encode(db_names, show_progress_bar=False, convert_to_numpy=True)
        
        # Normalize embeddings for cosine similarity
        faiss.normalize_L2(db_embeddings)
        
        # 2. Build FAISS Index (IndexFlatIP computes inner product / cosine similarity)
        dimension = db_embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        index.add(db_embeddings)
        
        # 3. Generate embeddings for extracted item names
        extracted_names = [item["name"] for item in extracted_items]
        logger.info(f"Generating embeddings for {len(extracted_names)} extracted names...")
        extracted_embeddings = model.encode(extracted_names, show_progress_bar=False, convert_to_numpy=True)
        faiss.normalize_L2(extracted_embeddings)
        
        # 4. Search FAISS Index
        # k=1 returns the single closest match
        similarities, indices = index.search(extracted_embeddings, k=1)
        
        # 5. Populate matches and confidence scores
        for idx, item in enumerate(extracted_items):
            clean_name_lower = item["name"].strip().lower()
            
            # Check corrections lookup map first
            if clean_name_lower in correction_map:
                corr_id = correction_map[clean_name_lower]
                # Find product details in db_products
                matched_prod = next((p for p in db_products if p["id"] == corr_id), None)
                if matched_prod:
                    item["matched_product_id"] = matched_prod["id"]
                    item["matched_product_name"] = matched_prod["name"]
                    item["confidence"] = 1.0 # 100% match from user correction
                    continue

            # Otherwise, use FAISS semantic match
            best_match_idx = indices[idx][0]
            confidence_score = float(similarities[idx][0])
            
            # If the index returned is valid
            if best_match_idx >= 0 and best_match_idx < len(db_products):
                matched_prod = db_products[best_match_idx]
                item["matched_product_id"] = matched_prod["id"]
                item["matched_product_name"] = matched_prod["name"]
                item["confidence"] = round(confidence_score, 4)
            else:
                item["matched_product_id"] = None
                item["confidence"] = 0.0
                
    except Exception as e:
        logger.error(f"Error during semantic matching: {e}")
        # Graceful fallback: set confidence to 0, matching to None
        for item in extracted_items:
            item["matched_product_id"] = None
            item["confidence"] = 0.0
            
    return extracted_items


def train_corrections_model(dataset: list, output_dir: str = "./fine_tuned_model"):
    """
    Retrains/fine-tunes the Sentence Transformer model using user corrections.
    dataset: list of dicts, e.g. [{"anchor": "raw_name", "positive": "correct_product_name"}]
    """
    if not dataset or len(dataset) < 5:
        logger.info("Dataset too small for fine-tuning. Requires at least 5 correction pairs.")
        return False
        
    try:
        from sentence_transformers import InputExample, losses
        from torch.utils.data import DataLoader
        
        model = get_sentence_transformer()
        
        train_examples = []
        for row in dataset:
            anchor = row.get("anchor")
            positive = row.get("positive")
            if anchor and positive:
                train_examples.append(InputExample(texts=[anchor, positive]))
                
        if not train_examples:
            return False
            
        logger.info(f"Starting model fine-tuning with {len(train_examples)} examples...")
        
        # Configure train dataloader and loss
        train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=8)
        # MultipleNegativesRankingLoss is ideal for pairing semantic synonyms
        train_loss = losses.MultipleNegativesRankingLoss(model=model)
        
        # Train the model for 1 epoch (fast training on CPU)
        model.fit(
            train_objectives=[(train_dataloader, train_loss)],
            epochs=1,
            warmup_steps=int(len(train_dataloader) * 0.1),
            show_progress_bar=False
        )
        
        # Save model
        os.makedirs(output_dir, exist_ok=True)
        model.save(output_dir)
        logger.info(f"Model fine-tuned and saved successfully to {output_dir}")
        return True
    except Exception as e:
        logger.error(f"Failed to fine-tune model: {e}")
        return False
