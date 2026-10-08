# AI Architecture & Document Intelligence Pipeline — VyapaarSetu

This document outlines the architecture of the AI and Document Processing subsystem in VyapaarSetu, designed for high-accuracy invoice ingestion, handwritten bill parsing, and natural language copilot capabilities for Indian SMBs.

---

## 1. Subsystem Architecture

```
[ Purchase Bill / Invoice / Image ]
                 │
                 ▼
     [ Secure Ingestion API ]
    (/api/ai-import/process-bill)
                 │
                 ├──► 1. File Validation & MIME Check
                 ├──► 2. Save to Private Storage (data/documents)
                 │
                 ▼
      [ Preprocessing Engine ]
    (Thread Pool / Non-Blocking)
                 │
                 ├──► Auto-Orientation & Deskew (OpenCV/Pillow)
                 ├──► Contrast Enhancement & Grayscale Conversion
                 │
                 ▼
      [ Universal OCR Adapter ]
                 │
                 ├──────────────────────────────┐
                 ▼                              ▼
     [ Primary: Gemini Vision API ]    [ Fallback: PyTesseract / LayoutLM ]
     (Structured Schema Extraction)    (Local Offline Table OCR)
                 │                              │
                 └──────────────┬───────────────┘
                                │
                                ▼
                   [ Fuzzy Product Matcher ]
                    (RapidFuzz / Levenshtein)
                    • Offloaded to asyncio executor
                    • Maps bill line items to tenant inventory
                                │
                                ▼
                   [ Human-In-The-Loop Draft ]
                    • Confidence scores per line item
                    • Shopkeeper review & one-click approve
```

---

## 2. Core Components

### A. Preprocessing & Document Normalization
Raw invoices captured via smartphone cameras by Indian shopkeepers often suffer from poor lighting, crumpled paper, angled orientation, and low resolution.
- **Auto-Rotation**: Evaluates image EXIF and horizontal line projections to correct 90°/180° rotations.
- **Binarization**: Adapts thresholding to eliminate shadows while preserving faded thermal paper receipts.

### B. Gemini Vision Adapter (`AIImportService`)
- Uses multimodal LLM prompts structured specifically for Indian invoice schemas:
  - Header extraction: Supplier Name, GSTIN, Invoice Number, Date, State Code.
  - Table parsing: Item Name, HSN/SAC Code, Batch Number, Expiry Date, Quantity, Unit, MRP, Rate, Discount, Taxable Value, CGST/SGST/IGST rates.
  - Summary totals: Subtotal, Total Tax, Round Off, Grand Total.
- Enforces strict JSON Schema validation on responses.

### C. Fallback & Offline Engine
When cloud AI APIs are unreachable (weak internet or rate limits), the system activates a local OCR fallback:
- Local table boundary detection using edge heuristics.
- Text extraction using `pytesseract`.
- Regex extraction for Indian GST numbers (`^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`) and monetary totals.

### D. Asynchronous Worker Execution
Fuzzy string matching across thousands of tenant product SKUs is CPU-intensive.
- Execution is offloaded to `loop.run_in_executor(None, match_fn)`.
- Prevents blocking FastAPI's async event loop, ensuring sub-10ms response times for concurrent checkout and POS operations.

---

## 3. Human-in-the-Loop Safeguards
AI never modifies live financial ledgers directly without user consent:
1. Extraction output is persisted as an uncommitted **Draft Purchase Bill**.
2. Items flagged with confidence $< 0.85$ are highlighted in yellow in the web UI.
3. The store manager reviews, adjusts quantities/batches if needed, and clicks **Approve & Commit**.
4. Only upon manual confirmation does `PurchaseService` commit the stock to inventory and update supplier balances.

---

## 4. Privacy & Data Protection
- **No Token Leaks**: Gemini API keys reside exclusively in server-side environment configurations.
- **Tenant Scope**: OCR processing and fuzzy item caches are strictly isolated per tenant.
- **Ephemeral Processing**: Intermediate invoice images are purged according to tenant document retention settings.
