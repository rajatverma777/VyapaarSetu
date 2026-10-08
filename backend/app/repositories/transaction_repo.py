from typing import Any, Dict, List, Optional, Union
from bson import ObjectId
from datetime import datetime
from app.repositories.base import BaseRepository

class CounterRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "counters")

    async def get_next_sequence(self, prefix: str = "INV", session=None) -> str:
        today = datetime.utcnow()
        year_month = today.strftime("%y%m")
        counter_id = f"{self.tenant_id}-{prefix}-{year_month}"
        query = {"_id": counter_id}
        # Standalone atomic increment to avoid WiredTiger transaction write conflicts under concurrency
        res = await self.collection.find_one_and_update(
            query,
            {"$inc": {"seq": 1}, "$setOnInsert": {"tenant_id": self.tenant_id}},
            upsert=True,
            return_document=True
        )
        seq = res["seq"]
        return f"{prefix}-{year_month}-{seq:04d}"


class SaleRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "sales")


class PurchaseRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "purchases")


class PaymentRepository(BaseRepository):
    def __init__(self, db, tenant_id: str):
        super().__init__(db, tenant_id, "payments")
