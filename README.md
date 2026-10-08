# VyapaarSetu (व्यापार सेतु)
### AI-Powered Multi-Tenant Business Operating System & ERP for Indian SMBs

[![CI/CD Pipeline](https://github.com/rajatverma777/VyapaarSetu/actions/workflows/ci.yml/badge.svg)](https://github.com/rajatverma777/VyapaarSetu/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.111-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-61DAFB?logo=react)](https://reactjs.org)
[![MongoDB](https://img.shields.io/badge/Database-MongoDB%206.0%20%2B%20Motor-47A248?logo=mongodb)](https://mongodb.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

VyapaarSetu is a production-ready, AI-native Enterprise Resource Planning (ERP) platform purpose-built for Indian retailers, wholesalers, pharmaceutical distributors, and FMCG shopkeepers. It unifies point-of-sale billing, strict FEFO batch inventory, deterministic GST tax compliance, automated invoice OCR, and customer ledgers into a seamless, high-performance operating system.

---

## 1. Problem Statement
Over 65 million micro, small, and medium businesses in India operate using fragmented, error-prone manual ledgers (*Bahi Khata*), disconnected desktop software, or generic foreign ERPs that fail to meet Indian operational realities:
- **Complex Indian GST Compliance**: Multi-tier tax rates (0%, 5%, 12%, 18%, 28%), intra-state CGST/SGST splits, inter-state IGST, and HSN/SAC reporting.
- **Manual Bill Entry Overhead**: Transcribing physical handwritten or thermal paper distributor bills into computers consumes hours daily.
- **Stock Discrepancies & Expiry Wastage**: Unregulated inventory deduction leads to overselling, stockout surprises, and expired drug/grocery write-offs.
- **Floating-Point Financial Inaccuracies**: Standard software suffers from ₹0.01 fractional rounding errors across long invoice line items.

## 2. The VyapaarSetu Solution
VyapaarSetu combines an enterprise-grade modular monolith backend with a responsive React frontend and intelligent document parsing:
- ⚡ **Ultra-Fast POS Terminal**: Barcode scanning, offline cart preservation, multiple payment modes (UPI, Cash, Credit, Cheque), and thermal printing.
- 📦 **Single-Source-of-Truth Inventory**: First-Expired-First-Out (FEFO) automated batch picking, atomic decrement guards, and end-to-end stock logs.
- 🇮🇳 **Deterministic GST Engine**: Exact decimal-precision arithmetic (`ROUND_HALF_UP`) with comprehensive intra/inter-state tax splitting.
- 🤖 **Universal OCR Document Ingestion**: Ingest smartphone photos of supplier invoices using Gemini Vision + local fallback with fuzzy product mapping.
- 🔒 **True Multi-Tenant SaaS Isolation**: Server-side JWT claim enforcement ensuring zero cross-tenant data leakage.

---

## 3. High-Level Architecture

```
                ┌─────────────────────────────────┐
                │         React Frontend          │
                │   Dashboard / POS / Reports     │
                │   Apple Glass UI / Tailwind     │
                └────────────────┬────────────────┘
                                 │ HTTPS / REST (JWT Auth)
                                 ▼
                ┌─────────────────────────────────┐
                │        FastAPI Gateway          │
                │  Rate Limiting / RBAC Security  │
                │  Request-ID Tracing Middleware  │
                └────────────────┬────────────────┘
                                 │
                ┌────────────────┴────────────────┐
                ▼                                 ▼
      ┌──────────────────┐              ┌──────────────────┐
      │  Service Layer   │              │ Asynchronous AI  │
      │  • SaleService   │              │  • Gemini Vision │
      │  • InventorySvc  │              │  • Preprocessing │
      │  • PaymentSvc    │              │  • RapidFuzz     │
      │  • GSTCalculator │              └──────────────────┘
      └────────┬─────────┘
               │
               ▼
      ┌──────────────────┐
      │ Repository Layer │ (Tenant-Scoped Data Access)
      └────────┬─────────┘
               │
               ▼
      ┌──────────────────┐
      │ MongoDB Cluster  │ (Compound Tenant Indexes & ACID Transactions)
      └──────────────────┘
```

---

## 4. Key Features

### 🛒 Point of Sale & Billing
- High-speed barcode lookup and fuzzy item search.
- Multi-split payments (Cash + UPI + Credit balance).
- Thermal receipt (2-inch / 3-inch) and full A4 GST tax invoice PDF generation.
- Dynamic QR code generation for UPI payment collection.

### 📦 Inventory & Batch Management
- Batch-level tracking with manufacturing and expiration dates.
- Automated FEFO (First-Expired-First-Out) picking logic.
- Low-stock warnings and expiring inventory alerts.
- Immutable `stock_logs` audit trail for every physical quantity change.

### ⚖️ Indian Financial & GST Accounting
- Automatic intra-state (CGST + SGST) vs inter-state (IGST) determination based on GSTIN state codes.
- Deterministic decimal arithmetic preventing fractional currency drift.
- Comprehensive reports: GSTR-1, GSTR-3B summary, HSN breakdown, Sales/Purchase registers, and Customer/Supplier Ledgers.

### 📑 Document Processing & OCR
- Smartphone invoice photo ingestion with auto-orientation and contrast normalization.
- Multimodal Gemini Vision parsing into structured line items (Batch, Exp, HSN, Tax, Rate).
- Shopkeeper human-in-the-loop draft review with confidence scoring before committing stock.

---

## 5. User Interface Showcase

VyapaarSetu features an Apple-inspired Liquid Glass design language engineered for clarity, readability, and all-day retail usage:
- **POS Billing Terminal**: Split screen with rapid keyboard shortcuts, item selection, and real-time total breakdown.
- **Executive Dashboard**: Key revenue metrics, top-selling items, cash flow summaries, and low-stock alerts.
- **Party Ledger View**: Complete statement of accounts with debit, credit, and rolling balance for every customer and supplier.

---

## 6. Getting Started Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB 6.0+ (running locally or via Docker)

### 1. Clone Repository
```bash
git clone https://github.com/rajatverma777/VyapaarSetu.git
cd VyapaarSetu
```

### 2. Backend Setup
```bash
cd backend

# Create & activate virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env
# Edit .env with your MongoDB URL and secret keys

# Run development server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```
- API Docs: `http://localhost:8000/api/docs`
- Health Probe: `http://localhost:8000/api/health`
- Readiness Probe: `http://localhost:8000/api/ready`

### 3. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Start Vite development server
npm run dev
```
- Web Application: `http://localhost:5173`

---

## 7. Environment Variables Reference

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `MONGODB_URL` | MongoDB connection URI (Replica Set recommended) | `mongodb://localhost:27017/wholesale_erp` |
| `MONGODB_DB_NAME` | Database name | `wholesale_erp` |
| `SECRET_KEY` | Cryptographic key for JWT token signing | `min-32-character-random-secret` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | JWT expiration duration in minutes | `1440` (24 hours) |
| `GEMINI_API_KEY` | Google Gemini Vision API key for document parsing | `your_gemini_api_key` |
| `CORS_ALLOWED_ORIGINS` | Permitted frontend origins (comma-separated) | `http://localhost:5173,https://app.vyapaarsetu.in` |

---

## 8. Verification & Testing

VyapaarSetu adheres to a strict testing pyramid covering financial precision, multi-tenant isolation, FEFO inventory, and complete sale workflows.

```bash
# Run backend test suite
cd backend
pytest tests/ -o asyncio_mode=auto -v

# Run frontend production build verification
cd ../frontend
npm run build
```

---

## 9. Production Deployment

Deploy the entire stack with Docker Compose and MongoDB replica set:

```bash
docker compose -f docker-compose.prod.yml up -d
```
For complete production deployment guides, Kubernetes manifests, and SSL proxy setup, refer to [docs/deployment.md](docs/deployment.md).

---

## 10. Security Guarantees

- **No Public Backups**: Database backups and customer documents are stored outside static roots and served only via authenticated, tenant-verified endpoints.
- **Server-Side Tenant Resolution**: Clients cannot spoof `tenant_id` headers; tenant context is enforced cryptographically via JWT.
- **Compound Database Indexes**: Unique constraints are scoped per organization (`tenant_id + sku`).
- **Audit Logging**: Sensitive mutations create immutable entries in `audit_logs` and `stock_logs`.

For formal threat model documentation, refer to [docs/threat-model.md](docs/threat-model.md).

---

## 11. Project Documentation Directory

- [System Design Audit](docs/system-design-audit.md)
- [Target Architecture](docs/architecture.md)
- [Database Design & Multi-Tenancy](docs/database-design.md)
- [API Design Guidelines](docs/api-design.md)
- [Security Hardening](docs/security.md)
- [STRIDE Threat Model](docs/threat-model.md)
- [Production Deployment Guide](docs/deployment.md)
- [Disaster Recovery Runbook](docs/disaster-recovery.md)
- [AI & Document Processing Architecture](docs/ai-architecture.md)
- [Architectural Decision Records (ADRs)](docs/adr/)
- [Production Readiness Report](docs/production-readiness-report.md)

---

## 12. Roadmap

- [x] Multi-tenant database isolation & compound indexes
- [x] Decimal-precision GST calculation engine
- [x] FEFO inventory engine & overselling prevention
- [x] Secure Universal OCR & Gemini invoice ingestion
- [x] Immutable audit and stock movement logs
- [ ] WhatsApp Cloud API for automated invoice delivery
- [ ] Direct E-Way bill & E-Invoice portal integration
- [ ] Multi-store warehouse transfer requisitions
- [ ] Offline SQLite / IndexedDB sync for intermittent network connectivity

---

## License
Distributed under the MIT License. See `LICENSE` for more information.
