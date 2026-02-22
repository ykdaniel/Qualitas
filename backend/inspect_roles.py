from sqlalchemy.orm import Session
from database import SessionLocal
from models import Role

def inspect_roles():
    db = SessionLocal()
    try:
        roles = db.query(Role).all()
        print(f"Total Roles Found: {len(roles)}")
        for role in roles:
            print(f"Role: {role.name} (ID: {role.id})")
            try:
                print(f"  Permissions: {[p.code for p in role.permissions_rel]}")
            except Exception as e:
                print(f"  Error reading permissions: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    inspect_roles()
