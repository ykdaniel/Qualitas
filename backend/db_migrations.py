import json
import logging
import re
from datetime import datetime

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
    from core.startup_guard import guard_if_required
    guard_if_required()      # isolated-test processes only; no-op otherwise
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

    # 13. Meeting Minutes: recurring occurrences share one documentNumber
    # (see BACKLOG #18) — loosen the old single-column unique index into a
    # composite (documentNumber, rev) one.
    _loosen_meeting_minutes_documentNumber_unique()

    # 14. OBS: closure verification split into Quality Engineer +
    # Construction Engineer sign-offs — backfill historical Verified rows
    # so their derived status (now based on both new fields) stays Closed.
    _backfill_obs_engineer_approvals()

    # 15. §17 Checklist/ITR isolation hardening: template's own edit
    # counter (`version`) + the template version an instance was linked
    # from (`source_template_version`) — minimal explicit versioning;
    # link_checklist's existing deep-copy already preserves the actual
    # item/criteria content, this just labels which version it came from.
    _add_checklist_version_columns()

    # 16. No backfill needed for source_template_version — a new nullable
    # column with no DEFAULT already reads back NULL for every pre-existing
    # row, which IS the correct "historical version unknown" sentinel
    # (never fabricate a number). This step only logs the baseline count.
    _log_checklist_legacy_version_baseline()

    # 17. Historical-evidence markers (`evidence_recorded_at` +
    # `evidence_historical_unknown`) — see
    # _backfill_checklist_evidence_recorded_at's own docstring. Runs
    # exactly once, tracked via `migration_flags` (not a per-row IS NULL
    # guard — an independently-reproduced bug found that IS NULL cannot
    # tell "predates this feature" from "brand-new row, correctly still
    # NULL", so every app restart was re-protecting genuinely untouched
    # new instances).
    _create_migration_flags_table()
    _add_checklist_evidence_marker_column()
    _backfill_checklist_evidence_recorded_at()

    # 18. Repair for the v2 backfill above (2026-09-19, same day):
    # v2's guard against re-stamping new rows was fixed, but v2 itself
    # (which had already run at least once by the time this shipped) had
    # a *separate* bug — its blanket content-based classification
    # overwrote/cleared any evidence_recorded_at value that already
    # existed (from a real update_checklist save, or from v2's own
    # earlier runs), based purely on the row's CURRENT content. This
    # reconstructs real timestamps from audit_logs where possible, and
    # otherwise leaves whatever value is already stored untouched, only
    # correcting its reliability label. See the function's own docstring.
    _add_checklist_evidence_reliability_column()
    _repair_checklist_evidence_timestamp_provenance()

    # 19. Repair for a bug IN v3's own reconstruction logic above
    # (2026-09-19, same day): v3 treated any audit_logs UPDATE entry
    # whose new_value showed evidence as a provable first-save moment,
    # without checking whether old_value already had evidence too (a
    # correction, not an introduction) and without accounting for the
    # historical missing-commit-after-log_audit bug meaning the audit
    # trail itself can have gaps. Re-examines rows v3 marked reliable=True
    # and downgrades any that cannot actually be proven safe — see the
    # function's own docstring for the full reasoning and the exact rule
    # used to tell a genuinely-safe live save (after v3 last ran) apart
    # from one v3's own sweep could have touched.
    _repair_checklist_evidence_first_time_reliability()

    # 20. ITR approval events (2026-09-20): the append-only approval / revocation history
    # (approver, server time, approval-moment ITR + Checklist snapshots). Its schema is
    # owned by THIS step (start-up create_all skips it) — see the function's docstring.
    # Unlike the best-effort steps above, a failure here RAISES MigrationError and stops start-up.
    _create_itr_approval_events_table()

    logger.info("Migrations completed.")

class MigrationError(RuntimeError):
    """A migration this application cannot run without failed. Raised out of run_migrations()
    (nothing catches it), so start-up stops before seeding, the scheduler or any request."""


