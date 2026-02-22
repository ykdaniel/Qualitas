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
    import database
    # Ensure tables exist
    models.Base.metadata.create_all(bind=database.engine)
    
    seed_default_contractors()
    seed_default_pqp()
    seed_initial_data()
    seed_rebar_itp()
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

from core.perms import ALL_PERMISSIONS, USER_VIEW, USER_MANAGE, ROLE_VIEW, ROLE_MANAGE

def seed_initial_data():
    db = SessionLocal()
    try:
        # 1. Seed Permissions table from core.perms
        print("Seeding permissions...")
        for p_data in ALL_PERMISSIONS:
            existing_p = db.query(models.Permission).filter(models.Permission.code == p_data["code"]).first()
            if not existing_p:
                new_p = models.Permission(code=p_data["code"], description=p_data["description"])
                db.add(new_p)
        db.commit()

        # 2. Create admin role if not exists (case-insensitive lookup)
        admin_role = db.query(models.Role).filter(
            models.Role.name.ilike("admin")
        ).first()
        if not admin_role:
            # Grant all permissions to admin
            all_codes = [p["code"] for p in ALL_PERMISSIONS]
            admin_role = crud.create_role(db, schemas.RoleCreate(
                name="admin",
                description="Administrator with full access",
                permissions=all_codes
            ))
            print("Seeded admin role.")
        else:
            # Sync permissions for existing admin role
            all_codes = [p["code"] for p in ALL_PERMISSIONS]
            perms = db.query(models.Permission).filter(
                models.Permission.code.in_(all_codes)
            ).all()
            admin_role.permissions_rel = perms
            db.commit()
            print(f"Synced admin role permissions ({len(perms)} perms).")

        # 3. Create User Role if not exists
        user_role = crud.get_role_by_name(db, "USER")
        if not user_role:
            user_role = crud.create_role(db, schemas.RoleCreate(
                name="USER",
                description="Standard user",
                permissions=[USER_VIEW] # Minimal permissions
            ))
            print("Seeded user role.")
        
        # 4. Create Admin User if not exists
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
        else:
            # Always ensure admin user has the admin role
            if admin_user.role_id != admin_role.id:
                admin_user.role_id = admin_role.id
                db.commit()
                print(f"Updated admin user role_id to {admin_role.id}.")

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

