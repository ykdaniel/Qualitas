import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Qualitas API"
    VERSION: str = "1.0.0"
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "dev")  # dev, production

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "qualitas-dev-secret-key-change-in-production")
    
    def __init__(self):
        if self.ENVIRONMENT == "production" and self.SECRET_KEY == "qualitas-dev-secret-key-change-in-production":
            print("WARNING: You are running in production with a default SECRET_KEY. Please set SECRET_KEY environment variable.")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
    
    # CORS
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./qualitas.db")

settings = Settings()
