from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_fat_service
from core.perms import FAT_CREATE, FAT_DELETE, FAT_UPDATE, FAT_VIEW
from core.refusals import refusal_http
from core.scope import Scope, ScopeForbidden, get_scope
from services.fat_service import FATService

router = APIRouter(
    prefix="/fat",
    tags=["fat"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=schemas.FAT)
def create_fat(
    fat: schemas.FATCreate,
    fat_service: FATService = Depends(get_fat_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FAT_CREATE))
):
    try:
        return fat_service.create_fat(
            fat_create=fat, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise refusal_http(e, 403)
    except ValueError as e:    # FAT_SUPPLIER_REQUIRED / FAT_SUPPLIER_NOT_FOUND, and any other service refusal: 400, never 500 (REFUSAL-DIALOG-2026-003)
        raise refusal_http(e, 400)

@router.get("/", response_model=list[schemas.FAT])
def read_fats(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    project_id: str = None,
    fat_service: FATService = Depends(get_fat_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FAT_VIEW))
):
    fats = fat_service.get_fats(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        project_id=project_id,
        scope=scope,
    )
    return fats

@router.get("/{fat_id}", response_model=schemas.FAT)
def read_fat(
    fat_id: str,
    fat_service: FATService = Depends(get_fat_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FAT_VIEW))
):
    db_fat = fat_service.get_fat(fat_id=fat_id, scope=scope)
    if db_fat is None:
        raise HTTPException(status_code=404, detail="FAT not found")
    return db_fat

@router.put("/{fat_id}", response_model=schemas.FAT)
def update_fat(
    fat_id: str,
    fat: schemas.FATUpdate,
    fat_service: FATService = Depends(get_fat_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FAT_UPDATE))
):
    try:
        db_fat = fat_service.update_fat(
            fat_id=fat_id, fat_update=fat,
            user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise refusal_http(e, 403)
    except ValueError as e:    # FAT_SUPPLIER_REQUIRED / FAT_SUPPLIER_NOT_FOUND, and any other service refusal: 400, never 500 (REFUSAL-DIALOG-2026-003)
        raise refusal_http(e, 400)
    if db_fat is None:
        raise HTTPException(status_code=404, detail="FAT not found")
    return db_fat

@router.delete("/{fat_id}")
def delete_fat(
    fat_id: str,
    fat_service: FATService = Depends(get_fat_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FAT_DELETE))
):
    try:
        deleted = fat_service.delete_fat(
            fat_id=fat_id, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ValueError as e:     # a service refusal is a 400, never a 500 (REFUSAL-DIALOG-2026-003)
        raise refusal_http(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="FAT not found")
    return {"ok": True}

@router.put("/{fat_id}/details", response_model=schemas.FAT)
def update_fat_detail(
    fat_id: str,
    details: list[schemas.FATDetailItem],
    row_version: int | None = Query(None),      # optimistic lock: the body is the list itself, so the version is a query parameter
    fat_service: FATService = Depends(get_fat_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(FAT_UPDATE))
):
    details_data = [item.dict() for item in details]
    try:
        db_fat = fat_service.update_fat_detail(
            fat_id=fat_id, details=details_data,
            user_id=current_user.id, username=current_user.username,
            scope=scope, expected_version=row_version,
        )
    except ScopeForbidden as e:
        raise refusal_http(e, 403)
    except ValueError as e:     # a service refusal is a 400, never a 500 (REFUSAL-DIALOG-2026-003)
        raise refusal_http(e)
    if db_fat is None:
        raise HTTPException(status_code=404, detail="FAT not found")
    return db_fat
