"""
Cookie-based authentication helpers.

Why this module exists: the original auth flow only used Bearer tokens stored
in browser localStorage, which is XSS-vulnerable. We're migrating to httpOnly
cookies for the JWTs, with a non-httpOnly CSRF cookie for double-submit
protection. The migration is staged — both Bearer and cookie auth coexist so
existing logged-in sessions don't break on deploy.

Cookie flags:
- access_token / refresh_token: httpOnly so JavaScript cannot read them, even
  via XSS. Secure means HTTPS-only (relaxed in development). SameSite=Lax
  blocks cross-site POSTs by default; combined with the X-CSRF-Token header
  check, we get defense in depth against CSRF.
- csrf_token: deliberately NOT httpOnly. The frontend reads it and echoes it
  back in the X-CSRF-Token header on state-changing requests. Server compares
  cookie value vs header (double-submit pattern).
"""
import secrets
from datetime import timedelta

from fastapi import Response

from core.config import settings


ACCESS_COOKIE_NAME = "access_token"
REFRESH_COOKIE_NAME = "refresh_token"
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "x-csrf-token"


def _is_secure() -> bool:
    """Use Secure flag in production. Local dev (HTTP) skips it so cookies work."""
    return settings.ENVIRONMENT == "production"


def generate_csrf_token() -> str:
    """Return a random URL-safe token suitable for a CSRF cookie."""
    return secrets.token_urlsafe(32)


def set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
    csrf_token: str | None = None,
) -> str:
    """Attach access/refresh/csrf cookies to the response. Returns the CSRF token."""
    csrf = csrf_token or generate_csrf_token()
    secure = _is_secure()
    access_max_age = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_max_age = int(timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())

    response.set_cookie(
        key=ACCESS_COOKIE_NAME,
        value=access_token,
        max_age=access_max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=refresh_max_age,
        httponly=True,
        secure=secure,
        samesite="lax",
        # Limit refresh-cookie scope to /api/auth so it isn't transmitted on
        # every request — minimizes exposure.
        path="/api/auth",
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=csrf,
        max_age=access_max_age,
        httponly=False,  # frontend JS must read this to echo in header
        secure=secure,
        samesite="lax",
        path="/",
    )
    return csrf


def clear_auth_cookies(response: Response) -> None:
    """Remove all auth-related cookies (logout)."""
    response.delete_cookie(ACCESS_COOKIE_NAME, path="/")
    response.delete_cookie(REFRESH_COOKIE_NAME, path="/api/auth")
    response.delete_cookie(CSRF_COOKIE_NAME, path="/")
