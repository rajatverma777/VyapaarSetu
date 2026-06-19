from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from app.core.database import get_database
from app.core.security import require_admin, serialize_doc
from app.core.config import settings
from datetime import datetime
import json, os, zipfile, io

router = APIRouter()

COLLECTIONS = [
    "users", "products", "categories", "customers", "suppliers",
    "sales", "purchases", "payments", "stock_logs", "ledger",
    "settings", "counters", "units"
]

@router.post("/create")
async def create_backup(
    db = Depends(get_database),
    current_user = Depends(require_admin)
):
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    backup_data = {"timestamp": timestamp, "collections": {}}

    for col_name in COLLECTIONS:
        docs = await db[col_name].find({}).to_list(None)
        backup_data["collections"][col_name] = [serialize_doc(d) for d in docs]

    filename = f"backup_{timestamp}.json"
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
async def list_backups(current_user = Depends(require_admin)):
    os.makedirs(settings.BACKUP_DIR, exist_ok=True)
    files = []
    for f in os.listdir(settings.BACKUP_DIR):
        if f.endswith(".zip"):
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
async def download_backup(filename: str, current_user = Depends(require_admin)):
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
    filepath = os.path.join(settings.BACKUP_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Backup not found")

    with zipfile.ZipFile(filepath, "r") as zf:
        json_filename = zf.namelist()[0]
        with zf.open(json_filename) as f:
            backup_data = json.load(f)

    restored = {}
    for col_name, docs in backup_data.get("collections", {}).items():
        if not docs:
            continue
        await db[col_name].delete_many({})
        # Convert string _id back — skip _id restore to avoid conflicts
        clean_docs = [{k: v for k, v in d.items() if k != "id"} for d in docs]
        if clean_docs:
            await db[col_name].insert_many(clean_docs)
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
            from app.core.database import get_database
            db = get_database()
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
