# ADR 001: Modular Monolith Layered Architecture

## Status
Accepted

## Context
The VyapaarSetu codebase initially concentrated business rules, inventory mutations, tax arithmetic, and database queries directly inside FastAPI route handler functions. This led to duplicated queries, race conditions during high-volume checkout, lack of unit testability, and tight coupling.

## Decision
Adopt a Modular Monolith architecture structured into strict vertical and horizontal layers:
- **Routes Layer (`app/api/routes`)**: Thin controllers handling HTTP serialization, schema validation, and status codes.
- **Service Layer (`app/services`)**: Encapsulates business logic, transactional orchestrations, and financial workflows (`SaleService`, `PurchaseService`, `InventoryService`, `PaymentService`, `AIImportService`, `AuditService`).
- **Repository Layer (`app/repositories`)**: Encapsulates all database access, queries, and compound tenant scoping (`BaseRepository`, `ProductRepository`, `BatchRepository`, `CustomerRepository`, etc.).
- **Domain/Core Layer (`app/core`)**: Cross-cutting concerns including `database.py`, `security.py`, `tax_calculator.py`, `transaction.py`, and `features.py`.

## Consequences
- **Positive**: Clean separation of concerns; individual layers can be tested with mocks; shared business rules cannot diverge between routes; zero network latency compared to microservices.
- **Negative**: Requires discipline to prevent route handlers from bypassing service layers.
