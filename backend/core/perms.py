# Permission Constants (Enterprise Format: module:action:scope:level)

# ITP Permissions
ITP_VIEW = "itp:view:all"
ITP_CREATE = "itp:create:all"
ITP_UPDATE = "itp:update:all"
ITP_DELETE = "itp:delete:all"
ITP_APPROVE = "itp:approve:all"
ITP_VOID = "itp:void:all"

# NCR Permissions
NCR_VIEW = "ncr:view:all"
NCR_CREATE = "ncr:create:all"
NCR_UPDATE = "ncr:update:all"
NCR_DELETE = "ncr:delete:all"
NCR_APPROVE = "ncr:approve:all"
NCR_CLOSE = "ncr:close:all"

# NOI Permissions
NOI_VIEW = "noi:view:all"
NOI_CREATE = "noi:create:all"
NOI_UPDATE = "noi:update:all"
NOI_DELETE = "noi:delete:all"
NOI_APPROVE = "noi:approve:all"

# Checklist Permissions
CHECKLIST_VIEW = "checklist:view:all"
CHECKLIST_CREATE = "checklist:create:all"
CHECKLIST_UPDATE = "checklist:update:all"
CHECKLIST_DELETE = "checklist:delete:all"

# PQP Permissions
PQP_VIEW = "pqp:view:all"
PQP_CREATE = "pqp:create:all"
PQP_UPDATE = "pqp:update:all"
PQP_DELETE = "pqp:delete:all"
PQP_APPROVE = "pqp:approve:all"

# ITR Permissions
ITR_VIEW = "itr:view:all"
ITR_CREATE = "itr:create:all"
ITR_UPDATE = "itr:update:all"
ITR_DELETE = "itr:delete:all"
ITR_APPROVE = "itr:approve:all"


# FAT Permissions
FAT_VIEW = "fat:view:all"
FAT_CREATE = "fat:create:all"
FAT_UPDATE = "fat:update:all"
FAT_DELETE = "fat:delete:all"

# Audit Permissions
AUDIT_VIEW = "audit:view:all"
AUDIT_CREATE = "audit:create:all"
AUDIT_UPDATE = "audit:update:all"
AUDIT_DELETE = "audit:delete:all"

# OBS Permissions
OBS_VIEW = "obs:view:all"
OBS_CREATE = "obs:create:all"
OBS_UPDATE = "obs:update:all"
OBS_DELETE = "obs:delete:all"
OBS_APPROVE = "obs:approve:all"

# KPI Permissions
KPI_VIEW = "kpi:view:all"
KPI_UPDATE = "kpi:update:all"

# FollowUp Permissions
FOLLOWUP_VIEW = "followup:view:all"
FOLLOWUP_CREATE = "followup:create:all"
FOLLOWUP_UPDATE = "followup:update:all"
FOLLOWUP_DELETE = "followup:delete:all"

# Contractors Permissions
CONTRACTOR_VIEW = "contractors:view:all"
CONTRACTOR_MANAGE = "contractors:manage:all"

# Administrative (IAM)
USER_MANAGE = "iam:user:manage"
USER_VIEW = "iam:user:view"
ROLE_MANAGE = "iam:role:manage"
ROLE_VIEW = "iam:role:view"

# List of all permissions for seeding
ALL_PERMISSIONS = [
    {"code": ITP_VIEW, "description": "查看 ITP 記錄"},
    {"code": ITP_CREATE, "description": "建立 ITP"},
    {"code": ITP_UPDATE, "description": "更新 ITP 內容"},
    {"code": ITP_DELETE, "description": "刪除 ITP"},
    {"code": ITP_APPROVE, "description": "審核 ITP"},
    {"code": ITP_VOID, "description": "作廢 ITP"},
    
    {"code": NCR_VIEW, "description": "查看 NCR 記錄"},
    {"code": NCR_CREATE, "description": "建立 NCR"},
    {"code": NCR_UPDATE, "description": "更新 NCR 內容"},
    {"code": NCR_DELETE, "description": "刪除 NCR"},
    {"code": NCR_APPROVE, "description": "審核 NCR"},
    {"code": NCR_CLOSE, "description": "關閉 NCR"},

    {"code": NOI_VIEW, "description": "查看 NOI 記錄"},
    {"code": NOI_CREATE, "description": "建立 NOI"},
    {"code": NOI_UPDATE, "description": "更新 NOI 內容"},
    {"code": NOI_DELETE, "description": "刪除 NOI"},
    {"code": NOI_APPROVE, "description": "審核 NOI"},

    {"code": CHECKLIST_VIEW, "description": "查看 Checklist 記錄"},
    {"code": CHECKLIST_CREATE, "description": "建立 Checklist"},
    {"code": CHECKLIST_UPDATE, "description": "更新 Checklist"},
    {"code": CHECKLIST_DELETE, "description": "刪除 Checklist"},

    {"code": PQP_VIEW, "description": "查看 PQP 記錄"},
    {"code": PQP_CREATE, "description": "建立 PQP"},
    {"code": PQP_UPDATE, "description": "更新 PQP 內容"},
    {"code": PQP_DELETE, "description": "刪除 PQP"},
    {"code": PQP_APPROVE, "description": "審核 PQP"},

    {"code": CONTRACTOR_VIEW, "description": "查看 Contractors 記錄"},
    {"code": CONTRACTOR_MANAGE, "description": "管理 Contractors (增刪改)"},

    {"code": FAT_VIEW, "description": "查看 FAT 記錄"},
    {"code": FAT_CREATE, "description": "建立 FAT"},
    {"code": FAT_UPDATE, "description": "更新 FAT"},
    {"code": FAT_DELETE, "description": "刪除 FAT"},

    {"code": AUDIT_VIEW, "description": "查看 Audit 記錄"},
    {"code": AUDIT_CREATE, "description": "建立 Audit"},
    {"code": AUDIT_UPDATE, "description": "更新 Audit"},
    {"code": AUDIT_DELETE, "description": "刪除 Audit"},

    {"code": OBS_VIEW, "description": "查看 OBS 記錄"},
    {"code": OBS_CREATE, "description": "建立 OBS"},
    {"code": OBS_UPDATE, "description": "更新 OBS 內容"},
    {"code": OBS_DELETE, "description": "刪除 OBS"},
    {"code": OBS_APPROVE, "description": "審核 OBS"},

    {"code": KPI_VIEW, "description": "查看 KPI 數據"},
    {"code": KPI_UPDATE, "description": "更新 KPI 權重"},

    {"code": FOLLOWUP_VIEW, "description": "查看 Follow-up 記錄"},
    {"code": FOLLOWUP_CREATE, "description": "建立 Follow-up"},
    {"code": FOLLOWUP_UPDATE, "description": "更新 Follow-up 內容"},
    {"code": FOLLOWUP_DELETE, "description": "刪除 Follow-up"},

    {"code": ITR_VIEW, "description": "查看 ITR 記錄"},
    {"code": ITR_CREATE, "description": "建立 ITR"},
    {"code": ITR_UPDATE, "description": "更新 ITR 內容"},
    {"code": ITR_DELETE, "description": "刪除 ITR"},
    {"code": ITR_APPROVE, "description": "審核 ITR"},

    {"code": USER_VIEW, "description": "查看使用者"},
    {"code": USER_MANAGE, "description": "管理使用者 (增刪改)"},
    {"code": ROLE_VIEW, "description": "查看角色"},
    {"code": ROLE_MANAGE, "description": "管理角色權限"},
    {"code": "settings:manage:all", "description": "管理系統設定"},
]
