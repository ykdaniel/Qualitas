import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StrictInt, computed_field, constr, field_validator, model_validator, model_serializer

from core import strict_dates

# 輸入驗證常數
MAX_TEXT_LENGTH = 10000  # 一般文字欄位最大長度
MAX_SHORT_LENGTH = 500   # 短文字欄位最大長度

# 驗證工具函數
def validate_date_format(v) -> str:
    """驗證日期格式 (YYYY-MM-DD)"""
    if not v:
        return v
    # mode='before' validators see the raw JSON value, which may not be a
    # str (e.g. a client sending a number) — coerce before regex/slicing.
    v = v if isinstance(v, str) else str(v)
    if not re.match(r'^\d{4}-\d{2}-\d{2}', v):
        raise ValueError('日期格式必須為 YYYY-MM-DD')
    # 若為 datetime string，只取日期部分
    if len(v) > 10:
        v = v[:10]
    return v


def validate_numeric_string(v) -> str:
    """Reject a non-empty value that isn't a bare number (int or decimal).
    Used for NCR.qtyAffected — it used to be free text like "1 joint"; the
    unit now lives in its own qtyAffectedUnit column so this can be a real
    number for aggregate stats (BACKLOG #12)."""
    if not v:
        return v
    # mode='before' validators see the raw JSON value, which may not be a
    # str (e.g. a client sending {"qtyAffected": 5}) — coerce before regex.
    v = v if isinstance(v, str) else str(v)
    if not re.match(r'^\d+(\.\d+)?$', v.strip()):
        raise ValueError('qtyAffected must be a plain number (put the unit in qtyAffectedUnit instead)')
    return v


# Controlled value sets for NCR enum-style fields (BACKLOG #13). Empty/None is
# always allowed (unset); these only reject non-empty out-of-list values.
NCR_CONTROLLED_VALUES = {
    "severity": {"Major", "Minor"},
    "discipline": {"Civil", "Structural", "Mechanical", "Electrical", "Piping", "Architectural"},
    "productDisposition": {"Use As Is", "Repair", "Rework", "Reject"},
    "effectivenessVerified": {"Pending", "Yes", "No"},
    "ownerApproval": {"Pending", "Approved", "Rejected"},
    "status": {"Open", "In Progress", "Resolved", "Closed", "Void"},
    "extent": {"Isolated", "Systemic"},
    "recurrence": {"Yes", "No"},
    "repairMethodStatementStatus": {"TBC", "NA"},
    "immediateCorrectionActionStatus": {"TBC", "NA"},
    "rootCauseAnalysisStatus": {"TBC", "NA"},
    "correctiveActionsStatus": {"TBC", "NA"},
    "preventiveActionStatus": {"TBC", "NA"},
    "effectivenessNotesStatus": {"TBC", "NA"},
    "directCauseStatus": {"TBC", "NA"},
}


def _validate_ncr_controlled(field_name: str, v):
    """Reject values outside the controlled list for enum-style NCR fields.
    Empty / None is allowed (field unset)."""
    if v is None or v == "":
        return v
    allowed = NCR_CONTROLLED_VALUES.get(field_name)
    if allowed is not None and v not in allowed:
        raise ValueError(f"{field_name} must be one of {sorted(allowed)}; got '{v}'")
    return v

class DateIssue(BaseModel):
    """Read-only description of a stored date that a NEW write would not be allowed to produce (NCR / OBS / NOI). The
    stored value is returned untouched next to this; nothing is written back. `code` is a stable identifier:
    invalid_format | invalid_calendar | timestamp | trailing_characters | whitespace | whitespace_only | missing_required |
    raise_after_closeout | raise_after_due | closeout_after_due (the last three name the LATER field and set `related_field`)."""
    field: str
    value: str | None = None
    code: str
    related_field: str | None = None


class ITPBase(BaseModel):
    project_id: str | None = None
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

    # NOTE: ITPBase is intentionally lenient about submissionDate/dueDate ordering
    # because it's also used as the base for the ITP response model, which must
    # parse legacy DB records that may have inconsistent dates. Strict validation
    # lives on ITPCreate so that new input is still rejected.


class ITPCreate(ITPBase):
    id: str | None = None

    @model_validator(mode='after')
    def check_date_ranges(self):
        if self.submissionDate and self.dueDate:
            try:
                sub = self.submissionDate[:10]
                due = self.dueDate[:10]
            except Exception:
                return self
            if sub > due:
                raise ValueError(
                    'submissionDate must be before or equal to dueDate'
                )
        return self
class ITPDetailBody(BaseModel):
    a: list[Any] = []
    b: list[Any] = []
    c: list[Any] = []
    checklist: list[Any] = []
    self_inspection: Any | None = None

class ITPUpdate(BaseModel):
    """ITP 更新用 schema，referenceNo 不可更新"""
    project_id: str | None = None
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
    model_config = ConfigDict(from_attributes=True)

