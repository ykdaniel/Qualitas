"""
KPI Service

Business logic layer for KPIWeight and OwnerPerformance modules
"""

import uuid
import logging
from typing import List, Optional
from datetime import datetime

import models
import schemas
from repositories.kpi_repository import KPIRepository
from core.utils import log_audit

logger = logging.getLogger(__name__)

class KPIService:
    """Service layer for KPI business logic"""

    def __init__(self, repo: KPIRepository):
        self.repo = repo

    # --- KPI Weight ---
    def get_kpi_weight(self) -> models.KPIWeight:
        """Get the global KPI Weights"""
        return self.repo.get_kpi_weight()

    def update_kpi_weight(self, weight_update: schemas.KPIWeightUpdate,
                          user_id: int = None, username: str = None) -> models.KPIWeight:
        """Update KPI weights and log the audit trail"""
        try:
            db_weight = self.repo.get_kpi_weight()
            
            old_val = {
                "pqp": db_weight.pqp_weight,
                "itp": db_weight.itp_weight,
                "obs": db_weight.obs_weight,
                "ncr": db_weight.ncr_weight
            }

            data = weight_update.dict()
            data["updated_at"] = datetime.now().isoformat()

            updated = self.repo.update_kpi_weight(db_weight, data)

            log_audit(
                self.repo.db, "UPDATE", "KPIWeight", str(updated.id), "Global KPI Weights",
                old_value=old_val, new_value=weight_update.dict(),
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error updating KPI weights: {e}", exc_info=True)
            raise e

    # --- Owner Performance ---
    def get_owner_performances(self, month: str = None) -> List[models.OwnerPerformance]:
        """Get owner performances optionally filtered by month"""
        return self.repo.get_owner_performances(month)

    def create_owner_performance(self, perf_create: schemas.OwnerPerformanceCreate,
                                 user_id: int = None, username: str = None) -> models.OwnerPerformance:
        """Create a new owner performance and log the audit trail"""
        try:
            data = perf_create.dict()
            
            db_perf = models.OwnerPerformance(**data)
            if not db_perf.id:
                db_perf.id = str(uuid.uuid4())
                
            db_perf.updated_at = datetime.now().isoformat()

            created = self.repo.create_owner_performance(db_perf)

            log_audit(
                self.repo.db, "CREATE", "OwnerPerformance", created.id, created.owner_name,
                new_value=data, user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating Owner Performance: {e}", exc_info=True)
            raise e
