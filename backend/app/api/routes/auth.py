from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta
from app.core.database import get_database
from app.core.security import (
    verify_password, get_password_hash, create_access_token,
    create_refresh_token, get_current_active_user, require_admin, serialize_doc
)
from app.core.config import settings
from app.models.user import UserCreate, Token
from datetime import datetime
from pydantic import BaseModel
from jose import JWTError, jwt

router = APIRouter()

class TokenRefreshRequest(BaseModel):
    refresh_token: str

@router.post("/token", response_model=Token)
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db = Depends(get_database)
):
    user = await db.users.find_one({"username": form_data.username})
    if not user or not verify_password(form_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.get("is_active", False):
        raise HTTPException(
            status_code=400,
            detail="Your account is inactive. Please ask your administrator to activate it."
        )

    access_token = create_access_token(
        data={
            "sub": user["username"],
            "id": str(user["_id"]),
            "tenant_id": user.get("tenant_id"),
            "role": user.get("role"),
            "permissions": user.get("permissions", {})
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    refresh_token = create_refresh_token(data={"sub": user["username"]})

    # Update last login
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )

    user_data = serialize_doc(user)
    user_data.pop("password", None)

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_data
    }

@router.post("/refresh", response_model=Token)
async def refresh_token_endpoint(
    refresh_req: TokenRefreshRequest,
    db = Depends(get_database)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            refresh_req.refresh_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")
        token_type: str = payload.get("type")
        if username is None or token_type != "refresh":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await db.users.find_one({"username": username, "is_active": True})
    if user is None:
        raise credentials_exception

    access_token = create_access_token(
        data={
            "sub": user["username"],
            "id": str(user["_id"]),
            "tenant_id": user.get("tenant_id"),
            "role": user.get("role"),
            "permissions": user.get("permissions", {})
        },
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    new_refresh_token = create_refresh_token(data={"sub": user["username"]})

    user_data = serialize_doc(user)
    user_data.pop("password", None)

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "user": user_data
    }

@router.post("/register")
async def register_user(
    user_data: UserCreate,
    db = Depends(get_database)
):
    import random
    import string

    existing = await db.users.find_one({"username": user_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed_password = get_password_hash(user_data.password)
    
    company_code = user_data.company_code.strip() if user_data.company_code else None

    if not company_code:
        requested_role = "admin"
        is_active = True
        # Generate a unique 6-character uppercase alphanumeric Company Code (tenant_id)
        while True:
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            code_exists = await db.users.find_one({"tenant_id": code})
            if not code_exists:
                tenant_id = code
                break
    else:
        requested_role = "staff"
        is_active = False
        tenant_id = company_code.upper()
        # Look up admin user with matching tenant_id
        admin_exists = await db.users.find_one({"tenant_id": tenant_id, "role": "admin"})
        if not admin_exists:
            raise HTTPException(status_code=400, detail="Invalid Company Code. No business found with this code.")

    new_user = {
        "username": user_data.username,
        "password": hashed_password,
        "full_name": user_data.full_name,
        "role": requested_role,
        "tenant_id": tenant_id,
        "is_active": is_active,
        "created_at": datetime.utcnow(),
        "last_login": None
    }

    if requested_role == "staff":
        new_user["permissions"] = {
            "can_view_products": True,
            "can_manage_products": False,
            "can_create_sales": True,
            "can_view_sales": True,
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

    if requested_role == "admin":
        # Create default settings for this specific tenant/company
        company_name = f"{user_data.full_name}'s Business"
        await db.settings.update_one(
            {"tenant_id": tenant_id, "type": "company"},
            {"$setOnInsert": {
                "tenant_id": tenant_id,
                "type": "company",
                "company_name": company_name,
                "gstin": "",
                "address": "",
                "mobile": "",
                "email": "",
                "state": "Uttar Pradesh",
                "state_code": "09",
                "created_at": datetime.utcnow()
            }},
            upsert=True
        )

    return {
        "message": f"User created successfully as {requested_role}", 
        "id": str(result.inserted_id),
        "role": requested_role,
        "company_code": tenant_id
    }

@router.get("/setup-status")
async def get_setup_status(db = Depends(get_database)):
    user_count = await db.users.count_documents({})
    return {"need_setup": user_count == 0}

@router.get("/me")
async def get_me(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    user = await db.users.find_one({"_id": current_user["_id"]})
    if not user:
        user = current_user
    user_data = serialize_doc(user)
    user_data.pop("password", None)
    return user_data

@router.post("/logout")
async def logout(current_user = Depends(get_current_active_user)):
    return {"message": "Logged out successfully"}
