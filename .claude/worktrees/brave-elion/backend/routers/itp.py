
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import logging
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user, PermissionChecker, Permission
from core.cache import cache_response, invalidate_cache

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/itp",
    tags=["itp"],
    responses={404: {"description": "Not found"}},
)

# NOTE: 寫入操作需要認證，讀取操作暫時開放
@router.post("/", response_model=schemas.ITP)
def create_itp(
    itp: schemas.ITPCreate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    """
    Create new ITP.
    Invalidates ITP cache to ensure fresh data on next request.
    """
    try:
        result = crud.create_itp(db=db, itp=itp, user_id=current_user.id, username=current_user.username)
        # Invalidate cache after creating new ITP
        invalidate_cache("itp:")
        return result
    except Exception as e:
        # Log detailed error internally - never expose to client
        logger.error(f"Error creating ITP: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to create ITP")

@router.get("/", response_model=List[schemas.ITP])
@cache_response(ttl=60, key_prefix="itp")  # Cache for 1 minute
def read_itps(
    skip: int = 0,
    limit: int = 100,
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db)
):
    """
    Get all ITPs with optional filters.
    Cached for 60 seconds to reduce database load.
    """
    itps = crud.get_itps(
        db,
        skip=skip,
        limit=limit,
        search=search,
        status=status,
        start_date=start_date,
        end_date=end_date
    )
    return itps

@router.get("/{itp_id}", response_model=schemas.ITP)
def read_itp(itp_id: str, db: Session = Depends(get_db)):
    db_itp = crud.get_itp(db, itp_id=itp_id)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.put("/{itp_id}", response_model=schemas.ITP)
def update_itp(
    itp_id: str,
    itp: schemas.ITPUpdate,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_itp = crud.update_itp(db, itp_id=itp_id, itp=itp, user_id=current_user.id, username=current_user.username)
    except ValueError as e:
        # ValueError is from our validation - safe to expose
        logger.info(f"Validation error updating ITP {itp_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected error - log internally and return generic message
        logger.error(f"Error updating ITP {itp_id}: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update ITP")

    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.delete("/{itp_id}")
def delete_itp(
    itp_id: str,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_itp = crud.delete_itp(db, itp_id=itp_id, user_id=current_user.id, username=current_user.username)
        if db_itp is None:
            raise HTTPException(status_code=404, detail="ITP not found")
        return {"ok": True}
    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Log unexpected errors internally
        logger.error(f"Error deleting ITP {itp_id}: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete ITP")

@router.put("/{itp_id}/detail", response_model=schemas.ITP)
def update_itp_detail(
    itp_id: str,
    body: schemas.ITPDetailBody,
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    try:
        db_itp = crud.update_itp_detail(db, itp_id=itp_id, detail_body=body.dict(), user_id=current_user.id, username=current_user.username)
        if db_itp is None:
            raise HTTPException(status_code=404, detail="ITP not found")
        return db_itp
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ITP detail {itp_id}: {type(e).__name__}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update ITP detail")
