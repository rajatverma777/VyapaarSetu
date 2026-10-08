# ADR 0001: Modular Monolith and Layered Backend Architecture

## Status
Accepted

## Context
The initial codebase featured 18 large route handler files containing a mixture of HTTP request handling, inline database queries, complex GST calculations, multi-step rollbacks, and OCR/image processing. Route handlers such as `products.py` exceeded 1,700 lines of code. This led to duplicated business logic, high regression risks, and difficulty in testing domain operations.

## Decision
We adopt a **Modular Monolith** architecture with strict layered separation of concerns:
1. **API Routers**: Handle HTTP serialization, parameters, and authentication dependencies only.
2. **Application Services**: Encapsulate domain use cases (`SaleService`, `PurchaseService`, `InventoryService`, `CustomerService`, etc.).
3. **Domain Calculators**: Dedicated math modules (`GSTCalculator`, `InvoiceCalculator`) that perform deterministic financial calculations.
4. **Repositories**: Abstract database queries, guaranteeing multi-tenant scoping and indexing efficiency.

Microservices were considered but rejected due to the severe data consistency challenges and network latency in Indian SMB retail POS scenarios where immediate stock and ledger consistency is paramount.

## Consequences
- **Positive**: Clean separation of concerns, testable domain services without mock HTTP requests, atomic multi-document transactions, reusable business logic across web and background jobs.
- **Negative**: Requires deliberate refactoring of monolithic route files into services and repositories while maintaining backwards-compatible API contracts.
