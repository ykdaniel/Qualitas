
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_osd_service
from core.perms import OSD_CREATE, OSD_DELETE, OSD_UPDATE, OSD_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
from services.osd_service import OSDService

router = APIRouter(
    prefix="/osd",
    tags=["osd"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要 OSD_VIEW
@router.get("/", response_model=list[schemas.OSD])
def read_osds(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    osd_service: OSDService = Depends(get_osd_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(OSD_VIEW))
):
    return osd_service.get_osds(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        scope=scope,
    )

@router.get("/{osd_id}", response_model=schemas.OSD)
def read_osd(
    osd_id: str,
    osd_service: OSDService = Depends(get_osd_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(OSD_VIEW))
):
    db_osd = osd_service.get_osd(osd_id=osd_id, scope=scope)
    if db_osd is None:
        raise HTTPException(status_code=404, detail="OSD not found")
    return db_osd

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.OSD)
def create_osd(
    osd: schemas.OSDCreate,
    osd_service: OSDService = Depends(get_osd_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(OSD_CREATE))
):
    try:
        return osd_service.create_osd(osd_create=osd, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.put("/{osd_id}", response_model=schemas.OSD)
def update_osd(
    osd_id: str,
    osd: schemas.OSDUpdate,
    osd_service: OSDService = Depends(get_osd_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(OSD_UPDATE))
):
    try:
        db_osd = osd_service.update_osd(osd_id=osd_id, osd_update=osd, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_osd is None:
        raise HTTPException(status_code=404, detail="OSD not found")
    return db_osd

@router.delete("/{osd_id}")
def delete_osd(
    osd_id: str,
    osd_service: OSDService = Depends(get_osd_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(OSD_DELETE))
):
    deleted = osd_service.delete_osd(osd_id=osd_id, user_id=current_user.id, username=current_user.username, scope=scope)
    if not deleted:
        raise HTTPException(status_code=404, detail="OSD not found")
    return {"ok": True}
