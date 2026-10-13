from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from jose import JWTError, jwt
from pydantic import BaseModel
from sqlalchemy.orm import Session

import schemas
from core.auth_cookies import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    clear_auth_cookies,
    set_auth_cookies,
)
from core.config import settings
from core.security import (
    blacklist_token,
    create_access_token,
    create_refresh_token,
    get_current_user,
    is_token_blacklisted,
    oauth2_scheme,
    verify_password,
)
from core.dependencies import get_user_service
from core.refusals import RefusalHTTPException
from core.scope import bound_project_ids, is_admin_user, working_project_id
from core.utils import log_audit
from database import get_db
from services.user_service import UserService

# Account-lockout policy
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION = timedelta(minutes=15)

router = APIRouter(tags=["Auth"])
logger = logging.getLogger(__name__)


def _sign_in_project(user, db: Session) -> str | None:
    """The project a fresh sign-in starts in (REF-PROJECT-SEQ-2026-001 B1): a non-admin bound to exactly ONE project
    works in it straight away; bound to several, they choose it first (POST /auth/select-project); admins and
    non-members get none."""
    if is_admin_user(user):
        return None
    bound = bound_project_ids(user, db)
    return next(iter(bound)) if len(bound) == 1 else None


def _token_data(user, project_id: str | None) -> dict:
    data = {"sub": user.username, "user_id": user.id}
    if project_id:
        data["project_id"] = project_id
    return data

@router.post("/auth/login", response_model=schemas.AuthResult)
async def login_for_access_token(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    user_service: UserService = Depends(get_user_service),
    db: Session = Depends(get_db),
):
    # OAuth2PasswordRequestForm doesn't include 2FA — pull it from extra form data
    form = await request.form()
    otp_code = form.get("otp")
    client_ip = request.client.host if request.client else "unknown"
    try:
        user = user_service.get_user_by_username(username=form_data.username)
        if not user:
            user = user_service.get_user_by_email(email=form_data.username)

        # Account lockout check (before doing password verification).
        # Slows down per-username attacks even when attacker rotates IPs.
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if user and user.locked_until and user.locked_until > now:
            remaining = (user.locked_until - now).total_seconds()
            log_audit(db, "LOGIN_FAILED_LOCKED", "User", str(user.id),
                      entity_name=user.username, username=form_data.username,
                      reason=f"Account locked from {client_ip}; {int(remaining)}s remaining")
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"Account temporarily locked due to repeated failed logins. Try again in {int(remaining/60)+1} minute(s).",
            )

        password_ok = False
        if user and user.hashed_password:
            try:
                password_ok = verify_password(form_data.password, user.hashed_password)
            except Exception:
                logger.exception(
                    "Password verification failed for user=%s (record may be malformed)",
                    getattr(user, "username", form_data.username),
                )
                password_ok = False

        # There is deliberately NO environment-variable / "rescue" password path
        # here (removed 2026-09-20): in every environment a login must pass the
        # stored password check, and then the checks below (deactivated account,
        # 2FA) and above (lockout). INITIAL_ADMIN_PASSWORD is only the password SOURCE
        # when db_seeder first creates the very first administrator; afterwards it
        # is just that account's ordinary stored password until it is changed.

        if not user or not password_ok:
            # Increment failure counter & lock if threshold reached.
            if user is not None:
                user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
                if user.failed_login_attempts >= LOCKOUT_THRESHOLD:
                    user.locked_until = now + LOCKOUT_DURATION
                    log_audit(db, "ACCOUNT_LOCKED", "User", str(user.id),
                              entity_name=user.username, username=form_data.username,
                              reason=f"{user.failed_login_attempts} failed attempts from {client_ip}")
                else:
                    log_audit(db, "LOGIN_FAILED", "User", str(user.id),
                              entity_name=user.username, username=form_data.username,
                              reason=f"Bad password from {client_ip} (attempt {user.failed_login_attempts}/{LOCKOUT_THRESHOLD})")
                db.commit()
            else:
                # Don't reveal account-existence; still log the attempt.
                log_audit(db, "LOGIN_FAILED", "User", "unknown",
                          entity_name=form_data.username, username=form_data.username,
                          reason=f"Unknown account from {client_ip}")
                db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # A deactivated account must not be handed fresh session cookies (before
        # this check the login succeeded and only the NEXT request was refused).
        # Reached only with a correct password, so it reveals nothing to a guesser.
        if not user.is_active:
            log_audit(db, "LOGIN_FAILED_INACTIVE", "User", str(user.id),
                      entity_name=user.username, username=form_data.username,
                      reason=f"Deactivated account from {client_ip}")
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is deactivated",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # If user has 2FA enabled, require the OTP code as well.
        if user.totp_enabled:
            import pyotp  # local import keeps cold-start overhead low for users without 2FA
            if not otp_code:
                log_audit(db, "LOGIN_FAILED_2FA_REQUIRED", "User", str(user.id),
                          entity_name=user.username, username=form_data.username,
                          reason=f"From {client_ip}")
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="2FA code required",
                    headers={"WWW-Authenticate": "Bearer", "X-2FA-Required": "true"},
                )
            if not pyotp.TOTP(user.totp_secret or "").verify(otp_code, valid_window=1):
                user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
                if user.failed_login_attempts >= LOCKOUT_THRESHOLD:
                    user.locked_until = now + LOCKOUT_DURATION
                log_audit(db, "LOGIN_FAILED_2FA", "User", str(user.id),
                          entity_name=user.username, username=form_data.username,
                          reason=f"Invalid OTP from {client_ip}")
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid 2FA code",
                )

        # Successful login — reset lockout state and audit-log it.
        if user.failed_login_attempts or user.locked_until:
            user.failed_login_attempts = 0
            user.locked_until = None
        log_audit(db, "LOGIN_SUCCESS", "User", str(user.id),
                  entity_name=user.username, user_id=user.id, username=user.username,
                  reason=f"From {client_ip}{' (2FA)' if user.totp_enabled else ''}")
        db.commit()

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
        token_data = _token_data(user, _sign_in_project(user, db))
        access_token = create_access_token(data=token_data, expires_delta=access_token_expires)
        refresh_token = create_refresh_token(data=token_data, expires_delta=refresh_token_expires)
        # Deliver the JWTs as httpOnly cookies ONLY — never in the response body,
        # so an XSS cannot exfiltrate them from JS-readable storage.
        set_auth_cookies(response, access_token, refresh_token)
        return {"token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unhandled error in /api/auth/login")
        if settings.ENVIRONMENT != "production":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Login internal error: {type(exc).__name__}: {exc}",
            )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error",
        )

