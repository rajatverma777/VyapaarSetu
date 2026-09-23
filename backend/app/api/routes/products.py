from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, BackgroundTasks
from fastapi.concurrency import run_in_threadpool
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.core.config import settings
from app.models.product import ProductCreate, ProductUpdate
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional
import io
import re
import asyncio
import logging
import base64
import json
import httpx
import difflib

logger = logging.getLogger(__name__)

router = APIRouter()
ocr_lock = asyncio.Lock()

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
    for fmt in (
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%Y-%m-%dT%H:%M:%S",
        "%b-%y", "%b-%Y", "%b/%y", "%b/%Y", "%d-%b-%Y", "%d/%b/%Y", "%d-%b-%y",
        "%d/%b/%y", "%d %b %Y", "%d %b %y", "%b %d, %Y", "%B %Y", "%b %Y",
        "%Y-%m", "%Y/%m"
    ):
        try:
            return datetime.strptime(expiry_str, fmt)
        except ValueError:
            pass
            
    # Try dateutil parser as final fallback
    try:
        from dateutil.parser import parse as date_parse
        return date_parse(expiry_str)
    except Exception:
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
        query["$expr"] = {"$lte": ["$current_stock", {"$ifNull": ["$min_stock_alert", 10.0]}]}

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
    projection = {
        "name": 1, "sku": 1, "barcode": 1, "selling_price": 1,
        "wholesale_price": 1, "mrp": 1, "gst_rate": 1, "unit": 1,
        "current_stock": 1, "hsn_code": 1, "purchase_price": 1,
        "brand": 1
    }

    if not q:
        # Return top active products if search query is empty
        products = await db.products.find(
            {"is_active": True},
            projection
        ).limit(limit).to_list(limit)
        return [serialize_doc(p) for p in products]

    escaped_q = re.escape(q)

    # Stage 1: Prefix-anchored search (lightning fast index scan)
    prefix_query = {
        "is_active": True,
        "$or": [
            {"name": {"$regex": f"^{escaped_q}", "$options": "i"}},
            {"sku": {"$regex": f"^{escaped_q}", "$options": "i"}},
            {"barcode": {"$regex": f"^{escaped_q}", "$options": "i"}},
        ]
    }
    products = await db.products.find(prefix_query, projection).limit(limit).to_list(limit)
    
    # Stage 2: Fallback to substring search (only if we got fewer results than limit)
    if len(products) < limit:
        remaining = limit - len(products)
        already_found_ids = {p["_id"] for p in products}
        
        substring_query = {
            "is_active": True,
            "_id": {"$nin": list(already_found_ids)},
            "$or": [
                {"name": {"$regex": f"(^|\\s){escaped_q}", "$options": "i"}},
                {"sku": {"$regex": f"^{escaped_q}", "$options": "i"}},
                {"barcode": {"$regex": f"^{escaped_q}", "$options": "i"}},
            ]
        }
        fallback_products = await db.products.find(substring_query, projection).limit(remaining).to_list(remaining)
        products.extend(fallback_products)

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
        
    await db.products.delete_many({"_id": {"$in": object_ids}})
    await db.batches.delete_many({"product_id": {"$in": ids}})
    await db.stock_logs.delete_many({"product_id": {"$in": ids}})
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

async def _create_product_internal(
    product_data: ProductCreate,
    db,
    current_user
):
    import re
    
    # 1. Clean fields: remove extra spaces
    cleaned_name = " ".join(product_data.name.split()).strip()
    cleaned_sku = " ".join(product_data.sku.split()).strip() if product_data.sku else None
    cleaned_barcode = " ".join(product_data.barcode.split()).strip() if product_data.barcode else None
    
    # 2. Check for duplicate/existing matching records
    # Check explicit matched_product_id link first
    existing = None
    if product_data.matched_product_id:
        try:
            existing = await db.products.find_one({"_id": ObjectId(product_data.matched_product_id)})
        except:
            pass
            
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
            
    # Save correction to dataset automatically if user corrected it
    if product_data.raw_name and product_data.matched_product_id:
        raw_clean = product_data.raw_name.strip().lower()
        matched_prod = existing or await db.products.find_one({"_id": ObjectId(product_data.matched_product_id)})
        if matched_prod and raw_clean and matched_prod["name"].lower() != raw_clean:
            await db.corrections_dataset.update_one(
                {"raw_name": raw_clean},
                {
                    "$set": {
                        "raw_name": raw_clean,
                        "matched_product_id": str(matched_prod["_id"]),
                        "matched_product_name": matched_prod["name"],
                        "updated_at": datetime.utcnow()
                    },
                    "$setOnInsert": {
                        "created_at": datetime.utcnow()
                    }
                },
                upsert=True
            )
            
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

    # Sync brand and category_id to all matching products (including inactive duplicates)
    if product_dict.get("brand") or product_dict.get("category_id"):
        name_escaped = re.escape(cleaned_name.strip())
        name_regex_str = "^" + name_escaped.replace(" ", r"\s*") + "$"
        name_regex = {"$regex": name_regex_str, "$options": "i"}
        await db.products.update_many(
            {"name": name_regex},
            {"$set": {
                "brand": product_dict.get("brand"),
                "category_id": product_dict.get("category_id")
            }}
        )

    return {"message": "Product created", "id": str(result.inserted_id)}

