"""
檔案管理路由
- 上傳檔案至 uploads/ 目錄，並建立 Attachment 記錄
- 查詢指定實體的所有附件
- 軟刪除附件
- 提供經驗證的檔案下載端點
"""
import logging
import mimetypes
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import schemas
from database import get_db
from core.scope import Scope, get_scope, compute_scope, entity_in_scope, attachment_target, find_attachment_record
from core.attachment_access import (
    ENTITY_PERMISSIONS, is_km_image_path, lock_reason, require_attachment_permission, validate_category,
)
from core.uploads import upload_root
from core.utils import lock_ncr_for_write
# Cookie-aware auth (accepts httpOnly access_token cookie OR legacy Bearer
# header). middleware.auth.get_current_user is Bearer-only and 401s the
# cookie-authenticated frontend, which logs the user out when opening a record
# with attachments.
from core.security import get_current_user
from models import Attachment
from schemas import AttachmentResponse

logger = logging.getLogger(__name__)


async def _get_current_user_or_none(
    request: Request,
    db: Session = Depends(get_db),
) -> schemas.User | None:
    """
    Try to resolve the authenticated user from (in order):
      1. Authorization: Bearer ... header (legacy)
      2. access_token httpOnly cookie (preferred)
    Returns None if neither is valid — caller handles the fallback to
    ?token= query-param auth.

    "Valid" means exactly what get_current_user means (core.security.authenticate_access_token): not revoked, an ACCESS token, an active
    account, not older than the account's log-out-everywhere cutoff. (2026-09-21: this used to decode the JWT itself and accept revoked
    tokens, refresh tokens and deactivated accounts.)
    """
    from core.auth_cookies import ACCESS_COOKIE_NAME
    from core.security import authenticate_access_token

    token_str: str | None = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token_str = auth_header[7:]
    if not token_str:
        token_str = request.cookies.get(ACCESS_COOKIE_NAME)
    if not token_str:
        return None
    try:
        return authenticate_access_token(token_str, db)
    except HTTPException:
        return None


async def _resolve_user_from_token(token_str: str, db: Session) -> schemas.User:
    """
    從 query-param token 解析使用者。驗證失敗時拋出 401。Same validation as every other way of presenting an access token.
    """
    from core.security import authenticate_access_token
    try:
        return authenticate_access_token(token_str, db)
    except HTTPException:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


router = APIRouter(prefix="/files", tags=["files"])

# NOTE: 上傳根目錄，由 main.py 啟動時自動建立
# The upload root is core.uploads.upload_root(): backend/uploads unless QUALITAS_UPLOAD_ROOT says otherwise (mandatory, and confined to the
# run directory, in an isolated test process). It is read on every request — there is no module-level constant to import.
_VALID_ENTITY_TYPES = {"itp", "ncr", "noi", "itr", "pqp", "obs", "osd", "fat",
                       "audit", "checklist", "followup", "km", "contractor", "meeting"}

# 允許的 MIME 類型白名單
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf", "application/msword",
                         "application/vnd.openxmlformats", "application/vnd.ms-excel",
                         "text/", "application/zip", "application/x-rar")

MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Magic-byte signatures for common file types
_MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    (b"%PDF", "application/pdf"),
    (b"PK\x03\x04", "application/zip"),         # ZIP / DOCX / XLSX / PPTX
    (b"PK\x05\x06", "application/zip"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "application/msword"),  # OLE2 (doc/xls/ppt)
    (b"Rar!\x1a\x07", "application/x-rar"),
    (b"RIFF", "image/webp"),                     # WEBP (RIFF container)
    (b"BM", "image/bmp"),
]


def _detect_mime_from_content(content: bytes) -> str | None:
    """Detect MIME type from file magic bytes. Returns None if unknown."""
    header = content[:16]
    for signature, mime in _MAGIC_SIGNATURES:
        if header.startswith(signature):
            return mime
    return None


