from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.models.returns import ReturnCreate
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional
import os

router = APIRouter()

async def get_next_note_number(db, prefix="CN", tenant_id: str = "") -> str:
    today = datetime.utcnow()
    year = today.strftime("%y")
    month = today.strftime("%m")
    # SECURITY: Prefix with tenant_id to isolate return note sequences per company.
    counter_key = f"{tenant_id}-{prefix}-{year}{month}"
    result = await db.counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True
    )
    seq = result["seq"]
    return f"{prefix}-{year}{month}-{seq:04d}"

def calculate_return_gst(items: list, is_igst: bool) -> list:
    calculated = []
    for item in items:
        rate = item.rate if hasattr(item, 'rate') else item['rate']
        qty = item.quantity if hasattr(item, 'quantity') else item['quantity']
        gst_rate = item.gst_rate if hasattr(item, 'gst_rate') else item.get('gst_rate', 0)

        taxable = round(rate * qty, 2)

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
async def list_returns(
    party_type: Optional[str] = Query(None, description="customer or supplier"),
    party_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {}
    if party_type:
        query["type"] = party_type
    if party_id:
        query["party_id"] = party_id
    if from_date or to_date:
        query["date"] = {}
        if from_date:
            query["date"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["date"]["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")

    total = await db.returns.count_documents(query)
    skip = (page - 1) * limit
    items = await db.returns.find(query).sort("date", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [serialize_doc(i) for i in items], "total": total, "page": page}

@router.get("/analytics")
async def returns_analytics(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    # Set default date range to last 30 days if not provided
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=29)
    
    if from_date:
        start_date = datetime.fromisoformat(from_date)
    if to_date:
        end_date = datetime.fromisoformat(to_date + "T23:59:59")

    match_filter = {"date": {"$gte": start_date, "$lte": end_date}}

    # 1. Total Losses (Credit & Debit Notes value)
    losses_pipe = [
        {"$match": match_filter},
        {"$group": {
            "_id": "$type",
            "total_value": {"$sum": "$total_amount"},
            "count": {"$sum": 1}
        }}
    ]
    losses_res = await db.returns.aggregate(losses_pipe).to_list(None)
    
    losses = {"customer": 0.0, "supplier": 0.0}
    counts = {"customer": 0, "supplier": 0}
    for item in losses_res:
        losses[item["_id"]] = item["total_value"]
        counts[item["_id"]] = item["count"]

    # 2. Return reasons distribution
    reason_pipe = [
        {"$match": match_filter},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.reason",
            "quantity": {"$sum": "$items.quantity"},
            "value": {"$sum": "$items.total_amount"}
        }}
    ]
    reasons_res = await db.returns.aggregate(reason_pipe).to_list(None)
    reasons = [{"reason": r["_id"], "quantity": r["quantity"], "value": r["value"]} for r in reasons_res]

    # 3. Product Return Rates (returned qty / sold qty)
    # Get returned products qty
    ret_prod_pipe = [
        {"$match": {**match_filter, "type": "customer"}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "product_name": {"$first": "$items.product_name"},
            "returned_qty": {"$sum": "$items.quantity"},
            "returned_value": {"$sum": "$items.total_amount"}
        }}
    ]
    ret_prods = await db.returns.aggregate(ret_prod_pipe).to_list(None)

    # Get sold products qty
    sold_prod_pipe = [
        {"$match": {"sale_date": {"$gte": start_date, "$lte": end_date}, "sale_type": "sale"}},
        {"$unwind": "$items"},
        {"$group": {
            "_id": "$items.product_id",
            "sold_qty": {"$sum": "$items.quantity"}
        }}
    ]
    sold_prods = await db.sales.aggregate(sold_prod_pipe).to_list(None)
    sold_map = {item["_id"]: item["sold_qty"] for item in sold_prods}

    product_rates = []
    for rp in ret_prods:
        pid = rp["_id"]
        sold_qty = sold_map.get(pid, 0.0)
        rate = round((rp["returned_qty"] / sold_qty * 100), 2) if sold_qty > 0 else 100.0
        product_rates.append({
            "product_id": pid,
            "product_name": rp["product_name"],
            "returned_qty": rp["returned_qty"],
            "sold_qty": sold_qty,
            "rate": rate,
            "value": rp["returned_value"]
        })
    product_rates.sort(key=lambda x: x["rate"], reverse=True)

    # 4. Brand Return Rates
    ret_brand_pipe = [
        {"$match": {**match_filter, "type": "customer"}},
        {"$unwind": "$items"},
        {"$addFields": {"items.product_id_obj": {"$toObjectId": "$items.product_id"}}},
        {"$lookup": {
            "from": "products",
            "localField": "items.product_id_obj",
            "foreignField": "_id",
            "as": "prod_info"
        }},
        {"$unwind": {"path": "$prod_info", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"brand": {"$ifNull": ["$prod_info.brand", "Unknown"]}}},
        {"$group": {
            "_id": "$brand",
            "returned_qty": {"$sum": "$items.quantity"},
            "returned_value": {"$sum": "$items.total_amount"}
        }}
    ]
    ret_brands = await db.returns.aggregate(ret_brand_pipe).to_list(None)

    sold_brand_pipe = [
        {"$match": {"sale_date": {"$gte": start_date, "$lte": end_date}, "sale_type": "sale"}},
        {"$unwind": "$items"},
        {"$addFields": {"items.product_id_obj": {"$toObjectId": "$items.product_id"}}},
        {"$lookup": {
            "from": "products",
            "localField": "items.product_id_obj",
            "foreignField": "_id",
            "as": "prod_info"
        }},
        {"$unwind": {"path": "$prod_info", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"brand": {"$ifNull": ["$prod_info.brand", "Unknown"]}}},
        {"$group": {
            "_id": "$brand",
            "sold_qty": {"$sum": "$items.quantity"}
        }}
    ]
    sold_brands = await db.sales.aggregate(sold_brand_pipe).to_list(None)
    sold_brand_map = {item["_id"]: item["sold_qty"] for item in sold_brands}

    brand_rates = []
    for rb in ret_brands:
        brand = rb["_id"]
        sold_qty = sold_brand_map.get(brand, 0.0)
        rate = round((rb["returned_qty"] / sold_qty * 100), 2) if sold_qty > 0 else 100.0
        brand_rates.append({
            "brand": brand,
            "returned_qty": rb["returned_qty"],
            "sold_qty": sold_qty,
            "rate": rate,
            "value": rb["returned_value"]
        })
    brand_rates.sort(key=lambda x: x["rate"], reverse=True)

    # 5. Return Trends Timeline (daily returned value)
    trend_pipe = [
        {"$match": match_filter},
        {"$group": {
            "_id": {
                "date": {"$dateToString": {"format": "%Y-%m-%d", "date": "$date"}},
                "type": "$type"
            },
            "amount": {"$sum": "$total_amount"}
        }},
        {"$sort": {"_id.date": 1}}
    ]
    trends_res = await db.returns.aggregate(trend_pipe).to_list(None)
    
    # Format trend mapping
    trend_map = {}
    curr = start_date
    while curr <= end_date:
        d_str = curr.strftime("%Y-%m-%d")
        trend_map[d_str] = {"date": d_str, "customer": 0.0, "supplier": 0.0}
        curr += timedelta(days=1)

    for item in trends_res:
        date_str = item["_id"]["date"]
        rtype = item["_id"]["type"]
        if date_str in trend_map:
            trend_map[date_str][rtype] = item["amount"]

    trends = sorted(list(trend_map.values()), key=lambda x: x["date"])

    return {
        "losses": losses,
        "counts": counts,
        "reasons": reasons,
        "product_rates": product_rates[:10], # Top 10 returned products
        "brand_rates": brand_rates,
        "trends": trends
    }

