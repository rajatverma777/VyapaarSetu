from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.api.routes.purchases import get_next_purchase_number
from app.api.routes.products import parse_expiry_string, resolve_category_from_brand
from pydantic import BaseModel, Field
from bson import ObjectId
from datetime import datetime
from typing import Optional, List, Literal
import difflib
import logging

logger = logging.getLogger(__name__)
router = APIRouter()

class AIImportItem(BaseModel):
    product_name: str
    pack: Optional[str] = None
    cases: Optional[float] = 0.0
    quantity: float
    purchase_rate: float
    selling_price: float
    amount: float
    gst: float = 0.0
    hsn_code: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    manufacturer: Optional[str] = None

class AIImportSubmitItem(AIImportItem):
    product_id: Optional[str] = None

class AIImportSubmitRequest(BaseModel):
    supplier_id: str
    invoice_number: Optional[str] = None
    purchase_date: Optional[datetime] = None
    payment_mode: Literal["cash", "credit", "upi", "card", "cheque", "neft"] = "credit"
    paid_amount: float = Field(default=0.0, ge=0.0)
    is_igst: bool = False
    notes: Optional[str] = None
    items: List[AIImportSubmitItem]
    original_json: str

@router.post("/analyze")
async def analyze_ai_output(
    items: List[dict],
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_products"))
):
    try:
        # Fetch active products for matching
        products_cursor = db.products.find({"is_active": True})
        db_products = await products_cursor.to_list(length=10000)
    except Exception as e:
        logger.error(f"Failed to fetch products for similarity matching: {e}")
        raise HTTPException(status_code=500, detail="Database error while fetching products.")

    enriched_items = []
    for item in items:
        prod_name = str(item.get("product_name") or item.get("name") or item.get("description") or "").strip()
        if not prod_name:
            continue

        best_match = None
        best_ratio = 0.0

        # Run SequenceMatcher similarity check
        for db_prod in db_products:
            db_name = db_prod.get("name") or ""
            ratio = difflib.SequenceMatcher(None, prod_name.lower(), db_name.lower()).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = db_prod

        match_type = "none"
        confidence = 0
        matched_product = None

        if best_ratio == 1.0:
            match_type = "exact"
            confidence = 100
            matched_product = serialize_doc(best_match)
        elif best_ratio >= 0.70:
            match_type = "suggested"
            confidence = int(best_ratio * 100)
            matched_product = serialize_doc(best_match)
        else:
            confidence = int(best_ratio * 100)

        # Get alternative suggestions (similarity >= 50%)
        suggestions = []
        for db_prod in db_products:
            db_name = db_prod.get("name") or ""
            ratio = difflib.SequenceMatcher(None, prod_name.lower(), db_name.lower()).ratio()
            if 0.50 <= ratio < 1.0:
                suggestions.append({
                    "product_id": str(db_prod["_id"]),
                    "product_name": db_name,
                    "confidence": int(ratio * 100)
                })

        # Sort alternative suggestions by confidence descending
        suggestions = sorted(suggestions, key=lambda x: x["confidence"], reverse=True)[:5]

        # Extract other fields robustly
        pack = str(item.get("pack") or item.get("packing") or "").strip() or None
        cases = float(item.get("cases") or item.get("box") or 0.0)
        quantity = float(item.get("quantity") or item.get("qty") or item.get("pcs") or 0.0)
        purchase_rate = float(item.get("purchase_rate") or item.get("rate") or item.get("purchase_price") or item.get("price") or 0.0)
        selling_price = float(item.get("selling_price") or item.get("mrp") or item.get("sale_price") or item.get("wholesale_price") or 0.0)
        amount = float(item.get("amount") or item.get("total") or item.get("final_amount") or 0.0)
        gst = float(item.get("gst") or item.get("gst_rate") or item.get("tax") or 0.0)
        hsn_code = str(item.get("hsn_code") or item.get("hsn") or "").strip() or None
        batch_number = str(item.get("batch_number") or item.get("batch") or item.get("batch_no") or "").strip() or None
        expiry_date = str(item.get("expiry_date") or item.get("expiry") or item.get("exp") or "").strip() or None
        manufacturer = str(item.get("manufacturer") or item.get("manufacture") or item.get("brand") or "").strip() or None

        enriched_items.append({
            "product_name": prod_name,
            "pack": pack,
            "cases": cases,
            "quantity": quantity,
            "purchase_rate": purchase_rate,
            "selling_price": selling_price,
            "amount": amount,
            "gst": gst,
            "hsn_code": hsn_code,
            "batch_number": batch_number,
            "expiry_date": expiry_date,
            "manufacturer": manufacturer,
            "match_type": match_type,
            "confidence": confidence,
            "matched_product": matched_product,
            "suggestions": suggestions
        })

    return enriched_items


