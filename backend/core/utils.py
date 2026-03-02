"""
Core utility functions for Qualitas backend

This module contains shared utilities used across all modules:
- JSON serialization
- Vendor ID resolution
- Reference number generation
- Audit logging
- Workflow state transition validation
"""

import json
import logging
import re
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

import models
from models import AuditLog, Contractor, DocumentNamingRule, ReferenceSequence
from core.constants import PROJECT_CODE, MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT

logger = logging.getLogger(__name__)


def sanitize_pagination(skip: int, limit: int) -> tuple[int, int]:
    """
    驗證和規範化分頁參數，防止惡意查詢

    Args:
        skip: 要跳過的記錄數
        limit: 要返回的最大記錄數

    Returns:
        tuple[int, int]: 規範化後的 (skip, limit)

    Examples:
        >>> sanitize_pagination(-10, 1000)
        (0, 500)
        >>> sanitize_pagination(20, 50)
        (20, 50)
    """
    # skip 不能為負數
    skip = max(skip, 0)

    # limit 必須在合理範圍內
    limit = max(limit, 1)  # 至少返回 1 條
    limit = min(limit, MAX_PAGE_LIMIT)  # 最多返回 MAX_PAGE_LIMIT 條

    return skip, limit


def sanitize_search_term(search: str | None) -> str | None:
    """
    Sanitize search terms for SQL LIKE/ILIKE queries by escaping special characters

    Prevents wildcard injection where user input like "100%" would match "100A", "100B", etc.

    Args:
        search: Raw search string from user input

    Returns:
        Sanitized search string with escaped SQL wildcards, or None if input is None

    Examples:
        >>> sanitize_search_term("100%")
        "100\\%"
        >>> sanitize_search_term("test_value")
        "test\\_value"
        >>> sanitize_search_term("normal search")
        "normal search"
    """
    if search is None:
        return None

    # Escape backslashes first to prevent double-escaping
    search = search.replace('\\', '\\\\')
    # Escape SQL LIKE wildcards
    search = search.replace('%', '\\%')
    search = search.replace('_', '\\_')

    return search


def _json_serialize(d: dict, list_fields: list) -> dict:
    """
    Serialize specified fields to JSON strings

    Args:
        d: Dictionary containing the data
        list_fields: List of field names to serialize

    Returns:
        Dictionary with specified fields serialized to JSON strings
    """
    d = d.copy()
    for k in list_fields:
        if k in d and d[k] is not None:
            if isinstance(d[k], (list, dict)):
                d[k] = json.dumps(d[k])
    return d


class WorkflowEngine:
    """
    工作流引擎：管理各模組的狀態轉換規則

    Workflow Engine: Manages state transition rules for all modules
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
            "Pass": ["Ongoing"],  # 允許回退修改
            "Fail": ["Ongoing"]
        }
    }

    @staticmethod
    def validate_transition(entity_type: str, current_status: str, new_status: str) -> bool:
        """
        驗證狀態轉換是否合法

        Validate if a status transition is allowed

        Args:
            entity_type: Module name (case-insensitive)
            current_status: Current status
            new_status: New status to transition to

        Returns:
            True if transition is valid, False otherwise
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
            return True  # 若無定義規則，預設允許

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

    Log audit trail for entity changes

    Args:
        db: Database session
        action: Action performed (CREATE, UPDATE, DELETE)
        entity_type: Type of entity (NCR, NOI, ITR, etc.)
        entity_id: ID of the entity
        entity_name: Name/reference number of the entity
        old_value: Previous value (for updates/deletes)
        new_value: New value (for creates/updates)
        user_id: ID of user performing the action
        username: Username of user performing the action
        reason: Reason for the action

    Note:
        Should be called within the same database transaction as the business operation.
        Commit is handled externally.
    """
    try:
        audit_log = AuditLog(
            timestamp=datetime.now().isoformat(),
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id),
            entity_name=entity_name,
            old_value=json.dumps(old_value) if old_value and isinstance(old_value, dict) else (
                old_value if isinstance(old_value, str) else None),
            new_value=json.dumps(new_value) if new_value and isinstance(new_value, dict) else (
                new_value if isinstance(new_value, str) else None),
            user_id=user_id,
            username=username,
            reason=reason
        )
        db.add(audit_log)
    except Exception as e:
        # 日誌記錄失敗不應中斷主流程，僅列印錯誤
        logger.error(f"Error logging audit: {e}", exc_info=True)


def get_contractor_abbreviation(db: Session, vendor_name: str) -> str:
    """
    根據廠商名稱取得縮寫

    Get contractor abbreviation by vendor name

    Args:
        db: Database session
        vendor_name: Vendor/contractor name

    Returns:
        Abbreviation (uppercase), or first 10 alphanumeric chars if not found, or "NA" if empty
    """
    if not vendor_name:
        return "NA"
    contractor = db.query(Contractor).filter(Contractor.name == vendor_name).first()
    if contractor and contractor.abbreviation:
        return contractor.abbreviation.upper()
    # fallback: 用名稱前 10 字元（僅保留字母數字）
    return re.sub(r'[^A-Z0-9]', '', vendor_name.upper()[:10]) or "NA"


def _resolve_vendor_id(db: Session, vendor_name: str) -> Optional[str]:
    """
    Resolve vendor name to vendor ID

    Args:
        db: Database session
        vendor_name: Vendor/contractor name

    Returns:
        Vendor ID if found, None otherwise
    """
    if not vendor_name:
        return None
    contractor = db.query(Contractor).filter(Contractor.name == vendor_name).first()
    return contractor.id if contractor else None


def generate_reference_no(db: Session, vendor_name: str, doc_type: str) -> str:
    """
    產生 Reference No

    Generate reference number with auto-incrementing sequence

    Format:
    - If DocumentNamingRule exists: Uses custom prefix and sequence digits
    - Otherwise: QTS-[VENDOR_ABBREV]-[DOC_TYPE]-[SEQUENCE]

    Args:
        db: Database session
        vendor_name: Vendor/contractor name
        doc_type: Document type (ITP, NCR, NOI, ITR, PQP, OBS, etc.)

    Returns:
        Generated reference number

    Note:
        Uses database row-level locking (with_for_update) to prevent concurrent conflicts
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
        # 第一次建立該組合
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

    # Fallback：維持舊有格式 QTS-ABBREV-DOC-000001
    seq_str = str(next_seq).zfill(6)
    return f"{PROJECT_CODE}-{vendor_abbrev}-{doc_type.upper()}-{seq_str}"
