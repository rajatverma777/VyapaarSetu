from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.models.transaction import PurchaseCreate
from bson import ObjectId
from datetime import datetime
from typing import Optional

router = APIRouter()

async def get_next_purchase_number(db) -> str:
    today = datetime.utcnow()
    year = today.strftime("%y")
    month = today.strftime("%m")
    counter_key = f"PUR-{year}{month}"
    result = await db.counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    return f"PUR-{year}{month}-{result['seq']:04d}"

def calculate_purchase_gst(items, is_igst):
    calculated = []
    for item in items:
        rate = item.rate if hasattr(item, 'rate') else item['rate']
        qty = item.quantity if hasattr(item, 'quantity') else item['quantity']
        disc_pct = item.discount_percent if hasattr(item, 'discount_percent') else item.get('discount_percent', 0)
        gst_rate = item.gst_rate if hasattr(item, 'gst_rate') else item.get('gst_rate', 0)

        gross = round(rate * qty, 2)
        disc_amt = round(gross * disc_pct / 100, 2)
        taxable = round(gross - disc_amt, 2)

        if is_igst:
            igst_amt = round(taxable * gst_rate / 100, 2)
            cgst_amt = sgst_amt = 0
        else:
            igst_amt = 0
            half = gst_rate / 2
            cgst_amt = round(taxable * half / 100, 2)
            sgst_amt = round(taxable * half / 100, 2)

        total = round(taxable + cgst_amt + sgst_amt + igst_amt, 2)
        d = item.dict() if hasattr(item, 'dict') else dict(item)
        d.update({
            "discount_amount": disc_amt,
            "taxable_amount": taxable,
            "cgst_rate": 0 if is_igst else gst_rate / 2,
            "sgst_rate": 0 if is_igst else gst_rate / 2,
            "igst_rate": gst_rate if is_igst else 0,
            "cgst_amount": cgst_amt,
            "sgst_amount": sgst_amt,
            "igst_amount": igst_amt,
            "total_amount": total,
        })
        calculated.append(d)
    return calculated

@router.get("/")
async def list_purchases(
    supplier_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    purchase_type: str = Query("purchase"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_purchases", "can_create_purchases"]))
):
    query = {"purchase_type": purchase_type}
    if supplier_id:
        query["supplier_id"] = supplier_id
    if from_date or to_date:
        query["purchase_date"] = {}
        if from_date:
            query["purchase_date"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["purchase_date"]["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")

    total = await db.purchases.count_documents(query)
    skip = (page - 1) * limit
    purchases = await db.purchases.find(query).sort("purchase_date", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [serialize_doc(p) for p in purchases], "total": total, "page": page}

@router.get("/today")
async def today_purchases_summary(
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_purchases", "can_create_purchases"]))
):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"purchase_date": {"$gte": today}, "purchase_type": "purchase"}},
        {"$group": {
            "_id": None,
            "total_purchases": {"$sum": "$total_amount"},
            "total_paid": {"$sum": "$paid_amount"},
            "count": {"$sum": 1}
        }}
    ]
    result = await db.purchases.aggregate(pipeline).to_list(1)
    return result[0] if result else {"total_purchases": 0, "total_paid": 0, "count": 0}

@router.get("/{purchase_id}")
async def get_purchase(
    purchase_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_purchases", "can_create_purchases"]))
):
    purchase = await db.purchases.find_one({"_id": ObjectId(purchase_id)})
    if not purchase:
        raise HTTPException(status_code=404, detail="Purchase not found")
    return serialize_doc(purchase)

