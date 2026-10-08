# VyapaarSetu Database & Multi-Tenancy Design

## 1. Multi-Tenancy Architecture

VyapaarSetu utilizes a **Shared Database, Discriminator Column (Pooled Storage)** strategy with strict logical isolation enforced at the data access layer:

```
Organization / Tenant (tenant_id: e.g. "CARE01")
 ├── Users (scoped to tenant_id; admin/staff)
 ├── Products (SKU unique per tenant_id)
 ├── Batches (batch_no unique per [tenant_id, product_id])
 ├── Customers (mobile unique/sparse per tenant_id)
 ├── Suppliers (GSTIN/mobile per tenant_id)
 ├── Sales & Invoices (invoice_number unique per [tenant_id, prefix])
 ├── Purchases (bill_number unique per tenant_id)
 ├── Payments (payment_voucher unique per tenant_id)
 ├── Ledger (double-entry tracking per party_id and tenant_id)
 ├── Stock Logs (immutable audit trail of inventory delta)
 ├── Documents & Templates
 └── Settings & Counters
```

### 1.1 Tenant Context Ingestion
- `tenant_id` is extracted strictly from the verified JWT payload on the server.
- The client cannot supply, modify, or override `tenant_id` via request body or URL query parameters.
- Repositories automatically enforce `{"tenant_id": current_tenant}` on all queries.

---

## 2. Collections & Schema Structure

### 2.1 `products`
```json
{
  "_id": ObjectId("..."),
  "tenant_id": "ORG101",
  "name": "Paracetamol 500mg Strip",
  "sku": "PARA-500",
  "barcode": "8901234567890",
  "category_id": "CAT001",
  "brand": "Cipla",
  "unit": "STRIP",
  "hsn_code": "300490",
  "gst_rate": 12.0,
  "purchase_price": 18.50,
  "selling_price": 25.00,
  "mrp": 28.00,
  "wholesale_price": 22.00,
  "current_stock": 150.0,
  "min_stock_alert": 20.0,
  "is_active": true,
  "created_at": ISODate("2026-10-01T00:00:00Z"),
  "updated_at": ISODate("2026-10-01T00:00:00Z")
}
```

### 2.2 `batches`
```json
{
  "_id": ObjectId("..."),
  "tenant_id": "ORG101",
  "product_id": "PROD001",
  "batch_no": "B2409",
  "expiry": ISODate("2027-05-31T23:59:59Z"),
  "purchase_price": 18.50,
  "selling_price": 25.00,
  "mrp": 28.00,
  "current_stock": 50.0,
  "created_at": ISODate("2026-10-01T00:00:00Z")
}
```

### 2.3 `sales`
```json
{
  "_id": ObjectId("..."),
  "tenant_id": "ORG101",
  "invoice_number": "INV-2610-0042",
  "customer_id": "CUST001",
  "customer_name": "Apollo Clinic",
  "sale_date": ISODate("2026-10-08T10:15:00Z"),
  "sale_type": "sale",
  "items": [
    {
      "product_id": "PROD001",
      "product_name": "Paracetamol 500mg Strip",
      "batch_no": "B2409",
      "quantity": 10.0,
      "rate": 25.00,
      "discount_percent": 0.0,
      "discount_amount": 0.0,
      "taxable_amount": 250.00,
      "gst_rate": 12.0,
      "cgst_rate": 6.0,
      "sgst_rate": 6.0,
      "igst_rate": 0.0,
      "cgst_amount": 15.00,
      "sgst_amount": 15.00,
      "igst_amount": 0.00,
      "total_amount": 280.00
    }
  ],
  "subtotal": 250.00,
  "discount_amount": 0.00,
  "taxable_amount": 250.00,
  "total_cgst": 15.00,
  "total_sgst": 15.00,
  "total_igst": 0.00,
  "total_tax": 30.00,
  "round_off": 0.00,
  "total_amount": 280.00,
  "paid_amount": 280.00,
  "balance_amount": 0.00,
  "payment_mode": "upi",
  "status": "paid",
  "created_by": "USER001",
  "created_at": ISODate("2026-10-08T10:15:00Z")
}
```

### 2.4 `stock_logs`
```json
{
  "_id": ObjectId("..."),
  "tenant_id": "ORG101",
  "product_id": "PROD001",
  "product_name": "Paracetamol 500mg Strip",
  "batch_no": "B2409",
  "change_type": "sale",
  "quantity_delta": -10.0,
  "stock_before": 60.0,
  "stock_after": 50.0,
  "reference_id": "INV-2610-0042",
  "reason": "Sale invoice generation",
  "performed_by": "USER001",
  "created_at": ISODate("2026-10-08T10:15:00Z")
}
```

---

## 3. Index Strategy: Correct Compound Tenant Scoping

To ensure complete tenant boundary enforcement, low query latency, and prevent global collisions:

| Collection | Index Specification | Type | Rationale |
| :--- | :--- | :--- | :--- |
| `products` | `[("tenant_id", 1), ("sku", 1)]` | Unique, Sparse | Permits different tenants to have the same SKU. |
| `products` | `[("tenant_id", 1), ("barcode", 1)]` | Sparse | Barcode scanner lookup per tenant. |
| `products` | `[("tenant_id", 1), ("name", 1)]` | Standard | Alphabetical sorting & lookups. |
| `batches` | `[("tenant_id", 1), ("product_id", 1), ("batch_no", 1)]` | Unique | Unique batch number per product within tenant. |
| `batches` | `[("tenant_id", 1), ("product_id", 1), ("expiry", 1)]` | Standard | FEFO (First Expired First Out) stock deduction. |
| `sales` | `[("tenant_id", 1), ("invoice_number", 1)]` | Unique | Tenant-scoped invoice uniqueness. |
| `sales` | `[("tenant_id", 1), ("customer_id", 1), ("sale_date", -1)]` | Standard | Customer purchase history query optimization. |
| `ledger` | `[("tenant_id", 1), ("party_id", 1), ("date", -1)]` | Standard | High-frequency account statement rendering. |
| `stock_logs`| `[("tenant_id", 1), ("product_id", 1), ("created_at", -1)]` | Standard | Audit trail inspection. |
| `counters` | `[("tenant_id", 1), ("name", 1)]` | Unique | Atomic invoice numbering counters. |

---

## 4. Atomic MongoDB Transactions (Unit of Work)

All financial and inventory mutations are executed within a session transaction:
```python
async with await client.start_session() as session:
    async with session.start_transaction():
        # 1. Deduct Product & Batch stock with condition
        # 2. Insert Sale Document
        # 3. Create Stock Movement Logs
        # 4. Update Customer Outstanding Balance & Ledger
        # Commit or Auto-Abort on failure
```
In standalone MongoDB environments (such as unit test suites without replica sets), an enterprise Unit of Work abstraction executes operations atomically where supported, with deterministic error handling and automatic state rollback.
