# ADR 0002: Strict Multi-Tenant Isolation with Server-Side Identity

## Status
Accepted

## Context
VyapaarSetu is a multi-tenant SaaS application catering to distinct businesses. In the existing implementation, unauthenticated requests falling back to raw databases risked global data access, and uniqueness indexes like SKU were globally scoped rather than tenant-scoped.

## Decision
1. **Server-Side Identity**: `tenant_id` is extracted strictly from the validated server-side JWT session token. Clients cannot pass `tenant_id` in request payloads or URL parameters to switch contexts.
2. **Tenant Scoped Repositories**: All database queries are automatically injected with `{"tenant_id": current_tenant}`.
3. **Compound Tenant Indexes**: All unique constraints (e.g. SKU, batch number per product, invoice numbers) must be compound indexes prefixed with `tenant_id`.
4. **No Raw DB Fallback**: `get_database` must never return an unscoped database to unauthenticated request contexts.

## Consequences
- **Positive**: Total isolation between competing merchants, eliminating cross-tenant read/write/delete vulnerabilities and SKU namespace collisions.
- **Negative**: Internal background tasks must explicitly supply a validated `tenant_id` context.
