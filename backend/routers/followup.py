

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_followup_service
from core.perms import FOLLOWUP_CREATE, FOLLOWUP_DELETE, FOLLOWUP_UPDATE, FOLLOWUP_VIEW
from database import get_db
from services.followup_service import FollowUpService

router = APIRouter(
    prefix="/followup",
    tags=["followup"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 FOLLOWUP_VIEW
@router.get("/", response_model=list[schemas.FollowUp])
def read_followups(
    skip: int = 0,
    limit: int = 500,
    followup_service: FollowUpService = Depends(get_followup_service),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_VIEW))
):
    return followup_service.get_followups(skip=skip, limit=limit)

@router.get("/{followup_id}", response_model=schemas.FollowUp)
def read_followup(
    followup_id: str,
    followup_service: FollowUpService = Depends(get_followup_service),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_VIEW))
):
    db_f = followup_service.get_followup(followup_id=followup_id)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.FollowUp)
def create_followup(
    followup: schemas.FollowUpCreate,
    followup_service: FollowUpService = Depends(get_followup_service),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_CREATE))
):
    return followup_service.create_followup(followup_create=followup, user_id=current_user.id, username=current_user.username)

@router.put("/{followup_id}", response_model=schemas.FollowUp)
def update_followup(
    followup_id: str,
    followup: schemas.FollowUpUpdate,
    followup_service: FollowUpService = Depends(get_followup_service),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_UPDATE))
):
    db_f = followup_service.update_followup(followup_id=followup_id, followup_update=followup, user_id=current_user.id, username=current_user.username)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

@router.delete("/{followup_id}")
def delete_followup(
    followup_id: str,
    followup_service: FollowUpService = Depends(get_followup_service),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_DELETE))
):
    deleted = followup_service.delete_followup(followup_id=followup_id, user_id=current_user.id, username=current_user.username)
    if not deleted:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"ok": True}
