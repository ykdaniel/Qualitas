"""
NCR (Non-Conformance Report) Repository

Data access layer for NCR module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_pagination, sanitize_search_term


class NCRRepository:
    """Repository for NCR data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, ncr_id: str) -> Optional[models.NCR]:
        """
        Get NCR by ID with preloaded relationships

        Args:
            ncr_id: NCR identifier

        Returns:
            NCR object if found, None otherwise
        """
        return (self.db.query(models.NCR)
                .options(
                    joinedload(models.NCR.vendor_ref),
                    joinedload(models.NCR.noi_ref)
                )
                .filter(models.NCR.id == ncr_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, project_id: str = None, **filters) -> List[models.NCR]:
        """
        Get all NCRs with optional filters

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            project_id: Optional project ID filter
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NCR objects
        """
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.NCR).options(
            joinedload(models.NCR.vendor_ref)
        )
        if project_id:
            query = query.filter(models.NCR.project_id == project_id)

        # Search filter (documentNumber, subject)
        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.NCR.documentNumber.ilike(f"%{search_term}%")) |
                    (models.NCR.subject.ilike(f"%{search_term}%"))
                )

        # Status filter
        if filters.get('status'):
            query = query.filter(models.NCR.status == filters['status'])

        # Date range filters
        if filters.get('start_date'):
            query = query.filter(models.NCR.raiseDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.NCR.raiseDate <= filters['end_date'])

        return query.offset(skip).limit(limit).all()

    def create(self, ncr: models.NCR) -> models.NCR:
        """
        Create a new NCR record

        Args:
            ncr: NCR object to create

        Returns:
            Created NCR object with refreshed state
        """
        self.db.add(ncr)
        self.db.commit()
        self.db.refresh(ncr)
        return ncr

    def update(self, ncr: models.NCR, update_data: dict) -> models.NCR:
        """
        Update an existing NCR record

        Args:
            ncr: NCR object to update
            update_data: Dictionary of fields to update

        Returns:
            Updated NCR object with refreshed state
        """
        for key, value in update_data.items():
            setattr(ncr, key, value)
        self.db.commit()
        self.db.refresh(ncr)
        return ncr

    def delete(self, ncr: models.NCR):
        """
        Delete a NCR record

        Args:
            ncr: NCR object to delete
        """
        self.db.delete(ncr)
        self.db.commit()
