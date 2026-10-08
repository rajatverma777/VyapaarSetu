from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc
from app.models.transaction import PaymentCreate
from bson import ObjectId
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.get("/")
async def list_payments(
    party_type: Optional[str] = Query(None),
    party_id: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {}
    if party_type:
        query["party_type"] = party_type
    if party_id:
        query["party_id"] = party_id
    if from_date or to_date:
        query["payment_date"] = {}
        if from_date:
            query["payment_date"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["payment_date"]["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")

    total = await db.payments.count_documents(query)
    skip = (page - 1) * limit
    payments = await db.payments.find(query).sort("payment_date", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [serialize_doc(p) for p in payments], "total": total}

from app.services.payment_service import PaymentService

@router.post("/")
async def create_payment(
    data: PaymentCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    service = PaymentService(db, current_user.get("tenant_id", ""))
    res = await service.record_payment(
        party_id=data.party_id,
        party_type=data.party_type,
        amount=data.amount,
        payment_mode=data.payment_mode,
        reference_type="voucher",
        reference_id=data.reference_no,
        notes=data.notes,
        payment_date=data.payment_date,
        current_user=current_user
    )
    return {"message": "Payment recorded", "id": res.get("id", str(res.get("_id", "")))}