@router.post("/")
async def create_purchase(
    data: PurchaseCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_purchases"))
):
    supplier = await db.suppliers.find_one({"_id": ObjectId(data.supplier_id)})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    for item in data.items:
        product = await db.products.find_one({"_id": ObjectId(item.product_id)})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

    calculated_items = calculate_purchase_gst(data.items, data.is_igst)

    subtotal = sum(i["taxable_amount"] + i["discount_amount"] for i in calculated_items)
    total_taxable = sum(i["taxable_amount"] for i in calculated_items)
    total_cgst = sum(i["cgst_amount"] for i in calculated_items)
    total_sgst = sum(i["sgst_amount"] for i in calculated_items)
    total_igst = sum(i["igst_amount"] for i in calculated_items)
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = round(total_taxable + total_tax, 2)
    balance = round(total_amount - data.paid_amount, 2)

    sys_invoice = await get_next_purchase_number(db)
    invoice_number = data.invoice_number or sys_invoice
    now = data.purchase_date or datetime.utcnow()

    purchase_doc = {
        "invoice_number": invoice_number,
        "sys_invoice_number": sys_invoice,
        "supplier_id": data.supplier_id,
        "supplier_name": supplier["name"],
        "purchase_date": now,
        "items": calculated_items,
        "subtotal": round(subtotal, 2),
        "taxable_amount": round(total_taxable, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_tax": round(total_tax, 2),
        "total_amount": total_amount,
        "paid_amount": data.paid_amount,
        "balance_amount": balance,
        "payment_mode": data.payment_mode,
        "is_igst": data.is_igst,
        "status": "paid" if balance <= 0 else "partial" if data.paid_amount > 0 else "unpaid",
        "purchase_type": data.purchase_type,
        "notes": data.notes,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": datetime.utcnow()
    }

    purchase_id = None

    # Update stock and logs within rollback-protected transaction block
    rollbacks = []
    inserted_purchase_id = None
    inserted_stock_logs = []
    inserted_ledger_id = None

    try:
        # 1. Update batch and product stock atomically
        for item in calculated_items:
            stock_change = item["quantity"] if data.purchase_type == "purchase" else -item["quantity"]
            
            # Atomic update on total product stock
            if stock_change < 0:
                res = await db.products.update_one(
                    {"_id": ObjectId(item["product_id"]), "current_stock": {"$gte": abs(stock_change)}},
                    {
                        "$inc": {"current_stock": stock_change},
                        "$set": {"purchase_price": item["rate"], "updated_at": datetime.utcnow()}
                    }
                )
                if res.modified_count == 0:
                    product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
                    avail = product.get("current_stock", 0) if product else 0
                    name = product.get("name", "Unknown Product") if product else "Unknown Product"
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock to return product '{name}'. Available: {avail}"
                    )
            else:
                await db.products.update_one(
                    {"_id": ObjectId(item["product_id"])},
                    {
                        "$inc": {"current_stock": stock_change},
                        "$set": {"purchase_price": item["rate"], "updated_at": datetime.utcnow()}
                    }
                )
            
            # Record product stock rollback (opposite direction of the stock change)
            rollbacks.append(
                (db.products.update_one, {"_id": ObjectId(item["product_id"])}, {"$inc": {"current_stock": -stock_change}})
            )

            # Atomic update on batch stock
            batch_no = item.get("batch_no") or "DEFAULT"
            expiry = item.get("expiry")
            
            if stock_change < 0:
                batch_res = await db.batches.update_one(
                    {"product_id": item["product_id"], "batch_no": batch_no, "current_stock": {"$gte": abs(stock_change)}},
                    {
                        "$inc": {"current_stock": stock_change},
                        "$set": {
                            "expiry": expiry,
                            "purchase_price": item["rate"],
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                if batch_res.modified_count == 0:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock in batch '{batch_no}' of product '{item['product_name']}' to process return."
                    )
            else:
                await db.batches.update_one(
                    {"product_id": item["product_id"], "batch_no": batch_no},
                    {
                        "$inc": {"current_stock": stock_change},
                        "$set": {
                            "expiry": expiry,
                            "purchase_price": item["rate"],
                            "updated_at": datetime.utcnow()
                        },
                        "$setOnInsert": {
                            "created_at": datetime.utcnow()
                        }
                    },
                    upsert=True
                )

            # Record batch stock rollback
            rollbacks.append(
                (db.batches.update_one, {"product_id": item["product_id"], "batch_no": batch_no}, {"$inc": {"current_stock": -stock_change}})
            )

        # 2. Insert Purchase document
        result = await db.purchases.insert_one(purchase_doc)
        purchase_id = str(result.inserted_id)
        inserted_purchase_id = purchase_id
        rollbacks.append((db.purchases.delete_one, {"_id": ObjectId(purchase_id)}, None))

        # 3. Insert Stock logs
        for item in calculated_items:
            stock_change = item["quantity"] if data.purchase_type == "purchase" else -item["quantity"]
            product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
            after_stock = product.get("current_stock", 0) if product else 0
            before_stock = after_stock - stock_change

            log_res = await db.stock_logs.insert_one({
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "type": data.purchase_type,
                "quantity": stock_change,
                "before_stock": before_stock,
                "after_stock": after_stock,
                "reference": invoice_number,
                "reference_id": purchase_id,
                "created_by": str(current_user["_id"]),
                "created_at": datetime.utcnow()
            })
            inserted_stock_logs.append(log_res.inserted_id)
            
        if inserted_stock_logs:
            rollbacks.append((db.stock_logs.delete_many, {"_id": {"$in": inserted_stock_logs}}, None))

        # 4. Update supplier balance and insert ledger
        await db.suppliers.update_one(
            {"_id": ObjectId(data.supplier_id)},
            {"$inc": {"current_balance": balance}}
        )
        rollbacks.append(
            (db.suppliers.update_one, {"_id": ObjectId(data.supplier_id)}, {"$inc": {"current_balance": -balance}})
        )

        ledger_res = await db.ledger.insert_one({
            "party_type": "supplier",
            "party_id": data.supplier_id,
            "date": now,
            "type": "purchase",
            "debit": data.paid_amount,
            "credit": total_amount,
            "balance": balance,
            "reference": invoice_number,
            "reference_id": purchase_id,
            "created_at": datetime.utcnow()
        })
        inserted_ledger_id = ledger_res.inserted_id
        rollbacks.append((db.ledger.delete_one, {"_id": inserted_ledger_id}, None))

    except Exception as e:
        for func, query, update in reversed(rollbacks):
            try:
                if update is not None:
                    await func(query, update)
                else:
                    await func(query)
            except Exception as rollback_err:
                print(f"ROLLBACK CRITICAL FAILURE: {rollback_err}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Transaction failed: {str(e)}")

    return {
        "message": "Purchase created",
        "id": purchase_id,
        "invoice_number": invoice_number,
        "total_amount": total_amount
    }
