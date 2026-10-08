from typing import Any, Dict, List, Optional
from datetime import datetime
from fastapi import HTTPException
import logging

from app.models.transaction import PurchaseCreate
from app.core.finance.tax_calculator import GSTCalculator
from app.core.transaction import UnitOfWork
from app.core.security import serialize_doc
from app.repositories.transaction_repo import PurchaseRepository, CounterRepository, PaymentRepository
from app.repositories.party_repo import SupplierRepository, LedgerRepository
from app.services.inventory_service import InventoryService

logger = logging.getLogger(__name__)

class PurchaseService:
    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.purchase_repo = PurchaseRepository(db, tenant_id)
        self.counter_repo = CounterRepository(db, tenant_id)
        self.supplier_repo = SupplierRepository(db, tenant_id)
        self.ledger_repo = LedgerRepository(db, tenant_id)
        self.payment_repo = PaymentRepository(db, tenant_id)
        self.inventory_service = InventoryService(db, tenant_id)

    async def create_purchase(self, data: PurchaseCreate, current_user: Dict[str, Any]) -> Dict[str, Any]:
        """Create purchase transaction atomically using UnitOfWork."""
        user_id = str(current_user.get("_id", ""))
        user_name = current_user.get("full_name", "")

        # 1. Supplier Validation
        supplier = await self.supplier_repo.get_by_id(data.supplier_id)
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")
        supplier_name = supplier.get("name", "Unknown Supplier")

        # 2. Decimal-Safe GST Calculation
        raw_items = [item.dict() if hasattr(item, "dict") else dict(item) for item in data.items]
        calc = GSTCalculator.calculate_invoice(
            items=raw_items,
            is_igst=data.is_igst,
            paid_amount=data.paid_amount,
            enable_round_off=False
        )

        async with UnitOfWork() as uow:
            session = uow.session

            now = data.purchase_date or datetime.utcnow()
            invoice_num = data.invoice_number
            if not invoice_num:
                invoice_num = await self.counter_repo.get_next_sequence(prefix="PUR", session=session)

            # 3. Stock Ingestion
            for item in calc["items"]:
                qty = item["quantity"]
                prod_id = str(item["product_id"])
                batch_no = item.get("batch_no") or "DEFAULT"
                expiry = item.get("expiry")
                rate = item.get("rate", 0.0)

                if data.purchase_type == "purchase":
                    await self.inventory_service.add_stock(
                        product_id=prod_id,
                        quantity=qty,
                        batch_no=batch_no,
                        expiry=expiry,
                        purchase_price=rate,
                        reference_id=invoice_num,
                        reason="purchase",
                        user_id=user_id,
                        session=session
                    )
                else: # Purchase Return
                    await self.inventory_service.deduct_stock(
                        product_id=prod_id,
                        quantity=qty,
                        batch_no=batch_no,
                        reference_id=invoice_num,
                        reason="purchase_return",
                        user_id=user_id,
                        session=session
                    )

            # 4. Construct Purchase Document
            purchase_doc = {
                "tenant_id": self.tenant_id,
                "invoice_number": invoice_num,
                "supplier_id": data.supplier_id,
                "supplier_name": supplier_name,
                "purchase_date": now,
                "items": calc["items"],
                "subtotal": calc["subtotal"],
                "taxable_amount": calc["total_taxable"],
                "total_cgst": calc["total_cgst"],
                "total_sgst": calc["total_sgst"],
                "total_igst": calc["total_igst"],
                "total_tax": calc["total_tax"],
                "round_off": calc["round_off"],
                "total_amount": calc["total_amount"],
                "paid_amount": calc["paid_amount"],
                "balance_amount": calc["balance_amount"],
                "payment_mode": data.payment_mode,
                "is_igst": data.is_igst,
                "status": "paid" if calc["balance_amount"] <= 0 else "partial" if calc["paid_amount"] > 0 else "unpaid",
                "purchase_type": data.purchase_type,
                "notes": data.notes,
                "created_by": user_id,
                "created_by_name": user_name,
                "created_at": datetime.utcnow()
            }

            purchase_id = await self.purchase_repo.create(purchase_doc, session=session)
            purchase_doc["_id"] = purchase_id

            # 5. Supplier Ledger & Outstanding Balance
            balance_delta = calc["balance_amount"] if data.purchase_type == "purchase" else -calc["total_amount"]
            new_bal = await self.supplier_repo.update_balance(
                supplier_id=data.supplier_id,
                delta=balance_delta,
                session=session
            )

            await self.ledger_repo.record_entry(
                party_id=data.supplier_id,
                party_type="supplier",
                entry_type=data.purchase_type,
                debit=0.0 if data.purchase_type == "purchase" else calc["total_amount"],
                credit=calc["total_amount"] if data.purchase_type == "purchase" else 0.0,
                balance_after=new_bal,
                reference_id=invoice_num,
                notes=f"Bill #{invoice_num}",
                date=now,
                session=session
            )

            # 6. Payment Record
            if calc["paid_amount"] > 0:
                payment_doc = {
                    "tenant_id": self.tenant_id,
                    "party_id": data.supplier_id,
                    "party_name": supplier_name,
                    "party_type": "supplier",
                    "amount": calc["paid_amount"],
                    "payment_mode": data.payment_mode,
                    "payment_type": "paid",
                    "reference_type": "purchase",
                    "reference_id": invoice_num,
                    "payment_date": now,
                    "created_by": user_id,
                    "created_at": datetime.utcnow()
                }
                await self.payment_repo.create(payment_doc, session=session)

        res = serialize_doc(purchase_doc)
        res["message"] = "Purchase created successfully"
        res["id"] = str(purchase_doc["_id"])
        return res
