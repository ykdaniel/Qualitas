
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_pqp_service
from core.perms import PQP_APPROVE, PQP_CREATE, PQP_DELETE, PQP_UPDATE, PQP_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from services.pqp_service import PQPService

router = APIRouter(
    prefix="/pqp",
    tags=["pqp"],
    responses={404: {"description": "Not found"}},
)

def _require_pqp_approve_permission(current_user: "schemas.User") -> None:
    user_permissions = {p.code for p in current_user.role.permissions_rel}
    if PQP_APPROVE not in user_permissions:
        raise HTTPException(
            status_code=403,
            detail=f"Operation not permitted. Required: {PQP_APPROVE}",
        )

# 讀取操作 - 需要認證 VIEW
@router.get("/", response_model=list[schemas.PQP])
def read_pqps(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    pqp_service: PQPService = Depends(get_pqp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(PQP_VIEW))
):
    return pqp_service.get_pqps(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        scope=scope,
    )

@router.get("/{pqp_id}", response_model=schemas.PQP)
def read_pqp(
    pqp_id: str,
    pqp_service: PQPService = Depends(get_pqp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(PQP_VIEW))
):
    db_pqp = pqp_service.get_pqp(pqp_id=pqp_id, scope=scope)
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp

# 寫入操作 - 需要認證 CREATE/UPDATE/DELETE
@router.post("/", response_model=schemas.PQP)
def create_pqp(
    pqp: schemas.PQPCreate,
    pqp_service: PQPService = Depends(get_pqp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(PQP_CREATE))
):
    try:
        return pqp_service.create_pqp(
            pqp_create=pqp, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.put("/{pqp_id}", response_model=schemas.PQP)
def update_pqp(
    pqp_id: str,
    pqp: schemas.PQPUpdate,
    pqp_service: PQPService = Depends(get_pqp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(PQP_UPDATE))
):
    # Approving is a dedicated action (see publish_pqp, which also snapshots
    # PQPHistory) — plain pqp:update:all must not be able to reach Approved
    # via a normal save, same reasoning as NCR's owner-approval field gate.
    if pqp.status is not None:
        existing = pqp_service.get_pqp(pqp_id=pqp_id, scope=scope)
        if existing is not None:
            target = PQPService._normalize_pqp_status(pqp.status)
            current = PQPService._normalize_pqp_status(existing.status) or existing.status
            if target == "Approved" and target != current:
                _require_pqp_approve_permission(current_user)
    try:
        db_pqp = pqp_service.update_pqp(
            pqp_id=pqp_id, pqp_update=pqp,
            user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp

@router.post("/{pqp_id}/publish", response_model=schemas.PQP)
def publish_pqp(
    pqp_id: str,
    body: schemas.PQPPublish = schemas.PQPPublish(),
    pqp_service: PQPService = Depends(get_pqp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(PQP_APPROVE))
):
    try:
        db_pqp = pqp_service.publish_pqp(
            pqp_id=pqp_id,
            change_summary=body.change_summary,
            user_id=current_user.id,
            username=current_user.username,
            scope=scope,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp


@router.get("/{pqp_id}/history", response_model=list[schemas.PQPHistoryItem])
def get_pqp_history(
    pqp_id: str,
    pqp_service: PQPService = Depends(get_pqp_service),
    current_user: schemas.User = Depends(RoleChecker(PQP_VIEW))
):
    return pqp_service.get_history(pqp_id)


@router.delete("/{pqp_id}")
def delete_pqp(
    pqp_id: str,
    pqp_service: PQPService = Depends(get_pqp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(PQP_DELETE))
):
    deleted = pqp_service.delete_pqp(
        pqp_id=pqp_id, user_id=current_user.id, username=current_user.username,
        scope=scope,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="PQP not found")
    return {"ok": True}
