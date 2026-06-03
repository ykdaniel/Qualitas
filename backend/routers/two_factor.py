"""
TOTP-based 2FA endpoints.

Flow:
  1. User calls POST /auth/2fa/setup → server generates a fresh secret,
     stores it as `totp_secret` (totp_enabled stays False), returns the
     provisioning URI + a base64-encoded QR PNG.
  2. User scans the QR with an authenticator app (Google Authenticator,
     Authy, 1Password, etc.) and types the current 6-digit code.
  3. User calls POST /auth/2fa/enable with that code. If verify passes,
     totp_enabled = True. From the next login onwards, password alone is
     not enough — the user must also supply an `otp` value.
  4. To disable, POST /auth/2fa/disable with current password + a fresh
     TOTP code (so a stolen session alone can't strip the second factor).
"""
import base64
import io
import logging

import pyotp
import qrcode
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
import schemas
from core.config import settings
from core.security import get_current_user, verify_password
from core.utils import log_audit
from database import get_db

router = APIRouter(prefix="/auth/2fa", tags=["Auth 2FA"])
logger = logging.getLogger(__name__)


def _provisioning_uri(secret: str, username: str) -> str:
    issuer = settings.PROJECT_NAME or "Qualitas"
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer)


def _qr_data_url(provisioning_uri: str) -> str:
    img = qrcode.make(provisioning_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


class TOTPCodePayload(BaseModel):
    otp: str


class TOTPDisablePayload(BaseModel):
    password: str
    otp: str


@router.post("/setup")
async def setup_totp(
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a new TOTP secret and return enrolment QR. Idempotent until /enable is called."""
    user = db.query(models.User).filter_by(id=current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA is already enabled; disable it before re-enrolling")

    secret = pyotp.random_base32()
    user.totp_secret = secret
    db.commit()

    uri = _provisioning_uri(secret, user.username)
    return {
        "secret": secret,
        "provisioning_uri": uri,
        "qr_data_url": _qr_data_url(uri),
    }


@router.post("/enable")
async def enable_totp(
    payload: TOTPCodePayload,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Verify the user's first TOTP code; only then mark totp_enabled."""
    user = db.query(models.User).filter_by(id=current_user.id).first()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA setup has not been started; call /setup first")
    if user.totp_enabled:
        return {"ok": True, "detail": "2FA is already enabled"}

    if not pyotp.TOTP(user.totp_secret).verify(payload.otp, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    user.totp_enabled = True
    log_audit(db, "2FA_ENABLED", "User", str(user.id), entity_name=user.username,
              user_id=user.id, username=user.username)
    db.commit()
    return {"ok": True, "detail": "2FA enabled"}


@router.post("/disable")
async def disable_totp(
    payload: TOTPDisablePayload,
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable 2FA — requires both current password AND a current TOTP code."""
    user = db.query(models.User).filter_by(id=current_user.id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.totp_enabled:
        return {"ok": True, "detail": "2FA was not enabled"}

    # Re-auth with password (a hijacked session alone shouldn't be able to
    # strip the second factor)
    try:
        password_ok = verify_password(payload.password, user.hashed_password) if user.hashed_password else False
    except Exception:
        password_ok = False
    if not password_ok:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password")

    if not pyotp.TOTP(user.totp_secret or "").verify(payload.otp, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid 2FA code")

    user.totp_enabled = False
    user.totp_secret = None
    log_audit(db, "2FA_DISABLED", "User", str(user.id), entity_name=user.username,
              user_id=user.id, username=user.username)
    db.commit()
    return {"ok": True, "detail": "2FA disabled"}


@router.get("/status")
async def totp_status(
    current_user: schemas.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter_by(id=current_user.id).first()
    return {"enabled": bool(user and user.totp_enabled)}
