# ADR 0005: Decoupled AI Pipeline with Server-Side Processing

## Status
Accepted

## Context
The client application directly bundled an encoded Gemini API key (`frontend/src/services/geminiVision.js`) to parse invoices client-side. Additionally, backend AI routes performed blocking CPU-heavy OCR operations and unindexed `O(N * M)` string similarity comparisons on the main asyncio event loop, causing severe latency and event loop starvation.

## Decision
1. **Remove Client Credentials**: All third-party AI keys (Gemini, Google Cloud Vision, etc.) are removed from the frontend client bundle and managed exclusively in server-side configuration.
2. **Server-Side AI Pipeline**: Invoice images are uploaded to authenticated backend endpoints (`/api/ai-import/analyze` or `/api/products/import-image`).
3. **Offload Heavy Compute**: CPU-heavy OCR and fuzzy string matching are offloaded using thread pools (`asyncio.to_thread` / `run_in_threadpool`) and optimized with token-based indexing or trigram matching rather than full collection scans.
4. **Structured Review Workflow**: AI extraction produces a standardized draft stage allowing merchants to review, edit, and approve items before committing to the inventory ledger.

## Consequences
- **Positive**: Eliminates secret credential theft; prevents UI and event loop blocking; unifies OCR and Gemini extraction pipelines.
- **Negative**: Uploads must transfer document binaries to the backend before sending to Gemini.
