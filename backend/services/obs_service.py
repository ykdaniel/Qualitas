"""
OBS (Observation) Service

Business logic layer for OBS module
"""

import json
import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.obs_repository import OBSRepository
from core import strict_dates
from core.attachment_access import obs_locked
from core.refusals import Refusal
from core.concurrency import claim_row_version
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    begin_write_transaction,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)

# Engineer closure sign-off identity (2026-10-05, BACKLOG #20): the two
# `...ApprovedBy` fields used to be a free-pick dropdown over every IAM user —
# anyone with OBS_UPDATE could stamp any name as having approved. ApprovedBy is
# now server-derived from the authenticated caller only, mirroring ITR's
# `approvedBy` (itr_service.py::_require_approver) — the client's own value for
# these two fields is never trusted, whether or not an approval is in flight.
_ENGINEER_APPROVAL_FIELDS = (
    ('qualityEngineerApproval', 'qualityEngineerApprovalBy'),
    ('constructionEngineerApproval', 'constructionEngineerApprovalBy'),
)


def _approver_label(approver: models.User) -> str:
    """Same "Name / Company" shape the frontend's formatUserLabel() writes,
    so existing stored values and newly server-derived ones stay consistent."""
    name = approver.full_name or approver.username
    return f"{name} / {approver.display_company}" if approver.display_company else name


def _apply_engineer_approval_identity(d: dict, db, user_id, current_values: dict) -> None:
    """Mutates `d` in place: strips any client-submitted `...ApprovedBy`, then
    sets it from the authenticated caller for whichever engineer field is newly
    transitioning to 'Approved' in this write. `current_values` maps each
    approval field name to its value before this write (None for a brand-new
    record)."""
    approver = None
    for approval_field, by_field in _ENGINEER_APPROVAL_FIELDS:
        d.pop(by_field, None)
        entering_approved = (
            d.get(approval_field) == 'Approved'
            and current_values.get(approval_field) != 'Approved'
        )
        if not entering_approved:
            continue
        if approver is None:
            approver = db.query(models.User).filter(models.User.id == user_id).first() if user_id is not None else None
            if approver is None or not approver.is_active:
                raise ValueError("Cannot approve without an authenticated, active user.")
        d[by_field] = _approver_label(approver)


# The record's own photo / attachment fields: locked while the STORED status is Closed or Void (obs_locked), except a
# save that reopens a Closed OBS (Void has no way out) — the same records whose files /api/files refuses to change.
_OBS_ATTACHMENT_FIELDS = ('defectPhotos', 'improvementPhotos', 'attachments', 'photoOrder')


class OBSAttachmentsLocked(Refusal):
    """A change to the photos / attachments of a Closed or Void OBS (its JSON photo fields, attachments or photoOrder).
    The router answers 409 ATTACHMENT_LOCKED with the same text and record-lock params as core.attachment_access.lock_refusal."""

    def __init__(self, status: str, fields=()):
        super().__init__("ATTACHMENT_LOCKED", f"Cannot change attachments of a {status} OBS: the record is locked.",
                         kind="record", docType="OBS", status=status)
        self.status = status
        self.fields = sorted(fields)


def _normalized_photo_order(value):
    """photoOrder for comparison: stored JSON text or the parsed dict -> dict without empty lists, or None."""
    parsed = schemas.parse_obs_photo_order(value, strict=False)
    cleaned = {k: v for k, v in (parsed or {}).items() if v}
    return cleaned or None


def _normalized_file_list(value):
    """A JSON list field (defectPhotos / improvementPhotos / attachments) for comparison: the stored text or the sent
    value as data; NULL, "" and [] are all "no files". Unparseable stored text compares as itself."""
    if isinstance(value, str):
        if value.strip() == "":
            return []
        try:
            value = json.loads(value)
        except ValueError:
            return value
    return value if value else []


def _attachment_fields_changed(d: dict, db_obs) -> set:
    changed = set()
    for f in _OBS_ATTACHMENT_FIELDS:
        if f not in d:
            continue
        normalize = _normalized_photo_order if f == 'photoOrder' else _normalized_file_list
        if normalize(d[f]) != normalize(getattr(db_obs, f, None)):
            changed.add(f)
    return changed


