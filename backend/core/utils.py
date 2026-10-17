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
import threading
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from models import AuditLog, Contractor, DocumentNamingRule, Project, ReferenceSequence
from core.constants import COMPANY_CODE, PROJECT_CODE, SHARED_CODE, SYSTEM_CODE, MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT

logger = logging.getLogger(__name__)

# Process-wide lock for reference-number allocation.
#
# Why this exists: generate_reference_no uses `.with_for_update()` to
# serialise concurrent callers at the database level. That works on
# PostgreSQL/MySQL, but SQLite silently ignores FOR UPDATE, so on SQLite
# two threads can read the same last_seq and produce duplicate refs.
#
# Holding this lock around the read-modify-write serialises callers within
# a single Python process, which is the production topology (single uvicorn
# worker behind nginx). It does NOT protect a multi-worker deployment; for
# that you must either move to Postgres (so FOR UPDATE actually locks) or
# add a cross-process lock such as a file lock or Redis lock.
_reference_seq_lock = threading.Lock()


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
            "Pending": ["Approved", "Approved with comments", "Revise & Resubmit", "Void"],
            "Approved": ["Approved with comments", "Void", "Pending"],
            "Approved with comments": ["Pending", "Revise & Resubmit", "Void"],
            "Revise & Resubmit": ["Pending", "Void"],
            "Void": []
        },
        "PQP": {
            # Canonical workflow
            "Not Submit": ["Under Review", "Void"],
            "Under Review": ["Approved", "Reject", "Revise & Resubmit", "Void"],
            "Approved": ["Under Review", "Void"],
            "Reject": ["Not Submit", "Void"],
            "Revise & Resubmit": ["Not Submit", "Under Review", "Void"],
            "Void": []
        },
        "NCR": {
            # Status is *derived* (see deriveNCRStatus in ncrFormSchema.ts) from
            # two independent live signals — effectivenessVerified and
            # ownerApproval — not advanced through discrete user actions. Any
            # combination of those two fields can be dialed to any other on a
            # single save (e.g. owner un-rejects while effectiveness is still
            # Pending: In Progress -> Open), so this isn't a linear workflow the
            # way ITP/PQP are. Every non-Void state is reachable from every
            # other non-Void state; only Void stays a one-way terminal sink —
            # nothing (including re-deriving from those two fields) can produce
            # a value that would need to leave Void automatically.
            "Open": ["In Progress", "Resolved", "Closed", "Void"],
            "In Progress": ["Open", "Resolved", "Closed", "Void"],
            "Resolved": ["Open", "In Progress", "Closed", "Void"],
            "Closed": ["Open", "In Progress", "Resolved", "Void"],
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
            "In Progress": ["Approved", "Reject", "Void"],
            "Approved": ["In Progress", "Void"],
            "Reject": ["In Progress", "Approved", "Void"],
            "Void": []
        },
        "OBS": {
            # Compatible with both simple UI statuses and legacy workflow data
            "Open": ["In Progress", "Resolved", "Closed", "Void"],
            "In Progress": ["Resolved", "Closed", "Open", "Void"],
            "Resolved": ["Closed", "Open", "Void"],
            "Closed": ["Open", "Void"],
            "Void": []
        },
        "OSD": {
            "Open": ["Resolved", "Closed", "Void"],
            "Resolved": ["Closed", "Open", "Void"],
            "Closed": ["Open", "Void"],
            "Void": []
        },
        "MeetingMinutes": {
            # Published is otherwise a dead end — a distributed meeting
            # record must not be silently rewritten after the fact (see
            # meeting_minutes_service.py's lock guard) — except Void, the
            # one escape valve every terminal-ish state in this app allows
            # (mirrors NOI's "Void reachable from everywhere" shape). Void
            # itself is a true one-way sink: nothing reopens it.
            "Draft": ["Published", "Void"],
            "Published": ["Void"],
            "Void": []
        },
        "Checklist": {
            "Ongoing": ["Pass", "Fail"],
            "Pass": ["Ongoing"],  # 允許回退修改
            "Fail": ["Ongoing"]
        },
        "FollowUp": {
            "Open": ["In Progress", "Closed", "Void"],
            "In Progress": ["Closed", "Void"],
            "Closed": [],
            "Void": []
        },
        "Audit": {
            "Draft": ["Planned", "Void"],
            "Planned": ["In Progress", "Draft", "Void"],
            "In Progress": ["Completed", "Void"],
            "Completed": ["Closed", "In Progress", "Void"],
            "Closed": [],
            "Void": []
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


def lock_itr_for_write(db: Session, itr_id: str) -> None:
    """Take the write lock for everything that decides or changes an ITR's
    approval-relevant state, BEFORE reading it.

    Approving an ITR is check-then-write over several rows (the ITR, all its
    linked Checklist instances): "are they all Pass?", "snapshot them", "set
    Approved". A concurrent Checklist edit / link / unlink that had already
    passed its own "parent ITR is not Approved" check could otherwise commit
    between those steps and leave an approval whose snapshot differs from what
    was checked (or a checklist changed behind an Approved ITR). Every such
    writer therefore calls this first and RE-READS afterwards.

    SQLite has one writer at a time, but nothing is held across plain SELECTs,
    so a no-op UPDATE starts the write transaction (a concurrent writer waits
    here until the holder commits or rolls back). Elsewhere, a row lock on the
    ITR. The caller must commit or roll back to release it."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("UPDATE itr SET id = id WHERE id = :i"), {"i": itr_id})
    else:
        db.query(models.ITR).filter(models.ITR.id == itr_id).with_for_update().first()


def begin_write_transaction(db: Session) -> None:
    """Start the write transaction NOW, before anything is read, for a create that must read-then-write shared
    state (a reference-number sequence, MAX+1 numbering) and commit it together with the record.

    SQLite has one writer at a time and pysqlite starts a transaction only at the first INSERT/UPDATE, so two
    creators could both read the same "next number" and one would then fail to upgrade to a writer. A no-op UPDATE
    (matches no row) takes the write lock up front; a concurrent creator waits here until the holder commits or
    rolls back. On other databases the sequence row is locked by generate_reference_no (`FOR UPDATE`), so nothing
    is needed. The caller must commit or roll back to release it."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("UPDATE reference_sequences SET id = id WHERE 0"))


def lock_ncr_for_write(db: Session, ncr_id: str) -> None:
    """Take the write lock for an NCR change BEFORE reading anything the change is decided on (2026-09-21).

    Closing an NCR is check-then-write: "does it have a valid improvement photo?" and then "set Closed". A photo deleted between those two steps
    would leave a Closed NCR with no evidence. Every writer of that evidence — this update and the attachment delete (which takes the same
    lock and then RE-READS what it decides on) — is serialised through it. SQLite has one writer at a time, but nothing is held across plain
    SELECTs, so a no-op UPDATE starts the write transaction; elsewhere the NCR row is locked FOR UPDATE. The caller commits or rolls back."""
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("UPDATE ncr SET id = id WHERE id = :i"), {"i": ncr_id})
    else:
        db.query(models.NCR).filter(models.NCR.id == ncr_id).with_for_update().first()


