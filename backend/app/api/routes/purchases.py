from app.services.purchase_service import PurchaseService
from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc, require_permission
from app.models.transaction import PurchaseCreate
from bson import ObjectId
from datetime import datetime
from typing import Optional

router = APIRouter()

async def get_next_purchase_number(db, tenant_id: str = "") -> str:
    today = datetime.utcnow()
    year = today.strftime("%y")
    month = today.strftime("%m")
    # SECURITY: Prefix with tenant_id to isolate purchase sequences per company.
    counter_key = f"{tenant_id}-PUR-{year}{month}"
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
    service = PurchaseService(db, current_user.get("tenant_id", ""))
    return await service.create_purchase(data, current_user)
