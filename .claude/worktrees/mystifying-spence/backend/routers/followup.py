
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import PermissionChecker, Permission

router = APIRouter(
    prefix="/followup",
    tags=["followup"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 無需認證
@router.get("/", response_model=List[schemas.FollowUp])
def read_followups(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    return crud.get_followups(db, skip=skip, limit=limit)

@router.get("/{followup_id}", response_model=schemas.FollowUp)
def read_followup(followup_id: str, db: Session = Depends(get_db)):
    db_f = crud.get_followup(db, followup_id=followup_id)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.FollowUp)
def create_followup(
    followup: schemas.FollowUpCreate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE]))
):
    return crud.create_followup(db=db, followup=followup)

@router.put("/{followup_id}", response_model=schemas.FollowUp)
def update_followup(
    followup_id: str, 
    followup: schemas.FollowUpUpdate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE]))
):
    db_f = crud.update_followup(db, followup_id=followup_id, followup=followup)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

@router.delete("/{followup_id}")
def delete_followup(
    followup_id: str, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.DELETE]))
):
    if crud.delete_followup(db, followup_id=followup_id) is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"ok": True}
