import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Qualitas API"
    VERSION: str = "1.0.0"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    # Security
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

    # CORS
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./qualitas.db")

    def __init__(self):
        """Validate critical security settings on initialization."""
        if not self.SECRET_KEY:
            raise RuntimeError(
                "CRITICAL SECURITY ERROR: SECRET_KEY must be set in environment variables.\n"
                "Please set SECRET_KEY in your .env file with a strong random value.\n"
                "Example: SECRET_KEY=your-strong-random-secret-key-here"
            )

        # Warn if using a weak or default-looking secret key
        if len(self.SECRET_KEY) < 32:
            raise RuntimeError(
                "CRITICAL SECURITY ERROR: SECRET_KEY is too short (minimum 32 characters).\n"
                "Please use a strong random secret key with at least 32 characters."
            )

        # Prevent using the old default secret in production
        if self.ENVIRONMENT == "production" and "qualitas" in self.SECRET_KEY.lower():
            raise RuntimeError(
                "CRITICAL SECURITY ERROR: Cannot use default or example SECRET_KEY in production.\n"
                "Please generate a new random SECRET_KEY for production use."
            )

settings = Settings()