def _validate_upload_mime(content: bytes, filename: str, client_mime: str) -> str:
    """
    Validate the MIME type of an upload using multiple strategies:
    1. Magic-byte detection from file content
    2. Extension-based guess via mimetypes stdlib
    3. Fall back to client-supplied type only if (1) and (2) agree or are unavailable

    Returns the validated MIME type or raises HTTPException if suspicious.
    """
    detected_mime = _detect_mime_from_content(content)
    guessed_mime, _ = mimetypes.guess_type(filename or "file")

    # If we detected a concrete type from magic bytes, use it as the authority
    if detected_mime:
        # For ZIP-based containers (docx/xlsx/pptx), trust the extension
        if detected_mime == "application/zip" and guessed_mime and \
                guessed_mime.startswith("application/vnd.openxmlformats"):
            return guessed_mime
        return detected_mime

    # If magic bytes didn't match but extension gives a known type, use it
    if guessed_mime:
        return guessed_mime

    # Fall back to client-supplied type (already validated against whitelist)
    return client_mime


def _build_file_url(request: Request, file_path: str) -> str:
    """根據請求的 base URL 組裝完整的檔案存取 URL（經驗證端點）"""
    return f"{request.base_url}api/files/download/{file_path}"


def _to_response(attachment: Attachment, request: Request) -> AttachmentResponse:
    """將 ORM 物件轉換為前端回傳格式"""
    return AttachmentResponse(
        id=attachment.id,
        entity_type=attachment.entity_type,
        entity_id=attachment.entity_id,
        file_name=attachment.file_name,
        file_url=_build_file_url(request, attachment.file_path),
        file_size=attachment.file_size,
        mime_type=attachment.mime_type,
        category=attachment.category or "attachment",
        uploaded_by=attachment.uploaded_by,
        uploaded_at=attachment.uploaded_at,
    )


