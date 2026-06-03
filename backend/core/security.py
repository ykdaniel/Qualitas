import hashlib
import logging
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

import crud
import models
import schemas
from core.config import settings
from database import SessionLocal, get_db

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# Persisted token blacklist (DB-backed)
# ---------------------------------------------------------------------------
# Why: in-memory was cleared on container restart, silently re-validating
# logged-out tokens. We hash + store in `token_blacklist` table; expires_at
# lets cleanup_expired_tokens() reap rows once the JWT has expired anyway.

def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _token_expiry(token: str) -> datetime | None:
    """Decode without exp validation to read the exp claim. Returns None if unreadable."""
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_exp": False},
        )
        exp = payload.get("exp")
        if exp is None:
            return None
        return datetime.fromtimestamp(exp, tz=timezone.utc)
    except JWTError:
        return None


def blacklist_token(token: str) -> None:
    """Add a token to the blacklist so it is rejected on future requests."""
    expiry = _token_expiry(token) or (datetime.now(timezone.utc) + timedelta(days=30))
    digest = _hash_token(token)
    db: Session = SessionLocal()
    try:
        existing = db.query(models.TokenBlacklist).filter_by(token_hash=digest).first()
        if existing:
            existing.expires_at = expiry.replace(tzinfo=None)
        else:
            db.add(models.TokenBlacklist(token_hash=digest, expires_at=expiry.replace(tzinfo=None)))
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist token blacklist entry")
    finally:
        db.close()
    logger.info("Token blacklisted (hash=%s...)", digest[:8])


def is_token_blacklisted(token: str) -> bool:
    """Return True if the token has been revoked."""
    digest = _hash_token(token)
    db: Session = SessionLocal()
    try:
        return db.query(models.TokenBlacklist).filter_by(token_hash=digest).first() is not None
    except Exception:
        logger.exception("Blacklist lookup failed; defaulting to NOT blacklisted")
        return False
    finally:
        db.close()


def cleanup_expired_tokens() -> int:
    """Remove already-expired blacklist rows. Returns the number deleted."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    db: Session = SessionLocal()
    try:
        deleted = db.query(models.TokenBlacklist).filter(models.TokenBlacklist.expires_at < now).delete()
        db.commit()
        if deleted:
            logger.info("Cleaned up %d expired tokens from blacklist", deleted)
        return deleted
    except Exception:
        db.rollback()
        logger.exception("Blacklist cleanup failed")
        return 0
    finally:
        db.close()

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# ... (imports)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=15))
    # iat (issued-at) lets us bulk-revoke a user's sessions by setting
    # User.tokens_valid_after — any token issued before that cutoff is rejected.
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(days=7))
    to_encode.update({"exp": expire, "iat": now, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_current_user(
    request: Request,
    token: str | None = Depends(OAuth2PasswordBearer(tokenUrl="token", auto_error=False)),
    db: Session = Depends(get_db),
):
    """Authenticate via httpOnly access_token cookie OR Authorization Bearer header.

    During migration both paths are supported so existing localStorage-based
    sessions keep working. New logins set the cookie too — once the frontend
    fully migrates we can drop the header path.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Prefer the cookie; fall back to the Authorization header
    if token is None:
        from core.auth_cookies import ACCESS_COOKIE_NAME
        token = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token:
        raise credentials_exception

    # Check blacklist BEFORE any expensive DB lookup
    if is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # Reject refresh tokens being presented as access tokens. Refresh tokens
        # carry "type": "refresh" and are meant for /auth/refresh only; access
        # tokens carry "type": "access" (or, for legacy tokens issued before
        # the type claim existed, no type at all — those we still accept).
        token_type = payload.get("type")
        if token_type is not None and token_type != "access":
            raise credentials_exception
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = schemas.TokenData(username=username)
    except JWTError:
        raise credentials_exception

    from repositories.user_repository import UserRepository
    from services.user_service import UserService
    user_service = UserService(UserRepository(db))
    user = user_service.get_user_by_username(username=token_data.username)
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is deactivated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    # Bulk-revoke check: if the user has triggered "log out everywhere", any
    # token issued before that cutoff is rejected even if not blacklisted.
    cutoff = getattr(user, "tokens_valid_after", None)
    if cutoff is not None:
        token_iat_unix = payload.get("iat")
        if token_iat_unix is None:
            # Legacy token without iat — treat as pre-cutoff (safer) and reject
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token predates account-wide revocation; please log in again",
                headers={"WWW-Authenticate": "Bearer"},
            )
        token_iat = datetime.fromtimestamp(token_iat_unix, tz=timezone.utc)
        cutoff_aware = cutoff.replace(tzinfo=timezone.utc) if cutoff.tzinfo is None else cutoff
        if token_iat < cutoff_aware:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session revoked",
                headers={"WWW-Authenticate": "Bearer"},
            )
    return user
