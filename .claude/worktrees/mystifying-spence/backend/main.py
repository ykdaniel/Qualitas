# 載入環境變數 (必須在其他 import 之前)
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Depends, HTTPException, status, APIRouter
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

import uuid
import models, schemas, crud
from database import engine, get_db
from sqlalchemy import text
from fastapi import Request
from fastapi.responses import JSONResponse
import logging
import os

# Import Routers
from routers import contractors as contractors_router
from middleware.rate_limiter import RateLimitMiddleware
from scheduler import start_scheduler

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create tables
models.Base.metadata.create_all(bind=engine)

# Migration: Add unique constraint to reference_sequences (project, vendor, doc)
try:
    with engine.connect() as conn:
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_ref_seq_unique ON reference_sequences (project, vendor, doc)"))
        conn.commit()
except Exception:
    pass  # index may already exist

# Migration: Add unique indexes on reference/document number columns for each table
# NOTE: 使用白名單驗證防止 SQL Injection
ALLOWED_INDEX_CONFIGS = {
    ("noi", "referenceNo"),
    ("itr", "documentNumber"),
    ("ncr", "documentNumber"),
    ("obs", "documentNumber"),
    ("itp", "referenceNo"),
    ("pqp", "pqpNo"),
    ("followup", "issueNo"),
}

def add_unique_index_if_not_exists(table: str, column: str) -> None:
    """
    為指定表格欄位建立唯一索引
    使用白名單驗證防止 SQL Injection
    """
    # 安全檢查：只允許預定義的表格和欄位組合
    if (table, column) not in ALLOWED_INDEX_CONFIGS:
        raise ValueError(f"Invalid table/column combination: {table}.{column}")
    
    try:
        with engine.connect() as conn:
            # 使用預定義的安全值，因為已通過白名單驗證
            conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_{column}_unique ON {table} ({column})"))
            conn.commit()
    except Exception:
        pass  # index may already exist or column has duplicates

# 建立索引
for table, column in ALLOWED_INDEX_CONFIGS:
    add_unique_index_if_not_exists(table, column)

# Migration: Add missing columns to ncr table if not exists
try:
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(ncr)"))
        columns = [row[1] for row in result]
        if "dueDate" not in columns:
            conn.execute(text("ALTER TABLE ncr ADD COLUMN dueDate TEXT"))
            conn.commit()
        if "last_reminded_at" not in columns:
            conn.execute(text("ALTER TABLE ncr ADD COLUMN last_reminded_at TEXT"))
            conn.commit()
except Exception:
    pass

# Migration: Add missing columns to noi table if not exists
try:
    with engine.connect() as conn:
        # Check if column exists
        result = conn.execute(text("PRAGMA table_info(noi)"))
        columns = [row[1] for row in result]
        for col in ["attachments", "remark", "closeoutDate", "ncrNumber", "dueDate", "last_reminded_at"]:
            if col not in columns:
                conn.execute(text(f"ALTER TABLE noi ADD COLUMN {col} TEXT"))
                conn.commit()
except Exception:
    pass


# Default document naming rules（若資料庫尚未有規則時使用）
DEFAULT_NAMING_RULES = [
    {"doc_type": "itp", "prefix": "QTS-[ABBREV]-ITP-", "sequence_digits": 6},
    {"doc_type": "noi", "prefix": "QTS-[ABBREV]-NOI-", "sequence_digits": 6},
    {"doc_type": "itr", "prefix": "QTS-[ABBREV]-ITR-", "sequence_digits": 6},
    {"doc_type": "ncr", "prefix": "QTS-[ABBREV]-NCR-", "sequence_digits": 6},
    {"doc_type": "obs", "prefix": "QTS-[ABBREV]-OBS-", "sequence_digits": 6},
    {"doc_type": "pqp", "prefix": "QTS-[ABBREV]-PQP-", "sequence_digits": 6},
    {"doc_type": "followup", "prefix": "QTS-[ABBREV]-FUI-", "sequence_digits": 6},
    {"doc_type": "fat", "prefix": "QTS-[ABBREV]-FAT-", "sequence_digits": 6},
    {"doc_type": "checklist", "prefix": "QTS-[ABBREV]-CHK-", "sequence_digits": 6},
]

