"""
FollowUp Service

Business logic layer for FollowUp module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from core.assignees import validate_new_assignee
from core.refusals import Refusal
from repositories.followup_repository import FollowUpRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope, require_same_project

# source module → (model, number column), as core.validators.validate_followup_source_reference resolves it
_FOLLOWUP_SOURCES = {
    "NCR": (models.NCR, "documentNumber"), "NOI": (models.NOI, "referenceNo"), "ITR": (models.ITR, "documentNumber"),
    "ITP": (models.ITP, "referenceNo"), "OBS": (models.OBS, "documentNumber"), "PQP": (models.PQP, "pqpNo"),
    "FAT": (models.FAT, "equipment"), "AUDIT": (models.Audit, "auditNo"), "MEETING": (models.MeetingMinutes, "documentNumber"),
}
from core.utils import (
    _resolve_vendor_id,
    begin_write_transaction,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)
from core import validators

logger = logging.getLogger(__name__)


class FollowUpService:
    """Service layer for FollowUp business logic"""

    def __init__(self, repo: FollowUpRepository):
        self.repo = repo

    def get_followups(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.FollowUp]:
        """Get list of FollowUp records with optional filters"""
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_followup(self, followup_id: str, scope=None) -> Optional[models.FollowUp]:
        """Get a single FollowUp by ID"""
        obj = self.repo.get_by_id(followup_id)
        return obj if record_in_scope(obj, scope) else None

    def _require_same_project_source(self, source_module, source_ref_no, project_id) -> None:
        """A Follow-up's source document must belong to the Follow-up's project (G2, REF-PROJECT-SEQ-2026-001 B2)."""
        source = _FOLLOWUP_SOURCES.get((source_module or '').upper().strip())
        if source and source_ref_no:
            model, column = source
            linked = self.repo.db.query(model).filter(getattr(model, column) == source_ref_no).first()
            require_same_project(linked, project_id, source_module.upper().strip(), source_ref_no)

    def create_followup(self, followup_create: schemas.FollowUpCreate,
                        user_id: int = None, username: str = None, scope=None) -> models.FollowUp:
        """Create a new FollowUp with business logic validation"""
        try:
            data = followup_create.model_dump()

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)
            validate_new_assignee(self.repo.db, data, "assignedToUserId")

            # Validate source reference exists if provided
            validators.validate_followup_source_reference(
                self.repo.db,
                data.get('sourceModule'),
                data.get('sourceReferenceNo')
            )
            # the source document must belong to the same project (G2, REF-PROJECT-SEQ-2026-001 B2)
            self._require_same_project_source(data.get('sourceModule'), data.get('sourceReferenceNo'), data.get('project_id'))

            # take the write lock before the sequence is read, so two creates never get the same number (B3)
            begin_write_transaction(self.repo.db)
            if not data.get('issueNo'):
                data['issueNo'] = generate_reference_no(
                    self.repo.db, vendor_name or data.get('assignedTo', ''), 'followup', project_id=data.get('project_id')
                )

            db_followup = models.FollowUp(**data)
            if not db_followup.id:
                db_followup.id = str(uuid.uuid4())

            created = self.repo.create(db_followup)

            log_audit(
                self.repo.db, "CREATE", "FollowUp", created.id, created.issueNo,
                new_value=followup_create.model_dump(), user_id=user_id, username=username
            )
            # log_audit only db.add()s the row — repo.create() already
            # committed the FollowUp itself, but this trailing commit is
            # what actually persists the audit log entry (see the identical
            # bug found/fixed in meeting_minutes_service.py).
            self.repo.db.commit()

            return created
        except Exception as e:
            logger.error(f"Error creating FollowUp: {e}", exc_info=True)
            raise e

    def update_followup(self, followup_id: str, followup_update: schemas.FollowUpUpdate,
                        user_id: int = None, username: str = None, scope=None) -> Optional[models.FollowUp]:
        """Update an existing FollowUp with status transition validation"""
        try:
            db_followup = self.repo.get_by_id(followup_id)
            if not db_followup or not record_in_scope(db_followup, scope):
                return None

            # Workflow validation: Check status transition
            if followup_update.status and not WorkflowEngine.validate_transition(
                "FollowUp", db_followup.status, followup_update.status
            ):
                raise Refusal(
                    "INVALID_TRANSITION",
                    f"Invalid status transition from {db_followup.status} to {followup_update.status}",
                    docType="FollowUp", fromStatus=db_followup.status, toStatus=followup_update.status,
                )

            old_val = {c.name: getattr(db_followup, c.name) for c in db_followup.__table__.columns}
            data = followup_update.model_dump(exclude_unset=True)

            # Guard: a Closed FollowUp is a true dead end — WorkflowEngine's
            # FollowUp transitions (core/utils.py) define "Closed": [], no
            # reopen path exists at all (same shape as NOI/Audit). Safe to
            # lock unconditionally since there's no legitimate "reopen and
            # edit" flow to accidentally break.
            if db_followup.status == 'Closed':
                changed_fields = {
                    k for k, v in data.items() if v != old_val.get(k)
                }
                if changed_fields:
                    raise Refusal(
                        "RECORD_LOCKED",
                        f"Cannot modify a closed FollowUp '{db_followup.issueNo}' — "
                        f"no fields can be changed once it is closed.",
                        docType="FollowUp", number=db_followup.issueNo, status=db_followup.status, kind="record",
                    )

            if 'vendor' in data:
                vendor_name = data.pop('vendor')
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(data, scope)
            validate_new_assignee(self.repo.db, data, "assignedToUserId", db_followup.assignedToUserId)

            # Validate source reference if being updated
            # Use updated values if provided, otherwise use existing values
            source_module = data.get('sourceModule', db_followup.sourceModule)
            source_ref_no = data.get('sourceReferenceNo', db_followup.sourceReferenceNo)
            validators.validate_followup_source_reference(
                self.repo.db,
                source_module,
                source_ref_no
            )
            if (source_module, source_ref_no) != (db_followup.sourceModule, db_followup.sourceReferenceNo):
                self._require_same_project_source(source_module, source_ref_no,
                                                  data.get('project_id') or db_followup.project_id)   # G2 (B2 R1)

            updated = self.repo.update(db_followup, data)

            log_audit(
                self.repo.db, "UPDATE", "FollowUp", followup_id, updated.issueNo,
                old_value=old_val, new_value=followup_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )
            self.repo.db.commit()

            return updated
        except Exception as e:
            logger.error(f"Error updating FollowUp {followup_id}: {e}", exc_info=True)
            raise e

    def delete_followup(self, followup_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete a FollowUp with audit logging"""
        try:
            db_followup = self.repo.get_by_id(followup_id)
            if not db_followup or not record_in_scope(db_followup, scope):
                return False

            # Only Void FollowUps can be deleted — same precedent as
            # NCR/Audit. A Closed FollowUp is an unconditional dead end for
            # edits (see update_followup above); deleting it outright would
            # let that lock be bypassed entirely by removing the record
            # instead of changing it.
            if db_followup.status != 'Void':
                raise Refusal(
                    'DELETE_NOT_VOID',
                    f"Cannot delete FollowUp '{db_followup.issueNo}' with status "
                    f"'{db_followup.status}'. Please Void it first, then delete.",
                    docType='FollowUp', number=db_followup.issueNo, status=db_followup.status, allowed=['Void'],
                )

            old_val = {c.name: getattr(db_followup, c.name) for c in db_followup.__table__.columns}
            self.repo.delete(db_followup)

            log_audit(
                self.repo.db, "DELETE", "FollowUp", followup_id, db_followup.issueNo,
                old_value=old_val, user_id=user_id, username=username
            )
            self.repo.db.commit()

            return True
        except Exception as e:
            logger.error(f"Error deleting FollowUp {followup_id}: {e}", exc_info=True)
            raise e
