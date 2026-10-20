"""Controlled-document register — company documents / templates and project documents (KM-DOCS-2026-001 D1).

Rules (DESIGN §2–§4, user's decisions 2026-10-18, D1 rulings 1–8):
* two layers in one register: `scope='company'` (km:* permissions, no project, visible to everyone) and `scope='project'`
  (document:* permissions, project / contractor data scope); the layer is chosen at creation and never changes;
* `doc_type` must belong to the layer; `pqp` is refused here — the PQP module keeps its own table (Q1) until D3;
* a document gets its number at creation: company QTS-KM-###### (shared counter with KM articles), project by the
  doc_type's naming rule in the project; the number never changes;
* versions are append-only; a version carries a Word and / or a PDF (attachments, entity_type 'document_version');
  the Word's text is extracted for search (Q4) — a version with only a PDF is not searchable;
* statuses, lower case —
    company: document draft → current → archived → (current | draft); version draft → current → superseded / archived;
    project (approval types pqp / plan): draft → submitted → approved; registered-only types: draft → approved;
             any → void (reason required); version approved → superseded when a later one is approved;
  setting a version current / approved needs its PDF (the issued record); one current / approved version at a time;
* once a version is current / approved (or later) it is read-only (files too: core/attachment_access); an archived or
  void / approved document's fields are locked except status (and tags); a new version is the only way to change content;
* deleting is soft, draft-only, and refused while anything references the document;
* every write is audited (core.utils.log_audit, strict) in the same transaction, like KM.
"""
from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import date
from typing import Optional

from fastapi import HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from fastapi.responses import FileResponse

import models
import schemas
from core import perms
from core.concurrency import claim_row_version
from core.document_text import extract_docx_text, snippet
from core.refusals import Refusal, RefusalHTTPException
from core.scope import Scope, ScopeForbidden, enforce_create_scope, enforce_update_scope, is_admin_user, record_in_scope
from core.uploads import upload_root
from core.utils import begin_write_transaction, generate_company_doc_no, generate_reference_no, log_audit
from repositories.document_repository import DocumentRepository, now_str

logger = logging.getLogger(__name__)

COMPANY_STATUSES = ("draft", "current", "archived")
PROJECT_STATUSES = ("draft", "submitted", "approved", "superseded", "void")
ISSUED_VERSION_STATUSES = frozenset({"current", "approved", "superseded", "archived", "void"})
LOCKED_DOCUMENT_STATUSES = frozenset({"archived", "void"})
UNLOCKED_FIELDS_WHEN_LOCKED = frozenset({"tags"})
NAMING_TYPE = {"plan": "PLAN", "drawing": "DRAWING", "spec": "SPEC", "certificate": "CERTIFICATE", "approval": "APPROVAL", "pqp": "PQP"}
WORD_MIMES = ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/msword")
PDF_MIME = "application/pdf"
UPLOAD_SUBDIR = "document_version"


def _codes(user) -> set:
    role = getattr(user, "role", None)
    return {p.code for p in (role.permissions_rel if role is not None else [])}


def word_or_pdf_mime(content: bytes, filename: str, kind: str) -> str:
    """The stored MIME for a document file of `kind` ('word' | 'pdf'), decided from the bytes; HTTP 400 when they are not that kind."""
    if kind == "pdf":
        if not content.startswith(b"%PDF"):
            raise HTTPException(status_code=400, detail=f"'{filename}' is not a PDF")
        return PDF_MIME
    if content.startswith(b"PK\x03\x04"):
        return WORD_MIMES[0]            # .docx (a ZIP container; plain text renamed .docx is refused here)
    if content.startswith(b"\xd0\xcf\x11\xe0"):
        return WORD_MIMES[1]            # legacy .doc (OLE)
    raise HTTPException(status_code=400, detail=f"'{filename}' is not a Word document")


