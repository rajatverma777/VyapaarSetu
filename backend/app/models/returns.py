from pydantic import BaseModel, Field
from typing import Optional, List, Literal
from datetime import datetime

class ReturnItem(BaseModel):
    product_id: str
    product_name: str
    quantity: float = Field(..., gt=0)
    rate: float = Field(..., ge=0)
    gst_rate: float = Field(default=0.0, ge=0, le=100)
    batch_no: Optional[str] = "DEFAULT"
    expiry: Optional[str] = None
    reason: str = Field(..., min_length=1)

class ReturnCreate(BaseModel):
    type: Literal["customer", "supplier"]
    party_id: str
    reference_id: Optional[str] = None
    items: List[ReturnItem]
    paid_amount: float = Field(default=0.0, ge=0)
    notes: Optional[str] = None
    date: Optional[datetime] = None
