"""
KPI Repository

Data access layer for KPIWeight and OwnerPerformance modules
"""

from typing import List, Optional
from sqlalchemy.orm import Session
import models

class KPIRepository:
    """Repository for KPI and Owner Performance entities"""

    def __init__(self, db: Session):
        self.db = db

    # --- KPI Weight ---
    def get_kpi_weight(self) -> models.KPIWeight:
        """Fetch the global KPI Weight configuration or create a default one"""
        weight = self.db.query(models.KPIWeight).first()
        if not weight:
            weight = models.KPIWeight(
                pqp_weight=25,
                itp_weight=25,
                obs_weight=25,
                ncr_weight=25
            )
            self.db.add(weight)
            self.db.commit()
            self.db.refresh(weight)
        return weight

    def update_kpi_weight(self, weight: models.KPIWeight, update_data: dict) -> models.KPIWeight:
        """Update the global KPI Weight configuration"""
        for key, value in update_data.items():
            setattr(weight, key, value)
        self.db.commit()
        self.db.refresh(weight)
        return weight

    # --- Owner Performance ---
    def get_owner_performances(self, month: Optional[str] = None) -> List[models.OwnerPerformance]:
        """Fetch owner performance records, optionally filtered by month"""
        query = self.db.query(models.OwnerPerformance)
        if month:
            query = query.filter(models.OwnerPerformance.month == month)
        return query.all()

    def create_owner_performance(self, perf: models.OwnerPerformance) -> models.OwnerPerformance:
        """Create a new owner performance record"""
        self.db.add(perf)
        self.db.commit()
        self.db.refresh(perf)
        return perf
