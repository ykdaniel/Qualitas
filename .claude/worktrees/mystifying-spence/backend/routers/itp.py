
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user, PermissionChecker, Permission

router = APIRouter(
    prefix="/itp",
    tags=["itp"],
    responses={404: {"description": "Not found"}},
)

# NOTE: 寫入操作需要認證，讀取操作暫時開放
@router.post("/", response_model=schemas.ITP)
def create_itp(
    itp: schemas.ITPCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_itp(db=db, itp=itp, user_id=current_user.id, username=current_user.username)

@router.get("/", response_model=List[schemas.ITP])
def read_itps(
    skip: int = 0, 
    limit: int = 100, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db)
):
    itps = crud.get_itps(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        status=status, 
        start_date=start_date, 
        end_date=end_date
    )
    return itps

@router.get("/{itp_id}", response_model=schemas.ITP)
def read_itp(itp_id: str, db: Session = Depends(get_db)):
    db_itp = crud.get_itp(db, itp_id=itp_id)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.put("/{itp_id}", response_model=schemas.ITP)
def update_itp(
    itp_id: str, 
    itp: schemas.ITPUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_itp = crud.update_itp(db, itp_id=itp_id, itp=itp, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.delete("/{itp_id}")
def delete_itp(
    itp_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    db_itp = crud.delete_itp(db, itp_id=itp_id, user_id=current_user.id, username=current_user.username)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return {"ok": True}

@router.put("/{itp_id}/detail", response_model=schemas.ITP)
def update_itp_detail(
    itp_id: str, 
    body: schemas.ITPDetailBody, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    db_itp = crud.update_itp_detail(db, itp_id=itp_id, detail_body=body.dict(), user_id=current_user.id, username=current_user.username)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp
