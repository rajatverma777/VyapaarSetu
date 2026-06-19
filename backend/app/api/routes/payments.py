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

@router.post("/")
async def create_payment(
    data: PaymentCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    now = data.payment_date or datetime.utcnow()

    # Verify party exists
    collection = db.customers if data.party_type == "customer" else db.suppliers
    party = await collection.find_one({"_id": ObjectId(data.party_id)})
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    # Save payment
    payment_doc = {
        "party_type": data.party_type,
        "party_id": data.party_id,
        "party_name": party["name"],
        "amount": data.amount,
        "payment_mode": data.payment_mode,
        "reference_no": data.reference_no,
        "payment_date": now,
        "notes": data.notes,
        "against_invoice": data.against_invoice,
        "created_by": str(current_user["_id"]),
        "created_at": datetime.utcnow()
    }
    result = await db.payments.insert_one(payment_doc)

    # Update balance
    if data.party_type == "customer":
        await db.customers.update_one(
            {"_id": ObjectId(data.party_id)},
            {"$inc": {"current_balance": -data.amount}}
        )
    else:
        await db.suppliers.update_one(
            {"_id": ObjectId(data.party_id)},
            {"$inc": {"current_balance": -data.amount}}
        )

    # Ledger entry
    await db.ledger.insert_one({
        "party_type": data.party_type,
        "party_id": data.party_id,
        "date": now,
        "type": "payment" if data.party_type == "customer" else "receipt",
        "debit": 0 if data.party_type == "customer" else data.amount,
        "credit": data.amount if data.party_type == "customer" else 0,
        "balance": 0,
        "reference": f"Payment - {data.payment_mode.upper()} - {data.reference_no or ''}",
        "reference_id": str(result.inserted_id),
        "created_at": datetime.utcnow()
    })

    return {"message": "Payment recorded", "id": str(result.inserted_id)}
