from pydantic_settings import BaseSettings
from pydantic import model_validator
from typing import Optional
from typing_extensions import Self

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
    BACKUP_DIR: str = "static/backups"

    # Gemini
    GEMINI_API_KEY: Optional[str] = None

    @model_validator(mode="after")
    def validate_secret_key(self) -> Self:
        if not self.DEBUG and self.SECRET_KEY == "your-super-secret-key-change-in-production-min-32-chars":
            raise ValueError("SECRET_KEY must be changed from the default value in production mode (DEBUG=False).")
        return self

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()
