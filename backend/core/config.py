import os
import logging
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

# NOTE: 預設開發金鑰，生產環境必須透過環境變數覆寫
_DEFAULT_SECRET_KEY = "qualitas-dev-secret-key-change-in-production"

class Settings:
    PROJECT_NAME: str = "Qualitas API"
    VERSION: str = "1.0.0"
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "dev")  # dev, production

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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # CORS
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./qualitas.db")

settings = Settings()

