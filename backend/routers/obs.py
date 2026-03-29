
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_obs_service
from core.perms import OBS_CREATE, OBS_DELETE, OBS_UPDATE, OBS_VIEW
from database import get_db
from services.obs_service import OBSService

router = APIRouter(
    prefix="/obs",
    tags=["obs"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 OBS_VIEW
@router.get("/", response_model=list[schemas.OBS])
def read_obss(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    obs_service: OBSService = Depends(get_obs_service),
    current_user: schemas.User = Depends(RoleChecker(OBS_VIEW))
):
    return obs_service.get_obss(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{obs_id}", response_model=schemas.OBS)
def read_obs(
    obs_id: str,
    obs_service: OBSService = Depends(get_obs_service),
    current_user: schemas.User = Depends(RoleChecker(OBS_VIEW))
):
    db_obs = obs_service.get_obs(obs_id=obs_id)
    if db_obs is None:
        raise HTTPException(status_code=404, detail="OBS not found")
    return db_obs

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.OBS)
def create_obs(
    obs: schemas.OBSCreate,
    obs_service: OBSService = Depends(get_obs_service),
    current_user: schemas.User = Depends(RoleChecker(OBS_CREATE))
):
    return obs_service.create_obs(obs_create=obs, user_id=current_user.id, username=current_user.username)

@router.put("/{obs_id}", response_model=schemas.OBS)
def update_obs(
    obs_id: str,
    obs: schemas.OBSUpdate,
    obs_service: OBSService = Depends(get_obs_service),
    current_user: schemas.User = Depends(RoleChecker(OBS_UPDATE))
):
    try:
        db_obs = obs_service.update_obs(obs_id=obs_id, obs_update=obs, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_obs is None:
        raise HTTPException(status_code=404, detail="OBS not found")
    return db_obs

@router.delete("/{obs_id}")
def delete_obs(
    obs_id: str,
    obs_service: OBSService = Depends(get_obs_service),
    current_user: schemas.User = Depends(RoleChecker(OBS_DELETE))
):
    deleted = obs_service.delete_obs(obs_id=obs_id, user_id=current_user.id, username=current_user.username)
    if not deleted:
        raise HTTPException(status_code=404, detail="OBS not found")
    return {"ok": True}
