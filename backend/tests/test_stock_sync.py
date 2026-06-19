import asyncio
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId
from datetime import datetime
import sys

import os
# Add parent dir to path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.core.config import settings

async def main():
    client_db = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client_db[settings.MONGODB_DB_NAME]
    
    # 1. Register and login a user to get auth headers
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        username = f"syncuser_{int(asyncio.get_event_loop().time())}"
        await client.post("/api/auth/register", json={
            "username": username,
            "password": "password123",
            "full_name": "Sync Tester",
            "email": f"{username}@example.com",
            "role": "admin",
            "mobile": "7777777777"
        })
        
        login_res = await client.post("/api/auth/token", data={"username": username, "password": "password123"})
        login_data = login_res.json()
        tenant_id = login_data["user"]["tenant_id"]
        auth_headers = {"Authorization": f"Bearer {login_data['access_token']}"}
        
        # 2. Directly insert a category, a product, and a batch in MongoDB
        cat_id = ObjectId()
        await db.categories.insert_one({
            "_id": cat_id,
            "name": f"Cat_{username}",
            "description": "test category",
            "tenant_id": tenant_id
        })
        
        prod_id = ObjectId()
        await db.products.insert_one({
            "_id": prod_id,
            "name": f"Sync Pill {username}",
            "sku": f"SKU_{username}",
            "barcode": f"BC_{username}",
            "category_id": str(cat_id),
            "unit": "PCS",
            "purchase_price": 10.0,
            "selling_price": 15.0,
            "current_stock": 5.0,  # Out-of-sync product stock (5.0)
            "min_stock_alert": 1,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenant_id": tenant_id
        })
        
        # Create a batch with 12.0 stock (out-of-sync, higher than product stock of 5.0)
        await db.batches.insert_one({
            "product_id": str(prod_id),
            "batch_no": "BATCH-HEAL-12",
            "current_stock": 12.0,
            "expiry": datetime(2030, 12, 31),
            "purchase_price": 10.0,
            "created_at": datetime.utcnow(),
            "tenant_id": tenant_id
        })
        
        print(f"Direct DB insert complete.")
        print(f"Product stock in products doc: 5.0")
        print(f"Batch stock in batches doc: 12.0")
        
        # 3. Request a sale of 10.0 items.
        # Product stock is 5.0, so normally this would return 400 Insufficient stock.
        # But our self-healing logic should notice batch stock is 12.0, update product stock to 12.0,
        # and successfully checkout 10.0 items, leaving 2.0 items.
        sale_payload = {
            "customer_name": "Walk-in Customer",
            "items": [
                {
                    "product_id": str(prod_id),
                    "product_name": f"Sync Pill {username}",
                    "quantity": 10.0,
                    "rate": 15.0,
                    "gst_rate": 18.0,
                    "batch_no": "BATCH-HEAL-12"
                }
            ],
            "paid_amount": 150.0,
            "payment_mode": "cash"
        }
        
        print("Submitting sale request for 10.0 items...")
        sale_res = await client.post("/api/sales/", json=sale_payload, headers=auth_headers)
        print("Sale response status:", sale_res.status_code)
        
        if sale_res.status_code != 200:
            print("Sale failed:", sale_res.text)
            sys.exit(1)
            
        print("Sale succeeded! Checking stocks in DB...")
        
        # 4. Check stock in DB
        prod_doc = await db.products.find_one({"_id": prod_id})
        batch_doc = await db.batches.find_one({"product_id": str(prod_id), "batch_no": "BATCH-HEAL-12"})
        
        print("Product stock in DB is now:", prod_doc["current_stock"])
        print("Batch stock in DB is now:", batch_doc["current_stock"])
        
        assert prod_doc["current_stock"] == 2.0, f"Expected product stock to be 2.0, got {prod_doc['current_stock']}"
        assert batch_doc["current_stock"] == 2.0, f"Expected batch stock to be 2.0, got {batch_doc['current_stock']}"
        
        print("Self-healing stock sync verification PASSED successfully!")

if __name__ == "__main__":
    asyncio.run(main())