def reload_locked(db: Session, obj) -> bool:
    """Re-read `obj` from the database right after taking the ITR write lock.

    Returns False when the row no longer exists: another request held the lock first and DELETED it
    (e.g. an ITR delete racing an approval, a checklist save or a link). The caller then treats the
    record as not found and rolls back to release the lock — never a 500 from a refresh of a
    vanished row."""
    from sqlalchemy.exc import InvalidRequestError       # ObjectDeletedError and "could not refresh instance"
    try:
        db.refresh(obj)
        return True
    except InvalidRequestError:
        return False


def log_audit(db: Session, action: str, entity_type: str, entity_id: str,
              entity_name: str = None, old_value: dict = None, new_value: dict = None,
              user_id: int = None, username: str = None, reason: str = None,
              strict: bool = False):
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
        strict: if True, a failure building/queuing the audit entry is
            RE-RAISED instead of swallowed. Default False preserves this
            function's normal "never let audit logging block the main
            operation" behavior for every other call site. Use strict=True
            only for an action where the audit trail is itself the safety
            control (e.g. revoking an approval) — the caller must still
            commit in the same transaction as its own state change and
              roll back on any failure for this to actually guarantee
            atomicity (see itr_service.py::revoke_itr_approval).

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
        # 日誌記錄失敗不應中斷主流程，僅列印錯誤 (default) — but some
        # callers need the opposite guarantee; see `strict` above.
        logger.error(f"Error logging audit: {e}", exc_info=True)
        if strict:
            raise


