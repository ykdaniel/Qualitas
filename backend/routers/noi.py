
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from core.refusals import refusal_http
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

import schemas
from core.dependencies import AnyPermissionChecker, RoleChecker, get_contractor_service, get_noi_service, get_related_service
from core.perms import NOI_CREATE, NOI_DELETE, NOI_UPDATE, NOI_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from core.strict_dates import DateValidationError
from database import get_db
from services.contractor_service import ContractorService
from services.noi_service import NOIService
from services.related_service import RelatedService

router = APIRouter(
    prefix="/noi",
    tags=["NOI"],
    responses={404: {"description": "Not found"}},
)

@router.get("/contractor-contact/{contractor_id}", response_model=schemas.ContractorContact)
def read_noi_contractor_contact(
    contractor_id: str,
    service: ContractorService = Depends(get_contractor_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(AnyPermissionChecker(NOI_CREATE, NOI_UPDATE))
):
    """One contractor's contact person / phone / email for the NOI form's auto-fill — only for users who can create or
    edit NOIs (the full contractor list needs contractors:view:all). CONTRACTOR-OPTIONS-2026-001."""
    contractor = service.get_contractor_contact(contractor_id, scope=scope)
    if contractor is None:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return contractor

@router.get("/next-reference", response_model=dict)
def read_noi_next_reference(
    project_id: Optional[str] = None,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    """The reference number a new NOI in the current project is expected to get — shown in the create form as
    "expected"; nothing is reserved, the number is fixed on save. Numbering is per project (REF-PROJECT-SEQ-2026-001
    B3), so the number is shown in full to everyone who may create an NOI there; a system administrator passes the
    chosen project (400 PROJECT_REQUIRED_FOR_CREATE in "All projects") — see NOIService.preview_reference_no."""
    try:
        return noi_service.preview_reference_no(project_id, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

# 讀取操作 - 無需認證
@router.get("/", response_model=list[schemas.NOI])
def read_nois(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    project_id: str = None,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    return noi_service.get_nois(
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date,
        project_id=project_id,
        scope=scope,
    )

@router.get("/{noi_id}/", response_model=schemas.NOI)
def read_noi(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    db_noi = noi_service.get_noi(noi_id=noi_id, scope=scope)
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

@router.get("/{noi_id}/export-docx", response_class=StreamingResponse)
def export_noi_docx(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW))
):
    """Formal .docx export of the Notice of Inspection (NOI-EXPORT-DOCX-2026-001)."""
    try:
        return noi_service.export_docx(noi_id=noi_id, scope=scope)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# 寫入操作 - 需要認證
@router.post("/", response_model=schemas.NOI)
def create_noi(
    noi: schemas.NOICreate,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    try:
        return noi_service.create_noi(
            noi_create=noi, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except DateValidationError as e:
        raise HTTPException(status_code=422, detail=e.http_detail())
    except ValueError as e:
        # e.g. the ITP is unknown or not one the caller can see: a business refusal (400), never a 500 (B2 R1)
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bulk/", response_model=list[schemas.NOI])
def create_nois_bulk(
    nois: list[schemas.NOICreate],
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_CREATE))
):
    """批次建立多筆 NOI，每筆都會自動產生 Reference No"""
    created = []
    try:
        for noi in nois:
            created.append(noi_service.create_noi(
                noi_create=noi, user_id=current_user.id, username=current_user.username,
                scope=scope,
            ))
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except DateValidationError as e:
        raise HTTPException(status_code=422, detail=e.http_detail())
    except ValueError as e:
        # e.g. the ITP is unknown or not one the caller can see: a business refusal (400), never a 500 (B2 R1)
        raise HTTPException(status_code=400, detail=str(e))
    return created

@router.put("/{noi_id}/", response_model=schemas.NOI)
def update_noi(
    noi_id: str,
    noi: schemas.NOIUpdate,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_UPDATE))
):
    try:
        db_noi = noi_service.update_noi(
            noi_id=noi_id, noi_update=noi, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except DateValidationError as e:
        raise HTTPException(status_code=422, detail=e.http_detail())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if db_noi is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return db_noi

@router.delete("/{noi_id}/", response_model=dict)
def delete_noi(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_DELETE))
):
    try:
        deleted = noi_service.delete_noi(
            noi_id=noi_id, user_id=current_user.id, username=current_user.username,
            scope=scope,
        )
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        # a business refusal (e.g. the NOI is still referenced by ITR / NCR records) is a 400, never a 500
        raise refusal_http(e)
    if not deleted:
        raise HTTPException(status_code=404, detail="NOI not found")
    return {"ok": True}

@router.get("/{noi_id}/delete-check", response_model=dict)
def read_noi_delete_check(
    noi_id: str,
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_DELETE))
):
    """For the delete prompt: the documents that still cite this NOI (a delete is refused while there are any)."""
    result = noi_service.delete_check(noi_id, scope=scope)
    if result is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return result

@router.get("/{noi_id}/related", response_model=schemas.RelatedEntitiesResponse)
def read_noi_related(
    noi_id: str,
    max_depth: int = 2,
    related_service: RelatedService = Depends(get_related_service),
    noi_service: NOIService = Depends(get_noi_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(NOI_VIEW)),
):
    """Return upstream/downstream related documents for this NOI."""
    # Only expose the relation graph for an NOI the caller may actually see.
    if noi_service.get_noi(noi_id=noi_id, scope=scope) is None:
        raise HTTPException(status_code=404, detail="NOI not found")
    return related_service.get_related("noi", noi_id, max_depth=max_depth, scope=scope)