@router.post("/")
async def create_product(
    product_data: ProductCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    return await _create_product_internal(product_data, db, current_user)

@router.post("/bulk")
async def create_products_bulk(
    products_data: list[ProductCreate],
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    results = []
    errors = []
    for idx, item in enumerate(products_data):
        try:
            res = await _create_product_internal(item, db, current_user)
            results.append({"index": idx, "name": item.name, "message": res.get("message", "Product created"), "id": res["id"]})
        except HTTPException as he:
            errors.append({"index": idx, "name": item.name, "error": he.detail})
        except Exception as e:
            errors.append({"index": idx, "name": item.name, "error": str(e)})
            
    return {"results": results, "errors": errors}


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

    # Clean name
    if "name" in update_dict:
        update_dict["name"] = " ".join(update_dict["name"].split()).strip()

    unset_dict = {}

    # Clean SKU: if empty string or None, we should unset it to prevent E11000 duplicate key error
    if "sku" in update_dict:
        sku_val = update_dict["sku"]
        sku_str = " ".join(sku_val.split()).strip() if sku_val else ""
        if sku_str:
            update_dict["sku"] = sku_str
        else:
            update_dict.pop("sku", None)
            unset_dict["sku"] = ""

    # Clean Barcode: if empty string or None, we should unset it
    if "barcode" in update_dict:
        barcode_val = update_dict["barcode"]
        barcode_str = " ".join(barcode_val.split()).strip() if barcode_val else ""
        if barcode_str:
            update_dict["barcode"] = barcode_str
        else:
            update_dict.pop("barcode", None)
            unset_dict["barcode"] = ""

    # Check for duplicate SKU if SKU is updated
    if "sku" in update_dict:
        existing_sku = await db.products.find_one({
            "sku": update_dict["sku"],
            "_id": {"$ne": ObjectId(product_id)}
        })
        if existing_sku:
            raise HTTPException(status_code=400, detail="Another product already has this SKU")

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
    
    mongo_update = {"$set": update_dict}
    if unset_dict:
        mongo_update["$unset"] = unset_dict

    result = await db.products.update_one(
        {"_id": ObjectId(product_id)},
        mongo_update
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")

    # Sync brand and category_id to all similar products (including inactive ones) by name
    if "brand" in update_dict or "category_id" in update_dict:
        import re
        p_doc = await db.products.find_one({"_id": ObjectId(product_id)})
        if p_doc and p_doc.get("name"):
            name_escaped = re.escape(p_doc["name"].strip())
            name_regex_str = "^" + name_escaped.replace(" ", r"\s*") + "$"
            name_regex = {"$regex": name_regex_str, "$options": "i"}
            
            await db.products.update_many(
                {"name": name_regex},
                {"$set": {
                    "brand": update_dict.get("brand"),
                    "category_id": update_dict.get("category_id")
                }}
            )

    return {"message": "Product updated"}

@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    result = await db.products.delete_one({"_id": ObjectId(product_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    
    # Cascade delete associated batches and stock logs
    await db.batches.delete_many({"product_id": product_id})
    await db.stock_logs.delete_many({"product_id": product_id})
    
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

def _process_ocr_blocking(contents: bytes, filename_lower: str, content_type: str) -> list:
    import pytesseract
    from PIL import Image, ImageOps, ImageEnhance
    import io
    import re
    import os
    import pypdf
    import gc

    # Set tesseract path (including fallback for standard Linux/Debian path in Docker)
    tesseract_paths = [
        '/opt/homebrew/bin/tesseract',
        '/usr/local/bin/tesseract',
        '/usr/bin/tesseract',
        'tesseract'
    ]
    for path in tesseract_paths:
        if os.path.exists(path) or path == 'tesseract':
            pytesseract.pytesseract.tesseract_cmd = path
            break

    # Setup Pillow Resampling fallback compatibility for older PIL versions
    try:
        _ = Image.Resampling
    except AttributeError:
        class DummyResampling:
            LANCZOS = getattr(Image, 'LANCZOS', getattr(Image, 'ANTIALIAS', 1))
            BILINEAR = getattr(Image, 'BILINEAR', 2)
        Image.Resampling = DummyResampling

    is_pdf = filename_lower.endswith(".pdf") or content_type == "application/pdf" or contents.startswith(b"%PDF")

    # Save a debug copy to inspect layout if needed
    try:
        debug_ext = ".pdf" if is_pdf else ".png"
        debug_path = f"static/invoices/debug_upload{debug_ext}"
        os.makedirs(os.path.dirname(debug_path), exist_ok=True)
        with open(debug_path, "wb") as f_debug:
            f_debug.write(contents)
    except Exception as e:
        logger.debug(f"Failed to save debug upload: {e}")

    # 1. Orientation Detection & Auto-Rotation (Handles Left/Right/Upside-down/Tilted images)
    def fix_image_orientation(pil_img):
        # Transpose phone camera EXIF tags
        try:
            pil_img = ImageOps.exif_transpose(pil_img)
        except Exception:
            pass

        # Detect orientation via Tesseract OSD (Orientation and Script Detection)
        try:
            sample = pil_img.convert('RGB') if pil_img.mode != 'RGB' else pil_img
            if sample.width > 1600 or sample.height > 1600:
                scale = 1600.0 / max(sample.width, sample.height)
                sample = sample.resize((int(sample.width * scale), int(sample.height * scale)), Image.Resampling.BILINEAR)
            osd_data = pytesseract.image_to_osd(sample)
            rot_match = re.search(r'Rotate:\s*(\d+)', osd_data)
            if rot_match:
                rot = int(rot_match.group(1))
                if rot in [90, 180, 270]:
                    pil_img = pil_img.rotate(360 - rot, expand=True)
                    return pil_img
        except Exception:
            pass

        # Multi-angle heuristic fallback if text density is low or strange
        def score_text_orientation(txt):
            kw = ['invoice', 'bill', 'date', 'gst', 'tax', 'rate', 'qty', 'amount', 'batch', 'exp', 'mrp', 'item', 'total', 'hsn', 'pcs', 'pack']
            words = re.findall(r'[a-zA-Z]{3,}', txt.lower())
            return sum(4 for w in words if w in kw) + len(words)

        try:
            test_thumb = pil_img.convert('L')
            if test_thumb.width > 1200:
                test_thumb = test_thumb.resize((1200, int(test_thumb.height * 1200.0 / test_thumb.width)), Image.Resampling.BILINEAR)
            init_txt = pytesseract.image_to_string(test_thumb, config='--psm 6')
            init_score = score_text_orientation(init_txt)
            if init_score < 8:
                best_angle = 0
                best_score = init_score
                for angle in [90, 180, 270]:
                    rot_thumb = test_thumb.rotate(angle, expand=True)
                    rot_txt = pytesseract.image_to_string(rot_thumb, config='--psm 6')
                    rot_sc = score_text_orientation(rot_txt)
                    if rot_sc > best_score:
                        best_score = rot_sc
                        best_angle = angle
                if best_angle != 0 and best_score >= 8:
                    pil_img = pil_img.rotate(best_angle, expand=True)
        except Exception:
            pass

        return pil_img

    # 2. Preprocessing for high-fidelity OCR
    def preprocess_image(pil_img):
        max_dim = max(pil_img.width, pil_img.height)
        if max_dim > 2400:
            scale = 2400.0 / max_dim
            pil_img = pil_img.resize((int(pil_img.width * scale), int(pil_img.height * scale)), Image.Resampling.LANCZOS)
        elif pil_img.width < 1200:
            scale = 1600.0 / pil_img.width
            pil_img = pil_img.resize((1600, int(pil_img.height * scale)), Image.Resampling.LANCZOS)
        img_gray = pil_img.convert('L')
        enhancer = ImageEnhance.Contrast(img_gray)
        enhanced = enhancer.enhance(1.8)
        return enhanced

    # 3. Detect Table Boundaries and Extract Clean Table & Header Images
    def extract_table_and_header(pil_img):
        try:
            data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT)
            n_tokens = len(data["text"])
            lines_dict = {}
            for i in range(n_tokens):
                t = data["text"][i].strip()
                if not t: continue
                key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
                if key not in lines_dict:
                    lines_dict[key] = {"top": data["top"][i], "bottom": data["top"][i] + data["height"][i], "words": []}
                lines_dict[key]["words"].append(t)
                lines_dict[key]["bottom"] = max(lines_dict[key]["bottom"], data["top"][i] + data["height"][i])

            sorted_lines = sorted(lines_dict.values(), key=lambda l: l["top"])
            th_kw = ["SNO", "ITEM", "DESCRIPTION", "PARTICULARS", "QTY", "RATE", "AMOUNT", "HSN", "PACK", "BATCH", "MRP", "PRICE", "DISC", "PRODUCT"]
            tf_kw = ["SUBTOTAL", "SUB TOTAL", "GRAND TOTAL", "CLASS SUB", "TOTAL GST", "CGST PAYABLE", "SGST PAYABLE", "NET PAYABLE", "TERMS & CONDITION", "TERMS AND CONDITION", "AUTHORISED SIGNATORY", "FOR ", "BANK DETAILS", "ACCOUNT NUMBER"]

            table_y_top = None
            table_y_bottom = None

            for l in sorted_lines:
                s = " ".join(l["words"]).upper()
                if table_y_top is None:
                    hits = sum(1 for kw in th_kw if re.search(r"\b" + kw + r"\b", s) or kw in s)
                    if hits >= 2:
                        table_y_top = l["top"]
                elif table_y_bottom is None and l["top"] > table_y_top + 30:
                    if any(kw in s for kw in tf_kw):
                        table_y_bottom = l["top"]
                        break

            if table_y_top is not None and table_y_bottom is not None and table_y_bottom > table_y_top:
                crop_top = max(0, table_y_top - 15)
                crop_bot = min(pil_img.height, table_y_bottom + 15)
                table_crop = pil_img.crop((0, crop_top, pil_img.width, crop_bot))
                table_text = pytesseract.image_to_string(table_crop, config="--psm 6")
                
                header_crop = pil_img.crop((0, 0, pil_img.width, max(1, table_y_top)))
                header_text = pytesseract.image_to_string(header_crop, config="--psm 6")
                return table_text, header_text
        except Exception as e:
            logger.debug(f"Table boundary detection fallback: {e}")

        # Fallback to full page OCR
        full_text = pytesseract.image_to_string(pil_img, config="--psm 6")
        return full_text, full_text

    text = ""
    header_text = ""
    if is_pdf:
        try:
            reader = pypdf.PdfReader(io.BytesIO(contents))
            for page in reader.pages:
                page_text = ""
                try:
                    page_text = page.extract_text(extraction_mode="layout") or ""
                except Exception:
                    pass
                if len(page_text.strip()) < 100:
                    page_text = page.extract_text() or ""
                text += page_text + "\n"
            
            # Scanned PDF fallback
            if len(text.strip()) < 100:
                ocr_text_parts = []
                hdr_parts = []
                for page in reader.pages[:4]:
                    for img_obj in page.images:
                        try:
                            img = Image.open(io.BytesIO(img_obj.data))
                            if img.width < 350 or img.height < 350:
                                img.close()
                                continue
                            img = fix_image_orientation(img)
                            t_txt, h_txt = extract_table_and_header(img)
                            ocr_text_parts.append(t_txt)
                            hdr_parts.append(h_txt)
                            img.close()
                        except Exception as e:
                            logger.debug(f"Failed to OCR PDF page image: {e}")
                if ocr_text_parts:
                    text = "\n".join(ocr_text_parts)
                    header_text = "\n".join(hdr_parts)
        except Exception as e:
            raise ValueError(f"Failed to parse PDF file: {str(e)}")
    else:
        try:
            img = Image.open(io.BytesIO(contents))
            img = fix_image_orientation(img)
            text, header_text = extract_table_and_header(img)
            img.close()
        except Exception as e:
            raise ValueError(f"Invalid image file or OCR failed: {str(e)}")

    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        raise ValueError("Could not extract any readable text from the document. Please ensure the image is clear and not blurry.")

    # 4. Dynamic Supplier / Brand Name Extraction from Header
    detected_brand = "Unknown Supplier"
    address_words = ['PLOT', 'ROAD', 'STREET', 'NEAR', 'CHAURAHA', 'GOMTI', 'NAGAR', 'VISTAR', 'LUCKNOW', 'DELHI', 'MUMBAI', 'FLOOR', 'SHOP', 'SECTOR', 'BUILDING', 'PRADESH', 'STATE', 'INDIA', 'UTTAR', 'MADHYA', 'GUJARAT', 'MAHARASHTRA', 'BENGAL', 'TAMIL', 'KERALA', 'BIHAR', 'PUNJAB', 'MARKET', 'COLONY', 'ENCLAVE']
    generic_words = ['GST INVOICE', 'TAX INVOICE', 'CASH MEMO', 'BILL OF SUPPLY', 'RETAIL INVOICE', 'ORIGINAL', 'DUPLICATE', 'INVOICE']
    header_candidate_lines = (header_text or text).splitlines()
    for l in header_candidate_lines[:15]:
        clean_l = l.strip()
        if not clean_l: continue
        upper_l = clean_l.upper()
        if any(g in upper_l for g in generic_words):
            # Try taking text before 'GST INVOICE'
            parts = re.split(r'GST\s*INVOICE|TAX\s*INVOICE|BILL\s*OF\s*SUPPLY', clean_l, flags=re.IGNORECASE)
            if parts and len(parts[0].strip()) >= 3:
                clean_l = parts[0].strip()
                upper_l = clean_l.upper()
            else:
                continue
        if any(a in upper_l for a in address_words): continue
        clean_sup = re.sub(r'^[^\w]+', '', clean_l)
        clean_sup = re.sub(r'[^\w\s\.\&\-]', '', clean_sup).strip()
        if len(clean_sup) >= 3 and not any(bad in upper_l for bad in ['PHONE', 'E-MAIL', 'EMAIL', 'GSTIN', 'D.L', 'DL', 'TIN', 'VEH', 'TRANSPORT', 'BANK', 'IFSC', 'BUYER', 'DATE', 'INV NO']):
            detected_brand = clean_sup
            if any(k in upper_l for k in ['HEALTHCARE', 'PHARMA', 'SURGICAL', 'TRADERS', 'ENTERPRISES', 'DRUGS', 'LAB', 'PVT', 'LTD', 'CO.', 'COMPANY', 'AGENCY', 'DISTRIBUTOR', 'ASSOCIATES', 'SURGICALS', 'SYSTEM', 'MEDICAL']):
                break

    # 5. Universal Tabular Row Extractor with Financial Triplet Solver
    def resolve_financials(nums):
        best = None
        for i, a in enumerate(nums):
            if a <= 0: continue
            for j, q in enumerate(nums):
                if i == j or q <= 0: continue
                for k, r in enumerate(nums):
                    if k == i or k == j or r <= 0: continue
                    diff = abs(q * r - a)
                    if diff <= max(0.6, 0.04 * a):
                        score = (1.0 / (diff + 0.001)) + (5.0 if q.is_integer() and 1 <= q <= 10000 else 0.0) + (a * 0.001)
                        if not best or score > best['score']:
                            best = {'q': q, 'r': r, 'a': a, 'used': {i, j, k}, 'score': score}
        return best

    products = []
    for line in lines:
        upper_line = line.upper()

        # Reject non-product lines & table borders
        if any(w in upper_line for w in ['TERMS & CONDITIONS', 'GOODS ONCE SOLD', 'JURISDICTION ONLY', 'NET PAYABLE', 'SUB TOTAL', 'FOR RECIPIENT', 'BANK DETAILS', 'IFSC', 'QRCODE', 'MARG ERP', 'IMPORT PURCHASE', 'AUTHORISED SIGNATORY', 'NO OF PACK']):
            continue
        if any(k in upper_line for k in ['PHONE', 'E-MAIL', 'EMAIL', 'INVOICE NO', 'GSTIN', 'D.L.NO', 'VEH.NO', 'TRANSPORT:', 'SHOP NO', 'MARKET', 'PRADESH', 'BUYER']):
            continue
        if re.match(r'^(?:S?CGST|IGST|GST|ROUND|TOTAL|SUB\s*TOTAL|NET\s*PAYABLE|CESS|CLASS\s*SUB)\b', upper_line.strip()):
            continue

        # Check table header
        if any(th in upper_line for th in ['ITEM DESCRIPTION', 'PARTICULARS', '[SNO', 'S.NO', 'SR.NO']):
            continue

        # Clean line separators: replace |, [, ], {, }, ;, , (except decimal commas)
        norm_line = re.sub(r'[\|\[\]\{\}\(\)]', ' ', line)
        norm_line = re.sub(r'([A-Za-z]+|[A-Za-z0-9]*[A-Za-z])(\d{1,2}/\d{2,4})', r'\1 \2', norm_line)
        norm_line = re.sub(r'(\d),(\d{2})\b', r'\1.\2', norm_line)
        norm_line = re.sub(r'(\.\d{2})1\b', r'\1', norm_line)
        norm_line = norm_line.replace(',', ' ')

        # HSN (4-8 digits)
        hsn_match = re.search(r'\b(300[4-9]\d{2,4}|9018\d{2,4}|\d{6,8})\b', norm_line)
        hsn = hsn_match.group(0) if hsn_match else None

        # Expiry date (MM/YY or MM/YYYY or MM-YY or MMM-YY)
        exp = None
        exp_match = re.search(r'\b(\d{1,2}[\/\-]\d{2,4})\b', norm_line)
        if exp_match:
            exp_raw = exp_match.group(0).replace('-', '/')
            em = re.match(r'^(\d{1,2})/(\d{2,4})$', exp_raw)
            if em:
                m_val = int(em.group(1))
                y_val = int(em.group(2))
                if y_val < 100: y_val += 2000
                exp = f"{m_val:02d}/{y_val}"
            else:
                exp = exp_raw
        else:
            m4 = re.search(r'\b([01]?\d)(\d{2})\b', norm_line)
            if m4 and 1 <= int(m4.group(1)) <= 12 and 24 <= int(m4.group(2)) <= 35:
                exp = f"{int(m4.group(1)):02d}/20{m4.group(2)}"

        # Batch Number
        batch = None
        batch_kw = re.search(r'(?:B(?:ATCH|AT|NO|/N)?[:.\s]+)([A-Za-z0-9\-]+)', norm_line, re.IGNORECASE)
        if batch_kw:
            batch = batch_kw.group(1).strip()
        else:
            candidates = [tok for tok in norm_line.split() if re.search(r'[A-Za-z]', tok) and re.search(r'\d', tok)]
            for cand in candidates:
                cand_clean = re.sub(r'[^\w]', '', cand)
                if re.match(r'^\d+[xX]\d+$', cand_clean) or re.search(r'-\d{1,2}$', cand) or cand_clean == exp:
                    continue
                if 4 <= len(cand_clean) <= 15 and cand_clean != hsn:
                    batch = cand_clean
                    break

        # Pack Size (e.g. 1*24, 10x10, 100ML, 1UNIT)
        pack = None
        pack_match = re.search(r'\b(\d+[xX\*]\d+|\d+\s*(?:ML|GM|KG|TAB|CAP|UNIT|PCS|T))\b', norm_line, re.IGNORECASE)
        if pack_match:
            pack = pack_match.group(0).upper().replace(' ', '')

        # Extract numeric tokens
        temp_line = norm_line
        if hsn: temp_line = temp_line.replace(hsn, ' ')
        if batch: temp_line = temp_line.replace(batch, ' ')
        if exp: temp_line = temp_line.replace(exp, ' ')
        if pack: temp_line = temp_line.replace(pack, ' ')

        num_tokens = re.findall(r'\b\d+(?:\.\d+)?\b', temp_line)
        nums = [float(n) for n in num_tokens if float(n) > 0 and float(n) < 10000000]

        if len(nums) < 2:
            # Check sub-row for previous product (e.g. Batch: XYZ Exp: 04/28)
            if products and (batch or exp or hsn):
                if batch and (not products[-1].get("batch") or products[-1]["batch"] == "DEFAULT"):
                    products[-1]["batch"] = batch
                if exp and (not products[-1].get("expiry") or products[-1]["expiry"] == "N/A"):
                    products[-1]["expiry"] = exp
                if hsn and (not products[-1].get("hsn_code") or products[-1]["hsn_code"] == "30049099"):
                    products[-1]["hsn_code"] = hsn
            continue

        # Solve financial relationship: Qty * Rate ≈ Amount
        fin = resolve_financials(nums)
        qty, rate, amount = 1.0, 0.0, 0.0
        mrp = 0.0
        gst = 5.0
        cases = None

        if fin:
            qty = fin['q']
            rate = fin['r']
            amount = fin['a']
            rem_nums = [nums[idx] for idx in range(len(nums)) if idx not in fin['used']]
            for rn in rem_nums:
                if rn > rate and mrp == 0.0:
                    mrp = rn
                elif rn in [0.0, 3.0, 5.0, 12.0, 18.0, 28.0]:
                    gst = rn
                elif rn <= qty and cases is None and rn > 0 and rn == int(rn):
                    cases = rn
        else:
            # Try 2-number division check (amount / rate = integer quantity)
            found_pair = False
            for a_cand in nums:
                for r_cand in nums:
                    if a_cand > r_cand and r_cand > 0:
                        calc_q = round(a_cand / r_cand, 2)
                        if abs(calc_q - round(calc_q)) < 0.05 and 1 <= calc_q <= 10000:
                            qty = float(round(calc_q))
                            rate = r_cand
                            amount = a_cand
                            found_pair = True
                            break
                if found_pair: break
            
            if not found_pair:
                sorted_nums = sorted(nums)
                amount = sorted_nums[-1]
                if len(sorted_nums) >= 3:
                    rate = sorted_nums[-3] if sorted_nums[-3] < sorted_nums[-2] else sorted_nums[-2]
                    qty = round(amount / rate, 2) if rate > 0 else 1.0
                    mrp = sorted_nums[-2] if sorted_nums[-2] > rate else round(rate * 1.25, 2)
                elif len(sorted_nums) == 2:
                    rate = sorted_nums[0]
                    amount = sorted_nums[1]
                    qty = round(amount / rate, 2) if rate > 0 else 1.0
                    mrp = round(rate * 1.25, 2)
                else:
                    continue

        # Reject unreasonable rates or amounts (e.g. phone numbers or timestamps)
        if rate > 200000 or amount > 20000000 or qty > 500000 or rate <= 0:
            continue

        if mrp <= 0.0:
            mrp = round(rate * 1.25, 2) if rate > 0 else 0.0

        # Extract clean product name
        name_line = norm_line
        for tok in [hsn, batch, exp, pack]:
            if tok: name_line = name_line.replace(tok, ' ')
        for n_str in num_tokens:
            name_line = re.sub(r'\b' + re.escape(n_str) + r'\b', ' ', name_line)

        name_clean = re.sub(r'^[»:\.\-\*_\d\s]+', '', name_line)
        name_clean = re.sub(r'[^\w\s\-\(\)\/\+]', ' ', name_clean)
        name_clean = re.sub(r'\s+', ' ', name_clean).strip()
        name_clean = re.sub(r'\s+\d+$', '', name_clean)
        name_clean = name_clean.strip(' /-.:*#_')

        # Fix common OCR typos in pharma/wholesale names
        name_clean = re.sub(r'\bSOOML\b', '500ML', name_clean, flags=re.IGNORECASE)
        name_clean = re.sub(r'\bIOOML\b', '100ML', name_clean, flags=re.IGNORECASE)

        if len(name_clean) < 2 or rate <= 0:
            continue

        # Cases fallback calculation
        if cases is None and pack:
            pack_mul_m = re.search(r'[\*xX](\d+)', pack)
            if pack_mul_m:
                mul = int(pack_mul_m.group(1))
                if mul > 0:
                    cases = round(qty / mul, 1)

        products.append({
            "name": name_clean,
            "sku": None,
            "barcode": None,
            "brand": detected_brand,
            "unit": "PCS",
            "hsn_code": hsn or "30049099",
            "gst_rate": gst,
            "purchase_price": rate,
            "selling_price": mrp,
            "mrp": mrp,
            "wholesale_price": round(rate * 1.1, 2),
            "opening_stock": qty,
            "min_stock_alert": 10.0,
            "description": f"Batch: {batch or 'N/A'}, Exp: {exp or 'N/A'}",
            "is_active": True,
            "pack": pack or "1 UNIT",
            "cases": cases,
            "final_amount": amount,
            "batch": batch or "DEFAULT",
            "expiry": exp or "N/A"
        })

    if not products:
        raise ValueError(
            "No line items could be parsed from the document. Please ensure the document is clear, well-lit, and contains recognizable invoice rows."
        )

    gc.collect()
    return products

async def _analyze_invoice_with_gemini(contents: bytes, content_type: str) -> list:
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set")
    
    # Map common extensions to standard mime types if content_type is generic/missing
    if not content_type or content_type == "application/octet-stream":
        content_type = "image/png"  # Default fallback
        
    encoded_image = base64.b64encode(contents).decode("utf-8")
    
    prompt = """You are an expert Document & Invoice AI assistant for a wholesale & retail ERP.
Analyze this invoice image or PDF and extract all purchased products/items accurately.

CRITICAL INSTRUCTIONS:
1. ORIENTATION & READING DIRECTION:
   - The image may be rotated (90° clockwise, 90° counter-clockwise, 180° upside-down, or tilted).
   - FIRST detect the orientation of the text, mentally rotate it upright, and read all characters in standard reading order (left-to-right, top-to-bottom).
   - Do NOT reject or skip items due to orientation.

2. UNIVERSAL DOCUMENT & TABLE EXTRACTION:
   - Works for ANY trade (Pharma, Surgical, FMCG, Grocery, Hardware, Electronics, Textiles, General Wholesale).
   - Handles standard tables, dual columns, sub-row indented items (where batch/expiry/HSN are on a second line under the product name - merge them into the parent item), and multi-page invoices.
   - Separate Billed Qty from Free/Bonus Qty (sum them into opening_stock if both are delivered).
   - Clean up obvious OCR/scan errors (e.g. "SOOML" -> "500ML").
   - Extract the supplier/distributor brand name from the top header of the bill for 'brand'.

3. FIELDS TO EXTRACT FOR EACH ITEM:
   - name: Clean product name/description.
   - brand: Supplier/distributor or manufacturer brand name from the invoice header.
   - unit: Unit of measurement (usually "PCS", "BOX", "BTL", "STRIP", etc.).
   - hsn_code: HSN or SAC code (e.g. "30049091", "9018").
   - gst_rate: GST percentage (e.g. 0, 5, 12, 18, 28). If CGST 2.5% + SGST 2.5%, total is 5.0.
   - purchase_price: Net or purchase rate per unit.
   - selling_price: MRP or wholesale selling price.
   - mrp: Maximum Retail Price (MRP). If not visible, use purchase_price * 1.25.
   - wholesale_price: Wholesale price, calculated as purchase_price * 1.1, rounded to 2 decimals.
   - opening_stock: Total quantity purchased (number).
   - min_stock_alert: 10.0.
   - pack: Packaging size (e.g. "1*24", "10x10", "100ML", "1 UNIT").
   - cases: Number of cases/boxes if mentioned, else null.
   - final_amount: Total line amount (opening_stock * purchase_price). Ensure math is validated.
   - batch: Batch number or lot number (e.g. "CDADS036").
   - expiry: Expiry date formatted as MM/YY or MM/YYYY (e.g. "04/28" or "04/2028").
   - description: "Batch: {batch}, Exp: {expiry}"
   - is_active: true.

4. MATHEMATICAL VERIFICATION:
   - Check that opening_stock * purchase_price matches final_amount within a reasonable margin.
   - If decimal points were misplaced (e.g. rate 1600 instead of 16.00 for amount 11520 and qty 720), automatically correct rate to 16.00.
"""

    payload = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inlineData": {
                            "mimeType": content_type,
                            "data": encoded_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "responseMimeType": "application/json",
            "responseSchema": {
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "name": {"type": "STRING"},
                        "sku": {"type": "STRING", "nullable": True},
                        "barcode": {"type": "STRING", "nullable": True},
                        "brand": {"type": "STRING"},
                        "unit": {"type": "STRING"},
                        "hsn_code": {"type": "STRING"},
                        "gst_rate": {"type": "NUMBER"},
                        "purchase_price": {"type": "NUMBER"},
                        "selling_price": {"type": "NUMBER"},
                        "mrp": {"type": "NUMBER"},
                        "wholesale_price": {"type": "NUMBER"},
                        "opening_stock": {"type": "NUMBER"},
                        "min_stock_alert": {"type": "NUMBER"},
                        "pack": {"type": "STRING"},
                        "cases": {"type": "NUMBER", "nullable": True},
                        "final_amount": {"type": "NUMBER"},
                        "batch": {"type": "STRING"},
                        "expiry": {"type": "STRING"},
                        "description": {"type": "STRING"},
                        "is_active": {"type": "BOOLEAN"}
                    },
                    "required": [
                        "name", "brand", "unit", "hsn_code", "gst_rate", 
                        "purchase_price", "selling_price", "mrp", 
                        "wholesale_price", "opening_stock", "min_stock_alert", 
                        "pack", "final_amount", "batch", "expiry", 
                        "description", "is_active"
                    ]
                }
            }
        }
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"
    
    async with httpx.AsyncClient(timeout=35.0) as client:
        response = await client.post(url, json=payload)
        response.raise_for_status()
        resp_json = response.json()
        
        try:
            candidates = resp_json.get("candidates", [])
            if not candidates:
                raise ValueError("No candidates returned from Gemini API")
            text_response = candidates[0]["content"]["parts"][0]["text"]
            products = json.loads(text_response)
            
            validated_products = []
            for item in products:
                batch = item.get("batch") or "DEFAULT"
                expiry = item.get("expiry") or "N/A"
                if not item.get("description"):
                    item["description"] = f"Batch: {batch}, Exp: {expiry}"
                
                item["sku"] = item.get("sku") or None
                item["barcode"] = item.get("barcode") or None
                item["cases"] = item.get("cases") or None
                
                validated_products.append(item)
                
            return validated_products
        except (KeyError, IndexError, json.JSONDecodeError) as e:
            raise ValueError(f"Failed to parse Gemini API response: {str(e)}")

def _validate_extracted_products(products: list) -> list:
    for item in products:
        errors = []
        
        # Math check: Qty * Rate = Amount
        qty = item.get("opening_stock")
        rate = item.get("purchase_price")
        amt = item.get("final_amount")
        
        if qty is not None and rate is not None:
            try:
                expected_amt = round(float(qty) * float(rate), 2)
                if amt is not None and abs(expected_amt - float(amt)) > 0.05:
                    errors.append(f"Qty * Rate ({expected_amt}) does not match Final Amount ({amt})")
            except:
                pass
                
        # GST rate verification
        gst = item.get("gst_rate")
        if gst is not None:
            try:
                gst_val = float(gst)
                if gst_val not in [0.0, 3.0, 5.0, 12.0, 18.0, 28.0]:
                    errors.append(f"Non-standard GST rate: {gst}%")
            except:
                errors.append("Invalid GST rate value")
                
        # Expiry format validation (MM/YY or MM/YYYY)
        exp = item.get("expiry")
        if exp:
            exp_str = str(exp).strip()
            if not re.match(r'^\d{1,2}[/\-]\d{2,4}$', exp_str):
                errors.append(f"Invalid expiry format: '{exp_str}' (Expected MM/YY or MM/YYYY)")
                
        # Batch verification
        batch = item.get("batch")
        if not batch or str(batch).strip() == "":
            errors.append("Batch number is missing")
            
        # Match confidence verification
        conf = item.get("confidence")
        if conf is not None:
            try:
                conf_val = float(conf)
                if conf_val < 0.6:
                    errors.append(f"Low matching confidence ({round(conf_val*100)}%) - Review mapped product")
            except:
                pass
        else:
            # Tesseract or fallback which has no confidence score
            if not item.get("matched_product_id"):
                errors.append("Unmapped product - Review suggested name")
            
        item["validation_errors"] = errors
    return products

async def _run_ocr_background(
    task_id: str,
    contents: bytes,
    filename_lower: str,
    content_type: str,
    db
):
    async with ocr_lock:
        try:
            products = None
            ai_used = False
            
            # Fetch active products and corrections for stateless AI matching
            db_products = []
            try:
                db_products_cursor = db.products.find({"is_active": True}, {"_id": 1, "name": 1})
                db_products = [{"id": str(p["_id"]), "name": p["name"]} for p in await db_products_cursor.to_list(10000)]
            except Exception as dbe:
                logger.error(f"Failed to fetch db_products for AI matching: {dbe}")
                
            corrections = []
            try:
                corrections_cursor = db.corrections_dataset.find({})
                corrections = [{"raw_name": c["raw_name"], "matched_product_id": c["matched_product_id"]} for c in await corrections_cursor.to_list(1000)]
            except Exception as ce:
                logger.error(f"Failed to fetch corrections for AI matching: {ce}")

            # 1. Try Gemini Vision if GEMINI_API_KEY is configured
            if settings.GEMINI_API_KEY:
                try:
                    logger.info("Attempting invoice analysis using Gemini Vision...")
                    products = await _analyze_invoice_with_gemini(contents, content_type)
                    if products:
                        ai_used = True
                        logger.info(f"Gemini Vision successfully extracted {len(products)} products!")
                except Exception as ge:
                    logger.warning(f"Gemini Vision extraction failed: {ge}. Continuing to fallbacks...")

            # 2. Try self-hosted AI service if configured
            if not ai_used and settings.AI_SERVICE_URL:
                try:
                    logger.info("Attempting invoice analysis using self-hosted AI Service...")
                    files = {"file": (filename_lower, contents, content_type or "image/png")}
                    data = {
                        "db_products_str": json.dumps(db_products),
                        "corrections_str": json.dumps(corrections)
                    }
                    async with httpx.AsyncClient(timeout=45.0) as client:
                        resp = await client.post(f"{settings.AI_SERVICE_URL}/analyze-invoice", files=files, data=data)
                        resp.raise_for_status()
                        result_data = resp.json()
                        products = result_data.get("products", [])
                        if products:
                            ai_used = True
                            logger.info("Self-hosted AI analysis succeeded!")
                except Exception as ae:
                    logger.warning(f"Self-hosted AI service failed: {ae}. Falling back to local OCR...")
            
            # 3. Universal Orientation-Aware Local OCR Fallback
            if not ai_used or not products:
                # Offload heavy local OCR/PDF parsing to thread pool
                products = await run_in_threadpool(
                    _process_ocr_blocking,
                    contents,
                    filename_lower,
                    content_type
                )
                
                # Perform simple local matching for fallback results
                for item in products:
                    item_name_lower = item["name"].strip().lower()
                    
                    # Direct check against corrections
                    matched_id = next((c["matched_product_id"] for c in corrections if c["raw_name"] == item_name_lower), None)
                    if matched_id:
                        matched_prod = next((p for p in db_products if p["id"] == matched_id), None)
                        if matched_prod:
                            item["matched_product_id"] = matched_prod["id"]
                            item["matched_product_name"] = matched_prod["name"]
                            item["confidence"] = 1.0
                            continue
                            
                    # Local fallback fuzzy matching using SequenceMatcher
                    best_match = None
                    best_score = 0.0
                    for p in db_products:
                        p_name_lower = p["name"].lower()
                        if p_name_lower == item_name_lower:
                            best_match = p
                            best_score = 1.0
                            break
                        sim = difflib.SequenceMatcher(None, item_name_lower, p_name_lower).ratio()
                        if sim > best_score:
                            best_score = sim
                            best_match = p

                    if best_match and best_score >= 0.70:
                        item["matched_product_id"] = best_match["id"]
                        item["matched_product_name"] = best_match["name"]
                        item["confidence"] = round(best_score, 2)
                    else:
                        item["matched_product_id"] = None
                        item["confidence"] = 0.0

            # Run validation checks on parsed products
            products = _validate_extracted_products(products)
                
            await db.ocr_tasks.update_one(
                {"_id": ObjectId(task_id)},
                {
                    "$set": {
                        "status": "completed",
                        "result": products,
                        "completed_at": datetime.utcnow()
                    }
                }
            )
        except ValueError as ve:
            await db.ocr_tasks.update_one(
                {"_id": ObjectId(task_id)},
                {
                    "$set": {
                        "status": "failed",
                        "error": str(ve),
                        "completed_at": datetime.utcnow()
                    }
                }
            )
        except Exception as e:
            logger.exception("Failed to analyze invoice in background")
            await db.ocr_tasks.update_one(
                {"_id": ObjectId(task_id)},
                {
                    "$set": {
                        "status": "failed",
                        "error": f"Internal error: {str(e)}",
                        "completed_at": datetime.utcnow()
                    }
                }
            )

@router.post("/import-image")
async def import_product_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    filename_lower = file.filename.lower()
    content_type = file.content_type or ""
    
    # Generate task ID
    task_id = str(ObjectId())
    
    # Create task record in MongoDB
    task_doc = {
        "_id": ObjectId(task_id),
        "status": "processing",
        "created_at": datetime.utcnow()
    }
    await db.ocr_tasks.insert_one(task_doc)
    
    # Register background task
    background_tasks.add_task(
        _run_ocr_background,
        task_id,
        contents,
        filename_lower,
        content_type,
        db
    )
    
    return {"task_id": task_id, "status": "processing"}

@router.get("/import-image/task/{task_id}")
async def get_import_task_status(
    task_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    if not ObjectId.is_valid(task_id):
        raise HTTPException(status_code=400, detail="Invalid task ID")
        
    task = await db.ocr_tasks.find_one({"_id": ObjectId(task_id)})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
        
    return {
        "status": task.get("status"),
        "result": task.get("result"),
        "error": task.get("error")
    }

@router.post("/corrections")
async def save_correction(
    payload: dict,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    raw_name = payload.get("raw_name")
    matched_product_id = payload.get("matched_product_id")
    matched_product_name = payload.get("matched_product_name")
    
    if not raw_name or not matched_product_id:
        raise HTTPException(status_code=400, detail="raw_name and matched_product_id are required")
        
    now = datetime.utcnow()
    await db.corrections_dataset.update_one(
        {"raw_name": raw_name.strip().lower()},
        {
            "$set": {
                "raw_name": raw_name.strip().lower(),
                "matched_product_id": matched_product_id,
                "matched_product_name": matched_product_name,
                "updated_at": now
            },
            "$setOnInsert": {
                "created_at": now
            }
        },
        upsert=True
    )
    return {"status": "success", "message": "Correction saved"}

@router.post("/retrain-matching")
async def trigger_retrain(
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    corrections_cursor = db.corrections_dataset.find({})
    corrections = await corrections_cursor.to_list(1000)
    
    if len(corrections) < 5:
        raise HTTPException(status_code=400, detail="Need at least 5 corrections to run training")
        
    dataset = []
    for c in corrections:
        dataset.append({
            "anchor": c["raw_name"],
            "positive": c["matched_product_name"]
        })
        
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(f"{settings.AI_SERVICE_URL}/retrain", json={"dataset": dataset})
            resp.raise_for_status()
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to trigger AI retraining: {str(e)}")


