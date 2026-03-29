"""
FollowUp Repository

Data access layer for FollowUp module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_search_term


class FollowUpRepository:
    """Repository for FollowUp data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, followup_id: str) -> Optional[models.FollowUp]:
        """Get FollowUp by ID with preloaded relationships"""
        return (self.db.query(models.FollowUp)
                .options(joinedload(models.FollowUp.vendor_ref))
                .filter(models.FollowUp.id == followup_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.FollowUp]:
        """Get all FollowUp records"""
        query = self.db.query(models.FollowUp).options(joinedload(models.FollowUp.vendor_ref))

        # Add search filter if needed
        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.FollowUp.issueNo.ilike(f"%{search_term}%")) |
                    (models.FollowUp.issue.ilike(f"%{search_term}%"))
                )

        return query.offset(skip).limit(limit).all()

    def create(self, followup: models.FollowUp) -> models.FollowUp:
        """Create a new FollowUp record"""
        self.db.add(followup)
        self.db.commit()
        self.db.refresh(followup)
        return followup

    def update(self, followup: models.FollowUp, update_data: dict) -> models.FollowUp:
        """Update an existing FollowUp record"""
        for key, value in update_data.items():
            setattr(followup, key, value)
        self.db.commit()
        self.db.refresh(followup)
        return followup

    def delete(self, followup: models.FollowUp):
        """Delete a FollowUp record"""
        self.db.delete(followup)
        self.db.commit()
