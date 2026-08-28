

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_followup_service
from core.perms import FOLLOWUP_CREATE, FOLLOWUP_DELETE, FOLLOWUP_UPDATE, FOLLOWUP_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from services.followup_service import FollowUpService

router = APIRouter(
    prefix="/followup",
    tags=["followup"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 FOLLOWUP_VIEW
@router.get("/", response_model=list[schemas.FollowUp])
def read_followups(
    skip: int = 0,
    limit: int = 500,
    sourceModule: str = None,
    sourceReferenceNo: str = None,
    followup_service: FollowUpService = Depends(get_followup_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_VIEW))
):
    return followup_service.get_followups(
        skip=skip, limit=limit, scope=scope,
        sourceModule=sourceModule, sourceReferenceNo=sourceReferenceNo,
    )

@router.get("/{followup_id}", response_model=schemas.FollowUp)
def read_followup(
    followup_id: str,
    followup_service: FollowUpService = Depends(get_followup_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_VIEW))
):
    db_f = followup_service.get_followup(followup_id=followup_id, scope=scope)
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.FollowUp)
def create_followup(
    followup: schemas.FollowUpCreate,
    followup_service: FollowUpService = Depends(get_followup_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_CREATE))
):
    try:
        return followup_service.create_followup(followup_create=followup, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bulk/", response_model=list[schemas.FollowUp])
def create_followups_bulk(
    followups: list[schemas.FollowUpCreate],
    followup_service: FollowUpService = Depends(get_followup_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_CREATE))
):
    """批次建立多筆 FollowUp（例如一場會議一次產生多個行動項目）"""
    created = []
    try:
        for followup in followups:
            created.append(followup_service.create_followup(
                followup_create=followup, user_id=current_user.id,
                username=current_user.username, scope=scope,
            ))
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return created

@router.put("/{followup_id}", response_model=schemas.FollowUp)
def update_followup(
    followup_id: str,
    followup: schemas.FollowUpUpdate,
    followup_service: FollowUpService = Depends(get_followup_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_UPDATE))
):
    try:
        db_f = followup_service.update_followup(followup_id=followup_id, followup_update=followup, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_f is None:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return db_f

@router.delete("/{followup_id}")
def delete_followup(
    followup_id: str,
    followup_service: FollowUpService = Depends(get_followup_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FOLLOWUP_DELETE))
):
    deleted = followup_service.delete_followup(followup_id=followup_id, user_id=current_user.id, username=current_user.username, scope=scope)
    if not deleted:
        raise HTTPException(status_code=404, detail="FollowUp not found")
    return {"ok": True}
