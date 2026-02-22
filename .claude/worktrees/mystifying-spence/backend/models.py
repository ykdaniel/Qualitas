from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from database import Base

class ITP(Base):
    __tablename__ = "itp"

    id = Column(String, primary_key=True, index=True)
    vendor = Column(String, ForeignKey("contractors.name"), index=True)
    referenceNo = Column(String, index=True, unique=True)  # 由後端自動產生
    description = Column(String, nullable=True)
    rev = Column(String, nullable=True)
    submit = Column(String, nullable=True)
    status = Column(String)
    remark = Column(String, nullable=True)
    hasDetails = Column(Boolean, default=False)
    submissionDate = Column(String, nullable=True)
    detail_data = Column(Text, nullable=True)  # JSON: { a: [], b: [], c: [] }
    attachments = Column(Text, nullable=True)
    last_reminded_at = Column(String, nullable=True)
    dueDate = Column(String, nullable=True)

    # Relationships
    vendor_ref = relationship("Contractor", back_populates="itps")
    nois = relationship("NOI", back_populates="itp_ref")


class NCR(Base):
    __tablename__ = "ncr"

    id = Column(String, primary_key=True, index=True)
    vendor = Column(String, ForeignKey("contractors.name"), index=True)
    documentNumber = Column(String, index=True, unique=True)  # 由後端自動產生
    description = Column(String, nullable=True)
    rev = Column(String, nullable=True)
    submit = Column(String, nullable=True)
    status = Column(String)
    remark = Column(String, nullable=True)
    hasDetails = Column(Boolean, default=False)
    raiseDate = Column(String, nullable=True)
    closeoutDate = Column(String, nullable=True)
    aconex = Column(String, nullable=True)
    type = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    foundBy = Column(String, nullable=True)
    raisedBy = Column(String, nullable=True)
    foundLocation = Column(String, nullable=True)
    productDisposition = Column(String, nullable=True)
    productIntegrityRelated = Column(String, nullable=True)
    permanentProductDeviation = Column(String, nullable=True)
    impactToOM = Column(String, nullable=True)
    defectPhotos = Column(Text, nullable=True)  # JSON array as string
    improvementPhotos = Column(Text, nullable=True)
    noiNumber = Column(String, ForeignKey("noi.referenceNo"), nullable=True)
    dueDate = Column(String, nullable=True)  # 到期日 (YYYY-MM-DD)
    attachments = Column(Text, nullable=True)
    last_reminded_at = Column(String, nullable=True)

    # Relationships
    vendor_ref = relationship("Contractor", back_populates="ncrs")
    noi_ref = relationship("NOI", back_populates="ncrs")


class FollowUp(Base):
    __tablename__ = "followup"

    id = Column(String, primary_key=True, index=True)
    issueNo = Column(String, index=True, unique=True)
    title = Column(String)
    description = Column(String)
    status = Column(String)
    priority = Column(String, nullable=True)
    assignedTo = Column(String, nullable=True)
    vendor = Column(String, ForeignKey("contractors.name"), nullable=True, index=True) # 關聯廠商
    dueDate = Column(String, nullable=True)
    createdAt = Column(String)
    updatedAt = Column(String)
    action = Column(Text, nullable=True)
    sourceModule = Column(String, nullable=True)  # 來源模組：NCR, OBS, NOI, ITR 等
    sourceReferenceNo = Column(String, nullable=True)  # 來源單號
    last_reminded_at = Column(String, nullable=True)

    # Relationships
    vendor_ref = relationship("Contractor", back_populates="followups")


class NOI(Base):
    __tablename__ = "noi"

    id = Column(String, primary_key=True, index=True)
    package = Column(String, index=True)
    referenceNo = Column(String, index=True, unique=True)
    issueDate = Column(String)
    inspectionTime = Column(String)
    itpNo = Column(String, ForeignKey("itp.referenceNo"), index=True)  # 連結到 ITP referenceNo
    eventNumber = Column(String, nullable=True)
    checkpoint = Column(String, nullable=True)
    inspectionDate = Column(String)
    type = Column(String)
    contractor = Column(String, ForeignKey("contractors.name"), index=True)
    contacts = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    status = Column(String, nullable=True)
    remark = Column(String, nullable=True)
    closeoutDate = Column(String, nullable=True)
    attachments = Column(Text, nullable=True)  # JSON array as string
    ncrNumber = Column(String, nullable=True, index=True)  # 若此 NOI 是針對 NCR 的重新檢驗
    last_reminded_at = Column(String, nullable=True)
    dueDate = Column(String, nullable=True)

    # Relationships
    itp_ref = relationship("ITP", back_populates="nois")
    vendor_ref = relationship("Contractor", back_populates="nois")
    ncrs = relationship("NCR", back_populates="noi_ref")
    itrs = relationship("ITR", back_populates="noi_ref")
    checklists = relationship("Checklist", back_populates="noi_ref")


