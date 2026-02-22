from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from core.security import get_current_user
from core.dependencies import RoleChecker
from core.perms import CHECKLIST_VIEW, CHECKLIST_CREATE, CHECKLIST_UPDATE, CHECKLIST_DELETE

router = APIRouter(
    prefix="/checklist",
    tags=["Checklist"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.Checklist)
def create_checklist(
    chk: schemas.ChecklistCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_CREATE))
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
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_VIEW))
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

@router.get("/{checklist_id}/", response_model=schemas.Checklist)
def read_checklist(checklist_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(CHECKLIST_VIEW))):
    db_chk = crud.get_checklist(db, checklist_id=checklist_id)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.put("/{chk_id}/", response_model=schemas.Checklist)
def update_checklist(chk_id: str, chk: schemas.ChecklistUpdate, 
                     db: Session = Depends(get_db),
                     current_user: schemas.User = Depends(RoleChecker(CHECKLIST_UPDATE))):
    db_chk = crud.update_checklist(db, checklist_id=chk_id, chk=chk, user_id=current_user.id, username=current_user.username)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.delete("/{chk_id}/", response_model=dict)
def delete_checklist(chk_id: str, 
                     db: Session = Depends(get_db),
                     current_user: schemas.User = Depends(RoleChecker(CHECKLIST_DELETE))):
    db_chk = crud.delete_checklist(db, checklist_id=chk_id, user_id=current_user.id, username=current_user.username)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"ok": True}
