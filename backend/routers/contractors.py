
from fastapi import APIRouter, Depends, HTTPException

import schemas
from core.dependencies import RoleChecker, get_contractor_service
from core.perms import CONTRACTOR_MANAGE, CONTRACTOR_VIEW
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
    deleted = service.delete_contractor(contractor_id, user_id=current_user.id, username=current_user.username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {"ok": True}

