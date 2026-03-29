"""
檔案管理路由
- 上傳檔案至 uploads/ 目錄，並建立 Attachment 記錄
- 查詢指定實體的所有附件
- 軟刪除附件
"""
import logging
import os
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy.orm import Session

import schemas
from database import get_db
from middleware.auth import get_current_user
from models import Attachment
from schemas import AttachmentResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/files", tags=["files"])

# NOTE: 上傳根目錄，由 main.py 啟動時自動建立
UPLOAD_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")

# 允許的 MIME 類型白名單
ALLOWED_MIME_PREFIXES = ("image/", "application/pdf", "application/msword",
                         "application/vnd.openxmlformats", "application/vnd.ms-excel",
                         "text/", "application/zip", "application/x-rar")

MAX_FILE_SIZE_MB = 20
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024


def _build_file_url(request: Request, file_path: str) -> str:
    """根據請求的 base URL 組裝完整的檔案存取 URL"""
    return f"{request.base_url}uploads/{file_path}"


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

        # 驗證 MIME 類型
        mime = file.content_type or "application/octet-stream"
        if not any(mime.startswith(prefix) for prefix in ALLOWED_MIME_PREFIXES):
            logger.warning("Rejected file with MIME type: %s", mime)
            raise HTTPException(
                status_code=400,
                detail=f"File type '{mime}' is not allowed"
            )

        # 產生唯一檔名，保留原始副檔名
        ext = os.path.splitext(file.filename or "file")[1]
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
        not Attachment.is_deleted,
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
        not Attachment.is_deleted,
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
        not Attachment.is_deleted,
    ).first()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment.is_deleted = True
    db.commit()
    logger.info("Soft-deleted attachment %s (%s)", file_id, attachment.file_name)
    return {"message": "Attachment deleted", "id": file_id}
