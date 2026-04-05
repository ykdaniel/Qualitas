from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime
import uuid
import json
import re

import models
import schemas
from models import (
    ITP,
    NCR,
    NOI,
    ITR,
    PQP,
    OBS,
    Contractor,
    ReferenceSequence,
    DocumentNamingRule,
    FollowUp,
    Checklist,
    AuditLog,
    KPIWeight,
    OwnerPerformance,
)
# NOTE: 移除重複的 import (uuid, json, re 已在上方匯入)

# 固定專案代碼
PROJECT_CODE = "QTS"

def _json_serialize(d: dict, list_fields: list):
    d = d.copy()
    for k in list_fields:
        if k in d and d[k] is not None and isinstance(d[k], list):
            d[k] = json.dumps(d[k])
    return d


class WorkflowEngine:
    """
    工作流引擎：管理各模組的狀態轉換規則
    """
    TRANSITIONS = {
        "ITP": {
            "Draft": ["Pending", "Void"],
            "Pending": ["Approved", "Void"],
            "Approved": ["Void"],
            "Void": []
        },
        "PQP": {
            "Draft": ["Pending", "Void"],
            "Pending": ["Approved", "Void"],
            "Approved": ["Void"],
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
            "Open": ["In Progress", "Void"],
            "In Progress": ["Resolved", "Void"],
            "Resolved": ["Closed", "Void"],
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
              user_id: int = None, username: str = None):
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
            username=username
        )
        db.add(audit_log)
    except Exception as e:
        # 日誌記錄失敗不應中斷主流程，僅列印錯誤
        print(f"Error logging audit: {e}")


def get_contractor_abbreviation(db: Session, vendor_name: str) -> str:
    """根據廠商名稱取得縮寫，若找不到則用名稱前 3 字元大寫"""
    if not vendor_name:
        return "NA"
    contractor = db.query(Contractor).filter(Contractor.name == vendor_name).first()
    if contractor and contractor.abbreviation:
        return contractor.abbreviation.upper()
    # fallback: 用名稱前 3 字元
    return re.sub(r'[^A-Z0-9]', '', vendor_name.upper()[:10]) or "NA"


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

# ---- ITP ----
def get_itp(db: Session, itp_id: str):
    return db.query(ITP).filter(ITP.id == itp_id).first()

