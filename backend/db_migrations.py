import logging

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

    logger.info("Migrations completed.")

def _add_missing_columns():
    try:
        with engine.connect() as conn:
            # NCR
            _add_column_if_missing(conn, "ncr", "dueDate", "TEXT")
            _add_column_if_missing(conn, "ncr", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "ncr", "attachments", "TEXT")
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

            # NOI
            for col in ["attachments", "remark", "closeoutDate", "ncrNumber", "dueDate", "last_reminded_at"]:
                _add_column_if_missing(conn, "noi", col, "TEXT")

            # ITP
            _add_column_if_missing(conn, "itp", "detail_data", "TEXT")
            _add_column_if_missing(conn, "itp", "dueDate", "TEXT")
            _add_column_if_missing(conn, "itp", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "itp", "attachments", "TEXT")

            # OBS
            _add_column_if_missing(conn, "obs", "dueDate", "TEXT")
            _add_column_if_missing(conn, "obs", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "obs", "attachments", "TEXT")

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

            # PQP
            _add_column_if_missing(conn, "pqp", "attachments", "TEXT")

            # NCR - itrNumber
            _add_column_if_missing(conn, "ncr", "itrNumber", "VARCHAR")

            # Checklist
            _add_column_if_missing(conn, "checklist", "noiNumber", "VARCHAR")

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
