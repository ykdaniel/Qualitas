import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# NOTE: 預設開發金鑰，生產環境必須透過環境變數覆寫
_DEFAULT_SECRET_KEY = "qualitas-dev-secret-key-change-in-production"

class Settings:
    PROJECT_NAME: str = "Qualitas API"
    VERSION: str = "1.0.0"

    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")  # development, staging, production

    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_DIR: str = os.getenv("LOG_DIR", "logs")

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", _DEFAULT_SECRET_KEY)

    def __init__(self):
        if self.ENVIRONMENT == "production" and self.SECRET_KEY == _DEFAULT_SECRET_KEY:
            raise RuntimeError(
                "FATAL: 生產環境偵測到預設 SECRET_KEY。"
                "請透過環境變數 SECRET_KEY 設定一個安全的金鑰後再啟動。"
            )
        elif self.SECRET_KEY == _DEFAULT_SECRET_KEY:
            logger.warning("使用預設 SECRET_KEY，僅適用於開發環境。")

    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours

    # CORS
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173").split(",")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./qualitas.db")
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "10"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "20"))

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "10"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "uploads")

    # Email (郵件服務設定 - 用於通知功能)
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587")) if os.getenv("SMTP_PORT") else 587
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "noreply@qualitas-erp.com")

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))

    # Timezone
    TIMEZONE: str = os.getenv("TIMEZONE", "Asia/Taipei")

    # Debug
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

settings = Settings()

