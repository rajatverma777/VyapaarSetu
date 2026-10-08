from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from app.repositories.base import BaseRepository

class AuditService:
    """
    Centralized Audit Logging Service.
    Ensures immutable recording of business-critical events:
    - Auth (login, logout, token refresh)
    - Financial operations (sales, returns, payments, credit adjustments)
    - Inventory movements (manual stock corrections, write-offs, transfers)
    - Administrative actions (user permission modifications, backups, tenant settings)
    """

    def __init__(self, db, tenant_id: str):
        self.db = db
        self.tenant_id = tenant_id
        self.repo = BaseRepository(db, tenant_id, "audit_logs")

    async def log_action(
        self,
        user_id: str,
        action: str,
        resource: str,
        resource_id: Optional[str] = None,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None,
        session=None
    ) -> str:
        """
        Record an immutable audit entry scoped strictly to tenant_id.
        """
        now = datetime.now(timezone.utc)
        record = {
            "tenant_id": self.tenant_id,
            "user_id": str(user_id) if user_id else "system",
            "action": action,
            "resource": resource,
            "resource_id": str(resource_id) if resource_id else None,
            "old_value": old_value,
            "new_value": new_value,
            "details": details or {},
            "ip_address": ip_address,
            "user_agent": user_agent,
            "request_id": request_id,
            "created_at": now,
        }

        # Filter out sensitive credentials or passwords if passed inadvertently
        if old_value and isinstance(old_value, dict):
            for sensitive_key in ["password", "password_hash", "hashed_password", "token", "secret"]:
                if sensitive_key in old_value:
                    old_value[sensitive_key] = "[REDACTED]"
        if new_value and isinstance(new_value, dict):
            for sensitive_key in ["password", "password_hash", "hashed_password", "token", "secret"]:
                if sensitive_key in new_value:
                    new_value[sensitive_key] = "[REDACTED]"

        created = await self.repo.create(record, session=session)
        return str(created)

    async def get_recent_logs(
        self,
        resource: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 50,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """Retrieve paginated audit logs for current tenant."""
        filter_query: Dict[str, Any] = {}
        if resource:
            filter_query["resource"] = resource
        if action:
            filter_query["action"] = action
        return await self.repo.find_all(filter_query=filter_query, skip=skip, limit=limit, sort=[("created_at", -1)])