class ITR(Base):
    __tablename__ = "itr"

    id = Column(String, primary_key=True, index=True)
    vendor = Column(String, ForeignKey("contractors.name"), index=True)
    documentNumber = Column(String, index=True, unique=True)
    description = Column(String)
    rev = Column(String)
    submit = Column(String)
    status = Column(String)
    remark = Column(String, nullable=True)
    hasDetails = Column(Boolean, default=False)
    raiseDate = Column(String, nullable=True)
    closeoutDate = Column(String, nullable=True)
    aconex = Column(String, nullable=True)
    type = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    ncrNumber = Column(String, nullable=True, index=True)  # 若檢驗失敗，連結到產生的 NCR
    raisedBy = Column(String, nullable=True)
    foundLocation = Column(String, nullable=True)
    noiNumber = Column(String, ForeignKey("noi.referenceNo"), nullable=True, index=True)  # 連結到產生此 ITR 的 NOI
    eventNumber = Column(String, nullable=True)
    checkpoint = Column(String, nullable=True)
    defectPhotos = Column(Text, nullable=True)
    improvementPhotos = Column(Text, nullable=True)
    attachments = Column(Text, nullable=True)
    last_reminded_at = Column(String, nullable=True)
    dueDate = Column(String, nullable=True)

    # Relationships
    vendor_ref = relationship("Contractor", back_populates="itrs")
    noi_ref = relationship("NOI", back_populates="itrs")


class PQP(Base):
    __tablename__ = "pqp"

    id = Column(String, primary_key=True, index=True)
    pqpNo = Column(String, index=True, unique=True)
    title = Column(String)
    description = Column(String)
    vendor = Column(String, ForeignKey("contractors.name"), index=True)
    status = Column(String)
    version = Column(String)
    createdAt = Column(String)
    updatedAt = Column(String)
    attachments = Column(Text, nullable=True)

    # Relationships
    vendor_ref = relationship("Contractor", back_populates="pqps")


class OBS(Base):
    __tablename__ = "obs"

    id = Column(String, primary_key=True, index=True)
    vendor = Column(String, ForeignKey("contractors.name"), index=True)
    documentNumber = Column(String, index=True, unique=True)
    description = Column(String)
    rev = Column(String)
    submit = Column(String)
    status = Column(String)
    remark = Column(String, nullable=True)
    hasDetails = Column(Boolean, default=False)
    raiseDate = Column(String, nullable=True)
    closeoutDate = Column(String, nullable=True)
    aconex = Column(String, nullable=True)
    type = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    foundBy = Column(String, nullable=True)
    raisedBy = Column(String, nullable=True)
    foundLocation = Column(String, nullable=True)
    productDisposition = Column(String, nullable=True)
    productIntegrityRelated = Column(String, nullable=True)
    permanentProductDeviation = Column(String, nullable=True)
    impactToOM = Column(String, nullable=True)
    defectPhotos = Column(Text, nullable=True)
    improvementPhotos = Column(Text, nullable=True)
    attachments = Column(Text, nullable=True)
    last_reminded_at = Column(String, nullable=True)
    dueDate = Column(String, nullable=True)

    # Relationships
    vendor_ref = relationship("Contractor", back_populates="obss")


class Contractor(Base):
    __tablename__ = "contractors"

    id = Column(String, primary_key=True, index=True)
    package = Column(String, nullable=True)
    name = Column(String, index=True, unique=True)
    abbreviation = Column(String, nullable=True)
    scope = Column(String, nullable=True)
    contactPerson = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(String, nullable=True)
    status = Column(String, default="active")

    # Relationships
    itps = relationship("ITP", back_populates="vendor_ref")
    ncrs = relationship("NCR", back_populates="vendor_ref")
    nois = relationship("NOI", back_populates="vendor_ref")
    itrs = relationship("ITR", back_populates="vendor_ref")
    pqps = relationship("PQP", back_populates="vendor_ref")
    obss = relationship("OBS", back_populates="vendor_ref")
    followups = relationship("FollowUp", back_populates="vendor_ref")


class ReferenceSequence(Base):
    """序號表：用於自動產生 Reference No，以 (project, vendor, doc) 為 key 各自累加"""
    __tablename__ = "reference_sequences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project = Column(String, nullable=False, index=True)  # 固定 QTS
    vendor = Column(String, nullable=False, index=True)   # 廠商縮寫 (abbreviation)
    doc = Column(String, nullable=False, index=True)      # NOI/ITR/NCR/OBS/ITP/PQP
    last_seq = Column(Integer, nullable=False, default=0) # 目前已發到的最大序號


