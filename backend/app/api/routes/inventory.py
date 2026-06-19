from fastapi import APIRouter, Depends, HTTPException, Query
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc
from bson import ObjectId
from datetime import datetime
from typing import Optional
from pydantic import BaseModel

router = APIRouter()

class StockAdjustment(BaseModel):
    product_id: str
    adjustment_type: str  # add, remove, set
    quantity: float
    reason: str = "Manual Adjustment"

@router.get("/stock-status")
async def get_stock_status(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    total_products = await db.products.count_documents({"is_active": True})
    low_stock = await db.products.count_documents({
        "is_active": True,
        "$expr": {"$lte": ["$current_stock", "$min_stock_alert"]}
    })
    out_of_stock = await db.products.count_documents({"is_active": True, "current_stock": {"$lte": 0}})
    pipeline = [
        {"$match": {"is_active": True}},
        {"$group": {
            "_id": None,
            "total_value": {"$sum": {"$multiply": ["$current_stock", "$purchase_price"]}}
        }}
    ]
    value_result = await db.products.aggregate(pipeline).to_list(1)
    total_value = value_result[0]["total_value"] if value_result else 0

    return {
        "total_products": total_products,
        "low_stock": low_stock,
        "out_of_stock": out_of_stock,
        "total_value": round(total_value, 2)
    }

@router.get("/low-stock")
async def get_low_stock_products(
    limit: int = Query(50),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    products = await db.products.find({
        "is_active": True,
        "$expr": {"$lte": ["$current_stock", "$min_stock_alert"]}
    }).sort("current_stock", 1).limit(limit).to_list(limit)
    return [serialize_doc(p) for p in products]

@router.get("/stock-logs")
async def get_stock_logs(
    product_id: Optional[str] = Query(None),
    log_type: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {}
    if product_id:
        query["product_id"] = product_id
    if log_type:
        query["type"] = log_type
    if from_date or to_date:
        query["created_at"] = {}
        if from_date:
            query["created_at"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["created_at"]["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")

    total = await db.stock_logs.count_documents(query)
    skip = (page - 1) * limit
    logs = await db.stock_logs.find(query).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    return {"items": [serialize_doc(l) for l in logs], "total": total}

@router.get("/batches")
async def get_batches(
    product_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    query = {}
    if product_id:
        query["product_id"] = product_id

    total = await db.batches.count_documents(query)
    skip = (page - 1) * limit
    batches = await db.batches.find(query).sort("expiry", 1).skip(skip).limit(limit).to_list(limit)

    resolved_batches = []
    for b in batches:
        b_doc = serialize_doc(b)
        try:
            prod = await db.products.find_one({"_id": ObjectId(b["product_id"])})
            if prod:
                b_doc["product_name"] = prod.get("name")
                b_doc["sku"] = prod.get("sku")
        except Exception:
            pass
        resolved_batches.append(b_doc)

    return {"items": resolved_batches, "total": total}

@router.post("/adjust")
async def adjust_stock(
    data: StockAdjustment,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    product = await db.products.find_one({"_id": ObjectId(data.product_id)})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    before_stock = product.get("current_stock", 0)

    if data.adjustment_type == "add":
        new_stock = before_stock + data.quantity
        change = data.quantity
    elif data.adjustment_type == "remove":
        new_stock = max(0, before_stock - data.quantity)
        change = -(before_stock - new_stock)
    elif data.adjustment_type == "set":
        new_stock = data.quantity
        change = new_stock - before_stock
    else:
        raise HTTPException(status_code=400, detail="Invalid adjustment type")

    await db.products.update_one(
        {"_id": ObjectId(data.product_id)},
        {"$set": {"current_stock": new_stock, "updated_at": datetime.utcnow()}}
    )

    # Sync manual adjustment with batches collection
    await db.batches.update_one(
        {"product_id": data.product_id, "batch_no": "DEFAULT"},
        {
            "$inc": {"current_stock": change},
            "$setOnInsert": {
                "created_at": datetime.utcnow(),
                "expiry": None,
                "purchase_price": product.get("purchase_price", 0.0)
            }
        },
        upsert=True
    )

    await db.stock_logs.insert_one({
        "product_id": data.product_id,
        "product_name": product["name"],
        "type": "adjustment",
        "quantity": change,
        "before_stock": before_stock,
        "after_stock": new_stock,
        "reference": data.reason,
        "created_by": str(current_user["_id"]),
        "created_at": datetime.utcnow()
    })

    return {"message": "Stock adjusted", "before": before_stock, "after": new_stock}
