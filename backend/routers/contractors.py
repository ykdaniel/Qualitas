
from fastapi import APIRouter, Depends, HTTPException

import schemas
from core.dependencies import RoleChecker, get_contractor_service
from core.perms import CONTRACTOR_MANAGE, CONTRACTOR_VIEW
from core.scope import Scope, get_scope
from core.security import get_current_user
from services.contractor_service import ContractorService

router = APIRouter(
    prefix="/contractors",
    tags=["contractors"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=list[schemas.Contractor])
def read_contractors(
    skip: int = 0,
    limit: int = 500,
    service: ContractorService = Depends(get_contractor_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_VIEW))
):
    return service.get_contractors(skip=skip, limit=limit)

@router.get("/options", response_model=list[schemas.ContractorOption])
def read_contractor_options(
    service: ContractorService = Depends(get_contractor_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(get_current_user)
):
    """Contractor names for every module's pickers (any signed-in user; no contact details). Declared before /{contractor_id}."""
    return service.get_contractor_options(scope=scope)

@router.get("/{contractor_id}", response_model=schemas.Contractor)
def read_contractor(
    contractor_id: str,
    service: ContractorService = Depends(get_contractor_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_VIEW))
):
    db_c = service.get_contractor(contractor_id)
    if db_c is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return db_c

@router.post("/", response_model=schemas.Contractor)
def create_contractor(
    contractor: schemas.ContractorCreate,
    service: ContractorService = Depends(get_contractor_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    return service.create_contractor(contractor, user_id=current_user.id, username=current_user.username)

@router.put("/{contractor_id}", response_model=schemas.Contractor)
def update_contractor(
    contractor_id: str,
    contractor: schemas.ContractorUpdate,
    service: ContractorService = Depends(get_contractor_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    db_c = service.update_contractor(contractor_id, contractor, user_id=current_user.id, username=current_user.username)
    if db_c is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return db_c

@router.delete("/{contractor_id}")
def delete_contractor(
    contractor_id: str,
    service: ContractorService = Depends(get_contractor_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    # ContractorService.delete_contractor's only ValueError source is the
    # reference check (validators.check_contractor_references) — every other
    # step in that method (repo.delete, log_audit, db.commit) raises its own
    # exception types on failure, so this does not mask an unrelated system
    # error as a clean business rejection.
    try:
        deleted = service.delete_contractor(contractor_id, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not deleted:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {"ok": True}

