from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.models.transaction import SaleCreate
from bson import ObjectId
from datetime import datetime
from typing import Optional
import os
from app.api.routes.products import parse_expiry_string

router = APIRouter()

async def get_next_invoice_number(db, prefix="INV", tenant_id: str = "") -> str:
    today = datetime.utcnow()
    year = today.strftime("%y")
    month = today.strftime("%m")
    # SECURITY: Prefix with tenant_id so each company has its own isolated invoice sequence.
    counter_key = f"{tenant_id}-{prefix}-{year}{month}"
    result = await db.counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = result["seq"]
    return f"{prefix}-{year}{month}-{seq:04d}"

def calculate_gst_items(items: list, is_igst: bool) -> list:
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
            half_rate = gst_rate / 2
            cgst_amt = round(taxable * half_rate / 100, 2)
            sgst_amt = round(taxable * half_rate / 100, 2)

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
async def list_sales(
    customer_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    sale_type: str = Query("sale"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_sales", "can_create_sales"]))
):
    query = {"sale_type": sale_type}
    if customer_id:
        query["customer_id"] = customer_id
    if status:
        query["status"] = status
    if from_date or to_date:
        query["sale_date"] = {}
        if from_date:
            query["sale_date"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["sale_date"]["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")

    total = await db.sales.count_documents(query)
    skip = (page - 1) * limit
    sales = await db.sales.find(query).sort("sale_date", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [serialize_doc(s) for s in sales], "total": total, "page": page}

@router.get("/today")
async def today_sales_summary(
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_sales", "can_create_sales"]))
):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    pipeline = [
        {"$match": {"sale_date": {"$gte": today}, "sale_type": "sale"}},
        {"$group": {
            "_id": None,
            "total_sales": {"$sum": "$total_amount"},
            "total_paid": {"$sum": "$paid_amount"},
            "count": {"$sum": 1}
        }}
    ]
    result = await db.sales.aggregate(pipeline).to_list(1)
    if result:
        return result[0]
    return {"total_sales": 0, "total_paid": 0, "count": 0}

@router.get("/{sale_id}")
async def get_sale(
    sale_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_sales", "can_create_sales"]))
):
    sale = await db.sales.find_one({"_id": ObjectId(sale_id)})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    return serialize_doc(sale)

@router.post("/")
async def create_sale(
    data: SaleCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_sales"))
):
    # Validate stock availability
    if data.sale_type == "sale":
        for item in data.items:
            product = await db.products.find_one({"_id": ObjectId(item.product_id)})
            if not product:
                raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
            
            # Sync product stock with batch stock if batch stock is higher (out of sync)
            batches = await db.batches.find({"product_id": item.product_id}).to_list(None)
            total_batch_stock = sum(b.get("current_stock", 0) for b in batches)
            if total_batch_stock > product.get("current_stock", 0):
                await db.products.update_one(
                    {"_id": product["_id"]},
                    {"$set": {"current_stock": total_batch_stock}}
                )
                product["current_stock"] = total_batch_stock
            
            if product.get("current_stock", 0) < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for '{product['name']}'. Available: {product.get('current_stock', 0)}"
                )

    # Calculate GST
    calculated_items = calculate_gst_items(data.items, data.is_igst)

    subtotal = sum(i["taxable_amount"] + i["discount_amount"] for i in calculated_items)
    total_taxable = sum(i["taxable_amount"] for i in calculated_items)
    total_cgst = sum(i["cgst_amount"] for i in calculated_items)
    total_sgst = sum(i["sgst_amount"] for i in calculated_items)
    total_igst = sum(i["igst_amount"] for i in calculated_items)
    total_tax = total_cgst + total_sgst + total_igst

    # Apply invoice-level discount
    disc_amt = round(total_taxable * data.discount_percent / 100, 2) + data.discount_amount
    total_amount = round(total_taxable - disc_amt + total_tax, 2)
    balance = round(total_amount - data.paid_amount, 2)

    invoice_number = await get_next_invoice_number(
        db,
        "INV" if data.sale_type == "sale" else "SRN",
        tenant_id=current_user.get("tenant_id", "")
    )
    now = data.sale_date or datetime.utcnow()

    # Get customer info
    customer_name = data.customer_name or "Walk-in Customer"
    if data.customer_id:
        customer = await db.customers.find_one({"_id": ObjectId(data.customer_id)})
        if customer:
            customer_name = customer["name"]

    sale_doc = {
        "invoice_number": invoice_number,
        "customer_id": data.customer_id,
        "customer_name": customer_name,
        "sale_date": now,
        "items": calculated_items,
        "subtotal": round(subtotal, 2),
        "discount_percent": data.discount_percent,
        "discount_amount": round(disc_amt, 2),
        "taxable_amount": round(total_taxable - disc_amt, 2),
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
        "sale_type": data.sale_type,
        "notes": data.notes,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": datetime.utcnow()
    }

    rollbacks = []
    inserted_sale_id = None
    inserted_stock_logs = []
    inserted_ledger_id = None

    try:
        # 1. Update stock and batches atomically
        for item in calculated_items:
            stock_change = -item["quantity"] if data.sale_type == "sale" else item["quantity"]
            
            if stock_change < 0: # Depleting Stock (Sale)
                qty_to_deduct = abs(stock_change)
                
                # Self-healing: Sync batch stock with general product stock if unbatched quantity exists
                product_doc = await db.products.find_one({"_id": ObjectId(item["product_id"])})
                if product_doc:
                    prod_stock = product_doc.get("current_stock", 0)
                    batches = await db.batches.find({"product_id": item["product_id"]}).to_list(None)
                    total_batch_stock = sum(b.get("current_stock", 0) for b in batches)
                    if prod_stock > total_batch_stock:
                        diff = prod_stock - total_batch_stock
                        await db.batches.update_one(
                            {"product_id": item["product_id"], "batch_no": "DEFAULT"},
                            {
                                "$inc": {"current_stock": diff},
                                "$setOnInsert": {
                                    "created_at": datetime.utcnow(),
                                    "expiry": None,
                                    "purchase_price": product_doc.get("purchase_price", 0.0)
                                }
                            },
                            upsert=True
                        )

                # Deduct from general product stock
                res_prod = await db.products.update_one(
                    {"_id": ObjectId(item["product_id"]), "current_stock": {"$gte": qty_to_deduct}},
                    {"$inc": {"current_stock": stock_change}}
                )
                if res_prod.modified_count == 0:
                    product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
                    avail = product.get("current_stock", 0) if product else 0
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient stock for '{item['product_name']}'. Available: {avail}"
                    )
                rollbacks.append(
                    (db.products.update_one, {"_id": ObjectId(item["product_id"])}, {"$inc": {"current_stock": qty_to_deduct}})
                )
                
                # Batch deduction (manual override or FEFO)
                if item.get("batch_no"):
                    # Manual override
                    res_batch = await db.batches.update_one(
                        {"product_id": item["product_id"], "batch_no": item["batch_no"], "current_stock": {"$gte": qty_to_deduct}},
                        {"$inc": {"current_stock": -qty_to_deduct}}
                    )
                    if res_batch.modified_count == 0:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Insufficient stock in batch '{item['batch_no']}' of product '{item['product_name']}'."
                        )
                    rollbacks.append(
                        (db.batches.update_one, {"product_id": item["product_id"], "batch_no": item["batch_no"]}, {"$inc": {"current_stock": qty_to_deduct}})
                    )
                else:
                    # FEFO - First Expired First Out
                    # Load all batches with current_stock > 0
                    batches = await db.batches.find({"product_id": item["product_id"], "current_stock": {"$gt": 0}}).to_list(None)
                    
                    def sort_expiry(b):
                        exp = b.get("expiry")
                        if exp is None:
                            return datetime.max.replace(tzinfo=None)
                        if isinstance(exp, str):
                            parsed = parse_expiry_string(exp)
                            if parsed:
                                return parsed.replace(tzinfo=None)
                            return datetime.max.replace(tzinfo=None)
                        if isinstance(exp, datetime):
                            return exp.replace(tzinfo=None)
                        return datetime.max.replace(tzinfo=None)
                    
                    batches.sort(key=sort_expiry)
                    
                    total_avail = sum(b["current_stock"] for b in batches)
                    if total_avail < qty_to_deduct:
                        raise HTTPException(
                            status_code=400,
                            detail=f"Insufficient stock for '{item['product_name']}' across batches."
                        )
                    
                    remaining = qty_to_deduct
                    allocated = []
                    for b in batches:
                        if remaining <= 0:
                            break
                        b_stock = b["current_stock"]
                        deduct = min(remaining, b_stock)
                        
                        res = await db.batches.update_one(
                            {"_id": b["_id"], "current_stock": {"$gte": deduct}},
                            {"$inc": {"current_stock": -deduct}}
                        )
                        if res.modified_count == 0:
                            raise HTTPException(
                                status_code=409,
                                detail="Stock updated concurrently, please retry transaction."
                            )
                        
                        rollbacks.append(
                            (db.batches.update_one, {"_id": b["_id"]}, {"$inc": {"current_stock": deduct}})
                        )
                        
                        allocated.append({
                            "batch_no": b["batch_no"],
                            "expiry": b.get("expiry"),
                            "quantity": deduct
                        })
                        remaining -= deduct
                    
                    # Record allocated batches in the sale doc's item
                    item["batches_allocated"] = allocated
                    if len(allocated) == 1:
                        item["batch_no"] = allocated[0]["batch_no"]
                        item["expiry"] = allocated[0]["expiry"]
                    elif len(allocated) > 1:
                        item["batch_no"] = "MULTI"
                        item["expiry"] = min(al["expiry"] for al in allocated if al["expiry"]) if any(al["expiry"] for al in allocated) else None

            else: # Stock Incrementing (Return)
                batch_no = item.get("batch_no") or "DEFAULT"
                expiry = item.get("expiry")
                
                await db.products.update_one(
                    {"_id": ObjectId(item["product_id"])},
                    {"$inc": {"current_stock": stock_change}}
                )
                rollbacks.append(
                    (db.products.update_one, {"_id": ObjectId(item["product_id"])}, {"$inc": {"current_stock": -stock_change}})
                )
                
                await db.batches.update_one(
                    {"product_id": item["product_id"], "batch_no": batch_no},
                    {
                        "$inc": {"current_stock": stock_change},
                        "$set": {"expiry": expiry},
                        "$setOnInsert": {"created_at": datetime.utcnow()}
                    },
                    upsert=True
                )
                rollbacks.append(
                    (db.batches.update_one, {"product_id": item["product_id"], "batch_no": batch_no}, {"$inc": {"current_stock": -stock_change}})
                )

        # 2. Insert Sale document
        result = await db.sales.insert_one(sale_doc)
        sale_id = str(result.inserted_id)
        inserted_sale_id = sale_id
        rollbacks.append((db.sales.delete_one, {"_id": ObjectId(sale_id)}, None))

        # 3. Insert Stock logs
        for item in calculated_items:
            stock_change = -item["quantity"] if data.sale_type == "sale" else item["quantity"]
            product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
            after_stock = product.get("current_stock", 0) if product else 0
            before_stock = after_stock - stock_change

            log_res = await db.stock_logs.insert_one({
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "type": data.sale_type,
                "quantity": stock_change,
                "before_stock": before_stock,
                "after_stock": after_stock,
                "reference": invoice_number,
                "reference_id": sale_id,
                "created_by": str(current_user["_id"]),
                "created_at": datetime.utcnow()
            })
            inserted_stock_logs.append(log_res.inserted_id)
            
        if inserted_stock_logs:
            rollbacks.append((db.stock_logs.delete_many, {"_id": {"$in": inserted_stock_logs}}, None))

        # 4. Update customer balance and insert ledger
        if data.customer_id:
            await db.customers.update_one(
                {"_id": ObjectId(data.customer_id)},
                {"$inc": {"current_balance": balance}}
            )
            rollbacks.append(
                (db.customers.update_one, {"_id": ObjectId(data.customer_id)}, {"$inc": {"current_balance": -balance}})
            )

            ledger_res = await db.ledger.insert_one({
                "party_type": "customer",
                "party_id": data.customer_id,
                "date": now,
                "type": data.sale_type,
                "debit": total_amount,
                "credit": data.paid_amount,
                "balance": balance,
                "reference": invoice_number,
                "reference_id": sale_id,
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
        "message": "Sale created successfully",
        "id": sale_id,
        "invoice_number": invoice_number,
        "total_amount": total_amount
    }

@router.get("/{sale_id}/pdf")
async def get_sale_pdf(
    sale_id: str,
    db = Depends(get_database),
    current_user = Depends(require_permission(["can_view_sales", "can_create_sales"]))
):
    sale = await db.sales.find_one({"_id": ObjectId(sale_id)})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    # Dynamically fetch customer details for the PDF buyer section
    cust_id = sale.get("customer_id")
    customer_details = {}
    if cust_id:
        try:
            customer = await db.customers.find_one({"_id": ObjectId(str(cust_id))})
            if customer:
                addr = customer.get("address", "")
                addr_str = ""
                if isinstance(addr, dict):
                    parts = [addr.get(k) for k in ["street", "city", "state", "pincode"] if addr.get(k)]
                    addr_str = ", ".join(parts)
                elif isinstance(addr, str):
                    addr_str = addr

                customer_details = {
                    "customer_address": addr_str,
                    "customer_gstin": customer.get("gstin", ""),
                    "customer_mobile": customer.get("mobile", ""),
                }
        except Exception:
            pass

    sale_data = {**serialize_doc(sale), **customer_details}
    settings_doc = await db.settings.find_one({"type": "company"}) or {}
    
    from app.services.pdf_service import generate_sale_invoice
    pdf_path = await generate_sale_invoice(sale_data, serialize_doc(settings_doc))

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"Invoice-{sale['invoice_number']}.pdf"
    )

@router.post("/{sale_id}/payment")
async def record_payment(
    sale_id: str,
    amount: float,
    payment_mode: str = "cash",
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_sales"))
):
    sale = await db.sales.find_one({"_id": ObjectId(sale_id)})
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    new_paid = sale["paid_amount"] + amount
    new_balance = sale["total_amount"] - new_paid
    status = "paid" if new_balance <= 0 else "partial"

    await db.sales.update_one(
        {"_id": ObjectId(sale_id)},
        {"$set": {
            "paid_amount": new_paid,
            "balance_amount": new_balance,
            "status": status
        }}
    )

    if sale.get("customer_id"):
        await db.customers.update_one(
            {"_id": ObjectId(sale["customer_id"])},
            {"$inc": {"current_balance": -amount}}
        )
        await db.ledger.insert_one({
            "party_type": "customer",
            "party_id": sale["customer_id"],
            "date": datetime.utcnow(),
            "type": "receipt",
            "debit": 0,
            "credit": amount,
            "balance": new_balance,
            "reference": f"Payment against {sale['invoice_number']}",
            "reference_id": sale_id,
            "created_at": datetime.utcnow()
        })

    return {"message": "Payment recorded", "new_balance": new_balance}
