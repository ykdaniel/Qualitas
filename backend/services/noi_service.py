"""
NOI (Notice of Inspection) Service

Business logic layer for NOI module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.noi_repository import NOIRepository
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)
from core import error_messages
from core import validators

logger = logging.getLogger(__name__)


class NOIService:
    """Service layer for NOI business logic"""

    def __init__(self, repo: NOIRepository):
        self.repo = repo

    def get_nois(self, skip: int = 0, limit: int = 500, **filters) -> List[models.NOI]:
        """
        Get list of NOIs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NOI objects
        """
        return self.repo.get_all(skip, limit, **filters)

    def get_noi(self, noi_id: str) -> Optional[models.NOI]:
        """
        Get a single NOI by ID

        Args:
            noi_id: NOI identifier

        Returns:
            NOI object if found, None otherwise
        """
        return self.repo.get_by_id(noi_id)

    def create_noi(self, noi_create: schemas.NOICreate,
                   user_id: int = None, username: str = None) -> models.NOI:
        """
        Create a new NOI with business logic validation

        Business logic:
        - Maps contractor name to vendor_id
        - Generates Reference No automatically if not provided
        - Sets default status to "Draft" if not provided
        - Serializes JSON fields (attachments)
        - Logs audit trail

        Args:
            noi_create: NOI creation schema
            user_id: ID of user creating the NOI
            username: Username of user creating the NOI

        Returns:
            Created NOI object

        Raises:
            Exception: If creation fails
        """
        try:
            data = _json_serialize(noi_create.model_dump(), ['attachments'])

            # Handle contractor name -> vendor_id mapping (NOI uses 'contractor' field)
            vendor_name = data.pop('contractor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Generate Reference No automatically if not provided
            if not data.get('referenceNo'):
                data['referenceNo'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'NOI'
                )

            # Set default status
            if not data.get('status'):
                data['status'] = "Draft"

            # Validate itpNo exists
            if data.get('itpNo'):
                validators.validate_itp_reference(self.repo.db, data['itpNo'])

            # Create NOI object
            db_noi = models.NOI(**data)
            if not db_noi.id:
                db_noi.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_noi)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "NOI", created.id, created.referenceNo,
                new_value=noi_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating NOI: {e}", exc_info=True)
            raise e

    def update_noi(self, noi_id: str, noi_update: schemas.NOIUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.NOI]:
        """
        Update an existing NOI with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Maps contractor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Args:
            noi_id: NOI identifier
            noi_update: NOI update schema
            user_id: ID of user updating the NOI
            username: Username of user updating the NOI

        Returns:
            Updated NOI object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_noi = self.repo.get_by_id(noi_id)
            if not db_noi:
                return None

            # Workflow validation: Check status transition
            if noi_update.status and not WorkflowEngine.validate_transition(
                "NOI", db_noi.status, noi_update.status
            ):
                raise ValueError(error_messages.invalid_status_transition("NOI", db_noi.status, noi_update.status))

            # Capture old values for audit
            old_val = {c.name: getattr(db_noi, c.name) for c in db_noi.__table__.columns}

            # Prepare update data
            d = noi_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['attachments'])

            # Handle contractor name -> vendor_id mapping
            if 'contractor' in d:
                vendor_name = d.pop('contractor')
                new_vendor_id = _resolve_vendor_id(self.repo.db, vendor_name)
                
                # Determine if reference number needs regeneration
                regenerate = False
                if new_vendor_id and new_vendor_id != db_noi.vendor_id:
                    regenerate = True
                elif new_vendor_id and db_noi.referenceNo:
                    # Check if vendor abbreviation changed (e.g., vendor was renamed but ID remains the same)
                    from core.utils import get_contractor_abbreviation
                    from models import DocumentNamingRule
                    from core.config import settings
                    
                    vendor_abbrev = get_contractor_abbreviation(self.repo.db, vendor_name)
                    rule = self.repo.db.query(DocumentNamingRule).filter(
                        DocumentNamingRule.doc_type == 'noi'
                    ).first()
                    
                    if rule and rule.prefix:
                        expected_prefix = rule.prefix.replace('[ABBREV]', vendor_abbrev)
                    else:
                        project_code = getattr(settings, 'PROJECT_CODE', 'QTS')
                        expected_prefix = f"{project_code}-{vendor_abbrev}-NOI-"
                        
                    if not db_noi.referenceNo.startswith(expected_prefix):
                        regenerate = True

                if regenerate:
                    from core.utils import generate_reference_no
                    d['referenceNo'] = generate_reference_no(self.repo.db, vendor_name, 'NOI')
                
                d['vendor_id'] = new_vendor_id

            # Validate itpNo exists if being updated
            if 'itpNo' in d and d['itpNo']:
                itp = self.repo.db.query(models.ITP).filter(
                    models.ITP.referenceNo == d['itpNo']
                ).first()
                if not itp:
                    raise ValueError(error_messages.reference_not_found("ITP", "reference number", d['itpNo']))

            # 勾稽鎖定：關閉 NOI 前確認其下所有 ITR 已完結（Approved 或 Void）
            new_status = d.get('status') or (noi_update.status if noi_update.status else None)
            if new_status == 'Closed' and db_noi.referenceNo:
                open_itr_count = self.repo.db.query(models.ITR).filter(
                    models.ITR.noiNumber == db_noi.referenceNo,
                    models.ITR.status.notin_(['Approved', 'Void'])
                ).count()
                if open_itr_count > 0:
                    raise ValueError(
                        f"Cannot close NOI '{db_noi.referenceNo}': "
                        f"{open_itr_count} ITR(s) still in progress. "
                        f"Please ensure all linked ITRs are Approved or Void first."
                    )

            # Update the record
            updated = self.repo.update(db_noi, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "NOI", noi_id, updated.referenceNo,
                old_value=old_val, new_value=noi_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating NOI {noi_id}: {e}", exc_info=True)
            raise e

    def delete_noi(self, noi_id: str, user_id: int = None, username: str = None) -> bool:
        """
        Delete a NOI with audit logging

        Args:
            noi_id: NOI identifier
            user_id: ID of user deleting the NOI
            username: Username of user deleting the NOI

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_noi = self.repo.get_by_id(noi_id)
            if not db_noi:
                return False

            # Check for references before deletion
            validators.check_noi_references(self.repo.db, db_noi.referenceNo)

            # Capture old values for audit
            old_val = {c.name: getattr(db_noi, c.name) for c in db_noi.__table__.columns}

            # Delete the record
            self.repo.delete(db_noi)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "NOI", noi_id, db_noi.referenceNo,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting NOI {noi_id}: {e}", exc_info=True)
            raise e
