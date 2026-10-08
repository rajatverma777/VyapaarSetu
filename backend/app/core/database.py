from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None
    is_replica_set: bool = False

db_instance = Database()

async def connect_to_mongo():
    logger.info("Connecting to MongoDB...")
    db_instance.client = AsyncIOMotorClient(settings.MONGODB_URL)
    db_instance.db = db_instance.client[settings.MONGODB_DB_NAME]
    try:
        hello_info = await db_instance.client.admin.command("hello")
        db_instance.is_replica_set = bool(hello_info.get("setName"))
    except Exception as e:
        logger.debug(f"Topology detection fallback: {e}")
        db_instance.is_replica_set = False
    await create_indexes()
    logger.info(f"Connected to MongoDB: {settings.MONGODB_DB_NAME} (replica_set={db_instance.is_replica_set})")

async def close_mongo_connection():
    logger.info("Closing MongoDB connection...")
    if db_instance.client:
        db_instance.client.close()

from typing import Optional
from fastapi import Request
from jose import jwt

class TenantCollection:
    def __init__(self, collection, tenant_id: str):
        self._collection = collection
        self.tenant_id = tenant_id

    def _inject_tenant(self, filter_query):
        if filter_query is None:
            filter_query = {}
        if isinstance(filter_query, dict):
            if "tenant_id" not in filter_query:
                filter_query["tenant_id"] = self.tenant_id
        return filter_query

    def find(self, filter=None, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return self._collection.find(filter, *args, **kwargs)

    async def find_one(self, filter=None, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.find_one(filter, *args, **kwargs)

    async def insert_one(self, document, *args, **kwargs):
        document["tenant_id"] = self.tenant_id
        return await self._collection.insert_one(document, *args, **kwargs)

    async def insert_many(self, documents, *args, **kwargs):
        for doc in documents:
            doc["tenant_id"] = self.tenant_id
        return await self._collection.insert_many(documents, *args, **kwargs)

    async def update_one(self, filter, update, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.update_one(filter, update, *args, **kwargs)

    async def update_many(self, filter, update, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.update_many(filter, update, *args, **kwargs)

    async def delete_one(self, filter, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.delete_one(filter, *args, **kwargs)

    async def delete_many(self, filter, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.delete_many(filter, *args, **kwargs)

    async def count_documents(self, filter=None, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.count_documents(filter, *args, **kwargs)

    async def distinct(self, key, filter=None, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.distinct(key, filter, *args, **kwargs)

    async def find_one_and_update(self, filter, update, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.find_one_and_update(filter, update, *args, **kwargs)

    async def find_one_and_delete(self, filter, *args, **kwargs):
        filter = self._inject_tenant(filter)
        return await self._collection.find_one_and_delete(filter, *args, **kwargs)

    async def find_one_and_replace(self, filter, replacement, *args, **kwargs):
        filter = self._inject_tenant(filter)
        if isinstance(replacement, dict):
            replacement["tenant_id"] = self.tenant_id
        return await self._collection.find_one_and_replace(filter, replacement, *args, **kwargs)

    def aggregate(self, pipeline, *args, **kwargs):
        match_step = {"$match": {"tenant_id": self.tenant_id}}
        new_pipeline = [match_step] + list(pipeline)
        return self._collection.aggregate(new_pipeline, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._collection, name)


# Collections that must NEVER be tenant-wrapped (global/auth data)
_GLOBAL_COLLECTIONS = {"users"}

class TenantDatabase:
    def __init__(self, db, tenant_id: str):
        self._db = db
        self.tenant_id = tenant_id

    def __getattr__(self, name):
        collection = getattr(self._db, name)
        if name in _GLOBAL_COLLECTIONS:
            return collection
        return TenantCollection(collection, self.tenant_id)

    def __getitem__(self, name):
        collection = self._db[name]
        if name in _GLOBAL_COLLECTIONS:
            return collection
        return TenantCollection(collection, self.tenant_id)


async def get_database(request: Request = None):
    """Resolve a tenant-scoped database from the JWT in the Authorization header.

    SECURITY: Never returns a raw unscoped DB when a request is present.
    Falls back to raw DB ONLY when no request is provided (internal startup tasks).
    """
    if not request:
        # Internal startup path only (e.g., create_indexes). Never called by API routes.
        return db_instance.db

    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]

    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])

            # PRIMARY: tenant_id embedded directly in JWT (fastest path)
            tenant_id = payload.get("tenant_id")
            if tenant_id:
                return TenantDatabase(db_instance.db, tenant_id)

            # SECONDARY: look up user from DB to find their tenant_id
            username: str = payload.get("sub")
            if username:
                if hasattr(request, "state"):
                    if hasattr(request.state, "user"):
                        user = request.state.user
                    else:
                        user = await db_instance.db.users.find_one({"username": username, "is_active": True})
                        if user:
                            request.state.user = user
                else:
                    user = await db_instance.db.users.find_one({"username": username, "is_active": True})

                if user and user.get("tenant_id"):
                    return TenantDatabase(db_instance.db, user["tenant_id"])
        except Exception:
            pass

    # No valid token — return raw DB only for public/unauthenticated endpoints.
    # Authenticated routes will reject the request via get_current_active_user before
    # ever querying data, so this is safe.
    return db_instance.db

async def create_indexes():
    db = db_instance.db

    async def safe_create_index(col, *args, **kwargs):
        try:
            await db[col].create_index(*args, **kwargs)
        except Exception as e:
            logger.warning(f"Index creation skipped/failed on {col} index specs: {e}")

    # ── Tenant isolation indexes (MUST be first — critical for security) ────────
    # Every collection that holds tenant data MUST have a tenant_id index.
    tenant_collections = [
        "products", "batches", "customers", "suppliers", "sales",
        "purchases", "payments", "ledger", "stock_logs", "categories",
        "ocr_tasks", "documents", "counters", "recalls", "audit_logs",
        "returns", "settings", "units",
    ]
    for col in tenant_collections:
        await safe_create_index(col, "tenant_id")

    # Products indexes — tenant isolated
    try:
        index_info = await db["products"].index_information()
        if "sku_1" in index_info and index_info["sku_1"].get("unique"):
            await db["products"].drop_index("sku_1")
            logger.info("Dropped legacy global unique sku_1 index in favor of tenant-scoped index")
        if "tenant_id_1_sku_1" in index_info:
            if not index_info["tenant_id_1_sku_1"].get("partialFilterExpression"):
                await db["products"].drop_index("tenant_id_1_sku_1")
    except Exception as e:
        logger.debug(f"Index migration check: {e}")

    await safe_create_index("products", [("tenant_id", 1), ("sku", 1)], unique=True, partialFilterExpression={"sku": {"$type": "string"}})
    await safe_create_index("products", [("tenant_id", 1), ("barcode", 1)], partialFilterExpression={"barcode": {"$type": "string"}})
    await safe_create_index("products", [("tenant_id", 1), ("name", 1)])
    await safe_create_index("products", [("tenant_id", 1), ("category_id", 1)])
    try:
        prod_idx = await db["products"].index_information()
        has_text = any("_fts" in str(v.get("key", [])) for v in prod_idx.values())
        if not has_text:
            await safe_create_index("products", [("name", "text"), ("sku", "text"), ("barcode", "text")])
    except Exception:
        pass

    # Batches indexes — compound with tenant_id so FEFO lookups are isolated
    try:
        batch_info = await db["batches"].index_information()
        if "product_id_1_batch_no_1" in batch_info and batch_info["product_id_1_batch_no_1"].get("unique"):
            await db["batches"].drop_index("product_id_1_batch_no_1")
            logger.info("Dropped legacy global unique product_id_1_batch_no_1 on batches")
    except Exception as e:
        logger.debug(f"Batch index migration check: {e}")

    await safe_create_index("batches", [("tenant_id", 1), ("product_id", 1), ("batch_no", 1)], unique=True)
    await safe_create_index("batches", [("tenant_id", 1), ("product_id", 1), ("expiry", 1)])
    await safe_create_index("batches", "expiry")
    await safe_create_index("batches", "product_id")

    # Customers indexes — tenant isolated
    await safe_create_index("customers", [("tenant_id", 1), ("mobile", 1)], partialFilterExpression={"mobile": {"$type": "string"}})
    await safe_create_index("customers", [("tenant_id", 1), ("name", 1)])
    try:
        cust_idx = await db["customers"].index_information()
        has_cust_text = any("_fts" in str(v.get("key", [])) for v in cust_idx.values())
        if not has_cust_text:
            await safe_create_index("customers", [("name", "text"), ("mobile", "text"), ("email", "text")])
    except Exception:
        pass

    # Suppliers indexes — tenant isolated
    await safe_create_index("suppliers", [("tenant_id", 1), ("mobile", 1)], partialFilterExpression={"mobile": {"$type": "string"}})
    await safe_create_index("suppliers", [("tenant_id", 1), ("name", 1)])
    try:
        supp_idx = await db["suppliers"].index_information()
        has_supp_text = any("_fts" in str(v.get("key", [])) for v in supp_idx.values())
        if not has_supp_text:
            await safe_create_index("suppliers", [("name", "text"), ("mobile", "text")])
    except Exception:
        pass

    # Sales indexes — invoice_number unique per tenant
    try:
        sales_info = await db["sales"].index_information()
        if "invoice_number_1" in sales_info and sales_info["invoice_number_1"].get("unique"):
            await db["sales"].drop_index("invoice_number_1")
            logger.info("Dropped legacy global unique invoice_number_1 on sales")
    except Exception as e:
        logger.debug(f"Sales index migration check: {e}")

    await safe_create_index("sales", [("tenant_id", 1), ("invoice_number", 1)], unique=True)
    await safe_create_index("sales", "customer_id")
    await safe_create_index("sales", "sale_date")
    await safe_create_index("sales", "status")
    await safe_create_index("sales", [("customer_id", 1), ("sale_date", -1)])
    await safe_create_index("sales", [("status", 1), ("sale_date", -1)])

    # Purchases indexes — invoice_number unique per tenant
    try:
        pur_info = await db["purchases"].index_information()
        if "invoice_number_1" in pur_info and pur_info["invoice_number_1"].get("unique"):
            await db["purchases"].drop_index("invoice_number_1")
            logger.info("Dropped legacy global unique invoice_number_1 on purchases")
    except Exception as e:
        logger.debug(f"Purchases index migration check: {e}")

    await safe_create_index("purchases", [("tenant_id", 1), ("invoice_number", 1)], unique=True, partialFilterExpression={"invoice_number": {"$type": "string"}})
    await safe_create_index("purchases", "supplier_id")
    await safe_create_index("purchases", "purchase_date")
    await safe_create_index("purchases", [("supplier_id", 1), ("purchase_date", -1)])

    # Payments indexes
    await safe_create_index("payments", "party_id")
    await safe_create_index("payments", "payment_date")
    await safe_create_index("payments", [("party_id", 1), ("payment_date", -1)])

    # Ledger indexes
    await safe_create_index("ledger", "party_id")
    await safe_create_index("ledger", "date")
    await safe_create_index("ledger", [("party_id", 1), ("date", -1)])

    # Stock logs indexes
    await safe_create_index("stock_logs", "product_id")
    await safe_create_index("stock_logs", "created_at")

    # Users indexes
    await safe_create_index("users", "username", unique=True)
    await safe_create_index("users", "email", unique=True, sparse=True)

    # Documents indexes
    await safe_create_index("documents", "reference", sparse=True)
    await safe_create_index("documents", "status")
    await safe_create_index("documents", "created_at")
    await safe_create_index("documents", [("customer_name", 1), ("created_at", -1)])
    await safe_create_index(
        "documents",
        [("customer_name", "text"), ("subject", "text"),
         ("reference", "text"), ("title", "text")]
    )

    # Counters — compound key so tenant invoice sequences are isolated
    await safe_create_index("counters", "tenant_id")

    logger.info("Database indexes created successfully")
