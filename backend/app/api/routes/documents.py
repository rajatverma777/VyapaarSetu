"""
Documents API — Company Letterhead / Printable Document System
Production-grade CRUD with auto-reference, PDF export, version tracking.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from app.core.database import get_database
from app.core.security import get_current_active_user, require_permission, serialize_doc
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
from bson import ObjectId
import os

router = APIRouter()


# ── Pydantic Models ──────────────────────────────────────────────────────────

class MarginConfig(BaseModel):
    top: float = 25.0
    right: float = 20.0
    bottom: float = 25.0
    left: float = 20.0


class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=300)
    customer_name: Optional[str] = None
    subject: str = Field(..., min_length=1, max_length=500)
    content: str = ""
    date: Optional[datetime] = None
    status: Literal["draft", "final", "archived"] = "draft"
    paper_size: Literal["A4", "A5", "Letter"] = "A4"
    show_header: bool = True
    show_footer: bool = True
    show_watermark: bool = True
    show_signature: bool = True
    show_page_numbers: bool = True
    is_confidential: bool = False
    footer_notes: Optional[str] = None
    margin_top: float = 25.0
    margin_right: float = 20.0
    margin_bottom: float = 25.0
    margin_left: float = 20.0
    font_size: int = 10


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    customer_name: Optional[str] = None
    subject: Optional[str] = None
    content: Optional[str] = None
    date: Optional[datetime] = None
    status: Optional[Literal["draft", "final", "archived"]] = None
    paper_size: Optional[str] = None
    show_header: Optional[bool] = None
    show_footer: Optional[bool] = None
    show_watermark: Optional[bool] = None
    show_signature: Optional[bool] = None
    show_page_numbers: Optional[bool] = None
    is_confidential: Optional[bool] = None
    footer_notes: Optional[str] = None
    margin_top: Optional[float] = None
    margin_right: Optional[float] = None
    margin_bottom: Optional[float] = None
    margin_left: Optional[float] = None
    font_size: Optional[int] = None


# ── Reference Number Generator ────────────────────────────────────────────────

async def get_next_doc_reference(db, prefix: str = "DOC") -> str:
    year = datetime.utcnow().strftime("%Y")
    counter_key = f"{prefix}-{year}"
    result = await db.counters.find_one_and_update(
        {"_id": counter_key},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = result["seq"]
    return f"{prefix}-{year}-{seq:05d}"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/")
async def list_documents(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    query: dict = {}

    if status:
        query["status"] = status

    if from_date or to_date:
        query["date"] = {}
        if from_date:
            query["date"]["$gte"] = datetime.fromisoformat(from_date)
        if to_date:
            query["date"]["$lte"] = datetime.fromisoformat(to_date + "T23:59:59")

    if search:
        query["$or"] = [
            {"reference": {"$regex": search, "$options": "i"}},
            {"title": {"$regex": search, "$options": "i"}},
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"subject": {"$regex": search, "$options": "i"}},
        ]

    total = await db.documents.count_documents(query)
    skip = (page - 1) * limit
    docs = (
        await db.documents.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(limit)
    )

    return {
        "items": [serialize_doc(d) for d in docs],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
    }


@router.post("/")
async def create_document(
    data: DocumentCreate,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    # Fetch document prefix from settings
    settings_doc = await db.settings.find_one({"type": "company"}) or {}
    prefix = settings_doc.get("document_prefix", "DOC")
    reference = await get_next_doc_reference(db, prefix)

    now = datetime.utcnow()
    doc = {
        **data.dict(),
        "reference": reference,
        "date": data.date or now,
        "print_count": 0,
        "pdf_download_count": 0,
        "last_printed": None,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": now,
        "updated_at": now,
        "version": 1,
        "version_history": [],
    }

    result = await db.documents.insert_one(doc)
    return {
        "message": "Document created",
        "id": str(result.inserted_id),
        "reference": reference,
    }


@router.get("/{doc_id}")
async def get_document(
    doc_id: str,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return serialize_doc(doc)


@router.put("/{doc_id}")
async def update_document(
    doc_id: str,
    data: DocumentUpdate,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    update_fields = {k: v for k, v in data.dict().items() if v is not None}
    update_fields["updated_at"] = datetime.utcnow()

    # Archive previous version for history
    version_entry = {
        "version": doc.get("version", 1),
        "content": doc.get("content", ""),
        "title": doc.get("title", ""),
        "saved_at": datetime.utcnow(),
        "saved_by": current_user.get("full_name", ""),
    }

    await db.documents.update_one(
        {"_id": ObjectId(doc_id)},
        {
            "$set": update_fields,
            "$inc": {"version": 1},
            "$push": {
                "version_history": {
                    "$each": [version_entry],
                    "$slice": -20,  # Keep last 20 versions
                }
            },
        },
    )
    return {"message": "Document updated"}


@router.delete("/{doc_id}")
async def delete_document(
    doc_id: str,
    db=Depends(get_database),
    current_user=Depends(require_permission("can_manage_settings")),
):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    # Soft delete — archive instead of physical delete
    await db.documents.update_one(
        {"_id": ObjectId(doc_id)},
        {"$set": {"status": "archived", "updated_at": datetime.utcnow()}},
    )
    return {"message": "Document archived"}


@router.post("/{doc_id}/duplicate")
async def duplicate_document(
    doc_id: str,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    settings_doc = await db.settings.find_one({"type": "company"}) or {}
    prefix = settings_doc.get("document_prefix", "DOC")
    reference = await get_next_doc_reference(db, prefix)

    now = datetime.utcnow()
    new_doc = {
        k: v
        for k, v in doc.items()
        if k not in ("_id", "reference", "print_count", "pdf_download_count",
                     "last_printed", "created_at", "updated_at", "created_by",
                     "created_by_name", "version", "version_history")
    }
    new_doc.update({
        "reference": reference,
        "title": f"Copy of {doc.get('title', '')}",
        "status": "draft",
        "print_count": 0,
        "pdf_download_count": 0,
        "last_printed": None,
        "created_by": str(current_user["_id"]),
        "created_by_name": current_user.get("full_name", ""),
        "created_at": now,
        "updated_at": now,
        "version": 1,
        "version_history": [],
    })

    result = await db.documents.insert_one(new_doc)
    return {
        "message": "Document duplicated",
        "id": str(result.inserted_id),
        "reference": reference,
    }


@router.post("/{doc_id}/record-print")
async def record_print(
    doc_id: str,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    await db.documents.update_one(
        {"_id": ObjectId(doc_id)},
        {
            "$inc": {"print_count": 1},
            "$set": {"last_printed": datetime.utcnow()},
        },
    )
    return {"message": "Print recorded"}


@router.post("/{doc_id}/record-pdf-download")
async def record_pdf_download(
    doc_id: str,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    await db.documents.update_one(
        {"_id": ObjectId(doc_id)},
        {"$inc": {"pdf_download_count": 1}},
    )
    return {"message": "PDF download recorded"}


@router.get("/{doc_id}/pdf")
async def get_document_pdf(
    doc_id: str,
    db=Depends(get_database),
    current_user=Depends(get_current_active_user),
):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    settings_doc = await db.settings.find_one({"type": "company"}) or {}
    doc_data = serialize_doc(doc)
    settings_data = serialize_doc(settings_doc)

    from app.services.pdf_service import generate_letterhead_pdf
    pdf_path = await generate_letterhead_pdf(doc_data, settings_data)

    # Increment download counter (fire and forget)
    await db.documents.update_one(
        {"_id": ObjectId(doc_id)},
        {"$inc": {"pdf_download_count": 1}},
    )

    ref = doc.get("reference", doc_id)
    return FileResponse(
        pdf_path,
        media_type="application/pdf",
        filename=f"Letter-{ref}.pdf",
    )
