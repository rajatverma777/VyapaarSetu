# ADR 004: Inventory Engine Consistency & FEFO Batch Allocation

## Status
Accepted

## Context
Indian retail and wholesale businesses handling pharmaceutical, FMCG, and perishable inventory require strict batch tracking, expiry date management, and First-Expired-First-Out (FEFO) picking order. Direct ad-hoc increments or decrements to product inventory quantities caused negative stock balances, unrecorded adjustments, and untraceable discrepancies.

## Decision
1. **Single Source of Truth**: All inventory mutations must route through `InventoryService` (`deduct_stock_fefo`, `add_stock`, `reconcile_adjustment`). Direct writes to stock fields are prohibited.
2. **Atomic Condition Checks**: Stock deduction updates check `current_stock >= requested_qty` directly in the MongoDB query filter. If insufficient stock is available, zero documents match and the operation rolls back immediately.
3. **Traceable Stock Movements**: Every physical inventory change writes an immutable audit record to `stock_logs` documenting previous quantity, quantity delta, new balance, reference transaction, and user ID.
4. **FEFO Allocation**: Batches sorted by ascending expiry date (`expiry: 1`) are deducted sequentially until the sale item quantity is fulfilled.

## Consequences
- **Positive**: Overselling is mathematically prevented even under concurrent race conditions; total stock always equals the sum of batch quantities; audit trails enable forensic inspection.
- **Negative**: Multi-batch deductions require slightly more database operations than a single naive `$inc`.
