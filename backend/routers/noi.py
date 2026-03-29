
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_noi_service
from core.perms import NOI_CREATE, NOI_DELETE, NOI_UPDATE, NOI_VIEW
from database import get_db
from services.noi_service import NOIService

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
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    return noi_service.get_nois(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{noi_id}/", response_model=schemas.NOI)
def read_noi(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    db_noi = noi_service.get_noi(noi_id=noi_id)
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.NOI)
def create_noi(
    noi: schemas.NOICreate,
    noi_service: NOIService = Depends(get_noi_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    return noi_service.create_noi(
        noi_create=noi, user_id=current_user.id, username=current_user.username
    )

@router.post("/bulk/", response_model=list[schemas.NOI])
def create_nois_bulk(
    nois: list[schemas.NOICreate],
    noi_service: NOIService = Depends(get_noi_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    """批次建立多筆 NOI，每筆都會自動產生 Reference No"""
    created = []
    for noi in nois:
        created.append(noi_service.create_noi(
            noi_create=noi, user_id=current_user.id, username=current_user.username
        ))
    return created

@router.put("/{noi_id}/", response_model=schemas.NOI)
def update_noi(
    noi_id: str,
    noi: schemas.NOIUpdate,
    noi_service: NOIService = Depends(get_noi_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_UPDATE))
):
    db_noi = noi_service.update_noi(
        noi_id=noi_id, noi_update=noi, user_id=current_user.id, username=current_user.username
    )
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

@router.delete("/{noi_id}/", response_model=dict)
def delete_noi(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    current_user: schemas.User = Depends(RoleChecker(NOI_DELETE))
):
    deleted = noi_service.delete_noi(
        noi_id=noi_id, user_id=current_user.id, username=current_user.username
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="NOI not found")
    return {"ok": True}
