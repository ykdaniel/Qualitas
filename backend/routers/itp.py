import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_itp_service, get_related_service
from core.perms import ITP_CREATE, ITP_DELETE, ITP_UPDATE, ITP_VIEW
from core.scope import Scope, ScopeForbidden, get_scope
from database import get_db
# Cookie-aware auth (accepts httpOnly access_token cookie OR legacy Bearer).
from core.security import get_current_user
from services.itp_service import ITPService
from services.related_service import RelatedService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/itp",
    tags=["ITP"],
    responses={404: {"description": "Not found"}},
)

# NOTE: 寫入操作需要認證，讀取操作暫時開放
@router.post("/", response_model=schemas.ITP)
def create_itp(
    itp: schemas.ITPCreate,
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_CREATE))
):
    try:
        return itp_service.create_itp(itp_create=itp, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.get("/")
def read_itps(
    skip: int = 0,
    limit: int = 500,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_VIEW))
):
    try:
        itps = itp_service.get_itps(
            skip=skip,
            limit=limit,
            search=search,
            status=status,
            start_date=start_date,
            end_date=end_date,
            scope=scope,
        )

        # Manually validate and serialize to catch errors
        validated_itps = []
        for _i, itp_obj in enumerate(itps):
            try:
                # Convert to Pydantic model
                model = schemas.ITP.model_validate(itp_obj)
                # Convert to dict/json-compatible
                validated_itps.append(jsonable_encoder(model))
            except Exception as e:
                import traceback
                error_msg = f"Serialization Error on ITP ID: {itp_obj.id}, Ref: {itp_obj.referenceNo}\nError: {e}\n"
                logger.error(error_msg)
                logger.error(traceback.format_exc())
                continue

        return JSONResponse(content=validated_itps)
    except Exception as e:
        import traceback
        logger.error(f"Error in read_itps: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{itp_id}/", response_model=schemas.ITP)
def read_itp(
    itp_id: str,
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_VIEW))
):
    db_itp = itp_service.get_itp(itp_id=itp_id, scope=scope)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.put("/{itp_id}/", response_model=schemas.ITP)
def update_itp(
    itp_id: str,
    itp: schemas.ITPUpdate,
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_UPDATE))
):
    logger.debug(f"update_itp called for ID {itp_id} by user {current_user.username}")
    try:
        db_itp = itp_service.update_itp(itp_id=itp_id, itp_update=itp, user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        logger.error(f"Error updating ITP {itp_id}: {str(e)}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.delete("/{itp_id}/", response_model=dict)
def delete_itp(
    itp_id: str,
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_DELETE))
):
    success = itp_service.delete_itp(itp_id=itp_id, user_id=current_user.id, username=current_user.username, scope=scope)
    if not success:
        raise HTTPException(status_code=404, detail="ITP not found")
    return {"ok": True}

@router.put("/{itp_id}/detail", response_model=schemas.ITP)
def update_itp_detail(
    itp_id: str,
    body: schemas.ITPDetailBody,
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_UPDATE))
):
    try:
        db_itp = itp_service.update_itp_detail(itp_id=itp_id, detail_body=body.dict(), user_id=current_user.id, username=current_user.username, scope=scope)
    except ScopeForbidden as e:
        raise HTTPException(status_code=403, detail=str(e))
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.get("/{itp_id}/related", response_model=schemas.RelatedEntitiesResponse)
def read_itp_related(
    itp_id: str,
    max_depth: int = 2,
    related_service: RelatedService = Depends(get_related_service),
    itp_service: ITPService = Depends(get_itp_service),
    scope: Scope = Depends(get_scope),
    current_user: schemas.User = Depends(RoleChecker(ITP_VIEW)),
):
    """Return upstream/downstream related documents for this ITP."""
    # Only expose the relation graph for an ITP the caller may actually see.
    if itp_service.get_itp(itp_id=itp_id, scope=scope) is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return related_service.get_related("itp", itp_id, max_depth=max_depth)
