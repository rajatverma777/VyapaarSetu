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
from app.services.sale_service import SaleService

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
    service = SaleService(db, current_user.get("tenant_id", ""))
    return await service.create_sale(data, current_user)

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
