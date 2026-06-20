import re
import logging

logger = logging.getLogger(__name__)

def parse_document_structure(ocr_results: list) -> list:
    """
    Parses OCR results with spatial bounding boxes into structured rows.
    Groups elements by vertical alignment (y-coordinate) and aligns them into columns.
    Returns a list of structured products: [
        {
            "name": "PRODUCT NAME",
            "pack": "1*24",
            "cases": 2.0,
            "opening_stock": 48.0,
            "purchase_price": 10.50,
            "mrp": 15.00,
            "selling_price": 15.00,
            "final_amount": 504.00,
            "batch": "B1234",
            "expiry": "12/28",
            "hsn_code": "300490",
            "gst_rate": 12.0
        }
    ]
    """
    if not ocr_results:
        return []

    # 1. Group text boxes into lines/rows based on vertical proximity
    # Each item in ocr_results has bbox: [[x0,y0], [x1,y1], [x2,y2], [x3,y3]]
    # Let's compute y_center and height for each box
    processed_boxes = []
    for item in ocr_results:
        bbox = item["bbox"]
        xs = [pt[0] for pt in bbox]
        ys = [pt[1] for pt in bbox]
        x_min, x_max = min(xs), max(xs)
        y_min, y_max = min(ys), max(ys)
        y_center = (y_min + y_max) / 2.0
        height = y_max - y_min
        
        processed_boxes.append({
            "text": item["text"],
            "x_min": x_min,
            "x_max": x_max,
            "y_min": y_min,
            "y_max": y_max,
            "y_center": y_center,
            "height": height
        })

    # Sort primarily by y_center
    processed_boxes.sort(key=lambda b: b["y_center"])

    # Group into rows
    rows = []
    current_row = []
    row_y_center = 0
    row_height_sum = 0
    
    for box in processed_boxes:
        if not current_row:
            current_row.append(box)
            row_y_center = box["y_center"]
            row_height_sum = box["height"]
        else:
            avg_height = row_height_sum / len(current_row)
            # Group if y_center is within 60% of average row height
            if abs(box["y_center"] - row_y_center) < (avg_height * 0.6):
                current_row.append(box)
                # Recalculate row center and height
                row_y_center = sum(b["y_center"] for b in current_row) / len(current_row)
                row_height_sum = sum(b["height"] for b in current_row)
            else:
                # Close current row, sort it horizontally
                current_row.sort(key=lambda b: b["x_min"])
                rows.append(current_row)
                # Start new row
                current_row = [box]
                row_y_center = box["y_center"]
                row_height_sum = box["height"]
                
    if current_row:
        current_row.sort(key=lambda b: b["x_min"])
        rows.append(current_row)

    # 2. Heuristic Column Finder
    # Look for a header row containing keywords like (PRODUCT, RATE, QTY, BATCH, EXP)
    header_idx = -1
    col_mappings = {} # maps column key to x range (min_x, max_x)
    
    for idx, row in enumerate(rows):
        row_text_lower = [b["text"].lower() for b in row]
        matches = 0
        temp_mappings = {}
        
        for box in row:
            text = box["text"].lower()
            x_min, x_max = box["x_min"], box["x_max"]
            
            if any(k in text for k in ["product", "item", "particular", "description"]):
                temp_mappings["name"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["batch", "b.no", "btch"]):
                temp_mappings["batch"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["exp", "expiry", "val"]):
                temp_mappings["expiry"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["qty", "quantity", "quant"]):
                temp_mappings["qty"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["rate", "price", "unit price"]):
                temp_mappings["rate"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["mrp"]):
                temp_mappings["mrp"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["amount", "value", "net amt"]):
                temp_mappings["amount"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["hsn", "hsn/sac"]):
                temp_mappings["hsn"] = (x_min, x_max)
                matches += 1
            elif any(k in text for k in ["gst", "tax%"]):
                temp_mappings["gst"] = (x_min, x_max)
                matches += 1
                
        if matches >= 3: # Found the header row!
            header_idx = idx
            col_mappings = temp_mappings
            break

    # If no header was found, use standard default column layout (split page horizontally)
    if not col_mappings:
        logger.info("No header found, using default geometric column assumptions.")
        col_mappings = {
            "name": (0, 300),
            "batch": (300, 450),
            "expiry": (450, 550),
            "qty": (550, 650),
            "rate": (650, 750),
            "amount": (750, 850),
            "mrp": (850, 1000)
        }

    # 3. Parse Product Rows
    products = []
    start_row_idx = header_idx + 1 if header_idx != -1 else 0
    
    for row in rows[start_row_idx:]:
        if len(row) < 3: # Skip footer/summary lines
            continue
            
        # Initialize product item
        p_name = ""
        p_batch = ""
        p_expiry = ""
        p_hsn = ""
        p_pack = ""
        p_qty = None
        p_rate = None
        p_mrp = None
        p_amount = None
        p_gst = 12.0 # Default fallback
        
        # Sort out row tokens into mapped columns based on X overlaps
        for box in row:
            text = box["text"]
            x_min, x_max = box["x_min"], box["x_max"]
            x_center = (x_min + x_max) / 2.0
            
            # Find which column this text overlaps or belongs to
            best_col = None
            min_dist = 999999
            
            for col_key, (col_min, col_max) in col_mappings.items():
                # Check overlap
                if not (x_max < col_min or x_min > col_max):
                    best_col = col_key
                    break
                # Or find closest column center
                col_center = (col_min + col_max) / 2.0
                dist = abs(x_center - col_center)
                if dist < min_dist:
                    min_dist = dist
                    best_col = col_key
                    
            if best_col == "name":
                p_name += " " + text
            elif best_col == "batch":
                p_batch = text.strip()
            elif best_col == "expiry":
                p_expiry = text.strip()
            elif best_col == "hsn":
                p_hsn = text.strip()
            elif best_col == "qty":
                val_str = re.sub(r'[^\d\.]', '', text)
                try:
                    p_qty = float(val_str)
                except:
                    pass
            elif best_col == "rate":
                val_str = re.sub(r'[^\d\.]', '', text)
                try:
                    p_rate = float(val_str)
                except:
                    pass
            elif best_col == "mrp":
                val_str = re.sub(r'[^\d\.]', '', text)
                try:
                    p_mrp = float(val_str)
                except:
                    pass
            elif best_col == "amount":
                val_str = re.sub(r'[^\d\.]', '', text)
                try:
                    p_amount = float(val_str)
                except:
                    pass
            elif best_col == "gst":
                val_str = re.sub(r'[^\d\.]', '', text)
                try:
                    p_gst = float(val_str)
                except:
                    pass

        p_name = p_name.strip()
        if not p_name or len(p_name) < 2:
            continue
            
        # Skip if numbers columns are completely empty (not a product row)
        if p_qty is None and p_rate is None and p_amount is None:
            continue

        # Extract Pack size from name if found (e.g. "1*24", "10x10", "1*100")
        pack_match = re.search(r'\b\d+\s*[\*xX]\s*\d+\b', p_name)
        if pack_match:
            p_pack = pack_match.group().replace(" ", "")
            # Remove pack size from product name to keep it clean
            p_name = p_name.replace(pack_match.group(), "").strip()
        else:
            p_pack = "1*24" # Default fallback

        # Default fallback values for math validation
        p_qty = p_qty or 1.0
        p_rate = p_rate or 0.0
        p_mrp = p_mrp or p_rate
        p_amount = p_amount or round(p_qty * p_rate, 2)
        
        # Deduce cases if pack is available
        pack_size = 24
        nums = re.findall(r'\d+', p_pack)
        if len(nums) > 1:
            pack_size = int(nums[-1])
        elif len(nums) == 1:
            pack_size = int(nums[0])
        p_cases = round(p_qty / pack_size, 2)

        products.append({
            "name": p_name,
            "pack": p_pack,
            "cases": p_cases,
            "opening_stock": p_qty,
            "purchase_price": p_rate,
            "mrp": p_mrp,
            "selling_price": p_mrp,
            "final_amount": p_amount,
            "batch": p_batch,
            "expiry": p_expiry,
            "hsn_code": p_hsn,
            "gst_rate": p_gst
        })

    return products
