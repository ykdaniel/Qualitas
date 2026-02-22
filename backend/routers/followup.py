
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user
from core.dependencies import RoleChecker
from core.perms import FOLLOWUP_VIEW, FOLLOWUP_CREATE, FOLLOWUP_UPDATE, FOLLOWUP_DELETE

router = APIRouter(
    prefix="/followup",
    tags=["followup"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 FOLLOWUP_VIEW
@router.get("/", response_model=List[schemas.FollowUp])
def read_followups(skip: int = 0, limit: int = 500, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_VIEW))):
    return crud.get_followups(db, skip=skip, limit=limit)

@router.get("/{followup_id}", response_model=schemas.FollowUp)
def read_followup(followup_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_VIEW))):
    db_f = crud.get_followup(db, followup_id=followup_id)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.FollowUp)
def create_followup(
    followup: schemas.FollowUpCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_CREATE))
):
    return crud.create_followup(db=db, followup=followup, user_id=current_user.id, username=current_user.username)

@router.put("/{followup_id}", response_model=schemas.FollowUp)
def update_followup(
    followup_id: str, 
    followup: schemas.FollowUpUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_UPDATE))
):
    db_f = crud.update_followup(db, followup_id=followup_id, followup=followup, user_id=current_user.id, username=current_user.username)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

@router.delete("/{followup_id}")
def delete_followup(
    followup_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_DELETE))
):
    if crud.delete_followup(db, followup_id=followup_id, user_id=current_user.id, username=current_user.username) is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"ok": True}
