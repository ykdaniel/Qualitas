
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_checklist_service
from core.perms import CHECKLIST_CLOSE, CHECKLIST_CREATE, CHECKLIST_DELETE, CHECKLIST_UPDATE, CHECKLIST_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from services.checklist_service import ChecklistService

router = APIRouter(
    prefix="/checklist",
    tags=["Checklist"],
    responses={404: {"description": "Not found"}},
)


def _require_checklist_close_permission(current_user: schemas.User) -> None:
    """§17 isolation hardening (2026-09-19): reopening/editing an already
    Pass/Fail checklist instance's own result requires CHECKLIST_CLOSE, not
    just CHECKLIST_UPDATE — mirrors the frontend's existing `canReopen`
    gate (`hasPermission('checklist:close:all')`), now actually enforced
    server-side. Scoped strictly to the checklist's own result: it never
    grants ITR approval authority, and never applies to a template (which
    can never legitimately reach Pass/Fail — see the service-layer guard)."""
    user_permissions = {p.code for p in current_user.role.permissions_rel} if current_user.role else set()
    if CHECKLIST_CLOSE not in user_permissions:
        raise HTTPException(status_code=403, detail=f"Operation not permitted. Required: {CHECKLIST_CLOSE}")

@router.post("/", response_model=schemas.Checklist)
def create_checklist(
    chk: schemas.ChecklistCreate,
    service: ChecklistService = Depends(get_checklist_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_CREATE))
):
    try:
        return service.create_checklist(chk, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/", response_model=list[schemas.Checklist])
def read_checklists(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    itr_id: str = None,
    noi_number: str = None,
    include_instances: bool = False,
    project_id: str = None,
    service: ChecklistService = Depends(get_checklist_service),
    scope: Scope = Depends(get_scope),
    _: schemas.User = Depends(RoleChecker(CHECKLIST_VIEW))
):
    return service.get_checklists(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        itr_id=itr_id,
        noi_number=noi_number,
        include_instances=include_instances,
        project_id=project_id,
        scope=scope,
    )

@router.get("/{checklist_id}/", response_model=schemas.Checklist)
def read_checklist(
    checklist_id: str,
    service: ChecklistService = Depends(get_checklist_service),
    scope: Scope = Depends(get_scope),
    _: schemas.User = Depends(RoleChecker(CHECKLIST_VIEW))
):
    db_chk = service.get_checklist(checklist_id, scope=scope)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.put("/{chk_id}/", response_model=schemas.Checklist)
def update_checklist(
    chk_id: str,
    chk: schemas.ChecklistUpdate,
    service: ChecklistService = Depends(get_checklist_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_UPDATE))
):
    existing = service.get_checklist(chk_id, scope=scope)
    if existing is not None and existing.status in ('Pass', 'Fail'):
        _require_checklist_close_permission(current_user)
    try:
        db_chk = service.update_checklist(chk_id, chk, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.delete("/{chk_id}/", response_model=dict)
def delete_checklist(
    chk_id: str,
    reason: str = None,
    service: ChecklistService = Depends(get_checklist_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_DELETE))
):
    try:
        deleted = service.delete_checklist(chk_id, user_id=current_user.id, username=current_user.username, reason=reason, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"ok": True}