def log_status_change(db: Session, entity_type: str, entity_id: str, entity_name: str,
                      old_status: str, new_status: str, user_id: int = None,
                      username: str = None, reason: str = None):
    """
    Log status change operations with enhanced tracking.

    This is a convenience wrapper around log_audit specifically for status changes,
    which are critical workflow transitions that need special tracking.

    Args:
        db: Database session
        entity_type: Type of entity (ITP, NCR, NOI, ITR, etc.)
        entity_id: ID of the entity
        entity_name: Name/reference number of the entity
        old_status: Previous status
        new_status: New status
        user_id: ID of user performing the change
        username: Username of user performing the change
        reason: Reason for the status change

    Example:
        log_status_change(
            db, "ITP", itp.id, itp.referenceNo,
            "Draft", "Pending", user_id=1, username="admin",
            reason="Submitted for review"
        )
    """
    log_audit(
        db,
        action="STATUS_CHANGE",
        entity_type=entity_type,
        entity_id=entity_id,
        entity_name=entity_name,
        old_value={"status": old_status},
        new_value={"status": new_status},
        user_id=user_id,
        username=username,
        reason=reason or f"Status changed from '{old_status}' to '{new_status}'"
    )


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


# The type part of a number when no naming rule names one (the defaults of routers/settings.DEFAULT_NAMING_RULES).
_DOC_LABELS = {"ITP": "ITP", "NOI": "NOI", "ITR": "ITR", "NCR": "NCR", "OBS": "OBS", "PQP": "PQP", "FOLLOWUP": "FUI",
               "FAT": "FAT", "AUDIT": "AUD", "CHECKLIST": "CHK", "OSD": "OSD", "MEETING": "MOM", "MSA": "MSA"}
# Numbered without a project: a shared template's number uses SHARED_CODE. Every other type must belong to a project
# before it gets a number (REF-PROJECT-SEQ-2026-001 B4, D-B4-1: QWORKFLOW included).
SHARED_TEMPLATE_TYPES = frozenset({"ITP", "CHECKLIST"})
_UNSET = object()


def numbering_code(db: Session, project_id: Optional[str]) -> str:
    """The code a number carries for this project (REF-PROJECT-SEQ-2026-001 B3, D2): the project's own code, or
    SHARED_CODE ("STD") for a shared template that belongs to no project. A project without a code cannot number
    anything (400 PROJECT_CODE_MISSING) — an administrator gives it one first (D14)."""
    if project_id is None:
        return SHARED_CODE
    project = db.query(Project).filter(Project.id == project_id).first()
    code = ((project.code if project else None) or "").strip().upper()
    if not code:
        from core.refusals import RefusalHTTPException
        raise RefusalHTTPException(400, "This project has no project code yet; a system administrator must set one before "
                                        "documents can be numbered in it.", "PROJECT_CODE_MISSING")
    return code


def _reference_format(db: Session, doc_type: str, project_id: Optional[str]):
    """(sequence project key, prefix, sequence digits) for numbering `doc_type` in `project_id` (None: shared).

    Format QTS-RKS-[PROJECT]-<TYPE>-###### (D2): a naming rule's prefix with [PROJECT] replaced by the project code;
    a rule that has no [PROJECT] (not yet migrated) or no rule at all falls back to the default format — never to a
    number without the project. The sequence key is (project id or "STD", "*", doc type): one counter per project and
    type, shared by every contractor (D2). Without a project only a shared template (SHARED_TEMPLATE_TYPES) is
    numbered — STD is theirs; any other type is refused (400 NUMBERING_PROJECT_REQUIRED, B4)."""
    if project_id is None and doc_type.upper() not in SHARED_TEMPLATE_TYPES:
        from core.refusals import RefusalHTTPException
        label = _DOC_LABELS.get(doc_type.upper(), doc_type.upper())
        raise RefusalHTTPException(400, f"A {label} must belong to a project before it can be numbered; only shared ITP "
                                        "and Checklist templates are numbered without one.",
                                   "NUMBERING_PROJECT_REQUIRED", {"docType": label})
    code = numbering_code(db, project_id)
    if doc_type.upper() == "QWORKFLOW":
        # The NOI's tracker row: Q-WorkFlow-<code>-###### (user's decision 2026-10-14), no naming rule. Earlier global
        # numbers (Q-WorkFlow-000001) keep their number and never collide with this prefix.
        return project_id, f"Q-WorkFlow-{code}-", 6
    rule = db.query(DocumentNamingRule).filter(DocumentNamingRule.doc_type == doc_type.lower()).first()
    if rule and rule.prefix and "[PROJECT]" in rule.prefix:
        return (project_id or SHARED_CODE), rule.prefix.replace("[PROJECT]", code), (rule.sequence_digits or 6)
    label = _DOC_LABELS.get(doc_type.upper(), doc_type.upper())
    return (project_id or SHARED_CODE), f"{SYSTEM_CODE}-{COMPANY_CODE}-{code}-{label}-", 6


