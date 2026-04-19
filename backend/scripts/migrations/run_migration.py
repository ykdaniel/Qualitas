import logging

from sqlalchemy import create_engine, text

# Setup Logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SQLALCHEMY_DATABASE_URL = "sqlite:///./qualitas.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

def add_column_if_not_exists(conn, table, column, col_type="TEXT"):
    try:
        result = conn.execute(text(f"PRAGMA table_info({table})"))
        columns = [row[1] for row in result]
        if column not in columns:
            print(f"Adding column '{column}' to table '{table}'...")
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            return True
        else:
            print(f"Column '{column}' already exists in table '{table}'.")
            return False
    except Exception as e:
        print(f"Error checking/adding column {column} to {table}: {e}")
        return False

def run_migration():
    print("Starting manual migration...")
    with engine.connect() as conn:
        # NCR
        add_column_if_not_exists(conn, "ncr", "dueDate")
        add_column_if_not_exists(conn, "ncr", "last_reminded_at")

        # NOI
        for col in ["attachments", "remark", "closeoutDate", "ncrNumber", "dueDate", "last_reminded_at"]:
            add_column_if_not_exists(conn, "noi", col)

        # ITP
        add_column_if_not_exists(conn, "itp", "detail_data")
        add_column_if_not_exists(conn, "itp", "dueDate")
        add_column_if_not_exists(conn, "itp", "last_reminded_at")

        # OBS
        add_column_if_not_exists(conn, "obs", "dueDate")
        add_column_if_not_exists(conn, "obs", "last_reminded_at")

        # ITR
        add_column_if_not_exists(conn, "itr", "dueDate")
        add_column_if_not_exists(conn, "itr", "last_reminded_at")

        # FollowUp
        add_column_if_not_exists(conn, "followup", "last_reminded_at")

        conn.commit()
    print("Migration completed.")

if __name__ == "__main__":
    run_migration()