@router.post("/submit")
async def submit_ai_import(
    request: AIImportSubmitRequest,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_purchases"))
):
    # 1. Fetch and validate Supplier
    supplier = await db.suppliers.find_one({"_id": ObjectId(request.supplier_id)})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    # Pre-calculate invoice number and check for duplicates to prevent E11000 index error
    sys_invoice = await get_next_purchase_number(db)
    invoice_number = request.invoice_number.strip() if request.invoice_number else sys_invoice

    existing_purchase = await db.purchases.find_one({"invoice_number": invoice_number})
    if existing_purchase:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice number '{invoice_number}' already exists in the system. Please change the Invoice Reference No. to be unique (e.g. '{invoice_number}-1')."
        )

    imported_products_log = []
    purchase_items = []
    now = datetime.utcnow()

    # Track transaction modifications for manual rollback on failure
    rollbacks = []

    try:
        resolved_brands = {}
        # 2. Process all products
        for item in request.items:
            batch_no = item.batch_number.strip() if (item.batch_number and item.batch_number.strip()) else "DEFAULT"
            
            product = None
            if item.product_id:
                product = await db.products.find_one({"_id": ObjectId(item.product_id), "is_active": True})

            if not product:
                # Fallback: check if there is an active product with the exact same name (case-insensitive)
                prod_name_clean = item.product_name.strip()
                product = await db.products.find_one({
                    "name": {"$regex": f"^{prod_name_clean}$", "$options": "i"},
                    "is_active": True
                })

            # Resolve category ID and brand
            cat_id = None
            brand_name = item.manufacturer.strip() if item.manufacturer else None
            if brand_name:
                if brand_name in resolved_brands:
                    cat_id = resolved_brands[brand_name]
                else:
                    cat_id = await resolve_category_from_brand(brand_name, db)
                    resolved_brands[brand_name] = cat_id

            if not product:
                # Create new product
                new_product_doc = {
                    "name": item.product_name.strip(),
                    "brand": brand_name,
                    "category_id": cat_id,
                    "purchase_price": item.purchase_rate,
                    "selling_price": item.selling_price,
                    "current_stock": 0.0,
                    "cases": 0.0,
                    "final_amount": 0.0,
                    "pack": item.pack,
                    "hsn_code": item.hsn_code,
                    "gst_rate": item.gst,
                    "batch": batch_no,
                    "expiry": item.expiry_date,
                    "is_active": True,
                    "created_at": now,
                    "updated_at": now,
                    "created_by": str(current_user["_id"])
                }
                res = await db.products.insert_one(new_product_doc)
                product_id = str(res.inserted_id)
                product = await db.products.find_one({"_id": ObjectId(product_id)})
                rollbacks.append((db.products.delete_one, {"_id": ObjectId(product_id)}, None))
            else:
                product_id = str(product["_id"])

            old_stock = product.get("current_stock") or 0.0
            new_stock = old_stock + item.quantity

            # Update existing product stocks, rates, brand, category, batch, and expiry
            update_fields = {
                "current_stock": new_stock,
                "purchase_price": item.purchase_rate,
                "selling_price": item.selling_price,
                "updated_at": now
            }

            if item.hsn_code and not product.get("hsn_code"):
                update_fields["hsn_code"] = item.hsn_code
            if item.gst is not None and product.get("gst_rate") is None:
                update_fields["gst_rate"] = item.gst
            if item.pack and not product.get("pack"):
                update_fields["pack"] = item.pack
            if cat_id and not product.get("category_id"):
                update_fields["category_id"] = cat_id
            if brand_name and not product.get("brand"):
                update_fields["brand"] = brand_name

            # Merge batch and expiry strings
            old_batch = product.get("batch") or ""
            if batch_no and batch_no not in old_batch:
                update_fields["batch"] = f"{old_batch}, {batch_no}" if old_batch else batch_no

            old_expiry = product.get("expiry") or ""
            new_expiry = item.expiry_date or ""
            if new_expiry and new_expiry not in old_expiry:
                update_fields["expiry"] = f"{old_expiry}, {new_expiry}" if old_expiry else new_expiry

            await db.products.update_one({"_id": product["_id"]}, {"$set": update_fields})
            rollbacks.append(
                (db.products.update_one, {"_id": product["_id"]}, {"$set": {
                    "current_stock": old_stock, 
                    "purchase_price": product.get("purchase_price"), 
                    "selling_price": product.get("selling_price"),
                    "batch": product.get("batch"),
                    "expiry": product.get("expiry")
                }} )
            )

            # 3. Create Stock Log
            log_res = await db.stock_logs.insert_one({
                "product_id": product_id,
                "product_name": product["name"],
                "type": "purchase",
                "quantity": item.quantity,
                "before_stock": old_stock,
                "after_stock": new_stock,
                "reference": f"AI Import {invoice_number}",
                "created_by": str(current_user["_id"]),
                "created_at": now
            })
            rollbacks.append((db.stock_logs.delete_one, {"_id": log_res.inserted_id}, None))

            # 4. Upsert batch entry
            batch_no = item.batch_number.strip() if (item.batch_number and item.batch_number.strip()) else "DEFAULT"
            expiry_dt = parse_expiry_string(item.expiry_date)
            
            # Fetch existing batch stock
            existing_batch = await db.batches.find_one({"product_id": product_id, "batch_no": batch_no})
            old_batch_stock = existing_batch.get("current_stock") or 0.0 if existing_batch else 0.0
            
            await db.batches.update_one(
                {"product_id": product_id, "batch_no": batch_no},
                {
                    "$inc": {"current_stock": item.quantity},
                    "$set": {
                        "expiry": expiry_dt,
                        "purchase_price": item.purchase_rate,
                        "updated_at": now
                    },
                    "$setOnInsert": {
                        "created_at": now
                    }
                },
                upsert=True
            )
            
            if existing_batch:
                rollbacks.append(
                    (db.batches.update_one, {"product_id": product_id, "batch_no": batch_no}, {"$set": {"current_stock": old_batch_stock, "purchase_price": existing_batch.get("purchase_price")}} )
                )
            else:
                rollbacks.append((db.batches.delete_one, {"product_id": product_id, "batch_no": batch_no}, None))

            # 5. Populate purchase item details and perform calculations
            taxable_amount = item.purchase_rate * item.quantity
            gst_rate = item.gst or 0.0
            tax_amount = taxable_amount * (gst_rate / 100)
            
            cgst = 0.0
            sgst = 0.0
            igst = 0.0
            
            if request.is_igst:
                igst = tax_amount
            else:
                cgst = tax_amount / 2
                sgst = tax_amount / 2

            total_amount = taxable_amount + tax_amount

            purchase_items.append({
                "product_id": product_id,
                "product_name": product["name"],
                "hsn_code": item.hsn_code,
                "unit": "PCS",
                "quantity": item.quantity,
                "rate": item.purchase_rate,
                "discount_percent": 0.0,
                "gst_rate": gst_rate,
                "taxable_amount": round(taxable_amount, 2),
                "cgst_amount": round(cgst, 2),
                "sgst_amount": round(sgst, 2),
                "igst_amount": round(igst, 2),
                "total_amount": round(total_amount, 2),
                "batch_no": batch_no,
                "expiry": expiry_dt
            })

            imported_products_log.append({
                "product_id": product_id,
                "product_name": product["name"],
                "quantity": item.quantity,
                "batch_number": batch_no
            })

        # 6. Insert Purchase Invoice record
        subtotal = sum(i["taxable_amount"] for i in purchase_items)
        total_taxable = subtotal
        total_cgst = sum(i["cgst_amount"] for i in purchase_items)
        total_sgst = sum(i["sgst_amount"] for i in purchase_items)
        total_igst = sum(i["igst_amount"] for i in purchase_items)
        total_tax = total_cgst + total_sgst + total_igst
        total_amount = round(total_taxable + total_tax, 2)
        balance = round(total_amount - request.paid_amount, 2)

        purchase_doc = {
            "invoice_number": invoice_number,
            "sys_invoice_number": sys_invoice,
            "supplier_id": request.supplier_id,
            "supplier_name": supplier["name"],
            "purchase_date": request.purchase_date or now,
            "items": purchase_items,
            "subtotal": round(subtotal, 2),
            "taxable_amount": round(total_taxable, 2),
            "total_cgst": round(total_cgst, 2),
            "total_sgst": round(total_sgst, 2),
            "total_igst": round(total_igst, 2),
            "total_tax": round(total_tax, 2),
            "total_amount": total_amount,
            "paid_amount": request.paid_amount,
            "balance_amount": balance,
            "payment_mode": request.payment_mode,
            "is_igst": request.is_igst,
            "status": "paid" if balance <= 0 else "partial" if request.paid_amount > 0 else "unpaid",
            "purchase_type": "purchase",
            "notes": request.notes,
            "created_by": str(current_user["_id"]),
            "created_by_name": current_user.get("full_name", ""),
            "created_at": now
        }

        purchase_res = await db.purchases.insert_one(purchase_doc)
        purchase_id = str(purchase_res.inserted_id)
        rollbacks.append((db.purchases.delete_one, {"_id": ObjectId(purchase_id)}, None))

        # 7. Update supplier balance
        await db.suppliers.update_one(
            {"_id": ObjectId(request.supplier_id)},
            {"$inc": {"current_balance": balance}}
        )
        rollbacks.append(
            (db.suppliers.update_one, {"_id": ObjectId(request.supplier_id)}, {"$inc": {"current_balance": -balance}})
        )

        # 8. Create Ledger entry
        ledger_res = await db.ledger.insert_one({
            "party_type": "supplier",
            "party_id": request.supplier_id,
            "date": request.purchase_date or now,
            "type": "purchase",
            "debit": request.paid_amount,
            "credit": total_amount,
            "balance": balance,
            "reference": invoice_number,
            "reference_id": purchase_id,
            "created_at": now
        })
        rollbacks.append((db.ledger.delete_one, {"_id": ledger_res.inserted_id}, None))

        # 9. Log Audit history record
        audit_res = await db.ai_import_audit_logs.insert_one({
            "original_json": request.original_json,
            "user_modifications": [item.dict() for item in request.items],
            "timestamp": now,
            "imported_products": imported_products_log,
            "purchase_id": purchase_id,
            "created_by": str(current_user["_id"]),
            "created_at": now
        })

    except Exception as e:
        logger.error(f"AI Import submission failed, starting rollback: {e}")
        for func, query, update in reversed(rollbacks):
            try:
                if update is not None:
                    await func(query, update)
                else:
                    await func(query)
            except Exception as rollback_err:
                logger.error(f"Rollback critical step failed: {rollback_err}")
        
        err_msg = str(e)
        if "E11000" in err_msg or "duplicate key" in err_msg.lower():
            raise HTTPException(
                status_code=400,
                detail="This invoice has already been imported. Please edit the Invoice Reference No. to make it unique and try again."
            )
            
        raise HTTPException(status_code=500, detail=f"Failed to submit import: {err_msg}")

    return {
        "message": "AI Import processed successfully",
        "imported_count": len(request.items),
        "purchase_id": purchase_id,
        "invoice_number": invoice_number
    }
