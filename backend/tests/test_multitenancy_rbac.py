import asyncio
import httpx
import sys

async def test_multitenancy_rbac():
    print("Starting Multi-Tenancy & RBAC Verification Tests...")
    
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000") as client:
        # 1. Register Admin A
        admin_username = f"admin_a_{int(asyncio.get_event_loop().time())}"
        reg_admin_payload = {
            "username": admin_username,
            "password": "adminpassword123",
            "full_name": "Admin A User",
            "role": "admin",
            "company_name": "Business A"
        }
        reg_admin_res = await client.post("/api/auth/register", json=reg_admin_payload)
        assert reg_admin_res.status_code == 200, f"Admin A registration failed: {reg_admin_res.text}"
        admin_data = reg_admin_res.json()
        company_code_a = admin_data["company_code"]
        assert len(company_code_a) == 6, f"Company code should be 6 characters, got {company_code_a}"
        print(f"Admin A registered successfully. Company Code: {company_code_a}")
        
        # 2. Login Admin A
        login_admin_res = await client.post("/api/auth/token", data={
            "username": admin_username,
            "password": "adminpassword123"
        })
        assert login_admin_res.status_code == 200, "Admin A login failed"
        admin_token = login_admin_res.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        
        # 3. Create Product in Business A
        prod_res_a = await client.post("/api/products/", json={
            "name": "Product A",
            "sku": f"SKU_A_{admin_username}",
            "unit": "PCS",
            "purchase_price": 10.0,
            "selling_price": 15.0,
            "opening_stock": 100,
            "min_stock_alert": 5
        }, headers=admin_headers)
        assert prod_res_a.status_code == 200, f"Failed to create product in Business A: {prod_res_a.text}"
        print("Product A created in Business A.")
        
        # 4. Register a user without Company Code (should succeed as Admin)
        another_username = f"admin_c_{int(asyncio.get_event_loop().time())}"
        reg_admin_success = await client.post("/api/auth/register", json={
            "username": another_username,
            "password": "adminpassword123",
            "full_name": "Admin C User"
        })
        assert reg_admin_success.status_code == 200, f"Registration failed: {reg_admin_success.text}"
        assert reg_admin_success.json()["role"] == "admin"
        print("Registration without Company Code registered as Admin successfully.")
        
        staff_username = f"staff_u_{int(asyncio.get_event_loop().time())}"
        
        # 5. Register Staff member with invalid Company Code (should fail)
        reg_staff_fail_2 = await client.post("/api/auth/register", json={
            "username": staff_username,
            "password": "staffpassword123",
            "full_name": "Staff User",
            "role": "staff",
            "company_code": "INVALID"
        })
        assert reg_staff_fail_2.status_code == 400
        print("Staff signup with invalid Company Code failed as expected.")
        
        # 6. Register Staff member with Admin A's Company Code (should succeed)
        reg_staff_res = await client.post("/api/auth/register", json={
            "username": staff_username,
            "password": "staffpassword123",
            "full_name": "Staff User A",
            "role": "staff",
            "company_code": company_code_a
        })
        assert reg_staff_res.status_code == 200, f"Staff registration failed: {reg_staff_res.text}"
        print("Staff User A registered successfully using Admin A's Company Code.")
        
        # 7. Login Staff User A (should fail because they are inactive by default)
        login_staff_fail_res = await client.post("/api/auth/token", data={
            "username": staff_username,
            "password": "staffpassword123"
        })
        assert login_staff_fail_res.status_code == 400, f"Expected 400 on inactive staff login, got {login_staff_fail_res.status_code}"
        assert "inactive" in login_staff_fail_res.json()["detail"].lower()
        print("Staff User A login blocked by default as expected (account inactive).")
        
        # 8. Admin A lists users (should contain Admin A and Staff A)
        users_res = await client.get("/api/users/", headers=admin_headers)
        assert users_res.status_code == 200
        users_list = users_res.json()
        print(f"Users listed by Admin A: {[u['username'] for u in users_list]}")
        staff_obj = next(u for u in users_list if u["username"] == staff_username)
        
        # 9. Admin A activates Staff User A
        activate_res = await client.put(f"/api/users/{staff_obj['id']}", json={
            "is_active": True
        }, headers=admin_headers)
        assert activate_res.status_code == 200, f"Admin failed to activate staff: {activate_res.text}"
        print("Admin A successfully activated Staff User A.")
        
        # 10. Login Staff User A (should now succeed)
        login_staff_res = await client.post("/api/auth/token", data={
            "username": staff_username,
            "password": "staffpassword123"
        })
        assert login_staff_res.status_code == 200, "Staff login failed after activation"
        staff_token = login_staff_res.json()["access_token"]
        staff_headers = {"Authorization": f"Bearer {staff_token}"}
        
        # 11. Check Staff A access to settings (should fail by default)
        settings_update_res = await client.put("/api/settings/company", json={
            "company_name": "Hack Business A"
        }, headers=staff_headers)
        assert settings_update_res.status_code == 403, f"Expected 403 on settings update for staff, got {settings_update_res.status_code}"
        print("Staff settings update blocked as expected (403 Forbidden).")
        
        # 12. Admin A grants settings update permission to Staff A
        current_permissions = staff_obj.get("permissions", {})
        current_permissions["can_manage_settings"] = True
        update_perm_res = await client.put(f"/api/users/{staff_obj['id']}", json={
            "permissions": current_permissions
        }, headers=admin_headers)
        assert update_perm_res.status_code == 200, f"Admin failed to update staff permissions: {update_perm_res.text}"
        print("Admin A granted 'can_manage_settings' permission to Staff A.")
        
        # Verification that permission change took place and works immediately
        settings_update_success = await client.put("/api/settings/company", json={
            "company_name": "Updated Business A"
        }, headers=staff_headers)
        assert settings_update_success.status_code == 200, f"Staff should now be able to update settings, got: {settings_update_success.status_code} - {settings_update_success.text}"
        # Staff A successfully updated settings after permission grant.

        # 13. Grant can_create_sales=True and can_view_sales=False to Staff User A
        current_permissions["can_manage_settings"] = False
        current_permissions["can_create_sales"] = True
        current_permissions["can_view_sales"] = False
        update_perm_res = await client.put(f"/api/users/{staff_obj['id']}", json={
            "permissions": current_permissions
        }, headers=admin_headers)
        assert update_perm_res.status_code == 200
        
        # Staff A lists sales invoices (should succeed under relaxed rules)
        list_sales_res = await client.get("/api/sales/", headers=staff_headers)
        assert list_sales_res.status_code == 200, f"Expected 200 on list sales for staff with can_create_sales, got {list_sales_res.status_code}"
        print("Staff User A listed sales successfully (having only can_create_sales).")
        
        # Staff A creates a customer (to create a sale)
        cust_res = await client.post("/api/customers/", json={
            "name": "Test Customer",
            "opening_balance": 0.0
        }, headers=staff_headers)
        assert cust_res.status_code == 200
        cust_id = cust_res.json()["id"]
        
        # Staff A creates a sale
        sale_res = await client.post("/api/sales/", json={
            "customer_id": cust_id,
            "items": [
                {
                    "product_id": prod_res_a.json()["id"],
                    "product_name": "Product A",
                    "quantity": 1,
                    "rate": 15.0,
                    "gst_rate": 18
                }
            ],
            "paid_amount": 15.0,
            "payment_mode": "cash"
        }, headers=staff_headers)
        assert sale_res.status_code == 200, f"Failed to create sale: {sale_res.text}"
        sale_id = sale_res.json()["id"]
        
        # Staff A fetches sale details (should succeed under relaxed rules)
        get_sale_res = await client.get(f"/api/sales/{sale_id}", headers=staff_headers)
        assert get_sale_res.status_code == 200
        
        # Staff A prints sale PDF (should succeed under relaxed rules)
        pdf_res = await client.get(f"/api/sales/{sale_id}/pdf", headers=staff_headers)
        assert pdf_res.status_code == 200
        print("Staff User A successfully fetched sale PDF and details with only can_create_sales permission.")

        
        # 11. Register Admin B (new business)
        admin_username_b = f"admin_b_{int(asyncio.get_event_loop().time())}"
        reg_admin_b_res = await client.post("/api/auth/register", json={
            "username": admin_username_b,
            "password": "adminpassword123",
            "full_name": "Admin B User",
            "role": "admin",
            "company_name": "Business B"
        })
        assert reg_admin_b_res.status_code == 200
        company_code_b = reg_admin_b_res.json()["company_code"]
        print(f"Admin B registered successfully. Company Code: {company_code_b}")
        
        # Login Admin B
        login_admin_b_res = await client.post("/api/auth/token", data={
            "username": admin_username_b,
            "password": "adminpassword123"
        })
        admin_headers_b = {"Authorization": f"Bearer {login_admin_b_res.json()['access_token']}"}
        
        # Admin B lists products (should be empty for new business, NOT containing Product A!)
        prods_b_res = await client.get("/api/products/", headers=admin_headers_b)
        assert prods_b_res.status_code == 200
        prods_b_data = prods_b_res.json()
        print(f"Products found in Business B: {prods_b_data}")
        assert len(prods_b_data["items"]) == 0, f"Expected 0 products in Business B, found {len(prods_b_data['items'])}"
        print("Data isolation confirmed! Business B does not see products from Business A.")

        print("\nAll Multi-Tenancy & RBAC Verification Tests PASSED!")

if __name__ == "__main__":
    import traceback
    try:
        asyncio.run(test_multitenancy_rbac())
    except Exception as e:
        traceback.print_exc()
        sys.exit(1)