# Migration: Add missing columns to itp, obs, followup, itr
try:
    with engine.connect() as conn:
        # ITP
        result = conn.execute(text("PRAGMA table_info(itp)"))
        columns = [row[1] for row in result]
        if "detail_data" not in columns:
            conn.execute(text("ALTER TABLE itp ADD COLUMN detail_data TEXT"))
        if "dueDate" not in columns:
            conn.execute(text("ALTER TABLE itp ADD COLUMN dueDate TEXT"))
        if "last_reminded_at" not in columns:
            conn.execute(text("ALTER TABLE itp ADD COLUMN last_reminded_at TEXT"))
        
        # OBS
        result = conn.execute(text("PRAGMA table_info(obs)"))
        columns = [row[1] for row in result]
        if "dueDate" not in columns:
            conn.execute(text("ALTER TABLE obs ADD COLUMN dueDate TEXT"))
        if "last_reminded_at" not in columns:
            conn.execute(text("ALTER TABLE obs ADD COLUMN last_reminded_at TEXT"))

        # ITR
        result = conn.execute(text("PRAGMA table_info(itr)"))
        columns = [row[1] for row in result]
        if "last_reminded_at" not in columns:
            conn.execute(text("ALTER TABLE itr ADD COLUMN last_reminded_at TEXT"))
        if "dueDate" not in columns:
             conn.execute(text("ALTER TABLE itr ADD COLUMN dueDate TEXT"))

        # FollowUp
        result = conn.execute(text("PRAGMA table_info(followup)"))
        columns = [row[1] for row in result]
        if "last_reminded_at" not in columns:
            conn.execute(text("ALTER TABLE followup ADD COLUMN last_reminded_at TEXT"))
            
        conn.commit()
except Exception:
    pass

# Add attachments column to obs if missing (migration for existing DB)
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE obs ADD COLUMN attachments TEXT"))
        conn.commit()
except Exception:
    pass  # column may already exist

# Migration: Add attachments column to itp if missing
try:
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(itp)"))
        columns = [row[1] for row in result]
        if "attachments" not in columns:
            conn.execute(text("ALTER TABLE itp ADD COLUMN attachments TEXT"))
            conn.commit()
except Exception:
    pass

# Migration: Add attachments column to itr if missing
try:
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(itr)"))
        columns = [row[1] for row in result]
        if "attachments" not in columns:
            conn.execute(text("ALTER TABLE itr ADD COLUMN attachments TEXT"))
            conn.commit()
except Exception:
    pass

# Migration: Add attachments column to ncr if missing
try:
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(ncr)"))
        columns = [row[1] for row in result]
        if "attachments" not in columns:
            conn.execute(text("ALTER TABLE ncr ADD COLUMN attachments TEXT"))
            conn.commit()
except Exception:
    pass

# Migration: Add noiNumber column to NCR table (連結到觸發此 NCR 的 NOI)
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE ncr ADD COLUMN noiNumber VARCHAR"))
        conn.commit()
except Exception:
    pass  # column may already exist

# Migration: Add ncrNumber column to NOI table (若此 NOI 是針對 NCR 的重新檢驗)
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE noi ADD COLUMN ncrNumber VARCHAR"))
        conn.commit()
except Exception:
    pass  # column may already exist

# Migration: Rename itpNo to noiNumber in ITR table (連結到產生此 ITR 的 NOI)
# SQLite doesn't support RENAME COLUMN in older versions, so we add new column if missing
try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE itr ADD COLUMN noiNumber VARCHAR"))
        conn.commit()
except Exception:
    pass  # column may already exist

# Migration: Add attachments column to pqp if missing
try:
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(pqp)"))
        columns = [row[1] for row in result]
        if "attachments" not in columns:
            conn.execute(text("ALTER TABLE pqp ADD COLUMN attachments TEXT"))
            conn.commit()
except Exception:
    pass

# Migration: Add noiNumber column to checklist table
try:
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(checklist)"))
        columns = [row[1] for row in result]
        if "noiNumber" not in columns:
            conn.execute(text("ALTER TABLE checklist ADD COLUMN noiNumber VARCHAR"))
            conn.commit()
except Exception:
    pass

