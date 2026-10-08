# ADR 002: Strict Multi-Tenant Isolation Pattern

## Status
Accepted

## Context
VyapaarSetu serves independent business organizations (retailers, wholesalers, distributors) from a single unified deployment. Cross-tenant data leakage is a catastrophic security failure for an ERP system handling confidential sales, prices, customer lists, and financial records.

## Decision
1. **Server-Derived Identity**: The client application is never trusted to specify its own `tenant_id`. The active tenant is extracted exclusively from cryptographic JWT claims validated on every API request.
2. **Transparent Collection Scoping**: `TenantCollection` automatically injects `{"tenant_id": self.tenant_id}` into every query, insert, update, replace, and delete call.
3. **Compound Tenant Indexes**: Uniqueness constraints for business objects (SKU, barcode, invoice numbering, customer phone numbers) are scoped per tenant using compound indexes: `[("tenant_id", 1), ("sku", 1)]`.
4. **Physical File Isolation**: Private files (backups, customer documents) are stored outside web roots and served only via authenticated endpoints verifying tenant ownership.

## Consequences
- **Positive**: Complete defense-in-depth against accidental data leakage; developer errors in route queries cannot result in cross-tenant data exposure.
- **Negative**: Aggregations spanning multiple tenants require administrative privilege bypass.
