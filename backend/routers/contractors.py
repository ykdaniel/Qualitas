from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from core.dependencies import RoleChecker
from core.perms import CONTRACTOR_VIEW, CONTRACTOR_MANAGE

router = APIRouter(
    prefix="/contractors",
    tags=["contractors"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=List[schemas.Contractor])
def read_contractors(skip: int = 0, limit: int = 500, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_VIEW))):
    return crud.get_contractors(db, skip=skip, limit=limit)

@router.get("/{contractor_id}", response_model=schemas.Contractor)
def read_contractor(contractor_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_VIEW))):
    db_c = crud.get_contractor(db, contractor_id=contractor_id)
    if db_c is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return db_c

@router.post("/", response_model=schemas.Contractor)
def create_contractor(
    contractor: schemas.ContractorCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    return crud.create_contractor(db=db, contractor=contractor)

@router.put("/{contractor_id}", response_model=schemas.Contractor)
def update_contractor(
    contractor_id: str, 
    contractor: schemas.ContractorUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    db_c = crud.update_contractor(db, contractor_id=contractor_id, contractor=contractor)
    if db_c is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return db_c

@router.delete("/{contractor_id}")
def delete_contractor(
    contractor_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    if crud.delete_contractor(db, contractor_id=contractor_id) is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {"ok": True}

