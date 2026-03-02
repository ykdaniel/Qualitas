"""
ITR (Inspection and Test Record) Repository

Data access layer for ITR module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_search_term


class ITRRepository:
    """Repository for ITR data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR by ID with preloaded relationships

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object if found, None otherwise
        """
        return (self.db.query(models.ITR)
                .options(
                    joinedload(models.ITR.vendor_ref),
                    joinedload(models.ITR.noi_ref)
                )
                .filter(models.ITR.id == itr_id)
                .first())

    def get_with_checklists(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR by ID with Checklist relationships preloaded

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object with checklists if found, None otherwise
        """
        return (self.db.query(models.ITR)
                .options(
                    joinedload(models.ITR.vendor_ref),
                    joinedload(models.ITR.noi_ref),
                    joinedload(models.ITR.checklists)
                )
                .filter(models.ITR.id == itr_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.ITR]:
        """
        Get all ITRs with optional filters

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of ITR objects
        """
        query = self.db.query(models.ITR).options(
            joinedload(models.ITR.vendor_ref)
        )

        # Search filter (documentNumber, subject)
        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.ITR.documentNumber.ilike(f"%{search_term}%")) |
                    (models.ITR.subject.ilike(f"%{search_term}%"))
                )

        # Status filter
        if filters.get('status'):
            query = query.filter(models.ITR.status == filters['status'])

        # Date range filters
        if filters.get('start_date'):
            query = query.filter(models.ITR.raiseDate >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.ITR.raiseDate <= filters['end_date'])

        return query.offset(skip).limit(limit).all()

    def create(self, itr: models.ITR) -> models.ITR:
        """
        Create a new ITR record

        Args:
            itr: ITR object to create

        Returns:
            Created ITR object with refreshed state
        """
        self.db.add(itr)
        self.db.commit()
        self.db.refresh(itr)
        return itr

    def update(self, itr: models.ITR, update_data: dict) -> models.ITR:
        """
        Update an existing ITR record

        Args:
            itr: ITR object to update
            update_data: Dictionary of fields to update

        Returns:
            Updated ITR object with refreshed state
        """
        for key, value in update_data.items():
            setattr(itr, key, value)
        self.db.commit()
        self.db.refresh(itr)
        return itr

    def delete(self, itr: models.ITR):
        """
        Delete an ITR record

        Args:
            itr: ITR object to delete
        """
        self.db.delete(itr)
        self.db.commit()

    def link_checklist(self, itr: models.ITR, checklist_id: str) -> models.ITR:
        """
        Link a Checklist to an ITR

        Args:
            itr: ITR object to link to
            checklist_id: Checklist ID to link

        Returns:
            Updated ITR object with refreshed state
        """
        checklist = self.db.query(models.Checklist).filter(
            models.Checklist.id == checklist_id
        ).first()

        if checklist:
            # Set the itrId foreign key on the checklist
            checklist.itrId = itr.id
            self.db.commit()
            self.db.refresh(itr)

        return itr
