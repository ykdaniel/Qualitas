"""
OSD (Over/Short/Damage Report) Repository

Data access layer for OSD module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.scope import apply_scope
from core.utils import sanitize_pagination, sanitize_search_term


class OSDRepository:
    """Repository for OSD data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, osd_id: str) -> Optional[models.OSD]:
        """Get OSD by ID with preloaded relationships"""
        return (self.db.query(models.OSD)
                .options(joinedload(models.OSD.vendor_ref))
                .filter(models.OSD.id == osd_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, project_id: str = None, scope=None, **filters) -> List[models.OSD]:
        """Get all OSD records with optional filters"""
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.OSD).options(joinedload(models.OSD.vendor_ref))
        if project_id:
            query = query.filter(models.OSD.project_id == project_id)

        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.OSD.documentNumber.ilike(f"%{search_term}%")) |
                    (models.OSD.itemDescription.ilike(f"%{search_term}%")) |
                    (models.OSD.deliveryNoteNo.ilike(f"%{search_term}%"))
                )
        if filters.get('status'):
            query = query.filter(models.OSD.status == filters['status'])
        if filters.get('start_date'):
            query = query.filter(models.OSD.raiseDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.OSD.raiseDate <= filters['end_date'])

        # P0 data isolation: restrict to the caller's project/contractor scope.
        query = apply_scope(query, models.OSD, scope)

        return query.offset(skip).limit(limit).all()

    def create(self, osd: models.OSD, commit: bool = True) -> models.OSD:
        """Create a new OSD record"""
        self.db.add(osd)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(osd)
        return osd

    def update(self, osd: models.OSD, update_data: dict, commit: bool = True) -> models.OSD:
        """Update an existing OSD record"""
        for key, value in update_data.items():
            setattr(osd, key, value)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(osd)
        return osd

    def delete(self, osd: models.OSD, commit: bool = True):
        """Delete an OSD record"""
        self.db.delete(osd)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
