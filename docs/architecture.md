# VyapaarSetu Target Architecture

## 1. Architectural Philosophy & Strategy

VyapaarSetu is structured as a **Modular Monolith** designed for high throughput, maintainability, and data integrity without the operational complexity, network latency, and eventual consistency dilemmas of distributed microservices.

### Why Modular Monolith?
- **Transactional Consistency**: Indian SMB ERP operations (such as generating a GST sale invoice, updating customer ledger balances, creating stock movements, and updating batch inventories) require immediate, atomic consistency. Distributing these across microservices would necessitate two-phase commit (2PC) or complex Saga orchestrations with compensating transactions.
- **Resource Efficiency**: Single-binary deployment reduces memory footprint and infrastructure costs, enabling cost-effective multi-tenant SaaS economics for SMB pricing models.
- **Clear Boundaries**: High cohesion and loose coupling are enforced through strict application services, repository abstractions, and domain calculators rather than network boundaries.

```
┌────────────────────────────────────────────────────────┐
│             Presentation Layer (React + Vite)          │
│          SPA / POS Terminal / Invoicing / Reports      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS / JSON REST APIs
                            ▼
┌────────────────────────────────────────────────────────┐
│                   FastAPI Application                  │
│   ┌──────────────────────────────────────────────────┐ │
│   │                 API Routers                      │ │
│   │   - Thin HTTP endpoint controllers               │ │
│   │   - Pydantic v2 Schema validation & serialization│ │
│   │   - RBAC & Tenant context injection              │ │
│   └─────────────────────────┬────────────────────────┘ │
│                             │                          │
│                             ▼                          │
│   ┌──────────────────────────────────────────────────┐ │
│   │               Application Services               │ │
│   │   - SaleService         - PurchaseService        │ │
│   │   - InventoryService    - PaymentService         │ │
│   │   - CustomerService     - SupplierService        │ │
│   │   - AIService           - BackupService          │ │
│   └───────────────┬───────────────────┬──────────────┘ │
│                   │                   │                │
│                   ▼                   ▼                │
│   ┌──────────────────────────┐  ┌────────────────────┐ │
│   │   Domain Calculators     │  │ Repositories Layer │ │
│   │   - GSTCalculator        │  │ - SaleRepo         │ │
│   │   - InvoiceCalculator    │  │ - ProductRepo      │ │
│   │   - LedgerCalculator     │  │ - BatchRepo        │ │
│   │   - Decimal Arithmetic   │  │ - LedgerRepo       │ │
│   └──────────────────────────┘  └─────────┬──────────┘ │
└───────────────────────────────────────────┼────────────┘
                                            │ Async Motor Driver
                                            ▼
┌────────────────────────────────────────────────────────┐
│                   MongoDB Database                     │
│    - Tenant-isolated collections                       │
│    - Compound tenant indexes                           │
│    - Replica-set multi-document ACID transactions      │
└────────────────────────────────────────────────────────┘
```

---

## 2. Layered Responsibilities

### 2.1 Routers (`backend/app/api/routes/`)
- Pure HTTP translation layer.
- Handles query parameters, request bodies, authentication headers.
- Invokes application services and serializes service responses into Pydantic models.
- **Rule**: No direct MongoDB queries or calculations in routers.

### 2.2 Schemas (`backend/app/schemas/`)
- Pydantic models defining input validation constraints (positive rates, non-empty names, regex checks for GSTIN/HSN/PAN).
- Response schemas specifying typed serialized output.

### 2.3 Application Services (`backend/app/services/`)
- Orchestrates multi-step business transactions.
- Manages business validation, stock availability checks, and financial reconciliation.
- Wraps multi-document mutations inside transactional Units of Work.

### 2.4 Domain Calculators (`backend/app/core/finance/`)
- Stateless mathematical engines for financial correctness.
- Operates strictly on Python `Decimal` with deterministic rounding modes (`ROUND_HALF_UP`).
- Provides calculations for intra-state GST (CGST + SGST) and inter-state GST (IGST), trade discounts, line item discounts, and round-offs.

### 2.5 Repositories (`backend/app/repositories/`)
- Encapsulates database queries and data mutations.
- Guaranteed automatic enforcement of tenant boundaries.
- Provides specialized queries (e.g. FEFO batch lookups, ledger summary aggregations).

---

## 3. Cross-Cutting Concerns

1. **Authentication & Authorization**:
   - JWT tokens with HMAC-SHA256 containing user identity, role (`admin`, `staff`), granular permissions, and server-determined `tenant_id`.
   - RBAC enforced via FastAPI dependency injection (`require_permission`).
2. **Tenant Isolation**:
   - Dynamic `TenantContext` injected per request. Every repository and database call scopes operations by `tenant_id`.
3. **Audit Logging**:
   - Critical events (stock adjustments, invoice cancellations, role modifications, backups) logged into `audit_logs` with actor ID, timestamp, and payload diff.
4. **Idempotency & Concurrency**:
   - Conditional writes (`$inc` with `$gte` stock guard) prevent overselling in concurrent POS operations.
   - Idempotency keys prevent duplicate invoice creation during network retries.
