from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import schemas
from core.dependencies import RoleChecker, get_kpi_service
from core.perms import KPI_UPDATE, KPI_VIEW
from services.kpi_service import KPIService

router = APIRouter(
    prefix="/kpi",
    tags=["kpi"],
    responses={404: {"description": "Not found"}},
)

# --- KPI Weight Endpoints ---

@router.get("/weights", response_model=schemas.KPIWeight)
def read_kpi_weight(
    kpi_service: KPIService = Depends(get_kpi_service),
    current_user: schemas.User = Depends(RoleChecker(KPI_VIEW))
):
    return kpi_service.get_kpi_weight()

@router.put("/weights", response_model=schemas.KPIWeight)
def update_kpi_weight(
    weight: schemas.KPIWeightUpdate,
    kpi_service: KPIService = Depends(get_kpi_service),
    current_user: schemas.User = Depends(RoleChecker(KPI_UPDATE))
):
    return kpi_service.update_kpi_weight(weight_update=weight, user_id=current_user.id, username=current_user.username)


# --- Owner Performance Endpoints ---

@router.get("/performance", response_model=list[schemas.OwnerPerformance])
def read_owner_performances(
    month: str | None = None,
    kpi_service: KPIService = Depends(get_kpi_service),
    current_user: schemas.User = Depends(RoleChecker(KPI_VIEW))
):
    return kpi_service.get_owner_performances(month=month)

@router.post("/performance", response_model=schemas.OwnerPerformance)
def create_owner_performance(
    perf: schemas.OwnerPerformanceCreate,
    kpi_service: KPIService = Depends(get_kpi_service),
    current_user: schemas.User = Depends(RoleChecker(KPI_UPDATE))
):
    return kpi_service.create_owner_performance(perf_create=perf, user_id=current_user.id, username=current_user.username)
