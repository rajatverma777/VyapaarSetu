import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException

from app.core.database import TenantCollection, TenantDatabase
from app.services.inventory_service import InventoryService
from app.services.payment_service import PaymentService
from app.services.ai_import_service import AIImportService
from app.core.transaction import UnitOfWork

class MockCursor:
    def __init__(self, items):
        self.items = items
    def sort(self, *args, **kwargs):
        return self
    def skip(self, *args, **kwargs):
        return self
    def limit(self, *args, **kwargs):
        return self
    async def to_list(self, length=None):
        return self.items[:length] if length else self.items

@pytest.mark.asyncio
async def test_tenant_collection_tenant_injection():
    mock_raw_col = MagicMock()
    mock_raw_col.find_one = AsyncMock(return_value={"_id": "1", "name": "Test", "tenant_id": "TENANT_A"})
    mock_raw_col.find_one_and_update = AsyncMock(return_value={"_id": "1", "seq": 1, "tenant_id": "TENANT_A"})

    tenant_col = TenantCollection(mock_raw_col, "TENANT_A")

    # 1. find_one
    await tenant_col.find_one({"sku": "SKU01"})
    mock_raw_col.find_one.assert_called_once()
    called_filter = mock_raw_col.find_one.call_args[0][0]
    assert called_filter["tenant_id"] == "TENANT_A"
    assert called_filter["sku"] == "SKU01"

    # 2. find_one_and_update
    await tenant_col.find_one_and_update({"_id": "counter_key"}, {"$inc": {"seq": 1}})
    called_update_filter = mock_raw_col.find_one_and_update.call_args[0][0]
    assert called_update_filter["tenant_id"] == "TENANT_A"
    assert called_update_filter["_id"] == "counter_key"

@pytest.mark.asyncio
async def test_inventory_fefo_and_overselling():
    # Setup mock DB
    mock_db = MagicMock()
    
    # Product with current stock = 15
    product_doc = {
        "_id": "prod_1",
        "name": "Amoxicillin 500mg",
        "current_stock": 15.0,
        "tenant_id": "TENANT_1"
    }

    # Batches: Batch A expires sooner (5 units), Batch B expires later (10 units)
    today = datetime.utcnow()
    batch_a = {
        "_id": "batch_1",
        "product_id": "prod_1",
        "batch_no": "B_EARLY",
        "expiry": today + timedelta(days=30),
        "current_stock": 5.0,
        "tenant_id": "TENANT_1"
    }
    batch_b = {
        "_id": "batch_2",
        "product_id": "prod_1",
        "batch_no": "B_LATE",
        "expiry": today + timedelta(days=180),
        "current_stock": 10.0,
        "tenant_id": "TENANT_1"
    }

    # Repositories mock setup
    mock_db.__getitem__.side_effect = lambda name: getattr(mock_db, name)
    mock_db.products.find_one = AsyncMock(return_value=product_doc)
    mock_db.products.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    
    mock_db.batches.find = MagicMock(return_value=MockCursor([batch_a, batch_b]))
    mock_db.batches.update_one = AsyncMock(return_value=MagicMock(modified_count=1, acknowledged=True))
    mock_db.stock_logs.insert_one = AsyncMock(return_value=MagicMock(inserted_id="log_1"))

    service = InventoryService(mock_db, "TENANT_1")

    # 1. Deduct 8 units via FEFO (5 should come from B_EARLY, 3 from B_LATE)
    allocated = await service.deduct_stock(
        product_id="prod_1",
        quantity=8.0,
        reason="sale",
        user_id="user_admin"
    )

    assert len(allocated) == 2
    assert allocated[0]["batch_no"] == "B_EARLY"
    assert allocated[0]["quantity"] == 5.0
    assert allocated[1]["batch_no"] == "B_LATE"
    assert allocated[1]["quantity"] == 3.0

    # 2. Overselling test: Attempt to deduct more than product has
    mock_db.products.update_one = AsyncMock(return_value=MagicMock(modified_count=0))
    with pytest.raises(HTTPException) as exc_info:
        await service.deduct_stock(
            product_id="prod_1",
            quantity=50.0,
            reason="sale"
        )
    assert exc_info.value.status_code == 400
    assert "Insufficient stock" in exc_info.value.detail

@pytest.mark.asyncio
async def test_payment_service_balance_and_ledger():
    mock_db = MagicMock()
    mock_db.__getitem__.side_effect = lambda name: getattr(mock_db, name)
    customer_doc = {
        "_id": "cust_1",
        "name": "Metro Pharmacy",
        "current_balance": 5000.0,
        "tenant_id": "TENANT_1"
    }
    mock_db.customers.find_one = AsyncMock(return_value=customer_doc)
    mock_db.customers.find_one_and_update = AsyncMock(return_value={"current_balance": 3000.0})
    mock_db.payments.insert_one = AsyncMock(return_value=MagicMock(inserted_id="pay_123"))
    mock_db.ledger.insert_one = AsyncMock(return_value=MagicMock(inserted_id="led_123"))

    service = PaymentService(mock_db, "TENANT_1")
    res = await service.record_payment(
        party_id="cust_1",
        party_type="customer",
        amount=2000.0,
        payment_mode="upi",
        payment_type="received"
    )

    assert res["amount"] == 2000.0
    assert res["party_name"] == "Metro Pharmacy"
    mock_db.customers.find_one_and_update.assert_called_once()
    mock_db.ledger.insert_one.assert_called_once()

