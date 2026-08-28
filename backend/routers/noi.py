
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_noi_service, get_related_service
from core.perms import NOI_CREATE, NOI_DELETE, NOI_UPDATE, NOI_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from services.noi_service import NOIService
from services.related_service import RelatedService

router = APIRouter(
    prefix="/noi",
    tags=["NOI"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 無需認證
@router.get("/", response_model=list[schemas.NOI])
def read_nois(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    return noi_service.get_nois(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        scope=scope,
    )

@router.get("/{noi_id}/", response_model=schemas.NOI)
def read_noi(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    db_noi = noi_service.get_noi(noi_id=noi_id, scope=scope)
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.NOI)
def create_noi(
    noi: schemas.NOICreate,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    try:
        return noi_service.create_noi(
            noi_create=noi, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.post("/bulk/", response_model=list[schemas.NOI])
def create_nois_bulk(
    nois: list[schemas.NOICreate],
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    """批次建立多筆 NOI，每筆都會自動產生 Reference No"""
    created = []
    try:
        for noi in nois:
            created.append(noi_service.create_noi(
                noi_create=noi, user_id=current_user.id, username=current_user.username,
                scope=scope,
            ))
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    return created

@router.put("/{noi_id}/", response_model=schemas.NOI)
def update_noi(
    noi_id: str,
    noi: schemas.NOIUpdate,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_UPDATE))
):
    try:
        db_noi = noi_service.update_noi(
            noi_id=noi_id, noi_update=noi, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

@router.delete("/{noi_id}/", response_model=dict)
def delete_noi(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_DELETE))
):
    deleted = noi_service.delete_noi(
        noi_id=noi_id, user_id=current_user.id, username=current_user.username,
        scope=scope,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="NOI not found")
    return {"ok": True}

@router.get("/{noi_id}/related", response_model=schemas.RelatedEntitiesResponse)
def read_noi_related(
    noi_id: str,
    max_depth: int = 2,
    related_service: RelatedService = Depends(get_related_service),
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW)),
):
    """Return upstream/downstream related documents for this NOI."""
    # Only expose the relation graph for an NOI the caller may actually see.
    if noi_service.get_noi(noi_id=noi_id, scope=scope) is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return related_service.get_related("noi", noi_id, max_depth=max_depth)
