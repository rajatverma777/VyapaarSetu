from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
from datetime import datetime
from app.repositories.base import BaseRepository

class CustomerRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "customers")

    async def update_balance(
        self,
        customer_id: Union[str, ObjectId],
        delta: float,
        session=None
    ) -> float:
        if not customer_id:
            return 0.0
        oid = self._to_object_id(customer_id)
        lookup_id = oid if oid is not None else customer_id
        query = self._scope_query({"_id": lookup_id})
        kwargs = {"session": session} if session else {}
        doc = await self.collection.find_one_and_update(
            query,
            {"$inc": {"current_balance": delta}, "$set": {"updated_at": datetime.utcnow()}},
            return_document=True,
            **kwargs
        )
        return doc.get("current_balance", 0.0) if doc else 0.0


class SupplierRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "suppliers")

    async def update_balance(
        self,
        supplier_id: Union[str, ObjectId],
        delta: float,
        session=None
    ) -> float:
        if not supplier_id:
            return 0.0
        oid = self._to_object_id(supplier_id)
        lookup_id = oid if oid is not None else supplier_id
        query = self._scope_query({"_id": lookup_id})
        kwargs = {"session": session} if session else {}
        doc = await self.collection.find_one_and_update(
            query,
            {"$inc": {"current_balance": delta}, "$set": {"updated_at": datetime.utcnow()}},
            return_document=True,
            **kwargs
        )
        return doc.get("current_balance", 0.0) if doc else 0.0


class LedgerRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "ledger")

    async def record_entry(
        self,
        party_id: str,
        party_type: str,  # "customer" or "supplier"
        entry_type: str,  # "sale", "purchase", "payment_received", "payment_made", "return"
        debit: float,
        credit: float,
        balance_after: float,
        reference_id: Optional[str] = None,
        notes: Optional[str] = None,
        date: Optional[datetime] = None,
        session=None
    ) -> str:
        entry = {
            "tenant_id": self.tenant_id,
            "party_id": str(party_id),
            "party_type": party_type,
            "entry_type": entry_type,
            "debit": debit,
            "credit": credit,
            "balance_after": balance_after,
            "reference_id": reference_id or "",
            "notes": notes or "",
            "date": date or datetime.utcnow(),
            "created_at": datetime.utcnow()
        }
        return await self.create(entry, session=session)
