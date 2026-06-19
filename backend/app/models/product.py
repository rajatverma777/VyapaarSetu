from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[str] = None
    brand: Optional[str] = None
    unit: str = "PCS"
    hsn_code: Optional[str] = None
    gst_rate: float = Field(default=18.0, ge=0, le=100)
    purchase_price: float = Field(..., ge=0)
    selling_price: float = Field(..., ge=0)
    mrp: Optional[float] = None
    wholesale_price: Optional[float] = None
    min_price: Optional[float] = None
    opening_stock: float = Field(default=0, ge=0)
    min_stock_alert: float = Field(default=10, ge=0)
    description: Optional[str] = None
    is_active: bool = True
    pack: Optional[str] = None
    cases: Optional[float] = None
    final_amount: Optional[float] = None
    batch: Optional[str] = None
    expiry: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category_id: Optional[str] = None
    brand: Optional[str] = None
    unit: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_rate: Optional[float] = None
    purchase_price: Optional[float] = None
    selling_price: Optional[float] = None
    mrp: Optional[float] = None
    wholesale_price: Optional[float] = None
    min_price: Optional[float] = None
    min_stock_alert: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    pack: Optional[str] = None
    cases: Optional[float] = None
    final_amount: Optional[float] = None
    batch: Optional[str] = None
    expiry: Optional[str] = None

class ProductResponse(BaseModel):
    id: str
    name: str
    sku: Optional[str]
    barcode: Optional[str]
    category_id: Optional[str]
    category_name: Optional[str]
    brand: Optional[str]
    unit: str
    hsn_code: Optional[str]
    gst_rate: float
    purchase_price: float
    selling_price: float
    mrp: Optional[float]
    wholesale_price: Optional[float]
    min_price: Optional[float]
    current_stock: float
    min_stock_alert: float
    description: Optional[str]
    is_active: bool
    created_at: datetime
    pack: Optional[str] = None
    cases: Optional[float] = None
    final_amount: Optional[float] = None
    batch: Optional[str] = None
    expiry: Optional[str] = None


class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=1)
    description: Optional[str] = None

class CategoryResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    product_count: Optional[int] = 0

class BulkProductImport(BaseModel):
    products: List[ProductCreate]
