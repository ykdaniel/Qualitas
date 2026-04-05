from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user, PermissionChecker, Permission

router = APIRouter(
    prefix="/checklist",
    tags=["checklist"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.Checklist)
def create_checklist(
    chk: schemas.ChecklistCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.create_checklist(db=db, chk=chk, user_id=current_user.id, username=current_user.username)

@router.get("/", response_model=List[schemas.Checklist])
def read_checklists(
    skip: int = 0, 
    limit: int = 100, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    itr_id: str = None,
    noi_number: str = None,

    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    return crud.get_checklists(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        status=status, 
        start_date=start_date, 
        end_date=end_date,
        itr_id=itr_id,
        noi_number=noi_number
    )

@router.get("/{checklist_id}", response_model=schemas.Checklist)
def read_checklist(checklist_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(get_current_user)):
    db_chk = crud.get_checklist(db, checklist_id=checklist_id)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.put("/{checklist_id}", response_model=schemas.Checklist)
def update_checklist(
    checklist_id: str, 
    chk: schemas.ChecklistUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_chk = crud.update_checklist(db, checklist_id=checklist_id, chk=chk, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.delete("/{checklist_id}")
def delete_checklist(
    checklist_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    db_chk = crud.delete_checklist(db, checklist_id=checklist_id, user_id=current_user.id, username=current_user.username)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"ok": True}
