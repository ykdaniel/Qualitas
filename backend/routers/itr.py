
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional

import schemas
from core.dependencies import RoleChecker, get_itr_service, get_related_service
from core.perms import ITR_APPROVE, ITR_CREATE, ITR_DELETE, ITR_UPDATE, ITR_VIEW, NCR_CREATE
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from repositories.itr_repository import ITRRepository
from services.itr_service import ApprovalAuthorityError, ITRService, TemplateNotFoundError
from services.related_service import RelatedService

router = APIRouter(
    prefix="/itr",
    tags=["itr"],
    responses={404: {"description": "Not found"}},
)


def _require_itr_approve_permission(current_user: schemas.User) -> None:
    """Approval-authority hardening (2026-09-19), mirrors Checklist's
    _require_checklist_close_permission — entering Approved (create or
    update) requires ITR_APPROVE in addition to ITR_CREATE/ITR_UPDATE.
    Plain edit authority must never double as approval authority."""
    user_permissions = {p.code for p in current_user.role.permissions_rel} if current_user.role else set()
    if ITR_APPROVE not in user_permissions:
        raise HTTPException(status_code=403, detail=f"Operation not permitted. Required: {ITR_APPROVE}")

# 讀取操作 - 需要 ITR_VIEW
@router.get("/", response_model=list[schemas.ITR])
def read_itrs(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    vendor_id: Optional[str] = None,
    noi_number: Optional[str] = None,
    project_id: Optional[str] = None,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    return itr_service.get_itrs(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        vendor_id=vendor_id,
        noi_number=noi_number,
        project_id=project_id,
        scope=scope,
    )


@router.get("/stats")
def get_itr_stats(
    project_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    db: Session = Depends(get_db),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW)),
):
    # Same view permission and the same data-isolation scope as the ITR list (2026-09-20). The optional
    # project_id / vendor_id only narrow the result inside that scope; they never extend it.
    repo = ITRRepository(db)
    return repo.get_stats(project_id=project_id, scope=scope, vendor_id=vendor_id)


@router.post("/batch-update")
def batch_update_itrs(
    payload: dict,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE)),
):
    ids = payload.get("ids")
    status = payload.get("status")
    if not ids or not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a non-empty list of strings")
    if not status or not isinstance(status, str):
        raise HTTPException(status_code=400, detail="status must be a non-empty string")

    # Entering Approved needs ITR_APPROVE on EVERY route that can do it. The PUT route
    # checks it; this bulk route only checked ITR_UPDATE, so a role with edit authority alone
    # could approve through here (found 2026-09-20 while making approvals attributable).
    if status == 'Approved':
        _require_itr_approve_permission(current_user)

    updated = []
    failed = []
    for itr_id in ids:
        try:
            itr_update = schemas.ITRUpdate(status=status)
            db_itr = itr_service.update_itr(
                itr_id=itr_id,
                itr_update=itr_update,
                user_id=current_user.id,
                username=current_user.username,
                scope=scope,
            )
            if db_itr is None:
                failed.append({"id": itr_id, "error": "ITR not found"})
            else:
                updated.append(itr_id)
        except (ScopeForbidden, ApprovalAuthorityError) as e:
            failed.append({"id": itr_id, "error": str(e)})
        except ValueError as e:
            failed.append({"id": itr_id, "error": str(e)})
    return {"updated": updated, "failed": failed}


@router.get("/{itr_id}", response_model=schemas.ITR)
def read_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    db_itr = itr_service.get_itr(itr_id=itr_id, scope=scope)
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

