
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import List
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user, PermissionChecker, Permission

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
    return crud.create_itp(db=db, itp=itp, user_id=current_user.id, username=current_user.username)

@router.get("/")
def read_itps(
    skip: int = 0, 
    limit: int = 100, 
    search: str = None,
    status: str = None,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db)
):
    try:
        itps = crud.get_itps(
            db, 
            skip=skip, 
            limit=limit, 
            search=search, 
            status=status, 
            start_date=start_date, 
            end_date=end_date
        )
        
        # Manually validate and serialize to catch errors
        validated_itps = []
        for i, itp_obj in enumerate(itps):
            try:
                # Convert to Pydantic model
                model = schemas.ITP.model_validate(itp_obj)
                # Convert to dict/json-compatible
                validated_itps.append(jsonable_encoder(model))
            except Exception as e:
                import traceback
                error_msg = f"Serialization Error on ITP ID: {itp_obj.id}, Ref: {itp_obj.referenceNo}\nError: {e}\n"
                with open("backend_validation_error.log", "a") as f:
                    f.write(error_msg)
                    f.write(traceback.format_exc())
                    f.write("\n")
                # We can either skip the bad record or raise error. 
                # Let's skip it so the user can at least see the other records, 
                # but log it so we can fix it.
                print(error_msg) # Print to console too
                continue 

        return JSONResponse(content=validated_itps)
    except Exception as e:
        import traceback
        with open("backend_error.log", "a") as f:
            f.write(f"Error in read_itps: {str(e)}\n")
            f.write(traceback.format_exc())
            f.write("\n")
        raise HTTPException(status_code=500, detail=str(e))

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
        raise HTTPException(status_code=400, detail=str(e))
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp

@router.delete("/{itp_id}")
def delete_itp(
    itp_id: str, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    db_itp = crud.delete_itp(db, itp_id=itp_id, user_id=current_user.id, username=current_user.username)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return {"ok": True}

@router.put("/{itp_id}/detail", response_model=schemas.ITP)
def update_itp_detail(
    itp_id: str, 
    body: schemas.ITPDetailBody, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(get_current_user)
):
    db_itp = crud.update_itp_detail(db, itp_id=itp_id, detail_body=body.dict(), user_id=current_user.id, username=current_user.username)
    if db_itp is None:
        raise HTTPException(status_code=404, detail="ITP not found")
    return db_itp
