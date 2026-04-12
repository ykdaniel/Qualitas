"""
Audit Repository

Data access layer for Audit module
"""

from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session

import models
from core.utils import sanitize_pagination


class AuditRepository:
    """Repository for Audit data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, audit_id: str) -> Optional[models.Audit]:
        """
        Get Audit by ID

        Args:
            audit_id: Audit identifier

        Returns:
            Audit object if found, None otherwise
        """
        return (self.db.query(models.Audit)
                .filter(models.Audit.id == audit_id)
                .first())

    def get_all(self, skip: int = 0, limit: int = 100, project_id: str = None) -> List[models.Audit]:
        """
        Get all Audits

        Args:
            skip: Number of records to skip (pagination)
            limit: Maximum number of records to return
            project_id: Optional project ID filter

        Returns:
            List of Audit objects
        """
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.Audit)
        if project_id:
            query = query.filter(models.Audit.project_id == project_id)
        return query.offset(skip).limit(limit).all()

    def create(self, audit_data: Dict[str, Any]) -> models.Audit:
        """
        Create a new Audit record

        Args:
            audit_data: Dictionary containing audit fields

        Returns:
            Created Audit object
        """
        db_audit = models.Audit(**audit_data)
        self.db.add(db_audit)
        self.db.flush()
        return db_audit

    def update(self, audit_id: str, update_data: Dict[str, Any]) -> Optional[models.Audit]:
        """
        Update an existing Audit record

        Args:
            audit_id: Audit identifier
            update_data: Dictionary containing fields to update

        Returns:
            Updated Audit object if found, None otherwise
        """
        db_audit = self.get_by_id(audit_id)
        if db_audit:
            for key, value in update_data.items():
                setattr(db_audit, key, value)
            self.db.flush()
        return db_audit

    def delete(self, audit_id: str) -> bool:
        """
        Delete an Audit record

        Args:
            audit_id: Audit identifier

        Returns:
            True if deleted, False if not found
        """
        db_audit = self.get_by_id(audit_id)
        if db_audit:
            self.db.delete(db_audit)
            self.db.flush()
            return True
        return False

    def get_by_audit_no(self, audit_no: str) -> Optional[models.Audit]:
        """
        Get Audit by audit number

        Args:
            audit_no: Audit number (e.g., QTS-RKS-XXX-AUD-000001)

        Returns:
            Audit object if found, None otherwise
        """
        return (self.db.query(models.Audit)
                .filter(models.Audit.auditNo == audit_no)
                .first())
