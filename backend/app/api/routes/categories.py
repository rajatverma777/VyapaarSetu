from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_database
from app.core.security import get_current_active_user, serialize_doc
from app.models.product import CategoryCreate
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/")
async def list_categories(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    categories = await db.categories.find({"is_active": {"$ne": False}}).sort("name", 1).to_list(1000)
    result = []
    for cat in categories:
        doc = serialize_doc(cat)
        doc["product_count"] = await db.products.count_documents(
            {"category_id": str(cat["_id"]), "is_active": True}
        )
        result.append(doc)
    return result

@router.post("/")
async def create_category(
    data: CategoryCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    existing = await db.categories.find_one({"name": {"$regex": f"^{data.name}$", "$options": "i"}})
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")

    result = await db.categories.insert_one({
        "name": data.name,
        "description": data.description,
        "is_active": True,
        "created_at": datetime.utcnow()
    })
    return {"message": "Category created", "id": str(result.inserted_id)}

@router.put("/{cat_id}")
async def update_category(
    cat_id: str,
    data: CategoryCreate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    result = await db.categories.update_one(
        {"_id": ObjectId(cat_id)},
        {"$set": {"name": data.name, "description": data.description}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category updated"}

@router.delete("/{cat_id}")
async def delete_category(
    cat_id: str,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    count = await db.products.count_documents({"category_id": cat_id, "is_active": True})
    if count > 0:
        raise HTTPException(status_code=400, detail=f"Category has {count} active products")
    await db.categories.update_one(
        {"_id": ObjectId(cat_id)}, {"$set": {"is_active": False}}
    )
    return {"message": "Category deleted"}
