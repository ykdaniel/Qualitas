
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_itr_service
from core.perms import ITR_CREATE, ITR_DELETE, ITR_UPDATE, ITR_VIEW
from database import get_db
from services.itr_service import ITRService

router = APIRouter(
    prefix="/itr",
    tags=["itr"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 ITR_VIEW
@router.get("/", response_model=list[schemas.ITR])
def read_itrs(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    return itr_service.get_itrs(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{itr_id}", response_model=schemas.ITR)
def read_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    db_itr = itr_service.get_itr(itr_id=itr_id)
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.ITR)
def create_itr(
    itr: schemas.ITRCreate,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_CREATE))
):
    return itr_service.create_itr(
        itr_create=itr, user_id=current_user.id, username=current_user.username
    )

@router.put("/{itr_id}", response_model=schemas.ITR)
def update_itr(
    itr_id: str,
    itr: schemas.ITRUpdate,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    try:
        db_itr = itr_service.update_itr(
            itr_id=itr_id, itr_update=itr,
            user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

@router.delete("/{itr_id}")
def delete_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_DELETE))
):
    deleted = itr_service.delete_itr(
        itr_id=itr_id, user_id=current_user.id, username=current_user.username
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="ITR not found")
    return {"ok": True}

# New endpoint: Link Checklist to ITR
@router.post("/{itr_id}/link-checklist", response_model=schemas.ITR)
def link_checklist_to_itr(
    itr_id: str,
    checklist_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    """Link a Checklist to an ITR"""
    db_itr = itr_service.link_checklist(
        itr_id=itr_id,
        checklist_id=checklist_id,
        user_id=current_user.id,
        username=current_user.username
    )
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr
