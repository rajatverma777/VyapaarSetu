# VyapaarSetu Security & Hardening Architecture

## 1. Threat Model & Mitigations

| Threat | Vector | Mitigation in Target Architecture |
| :--- | :--- | :--- |
| **Cross-Tenant Data Leakage (IDOR)** | Malicious user passes another tenant's `customer_id`, `product_id`, or `invoice_number`. | All queries scoped by `tenant_id` from JWT. The client cannot provide `tenant_id`. Lookups outside the tenant evaluate to `404 Not Found`. |
| **Backup Archive Exfiltration** | Unauthenticated crawling of `/static/backups/*.zip`. | Completely removed public `/static/backups` mount. Backups served only via authenticated, tenant-checked API endpoints. |
| **API Secret Credential Theft** | Hardcoded AI keys in client JS bundles. | Server-side execution of Gemini and OCR APIs. Frontend never receives external API tokens. |
| **Stock Overselling Race Condition** | Two cashiers sell the same last item concurrently. | Atomic conditional decrement in MongoDB: `{"current_stock": {"$gte": requested_qty}}`. If updated count is 0, transaction aborts. |
| **Privilege Escalation** | Staff user crafts request to modify user role or permissions. | Strict RBAC dependency (`require_admin`) checks role inside authenticated token. Only admins can modify user accounts and roles. |
| **Replay & Double Billing** | Network timeouts causing repeated invoice POSTs. | `Idempotency-Key` tracking on all financial mutation endpoints. |

---

## 2. Authentication & Authorization (RBAC)

### 2.1 Role Matrix

| Permission Key | Staff (Cashier/Sales) | Admin | Super Admin |
| :--- | :---: | :---: | :---: |
| `can_view_products` | Yes | Yes | Yes |
| `can_manage_products` | No | Yes | Yes |
| `can_create_sales` | Yes | Yes | Yes |
| `can_view_sales` | Yes | Yes | Yes |
| `can_create_purchases` | No | Yes | Yes |
| `can_view_purchases` | No | Yes | Yes |
| `can_manage_settings` | No | Yes | Yes |
| `can_manage_users` | No | Yes | Yes |
| `can_download_backups` | No | Yes | Yes |
| `can_restore_backups` | No | Yes | Yes |

### 2.2 Token Architecture
- **Algorithm**: `HS256` (HMAC with SHA-256) signed by server `SECRET_KEY`.
- **Payload Claims**:
  - `sub`: username
  - `id`: user ObjectID string
  - `tenant_id`: mandatory tenant identifier
  - `role`: `admin` | `staff` | `superadmin`
  - `permissions`: granular permission mapping
  - `exp`: access token expiry (default 8 hours)
  - `type`: `access` | `refresh`

---

## 3. Data Protection & File Access Policy

1. **Private Storage**:
   - `static/backups/` and `static/documents/` are strictly private directories inaccessible to the web server's static file handler.
   - Files are written to disk with restricted permissions (`0600`).
2. **Safe Document Download**:
   - Download handlers read files via streaming responses (`FileResponse`) after validating caller's tenant identity against the file's metadata.
