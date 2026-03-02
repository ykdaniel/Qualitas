import json
import re
from typing import Any

from pydantic import BaseModel, EmailStr, constr, field_validator, model_validator

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
    vendor: str | None = None
    referenceNo: str | None = None  # 由後端自動產生
    description: constr(max_length=MAX_TEXT_LENGTH) | None = ''
    rev: constr(max_length=MAX_SHORT_LENGTH) | None = ''
    submit: str | None = ''
    status: str
    remark: str | None = None
    hasDetails: bool | None = False
    submissionDate: str | None = None
    detail_data: Any | None = None  # Allow List/Dict/Any
    attachments: list[str] | None = []
    last_reminded_at: str | None = None
    dueDate: str | None = None

    @field_validator('submissionDate', 'dueDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('detail_data', 'attachments', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.submissionDate and self.dueDate:
            if self.submissionDate > self.dueDate:
                raise ValueError('Submission date must be before or equal to due date')
        return self


class ITPCreate(ITPBase):
    id: str | None = None
class ITPDetailBody(BaseModel):
    a: list[Any] = []
    b: list[Any] = []
    c: list[Any] = []
    checklist: list[Any] = []
    self_inspection: Any | None = None

class ITPUpdate(BaseModel):
    """ITP 更新用 schema，referenceNo 不可更新"""
    vendor: str | None = None
    # referenceNo 不可更新（由後端自動產生，建立後不可變）
    description: str | None = None
    rev: str | None = None
    submit: str | None = None
    status: str | None = None
    remark: str | None = None
    hasDetails: bool | None = None
    submissionDate: str | None = None
    detail_data: Any | None = None
    attachments: list[str] | None = None
    last_reminded_at: str | None = None
    dueDate: str | None = None

    @field_validator('detail_data', 'attachments', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v


class ITP(ITPBase):
    id: str
    model_config = {"from_attributes": True}

# NCR
class NCRBase(BaseModel):
    vendor: str | None = None
    documentNumber: str | None = None  # 由後端自動產生
    description: constr(max_length=MAX_TEXT_LENGTH)
    rev: constr(max_length=MAX_SHORT_LENGTH)
    submit: str
    status: str
    remark: str | None = None
    hasDetails: bool | None = False
    raiseDate: str | None = None
    closeoutDate: str | None = None
    aconex: str | None = None
    type: str | None = None
    subject: str | None = None
    foundBy: str | None = None
    raisedBy: str | None = None
    foundLocation: str | None = None
    productDisposition: str | None = None
    productIntegrityRelated: str | None = None
    permanentProductDeviation: str | None = None
    impactToOM: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    noiNumber: str | None = None  # 連結到觸發此 NCR 的 NOI
    dueDate: str | None = None  # 到期日 (YYYY-MM-DD)
    attachments: list[str] | None = []
    last_reminded_at: str | None = None

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

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.raiseDate and self.closeoutDate:
            if self.raiseDate > self.closeoutDate:
                raise ValueError('Raise date must be before or equal to closeout date')
        if self.raiseDate and self.dueDate:
            if self.raiseDate > self.dueDate:
                raise ValueError('Raise date must be before or equal to due date')
        if self.closeoutDate and self.dueDate:
            if self.closeoutDate > self.dueDate:
                raise ValueError('Closeout date must be before or equal to due date')
        return self

class NCRCreate(NCRBase):
    id: str | None = None

class NCRUpdate(BaseModel):
    vendor: str | None = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    description: str | None = None
    rev: str | None = None
    submit: str | None = None
    status: str | None = None
    remark: str | None = None
    hasDetails: bool | None = None
    raiseDate: str | None = None
    closeoutDate: str | None = None
    aconex: str | None = None
    type: str | None = None
    subject: str | None = None
    foundBy: str | None = None
    raisedBy: str | None = None
    foundLocation: str | None = None
    productDisposition: str | None = None
    productIntegrityRelated: str | None = None
    permanentProductDeviation: str | None = None
    impactToOM: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    noiNumber: str | None = None
    dueDate: str | None = None
    attachments: list[str] | None = None
    last_reminded_at: str | None = None

    @field_validator('defectPhotos', 'improvementPhotos', 'attachments', mode='before')
    @classmethod
    def parse_photos(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class NCR(NCRBase):
    id: str
    model_config = {"from_attributes": True}


# NOI
class NOIBase(BaseModel):
    package: str
    referenceNo: str | None = None  # 由後端自動產生
    issueDate: str
    inspectionTime: str
    itpNo: str  # 連結到 ITP referenceNo
    eventNumber: str | None = None
    checkpoint: str | None = None
    inspectionDate: str
    type: str
    contractor: str | None = None
    contacts: str | None = None
    phone: str | None = None
    email: str | None = None
    status: str | None = None
    remark: str | None = None
    closeoutDate: str | None = None
    attachments: list[str] | None = []
    ncrNumber: str | None = None  # 若此 NOI 是針對 NCR 的重新檢驗
    last_reminded_at: str | None = None
    dueDate: str | None = None

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

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.issueDate and self.inspectionDate:
            if self.issueDate > self.inspectionDate:
                raise ValueError('Issue date must be before or equal to inspection date')
        if self.issueDate and self.closeoutDate:
            if self.issueDate > self.closeoutDate:
                raise ValueError('Issue date must be before or equal to closeout date')
        if self.issueDate and self.dueDate:
            if self.issueDate > self.dueDate:
                raise ValueError('Issue date must be before or equal to due date')
        if self.inspectionDate and self.closeoutDate:
            if self.inspectionDate > self.closeoutDate:
                raise ValueError('Inspection date must be before or equal to closeout date')
        return self

class NOICreate(NOIBase):
    id: str | None = None

class NOIUpdate(BaseModel):
    package: str | None = None
    # referenceNo 不可更新（由後端自動產生，建立後不可變）
    issueDate: str | None = None
    inspectionTime: str | None = None
    itpNo: str | None = None
    eventNumber: str | None = None
    checkpoint: str | None = None
    inspectionDate: str | None = None
    type: str | None = None
    contractor: str | None = None
    contacts: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    status: str | None = None
    remark: str | None = None
    closeoutDate: str | None = None
    attachments: list[str] | None = None
    ncrNumber: str | None = None
    last_reminded_at: str | None = None
    dueDate: str | None = None

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class NOI(NOIBase):
    id: str
    model_config = {"from_attributes": True}


# ITR
class ITRBase(BaseModel):
    vendor: str | None = None
    documentNumber: str | None = None  # 由後端自動產生
    description: str
    rev: str
    submit: str
    status: str
    remark: str | None = None
    hasDetails: bool | None = False
    raiseDate: str | None = None
    closeoutDate: str | None = None
    aconex: str | None = None
    type: str | None = None
    subject: str | None = None
    ncrNumber: str | None = None  # 若檢驗失敗，連結到產生的 NCR
    raisedBy: str | None = None
    foundLocation: str | None = None
    noiNumber: str | None = None  # 連結到產生此 ITR 的 NOI（取代舊的 itpNo）
    eventNumber: str | None = None
    checkpoint: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    detail_data: str | None = None  # JSON string for extended data
    attachments: list[str] | None = []

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

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.raiseDate and self.closeoutDate:
            if self.raiseDate > self.closeoutDate:
                raise ValueError('Raise date must be before or equal to closeout date')
        return self

class ITRCreate(ITRBase):
    id: str | None = None

class ITRUpdate(BaseModel):
    vendor: str | None = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    description: str | None = None
    rev: str | None = None
    submit: str | None = None
    status: str | None = None
    remark: str | None = None
    hasDetails: bool | None = None
    raiseDate: str | None = None
    closeoutDate: str | None = None
    aconex: str | None = None
    type: str | None = None
    subject: str | None = None
    ncrNumber: str | None = None
    raisedBy: str | None = None
    foundLocation: str | None = None
    noiNumber: str | None = None
    eventNumber: str | None = None
    checkpoint: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    detail_data: str | None = None
    attachments: list[str] | None = None

    @field_validator('defectPhotos', 'improvementPhotos', 'attachments', 'detail_data', mode='before')
    @classmethod
    def parse_photos(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class ITR(ITRBase):
    id: str
    model_config = {"from_attributes": True}


# PQP
class PQPBase(BaseModel):
    pqpNo: str | None = None  # 由後端自動產生
    title: str
    description: str
    vendor: str | None = None
    status: str
    version: str
    createdAt: str
    updatedAt: str
    attachments: list[str] | None = []

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
    id: str | None = None
    pqpNo: str | None = ''
    title: str | None = ''
    description: str | None = ''
    vendor: str | None = ''
    status: str | None = 'Approved'
    version: str | None = 'Rev1.0'
    createdAt: str | None = ''
    updatedAt: str | None = ''

class PQPUpdate(BaseModel):
    # pqpNo 不可更新（由後端自動產生，建立後不可變）
    title: str | None = None
    description: str | None = None
    vendor: str | None = None
    status: str | None = None
    version: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    attachments: list[str] | None = None

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class PQP(PQPBase):
    id: str
    model_config = {"from_attributes": True}


# OBS
class OBSBase(BaseModel):
    vendor: str | None = None
    documentNumber: str | None = None  # 由後端自動產生
    description: str
    rev: str
    submit: str
    status: str
    remark: str | None = None
    hasDetails: bool | None = False
    raiseDate: str | None = None
    closeoutDate: str | None = None
    aconex: str | None = None
    type: str | None = None
    subject: str | None = None
    foundBy: str | None = None
    raisedBy: str | None = None
    foundLocation: str | None = None
    productDisposition: str | None = None
    productIntegrityRelated: str | None = None
    permanentProductDeviation: str | None = None
    impactToOM: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    attachments: Any | None = None
    dueDate: str | None = None

    @field_validator('raiseDate', 'closeoutDate', 'dueDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.raiseDate and self.closeoutDate:
            if self.raiseDate > self.closeoutDate:
                raise ValueError('Raise date must be before or equal to closeout date')
        if self.raiseDate and self.dueDate:
            if self.raiseDate > self.dueDate:
                raise ValueError('Raise date must be before or equal to due date')
        if self.closeoutDate and self.dueDate:
            if self.closeoutDate > self.dueDate:
                raise ValueError('Closeout date must be before or equal to due date')
        return self

class OBSCreate(OBSBase):
    id: str | None = None

class OBSUpdate(BaseModel):
    vendor: str | None = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    description: str | None = None
    rev: str | None = None
    submit: str | None = None
    status: str | None = None
    remark: str | None = None
    hasDetails: bool | None = None
    raiseDate: str | None = None
    closeoutDate: str | None = None
    aconex: str | None = None
    type: str | None = None
    subject: str | None = None
    foundBy: str | None = None
    raisedBy: str | None = None
    foundLocation: str | None = None
    productDisposition: str | None = None
    productIntegrityRelated: str | None = None
    permanentProductDeviation: str | None = None
    impactToOM: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    attachments: list[str] | None = None
    last_reminded_at: str | None = None
    dueDate: str | None = None
    noiNumber: str | None = None
    itrNumber: str | None = None

    @field_validator('defectPhotos', 'improvementPhotos', 'attachments', mode='before')
    @classmethod
    def parse_photos(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class OBS(OBSBase):
    id: str
    model_config = {"from_attributes": True}


# Contractor
class ContractorBase(BaseModel):
    package: str | None = None
    name: str
    abbreviation: str | None = None
    scope: str | None = None
    contactPerson: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    status: str = "active"

class ContractorCreate(ContractorBase):
    id: str | None = None

class ContractorUpdate(BaseModel):
    package: str | None = None
    name: str | None = None
    abbreviation: str | None = None
    scope: str | None = None
    contactPerson: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    status: str | None = None

class Contractor(ContractorBase):
    id: str
    model_config = {"from_attributes": True}


# FollowUp
class FollowUpBase(BaseModel):
    issueNo: str | None = None
    title: str
    description: str
    status: str
    priority: str | None = None
    assignedTo: str | None = None
    vendor: str | None = None
    dueDate: str | None = None
    createdAt: str
    updatedAt: str
    action: str | None = None
    sourceModule: str | None = None  # 來源模組
    sourceReferenceNo: str | None = None  # 來源單號

    @field_validator('dueDate', 'createdAt', 'updatedAt', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

class FollowUpCreate(FollowUpBase):
    id: str | None = None

class FollowUpUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assignedTo: str | None = None
    vendor: str | None = None
    dueDate: str | None = None
    updatedAt: str | None = None
    action: str | None = None
    sourceModule: str | None = None
    sourceReferenceNo: str | None = None
    last_reminded_at: str | None = None

class FollowUp(FollowUpBase):
    id: str
    model_config = {"from_attributes": True}


# Document Naming Rules
class NamingRuleBase(BaseModel):
    doc_type: str
    prefix: str
    sequence_digits: int


class NamingRule(NamingRuleBase):
    id: int

    model_config = {"from_attributes": True}

# --- IAM Schemas ---

# Role
class RoleBase(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str] = []

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
    reason: str | None = None

class RoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None
    reason: str | None = None

class Role(RoleBase):
    id: int

    model_config = {"from_attributes": True}

# Permission
class PermissionBase(BaseModel):
    code: str
    description: str | None = None

class Permission(PermissionBase):
    id: int

    model_config = {"from_attributes": True}

# User
class ChecklistBase(BaseModel):
    recordsNo: str | None = None  # 改為 Optional 以支援後端自動產生
    activity: str | None = None
    date: str
    status: str
    packageName: str | None = None
    location: str | None = None
    itpIndex: int | None = 0
    detail_data: str | None = None
    noiNumber: str | None = None
    contractor: str | None = None
    itpId: str | None = None
    itpVersion: str | None = None
    passCount: int | None = 0
    failCount: int | None = 0
    itrId: str | None = None
    itrNumber: str | None = None

class ChecklistCreate(ChecklistBase):
    pass

class ChecklistUpdate(BaseModel):
    """Checklist 更新用 schema"""
    recordsNo: str | None = None
    activity: str | None = None
    date: str | None = None
    status: str | None = None
    packageName: str | None = None
    location: str | None = None
    itpIndex: int | None = None
    detail_data: str | None = None
    noiNumber: str | None = None
    contractor: str | None = None
    itpId: str | None = None
    itpVersion: str | None = None
    passCount: int | None = None
    failCount: int | None = None
    itrId: str | None = None
    itrNumber: str | None = None

class Checklist(ChecklistBase):
    id: str

    model_config = {"from_attributes": True}

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str | None = None
    is_active: bool | None = True
    role_id: int | None = None

class UserCreate(UserBase):
    password: str
    reason: str | None = None

class UserUpdate(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    full_name: str | None = None
    is_active: bool | None = None
    role_id: int | None = None
    password: str | None = None
    reason: str | None = None

class User(UserBase):
    id: int
    role_name: str | None = None
    created_at: str | None = None

    model_config = {"from_attributes": True}

# --- Audit Schemas ---
class AuditBase(BaseModel):
    auditNo: str
    title: str | None = None
    date: str | None = None
    end_date: str | None = None
    auditor: str | None = None
    status: str
    location: str | None = None
    findings: str | None = None
    contractor: str | None = None
    project_name: str | None = None
    project_director: str | None = None
    support_auditors: str | None = None
    tech_lead: str | None = None
    scope_description: str | None = None
    audit_criteria: str | None = None
    selected_templates: list[str] | None = []
    custom_check_items: Any | None = []

    @field_validator('date', 'end_date', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('selected_templates', 'custom_check_items', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.date and self.end_date:
            if self.date > self.end_date:
                raise ValueError('Start date must be before or equal to end date')
        return self

class AuditCreate(AuditBase):
    id: str | None = None

class AuditUpdate(BaseModel):
    auditNo: str | None = None
    title: str | None = None
    date: str | None = None
    end_date: str | None = None
    auditor: str | None = None
    status: str | None = None
    location: str | None = None
    findings: str | None = None
    contractor: str | None = None
    project_name: str | None = None
    project_director: str | None = None
    support_auditors: str | None = None
    tech_lead: str | None = None
    scope_description: str | None = None
    audit_criteria: str | None = None
    selected_templates: list[str] | None = None
    custom_check_items: Any | None = None

    @field_validator('selected_templates', 'custom_check_items', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class Audit(AuditBase):
    id: str
    vendor_id: str | None = None

    model_config = {"from_attributes": True}


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
    updated_at: str | None = None
    model_config = {"from_attributes": True}

class OwnerPerformanceBase(BaseModel):
    owner_name: str
    month: str
    score: int = 0
    details: str | None = None

class OwnerPerformanceCreate(OwnerPerformanceBase):
    id: str | None = None

class OwnerPerformanceUpdate(BaseModel):
    owner_name: str | None = None
    month: str | None = None
    score: int | None = None
    details: str | None = None

class OwnerPerformance(OwnerPerformanceBase):
    id: str
    updated_at: str | None = None
    model_config = {"from_attributes": True}


# --- Attachment (File Management) Schemas ---

class AttachmentResponse(BaseModel):
    """附件回傳 schema — 前端用於顯示與管理檔案"""
    id: str
    entity_type: str
    entity_id: str
    file_name: str
    file_url: str            # 由 API 動態組裝的完整存取 URL
    file_size: int | None = None
    mime_type: str | None = None
    category: str = "attachment"
    uploaded_by: str | None = None
    uploaded_at: str

    model_config = {"from_attributes": True}

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None


# --- FAT Schemas ---

class FATDetailItem(BaseModel):
    id: str
    sNo: str | None = ''
    itemName: str | None = ''
    specification: str | None = ''
    qty: str | None = ''
    unit: str | None = ''
    acceptanceCriteria: str | None = ''
    fatActualValue: str | None = ''
    fatJudgment: str | None = ''
    remarks: str | None = ''

class FATBase(BaseModel):
    equipment: str
    supplier: str
    procedure: str | None = None
    location: str | None = None
    startDate: str
    endDate: str
    deliveryFrom: str | None = None
    deliveryTo: str | None = None
    siteReadiness: str | None = None
    moveInDate: str | None = None
    status: str | None = "Scheduled"
    hasDetails: bool | None = False
    detail_data: list[FATDetailItem] | None = None
    attachments: list[str] | None = []

    @field_validator('startDate', 'endDate', 'moveInDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('detail_data', 'attachments', mode='before')
    @classmethod
    def parse_json(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.startDate and self.endDate:
            if self.startDate > self.endDate:
                raise ValueError('Start date must be before or equal to end date')
        if self.endDate and self.moveInDate:
            if self.endDate > self.moveInDate:
                raise ValueError('End date must be before or equal to move-in date')
        return self

class FATCreate(FATBase):
    id: str | None = None

class FATUpdate(BaseModel):
    equipment: str | None = None
    supplier: str | None = None
    procedure: str | None = None
    location: str | None = None
    startDate: str | None = None
    endDate: str | None = None
    deliveryFrom: str | None = None
    deliveryTo: str | None = None
    siteReadiness: str | None = None
    moveInDate: str | None = None
    status: str | None = None
    hasDetails: bool | None = None
    detail_data: list[FATDetailItem] | None = None
    attachments: list[str] | None = None

    @field_validator('detail_data', 'attachments', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class FAT(FATBase):
    id: str
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}

# --- KM Schemas ---
class KMAttachment(BaseModel):
    name: str
    filename: str | None = None
    size: str | None = None
    url: str | None = None

class KMArticleBase(BaseModel):
    articleNo: str | None = None
    title: str
    content: str
    category: str | None = None
    tags: str | None = None
    status: str | None = "Published"
    attachments: list[KMAttachment] | None = None
    parent_id: str | None = None
    chapter_no: str | None = None
    change_summary: str | None = None

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class KMArticleCreate(KMArticleBase):
    id: str | None = None

class KMArticleUpdate(BaseModel):
    title: str | None = None
    content: str | None = None
    category: str | None = None
    tags: str | None = None
    status: str | None = None
    attachments: list[KMAttachment] | None = None
    parent_id: str | None = None
    chapter_no: str | None = None
    change_summary: str | None = None

    @field_validator('attachments', mode='before')
    @classmethod
    def parse_attachments(cls, v):
        if isinstance(v, str):
            try:
                data = json.loads(v)
                if isinstance(data, list):
                    return [KMAttachment(**item) if isinstance(item, dict) else item for item in data]
                return []
            except Exception:
                return []
        return v

class KMArticle(KMArticleBase):
    id: str
    author_id: int | None = None
    created_at: str | None = None
    updated_at: str | None = None
    version_no: int | None = 1

    model_config = {"from_attributes": True}

class KMArticleHistory(BaseModel):
    id: str
    article_id: str
    version_no: int
    title: str
    content: str
    category: str | None = None
    tags: str | None = None
    status: str | None = None
    author_id: int | None = None
    attachments: str | None = None
    parent_id: str | None = None
    chapter_no: str | None = None
    change_summary: str | None = None
    created_at: str



    model_config = {"from_attributes": True}