@router.get("/auth/verify")
async def auth_verify(current_user: schemas.User = Depends(get_current_user)):
    return {"ok": True}


@router.post("/auth/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Blacklist the current access (and refresh) tokens, then clear cookies."""
    # Blacklist whichever access token was presented (cookie or header)
    cookie_access = request.cookies.get(ACCESS_COOKIE_NAME)
    if cookie_access:
        blacklist_token(cookie_access)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        blacklist_token(auth_header[7:])
    # Also revoke the refresh token if it's in the cookie
    cookie_refresh = request.cookies.get(REFRESH_COOKIE_NAME)
    if cookie_refresh:
        blacklist_token(cookie_refresh)
    clear_auth_cookies(response)
    log_audit(db, "LOGOUT", "User", str(current_user.id),
              entity_name=current_user.username, user_id=current_user.id,
              username=current_user.username)
    db.commit()
    return {"ok": True, "detail": "Successfully logged out"}


@router.post("/auth/logout-all")
async def logout_all_devices(
    response: Response,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Invalidate every active session for this user across all devices.

    Sets `tokens_valid_after` to now; any token whose `iat` predates this is
    rejected by `get_current_user`. Use after a suspected credential leak.
    """
    import models
    user = db.query(models.User).filter_by(id=current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    user.tokens_valid_after = now
    log_audit(db, "LOGOUT_ALL_DEVICES", "User", str(user.id),
              entity_name=user.username, user_id=user.id, username=user.username,
              reason="Bulk session revocation")
    db.commit()
    clear_auth_cookies(response)
    return {"ok": True, "detail": "All sessions invalidated"}


class RefreshRequest(BaseModel):
    refresh_token: str | None = None

@router.post("/auth/refresh", response_model=schemas.AuthResult)
async def refresh_access_token(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    user_service: UserService = Depends(get_user_service),
):
    """Use a valid refresh token to get a new access + refresh token pair.

    The refresh token is read from the httpOnly refresh_token cookie (the body
    field is accepted only as a transitional fallback). New tokens are returned
    as cookies only, never in the body.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token and body is not None:
        refresh_token = body.refresh_token
    if not refresh_token:
        raise credentials_exception

    # Reject blacklisted refresh tokens
    if is_token_blacklisted(refresh_token):
        raise credentials_exception

    try:
        payload = jwt.decode(refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        if payload.get("type") != "refresh":
            raise credentials_exception
        username: str | None = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = user_service.get_user_by_username(username=username)
    if user is None:
        raise credentials_exception
    # No new credentials for a deactivated account, and none from a refresh
    # token issued before an account-wide revocation / deactivation cutoff
    # (same rule get_current_user applies to access tokens) — otherwise a
    # re-activated account would get its old sessions back.
    if not user.is_active:
        raise credentials_exception
    cutoff = getattr(user, "tokens_valid_after", None)
    if cutoff is not None:
        iat = payload.get("iat")
        if iat is None or datetime.fromtimestamp(iat, tz=timezone.utc) < (
            cutoff.replace(tzinfo=timezone.utc) if cutoff.tzinfo is None else cutoff
        ):
            raise credentials_exception

    # Blacklist the consumed refresh token (single-use rotation)
    blacklist_token(refresh_token)

    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    # The project chosen at sign-in carries over (still only honoured while the user is bound to it).
    token_data = _token_data(user, payload.get("project_id"))
    new_access = create_access_token(data=token_data, expires_delta=access_token_expires)
    new_refresh = create_refresh_token(data=token_data, expires_delta=refresh_token_expires)
    set_auth_cookies(response, new_access, new_refresh)
    return {"token_type": "bearer"}

@router.post("/auth/select-project", response_model=schemas.AuthResult)
async def select_project(
    body: schemas.SelectProjectRequest,
    request: Request,
    response: Response,
    current_user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """A non-admin bound to several projects chooses the ONE they work in for this session (business decision D5:
    chosen once after sign-in, not switchable — switching means signing in again). Issues a new token pair carrying the
    project and revokes the presented one."""
    if is_admin_user(current_user):
        raise RefusalHTTPException(400, "Administrators choose a project from the project menu; no project selection is needed.",
                                   "ADMIN_NO_PROJECT_SELECTION")
    if getattr(current_user, "token_project_id", None):
        raise RefusalHTTPException(409, "This session already works in a project. To work in another project, sign out and sign in again.",
                                   "PROJECT_ALREADY_CHOSEN")
    bound = bound_project_ids(current_user, db)
    if body.project_id not in bound:
        raise RefusalHTTPException(403, "You are not a member of this project." if bound else
                                   "You are not a member of any project. Ask a system administrator to assign you to a project.",
                                   "NOT_PROJECT_MEMBER")
    for name in (ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME):          # the project-less session ends here
        presented = request.cookies.get(name)
        if presented:
            blacklist_token(presented)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        blacklist_token(auth_header[7:])
    token_data = _token_data(current_user, body.project_id)
    set_auth_cookies(
        response,
        create_access_token(data=token_data, expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)),
        create_refresh_token(data=token_data, expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)),
    )
    log_audit(db, "SELECT_PROJECT", "User", str(current_user.id), entity_name=current_user.username,
              user_id=current_user.id, username=current_user.username, reason=f"Works in project {body.project_id}")
    db.commit()
    return {"token_type": "bearer"}


@router.get("/user/profile", response_model=schemas.UserProfile)
async def read_users_me(current_user=Depends(get_current_user), db: Session = Depends(get_db)):
    import models
    base = schemas.User.model_validate(current_user).model_dump()
    if is_admin_user(current_user):
        return schemas.UserProfile(**base, is_admin=True, project_status="admin")
    bound = bound_project_ids(current_user, db)
    projects = db.query(models.Project).filter(models.Project.id.in_(bound)).order_by(models.Project.name).all() if bound else []
    current = working_project_id(current_user, db)
    if current:
        status_ = "working"
    elif getattr(current_user, "token_project_id", None) and bound:
        status_ = "relogin"          # the project this session was signed in to was taken away; sign in again
    elif len(bound) > 1:
        status_ = "choose"
    else:
        status_ = "non_member"
    return schemas.UserProfile(**base, projects=[schemas.ProjectBrief.model_validate(p) for p in projects],
                               current_project_id=current, project_status=status_)
