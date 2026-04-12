import logging
import threading
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

import crud
import schemas
from core.config import settings
from database import get_db

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# In-memory token blacklist (suitable for single-worker / SQLite deployments)
# ---------------------------------------------------------------------------
_token_blacklist: set[str] = set()
_blacklist_lock = threading.Lock()


def blacklist_token(token: str) -> None:
    """Add a token to the blacklist so it is rejected on future requests."""
    with _blacklist_lock:
        _token_blacklist.add(token)
    logger.info("Token blacklisted (hash=%s...)", token[:8])


def is_token_blacklisted(token: str) -> bool:
    """Return True if the token has been revoked."""
    return token in _token_blacklist


def cleanup_expired_tokens() -> int:
    """Remove expired tokens from the blacklist to prevent unbounded growth.

    Returns the number of tokens removed.
    """
    now = datetime.now(timezone.utc)
    to_remove: list[str] = []
    with _blacklist_lock:
        for token in _token_blacklist:
            try:
                payload = jwt.decode(
                    token,
                    settings.SECRET_KEY,
                    algorithms=[settings.ALGORITHM],
                    options={"verify_exp": False},
                )
                exp = payload.get("exp")
                if exp is not None and datetime.fromtimestamp(exp, tz=timezone.utc) < now:
                    to_remove.append(token)
            except JWTError:
                # Corrupt / unreadable token — safe to evict
                to_remove.append(token)
        for token in to_remove:
            _token_blacklist.discard(token)
    if to_remove:
        logger.info("Cleaned up %d expired tokens from blacklist", len(to_remove))
    return len(to_remove)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

# ... (imports)

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(days=7))
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Check blacklist BEFORE any expensive DB lookup
    if is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
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
    return user
