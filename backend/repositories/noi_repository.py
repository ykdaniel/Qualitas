"""
NOI (Notice of Inspection) Repository

Data access layer for NOI module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_search_term


class NOIRepository:
    """Repository for NOI data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, noi_id: str) -> Optional[models.NOI]:
        """
        Get NOI by ID with preloaded relationships

        Args:
            noi_id: NOI identifier

        Returns:
            NOI object if found, None otherwise
        """
        return (self.db.query(models.NOI)
                .options(
                    joinedload(models.NOI.vendor_ref),
                    joinedload(models.NOI.itp_ref),
                    joinedload(models.NOI.ncrs),
                    joinedload(models.NOI.itrs)
                )
                .filter(models.NOI.id == noi_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.NOI]:
        """
        Get all NOIs with optional filters

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NOI objects
        """
        query = self.db.query(models.NOI).options(
            joinedload(models.NOI.vendor_ref)
        )

        # Search filter (referenceNo, package, checkpoint)
        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.NOI.referenceNo.ilike(f"%{search_term}%")) |
                    (models.NOI.package.ilike(f"%{search_term}%")) |
                    (models.NOI.checkpoint.ilike(f"%{search_term}%"))
                )

        # Status filter
        if filters.get('status'):
            query = query.filter(models.NOI.status == filters['status'])

        # Date range filters
        if filters.get('start_date'):
            query = query.filter(models.NOI.submissionDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.NOI.submissionDate <= filters['end_date'])

        return query.offset(skip).limit(limit).all()

    def create(self, noi: models.NOI) -> models.NOI:
        """
        Create a new NOI record

        Args:
            noi: NOI object to create

        Returns:
            Created NOI object with refreshed state
        """
        self.db.add(noi)
        self.db.commit()
        self.db.refresh(noi)
        return noi

    def update(self, noi: models.NOI, update_data: dict) -> models.NOI:
        """
        Update an existing NOI record

        Args:
            noi: NOI object to update
            update_data: Dictionary of fields to update

        Returns:
            Updated NOI object with refreshed state
        """
        for key, value in update_data.items():
            setattr(noi, key, value)
        self.db.commit()
        self.db.refresh(noi)
        return noi

    def delete(self, noi: models.NOI):
        """
        Delete a NOI record

        Args:
            noi: NOI object to delete
        """
        self.db.delete(noi)
        self.db.commit()
