"""Controlled-document register API (KM-DOCS-2026-001 D1): /api/documents.

Permissions are decided per record in services/document_service.py (company documents km:*, project documents
document:*), so the dependencies here only authenticate and compute the data scope. Coded refusals: a Refusal from the
service is 409 for VERSION_CONFLICT / RECORD_LOCKED / INVALID_TRANSITION, 403 for a scope violation or a missing
permission, 400 otherwise — never a 500.
"""
from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import FileResponse

import models
import schemas
from core.dependencies import get_document_service
from core.perms import PermissionDenied
from core.refusals import Refusal, refusal_http
from core.scope import Scope, ScopeForbidden, get_scope
from core.security import get_current_user
from services.document_service import DocumentService

router = APIRouter(prefix="/documents", tags=["documents"])

CONFLICT_CODES = {"VERSION_CONFLICT", "RECORD_LOCKED", "INVALID_TRANSITION"}


def _http(e: Exception):
    if isinstance(e, ScopeForbidden):
        return refusal_http(e, 403)
    if isinstance(e, PermissionDenied):
        return refusal_http(e, 403)
    if isinstance(e, Refusal):
        return refusal_http(e, 409 if e.code in CONFLICT_CODES else 400)
    return refusal_http(e, 400)


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except (ValueError, ScopeForbidden, PermissionDenied) as e:
        raise _http(e)


@router.get("/", response_model=list[schemas.DocumentOut])
def list_documents(
    scope: str,
    project_id: str | None = None,
    doc_type: str | None = None,
    status: str | None = None,
    is_template: bool | None = None,
    q: str | None = None,
    include_hidden: bool = False,
    skip: int = 0,
    limit: int = 100,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.list_documents, scope, current_user, data_scope, project_id=project_id, doc_type=doc_type, status=status,
                is_template=is_template, q=q, include_hidden=include_hidden, skip=skip, limit=limit)


@router.post("/", response_model=schemas.DocumentDetailOut)
def create_document(
    body: schemas.DocumentCreate,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.create_document, body, current_user, data_scope)


@router.get("/references/by-source", response_model=list[schemas.DocumentReferenceOut])
def references_by_source(
    from_type: str,
    from_id: str,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.references_from, from_type, from_id, current_user, data_scope)


@router.post("/references", response_model=schemas.DocumentReferenceOut)
def add_reference(
    body: schemas.DocumentReferenceCreate,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.add_reference, body, current_user, data_scope)


@router.delete("/references/{reference_id}")
def delete_reference(
    reference_id: str,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.delete_reference, reference_id, current_user, data_scope)


@router.get("/{document_id}", response_model=schemas.DocumentDetailOut)
def get_document(
    document_id: str,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.get_document, document_id, current_user, data_scope)


@router.patch("/{document_id}", response_model=schemas.DocumentDetailOut)
def update_document(
    document_id: str,
    body: schemas.DocumentUpdate,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.update_document, document_id, body, current_user, data_scope)


@router.delete("/{document_id}")
def delete_document(
    document_id: str,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.delete_document, document_id, current_user, data_scope)


@router.post("/{document_id}/versions", response_model=schemas.DocumentVersionOut)
def add_version(
    document_id: str,
    word: UploadFile | None = File(None),
    pdf: UploadFile | None = File(None),
    change_summary: str | None = Form(None),
    version_label: str | None = Form(None),
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    """One transaction: the version row, its Word and / or PDF (attachments, entity_type document_version), the Word's text."""
    return _run(service.add_version, document_id, current_user, data_scope, word=word, pdf=pdf, change_summary=change_summary,
                version_label=version_label)


@router.patch("/{document_id}/versions/{version_id}/files", response_model=schemas.DocumentVersionOut)
def bind_version_files(
    document_id: str,
    version_id: str,
    word_attachment_id: str | None = None,
    pdf_attachment_id: str | None = None,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    """Bind files uploaded through /api/files/upload (entity_type=document_version, category word | pdf) to a draft version."""
    return _run(service.bind_files, document_id, version_id, current_user, data_scope, word_attachment_id=word_attachment_id,
                pdf_attachment_id=pdf_attachment_id)


@router.get("/{document_id}/versions/{version_id}/download", response_class=FileResponse)
def download_version_file(
    document_id: str,
    version_id: str,
    kind: str = "pdf",
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.download, document_id, version_id, kind, current_user, data_scope)


@router.post("/{document_id}/transition", response_model=schemas.DocumentDetailOut)
def transition(
    document_id: str,
    body: schemas.DocumentTransition,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    """company: current | archived | draft (draft from archived = unarchive, back to current when an issued version exists);
    project: submitted | approved | draft (send back) | void (reason required). superseded is never set by hand."""
    return _run(service.transition, document_id, body, current_user, data_scope)


@router.get("/{document_id}/references", response_model=list[schemas.DocumentReferenceOut])
def references_of(
    document_id: str,
    service: DocumentService = Depends(get_document_service),
    data_scope: Scope = Depends(get_scope),
    current_user: models.User = Depends(get_current_user),
):
    return _run(service.references_of, document_id, current_user, data_scope)
