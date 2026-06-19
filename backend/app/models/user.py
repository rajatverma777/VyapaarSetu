from pydantic import BaseModel, EmailStr, Field
from typing import Optional, Literal
from datetime import datetime

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    full_name: str
    email: Optional[str] = None
    role: Literal["admin", "staff"] = "staff"
    mobile: Optional[str] = None
    company_name: Optional[str] = None
    company_code: Optional[str] = None

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    role: Optional[Literal["admin", "staff"]] = None
    is_active: Optional[bool] = None
    permissions: Optional[dict] = None

class UserPasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=6)

class UserResponse(BaseModel):
    id: str
    username: str
    full_name: str
    email: Optional[str]
    role: str
    mobile: Optional[str]
    is_active: bool
    created_at: datetime

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    user: dict

class TokenData(BaseModel):
    username: Optional[str] = None
