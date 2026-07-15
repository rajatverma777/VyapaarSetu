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

async def test_returns_trace():
    client_db = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client_db[settings.MONGODB_DB_NAME]
    
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Register and login
        username = f"traceuser_{int(asyncio.get_event_loop().time())}"
        reg_res = await client.post("/api/auth/register", json={
            "username": username,
            "password": "password123",
            "full_name": "Traceability Tester",
            "email": f"{username}@example.com",
            "role": "admin",
            "mobile": "9999988888"
        })
        assert reg_res.status_code == 200
        
        login_res = await client.post("/api/auth/token", data={"username": username, "password": "password123"})
        assert login_res.status_code == 200
        login_data = login_res.json()
        tenant_id = login_data["user"]["tenant_id"]
        auth_headers = {"Authorization": f"Bearer {login_data['access_token']}"}
        
        # 2. Insert test Customer & Supplier
        cust_id = ObjectId()
        await db.customers.insert_one({
            "_id": cust_id,
            "name": f"Cust_{username}",
            "mobile": "9876543210",
            "email": "cust@test.com",
            "current_balance": 0.0,
            "is_active": True,
            "tenant_id": tenant_id
        })

        supp_id = ObjectId()
        await db.suppliers.insert_one({
            "_id": supp_id,
            "name": f"Supp_{username}",
            "mobile": "8765432109",
            "email": "supp@test.com",
            "current_balance": 0.0,
            "is_active": True,
            "tenant_id": tenant_id
        })

        # 3. Insert test Product & Batch
        prod_id = ObjectId()
        await db.products.insert_one({
            "_id": prod_id,
            "name": f"Amlodipine {username}",
            "brand": "Care Brand",
            "sku": f"SKU_{username}",
            "barcode": f"BC_{username}",
            "unit": "PCS",
            "purchase_price": 50.0,
            "selling_price": 75.0,
            "gst_rate": 12.0,
            "current_stock": 20.0,
            "is_active": True,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "tenant_id": tenant_id
        })

        batch_no = f"BT-{username[:6].upper()}-99"
        await db.batches.insert_one({
            "product_id": str(prod_id),
            "batch_no": batch_no,
            "current_stock": 20.0,
            "expiry": datetime(2028, 12, 31),
            "purchase_price": 50.0,
            "created_at": datetime.utcnow(),
            "tenant_id": tenant_id
        })

        print("--- Setup Complete ---")
        print(f"Product ID: {prod_id}, Batch No: {batch_no}")

        # 4. Perform a Sale of 5 units (to get a purchase/sale history)
        sale_payload = {
            "customer_id": str(cust_id),
            "customer_name": f"Cust_{username}",
            "items": [
                {
                    "product_id": str(prod_id),
                    "product_name": f"Amlodipine {username}",
                    "quantity": 5.0,
                    "rate": 75.0,
                    "gst_rate": 12.0,
                    "batch_no": batch_no
                }
            ],
            "paid_amount": 0.0, # outstanding credit sale
            "payment_mode": "credit"
        }
        sale_res = await client.post("/api/sales/", json=sale_payload, headers=auth_headers)
        assert sale_res.status_code == 200
        sale_data = sale_res.json()
        sale_id = sale_data["id"]
        print(f"Sale recorded. Sale ID: {sale_id}")

        # Verify stock decreased
        prod_doc = await db.products.find_one({"_id": prod_id})
        batch_doc = await db.batches.find_one({"product_id": str(prod_id), "batch_no": batch_no})
        print(f"Stock after sale: Product={prod_doc['current_stock']}, Batch={batch_doc['current_stock']}")
        assert prod_doc["current_stock"] == 15.0
        assert batch_doc["current_stock"] == 15.0

        # 5. Customer Return (Credit Note) - Customer returns 2 units
        return_payload = {
            "type": "customer",
            "party_id": str(cust_id),
            "reference_id": sale_data["invoice_number"],
            "items": [
                {
                    "product_id": str(prod_id),
                    "product_name": f"Amlodipine {username}",
                    "quantity": 2.0,
                    "rate": 75.0,
                    "gst_rate": 12.0,
                    "batch_no": batch_no,
                    "reason": "Expired Stock"
                }
            ],
            "paid_amount": 0.0
        }
        ret_res = await client.post("/api/returns/customer", json=return_payload, headers=auth_headers)
        assert ret_res.status_code == 200
        ret_data = ret_res.json()
        print(f"Customer Return recorded. CN Note No: {ret_data['note_number']}")

        # Verify stock increased back
        prod_doc = await db.products.find_one({"_id": prod_id})
        batch_doc = await db.batches.find_one({"product_id": str(prod_id), "batch_no": batch_no})
        print(f"Stock after customer return: Product={prod_doc['current_stock']}, Batch={batch_doc['current_stock']}")
        assert prod_doc["current_stock"] == 17.0
        assert batch_doc["current_stock"] == 17.0

        # Verify customer ledger was updated (Credit note amount round(2*75 * 1.12) = 168.0)
        cust_doc = await db.customers.find_one({"_id": cust_id})
        print(f"Customer outstanding balance: {cust_doc['current_balance']}")
        # Sale total was 5 * 75 * 1.12 = 420.0. Return was 168.0. Outstanding balance = 252.0.
        assert cust_doc["current_balance"] == 252.0

        # 6. Supplier Return (Debit Note) - We return 10 units to supplier
        supp_ret_payload = {
            "type": "supplier",
            "party_id": str(supp_id),
            "items": [
                {
                    "product_id": str(prod_id),
                    "product_name": f"Amlodipine {username}",
                    "quantity": 10.0,
                    "rate": 50.0,
                    "gst_rate": 12.0,
                    "batch_no": batch_no,
                    "reason": "Damaged in Storage"
                }
            ],
            "paid_amount": 0.0
        }
        supp_ret_res = await client.post("/api/returns/supplier", json=supp_ret_payload, headers=auth_headers)
        assert supp_ret_res.status_code == 200
        supp_ret_data = supp_ret_res.json()
        print(f"Supplier Return recorded. DN Note No: {supp_ret_data['note_number']}")

        # Verify stock decreased
        prod_doc = await db.products.find_one({"_id": prod_id})
        batch_doc = await db.batches.find_one({"product_id": str(prod_id), "batch_no": batch_no})
        print(f"Stock after supplier return: Product={prod_doc['current_stock']}, Batch={batch_doc['current_stock']}")
        assert prod_doc["current_stock"] == 7.0
        assert batch_doc["current_stock"] == 7.0

        # Verify supplier balance was updated
        supp_doc = await db.suppliers.find_one({"_id": supp_id})
        print(f"Supplier balance (outstanding payable): {supp_doc['current_balance']}")
        # Return total was 10 * 50 * 1.12 = 560.0. Payables decrease by 560.0 -> balance = -560.0
        assert supp_doc["current_balance"] == -560.0

        # 7. Traceability Check - Brand Analytics
        brand_res = await client.get("/api/traceability/brand", headers=auth_headers)
        assert brand_res.status_code == 200
        brand_data = brand_res.json()
        care_brand = next((b for b in brand_data if b["brand"] == "Care Brand"), None)
        print("Brand tracking report for Care Brand:", care_brand)
        assert care_brand is not None
        assert care_brand["quantity"] == 5.0 # sales quantity

        # 7b. Traceability Check - Brand Sales Details
        brand_sales_res = await client.get(f"/api/traceability/brand/sales?brand=Care Brand", headers=auth_headers)
        assert brand_sales_res.status_code == 200
        brand_sales_data = brand_sales_res.json()
        print(f"Brand sales count for Care Brand: {len(brand_sales_data)}")
        assert len(brand_sales_data) == 1
        assert brand_sales_data[0]["product_name"] == f"Amlodipine {username}"
        assert brand_sales_data[0]["customer_name"] == f"Cust_{username}"
        assert brand_sales_data[0]["invoice_number"] == sale_data["invoice_number"]

        # 8. Traceability Check - Product trace
        prod_trace_res = await client.get(f"/api/traceability/product/{prod_id}", headers=auth_headers)
        assert prod_trace_res.status_code == 200
        prod_trace = prod_trace_res.json()
        print(f"Product traceability customer summary count: {len(prod_trace['customer_summary'])}")
        assert len(prod_trace["customer_summary"]) == 1
        assert prod_trace["customer_summary"][0]["customer_name"] == f"Cust_{username}"

        # 9. Traceability Check - Batch Trace
        batch_trace_res = await client.get(f"/api/traceability/batch/{batch_no}", headers=auth_headers)
        assert batch_trace_res.status_code == 200
        batch_trace = batch_trace_res.json()
        print(f"Batch distribution count: {len(batch_trace['distribution'])}")
        assert len(batch_trace["distribution"]) == 1

        # 10. Recall Batch
        recall_res = await client.post("/api/traceability/recall", json={
            "batch_no": batch_no,
            "reason": "Mislabeled Batch Info",
            "notes": "Testing recall pipeline"
        }, headers=auth_headers)
        assert recall_res.status_code == 200
        recall_data = recall_res.json()
        print(f"Recall reports. Affected customers: {recall_data['affected_customers']}")
        assert len(recall_data["affected_customers"]) == 1
        assert recall_data["affected_customers"][0]["customer_name"] == f"Cust_{username}"

        # Cleanup test DB documents
        await db.customers.delete_one({"_id": cust_id})
        await db.suppliers.delete_one({"_id": supp_id})
        await db.products.delete_one({"_id": prod_id})
        await db.batches.delete_one({"product_id": str(prod_id), "batch_no": batch_no})
        await db.sales.delete_one({"_id": ObjectId(sale_id)})
        await db.returns.delete_one({"_id": ObjectId(ret_data["id"])})
        await db.returns.delete_one({"_id": ObjectId(supp_ret_data["id"])})
        await db.recalls.delete_one({"_id": ObjectId(recall_data["recall_id"])})
        await db.ledger.delete_many({"reference_id": {"$in": [sale_id, ret_data["id"], supp_ret_data["id"]]}})
        await db.stock_logs.delete_many({"reference_id": {"$in": [sale_id, ret_data["id"], supp_ret_data["id"]]}})
        await db.users.delete_one({"username": username})
        
        print("ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_returns_trace())
