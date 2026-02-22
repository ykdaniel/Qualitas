from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import schemas
import crud
from database import get_db
from middleware.auth import get_current_user
from core.dependencies import RoleChecker
from core.perms import KPI_VIEW, KPI_UPDATE

router = APIRouter(
    prefix="/kpi",
    tags=["kpi"],
    responses={404: {"description": "Not found"}},
)

# --- KPI Weight Endpoints ---

@router.get("/weights", response_model=schemas.KPIWeight)
def read_kpi_weight(db: Session = Depends(get_db), current_user: schemas.User = Depends(RoleChecker(KPI_VIEW))):
    return crud.get_kpi_weight(db)

@router.put("/weights", response_model=schemas.KPIWeight)
def update_kpi_weight(
    weight: schemas.KPIWeightUpdate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(KPI_UPDATE))
):
    return crud.update_kpi_weight(db, weight_data=weight, user_id=current_user.id, username=current_user.username)


# --- Owner Performance Endpoints ---

@router.get("/performance", response_model=List[schemas.OwnerPerformance])
def read_owner_performances(
    month: Optional[str] = None, 
 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(KPI_VIEW))
):
    return crud.get_owner_performances(db, month=month)

@router.post("/performance", response_model=schemas.OwnerPerformance)
def create_owner_performance(
    perf: schemas.OwnerPerformanceCreate, 
    db: Session = Depends(get_db),
    current_user: schemas.User = Depends(RoleChecker(KPI_UPDATE))
):
    return crud.create_owner_performance(db, perf=perf, user_id=current_user.id, username=current_user.username)
