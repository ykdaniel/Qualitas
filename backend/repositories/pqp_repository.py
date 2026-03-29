"""
PQP (Pre-Qualification Package) Repository

Data access layer for PQP module
"""

from typing import List, Optional
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_search_term


class PQPRepository:
    """Repository for PQP data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, pqp_id: str) -> Optional[models.PQP]:
        """Get PQP by ID with preloaded relationships"""
        return (self.db.query(models.PQP)
                .options(joinedload(models.PQP.vendor_ref))
                .filter(models.PQP.id == pqp_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.PQP]:
        """Get all PQPs with optional filters"""
        query = self.db.query(models.PQP).options(joinedload(models.PQP.vendor_ref))

        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.PQP.pqpNo.ilike(f"%{search_term}%")) |
                    (models.PQP.title.ilike(f"%{search_term}%"))
                )
        if filters.get('status'):
            status_filter = str(filters['status']).strip().lower()
            if status_filter == "not submitted":
                status_filter = "not submit"
            if status_filter == "rejected":
                status_filter = "reject"
            query = query.filter(func.lower(models.PQP.status) == status_filter)
        if filters.get('start_date'):
            query = query.filter(models.PQP.createdAt >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.PQP.createdAt <= filters['end_date'])

        return query.offset(skip).limit(limit).all()

    def create(self, pqp: models.PQP) -> models.PQP:
        """Create a new PQP record"""
        self.db.add(pqp)
        self.db.commit()
        self.db.refresh(pqp)
        return pqp

    def update(self, pqp: models.PQP, update_data: dict) -> models.PQP:
        """Update an existing PQP record"""
        for key, value in update_data.items():
            setattr(pqp, key, value)
        self.db.commit()
        self.db.refresh(pqp)
        return pqp

    def delete(self, pqp: models.PQP):
        """Delete a PQP record"""
        self.db.delete(pqp)
        self.db.commit()
