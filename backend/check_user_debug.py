
from sqlalchemy.orm import Session
from database import SessionLocal
import crud
import models
from core.perms import ITP_UPDATE

def check_admin():
    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, "admin")
        if not user:
            print("User 'admin' not found!")
            return

        print(f"User: {user.username} (ID: {user.id})")
        print(f"Is Active: {user.is_active}")
        print(f"Role: {user.role.name} (ID: {user.role.id})")
        
        perms = [p.code for p in user.role.permissions_rel]
        print(f"Permissions: {perms}")
        
        if ITP_UPDATE in perms:
            print(f"SUCCESS: {ITP_UPDATE} is present.")
        else:
            print(f"FAILURE: {ITP_UPDATE} is MISSING!")
            
    finally:
        db.close()

if __name__ == "__main__":
    check_admin()
