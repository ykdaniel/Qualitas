"""
OBS (Observation) Repository

Data access layer for OBS module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_search_term


class OBSRepository:
    """Repository for OBS data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, obs_id: str) -> Optional[models.OBS]:
        """Get OBS by ID with preloaded relationships"""
        return (self.db.query(models.OBS)
                .options(joinedload(models.OBS.vendor_ref))
                .filter(models.OBS.id == obs_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.OBS]:
        """Get all OBS records with optional filters"""
        query = self.db.query(models.OBS).options(joinedload(models.OBS.vendor_ref))

        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.OBS.documentNumber.ilike(f"%{search_term}%")) |
                    (models.OBS.subject.ilike(f"%{search_term}%"))
                )
        if filters.get('status'):
            query = query.filter(models.OBS.status == filters['status'])
        if filters.get('start_date'):
            query = query.filter(models.OBS.raiseDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.OBS.raiseDate <= filters['end_date'])

        return query.offset(skip).limit(limit).all()

    def create(self, obs: models.OBS) -> models.OBS:
        """Create a new OBS record"""
        self.db.add(obs)
        self.db.commit()
        self.db.refresh(obs)
        return obs

    def update(self, obs: models.OBS, update_data: dict) -> models.OBS:
        """Update an existing OBS record"""
        for key, value in update_data.items():
            setattr(obs, key, value)
        self.db.commit()
        self.db.refresh(obs)
        return obs

    def delete(self, obs: models.OBS):
        """Delete an OBS record"""
        self.db.delete(obs)
        self.db.commit()
