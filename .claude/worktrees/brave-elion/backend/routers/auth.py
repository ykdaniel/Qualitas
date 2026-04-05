from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from datetime import timedelta
import logging

from database import get_db
import crud
import schemas
from core.config import settings
from core.security import verify_password, create_access_token, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Auth"])

@router.post("/auth/login")
async def login_for_access_token(
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Login endpoint that sets httpOnly cookies for secure token storage.
    Tokens are NOT returned in the response body for security.
    """
    user = crud.get_user_by_username(db, username=form_data.username)
    if not user:
        user = crud.get_user_by_email(db, email=form_data.username)

    if not user or not verify_password(form_data.password, user.hashed_password):
        # Log failed login attempt (security audit)
        logger.warning(f"Failed login attempt for user: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Create access token
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=access_token_expires
    )

    # SECURITY: Set httpOnly cookie (not accessible via JavaScript)
    response.set_cookie(
        key="access_token",
        value=f"Bearer {access_token}",
        httponly=True,  # Prevents XSS attacks
        secure=settings.ENVIRONMENT == "production",  # HTTPS only in production
        samesite="lax",  # CSRF protection
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,  # seconds
        path="/"
    )

    logger.info(f"Successful login for user: {user.username}")

    # Return success message (NO token in response body for security)
    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name
        }
    }

@router.post("/auth/logout")
async def logout(response: Response):
    """
    Logout endpoint that clears the httpOnly cookie.
    """
    response.delete_cookie(key="access_token", path="/")
    return {"message": "Logout successful"}

@router.get("/auth/verify")
async def auth_verify(current_user: schemas.User = Depends(get_current_user)):
    """Verify if the current session is valid."""
    return {"ok": True, "user_id": current_user.id}

@router.get("/user/profile", response_model=schemas.User)
async def read_users_me(current_user: schemas.User = Depends(get_current_user)):
    """Get current user profile."""
    return current_user
