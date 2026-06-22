import asyncio
import httpx
import sys

async def test_auth_refresh():
    print("Testing Authentication Refresh Flow...")
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        username = f"testuser_{int(asyncio.get_event_loop().time())}"
        reg_payload = {
            "username": username,
            "password": "testpassword123",
            "full_name": "Test User",
            "email": f"{username}@example.com",
            "role": "staff",
            "mobile": "9999999999"
        }
        reg_res = await client.post("/api/auth/register", json=reg_payload)
        print("Registration status:", reg_res.status_code, reg_res.json())
        assert reg_res.status_code in [200, 201], "Registration failed"
        
        login_payload = {
            "username": username,
            "password": "testpassword123"
        }
        login_res = await client.post("/api/auth/token", data=login_payload)
        print("Login status:", login_res.status_code)
        assert login_res.status_code == 200, "Login failed"
        
        tokens = login_res.json()
        access_token = tokens["access_token"]
        refresh_token = tokens["refresh_token"]
        assert access_token is not None
        assert refresh_token is not None
        print("Tokens received successfully!")
        
        refresh_payload = {
            "refresh_token": refresh_token
        }
        refresh_res = await client.post("/api/auth/refresh", json=refresh_payload)
        print("Refresh status:", refresh_res.status_code)
        assert refresh_res.status_code == 200, "Token refresh failed"
        
        new_tokens = refresh_res.json()
        assert new_tokens["access_token"] is not None
        assert new_tokens["refresh_token"] is not None
        print("Token rotation verified! New access and refresh tokens generated successfully.")

async def test_concurrency():
    print("\nTesting Concurrent Stock Depletion & Transactions...")
    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        username = f"saleuser_{int(asyncio.get_event_loop().time())}"
        reg_res = await client.post("/api/auth/register", json={
            "username": username,
            "password": "password123",
            "full_name": "Sale Tester",
            "email": f"{username}@example.com",
            "role": "admin",
            "mobile": "8888888888",
            "company_name": "Sale Test Business"
        })
        print("Registration status:", reg_res.status_code, reg_res.text)
        
        login_res = await client.post("/api/auth/token", data={"username": username, "password": "password123"})
        print("Login status:", login_res.status_code, login_res.text)
        auth_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}
        
        cat_res = await client.post("/api/categories/", json={"name": f"TestCat_{username}", "description": "desc"}, headers=auth_headers)
        cat_id = cat_res.json()["id"]
        
        prod_payload = {
            "name": f"Concurrent Pill {username}",
            "sku": f"SKU_{username}",
            "barcode": f"BC_{username}",
            "category_id": cat_id,
            "unit": "PCS",
            "purchase_price": 10.0,
            "selling_price": 15.0,
            "opening_stock": 0,
            "min_stock_alert": 2
        }
        prod_res = await client.post("/api/products/", json=prod_payload, headers=auth_headers)
        print("Product creation status:", prod_res.status_code)
        prod_id = prod_res.json()["id"]
        
        sup_res = await client.post("/api/suppliers/", json={"name": f"Sup_{username}", "mobile": "9999900000", "is_active": True}, headers=auth_headers)
        sup_id = sup_res.json()["id"]
        
        pur_payload = {
            "supplier_id": sup_id,
            "items": [
                {
                    "product_id": prod_id,
                    "product_name": f"Concurrent Pill {username}",
                    "quantity": 5.0,
                    "rate": 10.0,
                    "discount_percent": 0.0,
                    "gst_rate": 18.0,
                    "batch_no": "BATCH-001",
                    "expiry": "2030-12-31T00:00:00"
                }
            ],
            "paid_amount": 50.0,
            "payment_mode": "cash"
        }
        pur_res = await client.post("/api/purchases/", json=pur_payload, headers=auth_headers)
        print("Purchase recorded. Status:", pur_res.status_code)
        if pur_res.status_code != 200:
            print("Purchase error body:", pur_res.text)
        
        prod_query = await client.get(f"/api/products/{prod_id}", headers=auth_headers)
        print("Current product stock:", prod_query.json().get("current_stock"))
        
        sale_payload = {
            "customer_name": "Walk-in Customer",
            "items": [
                {
                    "product_id": prod_id,
                    "product_name": f"Concurrent Pill {username}",
                    "quantity": 1.0,
                    "rate": 15.0,
                    "gst_rate": 18.0,
                    "batch_no": "BATCH-001"
                }
            ],
            "paid_amount": 15.0,
            "payment_mode": "cash"
        }
        
        print("Firing 10 concurrent sale requests...")
        tasks = [client.post("/api/sales/", json=sale_payload, headers=auth_headers) for _ in range(10)]
        results = await asyncio.gather(*tasks)
        
        success_count = sum(1 for r in results if r.status_code == 200)
        fail_count = sum(1 for r in results if r.status_code == 400 or r.status_code == 409)
        print(f"Concurrent sale results: {success_count} succeeded, {fail_count} failed")
        
        assert success_count == 5, f"Expected exactly 5 successes, got {success_count}"
        assert fail_count == 5, f"Expected exactly 5 failures, got {fail_count}"
        
        prod_query_final = await client.get(f"/api/products/{prod_id}", headers=auth_headers)
        final_stock = prod_query_final.json().get("current_stock")
        print("Final stock level is:", final_stock)
        assert final_stock == 0, f"Expected final stock of 0, got {final_stock}"
        print("Concurrency and atomicity checks PASSED successfully!")

async def main():
    try:
        await test_auth_refresh()
        await test_concurrency()
        print("\nAll integration and verification tests PASSED!")
    except Exception as e:
        print(f"\nTest suite failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
