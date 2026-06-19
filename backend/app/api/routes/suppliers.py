from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc
from app.models.party import SupplierCreate, SupplierUpdate
from bson import ObjectId
from datetime import datetime
from typing import Optional

router = APIRouter()

@router.get("/")
async def list_suppliers(
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
        ]

    total = await db.suppliers.count_documents(query)
    skip = (page - 1) * limit
    suppliers = await db.suppliers.find(query).skip(skip).limit(limit).sort("name", 1).to_list(limit)
    return {"items": [serialize_doc(s) for s in suppliers], "total": total}

@router.get("/{supplier_id}")
async def get_supplier(
    supplier_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    supplier = await db.suppliers.find_one({"_id": ObjectId(supplier_id)})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return serialize_doc(supplier)

@router.post("/")
async def create_supplier(
    data: SupplierCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    now = datetime.utcnow()
    supplier_dict = data.dict()
    supplier_dict["current_balance"] = data.opening_balance
    supplier_dict["created_at"] = now
    supplier_dict["updated_at"] = now
    supplier_dict["created_by"] = str(current_user["_id"])
    if data.address:
        supplier_dict["address"] = data.address.dict()

    result = await db.suppliers.insert_one(supplier_dict)
    return {"message": "Supplier created", "id": str(result.inserted_id)}

@router.put("/{supplier_id}")
async def update_supplier(
    supplier_id: str,
    data: SupplierUpdate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    update_dict = {k: v for k, v in data.dict().items() if v is not None}
    if data.address:
        update_dict["address"] = data.address.dict()
    update_dict["updated_at"] = datetime.utcnow()

    result = await db.suppliers.update_one(
        {"_id": ObjectId(supplier_id)},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return {"message": "Supplier updated"}

@router.delete("/{supplier_id}")
async def delete_supplier(
    supplier_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    await db.suppliers.update_one(
        {"_id": ObjectId(supplier_id)},
        {"$set": {"is_active": False}}
    )
    return {"message": "Supplier deleted"}

@router.get("/{supplier_id}/ledger")
async def supplier_ledger(
    supplier_id: str,
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {"party_type": "supplier", "party_id": supplier_id}
    if from_date:
        query.setdefault("date", {})["$gte"] = datetime.fromisoformat(from_date)
    if to_date:
        query.setdefault("date", {})["$lte"] = datetime.fromisoformat(to_date)

    entries = await db.ledger.find(query).sort("date", 1).to_list(10000)
    supplier = await db.suppliers.find_one({"_id": ObjectId(supplier_id)})
    return {
        "supplier": serialize_doc(supplier),
        "entries": [serialize_doc(e) for e in entries]
    }

@router.get("/{supplier_id}/purchases")
async def supplier_purchases(
    supplier_id: str,
    page: int = Query(1, ge=1),
    limit: int = Query(20),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    skip = (page - 1) * limit
    purchases = await db.purchases.find(
        {"supplier_id": supplier_id}
    ).sort("purchase_date", -1).skip(skip).limit(limit).to_list(limit)
    total = await db.purchases.count_documents({"supplier_id": supplier_id})
    return {"items": [serialize_doc(p) for p in purchases], "total": total}
