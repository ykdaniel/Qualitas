"""
Checklist Service

Business logic layer for Checklist module
"""

import uuid
import logging
from typing import List, Optional
from sqlalchemy import inspect

import models
import schemas
from repositories.checklist_repository import ChecklistRepository
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)
from core import validators

logger = logging.getLogger(__name__)


class ChecklistService:
    """Service layer for Checklist business logic"""

    def __init__(self, repo: ChecklistRepository):
        self.repo = repo

    def get_checklists(self, skip: int = 0, limit: int = 500, **filters) -> List[models.Checklist]:
        """
        Get list of Checklists with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date, itr_id, noi_number)

        Returns:
            List of Checklist objects
        """
        return self.repo.get_all(skip, limit, **filters)

    def get_checklist(self, checklist_id: str) -> Optional[models.Checklist]:
        """
        Get a single Checklist by ID

        Args:
            checklist_id: Checklist identifier

        Returns:
            Checklist object if found, None otherwise
        """
        return self.repo.get_by_id(checklist_id)

    def get_checklists_by_itr(self, itr_id: str) -> List[models.Checklist]:
        """
        Get all Checklists associated with a specific ITR

        Args:
            itr_id: ITR identifier

        Returns:
            List of Checklist objects
        """
        return self.repo.get_by_itr(itr_id)

    def get_checklists_by_noi(self, noi_number: str) -> List[models.Checklist]:
        """
        Get all Checklists associated with a specific NOI

        Args:
            noi_number: NOI reference number

        Returns:
            List of Checklist objects
        """
        return self.repo.get_by_noi(noi_number)

    def create_checklist(self, checklist_create: schemas.ChecklistCreate,
                        user_id: int = None, username: str = None) -> models.Checklist:
        """
        Create a new Checklist with business logic validation

        Business logic:
        - Maps contractor name to contractor_id
        - Generates recordsNo automatically if not provided
        - Serializes JSON fields (detail_data)
        - Logs audit trail

        Args:
            checklist_create: Checklist creation schema
            user_id: ID of user creating the Checklist
            username: Username of user creating the Checklist

        Returns:
            Created Checklist object

        Raises:
            Exception: If creation fails
        """
        try:
            data = checklist_create.dict()
            data = _json_serialize(data, ['detail_data'])

            # Generate recordsNo automatically if not provided or is placeholder
            if not data.get('recordsNo') or data.get('recordsNo') == "[AUTO-GENERATE]":
                data['recordsNo'] = generate_reference_no(
                    self.repo.db, data.get('packageName', ''), 'CHECKLIST'
                )

            # Handle contractor name -> contractor_id mapping
            if 'contractor' in data:
                contractor_name = data.pop('contractor')
                if contractor_name:
                    data['contractor_id'] = _resolve_vendor_id(self.repo.db, contractor_name)

            # Validate references to other modules
            if data.get('itpId'):
                # Validate ITP exists by ID (since itpId is UUID, not referenceNo)
                itp = self.repo.db.query(models.ITP).filter(models.ITP.id == data['itpId']).first()
                if not itp:
                    raise ValueError(f"ITP with ID '{data['itpId']}' not found")

            if data.get('noiNumber'):
                validators.validate_noi_reference(self.repo.db, data['noiNumber'])

            if data.get('itrId'):
                validators.validate_itr_by_id(self.repo.db, data['itrId'])

            if data.get('itrNumber'):
                validators.validate_itr_reference(self.repo.db, data['itrNumber'])

            # Create Checklist object
            db_checklist = models.Checklist(**data)
            if not db_checklist.id:
                db_checklist.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_checklist)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "Checklist", created.id, created.recordsNo,
                new_value=checklist_create.dict(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating Checklist: {e}", exc_info=True)
            raise e

    def update_checklist(self, checklist_id: str, checklist_update: schemas.ChecklistUpdate,
                        user_id: int = None, username: str = None) -> Optional[models.Checklist]:
        """
        Update an existing Checklist with validation

        Business logic:
        - Validates status transitions using WorkflowEngine (Ongoing <-> Pass/Fail)
        - Maps contractor name to contractor_id
        - Serializes JSON fields (detail_data)
        - Logs audit trail

        Args:
            checklist_id: Checklist identifier
            checklist_update: Checklist update schema
            user_id: ID of user updating the Checklist
            username: Username of user updating the Checklist

        Returns:
            Updated Checklist object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_checklist = self.repo.get_by_id(checklist_id)
            if not db_checklist:
                return None

            # Workflow validation: Check status transition
            if checklist_update.status and not WorkflowEngine.validate_transition(
                "Checklist", db_checklist.status, checklist_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_checklist.status} to {checklist_update.status}"
                )

            # Capture old values for audit using inspect
            mapper = inspect(models.Checklist)
            old_val = {prop.key: getattr(db_checklist, prop.key) for prop in mapper.column_attrs}

            # Prepare update data
            d = checklist_update.dict(exclude_unset=True)
            d = _json_serialize(d, ['detail_data'])

            # Handle contractor name -> contractor_id mapping
            if 'contractor' in d:
                contractor_name = d.pop('contractor')
                if contractor_name:
                    d['contractor_id'] = _resolve_vendor_id(self.repo.db, contractor_name)

            # Validate references to other modules if being updated
            if 'itpId' in d and d['itpId']:
                itp = self.repo.db.query(models.ITP).filter(models.ITP.id == d['itpId']).first()
                if not itp:
                    raise ValueError(f"ITP with ID '{d['itpId']}' not found")

            if 'noiNumber' in d and d['noiNumber']:
                validators.validate_noi_reference(self.repo.db, d['noiNumber'])

            if 'itrId' in d and d['itrId']:
                validators.validate_itr_by_id(self.repo.db, d['itrId'])

            if 'itrNumber' in d and d['itrNumber']:
                validators.validate_itr_reference(self.repo.db, d['itrNumber'])

            # Update the record
            updated = self.repo.update(db_checklist, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "Checklist", checklist_id, updated.recordsNo,
                old_value=old_val, new_value=checklist_update.dict(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating Checklist {checklist_id}: {e}", exc_info=True)
            raise e

    def delete_checklist(self, checklist_id: str, user_id: int = None, username: str = None) -> bool:
        """
        Delete a Checklist with audit logging

        Args:
            checklist_id: Checklist identifier
            user_id: ID of user deleting the Checklist
            username: Username of user deleting the Checklist

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_checklist = self.repo.get_by_id(checklist_id)
            if not db_checklist:
                return False

            # Capture old values for audit using inspect
            mapper = inspect(models.Checklist)
            old_val = {prop.key: getattr(db_checklist, prop.key) for prop in mapper.column_attrs}

            # Delete the record
            self.repo.delete(db_checklist)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "Checklist", checklist_id, db_checklist.recordsNo,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting Checklist {checklist_id}: {e}", exc_info=True)
            raise e
