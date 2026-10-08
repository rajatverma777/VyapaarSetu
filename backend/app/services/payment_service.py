from typing import Any, Dict, Optional
from datetime import datetime
from fastapi import HTTPException
import logging

from app.core.transaction import UnitOfWork
from app.core.security import serialize_doc
from app.repositories.transaction_repo import PaymentRepository
from app.repositories.party_repo import CustomerRepository, SupplierRepository, LedgerRepository

logger = logging.getLogger(__name__)

class PaymentService:
    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.payment_repo = PaymentRepository(db, tenant_id)
        self.customer_repo = CustomerRepository(db, tenant_id)
        self.supplier_repo = SupplierRepository(db, tenant_id)
        self.ledger_repo = LedgerRepository(db, tenant_id)

    async def record_payment(
        self,
        party_id: str,
        party_type: str, # "customer" or "supplier"
        amount: float,
        payment_mode: str = "cash",
        payment_type: Optional[str] = None, # "received" or "paid"
        reference_type: Optional[str] = None,
        reference_id: Optional[str] = None,
        notes: Optional[str] = None,
        payment_date: Optional[datetime] = None,
        current_user: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Record financial voucher and synchronize party balance atomically."""
        user_id = str(current_user.get("_id", "")) if current_user else "system"
        now = payment_date or datetime.utcnow()

        if party_type == "customer":
            party = await self.customer_repo.get_by_id(party_id)
            if not party:
                raise HTTPException(status_code=404, detail="Customer not found")
            party_name = party.get("name", "Customer")
            p_type = payment_type or "received"
            delta = -amount if p_type == "received" else amount
        else:
            party = await self.supplier_repo.get_by_id(party_id)
            if not party:
                raise HTTPException(status_code=404, detail="Supplier not found")
            party_name = party.get("name", "Supplier")
            p_type = payment_type or "paid"
            delta = -amount if p_type == "paid" else amount

        async with UnitOfWork() as uow:
            session = uow.session

            # 1. Update party balance
            if party_type == "customer":
                new_bal = await self.customer_repo.update_balance(party_id, delta, session=session)
            else:
                new_bal = await self.supplier_repo.update_balance(party_id, delta, session=session)

            # 2. Record payment document
            payment_doc = {
                "tenant_id": self.tenant_id,
                "party_id": party_id,
                "party_name": party_name,
                "party_type": party_type,
                "amount": amount,
                "payment_mode": payment_mode,
                "payment_type": p_type,
                "reference_type": reference_type or "voucher",
                "reference_id": reference_id or "",
                "notes": notes or "",
                "payment_date": now,
                "created_by": user_id,
                "created_at": datetime.utcnow()
            }
            pid = await self.payment_repo.create(payment_doc, session=session)
            payment_doc["_id"] = pid

            # 3. Double-entry ledger
            debit = amount if (party_type == "supplier" and p_type == "paid") else 0.0
            credit = amount if (party_type == "customer" and p_type == "received") else 0.0
            await self.ledger_repo.record_entry(
                party_id=party_id,
                party_type=party_type,
                entry_type=f"payment_{p_type}",
                debit=debit,
                credit=credit,
                balance_after=new_bal,
                reference_id=reference_id or pid,
                notes=notes or f"Payment voucher via {payment_mode}",
                date=now,
                session=session
            )

        return serialize_doc(payment_doc)
