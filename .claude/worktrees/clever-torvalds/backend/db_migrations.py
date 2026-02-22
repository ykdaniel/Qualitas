from sqlalchemy import text
from sqlalchemy.orm import Session
from database import engine

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
    except Exception:
        pass  # index may already exist or column has duplicates

def run_migrations():
    """Run all database migrations"""
    print("Running database migrations...")
    
    # 1. Add unique constraint to reference_sequences
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_ref_seq_unique ON reference_sequences (project, vendor, doc)"))
            conn.commit()
    except Exception:
        pass

    # 2. Add unique indexes
    with engine.connect() as conn:
        for table, column in ALLOWED_INDEX_CONFIGS:
            add_unique_index_if_not_exists(conn, table, column)

    # 3. Add missing columns (NCR, NOI, ITP, etc.)
    _add_missing_columns()
    
    # 4. Create document_naming_rules
    _create_naming_rules_table()
    
    print("Migrations completed.")

def _add_missing_columns():
    try:
        with engine.connect() as conn:
            # NCR
            _add_column_if_missing(conn, "ncr", "dueDate", "TEXT")
            _add_column_if_missing(conn, "ncr", "last_reminded_at", "TEXT")
            _add_column_if_missing(conn, "ncr", "attachments", "TEXT")
            _add_column_if_missing(conn, "ncr", "noiNumber", "VARCHAR")
            
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

            # FollowUp
            _add_column_if_missing(conn, "followup", "last_reminded_at", "TEXT")
            
            # PQP
            _add_column_if_missing(conn, "pqp", "attachments", "TEXT")
            
            # Checklist
            _add_column_if_missing(conn, "checklist", "noiNumber", "VARCHAR")
            
            conn.commit()
    except Exception as e:
        print(f"Migration warning: {e}")

def _add_column_if_missing(conn, table, column, type_def):
    try:
        result = conn.execute(text(f"PRAGMA table_info({table})"))
        columns = [row[1] for row in result]
        if column not in columns:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {type_def}"))
    except Exception:
        pass

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
    except Exception:
        pass
