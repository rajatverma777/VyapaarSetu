from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

class Database:
    client: AsyncIOMotorClient = None
    db = None

db_instance = Database()

async def connect_to_mongo():
    logger.info("Connecting to MongoDB...")
    db_instance.client = AsyncIOMotorClient(settings.MONGODB_URL)
    db_instance.db = db_instance.client[settings.MONGODB_DB_NAME]
    await create_indexes()
    await seed_default_categories()
    logger.info(f"Connected to MongoDB: {settings.MONGODB_DB_NAME}")

async def seed_default_categories():
    db = db_instance.db
    count = await db.categories.count_documents({"is_active": {"$ne": False}})
    if count == 0:
        logger.info("Seeding default categories...")
        from datetime import datetime, UTC
        default_cats = [
            {"name": "YASH SURGICAL HOUSE", "description": "Products supplied by Yash Surgical House", "is_active": True},
            {"name": "R B HEALTHCARE", "description": "Products supplied by R B Healthcare", "is_active": True}
        ]
        for cat in default_cats:
            existing = await db.categories.find_one({"name": cat["name"]})
            if existing:
                await db.categories.update_one({"_id": existing["_id"]}, {"$set": {"is_active": True}})
            else:
                cat["created_at"] = datetime.now(UTC)
                await db.categories.insert_one(cat)
        logger.info("Default categories seeded successfully")

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

    def aggregate(self, pipeline, *args, **kwargs):
        match_step = {"$match": {"tenant_id": self.tenant_id}}
        new_pipeline = [match_step] + list(pipeline)
        return self._collection.aggregate(new_pipeline, *args, **kwargs)

    def __getattr__(self, name):
        return getattr(self._collection, name)

class TenantDatabase:
    def __init__(self, db, tenant_id: str):
        self._db = db
        self.tenant_id = tenant_id

    def __getattr__(self, name):
        collection = getattr(self._db, name)
        # Avoid tenant-wrapping on "users" collection for login authentication
        if name == "users":
            return collection
        return TenantCollection(collection, self.tenant_id)

    def __getitem__(self, name):
        collection = self._db[name]
        if name == "users":
            return collection
        return TenantCollection(collection, self.tenant_id)

async def get_database(request: Request = None):
    if not request:
        return db_instance.db
        
    auth_header = request.headers.get("Authorization")
    token = None
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
        
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            tenant_id = payload.get("tenant_id")
            if tenant_id:
                return TenantDatabase(db_instance.db, tenant_id)
                
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
                    
                if user and "tenant_id" in user:
                    return TenantDatabase(db_instance.db, user["tenant_id"])
        except Exception:
            pass
            
    return db_instance.db

async def create_indexes():
    db = db_instance.db
    
    # Create indexes on tenant_id for all multitenant collections to speed up filtering
    collections_to_index = [
        "products", "batches", "customers", "suppliers", "sales", 
        "purchases", "payments", "ledger", "stock_logs", "categories",
        "ocr_tasks", "documents"
    ]
    for col in collections_to_index:
        await db[col].create_index("tenant_id")

    # Products indexes
    await db.products.create_index("sku", unique=True, sparse=True)
    await db.products.create_index("barcode", sparse=True)
    await db.products.create_index("name")
    await db.products.create_index("category_id")
    await db.products.create_index([("name", "text"), ("sku", "text"), ("barcode", "text")])

    # Batches indexes
    await db.batches.create_index([("product_id", 1), ("batch_no", 1)], unique=True)
    await db.batches.create_index("expiry")
    await db.batches.create_index("product_id")

    # Customers indexes
    await db.customers.create_index("mobile", sparse=True)
    await db.customers.create_index("name")
    await db.customers.create_index([("name", "text"), ("mobile", "text"), ("email", "text")])

    # Suppliers indexes
    await db.suppliers.create_index("mobile", sparse=True)
    await db.suppliers.create_index("name")
    await db.suppliers.create_index([("name", "text"), ("mobile", "text")])

    # Sales indexes
    await db.sales.create_index("invoice_number", unique=True)
    await db.sales.create_index("customer_id")
    await db.sales.create_index("sale_date")
    await db.sales.create_index("status")
    # Compound indexes for analytics and queries
    await db.sales.create_index([("customer_id", 1), ("sale_date", -1)])
    await db.sales.create_index([("status", 1), ("sale_date", -1)])

    # Purchases indexes
    await db.purchases.create_index("invoice_number", unique=True, sparse=True)
    await db.purchases.create_index("supplier_id")
    await db.purchases.create_index("purchase_date")
    await db.purchases.create_index([("supplier_id", 1), ("purchase_date", -1)])

    # Payments indexes
    await db.payments.create_index("party_id")
    await db.payments.create_index("payment_date")
    await db.payments.create_index([("party_id", 1), ("payment_date", -1)])

    # Ledger indexes
    await db.ledger.create_index("party_id")
    await db.ledger.create_index("date")
    await db.ledger.create_index([("party_id", 1), ("date", -1)])

    # Stock logs indexes
    await db.stock_logs.create_index("product_id")
    await db.stock_logs.create_index("created_at")

    # Users indexes
    await db.users.create_index("username", unique=True)
    await db.users.create_index("email", unique=True, sparse=True)

    # Documents indexes
    await db.documents.create_index("reference", sparse=True)
    await db.documents.create_index("status")
    await db.documents.create_index("created_at")
    await db.documents.create_index([("customer_name", 1), ("created_at", -1)])
    await db.documents.create_index(
        [("customer_name", "text"), ("subject", "text"),
         ("reference", "text"), ("title", "text")]
    )

    logger.info("Database indexes created")
