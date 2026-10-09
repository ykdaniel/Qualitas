
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_meeting_minutes_service
from core.perms import MEETING_CREATE, MEETING_DELETE, MEETING_UPDATE, MEETING_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from services.meeting_minutes_service import MeetingMinutesService

router = APIRouter(
    prefix="/meeting-minutes",
    tags=["meeting-minutes"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 MEETING_VIEW
@router.get("/", response_model=list[schemas.MeetingMinutes])
def read_meeting_minutes_list(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    project_id: str = None,
    meeting_service: MeetingMinutesService = Depends(get_meeting_minutes_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(MEETING_VIEW))
):
    return meeting_service.get_meeting_minutes_list(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        project_id=project_id,
        scope=scope,
    )

@router.get("/{meeting_id}", response_model=schemas.MeetingMinutes)
def read_meeting_minutes(
    meeting_id: str,
    meeting_service: MeetingMinutesService = Depends(get_meeting_minutes_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(MEETING_VIEW))
):
    db_meeting = meeting_service.get_meeting_minutes(meeting_id=meeting_id, scope=scope)
    if db_meeting is None:
        raise HTTPException(status_code=404, detail="Meeting Minutes not found")
    return db_meeting

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.MeetingMinutes)
def create_meeting_minutes(
    meeting: schemas.MeetingMinutesCreate,
    meeting_service: MeetingMinutesService = Depends(get_meeting_minutes_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(MEETING_CREATE))
):
    try:
        return meeting_service.create_meeting_minutes(meeting_create=meeting, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.post("/{meeting_id}/new-occurrence", response_model=schemas.MeetingMinutes)
def create_new_occurrence(
    meeting_id: str,
    meeting_service: MeetingMinutesService = Depends(get_meeting_minutes_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(MEETING_CREATE))
):
    """Create the next occurrence of a recurring meeting series — reuses
    the source row's documentNumber and increments rev; new row starts as
    Draft (BACKLOG #18)."""
    try:
        new_meeting = meeting_service.create_new_occurrence(
            meeting_id=meeting_id, user_id=current_user.id,
            username=current_user.username, scope=scope
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if new_meeting is None:
        raise HTTPException(status_code=404, detail="Meeting Minutes not found")
    return new_meeting

@router.put("/{meeting_id}", response_model=schemas.MeetingMinutes)
def update_meeting_minutes(
    meeting_id: str,
    meeting: schemas.MeetingMinutesUpdate,
    meeting_service: MeetingMinutesService = Depends(get_meeting_minutes_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(MEETING_UPDATE))
):
    try:
        db_meeting = meeting_service.update_meeting_minutes(meeting_id=meeting_id, meeting_update=meeting, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_meeting is None:
        raise HTTPException(status_code=404, detail="Meeting Minutes not found")
    return db_meeting

@router.delete("/{meeting_id}")
def delete_meeting_minutes(
    meeting_id: str,
    meeting_service: MeetingMinutesService = Depends(get_meeting_minutes_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(MEETING_DELETE))
):
    try:
        deleted = meeting_service.delete_meeting_minutes(meeting_id=meeting_id, user_id=current_user.id, username=current_user.username, scope=scope)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Meeting Minutes not found")
    return {"ok": True}
