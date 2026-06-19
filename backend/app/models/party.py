from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class Address(BaseModel):
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1)
    mobile: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[Address] = None
    credit_limit: float = Field(default=0, ge=0)
    opening_balance: float = Field(default=0)
    price_level: str = "retail"  # retail, wholesale, distributor
    is_active: bool = True

class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[Address] = None
    credit_limit: Optional[float] = None
    price_level: Optional[str] = None
    is_active: Optional[bool] = None

class CustomerResponse(BaseModel):
    id: str
    name: str
    mobile: Optional[str]
    email: Optional[str]
    gstin: Optional[str]
    address: Optional[dict]
    credit_limit: float
    current_balance: float
    price_level: str
    is_active: bool
    created_at: datetime

class SupplierCreate(BaseModel):
    name: str = Field(..., min_length=1)
    mobile: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[Address] = None
    opening_balance: float = Field(default=0)
    is_active: bool = True

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    address: Optional[Address] = None
    is_active: Optional[bool] = None

class SupplierResponse(BaseModel):
    id: str
    name: str
    mobile: Optional[str]
    email: Optional[str]
    gstin: Optional[str]
    address: Optional[dict]
    current_balance: float
    is_active: bool
    created_at: datetime
