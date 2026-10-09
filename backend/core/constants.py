"""
Qualitas Backend 常量定義

集中管理所有業務常量，避免魔法字符串散落在代碼中
"""

# ==========================================
# 專案基本常量
# ==========================================
PROJECT_CODE = "QTS"
PROJECT_NAME = "Qualitas"


# ==========================================
# 文件類型常量
# ==========================================
class DocumentType:
    """文件類型常量"""
    ITP = "ITP"
    NCR = "NCR"
    NOI = "NOI"
    ITR = "ITR"
    PQP = "PQP"
    OBS = "OBS"
    FOLLOWUP = "FollowUp"
    CHECKLIST = "Checklist"
    FAT = "FAT"
    KM = "km"
    AUDIT = "Audit"


# ==========================================
# 工作流狀態常量
# ==========================================
class WorkflowStatus:
    """工作流狀態常量"""

    class ITP:
        """ITP 狀態"""
        DRAFT = "Draft"
        PENDING = "Pending"
        APPROVED = "Approved"
        REVISE_RESUBMIT = "Revise & Resubmit"
        VOID = "Void"

        ALL = [DRAFT, PENDING, APPROVED, REVISE_RESUBMIT, VOID]

    class PQP:
        """PQP 狀態"""
        DRAFT = "Draft"
        PENDING = "Pending"
        APPROVED = "Approved"
        REVISE_RESUBMIT = "Revise & Resubmit"
        VOID = "Void"

        ALL = [DRAFT, PENDING, APPROVED, REVISE_RESUBMIT, VOID]

    class NCR:
        """NCR 狀態"""
        OPEN = "Open"
        IN_PROGRESS = "In Progress"
        RESOLVED = "Resolved"
        CLOSED = "Closed"
        VOID = "Void"

        ALL = [OPEN, IN_PROGRESS, RESOLVED, CLOSED, VOID]

    class NOI:
        """NOI 狀態"""
        OPEN = "Open"
        IN_PROGRESS = "In Progress"
        RESOLVED = "Resolved"
        REJECT = "Reject"
        CLOSED = "Closed"
        VOID = "Void"

        ALL = [OPEN, IN_PROGRESS, RESOLVED, REJECT, CLOSED, VOID]

    class ITR:
        """ITR 狀態"""
        DRAFT = "Draft"
        SUBMITTED = "Submitted"
        APPROVED = "Approved"
        REJECTED = "Rejected"
        VOID = "Void"

        ALL = [DRAFT, SUBMITTED, APPROVED, REJECTED, VOID]

    class OBS:
        """OBS 狀態"""
        OPEN = "Open"
        IN_PROGRESS = "In Progress"
        RESOLVED = "Resolved"
        CLOSED = "Closed"
        VOID = "Void"

        ALL = [OPEN, IN_PROGRESS, RESOLVED, CLOSED, VOID]

    class Checklist:
        """Checklist 狀態"""
        ONGOING = "Ongoing"
        PASS = "Pass"
        FAIL = "Fail"

        ALL = [ONGOING, PASS, FAIL]

    class KM:
        """KM 狀態"""
        DRAFT = "Draft"
        PUBLISHED = "Published"
        ARCHIVED = "Archived"

        ALL = [DRAFT, PUBLISHED, ARCHIVED]


# ==========================================
# 審計操作類型
# ==========================================
class AuditAction:
    """審計操作類型"""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    STATUS_CHANGE = "status_change"
    APPROVE = "approve"
    REJECT = "reject"
    VOID = "void"
    RESTORE = "restore"


# ==========================================
# 用戶角色
# ==========================================
class UserRole:
    """用戶角色常量"""
    ADMIN = "Admin"
    USER = "User"
    VIEWER = "Viewer"

    ALL = [ADMIN, USER, VIEWER]


# ==========================================
# 承包商狀態
# ==========================================
class ContractorStatus:
    """承包商狀態"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"

    ALL = [ACTIVE, INACTIVE, SUSPENDED]


# ==========================================
# KM 分類
# ==========================================
class KMCategory:
    """知識管理分類"""
    GENERAL = "General"
    TECHNICAL = "Technical"
    PROCEDURE = "Procedure"
    GUIDELINE = "Guideline"
    FAQ = "FAQ"
    LESSON_LEARNED = "Lesson Learned"

    ALL = [GENERAL, TECHNICAL, PROCEDURE, GUIDELINE, FAQ, LESSON_LEARNED]


# ==========================================
# 分頁常量
# ==========================================
DEFAULT_PAGE_SKIP = 0
DEFAULT_PAGE_LIMIT = 100
MAX_PAGE_LIMIT = 500


# ==========================================
# 文件上傳常量
# ==========================================
MAX_UPLOAD_SIZE_MB = 10
ALLOWED_FILE_EXTENSIONS = [
    ".pdf", ".doc", ".docx",
    ".xls", ".xlsx",
    ".jpg", ".jpeg", ".png", ".gif",
    ".zip", ".rar",
    ".txt", ".csv"
]


# ==========================================
# 日期格式常量
# ==========================================
DATE_FORMAT = "%Y-%m-%d"
DATETIME_FORMAT = "%Y-%m-%d %H:%M:%S"
DATE_FORMAT_DISPLAY = "YYYY-MM-DD"
DATETIME_FORMAT_DISPLAY = "YYYY-MM-DD HH:mm:ss"


# ==========================================
# 錯誤訊息常量
# ==========================================
class ErrorMessage:
    """錯誤訊息常量"""
    NOT_FOUND = "{} not found"
    ALREADY_EXISTS = "{} already exists"
    INVALID_STATUS_TRANSITION = "Invalid status transition from {} to {}"
    PERMISSION_DENIED = "Permission denied"
    INVALID_INPUT = "Invalid input: {}"
    DATABASE_ERROR = "Database error: {}"
    VALIDATION_ERROR = "Validation error: {}"


# ==========================================
# 成功訊息常量
# ==========================================
class SuccessMessage:
    """成功訊息常量"""
    CREATED = "{} created successfully"
    UPDATED = "{} updated successfully"
    DELETED = "{} deleted successfully"
    STATUS_CHANGED = "Status changed to {}"
