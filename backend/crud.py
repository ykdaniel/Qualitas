import json
import logging
import re
import uuid
from datetime import datetime

from sqlalchemy.orm import Session, joinedload

import models
import schemas

logger = logging.getLogger(__name__)
from models import (
    FAT,
    ITP,
    ITR,
    NCR,
    NOI,
    OBS,
    PQP,
    AuditLog,
    Checklist,
    Contractor,
    DocumentNamingRule,
    FollowUp,
    KPIWeight,
    OwnerPerformance,
    ReferenceSequence,
)

# NOTE: 移除重複的 import (uuid, json, re 已在上方匯入)

# 固定專案代碼
PROJECT_CODE = "QTS"

def _json_serialize(d: dict, list_fields: list):
    d = d.copy()
    for k in list_fields:
        if k in d and d[k] is not None:
             if isinstance(d[k], (list, dict)):
                d[k] = json.dumps(d[k])
    return d


class WorkflowEngine:
    """
    工作流引擎：管理各模組的狀態轉換規則
    """
    TRANSITIONS = {
        "ITP": {
            "Draft": ["Pending", "Void"],
            "Pending": ["Approved", "Revise & Resubmit", "Void"],
            "Approved": ["Void", "Pending"],
            "Revise & Resubmit": ["Pending", "Void"],
            "Void": []
        },
        "PQP": {
            "Draft": ["Pending", "Void"],
            "Pending": ["Approved", "Revise & Resubmit", "Void"],
            "Approved": ["Void", "Pending"],
            "Revise & Resubmit": ["Pending", "Void"],
            "Void": []
        },
        "NCR": {
            "Open": ["In Progress", "Void"],
            "In Progress": ["Resolved", "Void"],
            "Resolved": ["Closed", "Void"],
            "Closed": [],
            "Void": []
        },
        "NOI": {
            "Open": ["In Progress", "Reject", "Void"],
            "In Progress": ["Resolved", "Reject", "Void"],
            "Resolved": ["Closed", "Void"],
            "Reject": ["Open", "Void"],
            "Closed": [],
            "Void": []
        },
        "ITR": {
            "Draft": ["Submitted", "Void"],
            "Submitted": ["Approved", "Rejected", "Void"],
            "Approved": ["Void"],
            "Rejected": ["Submitted", "Void"],
            "Void": []
        },
        "OBS": {
            "Open": ["In Progress", "Void"],
            "In Progress": ["Resolved", "Void"],
            "Resolved": ["Closed", "Void"],
            "Closed": [],
            "Void": []
        },
        "Checklist": {
            "Ongoing": ["Pass", "Fail"],
            "Pass": ["Ongoing"], # 允許回退修改
            "Fail": ["Ongoing"]
        }
    }

    @staticmethod
    def validate_transition(entity_type: str, current_status: str, new_status: str) -> bool:
        """
        驗證狀態轉換是否合法
        :param entity_type: 模組名稱 (Case-insensitive)
        :param current_status: 當前狀態
        :param new_status: 新狀態
        :return: Boolean
        """
        # 若狀態未改變，視為合法
        if current_status == new_status:
            return True

        # 取得規則 (忽略大小寫)
        rules = None
        for k, v in WorkflowEngine.TRANSITIONS.items():
            if k.lower() == entity_type.lower():
                rules = v
                break

        if not rules:
            return True # 若無定義規則，預設允許

        # 檢查當前狀態是否存在於規則中
        allowed_next_states = rules.get(current_status, [])

        # 特殊規則：ADMIN 角色可能需要繞過此檢查 (在此層級暫不處理角色，僅處理邏輯)
        # TODO: 在 Router 層級結合 Role Check

        return new_status in allowed_next_states


def log_audit(db: Session, action: str, entity_type: str, entity_id: str,
              entity_name: str = None, old_value: dict = None, new_value: dict = None,
              user_id: int = None, username: str = None, reason: str = None):
    """
    記錄審計日誌
    NOTE: 建議在業務操作同一個 db 事務中調用，並在外部統一 commit
    """
    try:
        audit_log = AuditLog(
            timestamp=datetime.now().isoformat(),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            entity_name=entity_name,
            old_value=json.dumps(old_value) if old_value and isinstance(old_value, dict) else (old_value if isinstance(old_value, str) else None),
            new_value=json.dumps(new_value) if new_value and isinstance(new_value, dict) else (new_value if isinstance(new_value, str) else None),
            user_id=user_id,
            username=username,
            reason=reason
        )
        db.add(audit_log)
    except Exception as e:
        # 日誌記錄失敗不應中斷主流程，僅記錄錯誤
        logger.error(f"Error logging audit: {e}")


