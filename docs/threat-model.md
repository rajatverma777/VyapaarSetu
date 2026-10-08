# Threat Model & Security Posture — VyapaarSetu

This document outlines the formal threat model for the VyapaarSetu SaaS ERP system using the **STRIDE** methodology (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, Elevation of Privilege), targeting Indian SMBs, retail chains, wholesalers, and multi-tenant cloud deployments.

---

## 1. System Architecture & Trust Boundaries

```
[ Client / Browser ] ──( HTTPS / JWT )──► [ Reverse Proxy / Cloudflare ]
                                                   │
                                            ( Authenticated )
                                                   ▼
                                         [ FastAPI Monolith ]
                                          ├── RBAC / Auth Layer
                                          ├── Tenant Resolver (JWT Claims)
                                          ├── Application Services
                                          └── UnitOfWork / Transactions
                                                   │
                                                   ├──► [ ThreadPool: OCR / AI ]
                                                   ▼
                                          [ MongoDB Cluster ]
                                         (Compound Tenant Indexes)
```

### Trust Boundaries:
1. **External Boundary**: Untrusted public internet to FastAPI API gateway.
2. **Tenant Boundary**: Isolation between distinct tenant organizations ($T_A \neq T_B$).
3. **Execution Boundary**: Async event loop vs CPU-bound AI processing thread pools.
4. **Storage Boundary**: Public static assets (`/static`) vs restricted tenant storage (`data/backups`, `data/documents`).

---

## 2. STRIDE Threat Analysis

| Category | Threat Scenario | Impact | Mitigation Strategy | Verification / Implementation |
| :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | Attacker crafts a fake JWT or supplies an arbitrary `tenant_id` header to impersonate another organization. | High: Unauthorized access to rival business data. | `tenant_id` is **never trusted from request body or client headers**. Extracted exclusively from verified cryptographic JWT server claims (`get_current_active_user`). | `backend/app/core/database.py`, `backend/app/core/security.py` |
| **Tampering** | Malicious cashier alters selling prices, taxes, or modifies stock quantities during checkout to steal inventory. | Critical: Financial misstatement, unrecorded stock depletion. | POS sale mutations execute through `SaleService` with server-side recalculation via `GSTCalculator`. Inventory is deducted atomically via `InventoryService.deduct_stock_fefo()`. | `backend/app/services/sale_service.py`, `backend/app/core/finance/tax_calculator.py` |
| **Repudiation** | An employee deletes stock or alters invoices and claims another user or system error did it. | High: Lack of operational accountability. | All sensitive mutations trigger immutable records in `audit_logs` and `stock_logs` with `user_id`, `request_id`, client IP, user-agent, and old/new snapshots. | `backend/app/services/audit_service.py`, `backend/app/repositories/inventory_repo.py` |
| **Information Disclosure** | An attacker guesses backup URLs (`/static/backups/tenant_123.zip`) or accesses unauthenticated downloads. | Critical: Complete business data leakage. | Removed public static mounts for backups and documents. Downloads require JWT Bearer or authenticated token query param validated against admin role and tenant ownership. | `backend/app/api/routes/backup.py`, `backend/main.py` |
| **Denial of Service** | Rapid concurrent sale requests or heavy OCR image processing exhaust event loop threads. | High: Service outage for all tenants. | CPU-heavy fuzzy string matching and image preprocessing offloaded to background thread pool (`run_in_executor`). Compound indexes prevent full collection table scans. | `backend/app/services/ai_import_service.py`, `backend/app/core/database.py` |
| **Elevation of Privilege** | Cashier calls administrative endpoints (`/api/backup/create`, `/api/settings/company`). | Critical: System compromise, data corruption. | Role-Based Access Control (`require_admin`, `require_permission`) strictly enforced on all route handlers. | `backend/app/core/security.py`, `backend/app/api/routes/` |

---

## 3. High-Priority Threat Mitigations Implemented

### A. Strict Multi-Tenant Isolation
- **Problem**: In shared database multitenancy, a query omitting `{"tenant_id": ...}` exposes all organizations.
- **Defense**: `TenantCollection` wraps every PyMongo/Motor call, automatically injecting `{"tenant_id": self.tenant_id}`.
- **Index Guard**: Unique indexes are compound with `tenant_id` (e.g. `[("tenant_id", 1), ("sku", 1)]`), preventing cross-tenant SKU collisions.

### B. File Storage Hardening
- **Problem**: Storing database dumps or customer GST certificates under web-accessible `/static` allows directory brute-forcing.
- **Defense**: Migrated private storage to `data/backups` and `data/documents`. The web server only serves explicitly generated public invoices/exports from `/static`.

### C. Client-Side Secret Leakage Elimination
- **Problem**: Exposing third-party API keys (e.g., Gemini Vision token) in client JavaScript bundles allows quota theft.
- **Defense**: Purged hardcoded API tokens from frontend. All AI interactions route through backend endpoints with server-managed environment secrets.

### D. Concurrency & Overselling Prevention
- **Problem**: Concurrent requests for the same batch with 1 remaining item could produce two sales and negative stock.
- **Defense**: Atomic MongoDB `$inc: {"current_stock": -qty}` updates with filter condition `{"current_stock": {"$gte": qty}}`. If modified count is 0, the operation aborts immediately.

---

## 4. Threat Model Review & Cadence
This threat model is reviewed:
1. Prior to every minor and major version release.
2. Upon introducing any new third-party integration (e.g., payment gateways, WhatsApp business API, e-Invoicing portals).
3. Following any dependency vulnerability alerts flagged by automated CI audits (`pip-audit`, `npm audit`).
