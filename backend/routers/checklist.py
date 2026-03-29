
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_checklist_service
from core.perms import CHECKLIST_CREATE, CHECKLIST_DELETE, CHECKLIST_UPDATE, CHECKLIST_VIEW
from services.checklist_service import ChecklistService

router = APIRouter(
    prefix="/checklist",
    tags=["Checklist"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.Checklist)
def create_checklist(
    chk: schemas.ChecklistCreate,
    service: ChecklistService = Depends(get_checklist_service),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_CREATE))
):
    return service.create_checklist(chk, user_id=current_user.id, username=current_user.username)

@router.get("/", response_model=list[schemas.Checklist])
def read_checklists(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    itr_id: str = None,
    noi_number: str = None,
    service: ChecklistService = Depends(get_checklist_service),
    _: schemas.User = Depends(RoleChecker(CHECKLIST_VIEW))
):
    return service.get_checklists(
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
def read_checklist(
    checklist_id: str,
    service: ChecklistService = Depends(get_checklist_service),
    _: schemas.User = Depends(RoleChecker(CHECKLIST_VIEW))
):
    db_chk = service.get_checklist(checklist_id)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.put("/{chk_id}/", response_model=schemas.Checklist)
def update_checklist(
    chk_id: str,
    chk: schemas.ChecklistUpdate,
    service: ChecklistService = Depends(get_checklist_service),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_UPDATE))
):
    db_chk = service.update_checklist(chk_id, chk, user_id=current_user.id, username=current_user.username)
    if db_chk is None:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return db_chk

@router.delete("/{chk_id}/", response_model=dict)
def delete_checklist(
    chk_id: str,
    reason: str = None,
    service: ChecklistService = Depends(get_checklist_service),
    current_user: schemas.User = Depends(RoleChecker(CHECKLIST_DELETE))
):
    deleted = service.delete_checklist(chk_id, user_id=current_user.id, username=current_user.username, reason=reason)
    if not deleted:
        raise HTTPException(status_code=404, detail="Checklist not found")
    return {"ok": True}
