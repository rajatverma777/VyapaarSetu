from typing import Any, Dict, List, Optional, Tuple, Union
from bson import ObjectId
from datetime import datetime
from fastapi import HTTPException
import logging

from app.repositories.inventory_repo import ProductRepository, BatchRepository, StockLogRepository
from app.utils.date_utils import parse_expiry_string

logger = logging.getLogger(__name__)

class InventoryService:
    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.product_repo = ProductRepository(db, tenant_id)
        self.batch_repo = BatchRepository(db, tenant_id)
        self.log_repo = StockLogRepository(db, tenant_id)

    async def deduct_stock(
        self,
        product_id: str,
        quantity: float,
        batch_no: Optional[str] = None,
        reference_id: Optional[str] = None,
        reason: str = "sale",
        user_id: Optional[str] = None,
        session=None
    ) -> List[Dict[str, Any]]:
        """
        Atomically deduct stock from product and batch with FEFO support.
        Prevents overselling. Returns list of batches deducted with quantities.
        """
        product = await self.product_repo.get_by_id(product_id, session=session)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        prod_name = product.get("name", "Product")
        stock_before = product.get("current_stock", 0.0)

        # 1. Atomic decrement on Product document
        success = await self.product_repo.atomic_decrement_stock(product_id, quantity, session=session)
        if not success:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for '{prod_name}'. Available: {stock_before}, Requested: {quantity}"
            )

        stock_after = stock_before - quantity
        deducted_batches = []

        # 2. Batch deduction
        if batch_no and batch_no != "AUTO":
            # Manual batch selection
            batch_success = await self.batch_repo.atomic_decrement_batch(product_id, batch_no, quantity, session=session)
            if not batch_success:
                # Rollback general stock if in non-transactional mode
                await self.product_repo.atomic_increment_stock(product_id, quantity, session=session)
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock in batch '{batch_no}' of '{prod_name}'."
                )
            deducted_batches.append({"batch_no": batch_no, "quantity": quantity})
            await self.log_repo.record_log(
                product_id=product_id,
                product_name=prod_name,
                change_type=reason,
                quantity_delta=-quantity,
                stock_before=stock_before,
                stock_after=stock_after,
                batch_no=batch_no,
                reference_id=reference_id,
                reason=reason,
                performed_by=user_id,
                session=session
            )
        else:
            # FEFO (First Expired First Out) deduction
            batches = await self.batch_repo.get_fefo_batches(product_id, session=session)
            remaining_to_deduct = quantity

            for b in batches:
                if remaining_to_deduct <= 0:
                    break
                avail = b.get("current_stock", 0.0)
                if avail <= 0:
                    continue
                take = min(avail, remaining_to_deduct)
                await self.batch_repo.atomic_decrement_batch(product_id, b["batch_no"], take, session=session)
                deducted_batches.append({"batch_no": b["batch_no"], "quantity": take})
                remaining_to_deduct -= take

            # If batches didn't cover full quantity, deduct remainder from DEFAULT batch
            if remaining_to_deduct > 0:
                await self.batch_repo.atomic_increment_or_create_batch(
                    product_id=product_id,
                    batch_no="DEFAULT",
                    qty=-remaining_to_deduct,
                    session=session
                )
                deducted_batches.append({"batch_no": "DEFAULT", "quantity": remaining_to_deduct})

            await self.log_repo.record_log(
                product_id=product_id,
                product_name=prod_name,
                change_type=reason,
                quantity_delta=-quantity,
                stock_before=stock_before,
                stock_after=stock_after,
                batch_no=",".join([b["batch_no"] for b in deducted_batches]),
                reference_id=reference_id,
                reason=reason,
                performed_by=user_id,
                session=session
            )

        return deducted_batches

    async def add_stock(
        self,
        product_id: str,
        quantity: float,
        batch_no: Optional[str] = "DEFAULT",
        expiry: Optional[Union[str, datetime]] = None,
        purchase_price: float = 0.0,
        reference_id: Optional[str] = None,
        reason: str = "purchase",
        user_id: Optional[str] = None,
        session=None
    ) -> bool:
        """Atomically increment stock for product and batch with traceable audit entry."""
        product = await self.product_repo.get_by_id(product_id, session=session)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        prod_name = product.get("name", "Product")
        stock_before = product.get("current_stock", 0.0)

        # Increment product stock
        await self.product_repo.atomic_increment_stock(product_id, quantity, session=session)
        stock_after = stock_before + quantity

        # Parse expiry date if passed as string
        parsed_expiry = expiry if isinstance(expiry, datetime) else parse_expiry_string(expiry) if expiry else None

        # Increment or create batch
        b_no = batch_no or "DEFAULT"
        await self.batch_repo.atomic_increment_or_create_batch(
            product_id=product_id,
            batch_no=b_no,
            qty=quantity,
            expiry=parsed_expiry,
            purchase_price=purchase_price,
            session=session
        )

        # Record stock log
        await self.log_repo.record_log(
            product_id=product_id,
            product_name=prod_name,
            change_type=reason,
            quantity_delta=quantity,
            stock_before=stock_before,
            stock_after=stock_after,
            batch_no=b_no,
            reference_id=reference_id,
            reason=reason,
            performed_by=user_id,
            session=session
        )
        return True

    async def adjust_stock(
        self,
        product_id: str,
        new_stock: float,
        batch_no: Optional[str] = "DEFAULT",
        reason: str = "manual_adjustment",
        user_id: Optional[str] = None,
        session=None
    ) -> float:
        """Reconcile inventory discrepancy with traceable audit trail."""
        product = await self.product_repo.get_by_id(product_id, session=session)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

        current = product.get("current_stock", 0.0)
        delta = new_stock - current

        if delta > 0:
            await self.add_stock(
                product_id=product_id,
                quantity=delta,
                batch_no=batch_no,
                reason=reason,
                user_id=user_id,
                session=session
            )
        elif delta < 0:
            await self.deduct_stock(
                product_id=product_id,
                quantity=abs(delta),
                batch_no=batch_no,
                reason=reason,
                user_id=user_id,
                session=session
            )
        return new_stock
