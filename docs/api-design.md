# VyapaarSetu API Design Standards & Contracts

## 1. RESTful Standards & Uniform Conventions

1. **Base URL**: `/api` prefix for all business endpoints.
2. **Pluralized Resource Naming**:
   - `/api/products`
   - `/api/sales`
   - `/api/purchases`
   - `/api/customers`
   - `/api/suppliers`
   - `/api/payments`
   - `/api/inventory`
3. **HTTP Status Codes**:
   - `200 OK`: Successful read or update.
   - `201 Created`: Successful creation of entity.
   - `400 Bad Request`: Validation failure or business logic violation (e.g. insufficient stock).
   - `401 Unauthorized`: Missing or invalid JWT credentials.
   - `403 Forbidden`: Authenticated user lacks RBAC permission.
   - `404 Not Found`: Entity not found within current tenant.
   - `409 Conflict`: Concurrency conflict, duplicate unique field, or active lock.
   - `422 Unprocessable Entity`: Pydantic payload schema violation.
   - `500 Internal Server Error`: Unhandled system failure.

---

## 2. Standardized Response Formats

### 2.1 Paginated List Response
```json
{
  "items": [ ... ],
  "total": 142,
  "page": 1,
  "limit": 50,
  "total_pages": 3
}
```

### 2.2 Standard Error Response
```json
{
  "detail": "Insufficient stock for 'Paracetamol 500mg'. Available: 4, Requested: 10",
  "error_code": "INSUFFICIENT_STOCK",
  "params": {
    "product_id": "PROD001",
    "available": 4,
    "requested": 10
  }
}
```

---

## 3. Idempotency Keys for Mutation Endpoints

Financial mutations (`POST /api/sales`, `POST /api/purchases`, `POST /api/payments`) support an optional `Idempotency-Key` header:
- Clients generate a UUID v4 before submitting payment or sale creation.
- The server checks if `idempotency_keys` collection has recorded the key for this tenant within the last 24 hours.
- If previously executed, returns the cached previous response without re-deducting inventory or duplicating the ledger entry.
- Prevents double billing caused by network retries or double clicks.

---

## 4. Protected Secure File Download Endpoints

Public directory mounts (`/static/backups` and `/static/documents`) are deprecated and removed. All file downloads require authentication:

- `GET /api/backup/download/{filename}`:
  - Header: `Authorization: Bearer <token>`
  - Enforces `require_admin` dependency.
  - Verifies `filename` strictly contains caller's `tenant_id`.
  - Streams file directly as attachment.
- `GET /api/documents/download/{doc_id}`:
  - Header: `Authorization: Bearer <token>`
  - Verifies document `tenant_id` matches user `tenant_id`.
