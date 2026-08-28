import logging
import re

from sqlalchemy import text

from database import engine

logger = logging.getLogger(__name__)

# Migration: Add unique indexes on reference/document number columns for each table
ALLOWED_INDEX_CONFIGS = {
    ("noi", "referenceNo"),
    ("itr", "documentNumber"),
    ("ncr", "documentNumber"),
    ("obs", "documentNumber"),
    ("itp", "referenceNo"),
    ("pqp", "pqpNo"),
    ("followup", "issueNo"),
}

def add_unique_index_if_not_exists(conn, table: str, column: str) -> None:
    """
    為指定表格欄位建立唯一索引
    使用白名單驗證防止 SQL Injection
    """
    # 安全檢查：只允許預定義的表格和欄位組合
    if (table, column) not in ALLOWED_INDEX_CONFIGS:
        raise ValueError(f"Invalid table/column combination: {table}.{column}")

    try:
        # 使用預定義的安全值，因為已通過白名單驗證
        conn.execute(text(f"CREATE UNIQUE INDEX IF NOT EXISTS ix_{table}_{column}_unique ON {table} ({column})"))
        conn.commit()
    except Exception as e:
        logger.warning(f"Index creation skipped for {table}.{column} (may already exist or has duplicates): {e}")

def run_migrations():
    """Run all database migrations"""
    logger.info("Running database migrations...")

    # 1. Add unique constraint to reference_sequences
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_ref_seq_unique ON reference_sequences (project, vendor, doc)"))
            conn.commit()
    except Exception as e:
        logger.warning(f"Index creation skipped for reference_sequences (may already exist): {e}")

    # 2. Add unique indexes
    with engine.connect() as conn:
        for table, column in ALLOWED_INDEX_CONFIGS:
            add_unique_index_if_not_exists(conn, table, column)

    # 3. Add missing columns (NCR, NOI, ITP, etc.)
    _add_missing_columns()

    # 4. Create document_naming_rules
    _create_naming_rules_table()

    # 5. Create pqp_history table
    _create_pqp_history_table()

    # 6. Create qworkflow table + backfill rows for existing NOIs
    _create_qworkflow_table()
    _backfill_qworkflows()

    # 7. Create token_blacklist table (persisted JWT revocation list)
    _create_token_blacklist_table()

    # 8. P0 data isolation: per-user project scope table + users.vendor_id
    _create_user_scope()

    # 9. §17 step 5: convert ITR detail_data.linkedChecklists JSON snapshots
    # into real Checklist instance rows
    _migrate_itr_linked_checklists()

    # 10. IAM data-integrity fix: remap custom roles off dead legacy
    # UPPER_SNAKE permission codes onto the current lower:colon:scope ones.
    _remap_legacy_permission_codes()

    # 11. NCR qtyAffected: split free-text "1 joint" style values into a
    # numeric quantity + separate unit column, so it can feed aggregate stats.
    _split_ncr_qty_affected_unit()

    # 12. NCR TBC/N/A fields: convert the literal "To be confirmed" /
    # "Not Applicable" magic strings into structured *Status columns.
    _structure_ncr_tbc_na_fields()

    logger.info("Migrations completed.")

