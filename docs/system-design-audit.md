# VyapaarSetu System Design & Codebase Audit Report

**Date:** October 2026  
**Auditor:** Lead Software Architect, Security Engineer & Principal Systems Architect  
**Repository:** `rajatverma777/VyapaarSetu`  
**Product:** VyapaarSetu — AI-Powered Business Operating System / ERP for Indian SMBs, Retailers, Wholesalers, and Distributors.

---

## Executive Summary

VyapaarSetu is designed as an all-in-one business management ERP tailored for Indian merchants, wholesalers, distributors, and pharmacy/retail operators. The application incorporates inventory control, multi-tax Indian GST calculation (CGST, SGST, IGST), sales & point-of-sale (POS), vendor purchases, customer/supplier ledgers, batch/expiry FEFO tracking, document generation, and AI-powered receipt/invoice ingestion.

A rigorous, end-to-end architectural, security, database, and reliability audit of the existing codebase identified crucial structural flaws that hinder genuine multi-tenant enterprise and production SaaS readiness:

1. **Critical Security Vulnerabilities**:
   - Public exposure of sensitive database backup archives and business documents via unauthenticated static file mounting.
   - Client-side exposure of third-party API credentials (base64 fallback token in `frontend/src/services/geminiVision.js`).
   - Fallback to unscoped MongoDB database on token decoding failure or absent authentication.
2. **Transactional & Concurrency Vulnerabilities**:
   - Ad-hoc, non-atomic rollbacks (`rollbacks = []`) across sales, purchases, and AI imports, causing database desynchronization if crashes or network failures occur mid-execution.
   - Non-atomic stock deductions and batch synchronization race conditions.
3. **Financial & Accounting Correctness**:
   - Pervasive use of IEEE 754 floating-point arithmetic (`float`) and `round(..., 2)` for monetary values, GST distribution, discounts, and balances, risking sub-paisa rounding errors and audit failure under Indian tax laws.
4. **Architectural & Performance Bottlenecks**:
   - Monolithic route handlers (e.g., `products.py` at 1,706 lines) mixing HTTP handlers, database queries, image preprocessing, and external API requests.
   - Global unique index on `products.sku` preventing two separate tenants from using identical manufacturer SKUs.
   - Synchronous, CPU-bound string matching (`difflib.SequenceMatcher` across 10,000 items) executed directly on the FastAPI asyncio event loop during AI import analysis.

This document details the current state, audited flows, itemized vulnerabilities, target architecture, and concrete migration strategy.

---

## 1. Current Architecture & Data Flow

### 1.1 Architecture Topology
```
┌────────────────────────────────────────────────────────┐
│                   Vite + React SPA                     │
│         (TailwindCSS, Lucide Icons, Recharts)          │
└───────────────────────────┬────────────────────────────┘
                            │ REST APIs / HTTPS
                            ▼
┌────────────────────────────────────────────────────────┐
│                    FastAPI Backend                     │
│     (main.py, Starlette middlewares, JWT Auth)        │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 18 Large Route Modules (app/api/routes/*.py)     │  │
│  │ - products.py (1706 lines, OCR + CRUD)          │  │
│  │ - sales.py (530 lines, POS + Ledger + Stock)     │  │
│  │ - purchases.py (332 lines, Stock + Ledger)       │  │
│  │ - ai_import.py (456 lines, Matching + Imports)   │  │
│  │ - returns.py, reports.py, backup.py, etc.        │  │
│  └──────────────────────────────────────────────────┘  │
│                            │                           │
│                            ▼                           │
│  ┌──────────────────────────────────────────────────┐  │
│  │ TenantDatabase / TenantCollection Wrapper         │  │
│  │ (app/core/database.py)                           │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │ Motor (Async MongoDB Driver)
                            ▼
┌────────────────────────────────────────────────────────┐
│                        MongoDB                         │
│         Single Shared Database / Collections           │
└────────────────────────────────────────────────────────┘
```

