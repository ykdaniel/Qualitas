from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from core.security import get_current_user
from core.dependencies import RoleChecker
from core.perms import NCR_VIEW, NCR_CREATE, NCR_UPDATE, NCR_DELETE, NCR_APPROVE, NCR_CLOSE

router = APIRouter(
    prefix="/ncr",
    tags=["NCR"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 無需認證
@router.get("/", response_model=List[schemas.NCR])
def read_ncrs(
    skip: int = 0, 
    limit: int = 500, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(NCR_VIEW))
):
    return crud.get_ncrs(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        status=status, 
        start_date=start_date, 
        end_date=end_date
    )

@router.get("/{ncr_id}/", response_model=schemas.NCR)
def read_ncr(ncr_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(NCR_VIEW))):
    db_ncr = crud.get_ncr(db, ncr_id=ncr_id)
    if db_ncr is None:
        raise HTTPException(status_code=404, detail="NCR not found")
    return db_ncr

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.NCR)
def create_ncr(
    ncr: schemas.NCRCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(NCR_CREATE))
):
    return crud.create_ncr(db=db, ncr=ncr, user_id=current_user.id, username=current_user.username)

@router.put("/{ncr_id}/", response_model=schemas.NCR)
def update_ncr(
    ncr_id: str, 
    ncr: schemas.NCRUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(NCR_UPDATE))
):
    try:
        db_ncr = crud.update_ncr(db, ncr_id=ncr_id, ncr=ncr, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_ncr is None:
        raise HTTPException(status_code=404, detail="NCR not found")
    return db_ncr

@router.delete("/{ncr_id}/")
def delete_ncr(
    ncr_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(NCR_DELETE))
):
    if crud.delete_ncr(db, ncr_id=ncr_id, user_id=current_user.id, username=current_user.username) is None:
        raise HTTPException(status_code=404, detail="NCR not found")
    return {"ok": True}