@router.post("/upload", response_model=list[AttachmentResponse])
async def upload_files(
    request: Request,
    entity_type: str = Form(...),
    entity_id: str = Form(...),
    category: str = Form("attachment"),
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(get_current_user),
) -> list[AttachmentResponse]:
    """
    上傳一個或多個檔案
    - entity_type: 關聯模組 (itp / ncr / noi / itr / pqp / obs)
    - entity_id: 關聯記錄 ID
    - category: 檔案分類 (attachment / defectPhoto / improvementPhoto)

    Order (2026-09-20): entity type -> the target record must EXIST and be inside the caller's data scope -> every file is validated ->
    only then anything is written. A refusal at any step leaves no attachment row and no file behind.
    """
    # ── Validate entity_type against known modules ──
    if entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown entity_type '{entity_type}'. Must be one of: {', '.join(sorted(_VALID_ENTITY_TYPES))}",
        )

    # ── Permission on the record type first (a 403 says nothing about which records exist) ──
    require_attachment_permission(current_user, entity_type, "update")

    # ── The category must be one this record type really uses (exact match: no empty value, no unknown value, no case variant) ──
    validate_category(entity_type, category)

    # ── The target must exist and be visible to the caller (same 404 for both, so existence is not leaked) ──
    target = attachment_target(db, entity_type, entity_id, scope)
    if target is None:
        raise HTTPException(status_code=404, detail="Attachment target not found")

    # ── The record's state may forbid changing its attachments ──
    reason = lock_reason(db, entity_type, target, category)
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    # In an isolated test process this raises unless the root is inside the run directory — before any file is created.
    root = upload_root()

    # ── Validate EVERY file before writing ANY of them ──
    prepared: list[tuple[UploadFile, bytes, str]] = []
    for file in files:
        # 驗證檔案大小
        content = await file.read()
        if len(content) > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"File '{file.filename}' exceeds {MAX_FILE_SIZE_MB}MB limit"
            )

        # 初步驗證 client-supplied MIME 類型
        client_mime = file.content_type or "application/octet-stream"
        if not any(client_mime.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
            logger.warning("Rejected file with client MIME type: %s", client_mime)
            raise HTTPException(
                status_code=400,
                detail=f"File type '{client_mime}' is not allowed"
            )

        # 透過 magic bytes / extension 驗證實際 MIME 類型
        filename = file.filename or "file"
        mime = _validate_upload_mime(content, filename, client_mime)
        if not any(mime.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
            logger.warning(
                "Rejected file: client said '%s' but actual type is '%s'",
                client_mime, mime,
            )
            raise HTTPException(
                status_code=400,
                detail=f"File content does not match an allowed type (detected: {mime})"
            )
        prepared.append((file, content, mime))

    results: list[AttachmentResponse] = []
    written: list[str] = []
    try:
        # 建立模組子目錄
        os.makedirs(os.path.join(root, entity_type), exist_ok=True)
        for file, content, mime in prepared:
            # 產生唯一檔名，保留原始副檔名
            ext = os.path.splitext(file.filename or "file")[1]
            relative_path = f"{entity_type}/{uuid.uuid4().hex}{ext}"
            full_path = os.path.join(root, relative_path)

            # 寫入磁碟
            with open(full_path, "wb") as f:
                f.write(content)
            written.append(full_path)

            # 建立 DB 記錄
            attachment = Attachment(
                id=uuid.uuid4().hex,
                entity_type=entity_type,
                entity_id=entity_id,
                file_name=file.filename or "unknown",
                file_path=relative_path,
                file_size=len(content),
                mime_type=mime,

                category=category,
                uploaded_by=current_user.username,
                uploaded_at=datetime.now(timezone.utc).isoformat(),
                is_deleted=False,
            )
            db.add(attachment)
            results.append(_to_response(attachment, request))

        db.commit()
    except Exception:
        db.rollback()
        for path in written:                       # no orphan file when the row could not be stored
            try:
                os.remove(path)
            except OSError:
                pass
        raise
    logger.info("Uploaded %d files for %s/%s", len(results), entity_type, entity_id)
    return results


@router.get("/by-entity", response_model=list[AttachmentResponse])
def get_entity_files(
    request: Request,
    entity_type: str,
    entity_id: str,
    category: str | None = None,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(get_current_user),
) -> list[AttachmentResponse]:
    """查詢指定實體的所有附件"""
    if entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown entity_type '{entity_type}'")
    require_attachment_permission(current_user, entity_type, "view")
    # P0 data isolation: don't expose attachments for a parent the caller can't see.
    if not entity_in_scope(db, entity_type, entity_id, scope):
        return []
    query = db.query(Attachment).filter(
        Attachment.entity_type == entity_type,
        Attachment.entity_id == entity_id,
        Attachment.is_deleted == False,  # noqa: E712 — must use == for SQLAlchemy
    )
    if category:
        query = query.filter(Attachment.category == category)

    attachments = query.order_by(Attachment.uploaded_at.desc()).all()
    return [_to_response(a, request) for a in attachments]


@router.get("/{file_id}", response_model=AttachmentResponse)
def get_file(
    file_id: str,
    request: Request,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(get_current_user),
) -> AttachmentResponse:
    """取得單一附件 metadata"""
    attachment = db.query(Attachment).filter(
        Attachment.id == file_id,
        Attachment.is_deleted == False,  # noqa: E712 — must use == for SQLAlchemy
    ).first()
    if not attachment or not entity_in_scope(db, attachment.entity_type, attachment.entity_id, scope):
        raise HTTPException(status_code=404, detail="Attachment not found")
    require_attachment_permission(current_user, attachment.entity_type, "view")
    return _to_response(attachment, request)


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(get_current_user),
) -> dict:
    """軟刪除附件（保留磁碟檔案，僅標記為已刪除）"""
    attachment = db.query(Attachment).filter(
        Attachment.id == file_id,
        Attachment.is_deleted == False,  # noqa: E712 — must use == for SQLAlchemy
    ).first()
    if not attachment or not entity_in_scope(db, attachment.entity_type, attachment.entity_id, scope):
        raise HTTPException(status_code=404, detail="Attachment not found")

    require_attachment_permission(current_user, attachment.entity_type, "update")
    if attachment.entity_type == "ncr":
        # Closing an NCR checks its improvement photos and then writes Closed (services/ncr_service.py::update_ncr, which takes this same lock
        # first). Deleting a photo is decided under that lock too and on FRESH data: the NCR may have been closed — or the photo already
        # deleted — since the reads above, and a photo must not vanish from an NCR that was closed on the strength of it.
        try:
            lock_ncr_for_write(db, attachment.entity_id)
            db.expire_all()                                   # whatever this session read before the lock (the row, the NCR) may be stale now
        except Exception:
            db.rollback()
            raise
        if attachment.is_deleted:
            db.rollback()
            raise HTTPException(status_code=404, detail="Attachment not found")
    record = find_attachment_record(db, attachment.entity_type, attachment.entity_id)
    reason = lock_reason(db, attachment.entity_type, record, attachment.category) if record is not None else None
    if reason:
        db.rollback()
        raise HTTPException(status_code=409, detail=reason)

    attachment.is_deleted = True
    db.commit()
    logger.info("Soft-deleted attachment %s (%s)", file_id, attachment.file_name)
    return {"message": "Attachment deleted", "id": file_id}


@router.get("/download/{file_path:path}")
async def serve_upload(
    file_path: str,
    token: str | None = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(_get_current_user_or_none),
):
    """
    經驗證的檔案下載端點，取代原本公開的 static mount。
    支援兩種驗證方式：
    1. Authorization: Bearer <token> header (標準 API 呼叫)
    2. ?token=<token> query parameter (供 <img src="..."> 等無法設定 header 的場景)
    包含路徑遍歷防護：resolved path 必須位於上傳根目錄內。
    """
    # If header-based auth didn't resolve a user, try query-param token
    if current_user is None:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        current_user = await _resolve_user_from_token(token, db)

    # A soft-deleted attachment is gone for EVERYONE, including unrestricted accounts and anyone who kept the path (2026-09-20).
    att = db.query(Attachment).filter(Attachment.file_path == file_path).first()
    if att is not None and att.is_deleted:
        raise HTTPException(status_code=404, detail="File not found")

    # P0 data isolation: a scoped user may only download files whose parent
    # record is within their scope. Looks the file up by its stored path.
    scope = compute_scope(current_user, db)
    if not scope.unrestricted:
        if att is None or not entity_in_scope(db, att.entity_type, att.entity_id, scope):
            raise HTTPException(status_code=404, detail="File not found")

    # Resolve and validate to prevent path traversal (e.g. ../../etc/passwd)
    root = upload_root()
    upload_root_resolved = os.path.realpath(root)
    full_path = os.path.realpath(os.path.join(root, file_path))

    if not full_path.startswith(upload_root_resolved + os.sep) and full_path != upload_root_resolved:
        raise HTTPException(status_code=403, detail="Access denied")

    # Reading needs the view permission of the record the file belongs to. A file WITHOUT an attachment row belongs to nothing we can
    # prove — it is never served on the strength of the directory it sits in. The one exception is a KM image: KM stores the images
    # embedded in its articles without rows, under a naming scheme only its own upload code produces (see is_km_image_path); those need
    # km:view:all. Every other row-less file (an orphan, a stray, another module's leftover) is 404 for everybody.
    if att is not None:
        require_attachment_permission(current_user, att.entity_type, "view")
    elif is_km_image_path(file_path):
        require_attachment_permission(current_user, "km", "view")
    else:
        raise HTTPException(status_code=404, detail="File not found")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Guess MIME type for the response Content-Type header
    mime_type, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime_type)
