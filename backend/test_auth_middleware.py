import asyncio
from sqlalchemy.orm import Session
from database import SessionLocal
from middleware.auth import get_current_user
from core.config import settings
from jose import jwt
import crud
import models

def create_test_token(username: str):
    data = {"sub": username}
    return jwt.encode(data, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

async def test_auth():
    db = SessionLocal()
    try:
        # Ensure admin user exists
        user = crud.get_user_by_username(db, "admin")
        if not user:
            print("User 'admin' not found!")
            return

        print(f"Found user: {user.username}, Role: {user.role_name}")

        # Create token
        token = create_test_token(user.username)
        print(f"Generated Token: {token[:20]}...")

        # Test get_current_user
        try:
            authenticated_user = await get_current_user(token=token, db=db)
            print(f"Authentication Successful: {authenticated_user.username}")
            print(f"Role Name from Auth User: {authenticated_user.role_name}")
        except Exception as e:
            print(f"Authentication Failed: {e}")

    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(test_auth())
