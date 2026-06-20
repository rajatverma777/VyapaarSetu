import json
import logging
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ocr_engine import extract_text_and_boxes
from document_understanding import parse_document_structure
from product_matching import match_products, train_corrections_model

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai_service")

app = FastAPI(
    title="Vyapaar Setu AI Assistant Service",
    description="Domain-specific self-hosted AI microservice for invoice parsing and semantic product matching.",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RetrainRequest(BaseModel):
    dataset: list # list of dicts: [{"anchor": "raw_name", "positive": "db_name"}]
    output_dir: Optional[str] = "./fine_tuned_model"

@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": "Vyapaar Setu AI Microservice",
        "features": ["PaddleOCR", "Donut/LayoutSpatial", "SentenceTransformers", "FAISS"]
    }

@app.post("/analyze-invoice")
async def analyze_invoice(
    file: UploadFile = File(...),
    db_products_str: Optional[str] = Form(None),
    corrections_str: Optional[str] = Form(None)
):
    try:
        contents = await file.read()
        filename_lower = file.filename.lower()
        content_type = file.content_type or ""
        
        # 1. Extract text and bounding boxes using PaddleOCR
        logger.info(f"Extracting text from file: {file.filename}")
        ocr_results = extract_text_and_boxes(contents)
        logger.info(f"Extracted {len(ocr_results)} text boxes.")
        
        # 2. Parse Layout / Document Structure
        logger.info("Parsing document layout and structures...")
        structured_items = parse_document_structure(ocr_results)
        logger.info(f"Extracted {len(structured_items)} structured items.")
        
        # 3. Parse db_products and corrections parameters
        db_products = []
        if db_products_str:
            try:
                db_products = json.loads(db_products_str)
            except Exception as pe:
                logger.error(f"Failed to parse db_products_str JSON: {pe}")
                
        corrections = []
        if corrections_str:
            try:
                corrections = json.loads(corrections_str)
            except Exception as ce:
                logger.error(f"Failed to parse corrections_str JSON: {ce}")
                
        # 4. Perform Semantic Product Matching & Similarity Scoring
        if db_products:
            logger.info("Matching products against database active items...")
            matched_items = match_products(structured_items, db_products, corrections)
        else:
            matched_items = structured_items
            for item in matched_items:
                item["matched_product_id"] = None
                item["confidence"] = 0.0
                
        return {"status": "success", "products": matched_items}
        
    except Exception as e:
        logger.exception("Error analyzing invoice")
        raise HTTPException(status_code=500, detail=f"AI analysis failed: {str(e)}")


@app.post("/retrain")
def retrain_model(req: RetrainRequest):
    success = train_corrections_model(req.dataset, req.output_dir)
    if success:
        return {"status": "success", "message": f"Model fine-tuned and saved successfully to {req.output_dir}"}
    else:
        raise HTTPException(status_code=500, detail="Model training failed or dataset was insufficient.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
