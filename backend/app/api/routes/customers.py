from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc
from app.models.party import CustomerCreate, CustomerUpdate
from bson import ObjectId
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.get("/")
async def list_customers(
    search: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(True),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {}
    if is_active is not None:
        query["is_active"] = is_active
    if search:
        import re
        escaped_search = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": f"(^|\\s){escaped_search}", "$options": "i"}},
            {"mobile": {"$regex": f"^{escaped_search}", "$options": "i"}},
            {"gstin": {"$regex": f"^{escaped_search}", "$options": "i"}},
        ]

    total = await db.customers.count_documents(query)
    skip = (page - 1) * limit
    customers = await db.customers.find(query).skip(skip).limit(limit).sort("name", 1).to_list(limit)
    return {"items": [serialize_doc(c) for c in customers], "total": total}

@router.get("/outstanding")
async def outstanding_customers(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    """Customers with outstanding balances."""
    customers = await db.customers.find(
        {"current_balance": {"$gt": 0}, "is_active": True}
    ).sort("current_balance", -1).limit(100).to_list(100)
    return [serialize_doc(c) for c in customers]

@router.get("/{customer_id}")
async def get_customer(
    customer_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return serialize_doc(customer)

@router.post("/")
async def create_customer(
    data: CustomerCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    now = datetime.utcnow()
    customer_dict = data.dict()
    customer_dict["current_balance"] = data.opening_balance
    customer_dict["created_at"] = now
    customer_dict["updated_at"] = now
    customer_dict["created_by"] = str(current_user["_id"])

    if data.address:
        customer_dict["address"] = data.address.dict()

    result = await db.customers.insert_one(customer_dict)

    # Log opening balance
    if data.opening_balance != 0:
        await db.ledger.insert_one({
            "party_type": "customer",
            "party_id": str(result.inserted_id),
            "date": now,
            "type": "opening",
            "debit": data.opening_balance if data.opening_balance > 0 else 0,
            "credit": abs(data.opening_balance) if data.opening_balance < 0 else 0,
            "balance": data.opening_balance,
            "reference": "Opening Balance",
            "created_at": now
        })

    return {"message": "Customer created", "id": str(result.inserted_id)}

@router.put("/{customer_id}")
async def update_customer(
    customer_id: str,
    data: CustomerUpdate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    update_dict = {k: v for k, v in data.dict().items() if v is not None}
    if data.address:
        update_dict["address"] = data.address.dict()
    update_dict["updated_at"] = datetime.utcnow()

    result = await db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    return {"message": "Customer updated"}

@router.delete("/{customer_id}")
async def delete_customer(
    customer_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    await db.customers.update_one(
        {"_id": ObjectId(customer_id)},
        {"$set": {"is_active": False}}
    )
    return {"message": "Customer deleted"}

@router.get("/{customer_id}/ledger")
async def customer_ledger(
    customer_id: str,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {"party_type": "customer", "party_id": customer_id}
    if from_date:
        query.setdefault("date", {})["$gte"] = datetime.fromisoformat(from_date)
    if to_date:
        query.setdefault("date", {})["$lte"] = datetime.fromisoformat(to_date)

    entries = await db.ledger.find(query).sort("date", 1).to_list(10000)
    customer = await db.customers.find_one({"_id": ObjectId(customer_id)})

    return {
        "customer": serialize_doc(customer),
        "entries": [serialize_doc(e) for e in entries]
    }

@router.get("/{customer_id}/transactions")
async def customer_transactions(
    customer_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    skip = (page - 1) * limit
    sales = await db.sales.find(
        {"customer_id": customer_id, "sale_type": "sale"}
    ).sort("sale_date", -1).skip(skip).limit(limit).to_list(limit)

    total = await db.sales.count_documents({"customer_id": customer_id, "sale_type": "sale"})
    return {"items": [serialize_doc(s) for s in sales], "total": total}
