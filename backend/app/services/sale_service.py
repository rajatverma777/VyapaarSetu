from typing import Any, Dict, List, Optional
from datetime import datetime
from fastapi import HTTPException
from bson import ObjectId
import logging

from app.models.transaction import SaleCreate
from app.core.finance.tax_calculator import GSTCalculator
from app.core.transaction import UnitOfWork
from app.core.security import serialize_doc
from app.repositories.transaction_repo import SaleRepository, CounterRepository, PaymentRepository
from app.repositories.party_repo import CustomerRepository, LedgerRepository
from app.services.inventory_service import InventoryService

logger = logging.getLogger(__name__)

class SaleService:
    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.sale_repo = SaleRepository(db, tenant_id)
        self.counter_repo = CounterRepository(db, tenant_id)
        self.customer_repo = CustomerRepository(db, tenant_id)
        self.ledger_repo = LedgerRepository(db, tenant_id)
        self.payment_repo = PaymentRepository(db, tenant_id)
        self.inventory_service = InventoryService(db, tenant_id)

    async def create_sale(self, data: SaleCreate, current_user: Dict[str, Any]) -> Dict[str, Any]:
        """
        Create a sale invoice atomically using UnitOfWork.
        Performs stock deduction (FEFO), ledger update, customer balance sync, and payment logging.
        """
        user_id = str(current_user.get("_id", ""))
        user_name = current_user.get("full_name", "")

        # 1. Decimal-Safe GST & Invoice Calculation
        raw_items = [item.dict() if hasattr(item, "dict") else dict(item) for item in data.items]
        calc = GSTCalculator.calculate_invoice(
            items=raw_items,
            is_igst=data.is_igst,
            discount_percent=data.discount_percent,
            discount_amount=data.discount_amount,
            paid_amount=data.paid_amount,
            enable_round_off=False
        )

        customer_name = data.customer_name or "Walk-in Customer"
        if data.customer_id:
            cust = await self.customer_repo.get_by_id(data.customer_id)
            if cust:
                customer_name = cust.get("name", customer_name)

        # 2. Transactional Execution
        async with UnitOfWork() as uow:
            session = uow.session

            prefix = "INV" if data.sale_type == "sale" else "SRN"
            invoice_number = await self.counter_repo.get_next_sequence(prefix=prefix, session=session)
            now = data.sale_date or datetime.utcnow()

            # 3. Stock Deductions / Returns
            for item in calc["items"]:
                qty = item["quantity"]
                prod_id = str(item["product_id"])
                batch_no = item.get("batch_no")

                if data.sale_type == "sale":
                    await self.inventory_service.deduct_stock(
                        product_id=prod_id,
                        quantity=qty,
                        batch_no=batch_no,
                        reference_id=invoice_number,
                        reason="sale",
                        user_id=user_id,
                        session=session
                    )
                else: # Sales Return
                    await self.inventory_service.add_stock(
                        product_id=prod_id,
                        quantity=qty,
                        batch_no=batch_no or "DEFAULT",
                        reference_id=invoice_number,
                        reason="sales_return",
                        user_id=user_id,
                        session=session
                    )

            # 4. Construct Sale Record
            sale_doc = {
                "tenant_id": self.tenant_id,
                "invoice_number": invoice_number,
                "customer_id": data.customer_id,
                "customer_name": customer_name,
                "sale_date": now,
                "items": calc["items"],
                "subtotal": calc["subtotal"],
                "discount_percent": calc["discount_percent"],
                "discount_amount": calc["discount_amount"],
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
                "sale_type": data.sale_type,
                "notes": data.notes,
                "created_by": user_id,
                "created_by_name": user_name,
                "created_at": datetime.utcnow()
            }

            sale_id = await self.sale_repo.create(sale_doc, session=session)
            sale_doc["_id"] = sale_id

            # 5. Customer Ledger & Outstanding Balance
            if data.customer_id:
                balance_delta = calc["balance_amount"] if data.sale_type == "sale" else -calc["total_amount"]
                new_bal = await self.customer_repo.update_balance(
                    customer_id=data.customer_id,
                    delta=balance_delta,
                    session=session
                )
                await self.ledger_repo.record_entry(
                    party_id=data.customer_id,
                    party_type="customer",
                    entry_type=data.sale_type,
                    debit=calc["total_amount"] if data.sale_type == "sale" else 0.0,
                    credit=0.0 if data.sale_type == "sale" else calc["total_amount"],
                    balance_after=new_bal,
                    reference_id=invoice_number,
                    notes=f"Invoice #{invoice_number}",
                    date=now,
                    session=session
                )

                # If upfront payment was made
                if calc["paid_amount"] > 0:
                    await self.ledger_repo.record_entry(
                        party_id=data.customer_id,
                        party_type="customer",
                        entry_type="payment_received",
                        debit=0.0,
                        credit=calc["paid_amount"],
                        balance_after=new_bal,
                        reference_id=invoice_number,
                        notes=f"Payment for {invoice_number} via {data.payment_mode}",
                        date=now,
                        session=session
                    )

            # 6. Payment Record
            if calc["paid_amount"] > 0:
                payment_doc = {
                    "tenant_id": self.tenant_id,
                    "party_id": data.customer_id,
                    "party_name": customer_name,
                    "party_type": "customer",
                    "amount": calc["paid_amount"],
                    "payment_mode": data.payment_mode,
                    "payment_type": "received",
                    "reference_type": "sale",
                    "reference_id": invoice_number,
                    "payment_date": now,
                    "created_by": user_id,
                    "created_at": datetime.utcnow()
                }
                await self.payment_repo.create(payment_doc, session=session)

        res = serialize_doc(sale_doc)
        res["message"] = "Sale created successfully"
        res["id"] = str(sale_doc["_id"])
        return res
