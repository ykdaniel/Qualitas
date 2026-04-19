
from sqlalchemy import create_engine, text

db_path = "c:\\Users\\YUKAI\\Desktop\\Qualitas\\backend\\qualitas.db"
engine = create_engine(f"sqlite:///{db_path}")

with engine.connect() as conn:
    print("--- PERMISSION CODES ---")
    perms = conn.execute(text("SELECT code FROM permissions")).fetchall()
    for p in perms:
        print(p[0])
