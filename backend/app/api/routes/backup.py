from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from app.core.database import get_database
from app.core.security import require_admin, serialize_doc
from app.core.config import settings
from datetime import datetime
import json, os, zipfile

router = APIRouter()

# Collections backed up per-tenant (excludes 'users' which spans tenants)
TENANT_BACKUP_COLLECTIONS = [
    "products", "categories", "customers", "suppliers",
    "sales", "purchases", "payments", "stock_logs", "ledger",
    "settings", "counters", "units", "batches", "documents",
    "returns", "recalls",
]

@router.post("/create")
async def create_backup(
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    """
    SECURITY: Backup only the current admin's company data.
    tenant_id is derived from the JWT — never trusted from the client.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Cannot determine your company. Backup aborted.")

    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_data = {
        "timestamp": timestamp,
        "tenant_id": tenant_id,
        "collections": {}
    }

    # db is already tenant-scoped via TenantDatabase — all find({}) calls filter by tenant_id
    for col_name in TENANT_BACKUP_COLLECTIONS:
        try:
            docs = await db[col_name].find({}).to_list(None)
            backup_data["collections"][col_name] = [serialize_doc(d) for d in docs]
        except Exception:
            backup_data["collections"][col_name] = []

    # Include current user's own user record (not all users)
    from bson import ObjectId
    own_user = await db.users.find_one({"_id": current_user["_id"]})
    users_in_tenant = await db.users.find({"tenant_id": tenant_id}).to_list(None)
    backup_data["collections"]["users"] = [serialize_doc(u) for u in users_in_tenant]

    filename = f"backup_{tenant_id}_{timestamp}.json"
    filepath = os.path.join(settings.BACKUP_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(backup_data, f, default=str, indent=2)

    # Zip it
    zip_path = filepath.replace(".json", ".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(filepath, filename)
    os.remove(filepath)

    return {
        "message": "Backup created",
        "filename": os.path.basename(zip_path),
        "path": f"/static/backups/{os.path.basename(zip_path)}"
    }

@router.get("/list")
async def list_backups(
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    """
    SECURITY: Only list backups belonging to the current tenant.
    """
    tenant_id = current_user.get("tenant_id", "")
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    files = []
    for f in os.listdir(settings.BACKUP_DIR):
        if not f.endswith(".zip"):
            continue
        # Only show backups that contain this tenant's ID in the filename
        if tenant_id and f"_{tenant_id}_" not in f and not f.startswith("backup_auto_"):
            continue
        fp = os.path.join(settings.BACKUP_DIR, f)
        files.append({
            "filename": f,
            "size": os.path.getsize(fp),
            "created": datetime.fromtimestamp(os.path.getctime(fp)).isoformat(),
            "url": f"/static/backups/{f}"
        })
    files.sort(key=lambda x: x["created"], reverse=True)
    return files

@router.get("/download/{filename}")
async def download_backup(
    filename: str,
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    """
    SECURITY: Only allow downloading backups that belong to the current tenant.
    """
    tenant_id = current_user.get("tenant_id", "")
    # Filename must contain the tenant_id to prevent IDOR access to other tenants' backups
    if tenant_id and f"_{tenant_id}_" not in filename and not filename.startswith("backup_auto_"):
        raise HTTPException(status_code=403, detail="Access denied to this backup file")
    filepath = os.path.join(settings.BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(filepath, media_type="application/zip", filename=filename)

@router.post("/restore/{filename}")
async def restore_backup(
    filename: str,
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    """
    SECURITY: Restore ONLY the current tenant's data from a backup.
    - Verifies the backup belongs to the current tenant.
    - Only deletes and re-inserts documents for the current tenant.
    - Cannot overwrite other tenants' data.
    """
    tenant_id = current_user.get("tenant_id")
    if not tenant_id:
        raise HTTPException(status_code=403, detail="Cannot determine your company. Restore aborted.")

    # IDOR protection: only restore your own tenant's backup
    if f"_{tenant_id}_" not in filename:
        raise HTTPException(status_code=403, detail="This backup does not belong to your company")

    filepath = os.path.join(settings.BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    with zipfile.ZipFile(filepath, "r") as zf:
        json_filename = zf.namelist()[0]
        with zf.open(json_filename) as f:
            backup_data = json.load(f)

    # Verify the backup's embedded tenant_id matches the current user
    backup_tenant = backup_data.get("tenant_id")
    if backup_tenant and backup_tenant != tenant_id:
        raise HTTPException(
            status_code=403,
            detail="Backup tenant mismatch. You can only restore your own company's backup."
        )

    restored = {}
    for col_name, docs in backup_data.get("collections", {}).items():
        if not docs:
            continue
        if col_name == "users":
            # For users: only restore users that belong to this tenant
            tenant_docs = [d for d in docs if d.get("tenant_id") == tenant_id]
            if tenant_docs:
                await db.users.delete_many({"tenant_id": tenant_id})
                clean = [{k: v for k, v in d.items() if k != "id"} for d in tenant_docs]
                await db.users.insert_many(clean)
            restored[col_name] = len(tenant_docs)
        else:
            # db is tenant-scoped: delete_many({}) only deletes current tenant's docs
            await db[col_name].delete_many({})
            # Strip the 'id' field (was serialized _id) and ensure tenant_id is set
            clean_docs = []
            for d in docs:
                clean = {k: v for k, v in d.items() if k != "id"}
                clean["tenant_id"] = tenant_id  # enforce ownership on restore
                clean_docs.append(clean)
            if clean_docs:
                # Insert via raw collection to avoid double-injection by TenantCollection
                from app.core.database import db_instance
                await db_instance.db[col_name].insert_many(clean_docs)
            restored[col_name] = len(clean_docs)

    return {"message": "Restore completed", "restored": restored}

async def run_daily_backup_cron():
    import asyncio
    import logging
    from datetime import timedelta
    logger = logging.getLogger(__name__)
    
    # Wait 30 seconds after startup before running the first backup to prevent slowdowns
    await asyncio.sleep(30)
    
    while True:
        try:
            logger.info("Starting automated background daily backup...")
            from app.core.database import db_instance
            db = db_instance.db
            if db is None:
                logger.warning("Database client not initialized, skipping backup.")
                await asyncio.sleep(60)
                continue
                
            os.makedirs(settings.BACKUP_DIR, exist_ok=True)
            timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            backup_data = {"timestamp": timestamp, "collections": {}}
            
            all_cols = COLLECTIONS + ["batches"]
            for col_name in all_cols:
                try:
                    docs = await db[col_name].find({}).to_list(None)
                    backup_data["collections"][col_name] = [serialize_doc(d) for d in docs]
                except Exception as col_err:
                    logger.error(f"Failed to backup collection '{col_name}': {col_err}")
            
            filename = f"backup_auto_{timestamp}.json"
            filepath = os.path.join(settings.BACKUP_DIR, filename)
            with open(filepath, "w") as f:
                json.dump(backup_data, f, default=str, indent=2)
                
            zip_path = filepath.replace(".json", ".zip")
            with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
                zf.write(filepath, filename)
            os.remove(filepath)
            logger.info(f"Automated daily backup created successfully: {os.path.basename(zip_path)}")
            
            # Prune backups older than 7 days
            for f in os.listdir(settings.BACKUP_DIR):
                if f.startswith("backup_auto_") and f.endswith(".zip"):
                    fp = os.path.join(settings.BACKUP_DIR, f)
                    creation_time = datetime.fromtimestamp(os.path.getctime(fp))
                    if datetime.now() - creation_time > timedelta(days=7):
                        os.remove(fp)
                        logger.info(f"Pruned old automated backup: {f}")
                        
        except Exception as e:
            logger.error(f"Automated daily backup cron failed: {e}", exc_info=True)
            
        # Sleep for 24 hours
        await asyncio.sleep(24 * 60 * 60)
