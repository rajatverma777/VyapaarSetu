# ADR 0004: Decimal Precision Arithmetic for Indian GST & Accounting

## Status
Accepted

## Context
Standard IEEE 754 floating-point operations (`float` in Python and `number` in JavaScript) suffer from binary representation errors (e.g. `0.1 + 0.2 = 0.30000000000000004`). In financial accounting, inventory valuation, and GST calculations, rounding discrepancies of ₹0.01 between line items, subtotal, and tax breakdowns violate Indian GST compliance and cause reconciliation failures.

## Decision
1. All monetary and tax calculations in the backend are centralized into dedicated calculators (`GSTCalculator`, `InvoiceCalculator`, `DiscountCalculator`, `LedgerCalculator`) utilizing Python's built-in `decimal.Decimal`.
2. Standard rounding mode is explicitly set to `ROUND_HALF_UP`.
3. In intra-state transactions, CGST and SGST are split evenly, and any odd half-paisa difference is deterministically balanced against the total invoice tax.
4. Input and output serialization cleanly converts between strings/floats and `Decimal` for JSON API compatibility while maintaining internal numeric precision.

## Consequences
- **Positive**: Exact, audit-compliant financial computations matching Indian tax law standards; no floating point drift.
- **Negative**: Minor serialization overhead between JSON numbers and internal `Decimal` representations.
