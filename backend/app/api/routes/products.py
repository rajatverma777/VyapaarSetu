from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.models.product import ProductCreate, ProductUpdate
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional
import io
import re

router = APIRouter()

def parse_expiry_string(expiry_str: Optional[str]) -> Optional[datetime]:
    if not expiry_str:
        return None
    expiry_str = expiry_str.strip()
    if not expiry_str:
        return None
    
    # Try ISO parse first
    try:
        return datetime.fromisoformat(expiry_str.replace("Z", "+00:00"))
    except ValueError:
        pass
        
    # Try MM/YY or MM-YY
    m = re.match(r"^(\d{1,2})[/\-](\d{2})$", expiry_str)
    if m:
        month = int(m.group(1))
        year = int(m.group(2)) + 2000
        try:
            if month == 12:
                return datetime(year, 12, 31)
            else:
                return datetime(year, month + 1, 1) - timedelta(seconds=1)
        except Exception:
            pass

    # Try MM/YYYY or MM-YYYY
    m = re.match(r"^(\d{1,2})[/\-](\d{4})$", expiry_str)
    if m:
        month = int(m.group(1))
        year = int(m.group(2))
        try:
            if month == 12:
                return datetime(year, 12, 31)
            else:
                return datetime(year, month + 1, 1) - timedelta(seconds=1)
        except Exception:
            pass

    # Fallback format try
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(expiry_str, fmt)
        except ValueError:
            pass
            
    return None

async def resolve_category_from_brand(brand: Optional[str], db) -> Optional[str]:
    if not brand:
        return None
    cleaned = brand.strip()
    if not cleaned:
        return None
    
    brand_regex = {"$regex": f"^{re.escape(cleaned)}$", "$options": "i"}
    existing = await db.categories.find_one({"name": brand_regex})
    if existing:
        return str(existing["_id"])
        
    res = await db.categories.insert_one({
        "name": cleaned,
        "description": f"Brand: {cleaned}",
        "is_active": True,
        "created_at": datetime.utcnow()
    })
    return str(res.inserted_id)


@router.get("/")
async def list_products(
    search: Optional[str] = Query(None),
    category_id: Optional[str] = Query(None),
    low_stock: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(True),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    sort_by: Optional[str] = Query(None),
    sort_order: int = Query(1),
    db = Depends(get_database),
    current_user = Depends(require_permission("can_view_products"))
):
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if category_id:
        query["category_id"] = category_id
    if search:
        import re
        escaped_search = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": f"(^|\\s){escaped_search}", "$options": "i"}},
            {"sku": {"$regex": f"^{escaped_search}", "$options": "i"}},
            {"barcode": {"$regex": f"^{escaped_search}", "$options": "i"}},
            {"brand": {"$regex": f"(^|\\s){escaped_search}", "$options": "i"}}
        ]
    if low_stock:
        query["$expr"] = {"$lte": ["$current_stock", "$min_stock_alert"]}

    sort_field = "name"
    if sort_by == "stock":
        sort_field = "current_stock"
    elif sort_by == "purchase":
        sort_field = "purchase_price"
    elif sort_by == "sale":
        sort_field = "selling_price"
    elif sort_by == "expiry":
        sort_field = "expiry"

    total = await db.products.count_documents(query)
    skip = (page - 1) * limit
    sort_list = [(sort_field, sort_order)]
    if sort_field != "name":
        sort_list.append(("name", 1))
    products = await db.products.find(query).skip(skip).limit(limit).sort(sort_list).to_list(limit)



    # Enrich with category names
    category_ids = list({p["category_id"] for p in products if p.get("category_id")})
    categories = {}
    if category_ids:
        cat_docs = await db.categories.find(
            {"_id": {"$in": [ObjectId(cid) for cid in category_ids if ObjectId.is_valid(cid)]}}
        ).to_list(1000)
        categories = {str(c["_id"]): c["name"] for c in cat_docs}

    result = []
    for p in products:
        doc = serialize_doc(p)
        doc["category_name"] = categories.get(doc.get("category_id", ""), "")
        result.append(doc)

    return {"items": result, "total": total, "page": page, "limit": limit}