def _create_itr_approval_events_table():
    """Create `itr_approval_events` (and its index) if missing, and verify it. Nothing else.

    * Owns this table's schema: models.ITRApprovalEvent is flagged migration_owned, so
      start-up's create_all no longer creates it — a brand-new database gets it here, and
      an old one gets it here on its first start after upgrade.
    * Idempotent, no "done" flag: every statement is IF NOT EXISTS, so re-running is a
      no-op that keeps every existing row, and a step that failed half-way (say the table
      was created but the index was not) simply completes on the next start — there is
      nothing that could be wrongly recorded as finished. An existing table (e.g. one an
      earlier development build made through create_all) is adopted as it is — if it has
      every column the model writes.
    * Never backfills: historical approvals stay without events, and no ITR, Checklist or
      audit row is read or written. Never drops or rebuilds a table, never rewrites an event.
    * AUTOINCREMENT so event ids are never reused after a delete.
    * FAILS THE START-UP (2026-09-20): if the table cannot be created, its index cannot be
      created, or an existing table lacks columns the application writes, this raises
      MigrationError — approvals depend on this table, and starting anyway would only defer
      the failure to the first approval. What is guaranteed: no existing table is dropped or
      rebuilt and no event row is rewritten. What is NOT: that nothing was created — the table
      and/or its index may already exist when a later check fails (a partial schema). Because every
      statement is IF NOT EXISTS, the next start simply completes whatever is missing.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS itr_approval_events (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    itr_id VARCHAR NOT NULL,
                    document_number VARCHAR,
                    sequence INTEGER NOT NULL,
                    event_type VARCHAR NOT NULL,
                    occurred_at VARCHAR NOT NULL,
                    actor_user_id INTEGER,
                    actor_username VARCHAR,
                    actor_full_name VARCHAR,
                    status_before VARCHAR,
                    status_after VARCHAR,
                    reason TEXT,
                    approval_event_id INTEGER,
                    itr_snapshot TEXT,
                    checklists_snapshot TEXT,
                    snapshot_sha256 VARCHAR
                )
            """))
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_itr_approval_events_itr_id ON itr_approval_events (itr_id)"
            ))
            conn.commit()

        # Verify rather than assume: the table and its index must exist, and a pre-existing
        # table must actually have every column the model writes (never silently "adopt" a
        # wrong shape).
        import models
        from sqlalchemy import inspect as sa_inspect
        insp = sa_inspect(engine)
        have = {c["name"] for c in insp.get_columns("itr_approval_events")}
        missing = [c.name for c in models.ITRApprovalEvent.__table__.columns if c.name not in have]
        if missing:
            raise MigrationError(
                f"itr_approval_events exists but is missing column(s) {missing}. ITR approvals cannot be "
                "recorded with this table. This step never drops, rebuilds or rewrites the table or any event "
                "row, but it may already have created the missing index on it (IF NOT EXISTS) before this "
                "check failed. Fix the table by hand (it may hold approval history), then start again."
            )
        if "ix_itr_approval_events_itr_id" not in {i["name"] for i in insp.get_indexes("itr_approval_events")}:
            raise MigrationError("itr_approval_events index ix_itr_approval_events_itr_id is missing after creation.")
    except MigrationError as e:
        logger.error("STARTUP ABORTED: %s", e)
        raise
    except Exception as e:
        logger.error("STARTUP ABORTED: itr_approval_events could not be created or verified: %s", e)
        raise MigrationError(
            f"itr_approval_events could not be created or verified ({type(e).__name__}: {e}). "
            "The table and/or its index may have been created before the failure (a partial schema is "
            "possible); existing event rows are never rewritten or dropped. Every statement is IF NOT EXISTS, "
            "so fix the cause and start again — the step completes whatever is missing."
        ) from e


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
            # Split closure sign-off (2026-09-01) — see _backfill_obs_engineer_approvals
            _add_column_if_missing(conn, "obs", "qualityEngineerApproval", "VARCHAR")
            _add_column_if_missing(conn, "obs", "qualityEngineerApprovalBy", "VARCHAR")
            _add_column_if_missing(conn, "obs", "qualityEngineerApprovalDate", "TEXT")
            _add_column_if_missing(conn, "obs", "constructionEngineerApproval", "VARCHAR")
            _add_column_if_missing(conn, "obs", "constructionEngineerApprovalBy", "VARCHAR")
            _add_column_if_missing(conn, "obs", "constructionEngineerApprovalDate", "TEXT")

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

    Re-inspection NOIs are skipped (2026-09-20): the create path gives a NOI with an ``ncrNumber`` no Q-WorkFlow of its
    own (it shares the original NOI's tracker), so completing "every NOI without a row" here used to recreate, at
    each restart, exactly the rows the create path deliberately does not make. The decision is the SAME function the
    create path calls (``noi_has_own_qworkflow``) — not a second, SQL-side copy of the rule. Rows that already exist are
    never touched, whatever kind of NOI they belong to.
    """
    import uuid
    from datetime import datetime
    from services.noi_service import noi_has_own_qworkflow

    try:
        with engine.connect() as conn:
            candidates = conn.execute(text(
                'SELECT n.id, n."ncrNumber" FROM noi n '
                "LEFT JOIN qworkflow q ON q.noi_id = n.id "
                "WHERE q.id IS NULL ORDER BY n.id"
            )).fetchall()
            rows = [(nid,) for nid, ncr_number in candidates if noi_has_own_qworkflow(ncr_number)]
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


def _loosen_meeting_minutes_documentNumber_unique():
    """
    BACKLOG #18: recurring Meeting Minutes occurrences share one
    documentNumber across rows, distinguished by rev ("1.0", "2.0", ...) —
    so the old single-column UNIQUE(documentNumber) has to become a
    composite UNIQUE(documentNumber, rev). This is the first migration in
    this codebase to loosen/replace a constraint rather than only add
    columns/indexes/tables — treated carefully:

    - Backfill rev BEFORE touching the index: the OLD single-column unique
      constraint still guarantees no two rows share a documentNumber at
      this point, so backfilling every NULL rev to "1.0" can't collide.
    - We do NOT hardcode the legacy index's name (confirmed 2026-08-31 via
      direct inspection of a live deployment that it's
      `ix_meeting_minutes_documentNumber`, SQLAlchemy's auto-naming
      convention for `index=True` — but introspect anyway rather than
      assume, in case this ever runs against a DB where that differs).
    - Unlike every other step in this file, a failed index-drop is NOT
      harmless — it would silently defeat the whole feature (every "New
      Occurrence" write would then violate the still-live old constraint)
      — logged at error level, not warning.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("UPDATE meeting_minutes SET rev = '1.0' WHERE rev IS NULL"))
            conn.commit()

            try:
                unique_index_names = [
                    row[1] for row in conn.execute(
                        text('PRAGMA index_list("meeting_minutes")')
                    ).fetchall()
                    if row[2]  # PRAGMA index_list: seq, name, unique, origin, partial
                ]
                for idx_name in unique_index_names:
                    cols = [
                        r[2] for r in conn.execute(
                            text(f'PRAGMA index_info("{idx_name}")')
                        ).fetchall()
                    ]
                    if cols == ["documentNumber"]:
                        conn.execute(text(f'DROP INDEX IF EXISTS "{idx_name}"'))
                        logger.info(f"Dropped legacy unique index {idx_name} on meeting_minutes.documentNumber")
                conn.commit()
            except Exception as e:
                logger.error(
                    f"Could not drop legacy meeting_minutes.documentNumber unique index — "
                    f"recurring-occurrence creation WILL fail until this is fixed manually: {e}"
                )

            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS "
                "ix_meeting_minutes_documentNumber_rev_unique "
                "ON meeting_minutes (documentNumber, rev)"
            ))
            conn.commit()
    except Exception as e:
        logger.warning(f"Meeting Minutes rev/unique migration warning: {e}")