class OBSService:
    """Service layer for OBS business logic"""

    def __init__(self, repo: OBSRepository):
        self.repo = repo

    def get_obss(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.OBS]:
        """Get list of OBS records with optional filters"""
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_obs(self, obs_id: str, scope=None) -> Optional[models.OBS]:
        """Get a single OBS by ID"""
        obj = self.repo.get_by_id(obs_id)
        return obj if record_in_scope(obj, scope) else None

    def create_obs(self, obs_create: schemas.OBSCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.OBS:
        """Create a new OBS with business logic validation"""
        try:
            data = _json_serialize(
                obs_create.model_dump(),
                ['defectPhotos', 'improvementPhotos', 'attachments', 'photoOrder']
            )

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # A brand-new OBS has no legitimate way to arrive already Approved via
            # the form (both engineer fields default to Pending) — rather than
            # risk an unhandled 500 from _apply_engineer_approval_identity's
            # "no authenticated approver" ValueError (this router doesn't map
            # ValueError -> 400 the way update_obs's does), simply refuse to let
            # the client set either ApprovedBy field at creation time at all.
            for _, by_field in _ENGINEER_APPROVAL_FIELDS:
                data.pop(by_field, None)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            # final content validated before a reference number is taken or anything is written (2026-09-20)
            strict_dates.validate_date_write(data, strict_dates.OBS_DATE_FIELDS)

            begin_write_transaction(self.repo.db)

            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'OBS', project_id=data.get('project_id')
                )

            db_obs = models.OBS(**data)
            if not db_obs.id:
                db_obs.id = str(uuid.uuid4())

            created = self.repo.create(db_obs, commit=False)

            log_audit(
                self.repo.db, "CREATE", "OBS", created.id, created.documentNumber,
                new_value=obs_create.model_dump(), user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return created
        except strict_dates.DateValidationError:
            self.repo.db.rollback()
            raise                                   # an expected refusal (422), nothing was written — not an error to log
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating OBS: {e}", exc_info=True)
            raise e

    def update_obs(self, obs_id: str, obs_update: schemas.OBSUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.OBS]:
        """Update an existing OBS with validation"""
        try:
            db_obs = self.repo.get_by_id(obs_id)
            if not db_obs or not record_in_scope(db_obs, scope):
                return None

            # Optimistic lock (OPTIMISTIC-LOCK-2026-001): the version this edit was read at, checked and incremented in one
            # step (it also takes the write lock), then re-read.
            claim_row_version(self.repo.db, db_obs, obs_update.row_version, doc_type="OBS",
                              number=db_obs.documentNumber, refresh=True)

            if obs_update.status and not WorkflowEngine.validate_transition(
                "OBS", db_obs.status, obs_update.status
            ):
                raise Refusal(
                    "INVALID_TRANSITION",
                    f"Invalid status transition from {db_obs.status} to {obs_update.status}",
                    docType="OBS", fromStatus=db_obs.status, toStatus=obs_update.status,
                )

            old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
            d = obs_update.model_dump(exclude_unset=True)
            if 'status' in d and d['status'] is None:
                d.pop('status')                     # blank / null status = not changed (OBSUpdate normalises "" to None)
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments', 'photoOrder'])

            # Guard: once Closed, the observation's actual substance — the
            # improvement action taken and its before/after photo evidence —
            # is locked against tampering, mirroring NCR's
            # _LOCKED_QUALITY_FIELDS pattern (ncr_service.py). Unlike NOI,
            # WorkflowEngine's OBS transitions (core/utils.py) define
            # "Closed": ["Open", "Void"] — a real reopen path — so this can't
            # be an unconditional whole-record lock like NOI's. The escape
            # hatch here is simpler than NCR's: OBS already has a real
            # Closed->Open transition, so a save that explicitly reopens the
            # record (changes status away from Closed) is exempted outright,
            # rather than needing NCR's narrow single-field carve-out.
            # The photo / attachment fields (defectPhotos, improvementPhotos, attachments, photoOrder) are checked below
            # with the Closed / Void record lock; productDisposition keeps this Closed-only rule.
            _LOCKED_OBS_FIELDS = {'productDisposition'}
            is_already_closed = db_obs.status == 'Closed'
            is_reopening = is_already_closed and d.get('status') not in (None, 'Closed')

            # Photos and attachments (OBS-PRINT-PHOTOS-2026-001): locked while the STORED status is Closed or Void
            # (obs_locked), except a save that reopens a Closed OBS to an unlocked status (Open / In Progress / Resolved).
            # Closed -> Void is NOT such a reopen: voiding must not change the evidence on the way. Compared as data, so
            # re-sending the stored values unchanged (the form sends the whole record) is not a change.
            reopens_files = is_reopening and not obs_locked(d.get('status'))
            if obs_locked(db_obs.status) and not reopens_files:
                changed_files = _attachment_fields_changed(d, db_obs)
                if changed_files:
                    raise OBSAttachmentsLocked(db_obs.status, changed_files)

            if is_already_closed and not is_reopening:
                changed_locked = {
                    f for f in (_LOCKED_OBS_FIELDS & set(d.keys()))
                    if d[f] != getattr(db_obs, f, None)
                }
                if changed_locked:
                    raise Refusal("RECORD_LOCKED", "Cannot modify improvement/photo evidence on a Closed observation",
                                  docType="OBS", number=db_obs.documentNumber, status=db_obs.status, kind="evidence")

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            _apply_engineer_approval_identity(
                d, self.repo.db, user_id,
                current_values={f: getattr(db_obs, f, None) for f, _ in _ENGINEER_APPROVAL_FIELDS},
            )

            enforce_update_scope(d, scope)

            # Date rules on the merged final content, BEFORE the write (2026-09-20). OBS used to have NO date validation on
            # update: a bad value was saved, then the response failed with 500 and the whole list stopped loading. A value
            # re-sent unchanged (historical data) is not a new write; OBS has no order rules (unchanged).
            strict_dates.validate_date_write(
                {f: d[f] if f in d else getattr(db_obs, f, None) for f in strict_dates.OBS_DATE_FIELDS},
                strict_dates.OBS_DATE_FIELDS,
                stored={f: getattr(db_obs, f, None) for f in strict_dates.OBS_DATE_FIELDS},
                provided=set(d) & set(strict_dates.OBS_DATE_FIELDS),
            )

            updated = self.repo.update(db_obs, d, commit=False)

            log_audit(
                self.repo.db, "UPDATE", "OBS", obs_id, updated.documentNumber,
                old_value=old_val, new_value=obs_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return updated
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating OBS {obs_id}: {e}", exc_info=True)
            raise e

    def delete_obs(self, obs_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete an OBS with audit logging"""
        try:
            db_obs = self.repo.get_by_id(obs_id)
            if not db_obs or not record_in_scope(db_obs, scope):
                return False

            old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
            self.repo.delete(db_obs, commit=False)

            log_audit(
                self.repo.db, "DELETE", "OBS", obs_id, db_obs.documentNumber,
                old_value=old_val, user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting OBS {obs_id}: {e}", exc_info=True)
            raise e
