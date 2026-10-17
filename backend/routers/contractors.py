
from fastapi import APIRouter, Depends, HTTPException
from core.refusals import refusal_http

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

# ── Personnel (CONTRACTOR-PERSONNEL-2026-001): a company's people, not system accounts. No delete: deactivate instead. ──

@router.get("/personnel/options", response_model=list[schemas.ContractorPersonnelOption])
def read_personnel_options(
    contractor_id: str | None = None,
    service: ContractorService = Depends(get_contractor_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(get_current_user)
):
    """Active people for the meeting attendee picker (any signed-in user; name and position only). A contractor-scoped
    caller gets its own company's people only."""
    return service.personnel_options(contractor_id=contractor_id, scope=scope)

@router.put("/personnel/{personnel_id}", response_model=schemas.ContractorPersonnel)
def update_personnel(
    personnel_id: str,
    data: schemas.ContractorPersonnelUpdate,
    service: ContractorService = Depends(get_contractor_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    try:
        person = service.update_personnel(personnel_id, data, user_id=current_user.id, username=current_user.username, scope=scope)
    except ValueError as e:
        raise refusal_http(e)
    if person is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return person

@router.get("/{contractor_id}/personnel", response_model=list[schemas.ContractorPersonnel])
def read_personnel(
    contractor_id: str,
    include_inactive: bool = False,
    service: ContractorService = Depends(get_contractor_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_VIEW))
):
    people = service.list_personnel(contractor_id, include_inactive=include_inactive, scope=scope)
    if people is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return people

@router.post("/{contractor_id}/personnel", response_model=schemas.ContractorPersonnel)
def create_personnel(
    contractor_id: str,
    data: schemas.ContractorPersonnelCreate,
    service: ContractorService = Depends(get_contractor_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    try:
        person = service.create_personnel(contractor_id, data, user_id=current_user.id, username=current_user.username, scope=scope)
    except ValueError as e:
        raise refusal_http(e)
    if person is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return person

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
    try:
        return service.create_contractor(contractor, user_id=current_user.id, username=current_user.username)
    except ValueError as e:     # DUPLICATE_NAME (a duplicate company name used to be a 500), any other refusal: 400 (REFUSAL-DIALOG-2026-003)
        raise refusal_http(e)

@router.put("/{contractor_id}", response_model=schemas.Contractor)
def update_contractor(
    contractor_id: str,
    contractor: schemas.ContractorUpdate,
    service: ContractorService = Depends(get_contractor_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE))
):
    try:
        db_c = service.update_contractor(contractor_id, contractor, user_id=current_user.id, username=current_user.username)
    except ValueError as e:     # DUPLICATE_NAME (a duplicate company name used to be a 500), any other refusal: 400 (REFUSAL-DIALOG-2026-003)
        raise refusal_http(e)
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
        raise refusal_http(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return {"ok": True}