def get_contractor_abbreviation(db: Session, vendor_name: str) -> str:
    """根據廠商名稱取得縮寫，若找不到則用名稱前 3 字元大寫"""
    if not vendor_name:
        return "NA"
    contractor = db.query(Contractor).filter(Contractor.name == vendor_name).first()
    if contractor and contractor.abbreviation:
        return contractor.abbreviation.upper()
    # fallback: 用名稱前 3 字元
    return re.sub(r'[^A-Z0-9]', '', vendor_name.upper()[:10]) or "NA"

def _resolve_vendor_id(db: Session, vendor_name: str) -> str:
    """Helper: Resolve vendor name to ID"""
    if not vendor_name:
        return None
    contractor = db.query(Contractor).filter(Contractor.name == vendor_name).first()
    return contractor.id if contractor else None


def generate_reference_no(db: Session, vendor_name: str, doc_type: str) -> str:
    """
    產生 Reference No：
    - 先依 doc_type 讀取 DocumentNamingRule（若存在則依規則組前綴與流水號位數）
    - 若無規則則 fallback 為 QTS-[VENDOR]-[DOC]-[SEQ6]
    - 序號以 (PROJECT, VENDOR, DOC) 為 key 各自累加
    - 使用交易確保不撞號
    """
    vendor_abbrev = get_contractor_abbreviation(db, vendor_name)

    # 嘗試讀取文件命名規則（以 doc_type 小寫對應，如 ITP -> itp）
    rule = db.query(DocumentNamingRule).filter(
        DocumentNamingRule.doc_type == doc_type.lower()
    ).first()
    seq_digits = rule.sequence_digits if rule and rule.sequence_digits else 6

    # 查詢或建立序號記錄
    seq_record = db.query(ReferenceSequence).filter(
        ReferenceSequence.project == PROJECT_CODE,
        ReferenceSequence.vendor == vendor_abbrev,
        ReferenceSequence.doc == doc_type
    ).with_for_update().first()  # 加鎖防止並發

    if seq_record:
        seq_record.last_seq += 1
        next_seq = seq_record.last_seq
    else:
        # 第一次建立該組合，檢查既有資料中是否有符合新格式的編號
        next_seq = 1
        seq_record = ReferenceSequence(
            project=PROJECT_CODE,
            vendor=vendor_abbrev,
            doc=doc_type,
            last_seq=next_seq
        )
        db.add(seq_record)

    db.flush()  # 確保序號已寫入

    # 依規則組合編號；若沒有規則則走 fallback
    if rule and rule.prefix:
        seq_str = str(next_seq).zfill(seq_digits)
        prefix = rule.prefix.replace('[ABBREV]', vendor_abbrev)
        return f"{prefix}{seq_str}"

    # Fallback：維持舊有格式 QTS-A-DOC-000001
    seq_str = str(next_seq).zfill(6)
    return f"{PROJECT_CODE}-{vendor_abbrev}-{doc_type.upper()}-{seq_str}"

# ---- Contractor ----
def get_contractor(db: Session, contractor_id: str):
    return db.query(Contractor).filter(Contractor.id == contractor_id).first()

def get_contractors(db: Session, skip: int = 0, limit: int = 500):
    return db.query(Contractor).offset(skip).limit(limit).all()

def create_contractor(db: Session, contractor: schemas.ContractorCreate, user_id: int = None, username: str = None):
    db_c = Contractor(**contractor.dict())
    if not db_c.id:
        db_c.id = str(uuid.uuid4())
    db.add(db_c)

    log_audit(db, "CREATE", "Contractor", db_c.id, db_c.name,
              new_value=contractor.dict(), user_id=user_id, username=username)

    db.commit()
    db.refresh(db_c)
    return db_c

def update_contractor(db: Session, contractor_id: str, contractor: schemas.ContractorUpdate, user_id: int = None, username: str = None):
    db_c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if db_c:
        old_val = {c.name: getattr(db_c, c.name) for c in db_c.__table__.columns}
        for key, value in contractor.dict(exclude_unset=True).items():
            setattr(db_c, key, value)

        log_audit(db, "UPDATE", "Contractor", contractor_id, db_c.name,
                  old_value=old_val, new_value=contractor.dict(exclude_unset=True),
                  user_id=user_id, username=username)

        db.commit()
        db.refresh(db_c)
    return db_c