@router.get("/{return_id}")
async def get_return(
    return_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    ret = await db.returns.find_one({"_id": ObjectId(return_id)})
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")
    return serialize_doc(ret)

@router.post("/customer")
async def create_customer_return(
    data: ReturnCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_sales"))
):
    if data.type != "customer":
        raise HTTPException(status_code=400, detail="Invalid return type for customer endpoint")

    customer_name = "Walk-in Customer"
    is_igst = False
    
    if data.party_id:
        customer = await db.customers.find_one({"_id": ObjectId(data.party_id)})
        if not customer:
            raise HTTPException(status_code=404, detail="Customer not found")
        customer_name = customer["name"]
        # Determine if inter-state (GSTIN comparison, or default to settings)
        gst_settings = await db.settings.find_one({"type": "company"}) or {}
        comp_gst = gst_settings.get("gstin", "")
        cust_gst = customer.get("gstin", "")
        if comp_gst and cust_gst and comp_gst[:2] != cust_gst[:2]:
            is_igst = True

    calculated_items = calculate_return_gst(data.items, is_igst)

    subtotal = sum(i["taxable_amount"] for i in calculated_items)
    total_cgst = sum(i["cgst_amount"] for i in calculated_items)
    total_sgst = sum(i["sgst_amount"] for i in calculated_items)
    total_igst = sum(i["igst_amount"] for i in calculated_items)
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = round(subtotal + total_tax, 2)
    balance = round(total_amount - data.paid_amount, 2)

    note_number = await get_next_note_number(db, "CN", tenant_id=current_user.get("tenant_id", ""))
    now = data.date or datetime.utcnow()

    return_doc = {
        "note_number": note_number,
        "type": "customer",
        "party_id": data.party_id,
        "party_name": customer_name,
        "reference_id": data.reference_id,
        "items": calculated_items,
        "subtotal": round(subtotal, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_tax": round(total_tax, 2),
        "total_amount": total_amount,
        "paid_amount": data.paid_amount,
        "balance_amount": balance,
        "notes": data.notes,
        "date": now,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": datetime.utcnow()
    }

    rollbacks = []
    try:
        # 1. Update stock and batches atomically (Customer return increases stock)
        for item in calculated_items:
            qty = item["quantity"]
            batch_no = item.get("batch_no") or "DEFAULT"
            
            # Increment product stock
            await db.products.update_one(
                {"_id": ObjectId(item["product_id"])},
                {"$inc": {"current_stock": qty}}
            )
            rollbacks.append(
                (db.products.update_one, {"_id": ObjectId(item["product_id"])}, {"$inc": {"current_stock": -qty}})
            )

            # Increment batch stock
            await db.batches.update_one(
                {"product_id": item["product_id"], "batch_no": batch_no},
                {
                    "$inc": {"current_stock": qty},
                    "$setOnInsert": {
                        "created_at": datetime.utcnow(),
                        "purchase_price": item["rate"],
                        "expiry": item.get("expiry")
                    }
                },
                upsert=True
            )
            rollbacks.append(
                (db.batches.update_one, {"product_id": item["product_id"], "batch_no": batch_no}, {"$inc": {"current_stock": -qty}})
            )

        # 2. Insert return document
        result = await db.returns.insert_one(return_doc)
        return_id = str(result.inserted_id)
        rollbacks.append((db.returns.delete_one, {"_id": ObjectId(return_id)}, None))

        # 3. Log stock movement
        stock_log_ids = []
        for item in calculated_items:
            product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
            after_stock = product.get("current_stock", 0) if product else 0
            before_stock = after_stock - item["quantity"]

            log_res = await db.stock_logs.insert_one({
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "type": "customer_return",
                "quantity": item["quantity"],
                "before_stock": before_stock,
                "after_stock": after_stock,
                "reference": note_number,
                "reference_id": return_id,
                "created_by": str(current_user["_id"]),
                "created_at": datetime.utcnow()
            })
            stock_log_ids.append(log_res.inserted_id)
        if stock_log_ids:
            rollbacks.append((db.stock_logs.delete_many, {"_id": {"$in": stock_log_ids}}, None))

        # 4. Update customer balance and insert ledger
        if data.party_id:
            # Reduce customer outstanding receivable balance
            await db.customers.update_one(
                {"_id": ObjectId(data.party_id)},
                {"$inc": {"current_balance": -balance}}
            )
            rollbacks.append(
                (db.customers.update_one, {"_id": ObjectId(data.party_id)}, {"$inc": {"current_balance": balance}})
            )

            ledger_res = await db.ledger.insert_one({
                "party_type": "customer",
                "party_id": data.party_id,
                "date": now,
                "type": "return",
                "debit": 0,
                "credit": balance,
                "balance": 0,  # dynamic running balance is loaded per-page
                "reference": note_number,
                "reference_id": return_id,
                "created_at": datetime.utcnow()
            })
            rollbacks.append((db.ledger.delete_one, {"_id": ledger_res.inserted_id}, None))

        # 5. Insert Audit Log
        await db.audit_logs.insert_one({
            "action": "RETURN_CREATED",
            "details": f"Customer Return Credit Note {note_number} created for customer '{customer_name}' worth ₹{total_amount:.2f}",
            "reference_id": return_id,
            "created_by": str(current_user["_id"]),
            "created_by_name": current_user.get("full_name", ""),
            "created_at": datetime.utcnow()
        })

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
        raise HTTPException(status_code=500, detail=f"Return transaction failed: {str(e)}")

    return {
        "message": "Credit note generated successfully",
        "id": return_id,
        "note_number": note_number,
        "total_amount": total_amount
    }

@router.post("/supplier")
async def create_supplier_return(
    data: ReturnCreate,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_create_purchases"))
):
    if data.type != "supplier":
        raise HTTPException(status_code=400, detail="Invalid return type for supplier endpoint")

    supplier = await db.suppliers.find_one({"_id": ObjectId(data.party_id)})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    supplier_name = supplier["name"]

    is_igst = False
    gst_settings = await db.settings.find_one({"type": "company"}) or {}
    comp_gst = gst_settings.get("gstin", "")
    supp_gst = supplier.get("gstin", "")
    if comp_gst and supp_gst and comp_gst[:2] != supp_gst[:2]:
        is_igst = True

    # Validate stock availability across batches first
    for item in data.items:
        batch_no = item.batch_no or "DEFAULT"
        product = await db.products.find_one({"_id": ObjectId(item.product_id)})
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        
        batch = await db.batches.find_one({"product_id": item.product_id, "batch_no": batch_no})
        batch_stock = batch.get("current_stock", 0) if batch else 0
        if batch_stock < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock in batch '{batch_no}' of product '{product['name']}'. Available: {batch_stock}"
            )

    calculated_items = calculate_return_gst(data.items, is_igst)

    subtotal = sum(i["taxable_amount"] for i in calculated_items)
    total_cgst = sum(i["cgst_amount"] for i in calculated_items)
    total_sgst = sum(i["sgst_amount"] for i in calculated_items)
    total_igst = sum(i["igst_amount"] for i in calculated_items)
    total_tax = total_cgst + total_sgst + total_igst
    total_amount = round(subtotal + total_tax, 2)
    balance = round(total_amount - data.paid_amount, 2)

    note_number = await get_next_note_number(db, "DN", tenant_id=current_user.get("tenant_id", ""))
    now = data.date or datetime.utcnow()

    return_doc = {
        "note_number": note_number,
        "type": "supplier",
        "party_id": data.party_id,
        "party_name": supplier_name,
        "reference_id": data.reference_id,
        "items": calculated_items,
        "subtotal": round(subtotal, 2),
        "total_cgst": round(total_cgst, 2),
        "total_sgst": round(total_sgst, 2),
        "total_igst": round(total_igst, 2),
        "total_tax": round(total_tax, 2),
        "total_amount": total_amount,
        "paid_amount": data.paid_amount,
        "balance_amount": balance,
        "notes": data.notes,
        "date": now,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": datetime.utcnow()
    }

    rollbacks = []
    try:
        # 1. Update stock and batches atomically (Supplier return decreases stock)
        for item in calculated_items:
            qty = item["quantity"]
            batch_no = item.get("batch_no") or "DEFAULT"
            
            # Decrement product stock
            res_prod = await db.products.update_one(
                {"_id": ObjectId(item["product_id"]), "current_stock": {"$gte": qty}},
                {"$inc": {"current_stock": -qty}}
            )
            if res_prod.modified_count == 0:
                raise HTTPException(status_code=400, detail=f"Insufficient overall stock for '{item['product_name']}'")
            rollbacks.append(
                (db.products.update_one, {"_id": ObjectId(item["product_id"])}, {"$inc": {"current_stock": qty}})
            )

            # Decrement batch stock
            res_batch = await db.batches.update_one(
                {"product_id": item["product_id"], "batch_no": batch_no, "current_stock": {"$gte": qty}},
                {"$inc": {"current_stock": -qty}}
            )
            if res_batch.modified_count == 0:
                raise HTTPException(status_code=400, detail=f"Insufficient stock in batch '{batch_no}' of product '{item['product_name']}'")
            rollbacks.append(
                (db.batches.update_one, {"product_id": item["product_id"], "batch_no": batch_no}, {"$inc": {"current_stock": qty}})
            )

        # 2. Insert return document
        result = await db.returns.insert_one(return_doc)
        return_id = str(result.inserted_id)
        rollbacks.append((db.returns.delete_one, {"_id": ObjectId(return_id)}, None))

        # 3. Log stock movement
        stock_log_ids = []
        for item in calculated_items:
            product = await db.products.find_one({"_id": ObjectId(item["product_id"])})
            after_stock = product.get("current_stock", 0) if product else 0
            before_stock = after_stock + item["quantity"]

            log_res = await db.stock_logs.insert_one({
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "type": "supplier_return",
                "quantity": -item["quantity"],
                "before_stock": before_stock,
                "after_stock": after_stock,
                "reference": note_number,
                "reference_id": return_id,
                "created_by": str(current_user["_id"]),
                "created_at": datetime.utcnow()
            })
            stock_log_ids.append(log_res.inserted_id)
        if stock_log_ids:
            rollbacks.append((db.stock_logs.delete_many, {"_id": {"$in": stock_log_ids}}, None))

        # 4. Update supplier balance and insert ledger
        # Reduce supplier outstanding payable balance
        await db.suppliers.update_one(
            {"_id": ObjectId(data.party_id)},
            {"$inc": {"current_balance": -balance}}
        )
        rollbacks.append(
            (db.suppliers.update_one, {"_id": ObjectId(data.party_id)}, {"$inc": {"current_balance": balance}})
        )

        ledger_res = await db.ledger.insert_one({
            "party_type": "supplier",
            "party_id": data.party_id,
            "date": now,
            "type": "return",
            "debit": balance,
            "credit": 0,
            "balance": 0,
            "reference": note_number,
            "reference_id": return_id,
            "created_at": datetime.utcnow()
        })
        rollbacks.append((db.ledger.delete_one, {"_id": ledger_res.inserted_id}, None))

        # 5. Insert Audit Log
        await db.audit_logs.insert_one({
            "action": "RETURN_CREATED",
            "details": f"Supplier Return Debit Note {note_number} created for supplier '{supplier_name}' worth ₹{total_amount:.2f}",
            "reference_id": return_id,
            "created_by": str(current_user["_id"]),
            "created_by_name": current_user.get("full_name", ""),
            "created_at": datetime.utcnow()
        })

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
        raise HTTPException(status_code=500, detail=f"Return transaction failed: {str(e)}")

    return {
        "message": "Debit note generated successfully",
        "id": return_id,
        "note_number": note_number,
        "total_amount": total_amount
    }

@router.get("/{return_id}/pdf")
async def get_return_pdf(
    return_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    ret = await db.returns.find_one({"_id": ObjectId(return_id)})
    if not ret:
        raise HTTPException(status_code=404, detail="Return not found")

    ret_data = serialize_doc(ret)
    settings_doc = await db.settings.find_one({"type": "company"}) or {}
    
    from app.services.pdf_service import generate_return_note
    pdf_path = await generate_return_note(ret_data, serialize_doc(settings_doc))

    filename = f"CreditNote-{ret['note_number']}.pdf" if ret['type'] == 'customer' else f"DebitNote-{ret['note_number']}.pdf"

    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=filename
    )