### 1.2 Current Data & Request Flow
1. **Request Ingestion**: Incoming HTTP requests arrive at `backend/main.py`. CORS middleware checks origin and applies baseline security headers (`X-Frame-Options`, `X-Content-Type-Options`).
2. **Authentication Resolution**:
   - Dependency `get_database(request)` inspects `Authorization: Bearer <token>`.
   - If present, decodes JWT with `ALGORITHM="HS256"`.
   - If payload contains `tenant_id`, wraps `db_instance.db` in `TenantDatabase(db, tenant_id)`.
   - **Flaw**: If token is missing, expired, or malformed, it falls back to raw unscoped `db_instance.db`.
3. **Route Execution**:
   - Business logic is executed inline in the route handler. For example, in `create_sale`:
     1. Reads products from DB.
     2. Validates `current_stock >= quantity`.
     3. Calls `calculate_gst_items` (pure float arithmetic).
     4. Updates `counters` for invoice number.
     5. Loops through items and modifies product stock and batch stock.
     6. Appends inverse update tuples to an in-memory `rollbacks` list.
     7. Inserts sale record into `sales` collection.
     8. Updates customer `current_balance` and inserts ledger entry.
     9. If an unhandled exception occurs, iterates through `rollbacks` list and calls updates sequentially.
4. **Data Persistence**:
   - Written directly into MongoDB collections via Motor with soft tenant injection on query dictionaries.

---

## 2. Deep-Dive Tenant Isolation & Authentication Analysis

### 2.1 Strengths of Current Multi-Tenancy Implementation
- JWT tokens embed `tenant_id` at issuance during login and user creation.
- `TenantCollection` intercepts `.find()`, `.find_one()`, `.insert_one()`, `.update_one()`, and `.delete_one()` to append `{"tenant_id": self.tenant_id}`.
- Aggregation pipelines prepend a `{"$match": {"tenant_id": self.tenant_id}}` stage.

### 2.2 Critical Vulnerabilities & Isolation Holes

| Component | Vulnerability | Severity | Impact |
| :--- | :--- | :--- | :--- |
| **`main.py` Static Mount** | `app.mount("/static", StaticFiles(directory="static"))` mounts `static/backups` and `static/documents`. | **CRITICAL** | Any unauthenticated user can download full tenant database backups (`/static/backups/backup_TENANT_*.zip`) and confidential letters/invoices without authentication. |
| **`get_database` Fallback** | Unauthenticated or invalid token requests return the raw unscoped MongoDB instance `db_instance.db`. | **HIGH** | If any endpoint omits the explicit `get_current_active_user` dependency or uses `get_database` directly, queries run with zero tenant isolation across all organizations. |
| **Global Unique Indexes** | `db["products"].create_index("sku", unique=True, sparse=True)` creates a globally unique index across tenants. | **HIGH** | Tenant B cannot create a product with the same SKU as Tenant A (e.g. standard barcodes or manufacturer SKUs like `PARA-500` collide). |
| **Client Secrets Exposure** | `frontend/src/services/geminiVision.js` has a hardcoded base64 Gemini API key (`FALLBACK_TOKEN`). | **CRITICAL** | Secret credential theft, quota exhaustion, and abuse by malicious users inspecting frontend assets. |
| **Tenant Injection Bypass** | Direct use of complex query operators (e.g., nested `$or` or raw expressions) in certain routes can conflict with simple key assignment `filter_query["tenant_id"] = ...`. | **MEDIUM** | Inconsistent query behavior or unintentional collection scans. |

---

## 3. Transactional & Financial Data Integrity Audit

### 3.1 Non-Atomic "Compensating Transactions" (`rollbacks = []`)
In `sales.py`, `purchases.py`, and `returns.py`, the system relies on an in-memory list:
```python
rollbacks = []
try:
    # 1. Update product stock
    rollbacks.append((db.products.update_one, {"_id": pid}, {"$inc": {"current_stock": qty}}))
    # 2. Update batch stock
    rollbacks.append(...)
    # 3. Create sale
    # 4. Update customer balance
except Exception as e:
    for func, query, update in reversed(rollbacks):
        await func(query, update)
```
**Failure Modes:**
1. **Process Crash**: If the Python process dies, experiences an OOM kill, or the worker restarts during the loop, all in-memory rollback commands are lost forever. Stock is deducted, but no sale is recorded.
2. **Network Partition**: If the database connection drops during rollback execution, the compensating transaction fails silently.
3. **Partial Rollback Failure**: If one rollback operation fails (e.g., write conflict or validation error), subsequent rollbacks abort, leaving the database partially rolled back.

