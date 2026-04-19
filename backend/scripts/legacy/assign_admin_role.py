from database import SessionLocal
from models import Role, User


def assign_admin():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == "admin").first()
        role = db.query(Role).filter(Role.name == "ADMIN").first()

        if user and role:
            print(f"Assigning role {role.name} to user {user.username}")
            user.role_id = role.id
            db.commit()
            print("Done.")
        else:
            print("User or Role not found.")
            if not user: print("User 'admin' not found.")
            if not role: print("Role 'ADMIN' not found.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    assign_admin()
