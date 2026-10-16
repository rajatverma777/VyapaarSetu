from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator
from typing import Optional
from typing_extensions import Self

_BASE_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_FILE = _BASE_DIR / ".env"

class Settings(BaseSettings):
    # App
    APP_NAME: str = "Vyapaar Setu"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # MongoDB
    MONGODB_URL: str = "mongodb://localhost:27017"
    MONGODB_DB_NAME: str = "wholesale_erp"

    # JWT
    SECRET_KEY: str = "your-super-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15  # Reduced to 15 mins for SaaS security standard
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # File paths
    STATIC_DIR: str = "static"
    INVOICE_DIR: str = "static/invoices"
    EXPORT_DIR: str = "static/exports"
    BACKUP_DIR: str = "data/backups"
    DOCS_DIR: str = "data/documents"

    # Gemini
    GEMINI_API_KEY: Optional[str] = None

    # Self-Hosted AI Service
    AI_SERVICE_URL: str = "http://localhost:8001"

    @model_validator(mode="after")
    def validate_secret_key(self) -> Self:
        import secrets
        import logging
        _log = logging.getLogger(__name__)
        if not self.DEBUG and (not self.SECRET_KEY or self.SECRET_KEY == "your-super-secret-key-change-in-production-min-32-chars" or len(self.SECRET_KEY) < 32):
            _log.warning(
                "SECURITY WARNING: SECRET_KEY is not configured or using default! "
                "Auto-generating a secure ephemeral key for runtime stability. "
                "Please configure SECRET_KEY in your deployment environment variables."
            )
            self.SECRET_KEY = secrets.token_urlsafe(48)
        return self

    model_config = SettingsConfigDict(
        env_file=(str(_ENV_FILE), ".env"),
        extra="ignore"
    )

settings = Settings()
