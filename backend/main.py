from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
import os
import logging

from app.core.database import connect_to_mongo, close_mongo_connection
from app.api.routes import (
    auth, users, products, categories, customers,
    suppliers, purchases, sales, payments,
    inventory, reports, settings, backup, returns, traceability
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
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
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

# Mount static files for invoices/exports
os.makedirs("static/invoices", exist_ok=True)
os.makedirs("static/exports", exist_ok=True)
os.makedirs("static/backups", exist_ok=True)
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

@app.get("/api/health")
async def health_check():
    # Trigger uvicorn reload for fresh database setup
    return {"status": "healthy", "version": "1.0.0"}
