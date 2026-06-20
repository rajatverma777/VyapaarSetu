import re
import math
import logging

logger = logging.getLogger(__name__)

def parse_document_structure(ocr_results: list) -> list:
    """
    Parses OCR results with spatial bounding boxes into structured rows.
    1. Detects average page skew from bounding box angles.
    2. Rotates coordinates to deskew the document layout.
    3. Groups text boxes vertically into horizontal lines.
    4. Automatically classifies invoice format (R B Healthcare vs Yash Surgical).
    5. Extracts columns (Name, Pack, Batch, Expiry, HSN, Qty, Rate, MRP, GST, Amount, Cases)
       using layout sequence and validation math correction.
    """
    if not ocr_results:
        return []

    # 1. Detect page skew angle from text boxes
    angles = []
    for item in ocr_results:
        bbox = item.get("bbox")
        if bbox and len(bbox) >= 4:
            # Top edge delta x and y
            dx = bbox[1][0] - bbox[0][0]
            dy = bbox[1][1] - bbox[0][1]
            angle = math.atan2(dy, dx)
            # Limit skew angle to +/- 20 degrees to filter out vertical lines/noise
            if abs(angle) < (math.pi / 9):
                angles.append(angle)
            
    avg_angle = sum(angles) / len(angles) if angles else 0.0
    logger.info(f"Detected page skew angle: {math.degrees(avg_angle):.2f} degrees")
    
    # 2. Deskew all box coordinates around the page center
    all_xs = []
    all_ys = []
    for item in ocr_results:
        for pt in item["bbox"]:
            all_xs.append(pt[0])
            all_ys.append(pt[1])
            
    cx = (min(all_xs) + max(all_xs)) / 2.0 if all_xs else 0.0
    cy = (min(all_ys) + max(all_ys)) / 2.0 if all_ys else 0.0
    
    cos_a = math.cos(-avg_angle)
    sin_a = math.sin(-avg_angle)
    
    processed_boxes = []
    for item in ocr_results:
        bbox = item["bbox"]
        # Rotate coordinates
        rotated_bbox = []
        for pt in bbox:
            rx = (pt[0] - cx) * cos_a - (pt[1] - cy) * sin_a + cx
            ry = (pt[0] - cx) * sin_a + (pt[1] - cy) * cos_a + cy
            rotated_bbox.append([rx, ry])
            
        xs = [pt[0] for pt in rotated_bbox]
        ys = [pt[1] for pt in rotated_bbox]
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

    # 3. Group into rows
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
            # Group if y_center is within 60% of average row height (highly robust Y-alignment)
            if abs(box["y_center"] - row_y_center) < (avg_height * 0.6):
                current_row.append(box)
                # Recalculate row center and height
                row_y_center = sum(b["y_center"] for b in current_row) / len(current_row)
                row_height_sum = sum(b["height"] for b in current_row)
            else:
                current_row.sort(key=lambda b: b["x_min"])
                rows.append(current_row)
                current_row = [box]
                row_y_center = box["y_center"]
                row_height_sum = box["height"]
                
    if current_row:
        current_row.sort(key=lambda b: b["x_min"])
        rows.append(current_row)

    # 4. Global format check
    all_text_lower = " ".join([b["text"].lower() for b in processed_boxes])
    is_yash = "yash" in all_text_lower
    logger.info(f"Invoice layout detected: {'Yash Surgical (Format B)' if is_yash else 'R B Healthcare (Format A)'}")

    products = []
    
    for row in rows:
        # Re-join row tokens to inspect structure
        row_str = " ".join([b["text"] for b in row])
        
        # Skip header rows, address info, or summary rows
        if any(k in row_str.lower() for k in ["invoice", "gstin", "sub total", "sgst", "cgst", "net payable", "terms", "condition", "sales tax", "checked"]):
            continue
            
        # A valid product row must have at least 3 tokens and contain numbers
        if len(row) < 3 or not re.search(r'\d', row_str):
            continue
            
        # Parse tokens format-aware
        p_expiry = ""
        p_pack = ""
        p_hsn = ""
        p_batch = ""
        
        # Try to find expiry token (e.g. 4/28, 04/28, 2/28)
        exp_box_idx = -1
        for idx, box in enumerate(row):
            text = box["text"].strip()
            # Date pattern
            if re.match(r'^\d{1,2}[/\-]\d{2,4}$', text):
                p_expiry = text
                exp_box_idx = idx
                break
                
        # Try to find pack token (e.g. 1*24, 1*100)
        pack_box_idx = -1
        for idx, box in enumerate(row):
            text = box["text"].strip()
            if re.search(r'\b\d+\s*[\*xX]\s*\d+\b', text):
                p_pack = text.replace(" ", "")
                pack_box_idx = idx
                break
                
        # Try to find HSN token (e.g. 30049099, 3004)
        hsn_box_idx = -1
        for idx, box in enumerate(row):
            text = box["text"].strip()
            if text.isdigit() and len(text) >= 4 and len(text) <= 10:
                # Typical medical HSN start numbers
                if any(text.startswith(x) for x in ['3004', '3003', '9018', '4015', '1902']):
                    p_hsn = text
                    hsn_box_idx = idx
                    break

        # Deduce Batch
        # Batch is typically a alphanumeric token immediately to the left of the Expiry column
        if exp_box_idx != -1 and exp_box_idx - 1 >= 0:
            batch_candidate = row[exp_box_idx - 1]["text"].strip()
            # Exclude pack sizes or pure serial numbers
            if not re.match(r'^\d+$', batch_candidate) and batch_candidate.lower() not in ["pack", "batch"]:
                p_batch = batch_candidate
        
        # Deduce Product Name
        # Everything before the batch/pack/expiry tokens
        name_parts = []
        for idx, box in enumerate(row):
            if idx == exp_box_idx or idx == pack_box_idx or idx == hsn_box_idx or box["text"].strip() == p_batch:
                break
            # Skip serial numbers
            if idx == 0 and re.match(r'^\d+$', box["text"].strip()) and len(box["text"].strip()) <= 2:
                continue
            name_parts.append(box["text"])
            
        p_name = " ".join(name_parts).strip()
        
        # Clean up name noise
        p_name = re.sub(r'^\d+[\.\s]?', '', p_name).strip() # serial numbers
        p_name = re.sub(r'\b(?:1\*24|1\*100|1\*10)\b', '', p_name).strip()
        
        if not p_name or len(p_name) < 2:
            continue

        # Extract remaining numeric column values
        numeric_values = []
        for idx, box in enumerate(row):
            # Skip name, pack, batch, expiry, and hsn boxes
            if idx == exp_box_idx or idx == pack_box_idx or idx == hsn_box_idx or box["text"].strip() == p_batch:
                continue
            if box["text"] in name_parts:
                continue
                
            text_clean = re.sub(r'[^\d\.]', '', box["text"])
            if text_clean:
                try:
                    val = float(text_clean)
                    numeric_values.append({
                        "val": val,
                        "x_min": box["x_min"]
                    })
                except:
                    pass
                    
        # Sort numbers from left to right to map columns by sequence
        numeric_values.sort(key=lambda n: n["x_min"])
        nums = [n["val"] for n in numeric_values]

        # Initialize defaults
        qty_val = 1.0
        mrp_val = 0.0
        rate_val = 0.0
        gst_val = 12.0
        amount_val = 0.0
        cases_val = None

        # Sequence-based mapping
        if is_yash:
            # Format B (Yash Surgical style): [Qty, MRP, Rate, GST, Amount]
            if len(nums) >= 5:
                qty_val = nums[0]
                mrp_val = nums[1]
                rate_val = nums[2]
                gst_val = nums[3]
                amount_val = nums[4]
            elif len(nums) == 4:
                qty_val = nums[0]
                mrp_val = nums[1]
                rate_val = nums[2]
                amount_val = nums[3]
        else:
            # Format A (R B Healthcare style): [Qty, MRP, Rate, (Dis), GST, Amount, Cases]
            # Since Discount is often 0.00, it might be present or absent
            if len(nums) >= 7:
                qty_val = nums[0]
                mrp_val = nums[1]
                rate_val = nums[2]
                # Index 3 is Discount (e.g. 0.00)
                gst_val = nums[4]
                amount_val = nums[5]
                cases_val = nums[6]
            elif len(nums) == 6:
                # Discount is missing
                qty_val = nums[0]
                mrp_val = nums[1]
                rate_val = nums[2]
                gst_val = nums[3]
                amount_val = nums[4]
                cases_val = nums[5]
            elif len(nums) == 5:
                # Discount and Cases are missing
                qty_val = nums[0]
                mrp_val = nums[1]
                rate_val = nums[2]
                gst_val = nums[3]
                amount_val = nums[4]
            elif len(nums) == 4:
                # MRP, Rate, Amount
                qty_val = nums[0]
                mrp_val = nums[1]
                rate_val = nums[2]
                amount_val = nums[3]

        # --- Self-Correcting Mathematical Validation Engine ---
        # 1. Correct Quantity from Rate and Amount:
        # If Qty was read as 1 but Rate is 16.00 and Amount is 11520.00:
        # 11520 / 16.0 = 720. We auto-correct Qty to 720!
        if rate_val > 0 and amount_val > 0:
            calculated_qty = round(amount_val / rate_val, 2)
            # If the calculated Qty matches a sensible count but the parsed Qty is completely wrong
            if qty_val == 1.0 or abs(qty_val - calculated_qty) > 5.0:
                logger.info(f"Math Engine: Auto-correcting qty for '{p_name}' from {qty_val} to {calculated_qty}")
                qty_val = calculated_qty

        # 2. Correct Rate or Amount if decimals are missing
        # E.g. Rate read as 1520 instead of 15.20, while Amount is 1520.00 and Qty is 100
        if qty_val > 0 and rate_val > 0 and amount_val > 0:
            expected_amount = qty_val * rate_val
            if abs(expected_amount - amount_val) > 2.0:
                # Check if Rate has a missing decimal point
                implied_rate = round(amount_val / qty_val, 2)
                if abs(rate_val / 100.0 - implied_rate) < 0.1:
                    rate_val = implied_rate
                elif abs(rate_val / 10.0 - implied_rate) < 0.1:
                    rate_val = implied_rate
                else:
                    # Trust the Amount and calculate the Rate
                    rate_val = implied_rate

        # Final math normalization
        amount_val = round(qty_val * rate_val, 2)
        mrp_val = mrp_val or rate_val
        
        # Deduce Pack size defaults if not extracted
        if not p_pack:
            if "100ML" in p_name:
                p_pack = "1*100"
            elif "500ML" in p_name:
                p_pack = "1*24"
            else:
                p_pack = "1*24"
                
        # Cases validation
        pack_size = 24
        nums_pack = re.findall(r'\d+', p_pack)
        if len(nums_pack) > 1:
            pack_size = int(nums_pack[-1])
        elif len(nums_pack) == 1:
            pack_size = int(nums_pack[0])
            
        if cases_val is None or abs(cases_val - (qty_val / pack_size)) > 2.0:
            cases_val = round(qty_val / pack_size, 2)

        products.append({
            "name": p_name,
            "pack": p_pack,
            "cases": cases_val,
            "opening_stock": qty_val,
            "purchase_price": rate_val,
            "mrp": mrp_val,
            "selling_price": mrp_val,
            "final_amount": amount_val,
            "batch": p_batch,
            "expiry": p_expiry,
            "hsn_code": p_hsn,
            "gst_rate": gst_val
        })

    return products
