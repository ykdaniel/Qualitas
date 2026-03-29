"""
FollowUp Service

Business logic layer for FollowUp module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.followup_repository import FollowUpRepository
from core.utils import (
    _resolve_vendor_id,
    generate_reference_no,
    log_audit
)
from core import validators

logger = logging.getLogger(__name__)


class FollowUpService:
    """Service layer for FollowUp business logic"""

    def __init__(self, repo: FollowUpRepository):
        self.repo = repo

    def get_followups(self, skip: int = 0, limit: int = 500, **filters) -> List[models.FollowUp]:
        """Get list of FollowUp records with optional filters"""
        return self.repo.get_all(skip, limit, **filters)

    def get_followup(self, followup_id: str) -> Optional[models.FollowUp]:
        """Get a single FollowUp by ID"""
        return self.repo.get_by_id(followup_id)

    def create_followup(self, followup_create: schemas.FollowUpCreate,
                        user_id: int = None, username: str = None) -> models.FollowUp:
        """Create a new FollowUp with business logic validation"""
        try:
            data = followup_create.dict()

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate source reference exists if provided
            validators.validate_followup_source_reference(
                self.repo.db,
                data.get('sourceModule'),
                data.get('sourceReferenceNo')
            )

            if not data.get('issueNo'):
                data['issueNo'] = generate_reference_no(
                    self.repo.db, vendor_name or data.get('assignedTo', ''), 'followup'
                )

            db_followup = models.FollowUp(**data)
            if not db_followup.id:
                db_followup.id = str(uuid.uuid4())

            created = self.repo.create(db_followup)

            log_audit(
                self.repo.db, "CREATE", "FollowUp", created.id, created.issueNo,
                new_value=followup_create.dict(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating FollowUp: {e}", exc_info=True)
            raise e

    def update_followup(self, followup_id: str, followup_update: schemas.FollowUpUpdate,
                        user_id: int = None, username: str = None) -> Optional[models.FollowUp]:
        """Update an existing FollowUp (no status validation)"""
        try:
            db_followup = self.repo.get_by_id(followup_id)
            if not db_followup:
                return None

            old_val = {c.name: getattr(db_followup, c.name) for c in db_followup.__table__.columns}
            data = followup_update.dict(exclude_unset=True)

            if 'vendor' in data:
                vendor_name = data.pop('vendor')
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # Validate source reference if being updated
            # Use updated values if provided, otherwise use existing values
            source_module = data.get('sourceModule', db_followup.sourceModule)
            source_ref_no = data.get('sourceReferenceNo', db_followup.sourceReferenceNo)
            validators.validate_followup_source_reference(
                self.repo.db,
                source_module,
                source_ref_no
            )

            updated = self.repo.update(db_followup, data)

            log_audit(
                self.repo.db, "UPDATE", "FollowUp", followup_id, updated.issueNo,
                old_value=old_val, new_value=followup_update.dict(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error updating FollowUp {followup_id}: {e}", exc_info=True)
            raise e

    def delete_followup(self, followup_id: str, user_id: int = None, username: str = None) -> bool:
        """Delete a FollowUp with audit logging"""
        try:
            db_followup = self.repo.get_by_id(followup_id)
            if not db_followup:
                return False

            old_val = {c.name: getattr(db_followup, c.name) for c in db_followup.__table__.columns}
            self.repo.delete(db_followup)

            log_audit(
                self.repo.db, "DELETE", "FollowUp", followup_id, db_followup.issueNo,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting FollowUp {followup_id}: {e}", exc_info=True)
            raise e
