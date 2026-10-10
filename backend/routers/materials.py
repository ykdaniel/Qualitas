"""Material data API (MATERIAL-SUBMITTAL M1). READ ONLY since 2026-10-09: list and get. There is no DELETE route.

Create / update (POST /, PUT /{id}) were removed at the user's decision (DECISIONS 材料主檔 API 只留查詢, option A): the
interface no longer used them, and a material written here bypassed the approved-material register (no approval data,
register snapshot not updated). Material rows are written only by the register (POST / PUT /material-submittals/...register).

Every route: permission (RoleChecker) → vendor-scoped accounts refused (403, spec §9.2) → service.
Not visible / not existing project or material → 404. JSON is camelCase (schemas.Material*).
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker
from core.perms import MATERIAL_VIEW
from core.material_access import refuse_vendor_scope
from core.scope import Scope
from database import get_db
from services.material_service import MaterialService, NotVisible

router = APIRouter(prefix="/materials", tags=["materials"], responses={404: {"description": "Not found"}})


def _not_found():
    return HTTPException(status_code=404, detail="Not found")


@router.get("/", response_model=schemas.MaterialPage)
def list_materials(
    project_id: str = Query(..., alias="projectId", min_length=1),
    q: str | None = None,
    category: str | None = None,
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: schemas.User = Depends(RoleChecker(MATERIAL_VIEW)),
    scope: Scope = Depends(refuse_vendor_scope),
    db: Session = Depends(get_db),
):
    try:
        return MaterialService(db).list(project_id, scope, q=q, category=category, limit=limit, offset=offset)
    except NotVisible:
        raise _not_found()


@router.get("/{material_id}", response_model=schemas.Material)
def get_material(
    material_id: str,
    current_user: schemas.User = Depends(RoleChecker(MATERIAL_VIEW)),
    scope: Scope = Depends(refuse_vendor_scope),
    db: Session = Depends(get_db),
):
    try:
        return MaterialService(db).get(material_id, scope)
    except NotVisible:
        raise _not_found()
