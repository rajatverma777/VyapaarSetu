# 🏭 Vyapaar Setu System

A complete production-ready Vyapaar Setu System built with **FastAPI + React + MongoDB**.

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB 6+ (running on localhost:27017)

---

## 📦 Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate (Windows)
venv\Scripts\activate
# Activate (Linux/Mac)
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your MongoDB URL and secret key

# Start backend
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at: http://localhost:8000
API Docs: http://localhost:8000/api/docs

---

## 🎨 Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend runs at: http://localhost:5173

---

## 🔐 First-Time Setup

1. Start both backend and frontend
2. Open http://localhost:5173
3. Create your admin account by calling the API:

```bash
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123",
    "full_name": "Admin User",
    "role": "admin"
  }'
```

Or use the API docs at http://localhost:8000/api/docs

4. Login with your credentials
5. Go to Settings → Company to configure your business details

---

## 📂 Project Structure

```
wholesale-erp/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # All API endpoints
│   │   │   ├── auth.py
│   │   │   ├── products.py
│   │   │   ├── customers.py
│   │   │   ├── suppliers.py
│   │   │   ├── sales.py
│   │   │   ├── purchases.py
│   │   │   ├── payments.py
│   │   │   ├── inventory.py
│   │   │   ├── reports.py
│   │   │   ├── settings.py
│   │   │   └── backup.py
│   │   ├── core/
│   │   │   ├── config.py    # Settings
│   │   │   ├── database.py  # MongoDB connection
│   │   │   └── security.py  # JWT + bcrypt
│   │   ├── models/          # Pydantic schemas
│   │   └── services/
│   │       └── pdf_service.py  # ReportLab invoices
│   ├── main.py
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── pages/           # All page components
    │   ├── components/      # Reusable UI + Layout
    │   ├── context/         # Auth + Theme context
    │   └── services/        # Axios API calls
    ├── package.json
    └── vite.config.js
```

---

## ✨ Features

| Module | Features |
|--------|----------|
| **Auth** | JWT login, role-based (Admin/Staff), bcrypt passwords |
| **Dashboard** | Today's sales/purchases, outstanding, low stock, charts |
| **Products** | CRUD, categories, GST rates, HSN codes, barcode, bulk Excel import |
| **Inventory** | Real-time stock, adjustments, low-stock alerts, stock logs |
| **Customers** | CRUD, ledger, credit limit, outstanding, transaction history |
| **Suppliers** | CRUD, ledger, purchase history |
| **Sales** | GST invoice (CGST/SGST/IGST), barcode billing, PDF generation, payment tracking |
| **Purchases** | Purchase entry with GST, auto stock update, supplier ledger |
| **Payments** | Receipt/payment entry, party-wise ledger |
| **Reports** | Sales, Purchases, GST Summary, HSN-wise, Profit & Loss, Stock, Outstanding |
| **PDF Invoice** | Professional ReportLab invoice with company logo, bank details, GST breakdown |
| **Settings** | Company info, GST details, invoice customization, user management |
| **Backup** | Full MongoDB backup/restore as ZIP |
| **Dark Mode** | Full dark mode support |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F2` | Focus product search in billing |
| `Enter` | Select first product in dropdown |
| `Escape` | Close modal |
| `Ctrl+K` | Global search |

---

## 🏗️ Tech Stack

- **Backend**: FastAPI, Motor (async MongoDB), Pydantic v2, python-jose, passlib, ReportLab, openpyxl
- **Frontend**: React 18, Vite, Tailwind CSS, Axios, Recharts, react-hot-toast, date-fns
- **Database**: MongoDB (with proper indexes for 10,000+ products)
- **Auth**: JWT Bearer tokens, bcrypt password hashing
- **PDF**: ReportLab with professional A4 invoice layout

---

## 📊 MongoDB Collections

| Collection | Description |
|------------|-------------|
| `users` | System users with roles |
| `products` | Product catalog with stock |
| `categories` | Product categories |
| `customers` | Customer master with balance |
| `suppliers` | Supplier master with balance |
| `sales` | Sales invoices with items |
| `purchases` | Purchase invoices with items |
| `payments` | Payment/receipt entries |
| `ledger` | Customer/supplier ledger entries |
| `stock_logs` | Stock movement history |
| `settings` | Company/app settings |
| `counters` | Invoice number sequences |

---

## 🔧 Production Deployment

```bash
# Backend (production)
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4

# Frontend (build)
npm run build
# Serve with nginx or any static file server

# Or use the preview server
npm run preview
```

---

## 📝 Excel Import Template

For bulk product import, your Excel file should have these columns:
`name, sku, barcode, brand, unit, hsn_code, gst_rate, purchase_price, selling_price, wholesale_price, mrp, opening_stock, min_stock_alert`

---

## 🆘 Troubleshooting

**MongoDB connection error**: Ensure MongoDB is running on localhost:27017
```bash
mongod --dbpath /data/db
```

**CORS error**: Frontend must run on port 5173 or 3000 (configured in main.py)

**PDF not generating**: Ensure `static/invoices/` directory exists (auto-created on startup)
