from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user
from core.dependencies import RoleChecker
from core.perms import OBS_VIEW, OBS_CREATE, OBS_UPDATE, OBS_DELETE

router = APIRouter(
    prefix="/obs",
    tags=["obs"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 OBS_VIEW
@router.get("/", response_model=List[schemas.OBS])
def read_obss(
    skip: int = 0, 
    limit: int = 500, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,

    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(OBS_VIEW))
):
    return crud.get_obss(
        db, 
        skip=skip, 
        limit=limit, 
        search=search, 
        status=status, 
        start_date=start_date, 
        end_date=end_date
    )

@router.get("/{obs_id}", response_model=schemas.OBS)
def read_obs(obs_id: str, db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(OBS_VIEW))):
    db_obs = crud.get_obs(db, obs_id=obs_id)
    if db_obs is None:
        raise HTTPException(status_code=404, detail="OBS not found")
    return db_obs

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.OBS)
def create_obs(
    obs: schemas.OBSCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(OBS_CREATE))
):
    return crud.create_obs(db=db, obs=obs, user_id=current_user.id, username=current_user.username)

@router.put("/{obs_id}", response_model=schemas.OBS)
def update_obs(
    obs_id: str, 
    obs: schemas.OBSUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(OBS_UPDATE))
):
    try:
        db_obs = crud.update_obs(db, obs_id=obs_id, obs=obs, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_obs is None:
        raise HTTPException(status_code=404, detail="OBS not found")
    return db_obs

@router.delete("/{obs_id}")
def delete_obs(
    obs_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(OBS_DELETE))
):
    if crud.delete_obs(db, obs_id=obs_id, user_id=current_user.id, username=current_user.username) is None:
        raise HTTPException(status_code=404, detail="OBS not found")
    return {"ok": True}