def delete_contractor(db: Session, contractor_id: str, user_id: int = None, username: str = None):
    db_c = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if db_c:
        old_val = {c.name: getattr(db_c, c.name) for c in db_c.__table__.columns}
        log_audit(db, "DELETE", "Contractor", contractor_id, db_c.name,
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_c)
        db.commit()
        return db_c
    return None


# ---- IAM (Users & Roles) ----

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_username(db: Session, username: str):
    # Eagerly load role and permissions to avoid N+1 and detached session errors
    return db.query(models.User).options(
        joinedload(models.User.role).joinedload(models.Role.permissions_rel)
    ).filter(models.User.username == username).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    # Use joinedload to prevent N+1 queries when accessing role_name property
    return db.query(models.User).options(
        joinedload(models.User.role)
    ).offset(skip).limit(limit).all()

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str, current_user_id: int = None, current_username: str = None):
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        is_active=user.is_active,
        role_id=user.role_id,
        created_at=datetime.now().strftime("%Y-%m-%d")
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    log_audit(db, "CREATE", "User", str(db_user.id), db_user.username,
              new_value=user.dict(exclude={"password"}),
              user_id=current_user_id, username=current_username, reason=user.reason)
    db.commit()
    return db_user

def update_user(db: Session, user_id: int, user: schemas.UserUpdate, hashed_password: str = None, current_user_id: int = None, current_username: str = None):
    db_user = get_user(db, user_id)
    if db_user:
        # Last Admin Protection: Prevent deactivating the last active Admin
        if user.is_active is False and db_user.role_name == "Admin":
            admin_count = db.query(models.User).join(models.Role).filter(models.Role.name == "Admin", models.User.is_active).count()
            if admin_count <= 1:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Cannot deactivate the last active Admin user")

        old_data = {
            "username": db_user.username,
            "email": db_user.email,
            "full_name": db_user.full_name,
            "is_active": db_user.is_active,
            "role_id": db_user.role_id
        }

        if user.username is not None: db_user.username = user.username
        if user.email is not None: db_user.email = user.email
        if user.full_name is not None: db_user.full_name = user.full_name
        if user.is_active is not None: db_user.is_active = user.is_active
        if user.role_id is not None: db_user.role_id = user.role_id
        if hashed_password: db_user.hashed_password = hashed_password

        db.commit()
        db.refresh(db_user)

        log_audit(db, "UPDATE", "User", str(db_user.id), db_user.username,
                  old_value=old_data, new_value=user.dict(exclude={"password", "reason"}),
                  user_id=current_user_id, username=current_username, reason=user.reason)
        db.commit()
    return db_user

def delete_user(db: Session, user_id: int, current_user_id: int = None, current_username: str = None, reason: str = None):
    db_user = get_user(db, user_id)
    if db_user:
        # Last Admin Protection
        if db_user.role_name == "Admin":
            admin_count = db.query(models.User).join(models.Role).filter(models.Role.name == "Admin", models.User.is_active).count()
            if admin_count <= 1:
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Cannot delete the last active Admin user")

        old_data = {
            "username": db_user.username,
            "email": db_user.email,
            "is_active": db_user.is_active,
            "role_id": db_user.role_id
        }
        log_audit(db, "DELETE", "User", str(db_user.id), db_user.username,
                  old_value=old_data, user_id=current_user_id, username=current_username, reason=reason)

        db.delete(db_user)
        db.commit()
    return db_user

def get_role(db: Session, role_id: int):
    return db.query(models.Role).filter(models.Role.id == role_id).first()

def get_role_by_name(db: Session, name: str):
    return db.query(models.Role).filter(models.Role.name == name).first()

def get_roles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Role).offset(skip).limit(limit).all()

def create_role(db: Session, role: schemas.RoleCreate, current_user_id: int = None, current_username: str = None):
    db_role = models.Role(
        name=role.name,
        description=role.description
    )
    if role.permissions:
        perms = db.query(models.Permission).filter(models.Permission.code.in_(role.permissions)).all()
        db_role.permissions_rel = perms

    db.add(db_role)
    db.commit()
    db.refresh(db_role)

    log_audit(db, "CREATE", "Role", str(db_role.id), db_role.name,
              new_value=role.dict(exclude={"reason"}),
              user_id=current_user_id, username=current_username, reason=role.reason)
    db.commit()
    return db_role

