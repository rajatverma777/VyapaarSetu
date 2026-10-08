from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
from datetime import datetime
import re
from app.repositories.base import BaseRepository

class ProductRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "products")

    async def get_by_sku(self, sku: str, session=None) -> Optional[Dict[str, Any]]:
        if not sku:
            return None
        return await self.find_one({"sku": sku}, session=session)

    async def get_by_barcode(self, barcode: str, session=None) -> Optional[Dict[str, Any]]:
        if not barcode:
            return None
        return await self.find_one({"barcode": barcode}, session=session)

    async def atomic_decrement_stock(
        self,
        product_id: Union[str, ObjectId],
        qty: float,
        session=None
    ) -> bool:
        """Atomically decrement stock ensuring current_stock >= qty (prevents negative overselling)."""
        if not product_id:
            return False
        oid = self._to_object_id(product_id)
        lookup_id = oid if oid is not None else product_id
        query = self._scope_query({
            "_id": lookup_id,
            "current_stock": {"$gte": qty}
        })
        kwargs = {"session": session} if session else {}
        res = await self.collection.update_one(
            query,
            {"$inc": {"current_stock": -qty}, "$set": {"updated_at": datetime.utcnow()}},
            **kwargs
        )
        return res.modified_count > 0

    async def atomic_increment_stock(
        self,
        product_id: Union[str, ObjectId],
        qty: float,
        session=None
    ) -> bool:
        if not product_id:
            return False
        oid = self._to_object_id(product_id)
        lookup_id = oid if oid is not None else product_id
        query = self._scope_query({"_id": lookup_id})
        kwargs = {"session": session} if session else {}
        res = await self.collection.update_one(
            query,
            {"$inc": {"current_stock": qty}, "$set": {"updated_at": datetime.utcnow()}},
            **kwargs
        )
        return res.modified_count > 0

    async def search(self, query_str: str, limit: int = 20) -> List[Dict[str, Any]]:
        if not query_str:
            return await self.find({"is_active": True}, sort=[("name", 1)], limit=limit)
        
        escaped = re.escape(query_str.strip())
        filter_query = {
            "is_active": True,
            "$or": [
                {"name": {"$regex": f"^{escaped}", "$options": "i"}},
                {"sku": {"$regex": f"^{escaped}", "$options": "i"}},
                {"barcode": {"$regex": f"^{escaped}", "$options": "i"}},
                {"brand": {"$regex": f"^{escaped}", "$options": "i"}}
            ]
        }
        res = await self.find(filter_query, sort=[("name", 1)], limit=limit)
        if len(res) < limit:
            # Substring fallback
            existing_ids = {r["_id"] for r in res}
            sub_filter = {
                "is_active": True,
                "_id": {"$nin": list(existing_ids)},
                "$or": [
                    {"name": {"$regex": escaped, "$options": "i"}},
                    {"brand": {"$regex": escaped, "$options": "i"}}
                ]
            }
            extra = await self.find(sub_filter, sort=[("name", 1)], limit=limit - len(res))
            res.extend(extra)
        return res


class BatchRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "batches")

    async def get_fefo_batches(
        self,
        product_id: str,
        session=None
    ) -> List[Dict[str, Any]]:
        """Retrieve active batches for a product ordered by expiry ascending (FEFO)."""
        query = {
            "product_id": str(product_id),
            "current_stock": {"$gt": 0}
        }
        # Sort batches with nearest expiry first, nulls last
        batches = await self.find(query, sort=[("expiry", 1), ("created_at", 1)], limit=100, session=session)
        return batches

    async def atomic_decrement_batch(
        self,
        product_id: str,
        batch_no: str,
        qty: float,
        session=None
    ) -> bool:
        query = self._scope_query({
            "product_id": str(product_id),
            "batch_no": batch_no,
            "current_stock": {"$gte": qty}
        })
        kwargs = {"session": session} if session else {}
        res = await self.collection.update_one(
            query,
            {"$inc": {"current_stock": -qty}},
            **kwargs
        )
        return res.modified_count > 0

    async def atomic_increment_or_create_batch(
        self,
        product_id: str,
        batch_no: str,
        qty: float,
        expiry: Optional[datetime] = None,
        purchase_price: float = 0.0,
        session=None
    ) -> bool:
        query = self._scope_query({
            "product_id": str(product_id),
            "batch_no": batch_no
        })
        kwargs = {"session": session} if session else {}
        update_op = {
            "$inc": {"current_stock": qty},
            "$setOnInsert": {
                "tenant_id": self.tenant_id,
                "product_id": str(product_id),
                "batch_no": batch_no,
                "expiry": expiry,
                "purchase_price": purchase_price,
                "created_at": datetime.utcnow()
            }
        }
        if expiry:
            update_op["$set"] = {"expiry": expiry}
        res = await self.collection.update_one(query, update_op, upsert=True, **kwargs)
        return res.acknowledged


class StockLogRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "stock_logs")

    async def record_log(
        self,
        product_id: str,
        product_name: str,
        change_type: str,
        quantity_delta: float,
        stock_before: float,
        stock_after: float,
        batch_no: Optional[str] = None,
        reference_id: Optional[str] = None,
        reason: Optional[str] = None,
        performed_by: Optional[str] = None,
        session=None
    ) -> str:
        log_doc = {
            "tenant_id": self.tenant_id,
            "product_id": str(product_id),
            "product_name": product_name,
            "batch_no": batch_no or "DEFAULT",
            "change_type": change_type,
            "quantity_delta": quantity_delta,
            "stock_before": stock_before,
            "stock_after": stock_after,
            "reference_id": reference_id,
            "reason": reason or "",
            "performed_by": performed_by or "system",
            "created_at": datetime.utcnow()
        }
        return await self.create(log_doc, session=session)
