
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import PermissionChecker, Permission

router = APIRouter(
    prefix="/contractors",
    tags=["contractors"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 無需認證
@router.get("/", response_model=List[schemas.Contractor])
def read_contractors(skip: int = 0, limit: int = 500, db: Session = Depends(get_db)):
    return crud.get_contractors(db, skip=skip, limit=limit)

@router.get("/{contractor_id}", response_model=schemas.Contractor)
def read_contractor(contractor_id: str, db: Session = Depends(get_db)):
    db_c = crud.get_contractor(db, contractor_id=contractor_id)
    if db_c is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return db_c

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.Contractor)
def create_contractor(
    contractor: schemas.ContractorCreate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE]))
):
    return crud.create_contractor(db=db, contractor=contractor)

@router.put("/{contractor_id}", response_model=schemas.Contractor)
def update_contractor(
    contractor_id: str, 
    contractor: schemas.ContractorUpdate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE]))
):
    db_c = crud.update_contractor(db, contractor_id=contractor_id, contractor=contractor)
    if db_c is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return db_c

@router.delete("/{contractor_id}")
def delete_contractor(
    contractor_id: str, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.DELETE]))
):
    if crud.delete_contractor(db, contractor_id=contractor_id) is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {"ok": True}
