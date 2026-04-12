"""
Contractor Repository

Data access layer for Contractor module
"""

from typing import List, Optional
from sqlalchemy.orm import Session

import models
from core.utils import sanitize_pagination


class ContractorRepository:
    """Repository for Contractor data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, contractor_id: str) -> Optional[models.Contractor]:
        """
        Get Contractor by ID

        Args:
            contractor_id: Contractor identifier

        Returns:
            Contractor object if found, None otherwise
        """
        return (self.db.query(models.Contractor)
                .filter(models.Contractor.id == contractor_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 500) -> List[models.Contractor]:
        """
        Get all Contractors

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return

        Returns:
            List of Contractor objects
        """
        skip, limit = sanitize_pagination(skip, limit)
        return self.db.query(models.Contractor).offset(skip).limit(limit).all()

    def create(self, contractor: models.Contractor) -> models.Contractor:
        """
        Create a new Contractor record

        Args:
            contractor: Contractor object to create

        Returns:
            Created Contractor object with refreshed state
        """
        self.db.add(contractor)
        self.db.commit()
        self.db.refresh(contractor)
        return contractor

    def update(self, contractor: models.Contractor, update_data: dict) -> models.Contractor:
        """
        Update an existing Contractor record

        Args:
            contractor: Contractor object to update
            update_data: Dictionary of fields to update

        Returns:
            Updated Contractor object with refreshed state
        """
        for key, value in update_data.items():
            setattr(contractor, key, value)
        self.db.commit()
        self.db.refresh(contractor)
        return contractor

    def delete(self, contractor: models.Contractor):
        """
        Delete a Contractor record

        Args:
            contractor: Contractor object to delete
        """
        self.db.delete(contractor)
        self.db.commit()
