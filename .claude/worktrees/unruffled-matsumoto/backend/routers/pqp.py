
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user, PermissionChecker, Permission

router = APIRouter(
    prefix="/pqp",
    tags=["pqp"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 無需認證
@router.get("/", response_model=List[schemas.PQP])
def read_pqps(
    skip: int = 0, 
    limit: int = 500, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db)
):
    return crud.get_pqps(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        status=status, 
        start_date=start_date, 
        end_date=end_date
    )

@router.get("/{pqp_id}", response_model=schemas.PQP)
def read_pqp(pqp_id: str, db: Session = Depends(get_db)):
    db_pqp = crud.get_pqp(db, pqp_id=pqp_id)
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.PQP)
def create_pqp(
    pqp: schemas.PQPCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_pqp(db=db, pqp=pqp, user_id=current_user.id, username=current_user.username)

@router.put("/{pqp_id}", response_model=schemas.PQP)
def update_pqp(
    pqp_id: str, 
    pqp: schemas.PQPUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_pqp = crud.update_pqp(db, pqp_id=pqp_id, pqp=pqp, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp

@router.delete("/{pqp_id}")
def delete_pqp(
    pqp_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if crud.delete_pqp(db, pqp_id=pqp_id, user_id=current_user.id, username=current_user.username) is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return {"ok": True}
