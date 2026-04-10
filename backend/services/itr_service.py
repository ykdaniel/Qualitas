"""
ITR (Inspection and Test Record) Service

Business logic layer for ITR module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.itr_repository import ITRRepository
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class ITRService:
    """Service layer for ITR business logic"""

    def __init__(self, repo: ITRRepository):
        self.repo = repo

    def get_itrs(self, skip: int = 0, limit: int = 500, **filters) -> List[models.ITR]:
        """
        Get list of ITRs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of ITR objects
        """
        return self.repo.get_all(skip, limit, **filters)

    def get_itr(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get a single ITR by ID

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object if found, None otherwise
        """
        return self.repo.get_by_id(itr_id)

    def get_itr_with_checklists(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR with associated Checklists

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object with checklists if found, None otherwise
        """
        return self.repo.get_with_checklists(itr_id)

    def create_itr(self, itr_create: schemas.ITRCreate,
                   user_id: int = None, username: str = None) -> models.ITR:
        """
        Create a new ITR with business logic validation

        Business logic:
        - Maps vendor name to vendor_id
        - Generates Reference No (documentNumber) automatically if not provided
        - Serializes JSON fields (defectPhotos, improvementPhotos, attachments)
        - Logs audit trail

        Args:
            itr_create: ITR creation schema
            user_id: ID of user creating the ITR
            username: Username of user creating the ITR

        Returns:
            Created ITR object

        Raises:
            Exception: If creation fails
        """
        try:
            # Serialize JSON fields
            data = _json_serialize(
                itr_create.model_dump(),
                ['defectPhotos', 'improvementPhotos', 'attachments']
            )

            # Handle vendor name -> vendor_id mapping
            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate foreign keys BEFORE allocating a reference number,
            # so failed creates don't leave gaps in the ITR sequence.
            if data.get('noiNumber'):
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == data['noiNumber']
                ).first()
                if not noi:
                    raise ValueError(f"NOI with reference number '{data['noiNumber']}' not found")

            if data.get('ncrNumber'):
                ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == data['ncrNumber']
                ).first()
                if not ncr:
                    raise ValueError(f"NCR with document number '{data['ncrNumber']}' not found")

            # Generate Reference No automatically if not provided
            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'ITR'
                )

            # Create ITR object
            db_itr = models.ITR(**data)
            if not db_itr.id:
                db_itr.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_itr)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "ITR", created.id, created.documentNumber,
                new_value=itr_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating ITR: {e}", exc_info=True)
            raise e

    def update_itr(self, itr_id: str, itr_update: schemas.ITRUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.ITR]:
        """
        Update an existing ITR with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Maps vendor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Args:
            itr_id: ITR identifier
            itr_update: ITR update schema
            user_id: ID of user updating the ITR
            username: Username of user updating the ITR

        Returns:
            Updated ITR object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                return None

            # Workflow validation: Check status transition
            if itr_update.status and not WorkflowEngine.validate_transition(
                "ITR", db_itr.status, itr_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_itr.status} to {itr_update.status}"
                )

            # 勾稽鎖定：Approved 狀態的 ITR 只允許 Publish（變更 type/status）或轉為 Reject/Void
            # 任何其他欄位更新均被阻擋，以防止已批准記錄被竄改
            if db_itr.status == 'Approved':
                allowed_keys = {'type', 'status', 'detail_data'}
                update_keys = set(itr_update.model_dump(exclude_unset=True).keys())
                blocked = update_keys - allowed_keys
                if blocked:
                    raise ValueError(
                        f"Cannot modify a locked (Approved) ITR. "
                        f"Blocked fields: {', '.join(sorted(blocked))}. "
                        f"Use Publish to create a new revision."
                    )

            # Capture old values for audit
            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}

            # Prepare update data
            d = itr_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            # Handle vendor name -> vendor_id mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate noiNumber exists if being updated
            if 'noiNumber' in d and d['noiNumber']:
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == d['noiNumber']
                ).first()
                if not noi:
                    raise ValueError(f"NOI with reference number '{d['noiNumber']}' not found")

            # Validate ncrNumber exists if being updated
            if 'ncrNumber' in d and d['ncrNumber']:
                ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == d['ncrNumber']
                ).first()
                if not ncr:
                    raise ValueError(f"NCR with document number '{d['ncrNumber']}' not found")

            # Update the record
            updated = self.repo.update(db_itr, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "ITR", itr_id, updated.documentNumber,
                old_value=old_val, new_value=itr_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating ITR {itr_id}: {e}", exc_info=True)
            raise e

    def delete_itr(self, itr_id: str, user_id: int = None, username: str = None) -> bool:
        """
        Delete an ITR with audit logging

        Args:
            itr_id: ITR identifier
            user_id: ID of user deleting the ITR
            username: Username of user deleting the ITR

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                return False

            # Capture old values for audit
            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}

            # Delete the record
            self.repo.delete(db_itr)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "ITR", itr_id, db_itr.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting ITR {itr_id}: {e}", exc_info=True)
            raise e

    def link_checklist(self, itr_id: str, checklist_id: str,
                       user_id: int = None, username: str = None) -> Optional[models.ITR]:
        """
        Link a Checklist to an ITR

        Args:
            itr_id: ITR identifier
            checklist_id: Checklist identifier to link
            user_id: ID of user performing the action
            username: Username of user performing the action

        Returns:
            Updated ITR object if found, None otherwise

        Raises:
            Exception: If linking fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr:
                return None

            # Link the checklist
            updated = self.repo.link_checklist(db_itr, checklist_id)

            # Log audit trail
            log_audit(
                self.repo.db, "LINK_CHECKLIST", "ITR", itr_id, db_itr.documentNumber,
                new_value={"checklist_id": checklist_id},
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error linking checklist to ITR {itr_id}: {e}", exc_info=True)
            raise e
