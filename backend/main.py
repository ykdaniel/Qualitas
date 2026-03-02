import logging
import os
from logging.handlers import RotatingFileHandler

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import db_migrations
import db_seeder
import models
from core.config import settings
from database import engine
from middleware.rate_limiter import RateLimitMiddleware
from routers import (
    audit,
    auth,
    checklist,
    contractors,
    fat,
    file_router,
    followup,
    iam,
    itp,
    itr,
    km,
    kpi,
    ncr,
    noi,
    obs,
    pqp,
)
from routers import settings as settings_router
from scheduler import start_scheduler

# Setup Logger with rotation
# 使用環境變數配置日誌級別和目錄
LOG_DIR = settings.LOG_DIR
LOG_LEVEL = settings.LOG_LEVEL

# 創建日誌目錄
os.makedirs(LOG_DIR, exist_ok=True)

# 設置不同級別的日誌處理器
# 1. INFO 級別以上的日誌（包含 INFO, WARNING, ERROR, CRITICAL）
info_handler = RotatingFileHandler(
    os.path.join(LOG_DIR, "app.log"),
    mode='a',
    maxBytes=50*1024*1024,  # 50MB
    backupCount=10,
    encoding='utf-8'
)
info_handler.setLevel(logging.INFO)

# 2. ERROR 級別以上的日誌（只包含 ERROR, CRITICAL）
error_handler = RotatingFileHandler(
    os.path.join(LOG_DIR, "error.log"),
    mode='a',
    maxBytes=10*1024*1024,  # 10MB
    backupCount=5,
    encoding='utf-8'
)
error_handler.setLevel(logging.ERROR)

# 3. 終端輸出
console_handler = logging.StreamHandler()
console_handler.setLevel(logging.DEBUG if settings.DEBUG else logging.INFO)

# 設定格式
formatter = logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
info_handler.setFormatter(formatter)
error_handler.setFormatter(formatter)
console_handler.setFormatter(formatter)

# 配置根 logger
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    handlers=[console_handler, info_handler, error_handler]
)

logger = logging.getLogger(__name__)
logger.info(f"日誌系統已啟動 - 級別: {LOG_LEVEL}, 目錄: {LOG_DIR}")

# Create tables
models.Base.metadata.create_all(bind=engine)

# Run Migrations & Seeding
db_migrations.run_migrations()
db_seeder.run_seeding()

app = FastAPI(title=settings.PROJECT_NAME, version=settings.VERSION)

# Middleware
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

# Static Files
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Event Handlers
@app.on_event("startup")
async def startup_event():
    start_scheduler()
    logger.info("Background scheduler started.")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Global Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

# API Router
from fastapi import APIRouter

api = APIRouter(prefix="/api")

# Include Routers
# Added auth and settings_router
for router in [
    auth,
    settings_router,
    iam,
    itp, ncr, noi, itr, pqp, obs, contractors, followup, audit, checklist, kpi, file_router, fat, km
]:
    api.include_router(router.router)

app.include_router(api)

@app.get("/")
def read_root():
    return {"message": f"{settings.PROJECT_NAME} is running"}

# hot reload trigger
