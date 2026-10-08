from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
import time
import uuid
import logging
from datetime import datetime, timezone

from app.core.database import connect_to_mongo, close_mongo_connection
from app.api.routes import (
    auth, users, products, categories, customers,
    suppliers, purchases, sales, payments,
    inventory, reports, settings, backup, returns,
    traceability, ai_import, documents, pricing
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Vyapaar Setu API",
    description="Production-grade Vyapaar Setu System",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

cors_origins = os.getenv(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://localhost:4173,http://localhost:5174"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail}
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception occurred during request")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )

@app.middleware("http")
async def request_context_and_logging_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    request.state.request_id = request_id
    start_time = time.time()
    
    response = await call_next(request)
    
    duration_ms = round((time.time() - start_time) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    # Do not log query parameters for auth/token or sensitive credentials
    path = request.url.path
    if not path.startswith("/static"):
        logger.info(
            f"request_id={request_id} method={request.method} path={path} "
            f"status={response.status_code} duration={duration_ms}ms"
        )
    return response

@app.on_event("startup")
async def startup_db_client():
    await connect_to_mongo()
    import asyncio
    from app.api.routes.backup import run_daily_backup_cron
    asyncio.create_task(run_daily_backup_cron())

@app.on_event("shutdown")
async def shutdown_db_client():
    await close_mongo_connection()

# Mount static files for invoices/exports (strictly public files only)
os.makedirs("static/invoices", exist_ok=True)
os.makedirs("static/exports", exist_ok=True)
os.makedirs("data/backups", exist_ok=True)
os.makedirs("data/documents", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Register all routers
app.include_router(auth.router,       prefix="/api/auth",       tags=["Authentication"])
app.include_router(users.router,      prefix="/api/users",      tags=["Users"])
app.include_router(products.router,   prefix="/api/products",   tags=["Products"])
app.include_router(categories.router, prefix="/api/categories", tags=["Categories"])
app.include_router(customers.router,  prefix="/api/customers",  tags=["Customers"])
app.include_router(suppliers.router,  prefix="/api/suppliers",  tags=["Suppliers"])
app.include_router(purchases.router,  prefix="/api/purchases",  tags=["Purchases"])
app.include_router(sales.router,      prefix="/api/sales",      tags=["Sales"])
app.include_router(payments.router,   prefix="/api/payments",   tags=["Payments"])
app.include_router(inventory.router,  prefix="/api/inventory",  tags=["Inventory"])
app.include_router(reports.router,    prefix="/api/reports",    tags=["Reports"])
app.include_router(settings.router,   prefix="/api/settings",   tags=["Settings"])
app.include_router(backup.router,     prefix="/api/backup",     tags=["Backup"])
app.include_router(returns.router,    prefix="/api/returns",    tags=["Returns"])
app.include_router(traceability.router, prefix="/api/traceability", tags=["Traceability"])
app.include_router(ai_import.router, prefix="/api/ai-import", tags=["AI Import"])
app.include_router(documents.router, prefix="/api/documents", tags=["Documents"])
app.include_router(pricing.router,   prefix="/api/pricing",   tags=["Pricing Intelligence"])


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.1.0",
        "build": "production_ready_v1",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "features": ["universal_table_ocr", "gemini_vision", "fefo_inventory", "decimal_accounting"]
    }

@app.get("/api/ready")
async def readiness_check():
    from app.core.database import db_instance
    if not db_instance.client:
        return JSONResponse(status_code=503, content={"status": "not_ready", "database": "disconnected"})
    try:
        await db_instance.client.admin.command("ping")
        return {
            "status": "ready",
            "database": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    except Exception as exc:
        logger.warning(f"Readiness probe failed: {exc}")
        return JSONResponse(status_code=503, content={"status": "not_ready", "database": "error", "error": str(exc)})

@app.get("/api/live")
async def liveness_check():
    return {
        "status": "live",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/features")
async def features_spec():
    from app.core.features import PLAN_LIMITS, FeatureFlag
    return {
        "available_flags": [f.value for f in FeatureFlag],
        "plans": PLAN_LIMITS
    }