def _next_sequence(db: Session, doc_type: str, seq_key: str, prefix: str, take: bool) -> int:
    doc_type = doc_type.upper()             # one counter per type, whatever case a caller spells it in ('meeting', 'audit')
    seq_record = db.query(ReferenceSequence).filter(
        ReferenceSequence.project == seq_key,
        ReferenceSequence.vendor == "*",
        ReferenceSequence.doc == doc_type,
    ).with_for_update().first()
    # Self-heal: never below the highest number already stored under this prefix (imports, older counters)
    next_seq = max(seq_record.last_seq if seq_record else 0, _max_existing_seq(db, doc_type, prefix)) + 1
    if take:
        if seq_record:
            seq_record.last_seq = next_seq
        else:
            db.add(ReferenceSequence(project=seq_key, vendor="*", doc=doc_type, last_seq=next_seq))
        db.flush()
    return next_seq


def generate_reference_no(db: Session, vendor_name: str, doc_type: str, project_id=_UNSET) -> str:
    """
    產生 Reference No — the next number of `doc_type` in a project (REF-PROJECT-SEQ-2026-001 B3, D1 / D2).

    `project_id` is required (keyword): the project the record belongs to, or None for a shared template (ITP /
    Checklist template), numbered QTS-RKS-STD-<TYPE>-. `vendor_name` is kept for the callers' signature; the number no
    longer carries the contractor.

    Concurrency: the caller holds the write lock (begin_write_transaction) on SQLite; the sequence row is locked
    FOR UPDATE elsewhere; `_reference_seq_lock` serialises callers within one process.
    """
    if project_id is _UNSET:
        raise TypeError("generate_reference_no() needs project_id= (the record's project, or None for a shared template)")
    seq_key, prefix, digits = _reference_format(db, doc_type, project_id)
    with _reference_seq_lock:
        return f"{prefix}{str(_next_sequence(db, doc_type, seq_key, prefix, take=True)).zfill(digits)}"


def preview_reference_no(db: Session, doc_type: str, project_id: Optional[str]) -> str:
    """The number generate_reference_no() WOULD hand out right now, without taking it (nothing written). Shown to the
    user as "expected" — someone else creating a record of the same type in the same project first moves it on."""
    seq_key, prefix, digits = _reference_format(db, doc_type, project_id)
    return f"{prefix}{str(_next_sequence(db, doc_type, seq_key, prefix, take=False)).zfill(digits)}"


def reference_pattern(db: Session, doc_type: str, project_id: Optional[str]) -> str:
    """The number's format with the sequence masked, e.g. QTS-RKS-HL-NOI-######."""
    _, prefix, digits = _reference_format(db, doc_type, project_id)
    return prefix + "#" * digits


def reclaim_reference_no(db: Session, doc_type: str, project_id: Optional[str]) -> bool:
    """
    Best-effort "give back" reference number(s) after a record is deleted while still a Draft — i.e. it was never
    published/shared, so nobody could have referenced its number externally (BACKLOG 2026-08-31; NOT for
    Published/Void records). Call AFTER the row is deleted and committed: resyncs the project's counter DOWN to the
    real current max among the remaining rows (0 when none remain); a newer record past the deleted one keeps the gap.

    Returns True if the counter actually moved down, False otherwise.
    """
    seq_key, prefix, _digits = _reference_format(db, doc_type, project_id)
    with _reference_seq_lock:
        seq_record = db.query(ReferenceSequence).filter(
            ReferenceSequence.project == seq_key,
            ReferenceSequence.vendor == "*",
            ReferenceSequence.doc == doc_type.upper(),
        ).with_for_update().first()
        if not seq_record:
            return False
        actual_max = _max_existing_seq(db, doc_type, prefix)
        if actual_max >= seq_record.last_seq:
            return False
        seq_record.last_seq = actual_max
        db.flush()
        return True