# NCR
class NCRBase(BaseModel):
    project_id: str | None = None
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
    progressPhotos: Any | None = None
    improvementPhotos: Any | None = None
    noiNumber: str | None = None  # 連結到觸發此 NCR 的 NOI
    itrNumber: str | None = None  # 連結到觸發此 NCR 的 ITR
    dueDate: str | None = None  # 到期日 (YYYY-MM-DD)
    attachments: list[str] | None = []
    last_reminded_at: str | None = None
    referenceStandards: str | None = None
    serialNumbers: str | None = None
    repairMethodStatement: str | None = None
    repairMethodStatementStatus: str | None = None
    immediateCorrectionAction: str | None = None
    immediateCorrectionActionStatus: str | None = None
    rootCauseAnalysis: str | None = None
    rootCauseAnalysisStatus: str | None = None
    correctiveActions: str | None = None
    correctiveActionsStatus: str | None = None
    preventiveAction: str | None = None
    preventiveActionStatus: str | None = None
    finalProductIntegrityStatement: str | None = None
    reInspectionNumber: str | None = None
    projectQualityManager: str | None = None
    # NCR field-model improvements (BACKLOG #13)
    severity: str | None = None                    # Major / Minor
    discipline: str | None = None                  # Civil / Structural / Mechanical / Electrical / Piping / Architectural
    assignedTo: int | None = None                  # FK users.id — person responsible to close
    closedBy: int | None = None                    # FK users.id
    verifiedBy: int | None = None                  # FK users.id
    effectivenessVerified: str | None = None       # Pending / Yes / No
    effectivenessVerifiedBy: int | None = None     # FK users.id
    effectivenessVerifiedDate: str | None = None   # YYYY-MM-DD
    effectivenessNotes: str | None = None
    effectivenessNotesStatus: str | None = None
    # NCR formal-report fields (BACKLOG #15) — must live here (not only on
    # NCRUpdate) so they also persist when an NCR is first created.
    drawingNo: str | None = None
    specNo: str | None = None
    poContract: str | None = None
    wbs: str | None = None
    lineNo: str | None = None
    weldJointNo: str | None = None
    heatBatchNo: str | None = None
    qtyAffected: str | None = None
    qtyAffectedUnit: str | None = None
    extent: str | None = None
    costScheduleImpact: str | None = None
    requirement: str | None = None
    asFound: str | None = None
    deviation: str | None = None
    concessionNo: str | None = None
    ownerApproval: str | None = None
    ownerApprovalBy: str | None = None
    ownerApprovalDate: str | None = None
    ownerApprovalNotes: str | None = None
    rcaMethod: str | None = None
    directCause: str | None = None
    directCauseStatus: str | None = None
    recurrence: str | None = None
    recurrenceRef: str | None = None
    correctiveActionOwner: str | None = None
    correctiveActionTargetDate: str | None = None
    preventiveActionOwner: str | None = None
    preventiveActionTargetDate: str | None = None

    # Date fields: NO validator here (2026-09-20). This class is also the base of the READ schema NCR, which must return
    # stored dates untouched (a bad historical date used to make GET /ncr/ answer 500). Strict checking of NEW writes lives
    # on NCRCreate (field level) and in NCRService (final, merged content, incl. the order rules).

    @field_validator('severity', 'discipline', 'productDisposition', 'effectivenessVerified', 'ownerApproval', 'status', 'extent', 'recurrence',
                      'repairMethodStatementStatus', 'immediateCorrectionActionStatus', 'rootCauseAnalysisStatus',
                      'correctiveActionsStatus', 'preventiveActionStatus', 'effectivenessNotesStatus', 'directCauseStatus', mode='before')
    @classmethod
    def check_controlled_values(cls, v, info):
        return _validate_ncr_controlled(info.field_name, v)

    # NOTE: qtyAffected numeric-string validation intentionally lives on
    # NCRCreate/NCRUpdate (write paths) only, not here on NCRBase — the read
    # schema NCR(NCRBase) must still be able to deserialize legacy rows the
    # qty_affected-split migration flagged as "needs manual cleanup" and left
    # as unparseable free text, without crashing GET /ncr/.

    @field_validator('defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments', mode='before')
    @classmethod
    def parse_photos(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

    # (the strict order rules that used to sit here as a model_validator are now enforced on the FINAL content of a write by
    # NCRService — see core/strict_dates.py — so reading a row with an inverted order no longer raises)

class NCRCreate(NCRBase):
    id: str | None = None

    @field_validator(*strict_dates.NCR_DATE_FIELDS, mode='before')
    @classmethod
    def check_strict_dates(cls, v):
        return strict_dates.strict_date_input(v)

    @field_validator('qtyAffected', mode='before')
    @classmethod
    def check_qty_affected(cls, v):
        return validate_numeric_string(v)

class NCRUpdate(BaseModel):
    project_id: str | None = None
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
    progressPhotos: Any | None = None
    improvementPhotos: Any | None = None
    noiNumber: str | None = None
    itrNumber: str | None = None
    dueDate: str | None = None
    attachments: list[str] | None = None
    last_reminded_at: str | None = None
    referenceStandards: str | None = None
    serialNumbers: str | None = None
    repairMethodStatement: str | None = None
    repairMethodStatementStatus: str | None = None
    immediateCorrectionAction: str | None = None
    immediateCorrectionActionStatus: str | None = None
    rootCauseAnalysis: str | None = None
    rootCauseAnalysisStatus: str | None = None
    correctiveActions: str | None = None
    correctiveActionsStatus: str | None = None
    preventiveAction: str | None = None
    preventiveActionStatus: str | None = None
    finalProductIntegrityStatement: str | None = None
    reInspectionNumber: str | None = None
    projectQualityManager: str | None = None
    # NCR field-model improvements (BACKLOG #13)
    severity: str | None = None
    discipline: str | None = None
    assignedTo: int | None = None
    closedBy: int | None = None
    verifiedBy: int | None = None
    effectivenessVerified: str | None = None
    effectivenessVerifiedBy: int | None = None
    effectivenessVerifiedDate: str | None = None
    effectivenessNotes: str | None = None
    effectivenessNotesStatus: str | None = None
    # NCR formal-report fields (BACKLOG #15)
    drawingNo: str | None = None
    specNo: str | None = None
    poContract: str | None = None
    wbs: str | None = None
    lineNo: str | None = None
    weldJointNo: str | None = None
    heatBatchNo: str | None = None
    qtyAffected: str | None = None
    qtyAffectedUnit: str | None = None
    extent: str | None = None
    costScheduleImpact: str | None = None
    requirement: str | None = None
    asFound: str | None = None
    deviation: str | None = None
    concessionNo: str | None = None
    ownerApproval: str | None = None
    ownerApprovalBy: str | None = None
    ownerApprovalDate: str | None = None
    ownerApprovalNotes: str | None = None
    rcaMethod: str | None = None
    directCause: str | None = None
    directCauseStatus: str | None = None
    recurrence: str | None = None
    recurrenceRef: str | None = None
    correctiveActionOwner: str | None = None
    correctiveActionTargetDate: str | None = None
    preventiveActionOwner: str | None = None
    preventiveActionTargetDate: str | None = None

    # Date fields on UPDATE are validated by NCRService against the stored row (an unchanged resend of a historical value is
    # not a new write; the order rules run on the merged content) — a schema-level validator cannot know the stored value.

    @field_validator('severity', 'discipline', 'productDisposition', 'effectivenessVerified', 'ownerApproval', 'status', 'extent', 'recurrence',
                      'repairMethodStatementStatus', 'immediateCorrectionActionStatus', 'rootCauseAnalysisStatus',
                      'correctiveActionsStatus', 'preventiveActionStatus', 'effectivenessNotesStatus', 'directCauseStatus', mode='before')
    @classmethod
    def check_controlled_values(cls, v, info):
        return _validate_ncr_controlled(info.field_name, v)

    @field_validator('qtyAffected', mode='before')
    @classmethod
    def check_qty_affected(cls, v):
        return validate_numeric_string(v)

    @field_validator('defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments', mode='before')
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
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def date_issues(self) -> list[DateIssue]:
        """Read-only: what is wrong with the stored dates (never an error, never written back)."""
        return [DateIssue(**i) for i in strict_dates.compute_date_issues(
            self, strict_dates.NCR_DATE_FIELDS, relations=strict_dates.NCR_ORDER_RELATIONS)]


# NOI
class NOIBase(BaseModel):
    project_id: str | None = None
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
    attachments: list[Any] | None = []
    ncrNumber: str | None = None  # 若此 NOI 是針對 NCR 的重新檢驗
    last_reminded_at: str | None = None
    dueDate: str | None = None
    foundLocation: str | None = None  # §17: 具體檢驗地點（ITR 引用此處）
    discipline: str | None = None     # §17: 專業別（ITR 引用此處）

    # Date fields: no validator on the base (the READ schema NOI derives from it and must return stored dates untouched);
    # strict checking of new writes: NOICreate (field level) and NOIService (update, final content).

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
        # Disabled strict ValueError to allow reading legacy dirty data
        return self

class NOICreate(NOIBase):
    id: str | None = None

    @field_validator(*strict_dates.NOI_DATE_FIELDS, mode='before')
    @classmethod
    def check_strict_dates(cls, v):
        return strict_dates.strict_date_input(v)

class NOIUpdate(BaseModel):
    project_id: str | None = None
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
    email: str | None = None
    status: str | None = None
    remark: str | None = None
    closeoutDate: str | None = None
    attachments: list[Any] | None = None
    ncrNumber: str | None = None
    last_reminded_at: str | None = None
    dueDate: str | None = None
    foundLocation: str | None = None  # §17
    discipline: str | None = None     # §17

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
    # READ only: preserve missing legacy references without breaking the whole
    # list. NOICreate retains its required string contract.
    itpNo: str | None = None
    # READ side: the two date fields that are required for a NEW NOI may be NULL in legacy rows; they are returned as stored
    # (NULL included) and reported in `date_issues` (missing_required) instead of turning the whole list into a 500.
    issueDate: str | None = None
    inspectionDate: str | None = None
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def date_issues(self) -> list[DateIssue]:
        return [DateIssue(**i) for i in strict_dates.compute_date_issues(
            self, strict_dates.NOI_DATE_FIELDS, required=strict_dates.NOI_REQUIRED_DATE_FIELDS)]


# ITR
class ITRBase(BaseModel):
    project_id: str | None = None
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
    attachments: list[Any] | None = []
    dueDate: str | None = None
    inspectionResult: str | None = None
    preparedBy: str | None = None
    preparedAt: str | None = None
    reviewedBy: str | None = None
    reviewedAt: str | None = None
    approvedBy: str | None = None
    approvedAt: str | None = None
    isReInspection: bool = False
    reInspectionCount: int = 0
    originalItrId: str | None = None
    discipline: str | None = None

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
        # Disabled strict ValueError to allow reading legacy dirty data
        return self

class ITRCreate(ITRBase):
    id: str | None = None

class ITRRevokeApproval(BaseModel):
    """Body for POST /itr/{id}/revoke-approval — the only sanctioned way
    to leave an Approved ITR (2026-09-19 approval-authority hardening)."""
    new_status: str
    reason: str

class ITRApprovalEventSummary(BaseModel):
    """One row of an ITR's approval history (read-only). Deliberately WITHOUT the snapshots: those are
    loaded only when a single event is opened. Every value is what was stored with the event — the actor's
    id / username / full name as they were at the time, never the user's current data."""
    id: int
    itr_id: str
    document_number: str | None = None
    sequence: int
    event_type: str                       # APPROVED | REVOKED
    occurred_at: str                      # server UTC, ISO 8601 with offset
    actor_user_id: int | None = None
    actor_username: str | None = None
    actor_full_name: str | None = None
    status_before: str | None = None
    status_after: str | None = None
    reason: str | None = None
    approval_event_id: int | None = None          # REVOKED -> the APPROVED event it ends; None = unknown (never guessed)
    approval_event_sequence: int | None = None
    has_snapshot: bool = False

class ITRApprovalEventPage(BaseModel):
    items: list[ITRApprovalEventSummary]
    total: int
    skip: int
    limit: int

class ITRApprovalEventDetail(ITRApprovalEventSummary):
    itr_snapshot: dict | None = None              # the ITR row exactly as committed with the approval
    checklists_snapshot: list | None = None       # every linked Checklist instance as approved
    snapshot_sha256: str | None = None            # SHA-256 over the canonical JSON of both snapshots
    snapshot_sha256_matches: bool | None = None   # recomputed now; a content-consistency check, NOT a signature

class ITRUpdate(BaseModel):
    project_id: str | None = None
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
    attachments: list[Any] | None = None
    dueDate: str | None = None
    inspectionResult: str | None = None
    preparedBy: str | None = None
    preparedAt: str | None = None
    reviewedBy: str | None = None
    reviewedAt: str | None = None
    approvedBy: str | None = None
    approvedAt: str | None = None
    isReInspection: bool | None = None
    reInspectionCount: int | None = None
    originalItrId: str | None = None
    discipline: str | None = None
    version_no: int | None = None

    @field_validator('defectPhotos', 'improvementPhotos', 'attachments', mode='before')
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
    model_config = ConfigDict(from_attributes=True)


# PQP
class PQPBase(BaseModel):
    project_id: str | None = None
    pqpNo: str | None = None  # 由後端自動產生
    title: str
    description: str
    vendor: str | None = None
    status: str
    version: str
    createdAt: str
    updatedAt: str
    attachments: list[Any] | None = []

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
    status: str | None = 'Not Submit'
    version: str | None = 'Rev1.0'
    createdAt: str | None = ''
    updatedAt: str | None = ''

class PQPUpdate(BaseModel):
    project_id: str | None = None
    # pqpNo 不可更新（由後端自動產生，建立後不可變）
    title: str | None = None
    description: str | None = None
    vendor: str | None = None
    status: str | None = None
    version: str | None = None
    createdAt: str | None = None
    updatedAt: str | None = None
    attachments: list[Any] | None = None

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
    model_config = ConfigDict(from_attributes=True)


class PQPPublish(BaseModel):
    """Request body for publishing a new PQP revision"""
    change_summary: str | None = None


class PQPHistoryItem(BaseModel):
    id: str
    pqp_id: str
    version: str
    version_no: int
    title: str | None = None
    description: str | None = None
    status: str | None = None
    change_summary: str | None = None
    created_at: str

    model_config = ConfigDict(from_attributes=True)


# OBS
class OBSBase(BaseModel):
    project_id: str | None = None
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
    attachments: list[str] | None = None
    dueDate: str | None = None
    noiNumber: str | None = None
    itrNumber: str | None = None
    verified: str | None = None          # superseded — see engineer approvals below
    verifiedDate: str | None = None
    qualityEngineerApproval: str | None = None       # Pending / Approved / Rejected
    qualityEngineerApprovalBy: str | None = None
    qualityEngineerApprovalDate: str | None = None
    constructionEngineerApproval: str | None = None  # Pending / Approved / Rejected
    constructionEngineerApprovalBy: str | None = None
    constructionEngineerApprovalDate: str | None = None

    # Date fields: no validator on the base (the READ schema OBS derives from it); strict checking of new writes:
    # OBSCreate (field level) and OBSService (update, final content).

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
        # Disabled strict ValueError to allow reading legacy dirty data
        return self

class OBSCreate(OBSBase):
    id: str | None = None

    @field_validator(*strict_dates.OBS_DATE_FIELDS, mode='before')
    @classmethod
    def check_strict_dates(cls, v):
        return strict_dates.strict_date_input(v)

class OBSUpdate(BaseModel):
    project_id: str | None = None
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
    verified: str | None = None
    verifiedDate: str | None = None
    qualityEngineerApproval: str | None = None
    qualityEngineerApprovalBy: str | None = None
    qualityEngineerApprovalDate: str | None = None
    constructionEngineerApproval: str | None = None
    constructionEngineerApprovalBy: str | None = None
    constructionEngineerApprovalDate: str | None = None

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
    model_config = ConfigDict(from_attributes=True)

    @computed_field
    @property
    def date_issues(self) -> list[DateIssue]:
        return [DateIssue(**i) for i in strict_dates.compute_date_issues(self, strict_dates.OBS_DATE_FIELDS)]


# OSD (Over/Short/Damage Report)
class OSDBase(BaseModel):
    project_id: str | None = None
    vendor: str | None = None
    documentNumber: str | None = None  # 由後端自動產生
    status: str
    remark: str | None = None
    raiseDate: str | None = None
    closeoutDate: str | None = None
    raisedBy: str | None = None
    deliveryNoteNo: str | None = None
    poNumber: str | None = None
    itemDescription: str | None = None
    expectedQty: str | None = None
    receivedQty: str | None = None
    unit: str | None = None
    damageDescription: str | None = None
    disposition: str | None = None
    correctiveAction: str | None = None
    correctiveActionOwner: str | None = None
    correctiveActionTargetDate: str | None = None
    resolvedBy: str | None = None
    resolvedDate: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    attachments: list[str] | None = None
    dueDate: str | None = None

    @field_validator('raiseDate', 'closeoutDate', 'dueDate', 'correctiveActionTargetDate', 'resolvedDate', mode='before')
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


class OSDCreate(OSDBase):
    id: str | None = None


class OSDUpdate(BaseModel):
    project_id: str | None = None
    vendor: str | None = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    status: str | None = None
    remark: str | None = None
    raiseDate: str | None = None
    closeoutDate: str | None = None
    raisedBy: str | None = None
    deliveryNoteNo: str | None = None
    poNumber: str | None = None
    itemDescription: str | None = None
    expectedQty: str | None = None
    receivedQty: str | None = None
    unit: str | None = None
    damageDescription: str | None = None
    disposition: str | None = None
    correctiveAction: str | None = None
    correctiveActionOwner: str | None = None
    correctiveActionTargetDate: str | None = None
    resolvedBy: str | None = None
    resolvedDate: str | None = None
    defectPhotos: Any | None = None
    improvementPhotos: Any | None = None
    attachments: list[str] | None = None
    last_reminded_at: str | None = None
    dueDate: str | None = None

    @field_validator('defectPhotos', 'improvementPhotos', 'attachments', mode='before')
    @classmethod
    def parse_photos(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v


class OSD(OSDBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


class MeetingMinutesBase(BaseModel):
    project_id: str | None = None
    vendor: str | None = None
    documentNumber: str | None = None  # 由後端自動產生
    rev: str | None = None  # user-editable plain text (see BACKLOG #18)
    status: str
    title: str | None = None
    meetingType: str | None = None
    meetingDate: str | None = None
    meetingTime: str | None = None
    location: str | None = None
    organizer: str | None = None
    attendees: Any | None = None
    discussionLog: Any | None = None
    attachments: list[str] | None = None
    createdAt: str | None = None
    updatedAt: str | None = None

    @field_validator('meetingDate', mode='before')
    @classmethod
    def check_dates(cls, v):
        return validate_date_format(v)

    @field_validator('attendees', 'discussionLog', 'attachments', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v


class MeetingMinutesCreate(MeetingMinutesBase):
    id: str | None = None


class MeetingMinutesUpdate(BaseModel):
    project_id: str | None = None
    vendor: str | None = None
    # documentNumber 不可更新（由後端自動產生，建立後不可變）
    rev: str | None = None
    status: str | None = None
    title: str | None = None
    meetingType: str | None = None
    meetingDate: str | None = None
    meetingTime: str | None = None
    location: str | None = None
    organizer: str | None = None
    attendees: Any | None = None
    discussionLog: Any | None = None
    attachments: list[str] | None = None
    updatedAt: str | None = None

    @field_validator('attendees', 'discussionLog', 'attachments', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v


class MeetingMinutes(MeetingMinutesBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


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
    model_config = ConfigDict(from_attributes=True)


class ContractorOption(BaseModel):
    """A contractor as every module's picker / filter / list needs it (GET /contractors/options): no contact details,
    so it is served to any signed-in user (CONTRACTOR-OPTIONS-2026-001). `status` is returned as stored ('Active' /
    'active' / 'Inactive' all exist); the client compares it case-insensitively."""
    id: str
    name: str
    abbreviation: str | None = None
    scope: str | None = None
    status: str | None = None
    model_config = ConfigDict(from_attributes=True)


class ContractorContact(BaseModel):
    """One contractor's contact details for the NOI form's auto-fill (GET /noi/contractor-contact/{id})."""
    id: str
    contactPerson: str | None = None
    phone: str | None = None
    email: str | None = None
    model_config = ConfigDict(from_attributes=True)


# Project
# material_reply_days (MATERIAL-SUBMITTAL M1): calendar days for a material submittal's expected reply date. null = not set;
# there is no default. Strict non-negative integer — -1, 1.5, "14" and true are rejected. JSON name: materialReplyDays.
MaterialReplyDays = StrictInt | None


class ProjectBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str
    code: str | None = None
    description: str | None = None
    owner: str | None = None
    material_reply_days: MaterialReplyDays = Field(default=None, ge=0, alias="materialReplyDays")

class ProjectCreate(ProjectBase):
    id: str | None = None

class ProjectUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    name: str | None = None
    code: str | None = None
    description: str | None = None
    owner: str | None = None
    material_reply_days: MaterialReplyDays = Field(default=None, ge=0, alias="materialReplyDays")

class Project(ProjectBase):
    id: str
    created_at: str | None = None
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


# FollowUp
class FollowUpBase(BaseModel):
    project_id: str | None = None
    issueNo: str | None = None
    title: str
    description: str
    status: str
    priority: str | None = None
    assignedTo: str | None = None
    assignedToUserId: int | None = None
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
    project_id: str | None = None
    title: str | None = None
    description: str | None = None
    status: str | None = None
    priority: str | None = None
    assignedTo: str | None = None
    assignedToUserId: int | None = None
    vendor: str | None = None
    dueDate: str | None = None
    updatedAt: str | None = None
    action: str | None = None
    sourceModule: str | None = None
    sourceReferenceNo: str | None = None
    last_reminded_at: str | None = None

class FollowUp(FollowUpBase):
    id: str
    model_config = ConfigDict(from_attributes=True)


# Document Naming Rules
class NamingRuleBase(BaseModel):
    doc_type: str
    prefix: str
    sequence_digits: int


class NamingRule(NamingRuleBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

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

    model_config = ConfigDict(from_attributes=True)

# Permission
class PermissionBase(BaseModel):
    code: str
    description: str | None = None

class Permission(PermissionBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

# User
class ChecklistBase(BaseModel):
    project_id: str | None = None
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
    template_id: str | None = None  # §17: instance → 來源範本（範本本身為 NULL）

class ChecklistCreate(ChecklistBase):
    pass

class ChecklistUpdate(BaseModel):
    """Checklist 更新用 schema"""
    project_id: str | None = None
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
    template_id: str | None = None  # §17

class Checklist(ChecklistBase):
    id: str
    # Read-only provenance — never accepted on Create/Update, only ever set
    # server-side (version bumped on template edits, source_template_version
    # captured once at link_checklist time, evidence_recorded_at set once
    # the first time real evidence is saved and never cleared). See
    # models.py's Checklist comment.
    version: int | None = None
    source_template_version: int | None = None
    evidence_recorded_at: str | None = None
    evidence_recorded_at_reliable: bool | None = None
    evidence_historical_unknown: bool | None = None

    model_config = ConfigDict(from_attributes=True)

class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str | None = None
    is_active: bool | None = True
    role_id: int | None = None
    # Cosmetic-only "Name / Company" label for internal staff with no
    # vendor_id (contractor-scoped users show their real vendor name
    # instead — see User.display_company). Never affects data-isolation
    # scope, unlike vendor_id.
    company_name: str | None = None

class UserCreate(UserBase):
    password: str
    reason: str | None = None

class UserUpdate(BaseModel):
    username: str | None = None
    email: EmailStr | None = None
    full_name: str | None = None
    is_active: bool | None = None
    role_id: int | None = None
    company_name: str | None = None
    password: str | None = None
    reason: str | None = None

class User(UserBase):
    id: int
    role_name: str | None = None
    permissions: list[str] = []
    created_at: str | None = None
    # Resolved company label: the user's real vendor name if
    # contractor-scoped, else their cosmetic company_name.
    display_company: str | None = None

    model_config = ConfigDict(from_attributes=True)


class UserScope(BaseModel):
    """P0 data isolation — a user's project / contractor scope.

    Empty project_ids AND null vendor_id ⇒ unscoped (sees everything), same as
    an internal/admin user. Set project_ids (and optionally vendor_id) to confine
    an external owner/contractor login.
    """
    project_ids: list[str] = []
    vendor_id: str | None = None


# --- Audit Schemas ---
class AuditBase(BaseModel):
    project_id: str | None = None
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

    # Date fields: no validator on the base (the READ schema Audit derives from it and must return stored dates untouched —
    # the old lenient check + start-before-end rule here turned one bad row into a 500 for the whole list). Strict checking
    # of new writes: AuditCreate (field level) and AuditService (create + update, final content, incl. the order rule).

    @field_validator('selected_templates', 'custom_check_items', mode='before')
    @classmethod
    def parse_json_fields(cls, v):
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v

class AuditCreate(AuditBase):
    # Accepted for compatibility with existing callers but ignored: the server always assigns id and auditNo.
    id: str | None = None

    @field_validator(*strict_dates.AUDIT_DATE_FIELDS, mode='before')
    @classmethod
    def check_strict_dates(cls, v):
        return strict_dates.strict_date_input(v)

class AuditUpdate(BaseModel):
    project_id: str | None = None
    # Accepted for compatibility (the wizard resends the whole record) but ignored: auditNo never changes after create.
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

    model_config = ConfigDict(from_attributes=True)


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
    model_config = ConfigDict(from_attributes=True)

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
    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)

# --- Auth Schemas ---
class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str

class AuthResult(BaseModel):
    """Login/refresh response. The JWTs are delivered ONLY as httpOnly cookies
    (set via Set-Cookie); they are deliberately NOT echoed in the body so an XSS
    cannot read them. token_type is kept for client compatibility."""
    token_type: str = "bearer"

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
    project_id: str | None = None
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
    project_id: str | None = None
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

    model_config = ConfigDict(from_attributes=True)

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
    version_no: int | None = None

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

    model_config = ConfigDict(from_attributes=True)

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



    model_config = ConfigDict(from_attributes=True)


# ─── Cross-module workflow: RelatedDocuments (Phase 1 PR1) ────────────
# Response schema for `GET /{module}/{id}/related`. One flat entry per
# discovered document, ordered by BFS level. See RelatedService for the
# traversal logic and workflows.relationships for the graph definition.
class RelatedEntity(BaseModel):
    entityType: str  # 'itp' | 'noi' | 'itr' | 'ncr'
    id: str
    referenceNo: str | None = None
    title: str | None = None
    status: str | None = None
    vendorName: str | None = None
    level: int
    direction: str  # 'upstream' | 'downstream'
    primaryDate: str | None = None
    # Only ITR exposes this flag. The serializer omits it for other types
    # while preserving their existing nullable fields.
    isReInspection: bool | None = None

    @model_serializer(mode="wrap")
    def serialize_related_entity(self, handler):
        data = handler(self)
        if self.entityType != "itr":
            data.pop("isReInspection", None)
        return data

    model_config = ConfigDict(from_attributes=True)


class RelatedEntitiesResponse(BaseModel):
    upstream: list[RelatedEntity] = []
    downstream: list[RelatedEntity] = []


# ─── Cross-module workflow: Q-WorkFlow (Phase 1 PR1b v3) ─────────────
# Powers the Dashboard QWorkflowStatsCard and the /workflow page. A
# "workflow" here is a first-class ``qworkflow`` row that is created
# 1:1 alongside every NOI (see noi_service._create_qworkflow_for_noi).
# Each Q-WorkFlow has a sequential reference number
# (Q-WorkFlow-000001) and is tracked through 9 canonical checkpoints:
# NOI → W/H Inspection → NCR → MoC → Improvement → Re-Inspection →
# ITR → Close NCR → Accepted. Every checkpoint is computed from
# NOI/NCR/ITR fields; there is no manual check state. See
# WorkflowService for the rules.
class CheckpointState(BaseModel):
    key: str     # e.g. 'noi', 'wh_inspection', 'moc', ...
    state: str   # 'done' | 'current' | 'pending'
    done: bool
    # For the 5 NCR-derived checkpoints (moc/improvement/reinspection/
    # itr/close_ncr): id of the first NCR whose own per-NCR predicate
    # fails, i.e. the specific record actually holding this checkpoint
    # back. None when the checkpoint isn't NCR-derived, or when every
    # NCR already satisfies it. Lets the frontend deep-link a checkpoint
    # marker at the exact blocking record instead of guessing "first/last
    # linked NCR".
    blocking_ncr_id: str | None = None
    # Improvement checkpoint only (zero / empty everywhere else) — what its verdict rests on (2026-09-21). `blocking_reason`: why the first blocking NCR
    # blocks (missing / invalid / legacy_unverified). `verified_count`: NCRs with a valid improvement photo now. `unverified_*`: NCRs that pass ONLY
    # because they are Closed, with the underlying reason counts — their photos are NOT verified.
    blocking_reason: str | None = None
    verified_count: int = 0
    unverified_count: int = 0
    unverified_ncr_ids: list[str] = []
    unverified_reasons: dict[str, int] = {}


class WorkflowSummary(BaseModel):
    qworkflow_id: str
    reference_no: str | None = None  # Q-WorkFlow-000001
    noi_id: str | None = None
    noi_reference_no: str | None = None
    noi_package: str | None = None
    issue_date: str | None = None
    vendor_name: str | None = None
    checkpoints: list[CheckpointState]
    done_count: int
    completion_percent: int
    # NCRs of this flow that pass the improvement checkpoint WITHOUT a verified photo (Closed status only), and why. 100% never means "all verified".
    unverified_photo_count: int = 0
    unverified_photo_reasons: dict[str, int] = {}
    # Linked entity IDs so the frontend can deep-link from checkpoint
    # markers to the relevant forms. ``reinsp_itr_ids`` is the subset
    # of ITRs that satisfy (or should satisfy) the re-inspection
    # checkpoint, letting the UI jump straight at the re-insp report
    # instead of guessing based on ITR order.
    ncr_ids: list[str] = []
    itr_ids: list[str] = []
    reinsp_itr_ids: list[str] = []

    model_config = ConfigDict(from_attributes=True)


class WorkflowStats(BaseModel):
    total: int
    bucket_0_25: int
    bucket_26_50: int
    bucket_51_75: int
    bucket_76_100: int


# ── Material submittal (MATERIAL-SUBMITTAL V1) ──────────────────────────────────────────────────────────────
# New tables use snake_case columns; the API speaks camelCase (alias_generator=to_camel). Input models forbid
# unknown fields, so a client cannot set projectId on update or any server-controlled field (spec §3.7).
from pydantic.alias_generators import to_camel  # noqa: E402

_MATERIAL_TEXT_FIELDS = ("category", "brand", "model", "specification", "manufacturer", "supplier")


class _MaterialCamel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class _MaterialInput(_MaterialCamel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    @field_validator(*_MATERIAL_TEXT_FIELDS, mode="before", check_fields=False)
    @classmethod
    def _blank_to_none(cls, v):
        if isinstance(v, str):
            v = v.strip()
            return v or None
        return v

    @field_validator("name", mode="before", check_fields=False)
    @classmethod
    def _name_not_blank(cls, v):
        if v is None:
            raise ValueError("name is required")
        if not isinstance(v, str) or not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()


class MaterialCreate(_MaterialInput):
    project_id: constr(strip_whitespace=True, min_length=1)
    name: str
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    specification: str | None = None
    manufacturer: str | None = None
    supplier: str | None = None


class MaterialUpdate(_MaterialInput):
    """Every field optional; projectId is not a field, so sending it is rejected (422). name cannot be cleared."""
    name: str | None = None
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    specification: str | None = None
    manufacturer: str | None = None
    supplier: str | None = None


class Material(_MaterialCamel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: str
    project_id: str
    name: str
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    specification: str | None = None
    manufacturer: str | None = None
    supplier: str | None = None
    created_by: str | None = None
    created_at: str | None = None
    updated_by: str | None = None
    updated_at: str | None = None


class MaterialPage(_MaterialCamel):
    items: list[Material]
    total: int
    limit: int
    offset: int


# ── Material register: records (M2 tables), result history, register input (M6) ──────────────────────────────
import datetime as _dt  # noqa: E402
from typing import Literal  # noqa: E402


class MaterialResultEntryOut(_MaterialCamel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: int
    seq: int
    entry_type: str
    result_code: str
    external_decision_maker: str
    external_decision_org: str | None = None
    external_decision_title: str | None = None
    external_reply_date: str
    external_doc_no: str | None = None
    logged_by_user_id: str
    logged_by_name: str
    logged_at: str
    supersedes_entry_id: int | None = None
    superseded_by_entry_id: int | None = None
    correction_reason: str | None = None
    is_current: bool = False


class MaterialRevisionOut(_MaterialCamel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: str
    rev_no: int
    status: str
    snap_category: str | None = None
    snap_name: str | None = None
    snap_brand: str | None = None
    snap_model: str | None = None
    snap_specification: str | None = None
    snap_manufacturer: str | None = None
    snap_supplier: str | None = None
    spec_reference: str | None = None
    submitted_date: str | None = None
    expected_reply_date: str | None = None
    expected_reply_date_auto: str | None = None
    submitted_by_user_id: str | None = None
    submitted_by_name: str | None = None
    submitted_at: str | None = None
    created_by: str | None = None
    created_at: str | None = None
    result_entries: list[MaterialResultEntryOut] = []
    differs_from_material: list[str] = []


class MaterialSubmittalCard(_MaterialCamel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: str
    project_id: str
    vendor_id: str
    vendor_name: str | None = None
    material_id: str
    document_number: str
    latest_rev_no: int
    latest_status: str
    current_approved_rev_no: int | None = None
    current_approved_result: str | None = None
    material_name: str | None = None
    material_category: str | None = None
    material_brand: str | None = None
    material_model: str | None = None
    submitted_date: str | None = None
    expected_reply_date: str | None = None
    overdue: bool = False
    created_at: str | None = None
    updated_at: str | None = None


class MaterialSubmittalDetail(MaterialSubmittalCard):
    material: Material
    revisions: list[MaterialRevisionOut]


class MaterialApprovedItem(_MaterialCamel):
    """One approved material (MATERIAL-SUBMITTAL M6): the CURRENT approved revision of a submittal, as it was approved —
    the revision's snapshot, not the material master (which may have been edited since)."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    submittal_id: str
    revision_id: str
    project_id: str
    vendor_id: str
    vendor_name: str | None = None
    document_number: str
    rev_no: int
    result: str
    approved_date: str | None = None
    decision_maker: str | None = None
    external_doc_no: str | None = None
    name: str | None = None
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    specification: str | None = None
    manufacturer: str | None = None
    supplier: str | None = None
    spec_reference: str | None = None
    # shelf view (M6): the first photo's stored path (served by /api/files/download/<path>, same checks) and the photo count
    cover_photo_path: str | None = None
    photo_count: int = 0


class MaterialRegisterCreate(_MaterialInput):
    """Register an ALREADY externally approved material in one step (M6, DECISIONS 材料：只作為核准材料登錄簿).
    Required: project, contractor, name, result (Approved / ApprovedWithComments) and approval date."""
    project_id: constr(strip_whitespace=True, min_length=1)
    vendor_id: constr(strip_whitespace=True, min_length=1)
    name: str
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    specification: str | None = None
    manufacturer: str | None = None
    supplier: str | None = None
    spec_reference: str | None = None
    result_code: Literal["Approved", "ApprovedWithComments"]
    approved_date: _dt.date
    decision_maker: str | None = None
    external_doc_no: str | None = None
    # M6 R2: one id per add-material form, sent with every attempt of that form. A repeated request (lost answer, retry,
    # double click) returns the record the first one created instead of registering the material a second time.
    client_request_id: constr(pattern=r"^[A-Za-z0-9-]{8,64}$") | None = None

    @field_validator("spec_reference", "decision_maker", "external_doc_no", mode="before")
    @classmethod
    def _opt_text(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v


class MaterialRegisterUpdate(_MaterialInput):
    """Edit a registered material. Only the fields sent are changed; the project and the contractor cannot change
    (the record number carries the contractor's abbreviation). Result fields are kept as an appended correction entry."""
    name: str | None = None
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    specification: str | None = None
    manufacturer: str | None = None
    supplier: str | None = None
    spec_reference: str | None = None
    result_code: Literal["Approved", "ApprovedWithComments"] | None = None
    approved_date: _dt.date | None = None
    decision_maker: str | None = None
    external_doc_no: str | None = None

    @field_validator("name", mode="before")
    @classmethod
    def _name_not_blank(cls, v):
        if v is None:
            raise ValueError("name must not be cleared")
        if not isinstance(v, str) or not v.strip():
            raise ValueError("name must not be blank")
        return v.strip()

    @field_validator("spec_reference", "decision_maker", "external_doc_no", mode="before")
    @classmethod
    def _opt_text(cls, v):
        if isinstance(v, str):
            return v.strip() or None
        return v

    @field_validator("result_code", "approved_date", mode="before")
    @classmethod
    def _not_cleared(cls, v):
        if v is None:
            raise ValueError("required fields cannot be cleared")
        return v


class MaterialApprovedPage(_MaterialCamel):
    items: list[MaterialApprovedItem]
    total: int
    limit: int
    offset: int


class MaterialDuplicate(_MaterialCamel):
    """M6 R2: another record of the same project with the same name + brand + model (trimmed, case-insensitive)."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    submittal_id: str
    document_number: str


class MaterialDuplicates(_MaterialCamel):
    items: list[MaterialDuplicate]


class MaterialStats(_MaterialCamel):
    """M6 R2 dashboard tile: approved materials in one project, or in every project the caller can see."""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    total: int
    registered_since: int