class DocumentNamingRule(Base):
    """
    文件命名規則：
    - 依 doc_type（模組別）定義前綴與流水號位數
    - 前綴中可使用 [ABBREV] 代表廠商縮寫
    """
    __tablename__ = "document_naming_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    doc_type = Column(String, nullable=False, unique=True, index=True)  # itp/noi/itr/ncr/obs/pqp/followup/fat
    prefix = Column(String, nullable=False)                             # 例如 QTS-[ABBREV]-ITP-
    sequence_digits = Column(Integer, nullable=False, default=6)        # 流水號位數 1~6

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    role_id = Column(Integer, ForeignKey("roles.id"), index=True, nullable=True)  # 加入外鍵約束
    created_at = Column(String, nullable=True)

class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    description = Column(String, nullable=True)
    permissions = Column(Text, nullable=True)  # JSON list of permission codes

class Audit(Base):
    __tablename__ = "audits"

    id = Column(String, primary_key=True, index=True)
    auditNo = Column(String, index=True)
    title = Column(String)
    date = Column(String)
    auditor = Column(String)
    status = Column(String)
    location = Column(String)
    findings = Column(String)
    contractor = Column(String, nullable=True)


class Checklist(Base):
    __tablename__ = "checklist"

    id = Column(String, primary_key=True, index=True)
    recordsNo = Column(String, index=True, unique=True)
    activity = Column(String, index=True)
    date = Column(String)
    status = Column(String)
    packageName = Column(String, index=True)
    location = Column(String, nullable=True)
    itpIndex = Column(Integer)
    detail_data = Column(Text, nullable=True) # JSON 數據
    noiNumber = Column(String, ForeignKey("noi.referenceNo"), nullable=True, index=True)

    # Relationships
    noi_ref = relationship("NOI", back_populates="checklists")

# 審計日誌 - 記錄所有 CRUD 操作
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    timestamp = Column(String, nullable=False)  # ISO 格式時間戳
    user_id = Column(Integer, nullable=True)  # 操作使用者 ID
    username = Column(String, nullable=True)  # 操作使用者名稱（快取）
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE
    entity_type = Column(String, nullable=False, index=True)  # ITP, NCR, NOI, User, etc.
    entity_id = Column(String, nullable=False, index=True)  # 被操作實體的 ID
    entity_name = Column(String, nullable=True)  # 實體名稱/描述（方便查閱）
    old_value = Column(Text, nullable=True)  # 修改前的 JSON（UPDATE/DELETE 時記錄）
    new_value = Column(Text, nullable=True)  # 修改後的 JSON（CREATE/UPDATE 時記錄）
    ip_address = Column(String, nullable=True)  # 操作者 IP
    details = Column(Text, nullable=True)  # 額外資訊


# 目前透過遷移腳本新增 is_deleted 和 deleted_at 欄位


class KPIWeight(Base):
    __tablename__ = "kpi_weights"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    pqp_weight = Column(Integer, default=25)
    itp_weight = Column(Integer, default=25)
    obs_weight = Column(Integer, default=25)
    ncr_weight = Column(Integer, default=25)
    updated_at = Column(String, nullable=True)


class OwnerPerformance(Base):
    """業主績效追蹤模型"""
    __tablename__ = "owner_performance"

    id = Column(String, primary_key=True, index=True)
    owner_name = Column(String, index=True)
    month = Column(String, index=True)  # YYYY-MM
    score = Column(Integer, default=0)
    details = Column(Text, nullable=True)  # JSON blob
    updated_at = Column(String, nullable=True)


class Attachment(Base):
    """
    集中式附件管理模型
    - 透過 entity_type + entity_id 實現多態關聯，可掛載到任何模組
    - 檔案實體存放於 uploads/ 目錄，此表僅記錄 metadata
    """
    __tablename__ = "attachments"

    id = Column(String, primary_key=True, index=True)
    entity_type = Column(String, nullable=False, index=True)   # itp / ncr / noi / itr / pqp / obs
    entity_id = Column(String, nullable=False, index=True)     # 關聯模組記錄的 ID
    file_name = Column(String, nullable=False)                 # 原始檔案名稱
    file_path = Column(String, nullable=False)                 # 磁碟儲存相對路徑
    file_size = Column(Integer, nullable=True)                 # 檔案大小 (bytes)
    mime_type = Column(String, nullable=True)                  # MIME 類型
    category = Column(String, default="attachment")            # attachment / defectPhoto / improvementPhoto
    uploaded_by = Column(String, nullable=True)                # 上傳者使用者名稱
    uploaded_at = Column(String, nullable=False)               # ISO 格式時間戳
    is_deleted = Column(Boolean, default=False, index=True)    # 軟刪除標記