### 3.2 Floating-Point Arithmetic Inaccuracies
The calculation logic across `sales.py` and `purchases.py`:
```python
gross = round(rate * qty, 2)
disc_amt = round(gross * disc_pct / 100, 2)
taxable = round(gross - disc_amt, 2)
cgst_amt = round(taxable * half_rate / 100, 2)
sgst_amt = round(taxable * half_rate / 100, 2)
```
- Floating-point representations in Python (`float`) are binary approximations.
- In split GST (CGST + SGST = 18%), odd rates or cent amounts (e.g., taxable amount ₹105.55 with 5% GST = 2.5% each):
  - `105.55 * 0.025 = 2.63875 -> 2.64`
  - `CGST (2.64) + SGST (2.64) = 5.28`
  - But total 5% tax on `105.55`: `105.55 * 0.05 = 5.2775 -> 5.28`.
  - In edge cases, `CGST + SGST != Total GST` by ₹0.01, violating Indian GST filing specifications (GSTR-1, GSTR-3B).
- Discounts applied before vs. after tax lack formal decimal rounding policies.

---

## 4. Performance, Scalability & Resource Audit

### 4.1 Blocking In-Process OCR & AI Analysis
- In `backend/app/api/routes/products.py` (lines 772–1450):
  - Image manipulation (`PIL.Image`, auto-rotation, orientation scoring, thresholding, morphology) and Tesseract OCR run directly inside the API process.
  - While run using `run_in_threadpool`, OCR CPU consumption on 4–8 cores starves FastAPI worker threads.
- In `backend/app/api/routes/ai_import.py` (lines 68–100):
  - For each line item in an imported bill (up to 100 items), it iterates through up to 10,000 products twice running `difflib.SequenceMatcher.ratio()`.
  - `100 * 10,000 * 2 = 2,000,000` sequence matcher operations synchronously executed on the event loop.
  - Freezes the entire backend process for 5–15 seconds per import request.

### 4.2 Missing Compound Indexes
- Queries in `sales.py` filtering by `[sale_type, customer_id, sale_date]` do not have a covering compound index.
- Ledger entries sorted by date per customer/supplier lack compound indexes on `[tenant_id, party_id, date]`.

---

## 5. Itemized Vulnerability & Issue Register

| ID | Category | Description | Severity | Target Fix |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | Security | Unauthenticated static directory access to backups and private documents. | **P0 (Critical)** | Remove `static/backups` and `static/documents` from static mounts. Serve exclusively via authenticated, tenant-validated endpoints. |
| **SEC-02** | Security | Hardcoded Gemini API token in client-side bundle. | **P0 (Critical)** | Remove token from `geminiVision.js`. Proxy all AI calls through backend `AIService`. |
| **SEC-03** | Security / Tenancy | Unauthenticated requests receive unscoped `db_instance.db`. | **P1 (High)** | Disallow raw DB fallback in `get_database(request)`. Raise 401 Unauthorized or provide safe null DB for public routes. |
| **SEC-04** | Tenancy / DB | Product SKU index is globally unique instead of tenant-scoped. | **P1 (High)** | Replace with compound unique index `[("tenant_id", 1), ("sku", 1)]`. |
| **TX-01** | Data Integrity | Ad-hoc manual rollback list in sales/purchases/returns. | **P0 (Critical)** | Implement transactional Unit of Work utilizing MongoDB sessions with automatic rollback and robust fallback. |
| **TX-02** | Concurrency | Stock deduction race conditions during high-volume sales. | **P1 (High)** | Atomic conditional updates `{"current_stock": {"$gte": qty}}` inside `InventoryService.deduct()`. |
| **FIN-01** | Financial | Float representation of monetary amounts and GST calculations. | **P1 (High)** | Build `Decimal`-based calculation engine: `GSTCalculator`, `InvoiceCalculator`, `DiscountCalculator`. |
| **PERF-01**| Performance | `O(N * M)` synchronous string similarity blocking event loop. | **P1 (High)** | Pre-filter products by trigram/prefix, execute similarity matching in thread pool, or use MongoDB text search. |
| **ARCH-01**| Architecture | Giant route files containing all business, database, and OCR logic. | **P1 (High)** | Refactor into layered architecture: `routers -> services -> repositories -> models/schemas`. |
| **UI-01**  | Frontend | Stray directory `frontend/src/{components` from bash expansion typo. | **P2 (Medium)** | Remove stray directory; ensure clean directory tree. |

