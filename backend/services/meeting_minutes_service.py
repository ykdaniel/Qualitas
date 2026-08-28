"""
Meeting Minutes Service

Business logic layer for the Meeting Minutes module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.meeting_minutes_repository import MeetingMinutesRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class MeetingMinutesService:
    """Service layer for Meeting Minutes business logic"""

    def __init__(self, repo: MeetingMinutesRepository):
        self.repo = repo

    def get_meeting_minutes_list(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.MeetingMinutes]:
        """Get list of Meeting Minutes records with optional filters"""
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_meeting_minutes(self, meeting_id: str, scope=None) -> Optional[models.MeetingMinutes]:
        """Get a single Meeting Minutes record by ID"""
        obj = self.repo.get_by_id(meeting_id)
        return obj if record_in_scope(obj, scope) else None

    def create_meeting_minutes(self, meeting_create: schemas.MeetingMinutesCreate,
                               user_id: int = None, username: str = None, scope=None) -> models.MeetingMinutes:
        """Create a new Meeting Minutes record"""
        try:
            data = _json_serialize(
                meeting_create.model_dump(),
                ['attendees', 'discussionLog', 'attachments']
            )

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'meeting'
                )

            db_meeting = models.MeetingMinutes(**data)
            if not db_meeting.id:
                db_meeting.id = str(uuid.uuid4())

            created = self.repo.create(db_meeting)

            log_audit(
                self.repo.db, "CREATE", "MeetingMinutes", created.id, created.documentNumber,
                new_value=meeting_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating Meeting Minutes: {e}", exc_info=True)
            raise e

    def update_meeting_minutes(self, meeting_id: str, meeting_update: schemas.MeetingMinutesUpdate,
                               user_id: int = None, username: str = None, scope=None) -> Optional[models.MeetingMinutes]:
        """Update an existing Meeting Minutes record"""
        try:
            db_meeting = self.repo.get_by_id(meeting_id)
            if not db_meeting or not record_in_scope(db_meeting, scope):
                return None

            if meeting_update.status and not WorkflowEngine.validate_transition(
                "MeetingMinutes", db_meeting.status, meeting_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_meeting.status} to {meeting_update.status}"
                )

            old_val = {c.name: getattr(db_meeting, c.name) for c in db_meeting.__table__.columns}
            d = meeting_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['attendees', 'discussionLog', 'attachments'])

            # Guard: a Published meeting minute is a true dead end —
            # WorkflowEngine's MeetingMinutes transitions (core/utils.py)
            # define "Published": [], no reopen path exists at all (same
            # shape as NOI's Closed state). Safe to lock unconditionally
            # (no permission escape hatch) since a distributed meeting
            # record must not be silently rewritten after the fact.
            # Compare against the DB's current values, not mere
            # key-presence, since the frontend resends the whole record on
            # every save.
            if db_meeting.status == 'Published':
                changed_fields = {f for f in d if d[f] != old_val.get(f)}
                if changed_fields:
                    raise ValueError(
                        f"Cannot modify a published meeting minute '{db_meeting.documentNumber}' — "
                        f"no fields can be changed once it has been published."
                    )

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            updated = self.repo.update(db_meeting, d)

            log_audit(
                self.repo.db, "UPDATE", "MeetingMinutes", meeting_id, updated.documentNumber,
                old_value=old_val, new_value=meeting_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating Meeting Minutes {meeting_id}: {e}", exc_info=True)
            raise e

    def delete_meeting_minutes(self, meeting_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete a Meeting Minutes record"""
        try:
            db_meeting = self.repo.get_by_id(meeting_id)
            if not db_meeting or not record_in_scope(db_meeting, scope):
                return False

            old_val = {c.name: getattr(db_meeting, c.name) for c in db_meeting.__table__.columns}
            self.repo.delete(db_meeting)

            log_audit(
                self.repo.db, "DELETE", "MeetingMinutes", meeting_id, db_meeting.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting Meeting Minutes {meeting_id}: {e}", exc_info=True)
            raise e