def _add_missing_columns():
    try:
        with engine.connect() as conn:
            # NCR
            _add_column_if_missing(conn, "ncr", "dueDate", "TEXT")
            _add_column_if_missing(conn, "ncr", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "ncr", "attachments", "TEXT")
            _add_column_if_missing(conn, "ncr", "progressPhotos", "TEXT")
            _add_column_if_missing(conn, "ncr", "ownerApproval", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "ownerApprovalBy", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "ownerApprovalDate", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "ownerApprovalNotes", "TEXT")
            _add_column_if_missing(conn, "ncr", "qtyAffectedUnit", "VARCHAR")
            for col in [
                "repairMethodStatementStatus", "immediateCorrectionActionStatus",
                "rootCauseAnalysisStatus", "correctiveActionsStatus",
                "preventiveActionStatus", "effectivenessNotesStatus", "directCauseStatus",
            ]:
                _add_column_if_missing(conn, "ncr", col, "VARCHAR")
            _add_column_if_missing(conn, "ncr", "noiNumber", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "referenceStandards", "TEXT")
            _add_column_if_missing(conn, "ncr", "serialNumbers", "TEXT")
            _add_column_if_missing(conn, "ncr", "repairMethodStatement", "TEXT")
            _add_column_if_missing(conn, "ncr", "immediateCorrectionAction", "TEXT")
            _add_column_if_missing(conn, "ncr", "rootCauseAnalysis", "TEXT")
            _add_column_if_missing(conn, "ncr", "correctiveActions", "TEXT")
            _add_column_if_missing(conn, "ncr", "preventiveAction", "TEXT")
            _add_column_if_missing(conn, "ncr", "finalProductIntegrityStatement", "TEXT")
            _add_column_if_missing(conn, "ncr", "reInspectionNumber", "TEXT")
            _add_column_if_missing(conn, "ncr", "projectQualityManager", "TEXT")
            # NCR field-model improvements (BACKLOG #13)
            _add_column_if_missing(conn, "ncr", "severity", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "discipline", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "assignedTo", "INTEGER")
            _add_column_if_missing(conn, "ncr", "closedBy", "INTEGER")
            _add_column_if_missing(conn, "ncr", "verifiedBy", "INTEGER")
            _add_column_if_missing(conn, "ncr", "effectivenessVerified", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "effectivenessVerifiedBy", "INTEGER")
            _add_column_if_missing(conn, "ncr", "effectivenessVerifiedDate", "VARCHAR")
            _add_column_if_missing(conn, "ncr", "effectivenessNotes", "TEXT")
            # NCR formal-report fields (BACKLOG #15)
            for col in ["drawingNo", "specNo", "poContract", "wbs", "lineNo",
                        "weldJointNo", "heatBatchNo", "qtyAffected", "extent",
                        "costScheduleImpact", "concessionNo", "rcaMethod",
                        "recurrence", "recurrenceRef", "correctiveActionOwner",
                        "correctiveActionTargetDate", "preventiveActionOwner",
                        "preventiveActionTargetDate"]:
                _add_column_if_missing(conn, "ncr", col, "VARCHAR")
            for col in ["requirement", "asFound", "deviation", "directCause"]:
                _add_column_if_missing(conn, "ncr", col, "TEXT")

            # NOI
            for col in ["attachments", "remark", "closeoutDate", "ncrNumber", "dueDate", "last_reminded_at"]:
                _add_column_if_missing(conn, "noi", col, "TEXT")
            # §17: NOI is the single source of inspection basic data
            _add_column_if_missing(conn, "noi", "foundLocation", "TEXT")
            _add_column_if_missing(conn, "noi", "discipline", "VARCHAR")

            # ITP
            _add_column_if_missing(conn, "itp", "detail_data", "TEXT")
            _add_column_if_missing(conn, "itp", "dueDate", "TEXT")
            _add_column_if_missing(conn, "itp", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "itp", "attachments", "TEXT")

            # OBS
            _add_column_if_missing(conn, "obs", "dueDate", "TEXT")
            _add_column_if_missing(conn, "obs", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "obs", "attachments", "TEXT")
            _add_column_if_missing(conn, "obs", "verified", "VARCHAR")       # Pending / Verified / Rejected
            _add_column_if_missing(conn, "obs", "verifiedDate", "TEXT")

            # OSD
            _add_column_if_missing(conn, "osd", "improvementPhotos", "TEXT")

            # ITR
            _add_column_if_missing(conn, "itr", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "itr", "dueDate", "TEXT")
            _add_column_if_missing(conn, "itr", "attachments", "TEXT")
            _add_column_if_missing(conn, "itr", "noiNumber", "VARCHAR")
            _add_column_if_missing(conn, "itr", "inspectionResult", "VARCHAR")
            _add_column_if_missing(conn, "itr", "preparedBy", "VARCHAR")
            _add_column_if_missing(conn, "itr", "preparedAt", "VARCHAR")
            _add_column_if_missing(conn, "itr", "reviewedBy", "VARCHAR")
            _add_column_if_missing(conn, "itr", "reviewedAt", "VARCHAR")
            _add_column_if_missing(conn, "itr", "approvedBy", "VARCHAR")
            _add_column_if_missing(conn, "itr", "approvedAt", "VARCHAR")
            _add_column_if_missing(conn, "itr", "isReInspection", "BOOLEAN DEFAULT 0")
            _add_column_if_missing(conn, "itr", "reInspectionCount", "INTEGER DEFAULT 0")
            _add_column_if_missing(conn, "itr", "originalItrId", "VARCHAR")
            _add_column_if_missing(conn, "itr", "discipline", "VARCHAR")

            # FollowUp
            _add_column_if_missing(conn, "followup", "last_reminded_at", "TEXT")
            # Real FK to the assignee's user account, added alongside the
            # pre-existing free-text `assignedTo` (kept for backward-compat
            # display) so reminders can reach the actual responsible person
            # and "my open items" can filter reliably.
            _add_column_if_missing(conn, "followup", "assignedToUserId", "INTEGER")

            # PQP
            _add_column_if_missing(conn, "pqp", "attachments", "TEXT")

            # NCR - itrNumber
            _add_column_if_missing(conn, "ncr", "itrNumber", "VARCHAR")

            # Checklist
            _add_column_if_missing(conn, "checklist", "noiNumber", "VARCHAR")
            # §17: template/instance split — instance points back to its template
            _add_column_if_missing(conn, "checklist", "template_id", "VARCHAR")

            # FAT
            _add_column_if_missing(conn, "fat", "last_reminded_at", "TEXT")

            # Audits (additional columns)
            _add_column_if_missing(conn, "audits", "selected_templates", "TEXT")
            _add_column_if_missing(conn, "audits", "custom_check_items", "TEXT")

            # AuditLog
            _add_column_if_missing(conn, "audit_logs", "reason", "TEXT")
            _add_column_if_missing(conn, "audit_logs", "details", "TEXT")

            # Audits
            _add_column_if_missing(conn, "audits", "vendor_id", "VARCHAR")
            _add_column_if_missing(conn, "audits", "audit_criteria", "TEXT")

            # Multi-project support: add project_id FK to quality document tables
            for tbl in [
                "itp", "ncr", "noi", "itr", "obs",
                "followup", "checklist", "audits", "fat", "pqp", "qworkflow",
            ]:
                _add_column_if_missing(conn, tbl, "project_id", "VARCHAR")

            # User: account-lockout, session-cutoff, and 2FA fields
            _add_column_if_missing(conn, "users", "failed_login_attempts", "INTEGER NOT NULL DEFAULT 0")
            _add_column_if_missing(conn, "users", "locked_until", "DATETIME")
            _add_column_if_missing(conn, "users", "tokens_valid_after", "DATETIME")
            _add_column_if_missing(conn, "users", "totp_secret", "VARCHAR")
            _add_column_if_missing(conn, "users", "totp_enabled", "BOOLEAN NOT NULL DEFAULT 0")
            # Cosmetic-only "Name / Company" display label for internal staff
            # with no vendor_id — see models.py User.display_company.
            _add_column_if_missing(conn, "users", "company_name", "VARCHAR")

            # Meeting Minutes: plain user-editable revision label (no
            # auto-series/shared-documentNumber logic — that's deferred,
            # see BACKLOG #18).
            _add_column_if_missing(conn, "meeting_minutes", "rev", "VARCHAR")

            conn.commit()
    except Exception as e:
        logger.warning(f"Migration warning: {e}")

