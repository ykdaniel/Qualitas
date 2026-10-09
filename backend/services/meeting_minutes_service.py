"""
Meeting Minutes Service

Business logic layer for the Meeting Minutes module
"""

import re
import uuid
import logging
from datetime import datetime
from typing import List, Optional

from sqlalchemy.exc import IntegrityError

import models
import schemas
from repositories.meeting_minutes_repository import MeetingMinutesRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    reclaim_reference_no,
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
            # First occurrence of a series starts at "1.0" (BACKLOG #18) —
            # create_new_occurrence bumps this for subsequent ones.
            if not data.get('rev'):
                data['rev'] = '1.0'

            db_meeting = models.MeetingMinutes(**data)
            if not db_meeting.id:
                db_meeting.id = str(uuid.uuid4())

            created = self.repo.create(db_meeting)

            log_audit(
                self.repo.db, "CREATE", "MeetingMinutes", created.id, created.documentNumber,
                new_value=meeting_create.model_dump(), user_id=user_id, username=username
            )
            # repo.create() already committed the row itself, but that
            # happened BEFORE log_audit added its row — without a commit
            # here, the audit entry silently rolls back when the session
            # closes (confirmed empirically: audit_logs was completely
            # empty for MeetingMinutes despite extensive testing).
            self.repo.db.commit()

            return created
        except Exception as e:
            logger.error(f"Error creating Meeting Minutes: {e}", exc_info=True)
            raise e

    def create_new_occurrence(self, meeting_id: str, user_id: int = None,
                              username: str = None, scope=None) -> Optional[models.MeetingMinutes]:
        """
        Create the next occurrence of a recurring meeting series (BACKLOG
        #18) — reuses the source row's documentNumber (the whole series
        shares one document number for its lifetime) and bumps rev
        ("1.0" -> "2.0" -> ...); carries forward vendor/project/meetingType/
        organizer/location/attendees so the common case (same people, same
        format, different week) doesn't need retyping. discussionLog is
        deliberately NOT carried forward (fresh agenda every occurrence),
        and meetingDate is deliberately left blank (not defaulted to
        today) — the user fills in the actual date.

        Unlike ITR's create_reinspection / create_ncr_from_itr (which mint
        a brand-new documentNumber for a DIFFERENT module and link back via
        FK), this is deliberately a same-series, same-number derivation —
        see the unique-index migration in db_migrations.py that makes this
        legal (composite UNIQUE(documentNumber, rev) instead of a bare
        UNIQUE(documentNumber)).
        """
        try:
            source = self.repo.get_by_id(meeting_id)
            if not source or not record_in_scope(source, scope):
                return None

            siblings = self.repo.get_all_by_document_number(source.documentNumber)
            max_n = 0
            for s in siblings:
                try:
                    max_n = max(max_n, int(float(s.rev or 0)))
                except (TypeError, ValueError):
                    continue
            next_rev = f"{max_n + 1}.0"

            today = datetime.now().strftime('%Y-%m-%d')
            # Strip a trailing " - YYYY-MM-DD" this same flow would have
            # appended on a prior occurrence, so chained occurrences don't
            # accumulate multiple dates in the title over time.
            base_title = re.sub(r'\s*[-–]\s*\d{4}-\d{2}-\d{2}\s*$', '', (source.title or '').strip())
            new_title = f"{base_title} - {today}" if base_title else today

            new_meeting = models.MeetingMinutes(
                id=str(uuid.uuid4()),
                project_id=source.project_id,
                vendor_id=source.vendor_id,
                documentNumber=source.documentNumber,  # shared, not regenerated
                rev=next_rev,
                status="Draft",
                title=new_title,
                meetingType=source.meetingType,
                meetingDate=None,
                meetingTime=None,
                location=source.location,
                organizer=source.organizer,
                attendees=source.attendees,  # already a JSON string column — plain copy
                discussionLog=None,
                attachments=None,
                createdAt=datetime.now().isoformat(),
                updatedAt=datetime.now().isoformat(),
            )
            # No enforce_create_scope() call needed: every field above is
            # inherited straight from `source`, which record_in_scope()
            # already confirmed is within the caller's scope.

            self.repo.db.add(new_meeting)
            try:
                self.repo.db.commit()
            except IntegrityError:
                self.repo.db.rollback()
                raise ValueError(
                    "Another occurrence was just created for this series — please retry."
                )
            self.repo.db.refresh(new_meeting)

            log_audit(
                self.repo.db, "CREATE", "MeetingMinutes", new_meeting.id, new_meeting.documentNumber,
                new_value={"source": "NEW_OCCURRENCE", "sourceMeetingId": meeting_id, "rev": next_rev},
                user_id=user_id, username=username
            )
            log_audit(
                self.repo.db, "CREATE_OCCURRENCE", "MeetingMinutes", meeting_id, source.documentNumber,
                new_value={"newMeetingId": new_meeting.id, "newRev": next_rev},
                user_id=user_id, username=username
            )
            # See create_meeting_minutes' comment: log_audit only add()s,
            # nothing commits it otherwise — same fix applied here from the
            # start rather than repeating today's earlier bug.
            self.repo.db.commit()

            return new_meeting
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error creating new occurrence from Meeting Minutes {meeting_id}: {e}", exc_info=True)
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

            # Guard: Published and Void meeting minutes are locked — a
            # distributed/voided meeting record must not be silently
            # rewritten after the fact. The one carve-out: a Published
            # record may still transition to Void (status field only,
            # nothing else in the same request) — WorkflowEngine's
            # validate_transition above already rejects any other status
            # change from Published, so this only needs to permit that one
            # legal case. Compare against the DB's current values, not mere
            # key-presence, since the frontend resends the whole record on
            # every save.
            if db_meeting.status in ('Published', 'Void'):
                voiding = db_meeting.status == 'Published' and meeting_update.status == 'Void'
                changed_fields = {f for f in d if d[f] != old_val.get(f)}
                disallowed = changed_fields - ({'status'} if voiding else set())
                if disallowed:
                    raise ValueError(
                        f"Cannot modify meeting minute '{db_meeting.documentNumber}' "
                        f"(status: {db_meeting.status})."
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
            # See create_meeting_minutes' comment — log_audit needs a
            # commit after it, repo.update()'s own commit happened too
            # early to cover it.
            self.repo.db.commit()

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

            # Void records can always be deleted (mirrors ncr_service.py's
            # delete_ncr guard) — voiding first keeps a *published* record's
            # number visible for audit purposes instead of it silently
            # vanishing. Draft is the one exception: it was never published,
            # so nobody could have referenced its number externally — direct
            # delete is allowed, and its number is best-effort reclaimed
            # (see reclaim_reference_no) so it doesn't leave an unexplained
            # gap the way a published-then-voided record's number does.
            if db_meeting.status not in ('Void', 'Draft'):
                raise ValueError(
                    f"Cannot delete Meeting Minutes '{db_meeting.documentNumber}' "
                    f"with status '{db_meeting.status}'. Please Void it first, then delete."
                )

            is_draft = db_meeting.status == 'Draft'
            vendor_name = db_meeting.vendor or ''

            old_val = {c.name: getattr(db_meeting, c.name) for c in db_meeting.__table__.columns}
            self.repo.delete(db_meeting)

            if is_draft:
                # Must run AFTER the delete (repo.delete commits) so the
                # table scan inside reclaim_reference_no correctly excludes
                # the row that was just removed — see its docstring for why
                # this resyncs to the actual remaining max rather than a
                # naive decrement.
                reclaim_reference_no(self.repo.db, vendor_name, 'meeting')

            log_audit(
                self.repo.db, "DELETE", "MeetingMinutes", meeting_id, db_meeting.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )
            # reclaim_reference_no only flush()es (it shares the sequence
            # lock/pattern with generate_reference_no, which also only
            # flushes — callers there rely on a LATER repo.create/update
            # commit to persist it) and log_audit only db.add()s ("commit
            # is handled externally" — see its docstring). self.repo.delete()
            # above already committed the row deletion itself, but that
            # commit happened BEFORE these two calls, so nothing has
            # persisted them yet — without this, both silently roll back
            # when the request's session closes.
            self.repo.db.commit()

            return True
        except Exception as e:
            logger.error(f"Error deleting Meeting Minutes {meeting_id}: {e}", exc_info=True)
            raise e