def _backfill_obs_engineer_approvals():
    """OBS closure verification was a single `verified` field
    (Pending/Verified/Rejected); split 2026-09-01 into independent Quality
    Engineer + Construction Engineer sign-offs (an external owner system's
    "Closure Agreed" fields). Status now derives from BOTH new fields, so
    any row that was already Verified needs both backfilled to Approved —
    otherwise an already-closed observation would silently look reopened
    once the frontend switches to the new two-field rule. The `IS NULL`
    guard makes this idempotent (a rerun only touches rows the previous
    run hadn't reached, e.g. ones added between migration runs)."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                UPDATE obs
                SET qualityEngineerApproval = 'Approved',
                    qualityEngineerApprovalDate = verifiedDate,
                    constructionEngineerApproval = 'Approved',
                    constructionEngineerApprovalDate = verifiedDate
                WHERE verified = 'Verified' AND qualityEngineerApproval IS NULL
            """))
            conn.commit()
            if result.rowcount:
                logger.info(f"Backfilled {result.rowcount} previously-Verified OBS row(s) into the new engineer approval fields.")
    except Exception as e:
        logger.warning(f"OBS engineer-approval backfill skipped: {e}")


def _add_checklist_version_columns():
    """§17 isolation hardening (2026-09-19). `version` is a bare template's
    own edit counter (default 1, bumped by checklist_service.py when its
    activity/items change). `source_template_version` is captured once, at
    ITRService.link_checklist time, as a snapshot of the template's
    `version` at that moment — it has no DEFAULT, so every pre-existing
    row reads back NULL, which is the correct "historical version unknown"
    sentinel (see _log_checklist_legacy_version_baseline below — nothing
    backfills a guessed number onto it)."""
    try:
        with engine.connect() as conn:
            _add_column_if_missing(conn, "checklist", "version", "INTEGER DEFAULT 1")
            _add_column_if_missing(conn, "checklist", "source_template_version", "INTEGER")
            conn.commit()
    except Exception as e:
        logger.warning(f"Checklist version column migration skipped: {e}")