def test_ai_import_fuzzy_matching_worker():
    db_products = [
        {"_id": "p1", "name": "Paracetamol 500mg Tablets"},
        {"_id": "p2", "name": "Amoxicillin 250mg Capsules"},
        {"_id": "p3", "name": "Cetirizine 10mg Strip"}
    ]
    items = [
        {"name": "Paracetamol 500mg Tab", "quantity": 10, "purchase_rate": 15.0},
        {"name": "Unknown Product XYZ", "quantity": 2, "purchase_rate": 50.0}
    ]

    matched = AIImportService._match_items_worker(items, db_products)
    assert len(matched) == 2
    
    # First item should match Paracetamol
    p1_match = matched[0]
    assert p1_match["match_type"] in ["suggested", "exact"]
    assert p1_match["confidence"] >= 70
    assert p1_match["matched_product"]["name"] == "Paracetamol 500mg Tablets"

    # Second item should have no match
    p2_match = matched[1]
    assert p2_match["match_type"] == "none"

from app.services.sale_service import SaleService
from app.models.transaction import SaleCreate, SaleItem

@pytest.mark.asyncio
async def test_sale_service_full_workflow():
    mock_db = MagicMock()
    mock_db.__getitem__.side_effect = lambda name: getattr(mock_db, name)

    # Product with stock 50
    prod_doc = {
        "_id": "p_100",
        "name": "Paracetamol 650",
        "current_stock": 50.0,
        "tenant_id": "T1"
    }
    batch_doc = {
        "_id": "b_100",
        "product_id": "p_100",
        "batch_no": "B1",
        "expiry": datetime.utcnow() + timedelta(days=60),
        "current_stock": 50.0,
        "tenant_id": "T1"
    }
    cust_doc = {
        "_id": "c_100",
        "name": "City Hospital",
        "current_balance": 1000.0,
        "tenant_id": "T1"
    }

    mock_db.products.find_one = AsyncMock(return_value=prod_doc)
    mock_db.products.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    mock_db.batches.find = MagicMock(return_value=MockCursor([batch_doc]))
    mock_db.batches.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
    mock_db.stock_logs.insert_one = AsyncMock(return_value=MagicMock(inserted_id="log_100"))
    mock_db.counters.find_one_and_update = AsyncMock(return_value={"seq": 42})
    mock_db.customers.find_one = AsyncMock(return_value=cust_doc)
    mock_db.customers.find_one_and_update = AsyncMock(return_value={"current_balance": 1280.0})
    mock_db.sales.insert_one = AsyncMock(return_value=MagicMock(inserted_id="sale_100"))
    mock_db.ledger.insert_one = AsyncMock(return_value=MagicMock(inserted_id="led_100"))
    mock_db.payments.insert_one = AsyncMock(return_value=MagicMock(inserted_id="pay_100"))

    sale_service = SaleService(mock_db, "T1")

    sale_data = SaleCreate(
        customer_id="c_100",
        customer_name="City Hospital",
        items=[
            SaleItem(
                product_id="p_100",
                product_name="Paracetamol 650",
                quantity=10.0,
                rate=25.0,
                gst_rate=12.0
            )
        ],
        payment_mode="upi",
        paid_amount=280.0
    )

    current_user = {"_id": "user_100", "full_name": "Cashier Ram"}
    result = await sale_service.create_sale(sale_data, current_user)

    assert result["message"] == "Sale created successfully"
    assert result["invoice_number"] == "INV-" + datetime.utcnow().strftime("%y%m") + "-0042"
    assert result["subtotal"] == 250.0
    assert result["total_amount"] == 280.0
    assert result["status"] == "paid"
    mock_db.sales.insert_one.assert_called_once()
    mock_db.customers.find_one_and_update.assert_called_once()


