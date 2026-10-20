"""Data access for the controlled-document register (KM-DOCS-2026-001 D1): documents, versions, references.

No permission or business decision here — services/document_service.py owns those. Scope filtering is applied with
core.scope.apply_scope on project documents; company documents pass it (company_wide_clause).
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

import models
from core.scope import apply_scope
from core.utils import sanitize_pagination, sanitize_search_term


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


class DocumentRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---- documents ---------------------------------------------------------------------------------------------------

    def list(self, scope_name: str, data_scope=None, *, project_id: Optional[str] = None, doc_type: Optional[str] = None,
             status: Optional[str] = None, is_template: Optional[bool] = None, q: Optional[str] = None,
             include_hidden: bool = False, skip: int = 0, limit: int = 100) -> list[models.Document]:
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.Document).filter(models.Document.scope == scope_name,
                                                      models.Document.is_deleted.is_(False))
        if scope_name == "project":
            query = apply_scope(query, models.Document, data_scope)
        if project_id:
            query = query.filter(models.Document.project_id == project_id)
        if doc_type:
            query = query.filter(models.Document.doc_type == doc_type)
        if status:
            query = query.filter(models.Document.status == status)
        elif not include_hidden:
            query = query.filter(models.Document.status.notin_(("archived", "void")))
        if is_template is not None:
            query = query.filter(models.Document.is_template.is_(bool(is_template)))
        term = sanitize_search_term(q) if q else None
        if term:
            like = f"%{term}%"
            current = models.DocumentVersion
            query = query.outerjoin(current, current.id == models.Document.current_version_id).filter(or_(
                models.Document.doc_no.ilike(like), models.Document.title_zh.ilike(like),
                models.Document.title_en.ilike(like), models.Document.tags.ilike(like),
                current.extracted_text.ilike(like),
            ))
        return (query.order_by(models.Document.updated_at.desc(), models.Document.doc_no.desc())
                .offset(skip).limit(limit).all())

    def get(self, document_id: str, *, with_deleted: bool = False) -> Optional[models.Document]:
        query = self.db.query(models.Document).options(joinedload(models.Document.versions)).filter(models.Document.id == document_id)
        if not with_deleted:
            query = query.filter(models.Document.is_deleted.is_(False))
        return query.first()

    def get_by_doc_no(self, doc_no: str) -> Optional[models.Document]:
        return self.db.query(models.Document).filter(models.Document.doc_no == doc_no).first()

    def add(self, **fields) -> models.Document:
        doc = models.Document(id=fields.pop("id", None) or str(uuid.uuid4()), created_at=now_str(), updated_at=now_str(), **fields)
        self.db.add(doc)
        self.db.flush()
        return doc

    def touch(self, doc: models.Document) -> None:
        doc.updated_at = now_str()

    # ---- versions ----------------------------------------------------------------------------------------------------

    def versions(self, document_id: str) -> list[models.DocumentVersion]:
        return (self.db.query(models.DocumentVersion).filter(models.DocumentVersion.document_id == document_id)
                .order_by(models.DocumentVersion.version_no).all())

    def get_version(self, version_id: str) -> Optional[models.DocumentVersion]:
        return self.db.query(models.DocumentVersion).filter(models.DocumentVersion.id == version_id).first()

    def next_version_no(self, document_id: str) -> int:
        from sqlalchemy import func
        current = self.db.query(func.max(models.DocumentVersion.version_no)).filter(
            models.DocumentVersion.document_id == document_id).scalar()
        return int(current or 0) + 1

    def add_version(self, doc: models.Document, **fields) -> models.DocumentVersion:
        version_no = fields.pop("version_no", None) or self.next_version_no(doc.id)
        version = models.DocumentVersion(
            id=fields.pop("id", None) or str(uuid.uuid4()), document_id=doc.id, scope=doc.scope, project_id=doc.project_id,
            vendor_id=doc.vendor_id, version_no=version_no,
            version_label=fields.pop("version_label", None) or f"Rev{version_no}.0", created_at=now_str(), **fields,
        )
        self.db.add(version)
        self.db.flush()
        return version

    # ---- attachments -------------------------------------------------------------------------------------------------

    def attachment(self, attachment_id: Optional[str]) -> Optional[models.Attachment]:
        if not attachment_id:
            return None
        return self.db.query(models.Attachment).filter(models.Attachment.id == attachment_id,
                                                       models.Attachment.is_deleted.is_(False)).first()

    def add_attachment(self, version: models.DocumentVersion, *, file_name: str, relative_path: str, size: int, mime: str,
                       category: str, uploaded_by: Optional[str]) -> models.Attachment:
        att = models.Attachment(
            id=uuid.uuid4().hex, entity_type="document_version", entity_id=version.id, file_name=file_name, file_path=relative_path,
            file_size=size, mime_type=mime, category=category, uploaded_by=uploaded_by,
            uploaded_at=datetime.now().astimezone().isoformat(), is_deleted=False,
        )
        self.db.add(att)
        self.db.flush()
        return att

    # ---- references --------------------------------------------------------------------------------------------------

    def references_of(self, document_id: str) -> list[models.DocumentReference]:
        return (self.db.query(models.DocumentReference).filter(models.DocumentReference.document_id == document_id)
                .order_by(models.DocumentReference.created_at).all())

    def references_from(self, from_type: str, from_id: str) -> list[models.DocumentReference]:
        return (self.db.query(models.DocumentReference).options(joinedload(models.DocumentReference.document))
                .filter(models.DocumentReference.from_type == from_type, models.DocumentReference.from_id == from_id)
                .order_by(models.DocumentReference.created_at).all())

    def get_reference(self, reference_id: str) -> Optional[models.DocumentReference]:
        return self.db.query(models.DocumentReference).filter(models.DocumentReference.id == reference_id).first()

    def find_reference(self, from_type: str, from_id: str, document_id: str, section_ref: str) -> Optional[models.DocumentReference]:
        return self.db.query(models.DocumentReference).filter(
            models.DocumentReference.from_type == from_type, models.DocumentReference.from_id == from_id,
            models.DocumentReference.document_id == document_id, models.DocumentReference.section_ref == (section_ref or ""),
        ).first()

    def add_reference(self, **fields) -> models.DocumentReference:
        ref = models.DocumentReference(id=str(uuid.uuid4()), created_at=now_str(), **fields)
        self.db.add(ref)
        self.db.flush()
        return ref

    def reference_count(self, document_id: str) -> int:
        return self.db.query(models.DocumentReference).filter(models.DocumentReference.document_id == document_id).count()
