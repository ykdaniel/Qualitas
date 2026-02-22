from datetime import datetime
import uuid
import json
import schemas
import crud
import models
from database import SessionLocal
from sqlalchemy.orm import Session
from passlib.context import CryptContext

# Import configuration if needed, but schemas/models usually suffice
# from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

def run_seeding():
    """Run all database seeding"""
    print("Running database seeding...")
    seed_default_contractors()
    seed_default_pqp()
    seed_initial_data()
    print("Seeding completed.")

def seed_default_contractors():
    db = SessionLocal()
    try:
        if crud.get_contractors(db, limit=1) == []:
            for c in [
                {"package": "", "name": "廠商A", "abbreviation": "A", "scope": "電氣工程", "contactPerson": "張三", "email": "vendor-a@example.com", "phone": "02-1234-5678", "address": "台北市信義區信義路一段100號", "status": "active"},
                {"package": "", "name": "廠商B", "abbreviation": "B", "scope": "機械工程", "contactPerson": "李四", "email": "vendor-b@example.com", "phone": "02-2345-6789", "address": "新北市板橋區文化路二段200號", "status": "active"},
                {"package": "", "name": "廠商C", "abbreviation": "C", "scope": "土木工程", "contactPerson": "王五", "email": "vendor-c@example.com", "phone": "02-3456-7890", "address": "桃園市中壢區中正路三段300號", "status": "active"},
            ]:
                crud.create_contractor(db, schemas.ContractorCreate(**c))
            print("Seeded default contractors.")
    finally:
        db.close()

def seed_default_pqp():
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
            print("Seeded default PQP.")
    finally:
        db.close()

def seed_initial_data():
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
        if db.query(models.Checklist).count() == 0:
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
                        # {"id": 1, "item": "Drawing Number 圖說編號", "criteria": "As per drawing", "situation": "NA", "result": "O"},
                        # {"id": 2, "item": "Control Point N 控制點 N", "criteria": "Drawing Spec", "situation": "", "result": "O"},
                        # {"id": 3, "item": "Control Point E 控制點 E", "criteria": "Drawing Spec", "situation": "", "result": "O"},
                        # {"id": 4, "item": "Control Point Elevation 高程", "criteria": "Drawing Spec", "situation": "", "result": "O"},
                        # {"id": 5, "item": "Survey Records 施工放樣", "criteria": "Submit Survey Records", "situation": "詳附件", "result": "O"}
                    ],
                    "remarks": "1. 檢查結果合格者註明「O」，不合格者註明「X」，如無需檢查之項目則打「/」。",
                    "signatures": {
                        "siteEngineer": "",
                        "constructionLeader": "",
                        "subcontractorRep": ""
                    }
                })
            }
            db_chk = models.Checklist(**seed_data)
            db_chk.id = str(uuid.uuid4())
            db.add(db_chk)
            db.commit()
            print("Seeded initial Checklist record.")

        # 5. [CLEANUP] Update existing Checklist record if it contains old default items
        existing_record = db.query(models.Checklist).filter(models.Checklist.recordsNo == "QTS-RKS-HL-CHK-000001").first()
        if existing_record and existing_record.detail_data:
            detail = json.loads(existing_record.detail_data)
            items = detail.get("items", [])
            print(f"DEBUG: Found {len(items)} items in existing record.")
            # Force cleanup regardless of content match
            if items:
                print("Forcing cleanup of existing record items...")
                detail["items"] = [] # Clear items
                existing_record.detail_data = json.dumps(detail)
                db.commit()
                print("Existing record items cleared.")
            else:
                print("Items already empty.")

    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_seeding()
