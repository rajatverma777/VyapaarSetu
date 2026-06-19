from fastapi import APIRouter, Depends, HTTPException
from app.core.database import get_database
from app.core.security import get_current_active_user, require_admin, serialize_doc, require_permission
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter()

class CompanySettings(BaseModel):
    company_name: str
    gstin: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    invoice_prefix: str = "INV"
    invoice_terms: Optional[str] = None
    invoice_footer: Optional[str] = None

@router.get("/company")
async def get_company_settings(
    db = Depends(get_database),
    current_user = Depends(get_current_active_user)
):
    settings = await db.settings.find_one({"type": "company"})
    return serialize_doc(settings) if settings else {}

@router.put("/company")
async def update_company_settings(
    data: CompanySettings,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_settings"))
):
    await db.settings.update_one(
        {"type": "company"},
        {"$set": {**data.dict(), "type": "company", "updated_at": datetime.utcnow()}},
        upsert=True
    )
    return {"message": "Settings updated"}

@router.get("/units")
async def get_units(db = Depends(get_database), current_user = Depends(get_current_active_user)):
    units = await db.units.find({}).sort("name", 1).to_list(100)
    if not units:
        defaults = ["PCS", "KG", "G", "LTR", "ML", "MTR", "CM", "BOX", "PKT", "DOZEN", "PAIR", "SET"]
        return [{"name": u, "id": u} for u in defaults]
    return [serialize_doc(u) for u in units]

@router.post("/units")
async def add_unit(
    name: str,
    db = Depends(get_database),
    current_user = Depends(require_permission("can_manage_settings"))
):
    await db.units.update_one({"name": name.upper()}, {"$setOnInsert": {"name": name.upper()}}, upsert=True)
    return {"message": "Unit added"}
