
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_pqp_service
from core.perms import PQP_CREATE, PQP_DELETE, PQP_UPDATE, PQP_VIEW
from database import get_db
from services.pqp_service import PQPService

router = APIRouter(
    prefix="/pqp",
    tags=["pqp"],
    responses={404: {"description": "Not found"}},
)

# 讀取操作 - 需要認證 VIEW
@router.get("/", response_model=list[schemas.PQP])
def read_pqps(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    pqp_service: PQPService = Depends(get_pqp_service),
    current_user: schemas.User = Depends(RoleChecker(PQP_VIEW))
):
    return pqp_service.get_pqps(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date
    )

@router.get("/{pqp_id}", response_model=schemas.PQP)
def read_pqp(
    pqp_id: str,
    pqp_service: PQPService = Depends(get_pqp_service),
    current_user: schemas.User = Depends(RoleChecker(PQP_VIEW))
):
    db_pqp = pqp_service.get_pqp(pqp_id=pqp_id)
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp

# 寫入操作 - 需要認證 CREATE/UPDATE/DELETE
@router.post("/", response_model=schemas.PQP)
def create_pqp(
    pqp: schemas.PQPCreate,
    pqp_service: PQPService = Depends(get_pqp_service),
    current_user: schemas.User = Depends(RoleChecker(PQP_CREATE))
):
    return pqp_service.create_pqp(pqp_create=pqp, user_id=current_user.id, username=current_user.username)

@router.put("/{pqp_id}", response_model=schemas.PQP)
def update_pqp(
    pqp_id: str,
    pqp: schemas.PQPUpdate,
    pqp_service: PQPService = Depends(get_pqp_service),
    current_user: schemas.User = Depends(RoleChecker(PQP_UPDATE))
):
    try:
        db_pqp = pqp_service.update_pqp(pqp_id=pqp_id, pqp_update=pqp, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_pqp is None:
        raise HTTPException(status_code=404, detail="PQP not found")
    return db_pqp

@router.delete("/{pqp_id}")
def delete_pqp(
    pqp_id: str,
    pqp_service: PQPService = Depends(get_pqp_service),
    current_user: schemas.User = Depends(RoleChecker(PQP_DELETE))
):
    deleted = pqp_service.delete_pqp(pqp_id=pqp_id, user_id=current_user.id, username=current_user.username)
    if not deleted:
        raise HTTPException(status_code=404, detail="PQP not found")
    return {"ok": True}
