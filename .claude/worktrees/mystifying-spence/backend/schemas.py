from pydantic import BaseModel, field_validator, EmailStr, constr
from typing import Optional, List, Any
import json
import re

# 輸入驗證常數
MAX_TEXT_LENGTH = 10000  # 一般文字欄位最大長度
MAX_SHORT_LENGTH = 500   # 短文字欄位最大長度

# 驗證工具函數
def validate_date_format(v: str) -> str:
    """驗證日期格式 (YYYY-MM-DD)"""
    if v and not re.match(r'^\d{4}-\d{2}-\d{2}$', v):
        raise ValueError('日期格式必須為 YYYY-MM-DD')
    return v

class ITPBase(BaseModel):
    vendor: str
    referenceNo: Optional[str] = None  # 由後端自動產生
    description: Optional[constr(max_length=MAX_TEXT_LENGTH)] = ''
    rev: Optional[constr(max_length=MAX_SHORT_LENGTH)] = ''
    submit: Optional[str] = ''
    status: str
    remark: Optional[str] = None
    hasDetails: Optional[bool] = False
    submissionDate: Optional[str] = None
    detail_data: Optional[str] = None
    attachments: Optional[List[str]] = []
    last_reminded_at: Optional[str] = None
    dueDate: Optional[str] = None

    @field_validator('submissionDate', 'dueDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class ITPCreate(ITPBase):
    id: Optional[str] = None

class ITPUpdate(BaseModel):
    """ITP 更新用 schema，referenceNo 不可更新"""
    vendor: Optional[str] = None
    # referenceNo 不可更新（由後端自動產生，建立後不可變）
    description: Optional[str] = None
    rev: Optional[str] = None
    submit: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None
    hasDetails: Optional[bool] = None
    submissionDate: Optional[str] = None
    detail_data: Optional[str] = None
    attachments: Optional[List[str]] = None
    last_reminded_at: Optional[str] = None
    dueDate: Optional[str] = None

class ITP(ITPBase):
    id: str

    class Config:
        from_attributes = True


class ITPDetailBody(BaseModel):
    a: List[Any] = []
    b: List[Any] = []
    c: List[Any] = []
    checklist: List[Any] = []
    self_inspection: Optional[Any] = None  # 自主檢查表


# NCR
class NCRBase(BaseModel):
    vendor: str
    documentNumber: Optional[str] = None  # 由後端自動產生
    description: constr(max_length=MAX_TEXT_LENGTH)
    rev: constr(max_length=MAX_SHORT_LENGTH)
    submit: str
    status: str
    remark: Optional[str] = None
    hasDetails: Optional[bool] = False
    raiseDate: Optional[str] = None
    closeoutDate: Optional[str] = None
    aconex: Optional[str] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    foundBy: Optional[str] = None
    raisedBy: Optional[str] = None
    foundLocation: Optional[str] = None
    productDisposition: Optional[str] = None
    productIntegrityRelated: Optional[str] = None
    permanentProductDeviation: Optional[str] = None
    impactToOM: Optional[str] = None
    defectPhotos: Optional[Any] = None
    improvementPhotos: Optional[Any] = None
    noiNumber: Optional[str] = None  # 連結到觸發此 NCR 的 NOI
    dueDate: Optional[str] = None  # 到期日 (YYYY-MM-DD)
    attachments: Optional[List[str]] = []
    last_reminded_at: Optional[str] = None

    @field_validator('raiseDate', 'closeoutDate', 'dueDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('defectPhotos', 'improvementPhotos', 'attachments', mode='before')
    @classmethod
    def parse_photos(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class NCRCreate(NCRBase):
    id: Optional[str] = None

class NCRUpdate(BaseModel):
    vendor: Optional[str] = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    description: Optional[str] = None
    rev: Optional[str] = None
    submit: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None
    hasDetails: Optional[bool] = None
    raiseDate: Optional[str] = None
    closeoutDate: Optional[str] = None
    aconex: Optional[str] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    foundBy: Optional[str] = None
    raisedBy: Optional[str] = None
    foundLocation: Optional[str] = None
    productDisposition: Optional[str] = None
    productIntegrityRelated: Optional[str] = None
    permanentProductDeviation: Optional[str] = None
    impactToOM: Optional[str] = None
    defectPhotos: Optional[Any] = None
    improvementPhotos: Optional[Any] = None
    noiNumber: Optional[str] = None
    dueDate: Optional[str] = None
    attachments: Optional[List[str]] = None
    last_reminded_at: Optional[str] = None

class NCR(NCRBase):
    id: str
    class Config:
        from_attributes = True


# NOI
class NOIBase(BaseModel):
    package: str
    referenceNo: Optional[str] = None  # 由後端自動產生
    issueDate: str
    inspectionTime: str
    itpNo: str  # 連結到 ITP referenceNo
    eventNumber: Optional[str] = None
    checkpoint: Optional[str] = None
    inspectionDate: str
    type: str
    contractor: str
    contacts: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None
    closeoutDate: Optional[str] = None
    attachments: Optional[List[str]] = []
    ncrNumber: Optional[str] = None  # 若此 NOI 是針對 NCR 的重新檢驗
    last_reminded_at: Optional[str] = None
    dueDate: Optional[str] = None

    @field_validator('issueDate', 'inspectionDate', 'closeoutDate', 'dueDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class NOICreate(NOIBase):
    id: Optional[str] = None

class NOIUpdate(BaseModel):
    package: Optional[str] = None
    # referenceNo 不可更新（由後端自動產生，建立後不可變）
    issueDate: Optional[str] = None
    inspectionTime: Optional[str] = None
    itpNo: Optional[str] = None
    eventNumber: Optional[str] = None
    checkpoint: Optional[str] = None
    inspectionDate: Optional[str] = None
    type: Optional[str] = None
    contractor: Optional[str] = None
    contacts: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None
    closeoutDate: Optional[str] = None
    attachments: Optional[List[str]] = None
    ncrNumber: Optional[str] = None
    last_reminded_at: Optional[str] = None
    dueDate: Optional[str] = None

class NOI(NOIBase):
    id: str
    class Config:
        from_attributes = True


# ITR
class ITRBase(BaseModel):
    vendor: str
    documentNumber: Optional[str] = None  # 由後端自動產生
    description: str
    rev: str
    submit: str
    status: str
    remark: Optional[str] = None
    hasDetails: Optional[bool] = False
    raiseDate: Optional[str] = None
    closeoutDate: Optional[str] = None
    aconex: Optional[str] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    ncrNumber: Optional[str] = None  # 若檢驗失敗，連結到產生的 NCR
    raisedBy: Optional[str] = None
    foundLocation: Optional[str] = None
    noiNumber: Optional[str] = None  # 連結到產生此 ITR 的 NOI（取代舊的 itpNo）
    eventNumber: Optional[str] = None
    checkpoint: Optional[str] = None
    defectPhotos: Optional[Any] = None
    improvementPhotos: Optional[Any] = None
    attachments: Optional[List[str]] = []

    @field_validator('raiseDate', 'closeoutDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class ITRCreate(ITRBase):
    id: Optional[str] = None

class ITRUpdate(BaseModel):
    vendor: Optional[str] = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    description: Optional[str] = None
    rev: Optional[str] = None
    submit: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None
    hasDetails: Optional[bool] = None
    raiseDate: Optional[str] = None
    closeoutDate: Optional[str] = None
    aconex: Optional[str] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    ncrNumber: Optional[str] = None
    raisedBy: Optional[str] = None
    foundLocation: Optional[str] = None
    noiNumber: Optional[str] = None
    eventNumber: Optional[str] = None
    checkpoint: Optional[str] = None
    defectPhotos: Optional[Any] = None
    defectPhotos: Optional[Any] = None
    improvementPhotos: Optional[Any] = None
    attachments: Optional[List[str]] = None

class ITR(ITRBase):
    id: str
    class Config:
        from_attributes = True


# PQP
class PQPBase(BaseModel):
    pqpNo: Optional[str] = None  # 由後端自動產生
    title: str
    description: str
    vendor: str
    status: str
    version: str
    createdAt: str
    updatedAt: str
    attachments: Optional[List[str]] = []

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class PQPCreate(PQPBase):
    id: Optional[str] = None
    pqpNo: Optional[str] = ''
    title: Optional[str] = ''
    description: Optional[str] = ''
    vendor: Optional[str] = ''
    status: Optional[str] = 'Approved'
    version: Optional[str] = 'Rev1.0'
    createdAt: Optional[str] = ''
    updatedAt: Optional[str] = ''

class PQPUpdate(BaseModel):
    # pqpNo 不可更新（由後端自動產生，建立後不可變）
    title: Optional[str] = None
    description: Optional[str] = None
    vendor: Optional[str] = None
    status: Optional[str] = None
    version: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    attachments: Optional[List[str]] = None

class PQP(PQPBase):
    id: str
    class Config:
        from_attributes = True


# OBS
class OBSBase(BaseModel):
    vendor: str
    documentNumber: Optional[str] = None  # 由後端自動產生
    description: str
    rev: str
    submit: str
    status: str
    remark: Optional[str] = None
    hasDetails: Optional[bool] = False
    raiseDate: Optional[str] = None
    closeoutDate: Optional[str] = None
    aconex: Optional[str] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    foundBy: Optional[str] = None
    raisedBy: Optional[str] = None
    foundLocation: Optional[str] = None
    productDisposition: Optional[str] = None
    productIntegrityRelated: Optional[str] = None
    permanentProductDeviation: Optional[str] = None
    impactToOM: Optional[str] = None
    defectPhotos: Optional[Any] = None
    improvementPhotos: Optional[Any] = None
    attachments: Optional[Any] = None
    dueDate: Optional[str] = None

    @field_validator('raiseDate', 'closeoutDate', 'dueDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

class OBSCreate(OBSBase):
    id: Optional[str] = None

class OBSUpdate(BaseModel):
    vendor: Optional[str] = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    description: Optional[str] = None
    rev: Optional[str] = None
    submit: Optional[str] = None
    status: Optional[str] = None
    remark: Optional[str] = None
    hasDetails: Optional[bool] = None
    raiseDate: Optional[str] = None
    closeoutDate: Optional[str] = None
    aconex: Optional[str] = None
    type: Optional[str] = None
    subject: Optional[str] = None
    foundBy: Optional[str] = None
    raisedBy: Optional[str] = None
    foundLocation: Optional[str] = None
    productDisposition: Optional[str] = None
    productIntegrityRelated: Optional[str] = None
    permanentProductDeviation: Optional[str] = None
    impactToOM: Optional[str] = None
    defectPhotos: Optional[Any] = None
    improvementPhotos: Optional[Any] = None
    attachments: Optional[Any] = None
    last_reminded_at: Optional[str] = None
    dueDate: Optional[str] = None

class OBS(OBSBase):
    id: str
    class Config:
        from_attributes = True


# Contractor
class ContractorBase(BaseModel):
    package: Optional[str] = None
    name: str
    abbreviation: Optional[str] = None
    scope: Optional[str] = None
    contactPerson: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: str = "active"

class ContractorCreate(ContractorBase):
    id: Optional[str] = None

class ContractorUpdate(BaseModel):
    package: Optional[str] = None
    name: Optional[str] = None
    abbreviation: Optional[str] = None
    scope: Optional[str] = None
    contactPerson: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None

class Contractor(ContractorBase):
    id: str
    class Config:
        from_attributes = True


# FollowUp
class FollowUpBase(BaseModel):
    issueNo: Optional[str] = None
    title: str
    description: str
    status: str
    priority: Optional[str] = None
    assignedTo: Optional[str] = None
    vendor: Optional[str] = None
    dueDate: Optional[str] = None
    createdAt: str
    updatedAt: str
    action: Optional[str] = None
    sourceModule: Optional[str] = None  # 來源模組
    sourceReferenceNo: Optional[str] = None  # 來源單號

    @field_validator('dueDate', 'createdAt', 'updatedAt', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

class FollowUpCreate(FollowUpBase):
    id: Optional[str] = None

class FollowUpUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignedTo: Optional[str] = None
    vendor: Optional[str] = None
    dueDate: Optional[str] = None
    updatedAt: Optional[str] = None
    action: Optional[str] = None
    sourceModule: Optional[str] = None
    sourceReferenceNo: Optional[str] = None
    last_reminded_at: Optional[str] = None

class FollowUp(FollowUpBase):
    id: str
    class Config:
        from_attributes = True


# Document Naming Rules
class NamingRuleBase(BaseModel):
    doc_type: str
    prefix: str
    sequence_digits: int


class NamingRule(NamingRuleBase):
    id: int

    class Config:
        from_attributes = True

# --- IAM Schemas ---

# Role
class RoleBase(BaseModel):
    name: str
    description: Optional[str] = None
    permissions: List[str] = []

    @field_validator('permissions', mode='before')
    @classmethod
    def parse_permissions(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class RoleCreate(RoleBase):
    pass

class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None

class Role(RoleBase):
    id: int

    class Config:
        from_attributes = True

# User
class ChecklistBase(BaseModel):
    recordsNo: Optional[str] = None  # 改為 Optional 以支援後端自動產生
    activity: str
    date: str
    status: str
    packageName: str
    location: Optional[str] = None
    itpIndex: int
    detail_data: Optional[str] = None
    noiNumber: Optional[str] = None

class ChecklistCreate(ChecklistBase):
    pass

class ChecklistUpdate(BaseModel):
    """Checklist 更新用 schema"""
    recordsNo: Optional[str] = None
    activity: Optional[str] = None
    date: Optional[str] = None
    status: Optional[str] = None
    packageName: Optional[str] = None
    location: Optional[str] = None
    itpIndex: Optional[int] = None
    detail_data: Optional[str] = None
    noiNumber: Optional[str] = None

class Checklist(ChecklistBase):
    id: str

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    is_active: Optional[bool] = True
    role_id: Optional[int] = None
    created_at: Optional[str] = None  # ISO date string

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    is_active: Optional[bool] = None
    role_id: Optional[int] = None
    password: Optional[str] = None

class User(UserBase):
    id: int
    role_name: Optional[str] = None # For UI convenience

    class Config:
        from_attributes = True

# --- Audit Schemas ---
class AuditBase(BaseModel):
    auditNo: str
    title: str
    date: str
    auditor: str
    status: str
    location: str
    findings: str
    contractor: Optional[str] = None

    @field_validator('date', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

class AuditCreate(AuditBase):
    id: Optional[str] = None

class AuditUpdate(BaseModel):
    auditNo: Optional[str] = None
    title: Optional[str] = None
    date: Optional[str] = None
    auditor: Optional[str] = None
    status: Optional[str] = None
    location: Optional[str] = None
    findings: Optional[str] = None
    contractor: Optional[str] = None

class Audit(AuditBase):
    id: str
    class Config:
        from_attributes = True


# --- KPI & Performance Schemas ---
class KPIWeightBase(BaseModel):
    pqp_weight: int = 25
    itp_weight: int = 25
    obs_weight: int = 25
    ncr_weight: int = 25

class KPIWeightUpdate(KPIWeightBase):
    pass

class KPIWeight(KPIWeightBase):
    id: int
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True

class OwnerPerformanceBase(BaseModel):
    owner_name: str
    month: str
    score: int = 0
    details: Optional[str] = None

class OwnerPerformanceCreate(OwnerPerformanceBase):
    id: Optional[str] = None

class OwnerPerformanceUpdate(BaseModel):
    owner_name: Optional[str] = None
    month: Optional[str] = None
    score: Optional[int] = None
    details: Optional[str] = None

class OwnerPerformance(OwnerPerformanceBase):
    id: str
    updated_at: Optional[str] = None
    class Config:
        from_attributes = True


# --- Attachment (File Management) Schemas ---

class AttachmentResponse(BaseModel):
    """附件回傳 schema — 前端用於顯示與管理檔案"""
    id: str
    entity_type: str
    entity_id: str
    file_name: str
    file_url: str            # 由 API 動態組裝的完整存取 URL
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    category: str = "attachment"
    uploaded_by: Optional[str] = None
    uploaded_at: str

    class Config:
        from_attributes = True
