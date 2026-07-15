import asyncio
import httpx
import sys

async def test_brand_categories():
    print("Starting Brand to Category Resolution Tests...")
    
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Register a new Admin
        admin_username = f"admin_brand_{int(asyncio.get_event_loop().time())}"
        reg_admin_payload = {
            "username": admin_username,
            "password": "brandpassword123",
            "full_name": "Admin Brand User",
            "role": "admin",
            "company_name": "Brand Business"
        }
        reg_admin_res = await client.post("/api/auth/register", json=reg_admin_payload)
        assert reg_admin_res.status_code == 200, f"Admin registration failed: {reg_admin_res.text}"
        admin_data = reg_admin_res.json()
        print(f"Admin registered successfully. Tenant: {admin_data.get('tenant_id') or admin_data.get('company_code')}")
        
        # 2. Login
        login_res = await client.post("/api/auth/token", data={
            "username": admin_username,
            "password": "brandpassword123"
        })
        assert login_res.status_code == 200, "Login failed"
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 3. Create Product 1 with brand = "Sony"
        prod1_payload = {
            "name": "Sony Alpha 7",
            "brand": "Sony",
            "unit": "PCS",
            "purchase_price": 1000.0,
            "selling_price": 1200.0,
            "opening_stock": 10
        }
        create1_res = await client.post("/api/products/", json=prod1_payload, headers=headers)
        assert create1_res.status_code == 200, f"Product 1 creation failed: {create1_res.text}"
        prod1_data = create1_res.json()
        print("Product 1 created successfully.")
        
        # 4. Check if Category "Sony" was created
        cats_res = await client.get("/api/categories/", headers=headers)
        assert cats_res.status_code == 200, f"List categories failed: {cats_res.text}"
        cats = cats_res.json()
        print(f"Categories in tenant database: {[c['name'] for c in cats]}")
        
        sony_cat = next((c for c in cats if c["name"] == "Sony"), None)
        assert sony_cat is not None, "Category 'Sony' was not automatically created!"
        print(f"Verified Category 'Sony' exists with ID: {sony_cat['id']}")
        
        # Verify the product is linked to Category "Sony"
        prod1_get = await client.get(f"/api/products/{prod1_data['id']}", headers=headers)
        assert prod1_get.status_code == 200
        prod1_details = prod1_get.json()
        assert prod1_details["category_id"] == sony_cat["id"], "Product category_id was not linked!"
        assert prod1_details["category_name"] == "Sony", "Product category_name was not resolved!"
        print("Verified Product 1 category links are correct.")
        
        # 5. Create Product 2 with same brand = "Sony" to test reuse
        prod2_payload = {
            "name": "Sony FX3",
            "brand": "Sony",
            "unit": "PCS",
            "purchase_price": 2000.0,
            "selling_price": 2400.0,
            "opening_stock": 5
        }
        create2_res = await client.post("/api/products/", json=prod2_payload, headers=headers)
        assert create2_res.status_code == 200, f"Product 2 creation failed: {create2_res.text}"
        prod2_data = create2_res.json()
        
        # Fetch categories again and verify no new category was added
        cats_res = await client.get("/api/categories/", headers=headers)
        cats = cats_res.json()
        assert len([c for c in cats if c["name"] == "Sony"]) == 1, "Duplicate 'Sony' categories created!"
        print("Verified existing category is reused, no duplicate category created.")
        
        # 6. Update Product 2 brand to "Canon"
        update_res = await client.put(f"/api/products/{prod2_data['id']}", json={
            "brand": "Canon"
        }, headers=headers)
        assert update_res.status_code == 200, f"Update product failed: {update_res.text}"
        print("Updated Product 2 brand to Canon.")
        
        # Verify "Canon" category was created
        cats_res = await client.get("/api/categories/", headers=headers)
        cats = cats_res.json()
        canon_cat = next((c for c in cats if c["name"] == "Canon"), None)
        assert canon_cat is not None, "Category 'Canon' was not automatically created on update!"
        print(f"Verified Category 'Canon' exists with ID: {canon_cat['id']}")
        
        # Verify Product 2 is linked to "Canon"
        prod2_get = await client.get(f"/api/products/{prod2_data['id']}", headers=headers)
        assert prod2_get.status_code == 200
        prod2_details = prod2_get.json()
        assert prod2_details["category_id"] == canon_cat["id"]
        assert prod2_details["category_name"] == "Canon"
        print("Verified Product 2 category link updated correctly.")
        
        # Verify Product 1 is still linked to "Sony"
        prod1_get = await client.get(f"/api/products/{prod1_data['id']}", headers=headers)
        assert prod1_get.json()["category_id"] == sony_cat["id"]
        print("Verified Product 1 still linked to 'Sony'.")
        
        print("\nALL BRAND-CATEGORY VERIFICATION TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_brand_categories())
