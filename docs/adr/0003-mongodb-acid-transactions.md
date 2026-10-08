# ADR 0003: Multi-Document ACID Transactions & Unit of Work

## Status
Accepted

## Context
Critical workflows such as sales, purchases, payments, returns, and inventory deductions involve modifying multiple collections simultaneously (e.g. `products`, `batches`, `sales`, `ledger`, `customers`, `stock_logs`). The existing codebase relied on in-memory lists of rollback callbacks (`rollbacks = []`), which failed to execute during process crashes, network disconnects, or unhandled exceptions.

## Decision
We replace ad-hoc rollback routines with a formal **Unit of Work** transactional pattern utilizing native MongoDB multi-document transactions (`client.start_session()` + `session.start_transaction()`):
1. All changes across documents and collections occur within an active transaction session.
2. In the event of any validation, inventory insufficiency, or unexpected exception, the transaction is cleanly aborted by the database engine.
3. For standalone MongoDB instances without replica sets (e.g. lightweight dev/test environments), the Unit of Work provides a transactional compatibility layer with deterministic rollback.

## Consequences
- **Positive**: Guaranteed atomicity; eliminates orphaned records, partial stock deductions, and ledger desynchronization.
- **Negative**: Requires MongoDB replica-set topology in production.