# Migration: Create document_naming_rules table if not exists
try:
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS document_naming_rules (
                id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                doc_type VARCHAR NOT NULL,
                prefix VARCHAR NOT NULL,
                sequence_digits INTEGER NOT NULL DEFAULT 6
            )
        """))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_document_naming_rules_doc_type ON document_naming_rules (doc_type)"))
        conn.commit()
except Exception:
    pass

# Seed default contractors if empty
def seed_default_contractors():
    from database import SessionLocal
    db = SessionLocal()
    try:
        if crud.get_contractors(db, limit=1) == []:
            for c in [
                {"package": "", "name": "廠商A", "abbreviation": "A", "scope": "電氣工程", "contactPerson": "張三", "email": "vendor-a@example.com", "phone": "02-1234-5678", "address": "台北市信義區信義路一段100號", "status": "active"},
                {"package": "", "name": "廠商B", "abbreviation": "B", "scope": "機械工程", "contactPerson": "李四", "email": "vendor-b@example.com", "phone": "02-2345-6789", "address": "新北市板橋區文化路二段200號", "status": "active"},
                {"package": "", "name": "廠商C", "abbreviation": "C", "scope": "土木工程", "contactPerson": "王五", "email": "vendor-c@example.com", "phone": "02-3456-7890", "address": "桃園市中壢區中正路三段300號", "status": "active"},
            ]:
                crud.create_contractor(db, schemas.ContractorCreate(**c))
    finally:
        db.close()

seed_default_contractors()

def seed_default_pqp():
    from database import SessionLocal
    db = SessionLocal()
    try:
        if crud.get_pqps(db, skip=0, limit=1) == []:
            today = datetime.now().strftime("%Y-%m-%d")
            crud.create_pqp(db, schemas.PQPCreate(
                pqpNo="PQP-001",
                title="範例品質計劃",
                description="這是一個範例品質計劃描述",
                vendor="廠商A",
                status="Approved",
                version="Rev1.0",
                createdAt=today,
                updatedAt=today,
            ))
    finally:
        db.close()

seed_default_pqp()

app = FastAPI()

# 註冊 Rate Limiting Middleware
app.add_middleware(RateLimitMiddleware)

@app.on_event("startup")
async def startup_event():
    start_scheduler()
    logger.info("Background scheduler started.")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # NOTE: 僅記錄內部錯誤詳情，不對外暴露
    logger.error(f"Global Exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )

# Configuration - CORS 安全設定
# NOTE: 生產環境應明確指定允許的來源
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

# Include Routers
app.include_router(contractors_router.router)

# Security Configuration - 從環境變數載入（os 已透過 dotenv 匯入）
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    logger.warning("SECRET_KEY not set in environment, using default (UNSAFE for production!)")
    SECRET_KEY = "qualitas-dev-secret-key-change-in-production"
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# Auth Models
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None


# Auth Functions
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    # 確保 token 中包含 user_id
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = TokenData(username=username)
    except JWTError:
        raise credentials_exception
    
    user = crud.get_user_by_username(db, username=token_data.username)
    if user is None:
        raise credentials_exception
    return user

# All API routes under /api prefix
api = APIRouter(prefix="/api")

@api.post("/auth/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user:
        # Fallback to check email if username not found (allow login by email)
        user = crud.get_user_by_email(db, email=form_data.username)
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id}, 
        expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}


@api.get("/auth/verify")
async def auth_verify(current_user: schemas.User = Depends(get_current_user)):
    return {"ok": True}

@api.get("/user/profile", response_model=schemas.User)
async def read_users_me(current_user: schemas.User = Depends(get_current_user)):
    return current_user


@api.get("/settings/naming-rules", response_model=List[schemas.NamingRule])
def get_naming_rules(db: Session = Depends(get_db)):
    """
    取得目前文件命名規則。
    若資料表為空，會先寫入預設規則後再回傳。
    """
    rules = db.query(models.DocumentNamingRule).all()
    if not rules:
        for r in DEFAULT_NAMING_RULES:
            # 避免重複建立相同 doc_type
            if not db.query(models.DocumentNamingRule).filter(
                models.DocumentNamingRule.doc_type == r["doc_type"]
            ).first():
                db.add(models.DocumentNamingRule(**r))
        db.commit()
        rules = db.query(models.DocumentNamingRule).all()
    return rules


@api.put("/settings/naming-rules", response_model=List[schemas.NamingRule])
def update_naming_rules(
    rules: List[schemas.NamingRuleBase],
    db: Session = Depends(get_db),
):
    """
    更新文件命名規則：
    - 依 doc_type 小寫為 key 做 upsert
    """
    try:
        for rule in rules:
            doc_type_normalized = (rule.doc_type or "").strip().lower()
            if not doc_type_normalized:
                continue
            seq_digits = rule.sequence_digits
            if seq_digits is None or seq_digits < 1 or seq_digits > 6:
                seq_digits = 6
            db_rule = db.query(models.DocumentNamingRule).filter(
                models.DocumentNamingRule.doc_type == doc_type_normalized
            ).first()
            if db_rule:
                db_rule.prefix = rule.prefix or ""
                db_rule.sequence_digits = seq_digits
            else:
                db.add(
                    models.DocumentNamingRule(
                        doc_type=doc_type_normalized,
                        prefix=rule.prefix or "",
                        sequence_digits=seq_digits,
                    )
                )
        db.commit()
        return db.query(models.DocumentNamingRule).all()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# Mount API router
# app.include_router(api) # Old monolithic router

# Include Module Routers
from routers import itp, ncr, noi, itr, pqp, obs, contractors, followup, iam, audit, checklist, kpi
from routers import file_router

api.include_router(itp.router)
api.include_router(ncr.router)
api.include_router(noi.router)
api.include_router(itr.router)
api.include_router(pqp.router)
api.include_router(obs.router)
api.include_router(contractors.router)
api.include_router(followup.router)
api.include_router(iam.router)
api.include_router(audit.router)
api.include_router(checklist.router)
api.include_router(kpi.router)
api.include_router(file_router.router)

app.include_router(api)

# 掛載靜態檔案服務，提供 uploads/ 目錄存取
from fastapi.staticfiles import StaticFiles
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Seed Initial User and Role
def seed_initial_data():
    from database import SessionLocal
    db = SessionLocal()
    try:
        # 1. Create Admin Role if not exists
        admin_role = crud.get_role_by_name(db, "admin")
        if not admin_role:
            admin_role = crud.create_role(db, schemas.RoleCreate(
                name="admin",
                description="Administrator with full access",
                permissions=["read", "write", "delete", "manage_users", "manage_roles"]
            ))
            print("Seeded admin role.")

        # 2. Create User Role if not exists
        user_role = crud.get_role_by_name(db, "user")
        if not user_role:
            user_role = crud.create_role(db, schemas.RoleCreate(
                name="user",
                description="Standard user",
                permissions=["read"]
            ))
            print("Seeded user role.")
        
        # 3. Create Admin User if not exists
        admin_user = crud.get_user_by_email(db, "admin@example.com")
        if not admin_user:
            crud.create_user(db, schemas.UserCreate(
                username="admin",
                email="admin@example.com",
                password="admin",
                full_name="System Administrator",
                role_id=admin_role.id
            ), hashed_password=get_password_hash("admin"))
            print("Seeded admin user.")

        # 4. Create Seed Checklist Records if none exists
        from models import Checklist
        import json
        if db.query(Checklist).count() == 0:
            seed_data = {
                "recordsNo": "QTS-RKS-HL-CHK-000001",
                "packageName": "RKS",
                "activity": "Stakeout 放樣",
                "itpIndex": 0,
                "date": "2024-03-20",
                "status": "Pass",
                "location": "基礎區",
                "detail_data": json.dumps({
                    "projectTitle": "Hai Long Offshore Wind Farm Project",
                    "recordsNo": "QTS-RKS-HL-CHK-000001",
                    "packageName": "RKS",
                    "inspectionDate": "2024-03-20",
                    "location": "基礎區",
                    "stage": "Before",
                    "items": [
                        {"id": 1, "item": "Drawing Number 圖說編號", "criteria": "As per drawing", "situation": "NA", "result": "O"},
                        {"id": 2, "item": "Control Point N 控制點 N", "criteria": "Drawing Spec", "situation": "", "result": "O"},
                        {"id": 3, "item": "Control Point E 控制點 E", "criteria": "Drawing Spec", "situation": "", "result": "O"},
                        {"id": 4, "item": "Control Point Elevation 高程", "criteria": "Drawing Spec", "situation": "", "result": "O"},
                        {"id": 5, "item": "Survey Records 施工放樣", "criteria": "Submit Survey Records", "situation": "詳附件", "result": "O"}
                    ],
                    "remarks": "1. 檢查結果合格者註明「O」，不合格者註明「X」，如無需檢查之項目則打「/」。",
                    "signatures": {
                        "siteEngineer": "",
                        "constructionLeader": "",
                        "subcontractorRep": ""
                    }
                })
            }
            db_chk = Checklist(**seed_data)
            db_chk.id = str(uuid.uuid4())
            db.add(db_chk)
            db.commit()
            print("Seeded initial Checklist record.")
            
    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        db.close()

seed_initial_data()

# NOTE: Router 已在上方 line 448 掛載，此處註解避免重複掛載
# app.include_router(api)

@app.get("/")
def read_root():
    return {"message": "Qualitas API is running"}
