from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_database
from app.core.security import (
    get_password_hash, get_current_active_user, require_admin, serialize_doc
)
from app.models.user import UserCreate, UserUpdate, UserPasswordChange
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.get("/")
async def list_users(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    users = await db.users.find({"tenant_id": current_user.get("tenant_id")}).to_list(1000)
    result = [serialize_doc(u) for u in users]
    for u in result:
        u.pop("password", None)
    return result

@router.post("/")
async def create_user(
    user_data: UserCreate,
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = get_password_hash(user_data.password)
    new_user = {
        "username": user_data.username,
        "password": hashed_password,
        "full_name": user_data.full_name,
        "role": user_data.role,
        "tenant_id": current_user.get("tenant_id"),
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login": None
    }
    
    if user_data.role == "staff":
        new_user["permissions"] = {
            "can_view_products": True,
            "can_manage_products": False,
            "can_create_sales": True,
            "can_view_sales": False,
            "can_create_purchases": False,
            "can_view_purchases": False,
            "can_manage_settings": False
        }

    email_val = user_data.email.strip() if user_data.email else None
    if email_val:
        new_user["email"] = email_val
        
    mobile_val = user_data.mobile.strip() if user_data.mobile else None
    if mobile_val:
        new_user["mobile"] = mobile_val

    result = await db.users.insert_one(new_user)
    return {"message": "User created", "id": str(result.inserted_id)}

@router.put("/profile")
async def update_profile(
    user_data: UserUpdate,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    update_data = {}
    unset_data = {}
    
    # Only allow updating full_name, email, and mobile for personal profile
    if user_data.full_name is not None:
        update_data["full_name"] = user_data.full_name
        
    for k in ["email", "mobile"]:
        val = getattr(user_data, k, None)
        if val is not None:
            val_str = val.strip()
            if not val_str:
                unset_data[k] = ""
            else:
                update_data[k] = val_str
                
    update_op = {}
    if update_data:
        update_op["$set"] = update_data
    if unset_data:
        update_op["$unset"] = unset_data
        
    if not update_op:
        raise HTTPException(status_code=400, detail="No data to update")
        
    await db.users.update_one(
        {"_id": current_user["_id"]},
        update_op
    )
    return {"message": "Profile updated"}

@router.put("/{user_id}")
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    # Ensure the target user belongs to the same tenant!
    user = await db.users.find_one({"_id": ObjectId(user_id), "tenant_id": current_user.get("tenant_id")})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    update_data = {}
    unset_data = {}
    
    for k, v in user_data.dict(exclude_unset=True).items():
        if k in ["email", "mobile"]:
            val = v.strip() if v else None
            if not val:
                unset_data[k] = ""
            else:
                update_data[k] = val
        elif v is not None:
            update_data[k] = v
            
    update_op = {}
    if update_data:
        update_op["$set"] = update_data
    if unset_data:
        update_op["$unset"] = unset_data
        
    if not update_op:
        raise HTTPException(status_code=400, detail="No data to update")

    result = await db.users.update_one(
        {"_id": ObjectId(user_id), "tenant_id": current_user.get("tenant_id")},
        update_op
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User updated"}

@router.post("/change-password")
async def change_password(
    data: UserPasswordChange,
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    from app.core.security import verify_password
    if not verify_password(data.old_password, current_user["password"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    hashed = get_password_hash(data.new_password)
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"password": hashed}}
    )
    return {"message": "Password changed successfully"}

@router.delete("/{user_id}")
async def delete_user(
    user_id: str,
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    if str(current_user["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    # Ensure target user belongs to the same tenant!
    result = await db.users.delete_one({"_id": ObjectId(user_id), "tenant_id": current_user.get("tenant_id")})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


