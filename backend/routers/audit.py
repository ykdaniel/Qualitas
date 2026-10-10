from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

import schemas
from core.dependencies import RoleChecker, get_audit_service
from core.perms import AUDIT_VIEW, AUDIT_CREATE, AUDIT_UPDATE, AUDIT_DELETE
from core.scope import Scope, ScopeForbidden, get_scope
from core.strict_dates import DateValidationError
from services.audit_service import AUDIT_DOCX_KINDS, AuditConflict, AuditService

router = APIRouter(
    prefix="/audit",
    tags=["audit"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=list[schemas.Audit])
def read_audits(
    skip: int = 0,
    limit: int = 100,
    project_id: str = None,
    service: AuditService = Depends(get_audit_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_VIEW))
):
    """Get list of audits with pagination"""
    return service.get_audits(skip=skip, limit=limit, project_id=project_id, scope=scope)

@router.get("/{audit_id}", response_model=schemas.Audit)
def read_audit(
    audit_id: str,
    service: AuditService = Depends(get_audit_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_VIEW))
):
    """Get a single audit by ID"""
    db_audit = service.get_audit(audit_id, scope=scope)
    if db_audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return db_audit

@router.get("/{audit_id}/export-docx", response_class=StreamingResponse)
def export_audit_docx(
    audit_id: str,
    kind: str = Query("report"),
    service: AuditService = Depends(get_audit_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_VIEW))
):
    """Formal .docx export: the whole audit report (default, AUDIT-EXPORT-DOCX-2026-001), or the audit plan / the
    on-site checklist (kind=plan / checklist, AUDIT-BUTTONS-2026-001) — the same three documents as the wizard's printouts."""
    if kind not in AUDIT_DOCX_KINDS:  # whitelist: an unknown kind is a bad request, never a guess
        raise HTTPException(status_code=400, detail=f"Unknown export kind '{kind}'. Allowed: {', '.join(AUDIT_DOCX_KINDS)}.")
    response = service.export_docx(audit_id, scope=scope, kind=kind)
    if response is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return response

@router.post("/", response_model=schemas.Audit)
def create_audit_route(
    audit: schemas.AuditCreate,
    service: AuditService = Depends(get_audit_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_CREATE))
):
    """Create a new audit"""
    try:
        return service.create_audit(
            audit,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except DateValidationError as e:
        raise HTTPException(status_code=422, detail=e.http_detail())
    except AuditConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{audit_id}", response_model=schemas.Audit)
def update_audit_route(
    audit_id: str,
    audit: schemas.AuditUpdate,
    service: AuditService = Depends(get_audit_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_UPDATE))
):
    """Update an existing audit"""
    try:
        db_audit = service.update_audit(
            audit_id,
            audit,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except DateValidationError as e:
        raise HTTPException(status_code=422, detail=e.http_detail())
    except AuditConflict as e:
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return db_audit

@router.delete("/{audit_id}")
def delete_audit_route(
    audit_id: str,
    service: AuditService = Depends(get_audit_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_DELETE))
):
    """Delete an audit"""
    try:
        success = service.delete_audit(
            audit_id,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not success:
        raise HTTPException(status_code=404, detail="Audit not found")
    return {"ok": True}