---

## 6. Target Architecture: Layered Modular Monolith

To achieve production SaaS reliability without operational microservice sprawl, we establish a clean 4-tier modular monolith:

```
                    ┌───────────────────────────┐
                    │      FastAPI Router       │
                    │  (Validation, Auth, HTTP) │
                    └─────────────┬─────────────┘
                                  │ Typed Pydantic Request
                                  ▼
                    ┌───────────────────────────┐
                    │    Application Service    │
                    │   (SaleService, Inventory,│
                    │    GST, Accounting Logic) │
                    └──────┬─────────────┬──────┘
                           │             │
        ┌──────────────────┘             └──────────────────┐
        ▼                                                   ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│     Domain Calculators    │               │    Repository Layer       │
│  (GSTCalculator, Decimal) │               │   (Tenant-scoped queries) │
└───────────────────────────┘               └─────────────┬─────────────┘
                                                          │ Motor Client / Session
                                                          ▼
                                            ┌───────────────────────────┐
                                            │      MongoDB Cluster      │
                                            │ (Tenant compound indexes) │
                                            └───────────────────────────┘
```

### Key Service Boundaries:
1. **`GSTCalculator` & `InvoiceCalculator`**: Single source of truth for all Indian tax calculations using `Decimal` and standard `ROUND_HALF_UP`.
2. **`InventoryService`**: Handles all stock movements: `reserve()`, `release()`, `deduct()`, `add()`, `adjust()`, with traceable `stock_logs` for every transaction.
3. **`SaleService`**: Orchestrates sale validation, customer balance verification, invoice number generation, inventory deduction, ledger entry, and transaction commit.
4. **`PurchaseService`**: Orchestrates supplier bill recording, batch generation, stock replenishment, and accounts payable ledger updates.
5. **`AIService`**: Handles server-side OCR, Gemini vision analysis, fuzzy matching, and schema normalization securely without client exposure.
6. **`Repositories`**: Encapsulates all direct database queries, enforcing tenant scoping and providing clean data access interfaces.

---

## 7. Concrete Phased Migration Strategy

- **Phase 1: Architecture Documentation & ADRs**: Formalize audit, architecture design, and decision records.
- **Phase 2: Security & Multi-Tenancy Hardening**: Eliminate public static file vulnerabilities, purge client credentials, and enforce strict server-side tenant scoping.
- **Phase 3: Database Indexes & Transaction Management**: Implement MongoDB transactional unit-of-work and fix compound tenant indexes.
- **Phase 4: Financial Calculation Engine**: Implement `Decimal`-safe GST and billing calculators with edge-case test coverage.
- **Phase 5: Service & Repository Layer**: Refactor backend routes to delegate to services and repositories.
- **Phase 6: Inventory Engine & Stock Ledger**: Centralize stock mutations with traceable logs.
- **Phase 7: AI Pipeline Productionization**: Secure and optimize invoice ingestion and matching.
- **Phase 8: Frontend Cleanliness & Integration**: Clean up stray directories and ensure client calls the secure backend.
- **Phase 9: Comprehensive Automated Testing**: Implement and verify test suites for multi-tenancy, calculations, and concurrency.
- **Phase 10: Production Readiness Verification**: Validate builds, test coverage, and documentation.