def seed_rebar_itp():
    db = SessionLocal()
    try:
        # Check if exists
        ref_no = "QTS-RKS-HL-ITP-000001"
        existing = db.query(models.ITP).filter(models.ITP.referenceNo == ref_no).first()
        
        detail_data = {
            "a": [
                {"id": "A1", "phase": "A", "activity": {"en": "Rebar Sampling for physical test", "ch": "鋼筋物理試驗取樣"}, "standard": "CNS 560", "criteria": "Extension Test 拉拔試驗\nBending Test 彎曲試驗", "checkTime": {"en": "Before construction", "ch": "施工前"}, "method": {"en": "TAF laboratory", "ch": "TAF 實驗室"}, "frequency": "1pc/25tons or fraction per type/lot. 每 25 噸取 1 支，不足 25 噸取 1 支(每類)。", "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"}, "record": "TAF Testing Report"},
                {"id": "A2", "phase": "A", "activity": {"en": "Storage status", "ch": "材料暫存狀態"}, "standard": "PCC-01661 PCC-03210", "criteria": "5cm off the ground\n離地 5 公分", "checkTime": {"en": "Deliver to site", "ch": "運抵工地"}, "method": {"en": "Visual", "ch": "目視檢查"}, "frequency": "Each Batch 每批", "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"}, "record": "-"},
                {"id": "A3", "phase": "A", "activity": {"en": "Dimension", "ch": "尺寸"}, "standard": "Drawing number", "criteria": "Diameter per CNS 560; length Per drawing", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Caliper", "ch": "卡尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": "-"}, "record": "-"},
                {"id": "A4", "phase": "A", "activity": {"en": "Stakeout", "ch": "放樣"}, "standard": "Tolerance ±10mm per DWG-XXXX", "criteria": "Meet design requirement\n符合設計要求", "checkTime": {"en": "Before construction", "ch": "施工前"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Each Time 每次", "vp": {"sub": "H", "teco": "H", "employer": "H", "hse": "-"}, "record": "-"}
            ],
            "b": [
                {"id": "B1", "phase": "B", "activity": {"en": "Rebar Spacing", "ch": "鋼筋間距"}, "standard": "Drawing number", "criteria": "D13 @ 150", "checkTime": {"en": "Before pouring", "ch": "施工前"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B2", "phase": "B", "activity": {"en": "Tie Spacing", "ch": "綁筋間距"}, "standard": "Drawing number", "criteria": "Tie at each crossing point\n每處交接點", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "H", "employer": "W", "hse": "※"}, "record": "-"},
                {"id": "B3", "phase": "B", "activity": {"en": "Protection cover", "ch": "保護層"}, "standard": "Drawing number", "criteria": "7.5 ± 0.6cm", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "H", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B4", "phase": "B", "activity": {"en": "Spacer distance", "ch": "水泥墊塊間距"}, "standard": "PCC-03210", "criteria": "#3：< 60cm\n#4：< 80cm\n#5 or larger：<100cm。", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B5", "phase": "B", "activity": {"en": "Overlap length", "ch": "搭接長度"}, "standard": "Approved Drawings\n核准圖說", "criteria": "Over or conform to approved drawings\n超過或符合核准圖說", "checkTime": {"en": "Before pouring", "ch": "灌漿前"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B6", "phase": "B", "activity": {"en": "Embedment", "ch": "預埋件"}, "standard": "Approved Drawings\n核准圖說", "criteria": "Check if any Embedment\n確認是否有預埋件", "checkTime": {"en": "Before pouring", "ch": "灌漿前"}, "method": {"en": "Visual", "ch": "目視檢查"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B7", "phase": "B", "activity": {"en": "Anchorage", "ch": "錨定長度"}, "standard": "Approved Drawings\n核准圖說", "criteria": "Over or conform to approved drawings\n超過或符合核准圖說", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B8", "phase": "B", "activity": {"en": "Hook length", "ch": "彎鉤長度"}, "standard": "Approved Drawings\n核准圖說", "criteria": "Over or conform to approved drawings\n超過或符合核准圖說", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"},
                {"id": "B9", "phase": "B", "activity": {"en": "Assembly Rebar Appearance", "ch": "鋼筋外觀"}, "standard": "CNS 560", "criteria": "No scaling allowed\n不允許鏽蝕層。", "checkTime": {"en": "During construction", "ch": "施工中"}, "method": {"en": "Visual", "ch": "目視檢查"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "-"}, "record": "-"}
            ],
            "c": [
                {"id": "C1", "phase": "C", "activity": {"en": "Rebar assembly integration", "ch": "鋼筋組立"}, "standard": "As per design drawing\n符合設計圖", "criteria": "No collapse or deform\n無坍塌或變形", "checkTime": {"en": "Before pouring", "ch": "灌漿前"}, "method": {"en": "Tap Measure", "ch": "捲尺"}, "frequency": "Before pouring 灌漿前", "vp": {"sub": "H", "teco": "H", "employer": "H", "hse": "-"}, "record": "-"}
            ]
        }
        
        # Prepare data
        # Prepare data
        # Resolve vendor
        vendor_name = "廠商A"
        vendor = db.query(models.Contractor).filter(models.Contractor.name == vendor_name).first()
        vendor_id = vendor.id if vendor else None

        itp_data = {
            "referenceNo": ref_no,
            "description": "Rebar Works 鋼筋工程",
            "vendor_id": vendor_id, # Use vendor_id
            "status": "Approved",
            "rev": "Rev1.0",
            "detail_data": json.dumps(detail_data),
            "submissionDate": datetime.now().strftime("%Y-%m-%d"),
            "submit": ""
        }

        if existing:
            print(f"Updating existing Rebar ITP: {ref_no}")
            for key, value in itp_data.items():
                setattr(existing, key, value)
        else:
            print(f"Creating new Rebar ITP: {ref_no}")
            new_itp = models.ITP(**itp_data, id=str(uuid.uuid4()))
            db.add(new_itp)
        
        db.commit()
        print("Rebar ITP seeded successfully.")

    except Exception as e:
        print(f"Error seeding Rebar ITP: {e}")
        db.rollback()
    finally:
        db.close()

def seed_piling_itp():
    db = SessionLocal()
    try:
        # Check if exists
        ref_no = "ITP-PL-001"
        existing = db.query(models.ITP).filter(models.ITP.referenceNo == ref_no).first()
        
        detail_data = {
             "a": [
                {"id": "A1", "phase": "A", "activity": {"en": "Length", "ch": "長度"}, "standard": "CNS 2602", "criteria": "22m ±0.3% / 25m ±0.3%", "checkTime": {"en": "Deliver to site", "ch": "運抵工地"}, "method": {"en": "Tape measure", "ch": "捲尺"}, "frequency": "-", "vp": {"sub": "", "teco": "", "employer": "", "hse": ""}, "record": "-"},
                {"id": "A2", "phase": "A", "activity": {"en": "Thickness", "ch": "厚度"}, "standard": "CNS 2602", "criteria": "100mm -2/+40mm", "checkTime": {"en": "Deliver to site", "ch": "運抵工地"}, "method": {"en": "Tape measure", "ch": "捲尺"}, "frequency": "-", "vp": {"sub": "", "teco": "", "employer": "", "hse": ""}, "record": "-"},
                {"id": "A3", "phase": "A", "activity": {"en": "Outer Diameter", "ch": "外徑"}, "standard": "CNS 2602", "criteria": "600mm -4/+7mm", "checkTime": {"en": "Deliver to site", "ch": "運抵工地"}, "method": {"en": "Tape measure", "ch": "捲尺"}, "frequency": "-", "vp": {"sub": "", "teco": "", "employer": "", "hse": ""}, "record": "-"},
                {"id": "A4", "phase": "A", "activity": {"en": "Quantity", "ch": "數量"}, "standard": "Shipping Order", "criteria": "Meet shipping order", "checkTime": {"en": "Deliver to site", "ch": "運抵工地"}, "method": {"en": "Visual", "ch": "目視檢查"}, "frequency": "Each Time", "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""}, "record": "ITP-PL-01"},
                {"id": "A5", "phase": "A", "activity": {"en": "Stakeout", "ch": "放樣"}, "standard": "HL-ONS-TECO-STR-DWG-02000", "criteria": "Meet design req.", "checkTime": {"en": "Before construction", "ch": "施工前"}, "method": {"en": "Tape Measure", "ch": "捲尺"}, "frequency": "Each Time", "vp": {"sub": "H", "teco": "H", "employer": "H", "hse": ""}, "record": "ITP-SV-01"}
            ],
            "b": [
                {"id": "B1", "phase": "B", "activity": {"en": "Foundation piling position", "ch": "基礎打設座標"}, "standard": "HL-ONS-TECO-STR-DWG-02000", "criteria": "Tolerance ± 7.5 cm", "checkTime": {"en": "During Piling", "ch": "打樁時"}, "method": {"en": "Total Station", "ch": "全站儀"}, "frequency": "Each Pile", "vp": {"sub": "H", "teco": "H", "employer": "H", "hse": ""}, "record": "QTS-RKS-HL-CHK-000001"},
                {"id": "B2", "phase": "B", "activity": {"en": "Pile Elevation", "ch": "基礎高程"}, "standard": "HL-ONS-TECO-GEO-DWG-08000", "criteria": "Tolerance ± 7.5 cm", "checkTime": {"en": "After Piling", "ch": "打樁後"}, "method": {"en": "Total Station", "ch": "全站儀"}, "frequency": "Each Pile", "vp": {"sub": "H", "teco": "W", "employer": "R", "hse": ""}, "record": "ITP-PL-04"},
                {"id": "B3", "phase": "B", "activity": {"en": "Pile Joint", "ch": "樁頭檢查"}, "standard": "CNS 2602", "criteria": "No Oil, Rust, Dust", "checkTime": {"en": "Before Welding", "ch": "焊接前"}, "method": {"en": "Visual", "ch": "目視"}, "frequency": "Each Pile", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "※"}, "record": "ITP-PL-02"},
                {"id": "B4", "phase": "B", "activity": {"en": "Welding", "ch": "焊接"}, "standard": "CNS 13341", "criteria": "No Defect (無缺失)", "checkTime": {"en": "After Welding", "ch": "焊接後"}, "method": {"en": "NDT - MT", "ch": "MT 檢測"}, "frequency": "1/50 pcs", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": "※"}, "record": "ITP-PL-02"},
                {"id": "B5", "phase": "B", "activity": {"en": "Verticality of Pile", "ch": "基礎垂直度"}, "standard": "HL-ONS-TECO-GEO-DWG-08000", "criteria": "< 1/75", "checkTime": {"en": "During Piling", "ch": "打樁時"}, "method": {"en": "Spirit Level Ruler", "ch": "水平尺"}, "frequency": "Each Pile", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": ""}, "record": "ITP-PL-02&04"},
                {"id": "B6", "phase": "B", "activity": {"en": "Hit number of hammers", "ch": "打擊次數"}, "standard": "HL-ONS-TECO-ENG-PLN-00005", "criteria": "< 2000 hits", "checkTime": {"en": "During Piling", "ch": "打樁時"}, "method": {"en": "Visual", "ch": "目視"}, "frequency": "Each Pile", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": ""}, "record": "ITP-PL-02&04"}
            ],
            "c": [
                {"id": "C1", "phase": "C", "activity": {"en": "Pile Position", "ch": "樁位複測"}, "standard": "HL-ONS-TECO-STR-", "criteria": "Tolerance < 7.5cm", "checkTime": {"en": "After Piling", "ch": "打樁後"}, "method": {"en": "Total Station", "ch": "全站儀"}, "frequency": "Each Pile", "vp": {"sub": "H", "teco": "W", "employer": "W", "hse": ""}, "record": "ITP-PL-03"}
            ]
        }
        
        # Prepare data
        # Prepare data
        # Resolve vendor
        vendor_name = "廠商C"
        vendor = db.query(models.Contractor).filter(models.Contractor.name == vendor_name).first()
        vendor_id = vendor.id if vendor else None

        itp_data = {
            "referenceNo": ref_no,
            "description": "Piling Works 樁基礎工程",
            "vendor_id": vendor_id, # Use vendor_id
            "status": "Approved",
            "rev": "Rev1.0",
            "detail_data": json.dumps(detail_data),
            "submissionDate": datetime.now().strftime("%Y-%m-%d"),
            "submit": ""
        }

        if existing:
            print(f"Updating existing Piling ITP: {ref_no}")
            for key, value in itp_data.items():
                setattr(existing, key, value)
        else:
            print(f"Creating new Piling ITP: {ref_no}")
            new_itp = models.ITP(**itp_data, id=str(uuid.uuid4()))
            db.add(new_itp)
        
        db.commit()
        print("Piling ITP seeded successfully.")

    except Exception as e:
        print(f"Error seeding Piling ITP: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    run_seeding()
