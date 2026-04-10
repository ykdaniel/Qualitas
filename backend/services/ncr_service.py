"""
NCR (Non-Conformance Report) Service

Business logic layer for NCR module
"""

import uuid
import logging
from datetime import datetime
from typing import List, Optional

import models
import schemas
from repositories.ncr_repository import NCRRepository
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class NCRService:
    """Service layer for NCR business logic"""

    def __init__(self, repo: NCRRepository):
        self.repo = repo

    def get_ncrs(self, skip: int = 0, limit: int = 500, **filters) -> List[models.NCR]:
        """
        Get list of NCRs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NCR objects
        """
        return self.repo.get_all(skip, limit, **filters)

    def get_ncr(self, ncr_id: str) -> Optional[models.NCR]:
        """
        Get a single NCR by ID

        Args:
            ncr_id: NCR identifier

        Returns:
            NCR object if found, None otherwise
        """
        return self.repo.get_by_id(ncr_id)

    def create_ncr(self, ncr_create: schemas.NCRCreate,
                   user_id: int = None, username: str = None) -> models.NCR:
        """
        Create a new NCR with business logic validation

        Business logic:
        - Maps vendor name to vendor_id
        - Generates Reference No (documentNumber) automatically if not provided
        - Serializes JSON fields (defectPhotos, improvementPhotos, attachments)
        - Logs audit trail

        Args:
            ncr_create: NCR creation schema
            user_id: ID of user creating the NCR
            username: Username of user creating the NCR

        Returns:
            Created NCR object

        Raises:
            Exception: If creation fails
        """
        try:
            # Serialize JSON fields
            data = _json_serialize(
                ncr_create.model_dump(),
                ['defectPhotos', 'improvementPhotos', 'attachments']
            )

            # Handle vendor name -> vendor_id mapping
            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate foreign keys BEFORE allocating a reference number,
            # so failed creates don't leave gaps in the NCR sequence.
            if data.get('noiNumber'):
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == data['noiNumber']
                ).first()
                if not noi:
                    raise ValueError(f"NOI with reference number '{data['noiNumber']}' not found")

            # Generate Reference No automatically if not provided
            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'NCR'
                )

            # Create NCR object
            db_ncr = models.NCR(**data)
            if not db_ncr.id:
                db_ncr.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_ncr)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "NCR", created.id, created.documentNumber,
                new_value=ncr_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating NCR: {e}", exc_info=True)
            raise e

    def update_ncr(self, ncr_id: str, ncr_update: schemas.NCRUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.NCR]:
        """
        Update an existing NCR with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Maps vendor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Args:
            ncr_id: NCR identifier
            ncr_update: NCR update schema
            user_id: ID of user updating the NCR
            username: Username of user updating the NCR

        Returns:
            Updated NCR object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_ncr = self.repo.get_by_id(ncr_id)
            if not db_ncr:
                return None

            # Workflow validation: Check status transition
            if ncr_update.status and not WorkflowEngine.validate_transition(
                "NCR", db_ncr.status, ncr_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_ncr.status} to {ncr_update.status}"
                )

            # Capture old values for audit
            old_val = {c.name: getattr(db_ncr, c.name) for c in db_ncr.__table__.columns}

            # Prepare update data
            d = ncr_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            # Handle vendor name -> vendor_id mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Auto-set closeoutDate when transitioning to Closed
            if d.get('status') == 'Closed' and not d.get('closeoutDate') and not db_ncr.closeoutDate:
                d['closeoutDate'] = datetime.now().strftime('%Y-%m-%d')

            # Validate noiNumber exists if being updated
            if 'noiNumber' in d and d['noiNumber']:
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == d['noiNumber']
                ).first()
                if not noi:
                    raise ValueError(f"NOI with reference number '{d['noiNumber']}' not found")

            # Update the record
            updated = self.repo.update(db_ncr, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "NCR", ncr_id, updated.documentNumber,
                old_value=old_val, new_value=ncr_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating NCR {ncr_id}: {e}", exc_info=True)
            raise e

    def delete_ncr(self, ncr_id: str, user_id: int = None, username: str = None) -> bool:
        """
        Delete a NCR with audit logging

        Args:
            ncr_id: NCR identifier
            user_id: ID of user deleting the NCR
            username: Username of user deleting the NCR

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_ncr = self.repo.get_by_id(ncr_id)
            if not db_ncr:
                return False

            # Check for ITR references before deletion
            itr_count = self.repo.db.query(models.ITR).filter(
                models.ITR.ncrNumber == db_ncr.documentNumber
            ).count()
            if itr_count > 0:
                raise ValueError(f"Cannot delete NCR '{db_ncr.documentNumber}': referenced by {itr_count} ITR record(s)")

            # Capture old values for audit
            old_val = {c.name: getattr(db_ncr, c.name) for c in db_ncr.__table__.columns}

            # Delete the record
            self.repo.delete(db_ncr)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "NCR", ncr_id, db_ncr.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting NCR {ncr_id}: {e}", exc_info=True)
            raise e
