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
from middleware.auth import get_current_user
from models import Attachment
from schemas import AttachmentResponse

logger = logging.getLogger(__name__)


async def _get_current_user_or_none(
    request: Request,
    db: Session = Depends(get_db),
) -> schemas.User | None:
    """
    嘗試從 Authorization header 取得使用者，失敗時回傳 None（不拋例外）。
    供 download 端點同時支援 header 與 query-param token 兩種驗證方式。
    """
    from fastapi.security import OAuth2PasswordBearer
    from jose import JWTError, jwt
    from core.config import settings as app_settings
    import crud

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    token_str = auth_header[7:]
    try:
        payload = jwt.decode(token_str, app_settings.SECRET_KEY, algorithms=[app_settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
    except JWTError:
        return None
    return crud.get_user_by_username(db, username=username)


async def _resolve_user_from_token(token_str: str) -> schemas.User:
    """
    從 query-param token 解析使用者。驗證失敗時拋出 401。
    """
    from jose import JWTError, jwt
    from core.config import settings as app_settings
    import crud
    from database import SessionLocal

    credentials_exception = HTTPException(
        status_code=401,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token_str, app_settings.SECRET_KEY, algorithms=[app_settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    db = SessionLocal()
    try:
        user = crud.get_user_by_username(db, username=username)
        if user is None:
            raise credentials_exception
        return user
    finally:
        db.close()

router = APIRouter(prefix="/files", tags=["files"])

# NOTE: 上傳根目錄，由 main.py 啟動時自動建立
UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "uploads")

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
    current_user: schemas.User = Depends(get_current_user),
) -> list[AttachmentResponse]:
    """
    上傳一個或多個檔案
    - entity_type: 關聯模組 (itp / ncr / noi / itr / pqp / obs)
    - entity_id: 關聯記錄 ID
    - category: 檔案分類 (attachment / defectPhoto / improvementPhoto)
    """
    # ── Validate entity_type against known modules ──
    _VALID_ENTITY_TYPES = {"itp", "ncr", "noi", "itr", "pqp", "obs", "fat",
                           "audit", "checklist", "followup", "km", "contractor"}
    if entity_type not in _VALID_ENTITY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown entity_type '{entity_type}'. Must be one of: {', '.join(sorted(_VALID_ENTITY_TYPES))}",
        )

    results: list[AttachmentResponse] = []

    # 建立模組子目錄
    module_dir = os.path.join(UPLOAD_ROOT, entity_type)
    os.makedirs(module_dir, exist_ok=True)

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

        # 產生唯一檔名，保留原始副檔名
        ext = os.path.splitext(filename)[1]
        unique_name = f"{uuid.uuid4().hex}{ext}"
        relative_path = f"{entity_type}/{unique_name}"
        full_path = os.path.join(UPLOAD_ROOT, relative_path)

        # 寫入磁碟
        with open(full_path, "wb") as f:
            f.write(content)

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
    logger.info("Uploaded %d files for %s/%s", len(results), entity_type, entity_id)
    return results


@router.get("/by-entity", response_model=list[AttachmentResponse])
def get_entity_files(
    request: Request,
    entity_type: str,
    entity_id: str,
    category: str | None = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
) -> list[AttachmentResponse]:
    """查詢指定實體的所有附件"""
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
    current_user: schemas.User = Depends(get_current_user),
) -> AttachmentResponse:
    """取得單一附件 metadata"""
    attachment = db.query(Attachment).filter(
        Attachment.id == file_id,
        Attachment.is_deleted == False,  # noqa: E712 — must use == for SQLAlchemy
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return _to_response(attachment, request)


@router.delete("/{file_id}")
def delete_file(
    file_id: str,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user),
) -> dict:
    """軟刪除附件（保留磁碟檔案，僅標記為已刪除）"""
    attachment = db.query(Attachment).filter(
        Attachment.id == file_id,
        Attachment.is_deleted == False,  # noqa: E712 — must use == for SQLAlchemy
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment.is_deleted = True
    db.commit()
    logger.info("Soft-deleted attachment %s (%s)", file_id, attachment.file_name)
    return {"message": "Attachment deleted", "id": file_id}


@router.get("/download/{file_path:path}")
async def serve_upload(
    file_path: str,
    token: str | None = None,
    current_user: schemas.User = Depends(_get_current_user_or_none),
):
    """
    經驗證的檔案下載端點，取代原本公開的 static mount。
    支援兩種驗證方式：
    1. Authorization: Bearer <token> header (標準 API 呼叫)
    2. ?token=<token> query parameter (供 <img src="..."> 等無法設定 header 的場景)
    包含路徑遍歷防護：resolved path 必須位於 UPLOAD_ROOT 內。
    """
    # If header-based auth didn't resolve a user, try query-param token
    if current_user is None:
        if not token:
            raise HTTPException(
                status_code=401,
                detail="Authentication required",
                headers={"WWW-Authenticate": "Bearer"},
            )
        current_user = await _resolve_user_from_token(token)

    # Resolve and validate to prevent path traversal (e.g. ../../etc/passwd)
    upload_root_resolved = os.path.realpath(UPLOAD_ROOT)
    full_path = os.path.realpath(os.path.join(UPLOAD_ROOT, file_path))

    if not full_path.startswith(upload_root_resolved + os.sep) and full_path != upload_root_resolved:
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    # Guess MIME type for the response Content-Type header
    mime_type, _ = mimetypes.guess_type(full_path)
    return FileResponse(full_path, media_type=mime_type)
