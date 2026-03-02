"""
Checklist Repository

Data access layer for Checklist module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload

import models
from core.utils import sanitize_search_term


class ChecklistRepository:
    """Repository for Checklist data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, checklist_id: str) -> Optional[models.Checklist]:
        """
        Get Checklist by ID with preloaded relationships

        Args:
            checklist_id: Checklist identifier

        Returns:
            Checklist object if found, None otherwise
        """
        return (self.db.query(models.Checklist)
                .options(
                    joinedload(models.Checklist.vendor_ref),
                    joinedload(models.Checklist.noi_ref),
                    joinedload(models.Checklist.itr_ref)
                )
                .filter(models.Checklist.id == checklist_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.Checklist]:
        """
        Get all Checklists with optional filters

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            **filters: Optional filters (search, status, start_date, end_date, itr_id, noi_number)

        Returns:
            List of Checklist objects
        """
        query = self.db.query(models.Checklist).options(
            joinedload(models.Checklist.vendor_ref)
        )

        # Search filter (recordsNo, activity, packageName)
        if filters.get('search'):
            search_term = sanitize_search_term(filters['search'])
            if search_term:
                query = query.filter(
                    (models.Checklist.recordsNo.ilike(f"%{search_term}%")) |
                    (models.Checklist.activity.ilike(f"%{search_term}%")) |
                    (models.Checklist.packageName.ilike(f"%{search_term}%"))
                )

        # Status filter
        if filters.get('status'):
            query = query.filter(models.Checklist.status == filters['status'])

        # ITR filter
        if filters.get('itr_id'):
            query = query.filter(models.Checklist.itrId == filters['itr_id'])

        # NOI filter
        if filters.get('noi_number'):
            query = query.filter(models.Checklist.noiNumber == filters['noi_number'])

        # Date range filters
        if filters.get('start_date'):
            query = query.filter(models.Checklist.date >= filters['start_date'])
        if filters.get('end_date'):
            query = query.filter(models.Checklist.date <= filters['end_date'])

        return query.offset(skip).limit(limit).all()

    def get_by_itr(self, itr_id: str) -> List[models.Checklist]:
        """
        Get all Checklists associated with a specific ITR

        Args:
            itr_id: ITR identifier

        Returns:
            List of Checklist objects
        """
        return (self.db.query(models.Checklist)
                .options(joinedload(models.Checklist.vendor_ref))
                .filter(models.Checklist.itrId == itr_id)
                .all())

    def get_by_noi(self, noi_number: str) -> List[models.Checklist]:
        """
        Get all Checklists associated with a specific NOI

        Args:
            noi_number: NOI reference number

        Returns:
            List of Checklist objects
        """
        return (self.db.query(models.Checklist)
                .options(joinedload(models.Checklist.vendor_ref))
                .filter(models.Checklist.noiNumber == noi_number)
                .all())

    def create(self, checklist: models.Checklist) -> models.Checklist:
        """
        Create a new Checklist record

        Args:
            checklist: Checklist object to create

        Returns:
            Created Checklist object with refreshed state
        """
        self.db.add(checklist)
        self.db.commit()
        self.db.refresh(checklist)
        return checklist

    def update(self, checklist: models.Checklist, update_data: dict) -> models.Checklist:
        """
        Update an existing Checklist record

        Args:
            checklist: Checklist object to update
            update_data: Dictionary of fields to update

        Returns:
            Updated Checklist object with refreshed state
        """
        for key, value in update_data.items():
            setattr(checklist, key, value)
        self.db.commit()
        self.db.refresh(checklist)
        return checklist

    def delete(self, checklist: models.Checklist):
        """
        Delete a Checklist record

        Args:
            checklist: Checklist object to delete
        """
        self.db.delete(checklist)
        self.db.commit()