@router.get("/search")
async def search_products(
    q: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db = Depends(get_database),
    current_user = Depends(require_permission("can_view_products"))
):
    """Fast product search for billing - returns minimal data."""
    import re
    query = {"is_active": True}
    if q:
        escaped_q = re.escape(q)
        query["$or"] = [
            {"name": {"$regex": f"(^|\\s){escaped_q}", "$options": "i"}},
            {"sku": {"$regex": f"^{escaped_q}", "$options": "i"}},
            {"barcode": {"$regex": f"^{escaped_q}", "$options": "i"}},
        ]
    products = await db.products.find(
        query,
        {"name": 1, "sku": 1, "barcode": 1, "selling_price": 1,
         "wholesale_price": 1, "mrp": 1, "gst_rate": 1, "unit": 1,
         "current_stock": 1, "hsn_code": 1, "purchase_price": 1}
    ).limit(limit).to_list(limit)
    return [serialize_doc(p) for p in products]

@router.post("/bulk-delete")
async def bulk_delete_products(
    payload: dict,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    ids = payload.get("ids", [])
    object_ids = []
    for id_str in ids:
        try:
            object_ids.append(ObjectId(id_str))
        except:
            pass
            
    if not object_ids:
        raise HTTPException(status_code=400, detail="No valid IDs provided")
        
    await db.products.update_many(
        {"_id": {"$in": object_ids}},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    return {"message": f"Successfully deleted {len(object_ids)} products"}

@router.get("/barcode/{barcode}")
async def get_by_barcode(
    barcode: str,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_view_products"))
):
    product = await db.products.find_one({"barcode": barcode, "is_active": True})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return serialize_doc(product)

@router.get("/{product_id}")
async def get_product(
    product_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_view_products"))
):
    product = await db.products.find_one({"_id": ObjectId(product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    doc = serialize_doc(product)
    if doc.get("category_id"):
        cat = await db.categories.find_one({"_id": ObjectId(doc["category_id"])})
        doc["category_name"] = cat["name"] if cat else ""
    return doc

@router.post("/")
async def create_product(
    product_data: ProductCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    import re
    
    # 1. Clean fields: remove extra spaces
    cleaned_name = " ".join(product_data.name.split()).strip()
    cleaned_sku = " ".join(product_data.sku.split()).strip() if product_data.sku else None
    cleaned_barcode = " ".join(product_data.barcode.split()).strip() if product_data.barcode else None
    
    # 2. Check for duplicate/existing matching records
    # We check in this order:
    #   - Name case-insensitive
    #   - SKU
    #   - Barcode
    existing = None
    
    # Match by Name (check active first, then inactive)
    if not existing and cleaned_name:
        name_regex = {"$regex": f"^{re.escape(cleaned_name)}$", "$options": "i"}
        existing = await db.products.find_one({"name": name_regex, "is_active": True})
        if not existing:
            existing = await db.products.find_one({"name": name_regex, "is_active": False})
            
    # Match by SKU (check active first, then inactive)
    if not existing and cleaned_sku:
        existing = await db.products.find_one({"sku": cleaned_sku, "is_active": True})
        if not existing:
            existing = await db.products.find_one({"sku": cleaned_sku, "is_active": False})
            
    # Match by Barcode (check active first, then inactive)
    if not existing and cleaned_barcode:
        existing = await db.products.find_one({"barcode": cleaned_barcode, "is_active": True})
        if not existing:
            existing = await db.products.find_one({"barcode": cleaned_barcode, "is_active": False})
            
    if existing:
        # MERGE PRODUCT DETAILS AND STOCK
        old_stock = existing.get("current_stock", 0.0)
        add_stock = product_data.opening_stock
        new_stock = old_stock + add_stock
        
        now = datetime.utcnow()
        update_dict = {
            "name": cleaned_name,
            "current_stock": new_stock,
            "is_active": True,  # Reactivate in case it was inactive
            "updated_at": now
        }
        
        # Update latest prices/rates
        if product_data.purchase_price:
            update_dict["purchase_price"] = product_data.purchase_price
        if product_data.selling_price:
            update_dict["selling_price"] = product_data.selling_price
        if product_data.mrp:
            update_dict["mrp"] = product_data.mrp
        if product_data.wholesale_price:
            update_dict["wholesale_price"] = product_data.wholesale_price
        if product_data.hsn_code:
            update_dict["hsn_code"] = product_data.hsn_code.strip() if product_data.hsn_code else None
        if product_data.gst_rate is not None:
            update_dict["gst_rate"] = product_data.gst_rate
        if product_data.pack:
            update_dict["pack"] = product_data.pack.strip() if product_data.pack else None
            
        # Add up cases and final amount
        old_cases = existing.get("cases") or 0.0
        update_dict["cases"] = old_cases + (product_data.cases or 0.0)
        
        old_amount = existing.get("final_amount") or 0.0
        update_dict["final_amount"] = old_amount + (product_data.final_amount or 0.0)

        # Merge batch and expiry fields
        old_batch = existing.get("batch") or ""
        new_batch = product_data.batch or ""
        if new_batch and new_batch not in old_batch:
            update_dict["batch"] = f"{old_batch}, {new_batch}" if old_batch else new_batch

        old_expiry = existing.get("expiry") or ""
        new_expiry = product_data.expiry or ""
        if new_expiry and new_expiry not in old_expiry:
            update_dict["expiry"] = f"{old_expiry}, {new_expiry}" if old_expiry else new_expiry
        
        # Append description batch details
        old_desc = existing.get("description") or ""
        new_desc = product_data.description or ""
        if new_desc and new_desc not in old_desc:
            if old_desc:
                update_dict["description"] = f"{old_desc} | {new_desc}"
            else:
                update_dict["description"] = new_desc
                
        # Preserve barcode or SKU if existing had it, otherwise use new if provided
        if not existing.get("sku") and cleaned_sku:
            update_dict["sku"] = cleaned_sku
        if not existing.get("barcode") and cleaned_barcode:
            update_dict["barcode"] = cleaned_barcode
            
        # Resolve category from brand if brand is provided, otherwise keep specified category_id
        if product_data.brand and product_data.brand.strip():
            update_dict["brand"] = product_data.brand.strip()
            cat_id = await resolve_category_from_brand(product_data.brand, db)
            if cat_id:
                update_dict["category_id"] = cat_id
        elif product_data.category_id:
            update_dict["category_id"] = product_data.category_id
            
        await db.products.update_one({"_id": existing["_id"]}, {"$set": update_dict})
        
        # Log stock adjustment
        if add_stock > 0:
            await db.stock_logs.insert_one({
                "product_id": str(existing["_id"]),
                "product_name": existing["name"],
                "type": "adjustment",
                "quantity": add_stock,
                "before_stock": old_stock,
                "after_stock": new_stock,
                "reference": "Import Merge",
                "created_by": str(current_user["_id"]),
                "created_at": now
            })
            
            # Upsert into batches for tracking
            batch_no = product_data.batch.strip() if (product_data.batch and product_data.batch.strip()) else "DEFAULT"
            expiry_dt = parse_expiry_string(product_data.expiry)
            await db.batches.update_one(
                {"product_id": str(existing["_id"]), "batch_no": batch_no},
                {
                    "$inc": {"current_stock": add_stock},
                    "$set": {
                        "expiry": expiry_dt,
                        "purchase_price": product_data.purchase_price,
                        "updated_at": now
                    },
                    "$setOnInsert": {
                        "created_at": now
                    }
                },
                upsert=True
            )
            
        return {"message": "Product stock merged", "id": str(existing["_id"])}

    # 3. Double-check SKU uniqueness for new product creation (against other products)
    if cleaned_sku:
        existing_sku = await db.products.find_one({"sku": cleaned_sku})
        if existing_sku:
            raise HTTPException(status_code=400, detail="SKU already exists")

    # 4. Create new product
    now = datetime.utcnow()
    product_dict = product_data.dict()
    product_dict["name"] = cleaned_name
    product_dict["sku"] = cleaned_sku
    product_dict["barcode"] = cleaned_barcode
    if not product_dict.get("sku"):
        product_dict.pop("sku", None)
    if not product_dict.get("barcode"):
        product_dict.pop("barcode", None)
        
    # Resolve category from brand if brand is provided, otherwise keep specified category_id
    if product_data.brand and product_data.brand.strip():
        product_dict["brand"] = product_data.brand.strip()
        cat_id = await resolve_category_from_brand(product_data.brand, db)
        if cat_id:
            product_dict["category_id"] = cat_id
    elif product_data.category_id:
        product_dict["category_id"] = product_data.category_id
        
    product_dict["current_stock"] = product_data.opening_stock
    product_dict["created_at"] = now
    product_dict["updated_at"] = now
    product_dict["created_by"] = str(current_user["_id"])

    result = await db.products.insert_one(product_dict)

    # Log opening stock
    if product_data.opening_stock > 0:
        await db.stock_logs.insert_one({
            "product_id": str(result.inserted_id),
            "product_name": cleaned_name,
            "type": "opening",
            "quantity": product_data.opening_stock,
            "before_stock": 0,
            "after_stock": product_data.opening_stock,
            "reference": "Opening Stock",
            "created_by": str(current_user["_id"]),
            "created_at": now
        })
        
        # Upsert into batches for tracking
        batch_no = product_data.batch.strip() if (product_data.batch and product_data.batch.strip()) else "DEFAULT"
        expiry_dt = parse_expiry_string(product_data.expiry)
        await db.batches.update_one(
            {"product_id": str(result.inserted_id), "batch_no": batch_no},
            {
                "$inc": {"current_stock": product_data.opening_stock},
                "$set": {
                    "expiry": expiry_dt,
                    "purchase_price": product_data.purchase_price,
                    "updated_at": now
                },
                "$setOnInsert": {
                    "created_at": now
                }
            },
            upsert=True
        )

    return {"message": "Product created", "id": str(result.inserted_id)}

@router.put("/{product_id}")
async def update_product(
    product_id: str,
    product_data: ProductUpdate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    update_dict = {k: v for k, v in product_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No data to update")

    # Resolve category from brand if brand is being updated
    if "brand" in update_dict:
        brand_val = update_dict["brand"]
        brand_str = brand_val.strip() if brand_val else ""
        if brand_str:
            update_dict["brand"] = brand_str
            cat_id = await resolve_category_from_brand(brand_str, db)
            if cat_id:
                update_dict["category_id"] = cat_id
        else:
            update_dict["brand"] = None

    update_dict["updated_at"] = datetime.utcnow()
    result = await db.products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product updated"}

@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    result = await db.products.update_one(
        {"_id": ObjectId(product_id)},
        {"$set": {"is_active": False, "updated_at": datetime.utcnow()}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

@router.post("/bulk-import")
async def bulk_import_products(
    file: UploadFile = File(...),
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    """Import products from Excel file."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only Excel files supported")

    import openpyxl
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content))
    ws = wb.active

    headers = [str(cell.value).strip().lower().replace(" ", "_") for cell in ws[1]]
    imported = 0
    errors = []
    now = datetime.utcnow()

    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        try:
            row_data = dict(zip(headers, row))
            if not row_data.get("name"):
                continue

            brand_val = row_data.get("brand")
            brand_str = str(brand_val).strip() if brand_val is not None else ""
            if brand_str.lower() in ("none", "nan", ""):
                brand_str = None
            else:
                brand_str = " ".join(brand_str.split())

            product_dict = {
                "name": str(row_data.get("name", "")),
                "sku": row_data.get("sku") or row_data.get("sku_code"),
                "barcode": row_data.get("barcode"),
                "brand": brand_str,
                "unit": str(row_data.get("unit", "PCS")),
                "hsn_code": row_data.get("hsn_code") or row_data.get("hsn"),
                "gst_rate": float(row_data.get("gst_rate", 18) or 18),
                "purchase_price": float(row_data.get("purchase_price", 0) or 0),
                "selling_price": float(row_data.get("selling_price", 0) or 0),
                "mrp": float(row_data.get("mrp", 0) or 0) or None,
                "wholesale_price": float(row_data.get("wholesale_price", 0) or 0) or None,
                "min_stock_alert": float(row_data.get("min_stock_alert", 10) or 10),
                "current_stock": float(row_data.get("opening_stock", 0) or 0),
                "opening_stock": float(row_data.get("opening_stock", 0) or 0),
                "is_active": True,
                "created_at": now,
                "updated_at": now,
                "created_by": str(current_user["_id"])
            }
            
            if brand_str:
                cat_id = await resolve_category_from_brand(brand_str, db)
                if cat_id:
                    product_dict["category_id"] = cat_id
            else:
                product_dict["category_id"] = None

            # Upsert by SKU or name
            filter_q = {}
            if product_dict["sku"]:
                filter_q["sku"] = product_dict["sku"]
            else:
                filter_q["name"] = product_dict["name"]

            await db.products.update_one(filter_q, {"$set": product_dict}, upsert=True)
            
            # Sync batch for Excel bulk import
            if product_dict["opening_stock"] > 0:
                prod_doc = await db.products.find_one(filter_q)
                if prod_doc:
                    # Log opening stock
                    await db.stock_logs.insert_one({
                        "product_id": str(prod_doc["_id"]),
                        "product_name": prod_doc["name"],
                        "type": "opening",
                        "quantity": product_dict["opening_stock"],
                        "before_stock": 0,
                        "after_stock": product_dict["opening_stock"],
                        "reference": "Excel Import Opening",
                        "created_by": str(current_user["_id"]),
                        "created_at": now
                    })
                    
                    batch_no = str(row_data.get("batch", "DEFAULT")).strip() or "DEFAULT"
                    expiry_str = str(row_data.get("expiry", "")).strip() or None
                    expiry_dt = parse_expiry_string(expiry_str)
                    
                    await db.batches.update_one(
                        {"product_id": str(prod_doc["_id"]), "batch_no": batch_no},
                        {
                            "$inc": {"current_stock": product_dict["opening_stock"]},
                            "$set": {
                                "expiry": expiry_dt,
                                "purchase_price": product_dict["purchase_price"],
                                "updated_at": now
                            },
                            "$setOnInsert": {
                                "created_at": now
                            }
                        },
                        upsert=True
                    )
            imported += 1
        except Exception as e:
            errors.append({"row": row_idx, "error": str(e)})

    return {"imported": imported, "errors": errors}

@router.post("/import-image")
async def import_product_image(
    file: UploadFile = File(...),
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    import pytesseract
    from PIL import Image
    import io
    import re
    import os

    # Set tesseract path for macOS Homebrew if not in default PATH
    tesseract_paths = [
        '/opt/homebrew/bin/tesseract',
        '/usr/local/bin/tesseract',
        'tesseract'
    ]
    for path in tesseract_paths:
        if os.path.exists(path) or path == 'tesseract':
            pytesseract.pytesseract.tesseract_cmd = path
            break

    try:
        contents = await file.read()
        is_pdf = False
        filename_lower = file.filename.lower()
        if filename_lower.endswith(".pdf") or file.content_type == "application/pdf" or contents.startswith(b"%PDF"):
            is_pdf = True
            
        # Save a debug copy to inspect layout
        debug_ext = ".pdf" if is_pdf else ".png"
        debug_path = f"static/invoices/debug_upload{debug_ext}"
        with open(debug_path, "wb") as f_debug:
            f_debug.write(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    try:
        if is_pdf:
            import pypdf
            try:
                reader = pypdf.PdfReader(io.BytesIO(contents))
                text = ""
                for page in reader.pages:
                    text += page.extract_text() or ""
                
                # If direct text extraction is empty/short, it's a scanned PDF:
                # Extract embedded images and run local OCR
                if len(text.strip()) < 100:
                    ocr_text_parts = []
                    for page in reader.pages:
                        for img_obj in page.images:
                            try:
                                img_data = img_obj.data
                                img = Image.open(io.BytesIO(img_data))
                                # Preprocess image (Grayscale + 2x resize)
                                img = img.convert('L')
                                img = img.resize((img.width * 2, img.height * 2), Image.Resampling.LANCZOS)
                                ocr_text_parts.append(pytesseract.image_to_string(img, config='--psm 6'))
                            except Exception as ocr_err:
                                print(f"Failed to OCR PDF image object: {ocr_err}")
                    if ocr_text_parts:
                        text = "\n".join(ocr_text_parts)
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to parse PDF file: {str(e)}")
        else:
            try:
                img = Image.open(io.BytesIO(contents))
                # Preprocess the image (Grayscale + 2x Resize using Lanczos)
                img = img.convert('L')
                img = img.resize((img.width * 2, img.height * 2), Image.Resampling.LANCZOS)
                
                # Run OCR
                text = pytesseract.image_to_string(img, config='--psm 6')
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Invalid image file or OCR failed: {str(e)}")
        
        # Parse extracted text using robust pattern-based algorithm
        def is_batch_token(token):
            # Tokens with decimal points are prices/amounts, never batch numbers
            if '.' in token:
                return False
            if token.isdigit():
                return True
            if re.search(r'\d', token) and re.search(r'[A-Za-z]', token):
                if any(x in token.upper() for x in ['ML', 'UNIT', 'PCS', 'GM', 'KG', 'TAB', 'CAP', 'MM', 'INCH', 'CM', 'BOX', 'PACK']):
                    return False
                # Cannula size suffix (e.g. VENO-20, VENO-18)
                if re.search(r'-\d{1,2}$', token):
                    return False
                return True
            if re.match(r'^\d{4}\b', token):
                return True
            return False

        products = []
        lines = text.splitlines()
        
        # Keep track of expected SN (approximate counter for Yash Surgical)
        expected_sn = 1
        
        for line in lines:
            # Replace common separator characters with spaces (keep parentheses)
            cleaned = line.replace('|', ' ').replace('[', ' ').replace(']', ' ')
            cleaned = cleaned.replace('{', ' ').replace('}', ' ')
            cleaned = cleaned.replace(',', ' ').replace(';', ' ')
            
            tokens = cleaned.split()
            if len(tokens) < 6:
                continue
                
            # 1. Find HSN index (rightmost token of length 6 to 10)
            hsn_index = -1
            for idx in range(len(tokens) - 1, -1, -1):
                token = tokens[idx]
                if '.' in token:
                    continue
                clean_tok = re.sub(r'[^\w\$\#]', '', token)
                if len(clean_tok) >= 6 and len(clean_tok) <= 10:
                    if re.search(r'\d', clean_tok):
                        hsn_index = idx
                        break
                        
            if hsn_index == -1:
                # Fallback to search for known HSN prefixes
                for idx in range(len(tokens) - 1, -1, -1):
                    token = tokens[idx]
                    if any(x in token for x in ['3004', '300', '9018', '4015', '1902']):
                        hsn_index = idx
                        break
                        
            if hsn_index == -1 or hsn_index < 2:
                continue
                
            hsn = re.sub(r'[^\w]', '', tokens[hsn_index]) # Clean HSN
            
            # 2. Detect Format (A vs B)
            # Find Expiry date to the left of HSN
            exp_index = -1
            for idx in range(hsn_index - 1, -1, -1):
                tok = tokens[idx]
                if '/' in tok or (len(tok) == 4 and tok.isdigit() and int(tok[:2]) <= 12 and int(tok[2:]) >= 24 and int(tok[2:]) <= 40):
                    exp_index = idx
                    break
                    
            if exp_index == -1:
                # Fallback to look for a token that has 4 digits or looks like exp
                for idx in range(hsn_index - 1, -1, -1):
                    tok = tokens[idx]
                    if len(tok) == 4 and tok.isdigit() and int(tok[:2]) <= 12 and int(tok[2:]) >= 24 and int(tok[2:]) <= 40:
                        exp_index = idx
                        break
                        
            if exp_index == -1:
                exp_index = hsn_index - 1 # Fallback
                
            # If expiry index is close to HSN index (distance <= 2), it is Format B
            is_format_b = (hsn_index - exp_index) <= 2
            
            try:
                if is_format_b:
                    # Format B (Yash Surgical style)
                    # Find MRP and Rate to the right of HSN
                    right_tokens = tokens[hsn_index + 1:]
                    decimal_right = []
                    for t in right_tokens:
                        if ':' in t or '/' in t or re.search(r'[A-Za-z]', t):
                            continue
                        t_clean = re.sub(r'[^\d\.]', '', t)
                        if t_clean and ('.' in t_clean or t_clean.isdigit()):
                            try:
                                decimal_right.append(float(t_clean))
                            except:
                                pass
                    mrp = decimal_right[0] if len(decimal_right) > 0 else 0.0
                    rate = decimal_right[1] if len(decimal_right) > 1 else 0.0
                    amount = decimal_right[5] if len(decimal_right) > 5 else (decimal_right[4] if len(decimal_right) > 4 else 0.0)
                    
                    exp = tokens[exp_index]
                    exp_index_for_batch = exp_index
                    if exp.startswith('/') and exp_index - 1 >= 0:
                        prev_tok = tokens[exp_index - 1]
                        if len(prev_tok) <= 2 or (prev_tok.isdigit() and int(prev_tok) <= 12):
                            exp = prev_tok + exp
                            exp_index_for_batch = exp_index - 1
                    
                    # Find Batch tokens (up to 2 tokens immediately left of exp_index_for_batch)
                    batch_tokens = []
                    for idx in range(exp_index_for_batch - 1, max(1, exp_index_for_batch - 3), -1):
                        tok = tokens[idx]
                        if is_batch_token(tok):
                            batch_tokens.insert(0, tok)
                        else:
                            break
                            
                    batch = " ".join(batch_tokens) if batch_tokens else ""
                    
                    # Product Name is everything between the pack/quantity and the batch tokens
                    first_tok = tokens[0]
                    qty_val = 1.0
                    pack_val = tokens[2]
                    name_start_idx = 3
                    
                    # Detect merged SN + Qty in token 0
                    if re.search(r'\d+[\.\$]?\d+\.\d{2}$', first_tok) or (expected_sn and first_tok.startswith(str(expected_sn)) and len(first_tok) > len(str(expected_sn)) + 2):
                        # Merged!
                        if rate > 0 and amount > 0:
                            qty_val = round(amount / rate)
                        else:
                            match = re.search(r'\d+\.\d{2}$', first_tok)
                            if match:
                                qty_val = float(match.group())
                        
                        pack_val = tokens[1]
                        name_start_idx = 2
                        expected_sn += 1
                    else:
                        qty_str = tokens[1]
                        qty_str_clean = re.sub(r'[^\d\.]', '', qty_str)
                        qty_val = float(qty_str_clean) if qty_str_clean else 1.0
                        
                        # Verify using math if possible
                        if rate > 0 and amount > 0:
                            calc_qty = round(amount / rate)
                            if abs(calc_qty - qty_val) > 2:
                                qty_val = calc_qty
                                
                        # Update expected SN if token 0 matches integer
                        clean_sn = re.sub(r'[^\d]', '', first_tok)
                        if clean_sn.isdigit():
                            expected_sn = int(clean_sn) + 1
                    
                    # Name tokens
                    batch_start_idx = exp_index_for_batch - len(batch_tokens)
                    name_tokens = tokens[name_start_idx:batch_start_idx]
                    
                    if len(name_tokens) > 0 and name_tokens[0] == pack_val:
                        name_tokens = name_tokens[1:]
                    name = " ".join(name_tokens).strip()
                    
                else:
                    # Format A (R B Healthcare style)
                    exp = tokens[exp_index]
                    exp_index_for_batch = exp_index
                    if exp.startswith('/') and exp_index - 1 >= 0:
                        prev_tok = tokens[exp_index - 1]
                        if len(prev_tok) <= 2 or (prev_tok.isdigit() and int(prev_tok) <= 12):
                            exp = prev_tok + exp
                            exp_index_for_batch = exp_index - 1

                    # Batch is to the left of exp_index_for_batch
                    batch = tokens[exp_index_for_batch - 1]
                    
                    # Price and Qty columns are between exp_index and hsn_index
                    mid_tokens = tokens[exp_index + 1:hsn_index]
                    qty_val = 1.0
                    mrp = 0.0
                    rate = 0.0
                    
                    if len(mid_tokens) >= 3:
                        qty_val = float(re.sub(r'[^\d\.]', '', mid_tokens[0]))
                        mrp = float(re.sub(r'[^\d\.]', '', mid_tokens[1]))
                        rate = float(re.sub(r'[^\d\.-]', '', mid_tokens[2]).replace('-', '.'))
                    elif len(mid_tokens) == 2:
                        mrp = float(re.sub(r'[^\d\.]', '', mid_tokens[0]))
                        rate = float(re.sub(r'[^\d\.-]', '', mid_tokens[1]).replace('-', '.'))
                    
                    # Product Name is everything before batch
                    name_tokens = tokens[:exp_index_for_batch - 1]
                    if len(name_tokens) > 1 and (name_tokens[0].isdigit() or len(name_tokens[0]) == 1 or name_tokens[0].endswith('.')):
                        name_tokens = name_tokens[1:]
                    name = " ".join(name_tokens).strip()
                    pack_val = None

                # Clean up product name typos
                name = re.sub(r'\bSOOML\b', '500ML', name, flags=re.IGNORECASE)
                name = re.sub(r'\bSOOM\b', '500ML', name, flags=re.IGNORECASE)
                name = re.sub(r'\bSOO\b', '500ML', name, flags=re.IGNORECASE)
                name = re.sub(r'\b100M\b', '100ML', name, flags=re.IGNORECASE)
                name = name.replace('ELEP', 'ELE(P)')
                name = re.sub(r'\bCP\.', 'CP', name)
                
                # Clean common packing indicators from start/end of name
                name_patterns = [
                    r'^\s*(?:\d+\s*[xX*\-]?\s*)?(?:UNIT|PCS|BOX|BAG)S?\b',
                    r'\b(?:\d+\s*[xX*\-]?\s*)?(?:UNIT|PCS|BOX|BAG)S?\s*$',
                    r'^\s*\d*[xX*]\d+[a-zA-Z]?\b',
                    r'\b\d*[xX*]\d+[a-zA-Z]?\s*$',
                    r'^\s*\d+\s*[\*xX\-/°]\s*\d+\b',
                    r'\b\d+\s*[\*xX\-/°]\s*\d+\s*$',
                ]
                for pattern in name_patterns:
                    name = re.sub(pattern, '', name, flags=re.IGNORECASE).strip()
                
                name = re.sub(r'\s+', ' ', name).strip()
                
                # Strip trailing pack multipliers safely
                name = re.sub(r'\b1\s*[\*xX/°\-o]\s*\d+\b\s*$', '', name, flags=re.IGNORECASE).strip()
                
                # Determine default pack size
                default_pack_size = 24
                if pack_val:
                    nums = re.findall(r'\d+', pack_val)
                    if len(nums) > 1:
                        default_pack_size = int(nums[-1])
                    elif len(nums) == 1:
                        default_pack_size = int(nums[0])
                else:
                    if '100ML' in name:
                        default_pack_size = 100
                    elif '500ML' in name:
                        default_pack_size = 24
                        
                if not pack_val:
                    pack_val = f"1*{default_pack_size}"
                
                # Clean up exp (e.g. 2728 -> 2/28, 4728 -> 4/28)
                if '/' not in exp and len(exp) >= 3:
                    if re.match(r'^\d7\d{2}$', exp):
                        exp = f"{exp[0]}/{exp[2:]}"
                    elif re.match(r'^\d{2}7\d{2}$', exp):
                        exp = f"{exp[:2]}/{exp[3:]}"
                    elif exp.isdigit():
                        if len(exp) == 3:
                            exp = f"{exp[0]}/{exp[1:]}"
                        elif len(exp) == 4:
                            exp = f"{exp[:-2]}/{exp[-2:]}"
                
                # GST rate (usually at fixed offset, with fallback)
                gst = 5.0
                preferred_offsets = [4, 2] if is_format_b else [2, 4]
                for offset in preferred_offsets + [1, 3]:
                    if hsn_index + offset < len(tokens):
                        try:
                            gst_str = re.sub(r'[^\d\.]', '', tokens[hsn_index + offset])
                            val = float(gst_str)
                            if val in [0.0, 3.0, 5.0, 12.0, 18.0, 28.0]:
                                gst = val
                                break
                            elif val <= 100.0 and gst == 5.0:
                                gst = val
                        except:
                            pass
                
                # Dynamically calculate final amount
                final_amount = round(qty_val * rate, 2)
                
                # Cases column
                cases = None
                if not is_format_b:
                    if len(tokens) >= 12:
                        try:
                            last_token = tokens[-1]
                            if '.' in last_token or float(last_token) > 200:
                                cases = round(qty_val / default_pack_size)
                            else:
                                cases = int(float(last_token))
                        except:
                            cases = round(qty_val / default_pack_size)
                    else:
                        cases = round(qty_val / default_pack_size)
                
                if not name or len(name.strip()) < 2:
                    continue
                if rate <= 0 and mrp <= 0:
                    continue

                # Clean up month misreads (e.g. P/31 -> 2/31, p/31 -> 2/31, l/31 -> 1/31)
                if '/' in exp:
                    parts = exp.split('/')
                    month_part = parts[0].strip()
                    year_part = parts[1].strip() if len(parts) > 1 else ""
                    
                    month_part = re.sub(r'^[pP]$', '2', month_part)
                    month_part = re.sub(r'^[lIi|]$', '1', month_part)
                    month_part = re.sub(r'^[sS]$', '5', month_part)
                    
                    if year_part:
                        exp = f"{month_part}/{year_part}"
                    else:
                        exp = month_part
                    
                item = {
                    "name": name,
                    "sku": None,
                    "barcode": None,
                    "brand": "YASH SURGICAL HOUSE" if is_format_b else "R B HEALTHCARE",
                    "unit": "PCS",
                    "hsn_code": hsn,
                    "gst_rate": gst,
                    "purchase_price": rate,
                    "selling_price": mrp,
                    "mrp": mrp,
                    "wholesale_price": round(rate * 1.1, 2),
                    "opening_stock": qty_val,
                    "min_stock_alert": 10.0,
                    "description": f"Batch: {batch}, Exp: {exp}",
                    "is_active": True,
                    "pack": pack_val,
                    "cases": cases,
                    "final_amount": final_amount,
                    "batch": batch,
                    "expiry": exp
                }
                products.append(item)
            except Exception:
                pass
                
        return products
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to analyze invoice locally: {str(e)}."
        )