def _log_checklist_legacy_version_baseline():
    """Log-only, no-op migration step — deliberately does not write
    anything. Reports how many pre-existing Checklist instances now read
    source_template_version=NULL, so that count is visible in deploy logs
    without anyone needing to query the DB directly to confirm nothing was
    silently (mis)backfilled."""
    try:
        with engine.connect() as conn:
            n = conn.execute(text(
                "SELECT COUNT(*) FROM checklist "
                "WHERE \"itrId\" IS NOT NULL AND \"itrId\" != '' "
                "AND source_template_version IS NULL"
            )).scalar()
            if n:
                logger.info(
                    f"{n} pre-existing Checklist instance(s) have "
                    f"source_template_version=NULL ('historical version unknown') "
                    f"— expected, no action needed."
                )
    except Exception as e:
        logger.warning(f"Checklist legacy version baseline log skipped: {e}")


def _create_migration_flags_table():
    """Generic one-time-migration completion tracker. A row here means
    the named one-time data backfill has already run and must never run
    its write-sweep again — for any backfill whose "already done" check
    can't safely be a per-row `IS NULL` guard, because NULL is also the
    normal, expected state for a brand-new row created after the feature
    shipped.

    Added 2026-09-19 after an independently-reproduced bug:
    `_backfill_checklist_evidence_recorded_at` used to guard on
    `evidence_recorded_at IS NULL` alone — on every app restart, this
    re-stamped genuinely new, untouched Checklist instances as if they
    had always held evidence, because a fresh instance's marker is
    NULL for exactly the same reason a not-yet-backfilled legacy row's
    is. A per-row content check can't distinguish "predates this
    migration" from "postdates it"; only an explicit, persistent
    "this migration has already swept once" flag can."""
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE TABLE IF NOT EXISTS migration_flags (
                    flag_name VARCHAR NOT NULL PRIMARY KEY,
                    completed_at VARCHAR NOT NULL
                )
            """))
            conn.commit()
    except Exception as e:
        logger.warning(f"migration_flags table creation skipped: {e}")


def _add_checklist_evidence_marker_column():
    """Historical-evidence hardening (2026-09-19), columns only — see
    models.py's Checklist comment for what each of the two columns means
    and why they're kept separate. Neither is written here; this step
    only ensures they exist."""
    try:
        with engine.connect() as conn:
            _add_column_if_missing(conn, "checklist", "evidence_recorded_at", "VARCHAR")
            _add_column_if_missing(conn, "checklist", "evidence_historical_unknown", "BOOLEAN DEFAULT 0")
            conn.commit()
    except Exception as e:
        logger.warning(f"Checklist evidence-marker column migration skipped: {e}")


_CHECKLIST_EVIDENCE_MARKER_FLAG = "checklist_evidence_marker_v2"


def _backfill_checklist_evidence_recorded_at():
    """One-time, flag-tracked backfill for the historical-evidence
    markers (2026-09-19, rewritten after the bug described in
    _create_migration_flags_table's docstring).

    Runs its write-sweep AT MOST ONCE, ever — guarded by a row in
    `migration_flags`, not a per-row column check. If the flag is
    already present, this function returns immediately and touches
    nothing, no matter how many times the app restarts or how many new
    Checklist instances have been created since.

    When it does run (the very first time, on whichever deploy first
    ships this migration), for every Checklist row that is a real
    ITR-owned instance (itrId set) at that moment:
      - If its CURRENT content already carries evidence (reusing
        checklist_service.py's own `_touched_fields_carry_results`
        predicate, so this can never disagree with the guard that uses
        it everywhere else): set `evidence_recorded_at` to this
        migration's run time — a real, if approximate, "known to hold
        evidence by this point" timestamp.
      - Otherwise (currently blank): set `evidence_historical_unknown =
        True`, and leave `evidence_recorded_at` NULL — its true history
        is unknown (it may have been genuinely created blank, or may
        have held evidence that was cleared before any of this tracking
        existed), so per the 2026-09-19 decision
        ("對無法判斷歷史的舊空白實例，不可直接假定「從未填寫」") it stays
        protected, but WITHOUT fabricating a "recorded at" moment that
        was never actually observed.

    The backfill UPDATEs and the `migration_flags` INSERT happen in the
    SAME transaction/commit — if anything fails partway through, nothing
    is written (SQLite connection-level transaction), and the flag is
    never inserted, so the next app start safely retries the whole sweep
    from scratch rather than being half-done forever.

    Every instance created AFTER this flag is set is completely
    unaffected by this function (it returns immediately) — such a row's
    evidence_recorded_at starts NULL and evidence_historical_unknown
    starts False, and only update_checklist ever changes either, only
    with a real, accurate timestamp, only the first time real evidence
    is actually saved."""
    from services.checklist_service import _touched_fields_carry_results

    try:
        with engine.connect() as conn:
            already_done = conn.execute(text(
                "SELECT 1 FROM migration_flags WHERE flag_name = :flag"
            ), {"flag": _CHECKLIST_EVIDENCE_MARKER_FLAG}).first()
            if already_done:
                return

            rows = conn.execute(text(
                "SELECT id, status, passCount, failCount, detail_data FROM checklist "
                "WHERE \"itrId\" IS NOT NULL AND \"itrId\" != ''"
            )).fetchall()

            timestamp = datetime.now().isoformat()
            evidenced_ids = []
            unknown_ids = []
            for row in rows:
                has_evidence_now = _touched_fields_carry_results({
                    'status': row.status, 'passCount': row.passCount,
                    'failCount': row.failCount, 'detail_data': row.detail_data,
                })
                (evidenced_ids if has_evidence_now else unknown_ids).append(row.id)

            for checklist_id in evidenced_ids:
                conn.execute(text(
                    "UPDATE checklist SET evidence_recorded_at = :ts, "
                    "evidence_historical_unknown = 0 WHERE id = :id"
                ), {"ts": timestamp, "id": checklist_id})
            for checklist_id in unknown_ids:
                conn.execute(text(
                    "UPDATE checklist SET evidence_recorded_at = NULL, "
                    "evidence_historical_unknown = 1 WHERE id = :id"
                ), {"id": checklist_id})

            conn.execute(text(
                "INSERT INTO migration_flags (flag_name, completed_at) VALUES (:flag, :ts)"
            ), {"flag": _CHECKLIST_EVIDENCE_MARKER_FLAG, "ts": timestamp})

            conn.commit()

            if evidenced_ids or unknown_ids:
                logger.info(
                    f"Checklist evidence-marker one-time backfill complete: "
                    f"{len(evidenced_ids)} instance(s) had real current evidence "
                    f"(evidence_recorded_at set), {len(unknown_ids)} were blank and "
                    f"marked evidence_historical_unknown (protected, no fabricated "
                    f"timestamp). This will not run again."
                )
    except Exception as e:
        logger.warning(f"Checklist evidence-marker backfill skipped (safe to retry next start): {e}")


def _add_checklist_evidence_reliability_column():
    """Historical-evidence provenance repair (2026-09-19), column only —
    see models.py's Checklist comment for what `evidence_recorded_at_reliable`
    means. This step only ensures it exists."""
    try:
        with engine.connect() as conn:
            _add_column_if_missing(conn, "checklist", "evidence_recorded_at_reliable", "BOOLEAN DEFAULT 0")
            conn.commit()
    except Exception as e:
        logger.warning(f"Checklist evidence-reliability column migration skipped: {e}")


_CHECKLIST_EVIDENCE_REPAIR_FLAG = "checklist_evidence_timestamp_repair_v3"


def _repair_checklist_evidence_timestamp_provenance():
    """One-time, flag-tracked repair for damage the v2 backfill caused
    (2026-09-19). Does NOT touch, clear, or require re-running the
    `checklist_evidence_marker_v2` flag — this is a separate, additive
    follow-up step with its own flag, so v2's own "ran once" record stays
    intact and this repair is itself independently safe to retry.

    The bug being repaired: v2's classification was based purely on a
    row's CURRENT content at the moment v2 ran — "currently has
    evidence" got a fresh v2-run-time timestamp (overwriting whatever
    evidence_recorded_at already held, even if it was a real one from an
    actual prior update_checklist save), "currently blank" got
    evidence_recorded_at forced to NULL (erasing whatever was there,
    even if it was real). Both directions destroyed genuine history
    based on content alone, exactly the mistake the *first* version of
    this backfill was written to avoid making for the "was it ever
    filled in" question — it just made the same category of mistake one
    level deeper, for the "when" question.

    The fix: audit_logs is authoritative and was never touched by either
    buggy migration (both write directly via SQL, bypassing
    checklist_service.py's log_audit entirely) — every REAL save through
    update_checklist always creates a corresponding UPDATE audit_logs
    entry. So: for every Checklist instance row that v2 already touched
    (identified by `evidence_historical_unknown IS TRUE OR
    evidence_recorded_at IS NOT NULL` — the two states v2's logic could
    have left a row in; a row with NEITHER set was never touched by v2
    at all, e.g. created afterward, and is left completely alone here):

      1. Scan that row's audit_logs UPDATE history for the EARLIEST entry
         whose logged new_value shows real evidence being introduced
         (reusing checklist_service.py's own `_touched_fields_carry_results`
         predicate against the parsed new_value, so this can never
         disagree with what counts as "evidence" everywhere else).
      2. If found: that entry's timestamp IS a real, provable first-save
         moment — set evidence_recorded_at to it (correcting whatever v2
         wrote), evidence_recorded_at_reliable=True,
         evidence_historical_unknown=False. This can restore a real
         timestamp even for a row v2 left NULLed, if the row's content
         has since been cleared.
      3. If not found: v2's mistake is not recoverable from this row's
         own history — whatever value is CURRENTLY stored in
         evidence_recorded_at is preserved exactly as-is (not cleared,
         not overwritten with a new guess), evidence_recorded_at_reliable
         is set to False (never claim it as a confirmed real moment),
         and evidence_historical_unknown is set to True (still fully
         protected either way).

    Same atomicity/retry contract as v2: the repair UPDATEs and the flag
    INSERT commit together in one transaction; a failure partway through
    leaves nothing written, so the next app start retries cleanly."""
    from services.checklist_service import _touched_fields_carry_results

    try:
        with engine.connect() as conn:
            already_done = conn.execute(text(
                "SELECT 1 FROM migration_flags WHERE flag_name = :flag"
            ), {"flag": _CHECKLIST_EVIDENCE_REPAIR_FLAG}).first()
            if already_done:
                return

            rows = conn.execute(text(
                "SELECT id, evidence_recorded_at, evidence_historical_unknown FROM checklist "
                "WHERE \"itrId\" IS NOT NULL AND \"itrId\" != '' "
                "AND (evidence_historical_unknown = 1 OR evidence_recorded_at IS NOT NULL)"
            )).fetchall()

            if not rows:
                # Nothing v2 touched (e.g. v2 never ran on this DB, or
                # found no instances at all) — still record that v3 ran,
                # so a later restart doesn't keep re-checking for nothing.
                conn.execute(text(
                    "INSERT INTO migration_flags (flag_name, completed_at) VALUES (:flag, :ts)"
                ), {"flag": _CHECKLIST_EVIDENCE_REPAIR_FLAG, "ts": datetime.now().isoformat()})
                conn.commit()
                return

            audit_rows = conn.execute(text(
                "SELECT entity_id, timestamp, new_value FROM audit_logs "
                "WHERE entity_type = 'Checklist' AND action = 'UPDATE' "
                "ORDER BY entity_id, timestamp ASC"
            )).fetchall()
            # Earliest evidence-introducing UPDATE per checklist id, from
            # real (log_audit-recorded) saves only.
            earliest_real_evidence_ts = {}
            for arow in audit_rows:
                if arow.entity_id in earliest_real_evidence_ts:
                    continue  # already found this row's earliest — audit_rows is timestamp-ordered
                try:
                    parsed_new_value = json.loads(arow.new_value) if arow.new_value else None
                except (TypeError, ValueError):
                    parsed_new_value = None
                if isinstance(parsed_new_value, dict) and _touched_fields_carry_results(parsed_new_value):
                    earliest_real_evidence_ts[arow.entity_id] = arow.timestamp

            restored = 0
            preserved_unreliable = 0
            for row in rows:
                real_ts = earliest_real_evidence_ts.get(row.id)
                if real_ts:
                    conn.execute(text(
                        "UPDATE checklist SET evidence_recorded_at = :ts, "
                        "evidence_recorded_at_reliable = 1, evidence_historical_unknown = 0 "
                        "WHERE id = :id"
                    ), {"ts": real_ts, "id": row.id})
                    restored += 1
                else:
                    # Preserve whatever is already stored — do not clear,
                    # do not overwrite with a new guess.
                    conn.execute(text(
                        "UPDATE checklist SET evidence_recorded_at_reliable = 0, "
                        "evidence_historical_unknown = 1 WHERE id = :id"
                    ), {"id": row.id})
                    preserved_unreliable += 1

            timestamp = datetime.now().isoformat()
            conn.execute(text(
                "INSERT INTO migration_flags (flag_name, completed_at) VALUES (:flag, :ts)"
            ), {"flag": _CHECKLIST_EVIDENCE_REPAIR_FLAG, "ts": timestamp})

            conn.commit()

            logger.info(
                f"Checklist evidence-timestamp provenance repair complete: "
                f"{restored} instance(s) had a real first-evidence moment reconstructed "
                f"from audit_logs, {preserved_unreliable} had no corroborating audit "
                f"history so their existing value (if any) was preserved as-is and marked "
                f"unreliable/historical-unknown. This will not run again."
            )
    except Exception as e:
        logger.warning(f"Checklist evidence-timestamp provenance repair skipped (safe to retry next start): {e}")


_CHECKLIST_EVIDENCE_RELIABILITY_REPAIR_FLAG = "checklist_evidence_reliability_repair_v4"


def _repair_checklist_evidence_first_time_reliability():
    """One-time, flag-tracked repair for a bug in v3's own reconstruction
    logic (2026-09-19, same day). Does NOT touch, clear, or require
    re-running `checklist_evidence_marker_v2` or
    `checklist_evidence_timestamp_repair_v3` — this is a third, separate,
    additive follow-up with its own flag.

    The bug being repaired: v3 treated the EARLIEST audit_logs UPDATE
    entry whose new_value showed evidence as a provable "first recorded"
    moment, based only on new_value. Independently reproduced
    counter-example: the one visible UPDATE entry for a row already had
    evidence in its OLD_value (i.e. it was a correction of already-
    existing content, not an introduction of new content) — v3 still
    marked it evidence_recorded_at_reliable=True. That cannot be a first-
    save moment; a correction of pre-existing evidence proves evidence
    existed even EARLIER, not that this UPDATE is when it began.

    A stricter check ("does old_value ALSO lack evidence") is still not
    sufficient on its own: this codebase had a real missing-commit-after-
    log_audit bug (found and fixed elsewhere in this same hardening
    effort), so "earliest audit_logs entry we can find" is not
    necessarily "the first time this ever happened" — a still-earlier
    fill-then-clear cycle could have occurred and left no trace, even for
    a row whose earliest visible old_value happens to look blank. So for
    any row that predates this whole tracking mechanism, a genuinely
    provable first-save moment cannot be reconstructed after the fact at
    all — only instances tracked continuously since their own creation
    (i.e. their first real save happens through update_checklist itself,
    live, after every part of this mechanism already existed) can ever
    be trusted as reliable.

    The fix: re-examine every row currently marked
    evidence_recorded_at_reliable=True.
      - If its evidence_recorded_at timestamp is AFTER v3's own
        completed_at (from migration_flags) — this can only have been
        set by a genuine LIVE update_checklist save that happened after
        v3 last ran (v3 never runs again, by its own one-time-flag
        contract), so it is a real, continuously-tracked first save.
        Left completely untouched.
      - Otherwise — this row was in scope for v3's own (flawed) sweep and
        its current reliable=True status cannot be trusted as-is. It is
        re-derived using the corrected rule (a genuine old_value-lacks-
        evidence / new_value-has-evidence TRANSITION, not just any
        evidence-containing new_value):
          - If such a transition is found in audit_logs: its timestamp is
            kept as a known moment evidence was confirmed to exist (more
            informative than an arbitrary migration run-time), but
            evidence_recorded_at_reliable is set to False and
            evidence_historical_unknown to True — never claimed as a
            proven first-save time, per the reasoning above.
          - If not found: whatever evidence_recorded_at value is already
            stored is preserved exactly as-is (never cleared or
            replaced), only the reliability label changes, same as
            above.

    No row's evidence_recorded_at is ever fabricated or blanked by this
    repair, and no row that is genuinely safe (a live save after v3's own
    completion) is downgraded. Same atomicity/retry contract as v2/v3:
    the repair UPDATEs and the flag INSERT commit together in one
    transaction."""
    from services.checklist_service import _touched_fields_carry_results

    try:
        with engine.connect() as conn:
            already_done = conn.execute(text(
                "SELECT 1 FROM migration_flags WHERE flag_name = :flag"
            ), {"flag": _CHECKLIST_EVIDENCE_RELIABILITY_REPAIR_FLAG}).first()
            if already_done:
                return

            v3_flag_row = conn.execute(text(
                "SELECT completed_at FROM migration_flags WHERE flag_name = :flag"
            ), {"flag": _CHECKLIST_EVIDENCE_REPAIR_FLAG}).first()

            def _mark_done_and_commit():
                conn.execute(text(
                    "INSERT INTO migration_flags (flag_name, completed_at) VALUES (:flag, :ts)"
                ), {"flag": _CHECKLIST_EVIDENCE_RELIABILITY_REPAIR_FLAG, "ts": datetime.now().isoformat()})
                conn.commit()

            if v3_flag_row is None:
                # v3 never ran on this DB -- any reliable=True row can only
                # have come from a genuine live update_checklist save.
                # Nothing to repair; just record that this step ran.
                _mark_done_and_commit()
                return

            v3_completed_at = v3_flag_row.completed_at

            candidates = conn.execute(text(
                "SELECT id, evidence_recorded_at FROM checklist "
                "WHERE \"itrId\" IS NOT NULL AND \"itrId\" != '' "
                "AND evidence_recorded_at_reliable = 1"
            )).fetchall()

            # A row's own evidence_recorded_at postdating v3's own
            # completion is proof it can only have been set live,
            # afterward (v3 never runs again) -- safe, leave alone.
            # Anything at or before v3's completion (or with no timestamp
            # at all) could have been set/confirmed BY v3's own flawed
            # reconstruction and must be re-examined.
            suspect_ids = [
                row.id for row in candidates
                if not row.evidence_recorded_at or row.evidence_recorded_at <= v3_completed_at
            ]

            if not suspect_ids:
                _mark_done_and_commit()
                return

            placeholders = ",".join(f":id{i}" for i in range(len(suspect_ids)))
            params = {f"id{i}": v for i, v in enumerate(suspect_ids)}
            audit_rows = conn.execute(text(
                f"SELECT entity_id, timestamp, old_value, new_value FROM audit_logs "
                f"WHERE entity_type = 'Checklist' AND action = 'UPDATE' "
                f"AND entity_id IN ({placeholders}) "
                f"ORDER BY entity_id, timestamp ASC"
            ), params).fetchall()

            # Earliest genuine blank-evidence -> has-evidence TRANSITION
            # per checklist id -- a stricter, more meaningful "known
            # sighting" than v3's "new_value merely shows evidence"
            # check, though per the reasoning above it is still never
            # promoted to reliable=True for a pre-existing row.
            earliest_transition_ts = {}
            for arow in audit_rows:
                if arow.entity_id in earliest_transition_ts:
                    continue  # already found this row's earliest -- audit_rows is timestamp-ordered
                try:
                    parsed_old = json.loads(arow.old_value) if arow.old_value else None
                except (TypeError, ValueError):
                    parsed_old = None
                try:
                    parsed_new = json.loads(arow.new_value) if arow.new_value else None
                except (TypeError, ValueError):
                    parsed_new = None
                old_has_evidence = isinstance(parsed_old, dict) and _touched_fields_carry_results(parsed_old)
                new_has_evidence = isinstance(parsed_new, dict) and _touched_fields_carry_results(parsed_new)
                if new_has_evidence and not old_has_evidence:
                    earliest_transition_ts[arow.entity_id] = arow.timestamp

            downgraded = 0
            for checklist_id in suspect_ids:
                known_sighting_ts = earliest_transition_ts.get(checklist_id)
                if known_sighting_ts:
                    conn.execute(text(
                        "UPDATE checklist SET evidence_recorded_at = :ts, "
                        "evidence_recorded_at_reliable = 0, evidence_historical_unknown = 1 "
                        "WHERE id = :id"
                    ), {"ts": known_sighting_ts, "id": checklist_id})
                else:
                    # No qualifying transition found -- preserve whatever
                    # is already stored, exactly as-is.
                    conn.execute(text(
                        "UPDATE checklist SET evidence_recorded_at_reliable = 0, "
                        "evidence_historical_unknown = 1 WHERE id = :id"
                    ), {"id": checklist_id})
                downgraded += 1

            conn.execute(text(
                "INSERT INTO migration_flags (flag_name, completed_at) VALUES (:flag, :ts)"
            ), {"flag": _CHECKLIST_EVIDENCE_RELIABILITY_REPAIR_FLAG, "ts": datetime.now().isoformat()})
            conn.commit()

            if downgraded:
                logger.info(
                    f"Checklist evidence first-time-reliability repair complete: "
                    f"{downgraded} row(s) previously (over-confidently) marked "
                    f"reliable=True by v3 were downgraded to historical_unknown=True "
                    f"(evidence_recorded_at preserved or re-derived from a genuine "
                    f"evidence-appearance transition, never fabricated or cleared). "
                    f"Rows whose evidence_recorded_at postdates v3's own completion "
                    f"were left untouched -- those can only have been set by a live "
                    f"save after v3 last ran and remain genuinely reliable. This will "
                    f"not run again."
                )
    except Exception as e:
        logger.warning(f"Checklist evidence first-time-reliability repair skipped (safe to retry next start): {e}")