def _add_column_if_missing(conn, table, column, type_def):
    try:
        result = conn.execute(text(f"PRAGMA table_info({table})"))
        columns = [row[1] for row in result]
        if column not in columns:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {type_def}"))
    except Exception as e:
        logger.warning(f"Column addition skipped for {table}.{column} (may already exist): {e}")

def _create_naming_rules_table():
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS document_naming_rules (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    doc_type VARCHAR NOT NULL,
                    prefix VARCHAR NOT NULL,
                    sequence_digits INTEGER NOT NULL DEFAULT 6
                )
            """))
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_document_naming_rules_doc_type ON document_naming_rules (doc_type)"))
            conn.commit()
    except Exception as e:
        logger.warning(f"Naming rules table creation skipped (may already exist): {e}")

def _create_qworkflow_table():
    """Create the qworkflow table that backs the Q-WorkFlow tracker.

    A Q-WorkFlow is 1:1 with an NOI — it's a lightweight row that
    just holds a reference number (Q-WorkFlow-000001) plus the FK;
    every checkpoint is computed at read time by WorkflowService."""
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS qworkflow (
                    id VARCHAR NOT NULL PRIMARY KEY,
                    "referenceNo" VARCHAR NOT NULL UNIQUE,
                    noi_id VARCHAR NOT NULL UNIQUE REFERENCES noi(id),
                    "createdAt" VARCHAR
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_qworkflow_noi_id ON qworkflow (noi_id)"
            ))
            conn.commit()
    except Exception as e:
        logger.warning(f"qworkflow table creation skipped (may already exist): {e}")


def _backfill_qworkflows():
    """For every existing NOI without a qworkflow row, create one with
    the next sequential Q-WorkFlow reference number. Ordering is by
    NOI.id so the assignment is deterministic across reruns — existing
    Q-WorkFlow numbers stay stable even if new NOIs are added later.

    Safe to rerun: existing rows are detected via LEFT JOIN and
    skipped. Numbering continues from the current max sequence so
    backfills and ordinary creates can't collide.
    """
    import uuid
    from datetime import datetime

    try:
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT n.id FROM noi n "
                "LEFT JOIN qworkflow q ON q.noi_id = n.id "
                "WHERE q.id IS NULL ORDER BY n.id"
            )).fetchall()
            if not rows:
                return

            # Pull the current max sequence from existing Q-WorkFlow
            # numbers so we never reuse one. Parsing is forgiving —
            # anything that doesn't match the expected shape is
            # ignored rather than breaking startup.
            existing = conn.execute(text(
                'SELECT "referenceNo" FROM qworkflow'
            )).fetchall()
            max_seq = 0
            for (ref,) in existing:
                if not ref or not ref.startswith("Q-WorkFlow-"):
                    continue
                try:
                    max_seq = max(max_seq, int(ref.split("-")[-1]))
                except ValueError:
                    continue

            now = datetime.utcnow().isoformat()
            for (noi_id,) in rows:
                max_seq += 1
                ref = f"Q-WorkFlow-{max_seq:06d}"
                conn.execute(
                    text(
                        'INSERT INTO qworkflow (id, "referenceNo", noi_id, "createdAt") '
                        "VALUES (:id, :ref, :noi_id, :created)"
                    ),
                    {"id": str(uuid.uuid4()), "ref": ref, "noi_id": noi_id, "created": now},
                )
            conn.commit()
            logger.info(f"Backfilled {len(rows)} Q-WorkFlow rows for existing NOIs.")
    except Exception as e:
        logger.warning(f"Q-WorkFlow backfill skipped: {e}")


def _create_token_blacklist_table():
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS token_blacklist (
                    token_hash VARCHAR(64) NOT NULL PRIMARY KEY,
                    expires_at DATETIME NOT NULL
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_token_blacklist_expires_at ON token_blacklist (expires_at)"
            ))
            conn.commit()
    except Exception as e:
        logger.warning(f"token_blacklist table creation skipped (may already exist): {e}")


def _create_user_scope():
    """P0 data isolation: the user_projects scope table and users.vendor_id.

    Existing users get neither a project row nor a vendor_id, so they remain
    unscoped (full access) after this migration — nothing breaks on rollout.
    Scope is applied only to users that are explicitly configured."""
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS user_projects (
                    user_id INTEGER NOT NULL,
                    project_id VARCHAR NOT NULL,
                    PRIMARY KEY (user_id, project_id)
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_user_projects_user_id ON user_projects (user_id)"
            ))
            _add_column_if_missing(conn, "users", "vendor_id", "VARCHAR")
            conn.commit()
    except Exception as e:
        logger.warning(f"user scope migration skipped (may already exist): {e}")


def _migrate_itr_linked_checklists():
    """§17 step 5: for each ITR whose detail_data still carries the old
    `linkedChecklists` JSON snapshot array, materialize each snapshot as a
    real Checklist instance row (itrId + best-effort template_id) — mirroring
    what ITRService.link_checklist does for new links — then strip
    `linkedChecklists` out of detail_data.

    Also reverses Defect 1's template pollution (BACKLOG §17): the pre-fix
    link_checklist mutated the chosen template row's own itrId instead of
    creating a separate instance. If a snapshot's origin row is still pinned
    to this exact ITR that way, it's the same pollution — clear its itrId/
    itrNumber so the template becomes reusable again, now that the real
    instance row exists to carry this ITR's results.

    Idempotent: an ITR is only touched while its detail_data still contains
    `linkedChecklists`, so a rerun after a successful migration is a no-op.
    """
    import json
    import uuid

    import models
    from core.utils import generate_reference_no
    from database import SessionLocal

    db = SessionLocal()
    try:
        candidates = db.query(models.ITR).filter(
            models.ITR.detail_data.isnot(None),
            models.ITR.detail_data.like('%linkedChecklists%'),
        ).all()
        if not candidates:
            return

        converted_itrs = 0
        converted_instances = 0
        for itr in candidates:
            try:
                detail_data = json.loads(itr.detail_data)
            except (TypeError, ValueError):
                continue
            if not isinstance(detail_data, dict):
                continue
            linked = detail_data.get('linkedChecklists')
            if not isinstance(linked, list):
                continue

            itr_vendor = itr.vendor_ref.name if itr.vendor_ref else ''
            for snapshot in linked:
                if not isinstance(snapshot, dict):
                    continue

                template_id = None
                orig_id = snapshot.get('id')
                if orig_id:
                    original = db.query(models.Checklist).filter(
                        models.Checklist.id == orig_id
                    ).first()
                    if original:
                        template_id = original.template_id or original.id
                        # Defect 1 pollution: this "template" is actually
                        # pinned to the very ITR we're migrating. Un-pollute it.
                        if original.itrId == itr.id:
                            original.itrId = None
                            original.itrNumber = None

                snap_detail = snapshot.get('detail_data')
                if isinstance(snap_detail, (dict, list)):
                    snap_detail = json.dumps(snap_detail)

                instance = models.Checklist(
                    id=str(uuid.uuid4()),
                    recordsNo=generate_reference_no(db, itr_vendor, 'CHECKLIST'),
                    activity=snapshot.get('activity'),
                    date=snapshot.get('date'),
                    status=snapshot.get('status') or 'Ongoing',
                    packageName=snapshot.get('packageName'),
                    location=snapshot.get('location'),
                    itpIndex=snapshot.get('itpIndex'),
                    itpId=snapshot.get('itpId'),
                    itpVersion=snapshot.get('itpVersion'),
                    passCount=snapshot.get('passCount') or 0,
                    failCount=snapshot.get('failCount') or 0,
                    detail_data=snap_detail,
                    noiNumber=snapshot.get('noiNumber'),
                    project_id=itr.project_id,
                    itrId=itr.id,
                    itrNumber=itr.documentNumber,
                    template_id=template_id,
                )
                db.add(instance)
                converted_instances += 1

            # Keep everything except the now-materialized snapshot array
            # (e.g. `_version` optimistic-lock marker survives untouched).
            remaining = {k: v for k, v in detail_data.items() if k != 'linkedChecklists'}
            itr.detail_data = json.dumps(remaining) if remaining else None
            converted_itrs += 1

        db.commit()
        if converted_itrs:
            logger.info(
                f"§17 migration: converted {converted_instances} checklist "
                f"instance(s) from {converted_itrs} ITR(s)."
            )
    except Exception as e:
        db.rollback()
        logger.warning(f"ITR linkedChecklists migration skipped: {e}")
    finally:
        db.close()


# Legacy UPPER_SNAKE permission code -> current lower:colon:scope code.
# The permission-naming scheme changed at some point; db_seeder.py only ever
# inserts missing new-format rows and re-syncs the ADMIN role on every boot —
# it never migrates other roles off the old codes, so any custom role granted
# a permission under the old name is silently broken (RoleChecker only checks
# against core/perms.py's new-format constants).
_LEGACY_PERMISSION_CODE_MAP = {
    'ITP_VIEW': 'itp:view:all', 'ITP_CREATE': 'itp:create:all',
    'ITP_UPDATE': 'itp:update:all', 'ITP_DELETE': 'itp:delete:all',
    'ITP_APPROVE': 'itp:approve:all', 'ITP_VOID': 'itp:void:all',
    'NCR_VIEW': 'ncr:view:all', 'NCR_CREATE': 'ncr:create:all',
    'NCR_UPDATE': 'ncr:update:all', 'NCR_DELETE': 'ncr:delete:all',
    'NCR_APPROVE': 'ncr:approve:all', 'NCR_CLOSE': 'ncr:close:all',
    'NOI_VIEW': 'noi:view:all', 'NOI_CREATE': 'noi:create:all',
    'NOI_UPDATE': 'noi:update:all', 'NOI_DELETE': 'noi:delete:all',
    'NOI_APPROVE': 'noi:approve:all',
    'CHECKLIST_VIEW': 'checklist:view:all', 'CHECKLIST_CREATE': 'checklist:create:all',
    'CHECKLIST_UPDATE': 'checklist:update:all', 'CHECKLIST_DELETE': 'checklist:delete:all',
    'USER_MANAGE': 'iam:user:manage', 'USER_VIEW': 'iam:user:view',
    'ROLE_MANAGE': 'iam:role:manage', 'ROLE_VIEW': 'iam:role:view',
}


def _remap_legacy_permission_codes():
    """One-time data-integrity fix (found while adding NCR owner-approval
    permission gating): every custom role (ENGINEER, QA_MANAGER, VIEWER, ...)
    that was ever granted a permission under an old UPPER_SNAKE code is still
    linked to that dead row, so every one of those permission checks silently
    fails today — even though the IAM UI shows the permission as "granted".

    For each legacy code: re-point every role currently on it to the current
    row (creating the row via rename if the new one doesn't exist yet, or
    skipping a role that already somehow has both), then delete the orphaned
    legacy row so this can't quietly happen again.

    Idempotent: after the first successful run no role_permissions row points
    at a legacy code, so later runs find nothing to do.
    """
    try:
        with engine.connect() as conn:
            for old_code, new_code in _LEGACY_PERMISSION_CODE_MAP.items():
                old_row = conn.execute(
                    text("SELECT id FROM permissions WHERE code = :c"), {"c": old_code}
                ).first()
                if not old_row:
                    continue
                old_id = old_row[0]

                new_row = conn.execute(
                    text("SELECT id FROM permissions WHERE code = :c"), {"c": new_code}
                ).first()
                if not new_row:
                    # New-format row doesn't exist yet — rename in place, so
                    # every existing role_permissions link stays valid as-is.
                    conn.execute(
                        text("UPDATE permissions SET code = :new WHERE id = :id"),
                        {"new": new_code, "id": old_id},
                    )
                    conn.commit()
                    logger.info(f"Renamed legacy permission {old_code!r} -> {new_code!r} in place.")
                    continue
                new_id = new_row[0]

                role_ids = [r[0] for r in conn.execute(
                    text("SELECT role_id FROM role_permissions WHERE permission_id = :id"),
                    {"id": old_id},
                ).fetchall()]
                for role_id in role_ids:
                    exists = conn.execute(
                        text("SELECT 1 FROM role_permissions WHERE role_id = :r AND permission_id = :p"),
                        {"r": role_id, "p": new_id},
                    ).first()
                    if not exists:
                        conn.execute(
                            text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"),
                            {"r": role_id, "p": new_id},
                        )
                conn.execute(text("DELETE FROM role_permissions WHERE permission_id = :id"), {"id": old_id})
                conn.execute(text("DELETE FROM permissions WHERE id = :id"), {"id": old_id})
                conn.commit()
                if role_ids:
                    logger.info(
                        f"Remapped legacy permission {old_code!r} -> {new_code!r} "
                        f"for {len(role_ids)} role(s); removed orphaned row."
                    )
    except Exception as e:
        logger.warning(f"Legacy permission code remap skipped: {e}")


_QTY_AFFECTED_SPLIT_RE = re.compile(r'^\s*([\d]+(?:\.\d+)?)\s*(.*)$')


def _split_ncr_qty_affected_unit():
    """NCR.qtyAffected used to be pure free text (e.g. "1 joint", "5.5 m") —
    unusable for the monthly-stats aggregation it's meant to feed (BACKLOG
    #12). Split any existing value that isn't already a bare number into a
    numeric qtyAffected + a separate qtyAffectedUnit, so the column becomes
    genuinely numeric going forward without discarding the unit context users
    already entered.

    Idempotent: only touches rows where qtyAffected still contains non-numeric
    trailing text; a value that's already a bare number is left alone (a
    rerun finds nothing left to split).
    """
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(
                'SELECT id, "qtyAffected" FROM ncr WHERE "qtyAffected" IS NOT NULL '
                'AND TRIM("qtyAffected") != \'\''
            )).fetchall()

            split_count = 0
            unparsed = []
            for ncr_id, raw in rows:
                match = _QTY_AFFECTED_SPLIT_RE.match(raw)
                if not match:
                    unparsed.append(raw)
                    continue
                number, unit = match.group(1), match.group(2).strip()
                if not unit:
                    continue  # already a bare number — nothing to split
                conn.execute(
                    text('UPDATE ncr SET "qtyAffected" = :n, "qtyAffectedUnit" = :u WHERE id = :id'),
                    {"n": number, "u": unit, "id": ncr_id},
                )
                split_count += 1
            conn.commit()

            if split_count:
                logger.info(f"Split qtyAffected into quantity + unit for {split_count} NCR(s).")
            if unparsed:
                logger.warning(
                    f"qtyAffected split: {len(unparsed)} NCR(s) had a non-numeric-leading "
                    f"value left as-is (needs manual cleanup): {unparsed[:5]}"
                )
    except Exception as e:
        logger.warning(f"NCR qtyAffected split skipped: {e}")


# Field -> companion status column, for every NCR field that used to get a
# literal magic-string value written into it by the TBC/N/A buttons.
_NCR_TBC_NA_FIELDS = [
    "repairMethodStatement", "immediateCorrectionAction", "rootCauseAnalysis",
    "correctiveActions", "preventiveAction", "effectivenessNotes", "directCause",
]


def _structure_ncr_tbc_na_fields():
    """The TBC/N/A buttons used to write the literal string "To be confirmed"
    or "Not Applicable" directly into these free-text fields, making "which
    NCRs still have a field marked TBC" unqueryable without fragile string
    matching. Convert any exact-match legacy value into the companion
    `<field>Status` column ('TBC' / 'NA') and clear the text field itself, so
    it only ever holds real content or nothing.

    Idempotent: only rows whose text still holds one of the two exact legacy
    strings are touched; a rerun after a successful pass finds nothing left.
    """
    try:
        with engine.connect() as conn:
            total = 0
            for field in _NCR_TBC_NA_FIELDS:
                status_col = f"{field}Status"
                for legacy_value, status in (("To be confirmed", "TBC"), ("Not Applicable", "NA")):
                    result = conn.execute(
                        text(f'UPDATE ncr SET "{field}" = NULL, "{status_col}" = :status '
                             f'WHERE "{field}" = :legacy'),
                        {"status": status, "legacy": legacy_value},
                    )
                    total += result.rowcount
            conn.commit()
            if total:
                logger.info(f"Structured {total} NCR TBC/N/A field value(s) into status columns.")
    except Exception as e:
        logger.warning(f"NCR TBC/N/A field structuring skipped: {e}")


def _create_pqp_history_table():
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS pqp_history (
                    id VARCHAR NOT NULL PRIMARY KEY,
                    pqp_id VARCHAR NOT NULL REFERENCES pqp(id),
                    version VARCHAR NOT NULL,
                    version_no INTEGER NOT NULL,
                    title VARCHAR,
                    description VARCHAR,
                    status VARCHAR,
                    vendor_id VARCHAR,
                    change_summary VARCHAR,
                    created_at VARCHAR NOT NULL
                )
            """))
            conn.execute(text("CREATE INDEX IF NOT EXISTS ix_pqp_history_pqp_id ON pqp_history (pqp_id)"))
            conn.commit()
    except Exception as e:
        logger.warning(f"PQP history table creation skipped (may already exist): {e}")