def _admin_only() -> RefusalHTTPException:
    """Templates are shared company assets: only a system administrator creates or changes one (D18, as for ITP templates)."""
    return RefusalHTTPException(403, "Only a system administrator can create or change a template document.", "SHARED_TEMPLATE_ADMIN_ONLY")


def _label(doc: models.Document) -> str:
    return doc.doc_no or doc.title_zh or doc.id


class DocumentService:
    def __init__(self, repo: DocumentRepository):
        self.repo = repo

    # ---- permissions -------------------------------------------------------------------------------------------------

    @staticmethod
    def _needed(scope_name: str, action: str) -> str:
        if scope_name == "company":
            return {"view": perms.KM_VIEW, "create": perms.KM_CREATE, "update": perms.KM_UPDATE, "delete": perms.KM_DELETE,
                    "approve": perms.KM_UPDATE}[action]
        return {"view": perms.DOCUMENT_VIEW, "create": perms.DOCUMENT_CREATE, "update": perms.DOCUMENT_UPDATE,
                "delete": perms.DOCUMENT_UPDATE, "approve": perms.DOCUMENT_APPROVE}[action]

    def require(self, user, scope_name: str, action: str) -> None:
        needed = self._needed(scope_name, action)
        if needed not in _codes(user):
            raise perms.PermissionDenied(needed)

    def can(self, user, scope_name: str, action: str) -> bool:
        return self._needed(scope_name, action) in _codes(user)

    # ---- read --------------------------------------------------------------------------------------------------------

    def _visible(self, doc: Optional[models.Document], user, data_scope: Optional[Scope]) -> Optional[models.Document]:
        """The document when the caller may see it, else None (404 upstream: existence is not leaked)."""
        if doc is None or doc.is_deleted or not self.can(user, doc.scope, "view"):
            return None
        if doc.scope == "project" and not record_in_scope(doc, data_scope):
            return None
        return doc

    def list_documents(self, scope_name: str, user, data_scope: Optional[Scope], **filters) -> list[dict]:
        if scope_name not in schemas.DOCUMENT_SCOPES:
            raise HTTPException(status_code=400, detail="scope must be 'company' or 'project'")
        self.require(user, scope_name, "view")
        q = filters.get("q")
        rows = self.repo.list(scope_name, data_scope, **filters)
        return [self.to_out(doc, q=q) for doc in rows]

    def get_document(self, document_id: str, user, data_scope: Optional[Scope]) -> dict:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return self.to_detail(doc)

    def version_out(self, v: models.DocumentVersion) -> dict:
        word = self.repo.attachment(v.word_attachment_id)
        pdf = self.repo.attachment(v.pdf_attachment_id)
        return dict(
            id=v.id, document_id=v.document_id, version_no=v.version_no, version_label=v.version_label, status=v.status,
            change_summary=v.change_summary, word_attachment_id=v.word_attachment_id, pdf_attachment_id=v.pdf_attachment_id,
            word_file_name=word.file_name if word else None, pdf_file_name=pdf.file_name if pdf else None,
            searchable=bool((v.extracted_text or "").strip()), source_template_document_id=v.source_template_document_id,
            source_template_version_id=v.source_template_version_id, submitted_at=v.submitted_at, approved_at=v.approved_at,
            approved_by_user_id=v.approved_by_user_id, void_reason=v.void_reason, created_by_user_id=v.created_by_user_id,
            created_at=v.created_at,
        )

    def to_out(self, doc: models.Document, q: Optional[str] = None) -> dict:
        versions = doc.versions or []
        current = next((v for v in versions if v.id == doc.current_version_id), None)
        out = {c.name: getattr(doc, c.name) for c in doc.__table__.columns if c.name != "is_deleted"}
        out["current_version"] = self.version_out(current) if current else None
        out["latest_version_no"] = max((v.version_no for v in versions), default=0)
        hit = None
        if q and current is not None:
            hit = snippet(current.extracted_text, q)
        out["snippet"] = hit
        return out

    def to_detail(self, doc: models.Document) -> dict:
        out = self.to_out(doc)
        out["versions"] = [self.version_out(v) for v in sorted(doc.versions or [], key=lambda v: v.version_no)]
        out["references"] = [self.reference_out(r) for r in self.repo.references_of(doc.id)]
        return out

    # ---- create / update ---------------------------------------------------------------------------------------------

    def create_document(self, data: schemas.DocumentCreate, user, data_scope: Optional[Scope]) -> dict:
        self.require(user, data.scope, "create")
        fields = data.model_dump(exclude={"external_doc_no"})
        if data.scope == "company":
            if data.doc_type not in schemas.COMPANY_DOC_TYPES:
                raise Refusal("DOC_TYPE_INVALID", f"'{data.doc_type}' is not a company document type", docType=data.doc_type, scope="company")
            fields["project_id"] = None
            fields["vendor_id"] = None
            if (data.is_template or data.doc_type == "template") and not is_admin_user(user):
                raise _admin_only()
            fields["is_template"] = bool(data.is_template or data.doc_type == "template")
        else:
            if data.doc_type == "pqp":
                raise Refusal("DOC_TYPE_RESERVED", "PQP documents are kept by the PQP module; they join the register in a later batch",
                              docType="pqp")
            if data.doc_type not in schemas.PROJECT_DOC_TYPES:
                raise Refusal("DOC_TYPE_INVALID", f"'{data.doc_type}' is not a project document type", docType=data.doc_type, scope="project")
            if data.is_template:
                raise Refusal("DOC_TYPE_INVALID", "Only company documents can be templates", docType=data.doc_type, scope="project")
            enforce_create_scope(fields, data_scope)          # fills / checks project_id, forces a contractor account's vendor_id
            if not fields.get("project_id"):
                raise Refusal("PROJECT_REQUIRED", "A project document needs a project", docType=data.doc_type)
            if fields.get("vendor_id") and self.repo.db.get(models.Contractor, fields["vendor_id"]) is None:
                raise Refusal("REFERENCE_NOT_FOUND", f"Contractor '{fields['vendor_id']}' does not exist", docType="Contractor", field="vendor_id", value=fields["vendor_id"])
        if fields.get("template_fields") is not None:
            fields["template_fields"] = json.dumps(fields["template_fields"])
        db = self.repo.db
        try:
            begin_write_transaction(db)
            if data.scope == "company":
                doc_no = generate_company_doc_no(db)
            else:
                doc_no = generate_reference_no(db, "", NAMING_TYPE.get(data.doc_type, data.doc_type.upper()), project_id=fields["project_id"])
            doc = self.repo.add(doc_no=doc_no, status="draft", created_by_user_id=getattr(user, "id", None), **fields)
            log_audit(db, "CREATE", "Document", doc.id, doc.doc_no, new_value={**fields, "doc_no": doc_no},
                      user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return self.to_detail(self.repo.get(doc.id))

    def _locked_fields(self, doc: models.Document, update: dict) -> list[str]:
        if doc.status in LOCKED_DOCUMENT_STATUSES or (doc.scope == "project" and doc.status == "approved"):
            return sorted(k for k in update if k not in UNLOCKED_FIELDS_WHEN_LOCKED)
        return []

    def update_document(self, document_id: str, data: schemas.DocumentUpdate, user, data_scope: Optional[Scope]) -> dict:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        self.require(user, doc.scope, "update")
        if doc.is_template and not is_admin_user(user):
            raise _admin_only()
        update = data.model_dump(exclude_unset=True)
        locked = self._locked_fields(doc, update)
        if locked:
            raise Refusal("RECORD_LOCKED", f"Document {_label(doc)} is {doc.status}; only its tags can change. Set it back to draft or "
                          f"current, or add a new version, to change: {', '.join(locked)}", docType="Document", number=_label(doc),
                          status=doc.status, fields=locked)
        if doc.scope == "company":
            update.pop("vendor_id", None)
        else:
            enforce_update_scope(update, data_scope)
            if update.get("vendor_id") and self.repo.db.get(models.Contractor, update["vendor_id"]) is None:
                raise Refusal("REFERENCE_NOT_FOUND", f"Contractor '{update['vendor_id']}' does not exist", docType="Contractor", field="vendor_id", value=update["vendor_id"])
        if "template_fields" in update and update["template_fields"] is not None:
            update["template_fields"] = json.dumps(update["template_fields"])
        old = {k: getattr(doc, k) for k in update}
        db = self.repo.db
        try:
            claim_row_version(db, doc, data.row_version, doc_type="Document", number=_label(doc))
            for k, v in update.items():
                setattr(doc, k, v)
            self.repo.touch(doc)
            log_audit(db, "UPDATE", "Document", doc.id, doc.doc_no, old_value=old, new_value=update,
                      user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return self.to_detail(self.repo.get(doc.id))

    # ---- versions ----------------------------------------------------------------------------------------------------

    @staticmethod
    def _check_file(content: bytes, filename: str, client_mime: str, kind: str) -> str:
        """Size limit, then the file's own bytes decide: a PDF starts with %PDF, a Word file is a ZIP (.docx) or an OLE file (.doc).
        Deliberately not routed through the generic extension-based guess: the production image (python:3.11-slim) has no system
        MIME database, so `mimetypes` does not know .docx there and the generic validator would call a real .docx "application/zip"."""
        from routers.file_router import max_upload_bytes
        limit_bytes, limit_mb = max_upload_bytes("document_version", kind)
        if len(content) > limit_bytes:
            raise HTTPException(status_code=400, detail=f"File '{filename}' exceeds {limit_mb}MB limit")
        return word_or_pdf_mime(content, filename, kind)

    def add_version(self, document_id: str, user, data_scope: Optional[Scope], *, word: Optional[UploadFile], pdf: Optional[UploadFile],
                    change_summary: Optional[str], version_label: Optional[str]) -> dict:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        self.require(user, doc.scope, "update")
        if doc.is_template and not is_admin_user(user):
            raise _admin_only()
        if word is None and pdf is None:
            raise HTTPException(status_code=400, detail="A version needs a Word file, a PDF, or both")
        prepared = []
        for kind, upload in (("word", word), ("pdf", pdf)):
            if upload is None:
                continue
            content = upload.file.read()
            if not content:
                raise HTTPException(status_code=400, detail=f"Uploaded {kind} file is empty")
            mime = self._check_file(content, upload.filename or kind, upload.content_type or "", kind)
            prepared.append((kind, upload.filename or f"{kind}", content, mime))
        root = upload_root()
        written: list[str] = []
        db = self.repo.db
        try:
            begin_write_transaction(db)
            db.refresh(doc)                        # decide on fresh state under the write lock (R1 P2-1)
            if doc.status in LOCKED_DOCUMENT_STATUSES:
                raise Refusal("RECORD_LOCKED", f"Document {_label(doc)} is {doc.status}: set it back before adding a version",
                              docType="Document", number=_label(doc), status=doc.status)
            version = self.repo.add_version(doc, status="draft", change_summary=change_summary, version_label=version_label,
                                            created_by_user_id=getattr(user, "id", None))
            os.makedirs(os.path.join(root, UPLOAD_SUBDIR), exist_ok=True)
            for kind, filename, content, mime in prepared:
                ext = os.path.splitext(filename)[1].lower() or (".pdf" if kind == "pdf" else ".docx")
                relative = f"{UPLOAD_SUBDIR}/{uuid.uuid4().hex}{ext}"
                full = os.path.join(root, relative)
                with open(full, "wb") as fh:
                    fh.write(content)
                written.append(full)
                att = self.repo.add_attachment(version, file_name=filename, relative_path=relative, size=len(content), mime=mime,
                                               category=kind, uploaded_by=getattr(user, "username", None))
                if kind == "word":
                    version.word_attachment_id = att.id
                    version.extracted_text = extract_docx_text(content)
                    version.extracted_at = now_str() if version.extracted_text is not None else None
                else:
                    version.pdf_attachment_id = att.id
            self.repo.touch(doc)
            log_audit(db, "CREATE", "DocumentVersion", version.id, f"{doc.doc_no} {version.version_label}",
                      new_value={"document_id": doc.id, "version_no": version.version_no, "change_summary": change_summary,
                                 "files": [p[1] for p in prepared]},
                      user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            for path in written:
                try:
                    os.remove(path)
                except OSError:
                    pass
            raise
        return self.version_out(self.repo.get_version(version.id))

    def bind_files(self, document_id: str, version_id: str, user, data_scope: Optional[Scope], *,
                   word_attachment_id: Optional[str], pdf_attachment_id: Optional[str]) -> dict:
        """Attach files uploaded through /api/files/upload (entity_type document_version) to the version."""
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        version = self.repo.get_version(version_id) if doc else None
        if doc is None or version is None or version.document_id != doc.id:
            raise HTTPException(status_code=404, detail="Document version not found")
        self.require(user, doc.scope, "update")
        db = self.repo.db
        try:
            begin_write_transaction(db)
            db.refresh(version)                    # the version may have been issued meanwhile (R1 P2-1)
            if version.status in ISSUED_VERSION_STATUSES:
                raise Refusal("RECORD_LOCKED", f"Version {version.version_label} of {_label(doc)} is {version.status} and read-only",
                              docType="Document", number=_label(doc), status=version.status)
            changes = {}
            for kind, att_id in (("word", word_attachment_id), ("pdf", pdf_attachment_id)):
                if not att_id:
                    continue
                att = self.repo.attachment(att_id)
                if att is None or att.entity_type != "document_version" or att.entity_id != version.id or att.category != kind:
                    raise Refusal("REFERENCE_NOT_FOUND", f"Attachment '{att_id}' is not a {kind} file of this version",
                                  docType="Attachment", field=f"{kind}_attachment_id", value=att_id)
                # the generic upload only applies the broad allow-list; the issued record must really be a PDF / a Word file (R1 P2-2),
                # judged from the stored bytes (the generic path's guessed MIME is "application/zip" for a .docx on python:3.11-slim)
                try:
                    with open(os.path.join(upload_root(), att.file_path), "rb") as fh:
                        head = fh.read(8)
                except OSError:
                    head = b""
                try:
                    att.mime_type = word_or_pdf_mime(head, att.file_name, kind)
                except HTTPException:
                    raise HTTPException(status_code=400, detail=f"Attachment '{att.file_name}' is not a {kind} file")
                if kind == "word":
                    version.word_attachment_id = att.id
                    try:
                        with open(os.path.join(upload_root(), att.file_path), "rb") as fh:
                            version.extracted_text = extract_docx_text(fh.read())
                    except OSError:
                        version.extracted_text = None
                    version.extracted_at = now_str() if version.extracted_text is not None else None
                else:
                    version.pdf_attachment_id = att.id
                changes[f"{kind}_attachment_id"] = att.id
            self.repo.touch(doc)
            log_audit(db, "UPDATE", "DocumentVersion", version.id, f"{doc.doc_no} {version.version_label}", new_value=changes,
                      user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return self.version_out(self.repo.get_version(version.id))

    def download(self, document_id: str, version_id: str, kind: str, user, data_scope: Optional[Scope]) -> FileResponse:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        version = self.repo.get_version(version_id) if doc else None
        if doc is None or version is None or version.document_id != doc.id:
            raise HTTPException(status_code=404, detail="Document version not found")
        if kind not in ("word", "pdf"):
            raise HTTPException(status_code=400, detail="kind must be 'word' or 'pdf'")
        att = self.repo.attachment(version.word_attachment_id if kind == "word" else version.pdf_attachment_id)
        if att is None:
            raise HTTPException(status_code=404, detail=f"This version has no {kind} file")
        root = os.path.realpath(upload_root())
        full = os.path.realpath(os.path.join(root, att.file_path))
        if not full.startswith(root + os.sep) or not os.path.isfile(full):
            raise HTTPException(status_code=404, detail="File not found")
        return FileResponse(full, media_type=att.mime_type or "application/octet-stream", filename=att.file_name)

    # ---- transitions -------------------------------------------------------------------------------------------------

    def _pick_version(self, doc: models.Document, version_id: Optional[str]) -> models.DocumentVersion:
        versions = sorted(doc.versions or [], key=lambda v: v.version_no)
        if version_id:
            v = next((v for v in versions if v.id == version_id), None)
            if v is None:
                raise HTTPException(status_code=404, detail="Document version not found")
            return v
        if not versions:
            raise Refusal("INVALID_TRANSITION", f"Document {_label(doc)} has no version yet", docType="Document", number=_label(doc),
                          fromStatus=doc.status, toStatus="(version required)")
        return versions[-1]

    def transition(self, document_id: str, body: schemas.DocumentTransition, user, data_scope: Optional[Scope]) -> dict:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        self.require(user, doc.scope, "update")      # a 403 before any status reasoning (R1 P3-1); approve-only steps check again below
        to = (body.to or "").strip().lower()
        allowed = COMPANY_STATUSES if doc.scope == "company" else PROJECT_STATUSES
        if to not in allowed or to == "superseded":
            raise Refusal("INVALID_TRANSITION", f"'{to}' is not a status a {doc.scope} document can be set to",
                          docType="Document", number=_label(doc), fromStatus=doc.status, toStatus=to)
        if doc.is_template and not is_admin_user(user):
            raise _admin_only()
        user_id = getattr(user, "id", None)
        db = self.repo.db
        try:
            begin_write_transaction(db)
            db.refresh(doc)
            old_status = doc.status
            if doc.scope == "company":
                self._company_transition(doc, to, body, user)
            else:
                self._project_transition(doc, to, body, user)
            claim_row_version(db, doc, body.row_version, doc_type="Document", number=_label(doc))
            self.repo.touch(doc)
            log_audit(db, "UPDATE", "Document", doc.id, doc.doc_no, old_value={"status": old_status},
                      new_value={"status": doc.status, "to": to, "version_id": body.version_id, "reason": body.reason},
                      user_id=user_id, username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return self.to_detail(self.repo.get(doc.id))

    def _invalid(self, doc, to):
        return Refusal("INVALID_TRANSITION", f"Document {_label(doc)} cannot go from {doc.status} to {to}",
                       docType="Document", number=_label(doc), fromStatus=doc.status, toStatus=to)

    def _need_pdf(self, doc, version):
        if not version.pdf_attachment_id or self.repo.attachment(version.pdf_attachment_id) is None:
            raise Refusal("DOCUMENT_PDF_REQUIRED", f"Version {version.version_label} of {_label(doc)} has no PDF; the issued "
                          "record needs one before it can be set current / approved", docType="Document", number=_label(doc),
                          version=version.version_label)

    def _company_transition(self, doc, to, body, user):
        self.require(user, "company", "update")
        if to == "current":
            if doc.status not in ("draft", "current", "archived"):
                raise self._invalid(doc, to)
            version = self._pick_version(doc, body.version_id)
            if version.status not in ("draft", "current"):
                raise self._invalid(doc, f"current (version {version.version_label} is {version.status})")
            self._need_pdf(doc, version)
            for other in doc.versions:
                if other.id != version.id and other.status == "current":
                    other.status = "superseded"
            version.status = "current"
            doc.current_version_id = version.id
            doc.status = "current"
            doc.effective_date = doc.effective_date or date.today().isoformat()
        elif to == "archived":
            if doc.status != "current":
                raise self._invalid(doc, to)
            doc.status = "archived"
        elif to == "draft":
            # unarchive: the document returns to what it was — current when it has an issued version, else draft (to="current"
            # from archived is accepted too, and re-issues the chosen version). Documented in routers/documents.py (R1 P3-2).
            if doc.status != "archived":
                raise self._invalid(doc, to)
            doc.status = "current" if doc.current_version_id else "draft"
        else:
            raise self._invalid(doc, to)

    def _project_transition(self, doc, to, body, user):
        approval_type = doc.doc_type in schemas.PROJECT_APPROVAL_DOC_TYPES
        if to == "submitted":
            self.require(user, "project", "update")
            if not approval_type:
                raise Refusal("INVALID_TRANSITION", f"{doc.doc_type} documents are registered, not submitted for approval",
                              docType="Document", number=_label(doc), fromStatus=doc.status, toStatus=to)
            if doc.status not in ("draft", "approved"):          # a new version of an approved document is submitted too
                raise self._invalid(doc, to)
            version = self._pick_version(doc, body.version_id)
            if version.status != "draft":
                raise self._invalid(doc, f"submitted (version {version.version_label} is {version.status})")
            version.status = "submitted"
            version.submitted_at = now_str()
            doc.status = "submitted"
        elif to == "approved":
            self.require(user, "project", "approve" if approval_type else "update")
            if doc.status in ("void",):
                raise self._invalid(doc, to)
            version = self._pick_version(doc, body.version_id)
            if version.status not in (("submitted",) if approval_type else ("draft", "submitted")):
                raise self._invalid(doc, f"approved (version {version.version_label} is {version.status})")
            self._need_pdf(doc, version)
            for other in doc.versions:
                if other.id != version.id and other.status == "approved":
                    other.status = "superseded"
            version.status = "approved"
            version.approved_at = now_str()
            version.approved_by_user_id = getattr(user, "id", None)
            doc.current_version_id = version.id
            doc.status = "approved"
            doc.effective_date = doc.effective_date or date.today().isoformat()
        elif to == "draft":
            self.require(user, "project", "approve" if approval_type else "update")
            if doc.status != "submitted":
                raise self._invalid(doc, to)
            for v in doc.versions:
                if v.status == "submitted":
                    v.status = "draft"
                    v.submitted_at = None
            doc.status = "approved" if doc.current_version_id else "draft"
        elif to == "void":
            self.require(user, "project", "approve")
            if doc.status == "void":
                raise self._invalid(doc, to)
            if not (body.reason or "").strip():
                raise Refusal("REASON_REQUIRED", "Voiding a document needs a reason", docType="Document", number=_label(doc))
            for v in doc.versions:
                if v.status in ("draft", "submitted", "approved"):
                    v.status = "void"
                    v.void_reason = body.reason.strip()
            doc.status = "void"
        else:
            raise self._invalid(doc, to)

    # ---- delete ------------------------------------------------------------------------------------------------------

    def delete_document(self, document_id: str, user, data_scope: Optional[Scope]) -> dict:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        self.require(user, doc.scope, "delete")
        if doc.status != "draft" or any(v.status in ISSUED_VERSION_STATUSES for v in doc.versions):
            raise Refusal("RECORD_LOCKED", f"Document {_label(doc)} is {doc.status}: only a draft that was never issued can be deleted; "
                          "archive or void it instead", docType="Document", number=_label(doc), status=doc.status)
        n = self.repo.reference_count(doc.id)
        if n:
            raise Refusal("REFERENCE_IN_USE", f"Document {_label(doc)} is referenced by {n} record(s) and cannot be deleted",
                          docType="Document", number=_label(doc), count=n)
        db = self.repo.db
        try:
            doc.is_deleted = True
            self.repo.touch(doc)
            log_audit(db, "DELETE", "Document", doc.id, doc.doc_no, old_value={"status": doc.status, "title_zh": doc.title_zh},
                      user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {"ok": True}

    # ---- references --------------------------------------------------------------------------------------------------

    def reference_out(self, ref: models.DocumentReference) -> dict:
        doc = ref.document
        return dict(id=ref.id, from_type=ref.from_type, from_id=ref.from_id, document_id=ref.document_id, version_id=ref.version_id,
                    pinned_version_no=ref.pinned_version_no, section_ref=ref.section_ref or "", created_by_user_id=ref.created_by_user_id,
                    created_at=ref.created_at, doc_no=doc.doc_no if doc else None, title_zh=doc.title_zh if doc else None)

    def add_reference(self, data: schemas.DocumentReferenceCreate, user, data_scope: Optional[Scope]) -> dict:
        doc = self._visible(self.repo.get(data.document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        if doc.status in ("void",):
            raise Refusal("RECORD_LOCKED", f"Document {_label(doc)} is void and cannot be referenced", docType="Document",
                          number=_label(doc), status=doc.status)
        section = (data.section_ref or "").strip()
        existing = self.repo.find_reference(data.from_type, data.from_id, doc.id, section)
        if existing:
            return self.reference_out(existing)
        current = next((v for v in doc.versions if v.id == doc.current_version_id), None)
        db = self.repo.db
        try:
            ref = self.repo.add_reference(from_type=data.from_type, from_id=data.from_id, document_id=doc.id,
                                          version_id=current.id if (data.pin_version and current) else None,
                                          pinned_version_no=current.version_no if current else None, section_ref=section,
                                          created_by_user_id=getattr(user, "id", None))
            log_audit(db, "CREATE", "DocumentReference", ref.id, f"{data.from_type}:{data.from_id} -> {doc.doc_no} {section}".strip(),
                      new_value=data.model_dump(), user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except IntegrityError:
            db.rollback()                          # two requests made the same reference at once (R1 P2-3): the first one wins, both get it
            existing = self.repo.find_reference(data.from_type, data.from_id, doc.id, section)
            if existing is None:
                raise
            return self.reference_out(existing)
        except Exception:
            db.rollback()
            raise
        return self.reference_out(self.repo.get_reference(ref.id))

    def references_of(self, document_id: str, user, data_scope: Optional[Scope]) -> list[dict]:
        doc = self._visible(self.repo.get(document_id), user, data_scope)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return [self.reference_out(r) for r in self.repo.references_of(doc.id)]

    def references_from(self, from_type: str, from_id: str, user, data_scope: Optional[Scope]) -> list[dict]:
        out = []
        for ref in self.repo.references_from(from_type, from_id):
            if self._visible(ref.document, user, data_scope) is not None:
                out.append(self.reference_out(ref))
        return out

    def delete_reference(self, reference_id: str, user, data_scope: Optional[Scope]) -> dict:
        ref = self.repo.get_reference(reference_id)
        doc = self._visible(ref.document, user, data_scope) if ref else None
        if ref is None or doc is None:
            raise HTTPException(status_code=404, detail="Reference not found")
        if ref.created_by_user_id != getattr(user, "id", None) and not self.can(user, doc.scope, "update"):
            raise perms.PermissionDenied(self._needed(doc.scope, "update"))
        db = self.repo.db
        try:
            db.delete(ref)
            log_audit(db, "DELETE", "DocumentReference", ref.id, f"{ref.from_type}:{ref.from_id} -> {doc.doc_no}",
                      old_value={"from_type": ref.from_type, "from_id": ref.from_id, "section_ref": ref.section_ref},
                      user_id=getattr(user, "id", None), username=getattr(user, "username", None), strict=True)
            db.commit()
        except Exception:
            db.rollback()
            raise
        return {"ok": True}
