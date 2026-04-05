from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./qualitas.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)

def check_columns(table, columns):
    with engine.connect() as conn:
        result = conn.execute(text(f"PRAGMA table_info({table})"))
        existing_columns = [row[1] for row in result]
        print(f"Checking table '{table}':")
        for col in columns:
            if col in existing_columns:
                print(f"  [OK] Column '{col}' exists.")
            else:
                print(f"  [FAIL] Column '{col}' MISSING!")

tables_to_check = {
    "ncr": ["last_reminded_at", "dueDate"],
    "itp": ["last_reminded_at", "dueDate"],
    "noi": ["last_reminded_at", "dueDate"],
    "obs": ["last_reminded_at", "dueDate"],
    "itr": ["last_reminded_at", "dueDate"],
    "followup": ["last_reminded_at"]
}

for table, cols in tables_to_check.items():
    check_columns(table, cols)