def update_role(db: Session, role_id: int, role: schemas.RoleUpdate, current_user_id: int = None, current_username: str = None):
    db_role = get_role(db, role_id)
    if db_role:
        old_data = {
            "name": db_role.name,
            "description": db_role.description,
            "permissions": db_role.permissions
        }

        if role.name is not None: db_role.name = role.name
        if role.description is not None: db_role.description = role.description
        if role.permissions is not None:
            perms = db.query(models.Permission).filter(models.Permission.code.in_(role.permissions)).all()
            db_role.permissions_rel = perms

        db.commit()
        db.refresh(db_role)

        log_audit(db, "UPDATE", "Role", str(db_role.id), db_role.name,
                  old_value=old_data, new_value=role.dict(exclude={"reason"}),
                  user_id=current_user_id, username=current_username, reason=role.reason)
        db.commit()
    return db_role

def get_permissions(db: Session, skip: int = 0, limit: int = 100):
    """取得系統中所有定義的權限"""
    return db.query(models.Permission).offset(skip).limit(limit).all()

def delete_role(db: Session, role_id: int, current_user_id: int = None, current_username: str = None, reason: str = None):
    db_role = get_role(db, role_id)
    if db_role:
        # Last Admin protection
        if db_role.name == "Admin":
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Cannot delete the core Admin role")

        old_data = {
            "name": db_role.name,
            "description": db_role.description,
            "permissions": db_role.permissions
        }
        log_audit(db, "DELETE", "Role", str(db_role.id), db_role.name,
                  old_value=old_data, user_id=current_user_id, username=current_username, reason=reason)

        db.delete(db_role)
        db.commit()
    return db_role
    db_role = get_role(db, role_id)
    if db_role:
        db.delete(db_role)
        db.commit()
    return db_role

# ---- Audit ----

def create_audit(db: Session, audit: schemas.AuditCreate, user_id: int = None, username: str = None):
    db_audit = models.Audit(
        id=audit.id or str(uuid.uuid4()),
        auditNo=audit.auditNo,
        title=audit.title,
        date=audit.date,
        end_date=audit.end_date,
        auditor=audit.auditor,
        status=audit.status,
        location=audit.location,
        findings=audit.findings,
        contractor=audit.contractor,
        project_name=audit.project_name,
        project_director=audit.project_director,
        support_auditors=audit.support_auditors,
        tech_lead=audit.tech_lead,
        scope_description=audit.scope_description,
        audit_criteria=audit.audit_criteria,
        selected_templates=json.dumps(audit.selected_templates) if isinstance(audit.selected_templates, list) else audit.selected_templates,
        custom_check_items=json.dumps(audit.custom_check_items) if isinstance(audit.custom_check_items, list) else audit.custom_check_items
    )
    
    # vendor lookup for consistency
    if audit.contractor:
        db_audit.vendor_id = _resolve_vendor_id(db, audit.contractor)

    db.add(db_audit)

    log_audit(db, "CREATE", "Audit", db_audit.id, db_audit.auditNo,
              new_value=audit.dict(), user_id=user_id, username=username)

    db.commit()
    db.refresh(db_audit)
    return db_audit


def update_audit(db: Session, audit_id: str, audit: schemas.AuditUpdate, user_id: int = None, username: str = None):
    db_audit = db.query(models.Audit).filter(models.Audit.id == audit_id).first()
    if db_audit:
        old_val = {c.name: getattr(db_audit, c.name) for c in db_audit.__table__.columns}
        
        # update basic fields
        update_data = audit.dict(exclude_unset=True)
        for key, value in update_data.items():
            if key in ["selected_templates", "custom_check_items"]:
                setattr(db_audit, key, json.dumps(value) if isinstance(value, list) else value)
            else:
                setattr(db_audit, key, value)
        
        # Re-resolve vendor if contractor changed
        if "contractor" in update_data:
            db_audit.vendor_id = _resolve_vendor_id(db, update_data["contractor"])
            
        log_audit(db, "UPDATE", "Audit", audit_id, db_audit.auditNo,
                  old_value=old_val, new_value=update_data,
                  user_id=user_id, username=username)

        db.commit()
        db.refresh(db_audit)
    return db_audit

