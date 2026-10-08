# ADR 003: Asynchronous AI Pipeline & Human-in-the-Loop Boundary

## Status
Accepted

## Context
Integrating document OCR and generative AI (Gemini Vision) into an ERP system presents significant risks:
1. LLM hallucinations can corrupt accounting ledgers and financial balances.
2. Direct execution of CPU-heavy fuzzy string matching and image processing blocks Python's single-threaded async event loop, delaying checkout requests.
3. Exposing AI API tokens on client applications invites quota theft.

## Decision
1. **Human-in-the-Loop Boundary**: AI invoice extraction outputs uncommitted **Draft Purchase Bills**. AI is strictly forbidden from committing transactions directly to inventory or financial ledgers without human review and approval.
2. **Asynchronous Worker Thread Offloading**: CPU-intensive fuzzy matching (RapidFuzz / Levenshtein) and OCR image deskewing execute in a background thread pool via `loop.run_in_executor(None, worker_fn)`.
3. **Server-Side Secret Containment**: All AI credentials remain on the server; the frontend client never receives or stores third-party LLM API keys.

## Consequences
- **Positive**: 100% financial data integrity; FastAPI event loop remains responsive (<10ms latency) during heavy AI workloads; zero client secret exposure.
- **Negative**: Ingestion requires a two-step human confirmation step for shopkeepers.