@pytest.mark.asyncio
async def test_cross_tenant_isolation_boundary():
    """Verify that Tenant A and Tenant B data cannot bleed or be accessed across tenants."""
    from app.repositories.inventory_repo import ProductRepository
    from app.repositories.party_repo import CustomerRepository

    # Database state simulation
    store = {
        "products": [],
        "customers": []
    }

    class MockCollection:
        def __init__(self, name):
            self.name = name

        async def find_one(self, filter_query, *args, **kwargs):
            for doc in store[self.name]:
                match = True
                for k, v in filter_query.items():
                    if doc.get(k) != v:
                        match = False
                        break
                if match:
                    return doc.copy()
            return None

        async def insert_one(self, doc, *args, **kwargs):
            store[self.name].append(doc.copy())
            return MagicMock(inserted_id=doc.get("_id", "gen_id"))

        async def delete_one(self, filter_query, *args, **kwargs):
            initial_len = len(store[self.name])
            store[self.name] = [
                d for d in store[self.name]
                if not all(d.get(k) == v for k, v in filter_query.items())
            ]
            deleted_count = initial_len - len(store[self.name])
            return MagicMock(deleted_count=deleted_count)

    class MockDB:
        def __init__(self):
            self.products = MockCollection("products")
            self.customers = MockCollection("customers")
            self.audit_logs = MockCollection("audit_logs")

        def __getitem__(self, item):
            return getattr(self, item)

    mock_db = MockDB()

    prod_repo_A = ProductRepository(mock_db, "TENANT_A")
    prod_repo_B = ProductRepository(mock_db, "TENANT_B")
    cust_repo_A = CustomerRepository(mock_db, "TENANT_A")
    cust_repo_B = CustomerRepository(mock_db, "TENANT_B")

    # Tenant A creates product & customer
    prod_id_A = await prod_repo_A.create({"_id": "prod_1", "sku": "SKU-A", "name": "Tenant A Product"})
    cust_id_A = await cust_repo_A.create({"_id": "cust_1", "name": "Tenant A Customer"})

    prod_A = await prod_repo_A.get_by_id("prod_1")
    cust_A = await cust_repo_A.get_by_id("cust_1")
    assert prod_A["tenant_id"] == "TENANT_A"
    assert cust_A["tenant_id"] == "TENANT_A"

    # Tenant B attempts to read Tenant A's product
    read_by_B = await prod_repo_B.get_by_id("prod_1")
    assert read_by_B is None, "Tenant B must NOT be able to read Tenant A product"

    # Tenant B attempts to find by SKU
    sku_by_B = await prod_repo_B.get_by_sku("SKU-A")
    assert sku_by_B is None, "Tenant B must NOT find Tenant A SKU"

    # Tenant B attempts to delete Tenant A's customer
    del_res = await cust_repo_B.delete_by_id("cust_1")
    assert del_res is False, "Tenant B must NOT be able to delete Tenant A customer"

    # Verify customer still exists for Tenant A
    read_by_A = await cust_repo_A.get_by_id("cust_1")
    assert read_by_A is not None, "Tenant A's customer must remain intact"


@pytest.mark.asyncio
async def test_audit_service_logging_and_redaction():
    """Verify that AuditService logs immutable events and redacts credentials."""
    from app.services.audit_service import AuditService

    saved_logs = []

    class MockAuditCollection:
        async def insert_one(self, doc, *args, **kwargs):
            saved_logs.append(doc.copy())
            return MagicMock(inserted_id="log_123")

    class MockAuditDB:
        def __init__(self):
            self.audit_logs = MockAuditCollection()

        def __getitem__(self, item):
            return getattr(self, item)

    mock_db = MockAuditDB()
    audit_service = AuditService(mock_db, "TENANT_AUDIT")
    
    log_id = await audit_service.log_action(
        user_id="user_admin",
        action="UPDATE_USER",
        resource="users",
        resource_id="user_target",
        old_value={"username": "alice", "password": "SuperSecretPassword123"},
        new_value={"username": "alice", "password": "NewSecretPassword456"},
        details={"reason": "Password reset"},
        ip_address="192.168.1.1",
        request_id="req-abc-123"
    )

    assert log_id == "log_123"
    assert len(saved_logs) == 1
    logged = saved_logs[0]
    assert logged["tenant_id"] == "TENANT_AUDIT"
    assert logged["user_id"] == "user_admin"
    assert logged["action"] == "UPDATE_USER"
    assert logged["old_value"]["password"] == "[REDACTED]"
    assert logged["new_value"]["password"] == "[REDACTED]"
    assert logged["request_id"] == "req-abc-123"


def test_feature_flags_and_plans():
    """Verify SaaS tier entitlements and custom tenant overrides."""
    from app.core.features import FeatureManager, FeatureFlag, SubscriptionPlan

    # Free plan tests
    assert FeatureManager.is_feature_enabled(FeatureFlag.BATCH_EXPIRY_TRACKING, SubscriptionPlan.FREE.value) is True
    assert FeatureManager.is_feature_enabled(FeatureFlag.AI_COPILOT, SubscriptionPlan.FREE.value) is False
    assert FeatureManager.is_feature_enabled(FeatureFlag.OCR_IMPORT, SubscriptionPlan.FREE.value) is False

    # Standard plan tests
    assert FeatureManager.is_feature_enabled(FeatureFlag.OCR_IMPORT, SubscriptionPlan.STANDARD.value) is True
    assert FeatureManager.is_feature_enabled(FeatureFlag.AI_COPILOT, SubscriptionPlan.STANDARD.value) is False

    # Enterprise plan tests
    assert FeatureManager.is_feature_enabled(FeatureFlag.AI_COPILOT, SubscriptionPlan.ENTERPRISE.value) is True
    assert FeatureManager.is_feature_enabled(FeatureFlag.BANK_RECONCILIATION, SubscriptionPlan.ENTERPRISE.value) is True

    # Custom override test (Free tier customer enabled for OCR import via special license)
    assert FeatureManager.is_feature_enabled(
        FeatureFlag.OCR_IMPORT,
        plan=SubscriptionPlan.FREE.value,
        tenant_overrides={"ocr_import": True}
    ) is True
