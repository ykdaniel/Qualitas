"""Approved-material register API (MATERIAL-SUBMITTAL M6, DECISIONS 材料：只作為核准材料登錄簿).

Only the register remains: list approved materials, read one record (with its result history), register, edit — plus (R2) a
duplicate check over all records of a project and the dashboard figures. The former
submittal workflow routes (create draft, edit draft, submit, record result, correct result, new revision, list submittals) were
REMOVED at the user's decision (2026-10-09); their code is kept only in the M6 backup, not in the application. No DELETE route.

Every route: permission (RoleChecker) → vendor-scoped accounts refused (403) → service.
404 = not visible / not belonging; 409 = state conflict; 400 = business rule; 422 = malformed input.
"""
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker
from core.material_access import refuse_vendor_scope
from core.perms import MATERIAL_MANAGE, MATERIAL_VIEW
from core.scope import Scope
from database import get_db
from services.material_submittal_service import BadRequest, Conflict, MaterialSubmittalService, NotVisible

router = APIRouter(prefix="/material-submittals", tags=["material-submittals"], responses={404: {"description": "Not found"}})


def _call(fn, *args):
    try:
        return fn(*args)
    except NotVisible:
        raise HTTPException(status_code=404, detail="Not found")
    except Conflict as e:
        raise HTTPException(status_code=409, detail=str(e) or "Conflict")
    except BadRequest as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── approved-material register (M6, DECISIONS 材料：只作為核准材料登錄簿) ──────────────────────────────────────
@router.post("/register", response_model=schemas.MaterialApprovedItem)
def register_material(body: schemas.MaterialRegisterCreate, current_user: schemas.User = Depends(RoleChecker(MATERIAL_MANAGE)),
                      scope: Scope = Depends(refuse_vendor_scope), db: Session = Depends(get_db)):
    return _call(MaterialSubmittalService(db).register, body, scope, current_user)


@router.put("/{submittal_id}/register", response_model=schemas.MaterialApprovedItem)
def update_registered_material(submittal_id: str, body: schemas.MaterialRegisterUpdate,
                               current_user: schemas.User = Depends(RoleChecker(MATERIAL_MANAGE)),
                               scope: Scope = Depends(refuse_vendor_scope), db: Session = Depends(get_db)):
    return _call(MaterialSubmittalService(db).update_register, submittal_id, body, scope, current_user)


# Declared BEFORE "/{submittal_id}" (like /duplicates and /stats) so these names are never taken for a submittal id.
@router.get("/approved", response_model=schemas.MaterialApprovedPage)
def list_approved_materials(
    project_id: str = Query(..., alias="projectId", min_length=1),
    category: str | None = None,
    vendor_id: str | None = Query(None, alias="vendorId"),
    result: Literal["Approved", "ApprovedWithComments"] | None = None,
    registered_from: date | None = Query(None, alias="registeredFrom"),
    q: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: schemas.User = Depends(RoleChecker(MATERIAL_VIEW)),
    scope: Scope = Depends(refuse_vendor_scope),
    db: Session = Depends(get_db),
):
    svc = MaterialSubmittalService(db)
    return _call(lambda: svc.approved(project_id, scope, q=q, category=category, vendor_id=vendor_id, result=result,
                                      registered_from=registered_from, limit=limit, offset=offset))


# M6 R2: duplicate check over ALL records of the project (the form warns; the user may still register).
@router.get("/duplicates", response_model=schemas.MaterialDuplicates)
def find_duplicate_materials(
    project_id: str = Query(..., alias="projectId", min_length=1),
    name: str = Query(..., min_length=1),
    brand: str | None = None,
    model: str | None = None,
    exclude_id: str | None = Query(None, alias="excludeId"),
    client_request_id: str | None = Query(None, alias="clientRequestId"),
    current_user: schemas.User = Depends(RoleChecker(MATERIAL_VIEW)),
    scope: Scope = Depends(refuse_vendor_scope),
    db: Session = Depends(get_db),
):
    svc = MaterialSubmittalService(db)
    return _call(lambda: svc.duplicates(project_id, scope, name, brand, model, exclude_id, client_request_id))


# M6 R2: dashboard tile — one project, or every project the caller can see when projectId is omitted.
@router.get("/stats", response_model=schemas.MaterialStats)
def material_stats(
    project_id: str | None = Query(None, alias="projectId"),
    vendor_id: str | None = Query(None, alias="vendorId"),
    registered_from: date | None = Query(None, alias="registeredFrom"),
    current_user: schemas.User = Depends(RoleChecker(MATERIAL_VIEW)),
    scope: Scope = Depends(refuse_vendor_scope),
    db: Session = Depends(get_db),
):
    svc = MaterialSubmittalService(db)
    return _call(lambda: svc.stats(scope, project_id=project_id, vendor_id=vendor_id, registered_from=registered_from))


@router.get("/{submittal_id}", response_model=schemas.MaterialSubmittalDetail)
def get_submittal(submittal_id: str, current_user: schemas.User = Depends(RoleChecker(MATERIAL_VIEW)),
                  scope: Scope = Depends(refuse_vendor_scope), db: Session = Depends(get_db)):
    return _call(MaterialSubmittalService(db).detail, submittal_id, scope)
