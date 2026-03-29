from fastapi import APIRouter, Depends, HTTPException

import schemas
from core.dependencies import RoleChecker, get_audit_service
from core.perms import AUDIT_VIEW, AUDIT_CREATE, AUDIT_UPDATE, AUDIT_DELETE
from services.audit_service import AuditService

router = APIRouter(
    prefix="/audit",
    tags=["audit"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=list[schemas.Audit])
def read_audits(
    skip: int = 0,
    limit: int = 100,
    service: AuditService = Depends(get_audit_service),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_VIEW))
):
    """Get list of audits with pagination"""
    return service.get_audits(skip=skip, limit=limit)

@router.get("/{audit_id}", response_model=schemas.Audit)
def read_audit(
    audit_id: str,
    service: AuditService = Depends(get_audit_service),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_VIEW))
):
    """Get a single audit by ID"""
    db_audit = service.get_audit(audit_id)
    if db_audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return db_audit

@router.post("/", response_model=schemas.Audit)
def create_audit_route(
    audit: schemas.AuditCreate,
    service: AuditService = Depends(get_audit_service),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_CREATE))
):
    """Create a new audit"""
    return service.create_audit(
        audit,
        user_id=current_user.id,
        username=current_user.username
    )

@router.put("/{audit_id}", response_model=schemas.Audit)
def update_audit_route(
    audit_id: str,
    audit: schemas.AuditUpdate,
    service: AuditService = Depends(get_audit_service),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_UPDATE))
):
    """Update an existing audit"""
    db_audit = service.update_audit(
        audit_id,
        audit,
        user_id=current_user.id,
        username=current_user.username
    )
    if db_audit is None:
        raise HTTPException(status_code=404, detail="Audit not found")
    return db_audit

@router.delete("/{audit_id}")
def delete_audit_route(
    audit_id: str,
    service: AuditService = Depends(get_audit_service),
    current_user: schemas.User = Depends(RoleChecker(AUDIT_DELETE))
):
    """Delete an audit"""
    success = service.delete_audit(
        audit_id,
        user_id=current_user.id,
        username=current_user.username
    )
    if not success:
        raise HTTPException(status_code=404, detail="Audit not found")
    return {"ok": True}