def get_itps(db: Session, skip: int = 0, limit: int = 100, 
               search: str = None, status: str = None, 
               start_date: str = None, end_date: str = None):
    query = db.query(ITP)
    
    if search:
        query = query.filter(
            (ITP.referenceNo.ilike(f"%{search}%")) |
            (ITP.projectTitle.ilike(f"%{search}%")) |
            (ITP.activity.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(ITP.status == status)
    if start_date:
        query = query.filter(ITP.created_at >= start_date) # 假設 ITP 有 created_at 或用其他日期欄位
    if end_date:
        query = query.filter(ITP.created_at <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_itp(db: Session, itp: schemas.ITPCreate, user_id: int = None, username: str = None):
    data = _json_serialize(itp.dict(), ['attachments'])
    # 自動產生 Reference No（若未提供或為空）
    if not data.get('referenceNo'):
        data['referenceNo'] = generate_reference_no(db, data.get('vendor', ''), 'ITP')
    db_itp = ITP(**data)
    if not db_itp.id:
        db_itp.id = str(uuid.uuid4())
    db.add(db_itp)
    
    log_audit(db, "CREATE", "ITP", db_itp.id, db_itp.referenceNo, 
              new_value=itp.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_itp)
    return db_itp

def update_itp(db: Session, itp_id: str, itp: schemas.ITPUpdate, user_id: int = None, username: str = None):
    db_itp = db.query(ITP).filter(ITP.id == itp_id).first()
    if db_itp:
        # 狀態轉換檢查
        if itp.status and not WorkflowEngine.validate_transition("ITP", db_itp.status, itp.status):
            raise ValueError(f"Invalid status transition from {db_itp.status} to {itp.status}")

        old_val = {c.name: getattr(db_itp, c.name) for c in db_itp.__table__.columns}
        d = itp.dict(exclude_unset=True)
        d = _json_serialize(d, ['attachments'])
        for key, value in d.items():
            setattr(db_itp, key, value)
        
        log_audit(db, "UPDATE", "ITP", itp_id, db_itp.referenceNo, 
                  old_value=old_val, new_value=itp.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
            
        db.commit()
        db.refresh(db_itp)
    return db_itp

def delete_itp(db: Session, itp_id: str, user_id: int = None, username: str = None):
    db_itp = db.query(ITP).filter(ITP.id == itp_id).first()
    if db_itp:
        old_val = {c.name: getattr(db_itp, c.name) for c in db_itp.__table__.columns}
        log_audit(db, "DELETE", "ITP", itp_id, db_itp.referenceNo, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_itp)
        db.commit()
    return db_itp

def update_itp_detail(db: Session, itp_id: str, detail_body: dict, user_id: int = None, username: str = None):
    db_itp = db.query(ITP).filter(ITP.id == itp_id).first()
    if db_itp:
        old_val = db_itp.detail_data
        db_itp.detail_data = json.dumps(detail_body) if detail_body else None
        
        log_audit(db, "UPDATE_DETAIL", "ITP", itp_id, db_itp.referenceNo, 
                  old_value=old_val, new_value=detail_body, 
                  user_id=user_id, username=username)
        
        db.commit()
        db.refresh(db_itp)
    return db_itp

# ---- NCR ----
def get_ncr(db: Session, ncr_id: str):
    return db.query(NCR).filter(NCR.id == ncr_id).first()

def get_ncrs(db: Session, skip: int = 0, limit: int = 500,
               search: str = None, status: str = None, 
               start_date: str = None, end_date: str = None):
    query = db.query(NCR)
    
    if search:
        query = query.filter(
            (NCR.documentNumber.ilike(f"%{search}%")) |
            (NCR.subject.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(NCR.status == status)
    if start_date:
        query = query.filter(NCR.issuedDate >= start_date)
    if end_date:
        query = query.filter(NCR.issuedDate <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_ncr(db: Session, ncr: schemas.NCRCreate, user_id: int = None, username: str = None):
    d = _json_serialize(ncr.dict(), ['defectPhotos', 'improvementPhotos', 'attachments'])
    # 自動產生 Reference No（若未提供或為空）
    if not d.get('documentNumber'):
        d['documentNumber'] = generate_reference_no(db, d.get('vendor', ''), 'NCR')
    db_ncr = NCR(**d)
    if not db_ncr.id:
        db_ncr.id = str(uuid.uuid4())
    db.add(db_ncr)
    
    log_audit(db, "CREATE", "NCR", db_ncr.id, db_ncr.documentNumber, 
              new_value=ncr.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_ncr)
    return db_ncr

def update_ncr(db: Session, ncr_id: str, ncr: schemas.NCRUpdate, user_id: int = None, username: str = None):
    db_ncr = db.query(NCR).filter(NCR.id == ncr_id).first()
    if db_ncr:
        # 狀態轉換檢查
        if ncr.status and not WorkflowEngine.validate_transition("NCR", db_ncr.status, ncr.status):
            raise ValueError(f"Invalid status transition from {db_ncr.status} to {ncr.status}")

        old_val = {c.name: getattr(db_ncr, c.name) for c in db_ncr.__table__.columns}
        d = ncr.dict(exclude_unset=True)
        d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])
        for key, value in d.items():
            setattr(db_ncr, key, value)
            
        log_audit(db, "UPDATE", "NCR", ncr_id, db_ncr.documentNumber, 
                  old_value=old_val, new_value=ncr.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
        
        db.commit()
        db.refresh(db_ncr)
    return db_ncr

def delete_ncr(db: Session, ncr_id: str, user_id: int = None, username: str = None):
    db_ncr = db.query(NCR).filter(NCR.id == ncr_id).first()
    if db_ncr:
        old_val = {c.name: getattr(db_ncr, c.name) for c in db_ncr.__table__.columns}
        log_audit(db, "DELETE", "NCR", ncr_id, db_ncr.documentNumber, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_ncr)
        db.commit()
        return db_ncr
    return None

# ---- NOI ----
def get_noi(db: Session, noi_id: str):
    return db.query(NOI).filter(NOI.id == noi_id).first()

def get_nois(db: Session, skip: int = 0, limit: int = 500,
               search: str = None, status: str = None, 
               start_date: str = None, end_date: str = None):
    query = db.query(NOI)
    
    if search:
        query = query.filter(
            (NOI.referenceNo.ilike(f"%{search}%")) |
            (NOI.activity.ilike(f"%{search}%")) |
            (NOI.location.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(NOI.status == status)
    if start_date:
        query = query.filter(NOI.submissionDate >= start_date)
    if end_date:
        query = query.filter(NOI.submissionDate <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_noi(db: Session, noi: schemas.NOICreate, user_id: int = None, username: str = None):
    data = _json_serialize(noi.dict(), ['attachments'])
    # 自動產生 Reference No（若未提供或為空）
    if not data.get('referenceNo'):
        data['referenceNo'] = generate_reference_no(db, data.get('contractor', ''), 'NOI')
    db_noi = NOI(**data)
    if not db_noi.id:
        db_noi.id = str(uuid.uuid4())
    db.add(db_noi)
    
    log_audit(db, "CREATE", "NOI", db_noi.id, db_noi.referenceNo, 
              new_value=noi.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_noi)
    return db_noi

def update_noi(db: Session, noi_id: str, noi: schemas.NOIUpdate, user_id: int = None, username: str = None):
    db_noi = db.query(NOI).filter(NOI.id == noi_id).first()
    if db_noi:
        # 狀態轉換檢查
        if noi.status and not WorkflowEngine.validate_transition("NOI", db_noi.status, noi.status):
            raise ValueError(f"Invalid status transition from {db_noi.status} to {noi.status}")

        old_val = {c.name: getattr(db_noi, c.name) for c in db_noi.__table__.columns}
        d = _json_serialize(noi.dict(exclude_unset=True), ['attachments'])
        for key, value in d.items():
            setattr(db_noi, key, value)
            
        log_audit(db, "UPDATE", "NOI", noi_id, db_noi.referenceNo, 
                  old_value=old_val, new_value=noi.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
                  
        db.commit()
        db.refresh(db_noi)
    return db_noi

def delete_noi(db: Session, noi_id: str, user_id: int = None, username: str = None):
    db_noi = db.query(NOI).filter(NOI.id == noi_id).first()
    if db_noi:
        old_val = {c.name: getattr(db_noi, c.name) for c in db_noi.__table__.columns}
        log_audit(db, "DELETE", "NOI", noi_id, db_noi.referenceNo, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_noi)
        db.commit()
        return db_noi
    return None

# ---- ITR ----
def get_itr(db: Session, itr_id: str):
    return db.query(ITR).filter(ITR.id == itr_id).first()

def get_itrs(db: Session, skip: int = 0, limit: int = 500,
               search: str = None, status: str = None, 
               start_date: str = None, end_date: str = None):
    query = db.query(ITR)
    
    if search:
        query = query.filter(
            (ITR.documentNumber.ilike(f"%{search}%")) |
            (ITR.subject.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(ITR.status == status)
    if start_date:
        query = query.filter(ITR.issuedDate >= start_date)
    if end_date:
        query = query.filter(ITR.issuedDate <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_itr(db: Session, itr: schemas.ITRCreate, user_id: int = None, username: str = None):
    d = _json_serialize(itr.dict(), ['defectPhotos', 'improvementPhotos', 'attachments'])
    # 自動產生 Reference No（若未提供或為空）
    if not d.get('documentNumber'):
        d['documentNumber'] = generate_reference_no(db, d.get('vendor', ''), 'ITR')
    db_itr = ITR(**d)
    if not db_itr.id:
        db_itr.id = str(uuid.uuid4())
    db.add(db_itr)
    
    log_audit(db, "CREATE", "ITR", db_itr.id, db_itr.documentNumber, 
              new_value=itr.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_itr)
    return db_itr

def update_itr(db: Session, itr_id: str, itr: schemas.ITRUpdate, user_id: int = None, username: str = None):
    db_itr = db.query(ITR).filter(ITR.id == itr_id).first()
    if db_itr:
        # 狀態轉換檢查
        if itr.status and not WorkflowEngine.validate_transition("ITR", db_itr.status, itr.status):
            raise ValueError(f"Invalid status transition from {db_itr.status} to {itr.status}")

        old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}
        d = itr.dict(exclude_unset=True)
        d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])
        for key, value in d.items():
            setattr(db_itr, key, value)
            
        log_audit(db, "UPDATE", "ITR", itr_id, db_itr.documentNumber, 
                  old_value=old_val, new_value=itr.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
                  
        db.commit()
        db.refresh(db_itr)
    return db_itr

def delete_itr(db: Session, itr_id: str, user_id: int = None, username: str = None):
    db_itr = db.query(ITR).filter(ITR.id == itr_id).first()
    if db_itr:
        old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}
        log_audit(db, "DELETE", "ITR", itr_id, db_itr.documentNumber, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_itr)
        db.commit()
        return db_itr
    return None

# ---- PQP ----
def get_pqp(db: Session, pqp_id: str):
    return db.query(PQP).filter(PQP.id == pqp_id).first()

def get_pqps(db: Session, skip: int = 0, limit: int = 500,
               search: str = None, status: str = None, 
               start_date: str = None, end_date: str = None):
    query = db.query(PQP)
    
    if search:
        query = query.filter(
            (PQP.pqpNo.ilike(f"%{search}%")) |
            (PQP.projectTitle.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(PQP.status == status)
    if start_date:
        query = query.filter(PQP.created_at >= start_date) # 假設 PQP 有 created_at
    if end_date:
        query = query.filter(PQP.created_at <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_pqp(db: Session, pqp: schemas.PQPCreate, user_id: int = None, username: str = None):
    data = pqp.dict()
    data = _json_serialize(data, ['attachments'])
    # 自動產生 Reference No（若未提供或為空）
    if not data.get('pqpNo'):
        data['pqpNo'] = generate_reference_no(db, data.get('vendor', ''), 'PQP')
    db_pqp = PQP(**data)
    if not db_pqp.id:
        db_pqp.id = str(uuid.uuid4())
    db.add(db_pqp)
    
    log_audit(db, "CREATE", "PQP", db_pqp.id, db_pqp.pqpNo, 
              new_value=pqp.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_pqp)
    return db_pqp

def update_pqp(db: Session, pqp_id: str, pqp: schemas.PQPUpdate, user_id: int = None, username: str = None):
    db_pqp = db.query(PQP).filter(PQP.id == pqp_id).first()
    if db_pqp:
        # 狀態轉換檢查
        if pqp.status and not WorkflowEngine.validate_transition("PQP", db_pqp.status, pqp.status):
            raise ValueError(f"Invalid status transition from {db_pqp.status} to {pqp.status}")

        old_val = {c.name: getattr(db_pqp, c.name) for c in db_pqp.__table__.columns}
        d = pqp.dict(exclude_unset=True)
        d = _json_serialize(d, ['attachments'])
        for key, value in d.items():
            setattr(db_pqp, key, value)
            
        log_audit(db, "UPDATE", "PQP", pqp_id, db_pqp.pqpNo, 
                  old_value=old_val, new_value=pqp.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
                  
        db.commit()
        db.refresh(db_pqp)
    return db_pqp

def delete_pqp(db: Session, pqp_id: str, user_id: int = None, username: str = None):
    db_pqp = db.query(PQP).filter(PQP.id == pqp_id).first()
    if db_pqp:
        old_val = {c.name: getattr(db_pqp, c.name) for c in db_pqp.__table__.columns}
        log_audit(db, "DELETE", "PQP", pqp_id, db_pqp.pqpNo, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_pqp)
        db.commit()
        return db_pqp
    return None

# ---- OBS ----
def get_obs(db: Session, obs_id: str):
    return db.query(OBS).filter(OBS.id == obs_id).first()

def get_obss(db: Session, skip: int = 0, limit: int = 500,
               search: str = None, status: str = None, 
               start_date: str = None, end_date: str = None):
    query = db.query(OBS)
    
    if search:
        query = query.filter(
            (OBS.documentNumber.ilike(f"%{search}%")) |
            (OBS.subject.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(OBS.status == status)
    if start_date:
        query = query.filter(OBS.issuedDate >= start_date)
    if end_date:
        query = query.filter(OBS.issuedDate <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_obs(db: Session, obs: schemas.OBSCreate, user_id: int = None, username: str = None):
    d = _json_serialize(obs.dict(), ['defectPhotos', 'improvementPhotos', 'attachments'])
    # 自動產生 Reference No（若未提供或為空）
    if not d.get('documentNumber'):
        d['documentNumber'] = generate_reference_no(db, d.get('vendor', ''), 'OBS')
    db_obs = OBS(**d)
    if not db_obs.id:
        db_obs.id = str(uuid.uuid4())
    db.add(db_obs)
    
    log_audit(db, "CREATE", "OBS", db_obs.id, db_obs.documentNumber, 
              new_value=obs.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_obs)
    return db_obs

def update_obs(db: Session, obs_id: str, obs: schemas.OBSUpdate, user_id: int = None, username: str = None):
    db_obs = db.query(OBS).filter(OBS.id == obs_id).first()
    if db_obs:
        # 狀態轉換檢查
        if obs.status and not WorkflowEngine.validate_transition("OBS", db_obs.status, obs.status):
            raise ValueError(f"Invalid status transition from {db_obs.status} to {obs.status}")

        old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
        d = obs.dict(exclude_unset=True)
        d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])
        for key, value in d.items():
            setattr(db_obs, key, value)
            
        log_audit(db, "UPDATE", "OBS", obs_id, db_obs.documentNumber, 
                  old_value=old_val, new_value=obs.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
                  
        db.commit()
        db.refresh(db_obs)
    return db_obs

def delete_obs(db: Session, obs_id: str, user_id: int = None, username: str = None):
    db_obs = db.query(OBS).filter(OBS.id == obs_id).first()
    if db_obs:
        old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
        log_audit(db, "DELETE", "OBS", obs_id, db_obs.documentNumber, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_obs)
        db.commit()
        return db_obs
    return None

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


# ---- FollowUp ----
def get_followup(db: Session, followup_id: str):
    return db.query(FollowUp).filter(FollowUp.id == followup_id).first()

def get_followups(db: Session, skip: int = 0, limit: int = 500):
    return db.query(FollowUp).offset(skip).limit(limit).all()

def create_followup(db: Session, followup: schemas.FollowUpCreate, user_id: int = None, username: str = None):
    data = followup.dict()
    # 自動產生 Reference No（若未提供或為空）
    if not data.get('issueNo'):
        data['issueNo'] = generate_reference_no(db, data.get('vendor', '') or data.get('assignedTo', ''), 'followup')
    db_f = FollowUp(**data)
    if not db_f.id:
        db_f.id = str(uuid.uuid4())
    db.add(db_f)
    
    log_audit(db, "CREATE", "FollowUp", db_f.id, db_f.issueNo, 
              new_value=followup.dict(), user_id=user_id, username=username)
              
    db.commit()
    db.refresh(db_f)
    return db_f

def update_followup(db: Session, followup_id: str, followup: schemas.FollowUpUpdate, user_id: int = None, username: str = None):
    db_f = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if db_f:
        old_val = {c.name: getattr(db_f, c.name) for c in db_f.__table__.columns}
        for key, value in followup.dict(exclude_unset=True).items():
            setattr(db_f, key, value)
            
        log_audit(db, "UPDATE", "FollowUp", followup_id, db_f.issueNo, 
                  old_value=old_val, new_value=followup.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
                  
        db.commit()
        db.refresh(db_f)
    return db_f

def delete_followup(db: Session, followup_id: str, user_id: int = None, username: str = None):
    db_f = db.query(FollowUp).filter(FollowUp.id == followup_id).first()
    if db_f:
        old_val = {c.name: getattr(db_f, c.name) for c in db_f.__table__.columns}
        log_audit(db, "DELETE", "FollowUp", followup_id, db_f.issueNo, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_f)
        db.commit()
        return db_f
    return None

# ---- IAM (Users & Roles) ----

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_email(db: Session, email: str):
    return db.query(models.User).filter(models.User.email == email).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def get_users(db: Session, skip: int = 0, limit: int = 100):
    users = db.query(models.User).offset(skip).limit(limit).all()
    # Populate role_name for UI convenience
    for user in users:
        if user.role_id:
            role = get_role(db, user.role_id)
            if role:
                user.role_name = role.name
    return users

def create_user(db: Session, user: schemas.UserCreate, hashed_password: str):
    db_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        full_name=user.full_name,
        is_active=user.is_active,
        role_id=user.role_id,
        created_at=datetime.now().strftime("%Y-%m-%d")  # 記錄建立日期
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user(db: Session, user_id: int, user: schemas.UserUpdate, hashed_password: str = None):
    db_user = get_user(db, user_id)
    if db_user:
        if user.username is not None: db_user.username = user.username
        if user.email is not None: db_user.email = user.email
        if user.full_name is not None: db_user.full_name = user.full_name
        if user.is_active is not None: db_user.is_active = user.is_active
        if user.role_id is not None: db_user.role_id = user.role_id
        if hashed_password: db_user.hashed_password = hashed_password
        
        db.commit()
        db.refresh(db_user)
        
        # Populate role_name
        if db_user.role_id:
            role = get_role(db, db_user.role_id)
            if role:
                db_user.role_name = role.name
    return db_user

def delete_user(db: Session, user_id: int):
    db_user = get_user(db, user_id)
    if db_user:
        db.delete(db_user)
        db.commit()
    return db_user

def get_role(db: Session, role_id: int):
    return db.query(models.Role).filter(models.Role.id == role_id).first()

def get_role_by_name(db: Session, name: str):
    return db.query(models.Role).filter(models.Role.name == name).first()

def get_roles(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Role).offset(skip).limit(limit).all()

def create_role(db: Session, role: schemas.RoleCreate):
    db_role = models.Role(
        name=role.name,
        description=role.description,
        permissions=json.dumps(role.permissions) if role.permissions else "[]"
    )
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    return db_role

def update_role(db: Session, role_id: int, role: schemas.RoleUpdate):
    db_role = get_role(db, role_id)
    if db_role:
        if role.name is not None: db_role.name = role.name
        if role.description is not None: db_role.description = role.description
        if role.permissions is not None: db_role.permissions = json.dumps(role.permissions)
        
        db.commit()
        db.refresh(db_role)
    return db_role

def delete_role(db: Session, role_id: int):
    db_role = get_role(db, role_id)
    if db_role:
        db.delete(db_role)
        db.commit()
    return db_role

# ---- Audit ----
def get_audit(db: Session, audit_id: str):
    return db.query(models.Audit).filter(models.Audit.id == audit_id).first()

def get_audits(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Audit).offset(skip).limit(limit).all()

def create_audit(db: Session, audit: schemas.AuditCreate):
    db_audit = models.Audit(
        id=str(uuid.uuid4()),
        auditNo=audit.auditNo,
        title=audit.title,
        date=audit.date,
        auditor=audit.auditor,
        status=audit.status,
        location=audit.location,
        findings=audit.findings,
        contractor=audit.contractor
    )
    if not db_audit.auditNo:
         db_audit.auditNo = f"AUD-{datetime.now().year}-{str(uuid.uuid4())[:6]}"

    db.add(db_audit)
    db.commit()
    db.refresh(db_audit)
    return db_audit

def update_audit(db: Session, audit_id: str, audit: schemas.AuditUpdate):
    db_audit = get_audit(db, audit_id)
    if db_audit:
        update_data = audit.dict(exclude_unset=True)
        for key, value in update_data.items():
            setattr(db_audit, key, value)
        db.commit()
        db.refresh(db_audit)
    return db_audit

def delete_audit(db: Session, audit_id: str):
    db_audit = get_audit(db, audit_id)
    if db_audit:
        db.delete(db_audit)
        db.commit()
    return db_audit

# ---- Checklist ----
def get_checklist(db: Session, checklist_id: str):
    return db.query(Checklist).filter(Checklist.id == checklist_id).first()

def get_checklists(db: Session, skip: int = 0, limit: int = 500,
                     search: str = None, status: str = None, 
                     start_date: str = None, end_date: str = None):
    query = db.query(Checklist)
    
    if search:
        query = query.filter(
            (Checklist.recordsNo.ilike(f"%{search}%")) |
            (Checklist.activity.ilike(f"%{search}%")) |
            (Checklist.packageName.ilike(f"%{search}%"))
        )
    if status:
        query = query.filter(Checklist.status == status)
    if start_date:
        query = query.filter(Checklist.date >= start_date)
    if end_date:
        query = query.filter(Checklist.date <= end_date)
        
    return query.offset(skip).limit(limit).all()

def create_checklist(db: Session, chk: schemas.ChecklistCreate, user_id: int = None, username: str = None):
    data = chk.dict()
    # 自動產生 Records No（若未提供或由前端傳來的佔位符）
    if not data.get('recordsNo') or data.get('recordsNo') == "[AUTO-GENERATE]":
        # 注意這裡傳給 generate_reference_no 的 doc_type 建議統一為 CHECKLIST 或 CHK
        data['recordsNo'] = generate_reference_no(db, data.get('packageName', ''), 'CHECKLIST')
    
    db_chk = Checklist(**data)
    if not db_chk.id:
        db_chk.id = str(uuid.uuid4())
    db.add(db_chk)
    
    log_audit(db, "CREATE", "Checklist", db_chk.id, db_chk.recordsNo, 
              new_value=chk.dict(), user_id=user_id, username=username)
              
    db.commit()
    db.refresh(db_chk)
    return db_chk

def update_checklist(db: Session, checklist_id: str, chk: schemas.ChecklistUpdate, user_id: int = None, username: str = None):
    db_chk = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if db_chk:
        # 狀態轉換檢查
        if chk.status and not WorkflowEngine.validate_transition("Checklist", db_chk.status, chk.status):
            raise ValueError(f"Invalid status transition from {db_chk.status} to {chk.status}")

        old_val = {c.name: getattr(db_chk, c.name) for c in db_chk.__table__.columns}
        for key, value in chk.dict(exclude_unset=True).items():
            setattr(db_chk, key, value)
            
        log_audit(db, "UPDATE", "Checklist", checklist_id, db_chk.recordsNo, 
                  old_value=old_val, new_value=chk.dict(exclude_unset=True), 
                  user_id=user_id, username=username)
                  
        db.commit()
        db.refresh(db_chk)
    return db_chk

def delete_checklist(db: Session, checklist_id: str, user_id: int = None, username: str = None):
    db_chk = db.query(Checklist).filter(Checklist.id == checklist_id).first()
    if db_chk:
        old_val = {c.name: getattr(db_chk, c.name) for c in db_chk.__table__.columns}
        log_audit(db, "DELETE", "Checklist", checklist_id, db_chk.recordsNo, 
                  old_value=old_val, user_id=user_id, username=username)
        db.delete(db_chk)
        db.commit()
        return db_chk
    return None


# ---- KPI & Performance ----

def get_kpi_weight(db: Session):
    weight = db.query(KPIWeight).first()
    if not weight:
        # 建立預設权重
        weight = KPIWeight(pqp_weight=25, itp_weight=25, obs_weight=25, ncr_weight=25, 
                           updated_at=datetime.now().isoformat())
        db.add(weight)
        db.commit()
        db.refresh(weight)
    return weight

def update_kpi_weight(db: Session, weight_data: schemas.KPIWeightUpdate, user_id: int = None, username: str = None):
    db_weight = get_kpi_weight(db)
    old_val = {
        "pqp": db_weight.pqp_weight,
        "itp": db_weight.itp_weight,
        "obs": db_weight.obs_weight,
        "ncr": db_weight.ncr_weight
    }
    
    db_weight.pqp_weight = weight_data.pqp_weight
    db_weight.itp_weight = weight_data.itp_weight
    db_weight.obs_weight = weight_data.obs_weight
    db_weight.ncr_weight = weight_data.ncr_weight
    db_weight.updated_at = datetime.now().isoformat()
    
    log_audit(db, "UPDATE", "KPIWeight", str(db_weight.id), "Global KPI Weights", 
              old_value=old_val, new_value=weight_data.dict(), user_id=user_id, username=username)
    
    db.commit()
    db.refresh(db_weight)
    return db_weight

def get_owner_performances(db: Session, month: str = None):
    query = db.query(OwnerPerformance)
    if month:
        query = query.filter(OwnerPerformance.month == month)
    return query.all()

def create_owner_performance(db: Session, perf: schemas.OwnerPerformanceCreate, user_id: int = None, username: str = None):
    data = perf.dict()
    db_perf = OwnerPerformance(**data)
    if not db_perf.id:
        db_perf.id = str(uuid.uuid4())
    db_perf.updated_at = datetime.now().isoformat()
    
    db.add(db_perf)
    log_audit(db, "CREATE", "OwnerPerformance", db_perf.id, db_perf.owner_name, 
              new_value=data, user_id=user_id, username=username)
    db.commit()
    db.refresh(db_perf)
    return db_perf
