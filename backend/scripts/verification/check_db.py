
from sqlalchemy import create_engine, text

db_path = "c:\\Users\\YUKAI\\Desktop\\Qualitas\\backend\\qualitas.db"
engine = create_engine(f"sqlite:///{db_path}")

with engine.connect() as conn:
    print("--- USERS ---")
    users = conn.execute(text("SELECT id, username, email, role_id FROM users")).fetchall()
    for u in users:
        print(u)

    print("\n--- ROLES ---")
    roles = conn.execute(text("SELECT id, name FROM roles")).fetchall()
    for r in roles:
        print(r)

    print("\n--- ROLE PERMISSIONS ---")
    rp = conn.execute(text("SELECT * FROM role_permissions")).fetchall()
    for r in rp:
        print(r)

    print("\n--- PERMISSIONS COUNT ---")
    pc = conn.execute(text("SELECT count(*) FROM permissions")).scalar()
    print(f"Total permissions: {pc}")
