
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_ncr_service, get_related_service
from core.perms import NCR_APPROVE, NCR_CREATE, NCR_DELETE, NCR_UPDATE, NCR_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from services.ncr_service import NCRService
from services.related_service import RelatedService

router = APIRouter(
    prefix="/ncr",
    tags=["NCR"],
    responses={404: {"description": "Not found"}},
)

# Owner/engineering authority sign-off represents an external party's decision
# (BACKLOG discussion) — anyone with plain ncr:update:all shouldn't be able to
# fill it in on the owner's behalf. Gated separately behind ncr:approve:all,
# which already existed as a defined-but-unwired permission.
_OWNER_APPROVAL_FIELDS = {'ownerApproval', 'ownerApprovalBy', 'ownerApprovalDate', 'ownerApprovalNotes'}

@router.get("/", response_model=list[schemas.NCR])
def read_ncrs(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_VIEW))
):
    return ncr_service.get_ncrs(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        scope=scope,
    )

@router.get("/{ncr_id}/", response_model=schemas.NCR)
def read_ncr(
    ncr_id: str,
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_VIEW))
):
    db_ncr = ncr_service.get_ncr(ncr_id=ncr_id, scope=scope)
    if db_ncr is None:
        raise HTTPException(status_code=404, detail="NCR not found")
    return db_ncr

@router.get("/{ncr_id}/export-docx", response_class=StreamingResponse)
def export_ncr_docx(
    ncr_id: str,
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_VIEW))
):
    """Formal .docx export of the NCR report (BACKLOG #18 pilot)."""
    try:
        return ncr_service.export_docx(ncr_id=ncr_id, scope=scope)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

def _require_approve_permission(current_user: "schemas.User") -> None:
    user_permissions = {p.code for p in current_user.role.permissions_rel}
    if NCR_APPROVE not in user_permissions:
        raise HTTPException(
            status_code=403,
            detail=f"Operation not permitted. Required: {NCR_APPROVE}",
        )


@router.post("/", response_model=schemas.NCR)
def create_ncr(
    ncr: schemas.NCRCreate,
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_CREATE))
):
    payload = ncr.model_dump(exclude_unset=True)
    # A plain ncr:create:all caller must not be able to pre-approve their own
    # NCR at creation time — same gate as update_ncr below.
    if any(payload.get(f) for f in _OWNER_APPROVAL_FIELDS):
        _require_approve_permission(current_user)
    try:
        return ncr_service.create_ncr(
            ncr_create=ncr, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.put("/{ncr_id}/", response_model=schemas.NCR)
def update_ncr(
    ncr_id: str,
    ncr: schemas.NCRUpdate,
    background_tasks: BackgroundTasks = None,
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_UPDATE))
):
    payload = ncr.model_dump(exclude_unset=True)
    touched = set(payload.keys()) & _OWNER_APPROVAL_FIELDS
    if touched:
        # The frontend resends the whole record on every save, so "touched"
        # (key present) is not "changed" — only gate when an owner-approval
        # field's value actually differs from what's on record, otherwise a
        # user without ncr:approve:all can never save an unrelated edit to
        # an NCR that already has an approval decision on it.
        existing = ncr_service.get_ncr(ncr_id=ncr_id, scope=scope)
        changed = existing is None or any(
            payload.get(f) != getattr(existing, f, None) for f in touched
        )
        if changed:
            _require_approve_permission(current_user)
    try:
        db_ncr = ncr_service.update_ncr(
            ncr_id=ncr_id, ncr_update=ncr,
            user_id=current_user.id, username=current_user.username,
            scope=scope, background_tasks=background_tasks,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_ncr is None:
        raise HTTPException(status_code=404, detail="NCR not found")
    return db_ncr

@router.delete("/{ncr_id}/")
def delete_ncr(
    ncr_id: str,
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_DELETE))
):
    deleted = ncr_service.delete_ncr(
        ncr_id=ncr_id, user_id=current_user.id, username=current_user.username,
        scope=scope,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="NCR not found")
    return {"ok": True}

@router.get("/{ncr_id}/related", response_model=schemas.RelatedEntitiesResponse)
def read_ncr_related(
    ncr_id: str,
    max_depth: int = 2,
    related_service: RelatedService = Depends(get_related_service),
    ncr_service: NCRService = Depends(get_ncr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_VIEW)),
):
    """Return upstream/downstream related documents for this NCR."""
    # Only expose the relation graph for an NCR the caller may actually see.
    if ncr_service.get_ncr(ncr_id=ncr_id, scope=scope) is None:
        raise HTTPException(status_code=404, detail="NCR not found")
    return related_service.get_related("ncr", ncr_id, max_depth=max_depth, scope=scope)
