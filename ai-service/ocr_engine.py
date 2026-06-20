import io
import logging
from PIL import Image
import numpy as np

logger = logging.getLogger(__name__)

# Lazy initialization of PaddleOCR
_ocr_instance = None

def get_ocr_engine():
    global _ocr_instance
    if _ocr_instance is None:
        try:
            from paddleocr import PaddleOCR
            logger.info("Initializing PaddleOCR engine...")
            _ocr_instance = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
            logger.info("PaddleOCR engine initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize PaddleOCR: {e}")
            raise
    return _ocr_instance

def extract_text_and_boxes(image_bytes: bytes) -> list:
    """
    Extracts text and bounding boxes from image bytes using PaddleOCR.
    Returns a list of dicts: [
        {
            "text": "Extracted text line",
            "confidence": 0.95,
            "bbox": [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]
        }
    ]
    """
    try:
        engine = get_ocr_engine()
        # Open image using PIL and convert to numpy array (RGB) for PaddleOCR
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(img)
        
        # Run OCR
        # cls=True enables direction/angle classifier
        results = engine.ocr(img_np, cls=True)
        
        extracted_lines = []
        if not results or not results[0]:
            return extracted_lines
            
        for line in results[0]:
            bbox, (text, confidence) = line
            extracted_lines.append({
                "text": text.strip(),
                "confidence": float(confidence),
                "bbox": bbox
            })
            
        return extracted_lines
    except Exception as e:
        logger.error(f"Error during OCR extraction: {e}")
        raise ValueError(f"OCR extraction failed: {str(e)}")
