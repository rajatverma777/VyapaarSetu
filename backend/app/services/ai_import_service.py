import asyncio
import difflib
import logging
import re
from typing import Any, Dict, List, Optional
import httpx
from fastapi import HTTPException
from app.core.config import settings
from app.core.security import serialize_doc

logger = logging.getLogger(__name__)

class AIImportService:
    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id

    @staticmethod
    def _compute_similarity(name1: str, name2: str) -> float:
        return difflib.SequenceMatcher(None, name1.lower(), name2.lower()).ratio()

    @classmethod
    def _match_items_worker(
        cls,
        items: List[Dict[str, Any]],
        db_products: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        CPU-bound matching executed in separate thread pool to prevent event loop starvation.
        Optimized with token pre-filtering so we don't compute expensive SequenceMatcher on unrelated strings.
        """
        # Pre-process db products with token sets for rapid pre-filtering
        preprocessed = []
        for p in db_products:
            p_name = p.get("name", "")
            tokens = set(re.findall(r"\w+", p_name.lower()))
            preprocessed.append((p, p_name, tokens))

        results = []
        for item in items:
            prod_name = str(item.get("product_name") or item.get("name") or item.get("description") or "").strip()
            if not prod_name:
                continue

            query_tokens = set(re.findall(r"\w+", prod_name.lower()))
            best_match = None
            best_ratio = 0.0
            suggestions = []

            for p_doc, p_name, p_tokens in preprocessed:
                # Fast token overlap heuristic to skip completely unrelated products
                if query_tokens and p_tokens and not query_tokens.intersection(p_tokens) and len(query_tokens) > 1:
                    continue

                ratio = cls._compute_similarity(prod_name, p_name)
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = p_doc

                if 0.50 <= ratio < 1.0:
                    suggestions.append({
                        "product_id": str(p_doc["_id"]),
                        "product_name": p_name,
                        "confidence": int(ratio * 100)
                    })

            match_type = "none"
            matched_prod_serialized = None

            if best_ratio == 1.0:
                match_type = "exact"
                matched_prod_serialized = serialize_doc(best_match)
            elif best_ratio >= 0.70:
                match_type = "suggested"
                matched_prod_serialized = serialize_doc(best_match)

            results.append({
                **item,
                "matched_product": matched_prod_serialized,
                "match_type": match_type,
                "confidence": int(best_ratio * 100),
                "suggestions": suggestions[:5]
            })

        return results

    async def analyze_invoice_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fetch tenant products and perform fuzzy matching off-thread."""
        cursor = self.db.products.find({"is_active": True})
        db_products = await cursor.to_list(length=5000)

        # Offload CPU-bound string matching to thread pool
        enriched = await asyncio.to_thread(self._match_items_worker, items, db_products)
        return enriched

    async def extract_invoice_with_gemini_server(
        self,
        file_bytes: bytes,
        mime_type: str,
        custom_key: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Secure server-side Gemini Vision invoice parser.
        Keeps API credentials safely on the server side.
        """
        api_key = custom_key or settings.GEMINI_API_KEY
        if not api_key:
            raise HTTPException(
                status_code=400,
                detail="No Gemini API key configured on server. Please configure GEMINI_API_KEY."
            )

        import base64
        b64_data = base64.b64encode(file_bytes).decode("utf-8")

        prompt = (
            "You are an expert Document & Invoice AI assistant for a wholesale & retail ERP.\n"
            "Analyze this invoice image or PDF and extract all purchased products/items accurately.\n"
            "Return ONLY a JSON array with fields: name, brand, unit, hsn_code, gst_rate, "
            "purchase_price, selling_price, mrp, wholesale_price, opening_stock, pack, batch, expiry."
        )

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inlineData": {"mimeType": mime_type, "data": b64_data}}
                ]
            }],
            "generationConfig": {"responseMimeType": "application/json"}
        }

        models = [
            "gemini-1.5-flash-latest",
            "gemini-1.5-flash",
            "gemini-1.5-pro-latest"
        ]

        async with httpx.AsyncClient(timeout=45.0) as client:
            for model in models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                try:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                            raw_text = raw_text.strip()
                            if raw_text.startswith("```json"):
                                raw_text = raw_text[7:]
                            if raw_text.startswith("```"):
                                raw_text = raw_text[3:]
                            if raw_text.endswith("```"):
                                raw_text = raw_text[:-3]
                            import json
                            parsed = json.loads(raw_text.strip())
                            items = parsed if isinstance(parsed, list) else parsed.get("items", [])
                            return items
                except Exception as e:
                    logger.warning(f"Gemini model {model} attempt error: {e}")

        raise HTTPException(status_code=502, detail="Failed to extract invoice from Gemini API")