@router.get("/{itr_id}/export-docx", response_class=StreamingResponse)
def export_itr_docx(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    """Formal .docx export of the ITR report, including linked Checklist
    results (ITR-EXPORT-DOCX-2026-001)."""
    try:
        return itr_service.export_docx(itr_id=itr_id, scope=scope)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# Approval history — READ-ONLY (2026-09-20). Same permission and data scope as reading the ITR itself; the
# event must belong to the ITR in the path. There is deliberately no POST/PUT/DELETE for events.
@router.get("/{itr_id}/approval-events", response_model=schemas.ITRApprovalEventPage)
def read_itr_approval_events(
    itr_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    page = itr_service.list_approval_events(itr_id, scope=scope, skip=skip, limit=limit)
    if page is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return page

@router.get("/{itr_id}/approval-events/{event_id}", response_model=schemas.ITRApprovalEventDetail)
def read_itr_approval_event(
    itr_id: str,
    event_id: int,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    event = itr_service.get_approval_event(itr_id, event_id, scope=scope)
    if event is None:
        raise HTTPException(status_code=404, detail="Approval event not found")
    return event

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.ITR)
def create_itr(
    itr: schemas.ITRCreate,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_CREATE))
):
    # Approval-authority hardening (2026-09-19): the service layer already
    # refuses to create an ITR pre-Approved (impossible to satisfy the
    # passing-checklist requirement at creation time), but if that policy
    # ever loosens, entering Approved must still require ITR_APPROVE, not
    # just ITR_CREATE — check here too, covering the path per-endpoint.
    if itr.status == 'Approved':
        _require_itr_approve_permission(current_user)
    try:
        return itr_service.create_itr(
            itr_create=itr, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{itr_id}", response_model=schemas.ITR)
def update_itr(
    itr_id: str,
    itr: schemas.ITRUpdate,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    # Approval-authority hardening (2026-09-19): entering Approved requires
    # ITR_APPROVE in addition to plain ITR_UPDATE — a role with only edit
    # authority must never be able to approve. Leaving Approved is handled
    # entirely by the service layer now (blocked outright via this path).
    existing = itr_service.get_itr(itr_id, scope=scope)
    if existing is not None and itr.status == 'Approved' and existing.status != 'Approved':
        _require_itr_approve_permission(current_user)
    try:
        db_itr = itr_service.update_itr(
            itr_id=itr_id, itr_update=itr,
            user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except (ScopeForbidden, ApprovalAuthorityError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

@router.post("/{itr_id}/revoke-approval", response_model=schemas.ITR)
def revoke_itr_approval(
    itr_id: str,
    body: schemas.ITRRevokeApproval,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_APPROVE))
):
    """The only sanctioned way to leave an Approved ITR (2026-09-19) —
    gated on ITR_APPROVE alone (not ITR_UPDATE), requires a reason."""
    try:
        db_itr = itr_service.revoke_itr_approval(
            itr_id=itr_id, new_status=body.new_status, reason=body.reason,
            user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

@router.post("/{itr_id}/create-ncr")
def create_ncr_from_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NCR_CREATE)),
):
    """Auto-create an NCR from a failed ITR."""
    try:
        ncr = itr_service.create_ncr_from_itr(
            itr_id=itr_id,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if ncr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return ncr


@router.post("/{itr_id}/re-inspect")
def create_reinspection(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_CREATE)),
):
    """Create a re-inspection ITR from an existing ITR."""
    try:
        new_itr = itr_service.create_reinspection(
            itr_id=itr_id,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if new_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return new_itr


@router.delete("/{itr_id}")
def delete_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_DELETE))
):
    try:
        deleted = itr_service.delete_itr(
            itr_id=itr_id, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="ITR not found")
    return {"ok": True}

@router.get("/{itr_id}/related", response_model=schemas.RelatedEntitiesResponse)
def read_itr_related(
    itr_id: str,
    max_depth: int = 2,
    related_service: RelatedService = Depends(get_related_service),
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW)),
):
    """Return upstream/downstream related documents for this ITR."""
    # Only expose the relation graph for an ITR the caller may actually see.
    if itr_service.get_itr(itr_id=itr_id, scope=scope) is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return related_service.get_related("itr", itr_id, max_depth=max_depth, scope=scope)

# New endpoint: Link Checklist to ITR
@router.post("/{itr_id}/link-checklist", response_model=schemas.ITR)
def link_checklist_to_itr(
    itr_id: str,
    checklist_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    """Link a Checklist to an ITR"""
    try:
        db_itr = itr_service.link_checklist(
            itr_id=itr_id,
            checklist_id=checklist_id,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope,
        )
    except TemplateNotFoundError as e:
        # missing and out-of-scope look identical (same status, same body)
        raise HTTPException(status_code=404, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr


# §17: Unlink (delete) a checklist instance from an ITR
@router.delete("/{itr_id}/link-checklist/{checklist_id}", response_model=schemas.ITR)
def unlink_checklist_from_itr(
    itr_id: str,
    checklist_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    """Remove a checklist instance from an ITR (deletes the ITR-owned copy)."""
    try:
        db_itr = itr_service.unlink_checklist(
            itr_id=itr_id,
            checklist_id=checklist_id,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR or checklist instance not found")
    return db_itr
