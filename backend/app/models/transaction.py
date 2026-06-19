from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

class SaleItem(BaseModel):
    product_id: str
    product_name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    hsn_code: Optional[str] = None
    unit: str = "PCS"
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., ge=0)
    discount_percent: float = Field(default=0, ge=0, le=100)
    discount_amount: float = 0
    taxable_amount: float = 0
    gst_rate: float = 0
    cgst_rate: float = 0
    sgst_rate: float = 0
    igst_rate: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    total_amount: float = 0
    batch_no: Optional[str] = None
    expiry: Optional[datetime] = None

class SaleCreate(BaseModel):
    customer_id: Optional[str] = None
    customer_name: Optional[str] = "Walk-in Customer"
    sale_date: Optional[datetime] = None
    items: List[SaleItem]
    discount_percent: float = Field(default=0, ge=0, le=100)
    discount_amount: float = 0
    is_igst: bool = False  # Inter-state = IGST, else CGST+SGST
    payment_mode: Literal["cash", "credit", "upi", "card", "cheque", "neft"] = "cash"
    paid_amount: float = Field(default=0, ge=0)
    notes: Optional[str] = None
    sale_type: Literal["sale", "return"] = "sale"

class SaleResponse(BaseModel):
    id: str
    invoice_number: str
    customer_id: Optional[str]
    customer_name: str
    sale_date: datetime
    items: List[dict]
    subtotal: float
    discount_amount: float
    taxable_amount: float
    total_cgst: float
    total_sgst: float
    total_igst: float
    total_tax: float
    total_amount: float
    paid_amount: float
    balance_amount: float
    payment_mode: str
    status: str
    sale_type: str
    notes: Optional[str]
    created_by: str
    created_at: datetime

class PurchaseItem(BaseModel):
    product_id: str
    product_name: str
    hsn_code: Optional[str] = None
    unit: str = "PCS"
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., ge=0)
    discount_percent: float = Field(default=0, ge=0, le=100)
    gst_rate: float = 0
    taxable_amount: float = 0
    cgst_amount: float = 0
    sgst_amount: float = 0
    igst_amount: float = 0
    total_amount: float = 0
    batch_no: Optional[str] = "DEFAULT"
    expiry: Optional[datetime] = None

class PurchaseCreate(BaseModel):
    supplier_id: str
    invoice_number: Optional[str] = None
    purchase_date: Optional[datetime] = None
    items: List[PurchaseItem]
    is_igst: bool = False
    payment_mode: Literal["cash", "credit", "upi", "card", "cheque", "neft"] = "credit"
    paid_amount: float = Field(default=0, ge=0)
    notes: Optional[str] = None
    purchase_type: Literal["purchase", "return"] = "purchase"

class PurchaseResponse(BaseModel):
    id: str
    invoice_number: str
    supplier_id: str
    supplier_name: str
    purchase_date: datetime
    items: List[dict]
    subtotal: float
    discount_amount: float
    taxable_amount: float
    total_cgst: float
    total_sgst: float
    total_igst: float
    total_tax: float
    total_amount: float
    paid_amount: float
    balance_amount: float
    payment_mode: str
    status: str
    purchase_type: str
    notes: Optional[str]
    created_by: str
    created_at: datetime

class PaymentCreate(BaseModel):
    party_type: Literal["customer", "supplier"]
    party_id: str
    amount: float = Field(..., gt=0)
    payment_mode: Literal["cash", "upi", "card", "cheque", "neft"] = "cash"
    reference_no: Optional[str] = None
    payment_date: Optional[datetime] = None
    notes: Optional[str] = None
    against_invoice: Optional[str] = None  # invoice id