def continue_counters_from_legacy_abbreviation(db: Session, project_id: str, code: str) -> dict:
    """Start a project's counters after the numbers an old contractor abbreviation equal to its code already reached
    (REF-PROJECT-SEQ-2026-001 B4, B3 R1 P3-9).

    Before batch 3 a counter was keyed (QTS, <contractor abbreviation>, <type>) and its numbers read
    QTS-RKS-<abbreviation>-<TYPE>-. A project whose code equals such an abbreviation shares that text, so its own
    counter (project id, '*', TYPE) must never hand out a number the abbreviation already used — including numbers
    whose records were deleted since, which self-heal (the highest number still stored) cannot see. Migration step 29
    did this once for the projects that had a code then; this does the same for a project created or recoded later.
    Counters only ever move up. The caller commits. Returns {TYPE: last_seq} for the counters it moved.

    Unlike step 29 this cannot compare the old and new prefix texts (the old rules are gone), so it continues the
    counter whenever such an old row exists: where the old prefix had been customised to a different text, the project
    starts after that counter and leaves unused numbers behind — a gap, never a collision (R1 P3-2)."""
    code = (code or "").strip().upper()
    if not code:
        return {}
    moved = {}
    with _reference_seq_lock:
        for doc_type in _DOC_TYPE_TABLES:
            if doc_type == "QWORKFLOW":
                continue                                            # was never numbered per contractor
            old_last = db.execute(text("SELECT MAX(last_seq) FROM reference_sequences WHERE vendor <> '*' "
                                       "AND UPPER(vendor) = :v AND UPPER(doc) = :d"),
                                  {"v": code, "d": doc_type}).scalar() or 0
            if not old_last:
                continue
            row = db.query(ReferenceSequence).filter(
                ReferenceSequence.project == project_id, ReferenceSequence.vendor == "*", ReferenceSequence.doc == doc_type,
            ).with_for_update().first()
            if row is None:
                db.add(ReferenceSequence(project=project_id, vendor="*", doc=doc_type, last_seq=old_last))
            elif (row.last_seq or 0) < old_last:
                row.last_seq = old_last
            else:
                continue
            moved[doc_type] = old_last
        db.flush()
    return moved


# 白名單：doc_type → (實體 table name, 編號欄位名)（避免 SQL 注入，且只 self-heal 已知文件類型）
# Column names differ per table (referenceNo / documentNumber / pqpNo / recordsNo) —
# using the wrong one makes self-heal silently no-op (caught below), so keep this accurate.
_DOC_TYPE_TABLES = {
    'ITP': ('itp', 'referenceNo'),
    'NOI': ('noi', 'referenceNo'),
    'NCR': ('ncr', 'documentNumber'),
    'ITR': ('itr', 'documentNumber'),
    'PQP': ('pqp', 'pqpNo'),
    'OBS': ('obs', 'documentNumber'),
    'CHECKLIST': ('checklist', 'recordsNo'),
    'FOLLOWUP': ('followup', 'issueNo'),
    'OSD': ('osd', 'documentNumber'),
    'MEETING': ('meeting_minutes', 'documentNumber'),
    'MSA': ('material_submittals', 'document_number'),
    'AUDIT': ('audits', 'auditNo'),
    'QWORKFLOW': ('qworkflow', 'referenceNo'),
}


def _max_existing_seq(db: Session, doc_type: str, expected_prefix: str) -> int:
    """
    Query the actual document table for the largest sequence number whose
    reference column starts with `expected_prefix`. Returns 0 if none.

    Why this exists: ReferenceSequence.last_seq can drift below the real max
    when records are imported with hardcoded reference numbers (e.g.
    db_seeder). Without this, the next generated number collides with an
    existing row.
    """
    entry = _DOC_TYPE_TABLES.get(doc_type.upper())
    if not entry:
        return 0
    table, column = entry
    try:
        sql = text(
            f'SELECT MAX(CAST(SUBSTR("{column}", :prefix_len + 1) AS INTEGER)) '
            f'FROM {table} WHERE "{column}" LIKE :pattern'
        )
        result = db.execute(sql, {
            'prefix_len': len(expected_prefix),
            'pattern': f"{expected_prefix}%",
        }).scalar()
        return int(result) if result else 0
    except Exception as e:
        logger.warning(f"_max_existing_seq failed for {doc_type}: {e}")
        return 0
