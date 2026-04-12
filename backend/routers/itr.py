
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

import schemas
from core.dependencies import RoleChecker, get_itr_service, get_related_service
from core.perms import ITR_CREATE, ITR_DELETE, ITR_UPDATE, ITR_VIEW, NCR_CREATE
from database import get_db
from repositories.itr_repository import ITRRepository
from services.itr_service import ITRService
from services.related_service import RelatedService

router = APIRouter(
    prefix="/itr",
    tags=["itr"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 ITR_VIEW
@router.get("/", response_model=list[schemas.ITR])
def read_itrs(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    vendor_id: Optional[str] = None,
    noi_number: Optional[str] = None,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    return itr_service.get_itrs(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        vendor_id=vendor_id,
        noi_number=noi_number,
    )


@router.get("/stats")
def get_itr_stats(
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW)),
):
    repo = ITRRepository(db)
    return repo.get_stats()


@router.post("/batch-update")
def batch_update_itrs(
    payload: dict,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE)),
):
    ids = payload.get("ids")
    status = payload.get("status")
    if not ids or not isinstance(ids, list):
        raise HTTPException(status_code=400, detail="ids must be a non-empty list of strings")
    if not status or not isinstance(status, str):
        raise HTTPException(status_code=400, detail="status must be a non-empty string")

    updated = []
    failed = []
    for itr_id in ids:
        try:
            itr_update = schemas.ITRUpdate(status=status)
            db_itr = itr_service.update_itr(
                itr_id=itr_id,
                itr_update=itr_update,
                user_id=current_user.id,
                username=current_user.username,
            )
            if db_itr is None:
                failed.append({"id": itr_id, "error": "ITR not found"})
            else:
                updated.append(itr_id)
        except ValueError as e:
            failed.append({"id": itr_id, "error": str(e)})
    return {"updated": updated, "failed": failed}


@router.get("/{itr_id}", response_model=schemas.ITR)
def read_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW))
):
    db_itr = itr_service.get_itr(itr_id=itr_id)
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.ITR)
def create_itr(
    itr: schemas.ITRCreate,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_CREATE))
):
    return itr_service.create_itr(
        itr_create=itr, user_id=current_user.id, username=current_user.username
    )

@router.put("/{itr_id}", response_model=schemas.ITR)
def update_itr(
    itr_id: str,
    itr: schemas.ITRUpdate,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    try:
        db_itr = itr_service.update_itr(
            itr_id=itr_id, itr_update=itr,
            user_id=current_user.id, username=current_user.username
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr

@router.post("/{itr_id}/create-ncr")
def create_ncr_from_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(NCR_CREATE)),
):
    """Auto-create an NCR from a failed ITR."""
    try:
        ncr = itr_service.create_ncr_from_itr(
            itr_id=itr_id,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return ncr


@router.post("/{itr_id}/re-inspect")
def create_reinspection(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_CREATE)),
):
    """Create a re-inspection ITR from an existing ITR."""
    try:
        new_itr = itr_service.create_reinspection(
            itr_id=itr_id,
            user_id=current_user.id,
            username=current_user.username,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return new_itr


@router.delete("/{itr_id}")
def delete_itr(
    itr_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_DELETE))
):
    deleted = itr_service.delete_itr(
        itr_id=itr_id, user_id=current_user.id, username=current_user.username
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="ITR not found")
    return {"ok": True}

@router.get("/{itr_id}/related", response_model=schemas.RelatedEntitiesResponse)
def read_itr_related(
    itr_id: str,
    max_depth: int = 2,
    related_service: RelatedService = Depends(get_related_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_VIEW)),
):
    """Return upstream/downstream related documents for this ITR."""
    return related_service.get_related("itr", itr_id, max_depth=max_depth)

# New endpoint: Link Checklist to ITR
@router.post("/{itr_id}/link-checklist", response_model=schemas.ITR)
def link_checklist_to_itr(
    itr_id: str,
    checklist_id: str,
    itr_service: ITRService = Depends(get_itr_service),
    current_user: schemas.User = Depends(RoleChecker(ITR_UPDATE))
):
    """Link a Checklist to an ITR"""
    db_itr = itr_service.link_checklist(
        itr_id=itr_id,
        checklist_id=checklist_id,
        user_id=current_user.id,
        username=current_user.username
    )
    if db_itr is None:
        raise HTTPException(status_code=404, detail="ITR not found")
    return db_itr
