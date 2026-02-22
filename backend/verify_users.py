from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
from models import User, Role
from database import Base

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./qualitas.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def verify_users():
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"Tables: {tables}")
    
    if "users" not in tables:
        print("Users table missing!")
        return

    users = db.query(User).all()
    print(f"Users found: {len(users)}")
    for user in users:
        print(f"User: {user.username}, Role ID: {user.role_id}")
        
    roles = db.query(Role).all()
    print(f"Roles found: {len(roles)}")
    for role in roles:
        print(f"Role: {role.name} (ID: {role.id})")

if __name__ == "__main__":
    verify_users()
