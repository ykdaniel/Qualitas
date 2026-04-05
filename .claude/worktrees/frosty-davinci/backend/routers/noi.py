
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user, PermissionChecker, Permission

router = APIRouter(
    prefix="/noi",
    tags=["noi"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 無需認證
@router.get("/", response_model=List[schemas.NOI])
def read_nois(
    skip: int = 0, 
    limit: int = 500, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.get_nois(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        status=status, 
        start_date=start_date, 
        end_date=end_date
    )

@router.get("/{noi_id}", response_model=schemas.NOI)
def read_noi(noi_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    db_noi = crud.get_noi(db, noi_id=noi_id)
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.NOI)
def create_noi(
    noi: schemas.NOICreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_noi(db=db, noi=noi, user_id=current_user.id, username=current_user.username)

@router.post("/bulk/", response_model=List[schemas.NOI])
def create_nois_bulk(
    nois: List[schemas.NOICreate], 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """批次建立多筆 NOI，每筆都會自動產生 Reference No"""
    created = []
    for noi in nois:
        created.append(crud.create_noi(db=db, noi=noi, user_id=current_user.id, username=current_user.username))
    return created

@router.put("/{noi_id}", response_model=schemas.NOI)
def update_noi(
    noi_id: str, 
    noi: schemas.NOIUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_noi = crud.update_noi(db, noi_id=noi_id, noi=noi, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

@router.delete("/{noi_id}")
def delete_noi(
    noi_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    if crud.delete_noi(db, noi_id=noi_id, user_id=current_user.id, username=current_user.username) is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return {"ok": True}
