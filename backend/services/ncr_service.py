"""
NCR (Non-Conformance Report) Service

Business logic layer for NCR module
"""

import json
import uuid
import logging
from datetime import datetime, timedelta
from typing import List, Optional

import models
import schemas
from core.assignees import validate_new_assignee
from mail_service import send_ncr_rejection_notification
from repositories.ncr_repository import NCRRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core import strict_dates
from core.perms import NCR_CLOSE
from core.ncr_photo_evidence import ncr_photo_evidence, photo_list
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    begin_write_transaction,
    lock_ncr_for_write,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class NCRCloseNotPermitted(Exception):
    """Closing an NCR needs ncr:close:all on top of ncr:update:all (2026-09-21). Not a ValueError on purpose: the router answers 403, not 400."""

    def __init__(self):
        super().__init__(f"Operation not permitted. Required: {NCR_CLOSE}")


def _may_close(permissions) -> bool:
    """`permissions` = the caller's permission codes, passed in by the router. Missing means NO permission: a caller that forgets to pass
    them can never close an NCR by accident."""
    return NCR_CLOSE in (permissions or ())

# NCR severity → default SLA days from raiseDate to dueDate (BACKLOG #13 #1).
# TODO(#13): promote to a global configurable setting (KPIWeight-style) so the
# PQM can tune per project/contract — currently fixed defaults.
NCR_SLA_DAYS = {"Major": 7, "Minor": 14}


def _add_days(date_str: str, days: int) -> str:
    """Add `days` to a YYYY-MM-DD date string, returning YYYY-MM-DD."""
    base = datetime.strptime(date_str[:10], "%Y-%m-%d")
    return (base + timedelta(days=days)).strftime("%Y-%m-%d")


# Photo / attachment columns may hold INLINE file content (legacy base64 strings). An audit entry records THAT they changed and how many items
# they hold — never the content itself.
_AUDIT_CONTENT_FIELDS = ('defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments')


def _audit_scalar(field, value):
    if field in _AUDIT_CONTENT_FIELDS:
        return {'items': len(_photo_list(value)), 'content': 'not recorded'}
    return value


def _row_values(obj) -> dict:
    """Every column of the row as it is NOW (after a flush/refresh), by name."""
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


# The fields the closure conditions read. Shared by create and update so that both judge exactly the same thing.
CLOSURE_FIELDS = ('productDisposition', 'repairMethodStatement', 'repairMethodStatementStatus', 'reInspectionNumber', 'drawingNo', 'specNo',
                  'qtyAffected', 'extent', 'recurrence', 'recurrenceRef', 'effectivenessVerified', 'ownerApproval')


_photo_list = photo_list                       # the legacy improvementPhotos column, JSON string or list (shared with the Q-Workflow tracker)


def improvement_photo_evidence(db, ncr_id: str):
    """The improvement photos of THIS NCR that the SERVER can confirm (2026-09-21): (usable_count, problems).

    The photo condition itself — attachment row of this NCR, category improvementPhoto, not deleted, file present under the upload root with an image
    FILE HEADER — lives in core/ncr_photo_evidence.py, shared with the Q-Workflow tracker. `problems` lists, for the refusal message, the rows that
    exist but cannot be used. Read-only."""
    ev = ncr_photo_evidence(db, [ncr_id])[ncr_id]
    return ev.usable, list(ev.problems)


def assert_closure_conditions(final, photos, *, photos_on_saved_record: bool = True) -> None:
    """THE closure conditions of an NCR — the single copy, used when an existing NCR enters Closed (update) and when one is created as Closed.
    `final` is the FINAL content (stored row merged with the request, or the create body with its defaults); raises ValueError (-> 400).

    Kept in lockstep with the frontend's zod superRefine gate (ncrFormSchema.ts) — the two used to disagree (this gate required
    repairMethodStatement unconditionally while the frontend only required it for "Repair", and didn't check drawingNo/specNo/qtyAffected/extent
    at all here or improvementPhotos there), so a save that passed frontend validation could still 400 here for a field the user was never told
    was required, or the reverse.

    `photos` = (usable_count, problems) from improvement_photo_evidence — the photos the server confirmed for this NCR. The NCR's own
    `improvementPhotos` column (legacy path strings) is NOT evidence and never consulted here.

    `photos_on_saved_record=False` (a CREATE): improvement photos are evidence attached to the saved NCR (attachments hang off its id), and a
    record that does not exist yet has none — so nothing in the request can count, whatever paths it lists (they could point at anything, or at
    another record's files). An NCR therefore cannot be born Closed: create it, attach the photos, then close it."""
    final_disposition = final.get('productDisposition')
    missing = []
    if not final_disposition:
        missing.append('productDisposition (產品處置)')
    # repairMethodStatement is only required for "Repair" — matches the frontend's repairStar / repairNeedsMethod coupling. A TBC/NA status
    # counts as "addressed" here too, same as the frontend gate (BACKLOG item 6) — it's an explicit answer, not a blank field.
    if final_disposition == 'Repair':
        final_repair = final.get('repairMethodStatement')
        final_repair_status = final.get('repairMethodStatementStatus')
        if (not final_repair or not str(final_repair).strip()) and not final_repair_status:
            missing.append('repairMethodStatement (改善方案)')
    for field, label in (('reInspectionNumber', '複檢編號'), ('drawingNo', '圖號'), ('specNo', '規範號'), ('qtyAffected', '受影響數量'), ('extent', '範圍')):
        value = final.get(field)
        if not value or not str(value).strip():
            missing.append(f'{field} ({label})')
    usable, photo_problems = photos if photos_on_saved_record else (0, [])
    if usable < 1:
        missing.append('improvementPhotos (改善照片)')
    # recurrence='Yes' claims this NCR is a repeat of a prior one — require the trace link so that claim is actually verifiable
    # (matches the frontend's recurrenceNeedsRef check).
    if final.get('recurrence') == 'Yes' and (not final.get('recurrenceRef') or not str(final.get('recurrenceRef')).strip()):
        missing.append('recurrenceRef (關聯前次 NCR)')

    if missing:
        if not photos_on_saved_record:
            hint = ' — improvement photos must be attached to the saved NCR, so an NCR cannot be created directly as Closed: create it first, then close it'
        elif usable < 1:
            hint = (' — add at least one improvement photo (image file) to this NCR: save the NCR, upload the photo in the 改善照片 section, then close it'
                    + (f'. Uploaded but unusable: {"; ".join(photo_problems)}' if photo_problems else ''))
        else:
            hint = ''
        raise ValueError(f"Cannot close NCR: the following required fields are missing: {', '.join(missing)}{hint}")

    # Corrective-action effectiveness gate (BACKLOG #13 #3): an NCR cannot be Closed until its effectiveness has been verified = Yes.
    if final.get('effectivenessVerified') != 'Yes':
        raise ValueError(
            "Cannot close NCR: corrective-action effectiveness must be "
            "verified (effectivenessVerified = 'Yes') before closing."
        )

    # Owner / Engineering-Design authority sign-off gate (BACKLOG #14 item e): "Use As Is" / "Repair" are technical changes to the accepted
    # product and need explicit approval before closing — the print report's disposition note references this (見 6.3).
    if final_disposition in ('Use As Is', 'Repair') and final.get('ownerApproval') != 'Approved':
        raise ValueError(
            "Cannot close NCR: disposition 'Use As Is' or 'Repair' "
            "requires owner/engineering authority approval "
            "(ownerApproval = 'Approved') before closing."
        )



class NCRService:
    """Service layer for NCR business logic"""

    def __init__(self, repo: NCRRepository):
        self.repo = repo

    def get_ncrs(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.NCR]:
        """
        Get list of NCRs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of NCR objects
        """
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_ncr(self, ncr_id: str, scope=None) -> Optional[models.NCR]:
        """
        Get a single NCR by ID

        Args:
            ncr_id: NCR identifier

        Returns:
            NCR object if found, None otherwise
        """
        ncr = self.repo.get_by_id(ncr_id)
        return ncr if record_in_scope(ncr, scope) else None

    def create_ncr(self, ncr_create: schemas.NCRCreate,
                   user_id: int = None, username: str = None, scope=None, permissions=None) -> models.NCR:
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
            # An NCR born Closed is a closure: same permission as closing an existing one, checked before anything is read or written.
            if ncr_create.status == 'Closed' and not _may_close(permissions):
                raise NCRCloseNotPermitted()

            # Serialize JSON fields
            data = _json_serialize(
                ncr_create.model_dump(),
                ['defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments']
            )

            # closedBy is who CLOSED the NCR — set by the server from the authenticated user, never taken from the request body.
            data.pop('closedBy', None)

            # Handle vendor name -> vendor_id mapping
            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)
            validate_new_assignee(self.repo.db, data, "assignedTo")

            # Auto-fill dueDate from the severity SLA when not explicitly set
            # (BACKLOG #13 #1). Major → 7 days, Minor → 14 days from raiseDate
            # (defaults to today if no raiseDate). Overridable: a provided dueDate
            # is left untouched.
            if data.get('severity') in NCR_SLA_DAYS and not data.get('dueDate'):
                base_date = data.get('raiseDate') or datetime.now().strftime("%Y-%m-%d")
                data['raiseDate'] = data.get('raiseDate') or base_date
                data['dueDate'] = _add_days(base_date, NCR_SLA_DAYS[data['severity']])

            # noiNumber is auto-derived from the linked ITR (NOI is traced
            # through the ITR), so a dangling reference — NOI deleted/renamed —
            # is a data issue the user can't fix from the NCR form. Drop it
            # instead of failing the whole save.
            if data.get('noiNumber'):
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == data['noiNumber']
                ).first()
                if not noi:
                    logger.warning(
                        "NCR create: dropping dangling noiNumber %r (no matching NOI)",
                        data['noiNumber'],
                    )
                    data['noiNumber'] = ''

            # recurrenceRef is a traceability claim ("this is a repeat of that
            # prior NCR") — verify it actually resolves to an existing NCR,
            # same as noiNumber above, so an unverifiable value can't silently
            # satisfy the "recurrence needs a ref" closure requirement later.
            if data.get('recurrenceRef'):
                prior_ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == data['recurrenceRef']
                ).first()
                if not prior_ncr:
                    logger.warning(
                        "NCR create: dropping unverifiable recurrenceRef %r (no matching NCR)",
                        data['recurrenceRef'],
                    )
                    data['recurrenceRef'] = ''

            # An NCR created directly as Closed is a closure: it must meet the SAME closure conditions as one entering Closed by update (one shared
            # check), judged on the final content, before a reference number is taken or anything is written. Its improvement photos cannot exist
            # yet (attachments need the record's id), so a direct Closed is always refused — create it first, then close it.
            if data.get('status') == 'Closed':
                assert_closure_conditions({f: data.get(f) for f in CLOSURE_FIELDS}, [], photos_on_saved_record=False)

            # FINAL content (after the SLA due-date fill above) is validated BEFORE a reference number is taken or anything
            # is written: a create whose dates contradict each other is refused with 422, never saved-then-500 (2026-09-20).
            strict_dates.validate_date_write(data, strict_dates.NCR_DATE_FIELDS, relations=strict_dates.NCR_ORDER_RELATIONS,
                                             client_fields=ncr_create.model_fields_set)

            # From here on everything is written in ONE transaction: the write lock is taken before the sequence is read (see
            # begin_write_transaction), and the NCR row, the reference-number sequence and the audit entry are committed together, once.
            begin_write_transaction(self.repo.db)

            # Generate Reference No automatically if not provided
            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'NCR'
                )

            # Create NCR object
            db_ncr = models.NCR(**data)
            if not db_ncr.id:
                db_ncr.id = str(uuid.uuid4())

            # Insert the NCR (flush only — the commit is the single one at the end)
            created = self.repo.create(db_ncr, commit=False)

            # Audit entry: strict — an unrecordable create is not saved at all. It records what was ACTUALLY stored (defaults, SLA due date and
            # server-set fields included), by whom, and never inline file content.
            log_audit(
                self.repo.db, "CREATE", "NCR", created.id, created.documentNumber,
                new_value={k: _audit_scalar(k, v) for k, v in _row_values(created).items() if v is not None},
                user_id=user_id, username=username, strict=True,
            )

            # NCR + reference sequence + audit: ONE commit
            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(created)
            return created
        except (ValueError, NCRCloseNotPermitted):
            self.repo.db.rollback()                 # an expected refusal (400 / 422 / 403): nothing was written — not an error to log
            raise
        except Exception as e:
            self.repo.db.rollback()                 # releases the write lock; nothing of this create survives (row, number, audit)
            logger.error(f"Error creating NCR: {e}", exc_info=True)
            raise e

    def update_ncr(self, ncr_id: str, ncr_update: schemas.NCRUpdate,
                   user_id: int = None, username: str = None, scope=None,
                   background_tasks=None, permissions=None) -> Optional[models.NCR]:
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
            # The write lock BEFORE anything is read: the closure check ("is there a usable improvement photo?") and the write ("Closed") must not
            # have a photo delete in between (routers/file_router.py::delete_file takes the same lock and re-reads under it).
            lock_ncr_for_write(self.repo.db, ncr_id)
            db_ncr = self.repo.get_by_id(ncr_id)
            if not db_ncr or not record_in_scope(db_ncr, scope):
                self.repo.db.rollback()
                return None

            # Entering Closed from any other status needs ncr:close:all (on top of the ncr:update:all the route already demanded). Judged on the
            # STORED status, so a Closed record re-sent as Closed is not a closure; and before anything below can write, audit or number.
            if ncr_update.status == 'Closed' and db_ncr.status != 'Closed' and not _may_close(permissions):
                raise NCRCloseNotPermitted()

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
            validate_new_assignee(self.repo.db, d, "assignedTo", db_ncr.assignedTo)
            d = _json_serialize(d, ['defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments'])

            # Recompute dueDate from the severity SLA when severity changes and
            # the caller didn't explicitly provide a new dueDate — mirrors the
            # auto-fill in create_ncr. Without this, escalating severity (e.g.
            # Minor -> Major) via a later update leaves the stale, looser SLA
            # deadline in place instead of tightening it.
            # Not when the NCR is (being) Closed: its due date is fixed then, so a late closure stays a late closure.
            if (
                d.get('severity') in NCR_SLA_DAYS
                and d.get('severity') != db_ncr.severity
                and 'dueDate' not in d
                and d.get('status', db_ncr.status) != 'Closed'
            ):
                base_date = d.get('raiseDate', db_ncr.raiseDate) or datetime.now().strftime("%Y-%m-%d")
                # a historical raise date that is not a valid date cannot be the base of a computation: keep the current
                # due date instead of failing an update that never touched the date (a bad NEW raise date is refused below)
                if strict_dates.date_problem(base_date) is None:
                    d['dueDate'] = _add_days(base_date, NCR_SLA_DAYS[d['severity']])

            # recurrenceRef is a traceability claim ("this is a repeat of that
            # prior NCR") — unlike noiNumber/itrNumber it previously had no
            # existence check at all, so a typo or made-up value silently
            # satisfied the "recurrence needs a ref" closure requirement below.
            # Must run BEFORE the closure-required-fields check so a dropped
            # dangling ref is correctly treated as missing, not as already
            # having satisfied the requirement.
            if 'recurrenceRef' in d and d['recurrenceRef']:
                prior_ncr = self.repo.db.query(models.NCR).filter(
                    models.NCR.documentNumber == d['recurrenceRef']
                ).first()
                if not prior_ncr:
                    logger.warning(
                        "NCR update: dropping unverifiable recurrenceRef %r (no matching NCR)",
                        d['recurrenceRef'],
                    )
                    d['recurrenceRef'] = ''

            # --- Guard: prevent modification of quality fields on an already-Closed NCR ---
            # This check must run BEFORE the "transitioning to Closed" validation so
            # that an update that is NOT changing status but tries to alter these
            # fields on a Closed record is correctly rejected.
            _LOCKED_QUALITY_FIELDS = {
                'repairMethodStatement', 'repairMethodStatementStatus',
                'rootCauseAnalysis', 'rootCauseAnalysisStatus',
                'correctiveActions', 'correctiveActionsStatus',
                'reInspectionNumber', 'improvementPhotos', 'ownerApproval',
            }
            is_already_closed = db_ncr.status == 'Closed'
            is_transitioning_to_closed = d.get('status') == 'Closed' and not is_already_closed

            if is_already_closed and not is_transitioning_to_closed:
                # Compare against the current DB value, not mere key presence —
                # the frontend resends the full record on every save, so a
                # field being "in the payload" doesn't mean it actually changed.
                changed_locked = {
                    f for f in (_LOCKED_QUALITY_FIELDS & set(d.keys()))
                    if d[f] != getattr(db_ncr, f, None)
                }
                # Owner rejection of an already-Closed NCR is a designed reopen
                # path, not a lockable edit: deriveNCRStatus (ncrFormSchema.ts)
                # explicitly reverts status to 'In Progress' when ownerApproval
                # flips to 'Rejected', even for a previously-verified/closed
                # record ("even an already-verified NCR must go back to the
                # contractor if the owner then rejects it"). Without this
                # exception that save is unconditionally rejected here, so the
                # documented reopen flow was silently dead on arrival.
                if 'ownerApproval' in changed_locked and d.get('ownerApproval') == 'Rejected':
                    changed_locked.discard('ownerApproval')
                if changed_locked:
                    raise ValueError("Cannot modify quality fields on a Closed NCR")

            # Handle vendor name -> vendor_id mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            # --- Validate required fields when transitioning to Closed ---
            # Kept in lockstep with the frontend's zod superRefine gate
            # (ncrFormSchema.ts) — the two used to disagree (this gate required
            # repairMethodStatement unconditionally while the frontend only
            # required it for "Repair", and didn't check drawingNo/specNo/
            # qtyAffected/extent at all here or improvementPhotos there), so a
            # save that passed frontend validation could still 400 here for a
            # field the user was never told was required, or the reverse.
            if is_transitioning_to_closed:
                # The stored row merged with this request = the FINAL content the closure conditions are judged on.
                assert_closure_conditions(
                    {f: d.get(f, getattr(db_ncr, f, None)) for f in CLOSURE_FIELDS},
                    improvement_photo_evidence(self.repo.db, ncr_id),
                )

            # Auto-set closeoutDate + stamp closedBy when transitioning to Closed
            if d.get('status') == 'Closed' and not d.get('closeoutDate') and not db_ncr.closeoutDate:
                d['closeoutDate'] = datetime.now().strftime('%Y-%m-%d')
            d.pop('closedBy', None)                 # who closed it is the authenticated user, never a value from the request body
            if is_transitioning_to_closed and not db_ncr.closedBy:
                d['closedBy'] = user_id

            # Stamp who/when verified effectiveness when it's being recorded
            # (BACKLOG #13 #2/#3) — unless explicitly supplied.
            if d.get('effectivenessVerified') in ('Yes', 'No'):
                if not d.get('effectivenessVerifiedBy'):
                    d['effectivenessVerifiedBy'] = user_id
                if not d.get('effectivenessVerifiedDate'):
                    d['effectivenessVerifiedDate'] = datetime.now().strftime('%Y-%m-%d')

            # Stamp the date when owner/engineering approval is recorded. Not
            # `ownerApprovalBy` — that's the external owner/engineer's own name,
            # not necessarily the logged-in user entering it on their behalf.
            if d.get('ownerApproval') in ('Approved', 'Rejected'):
                if not d.get('ownerApprovalDate'):
                    d['ownerApprovalDate'] = datetime.now().strftime('%Y-%m-%d')

            # noiNumber is auto-derived from the linked ITR, so a dangling
            # reference must not block the update — drop it (see create above).
            if 'noiNumber' in d and d['noiNumber']:
                noi = self.repo.db.query(models.NOI).filter(
                    models.NOI.referenceNo == d['noiNumber']
                ).first()
                if not noi:
                    logger.warning(
                        "NCR update: dropping dangling noiNumber %r (no matching NOI)",
                        d['noiNumber'],
                    )
                    d['noiNumber'] = ''

            # Owner/engineering rejection needs to reach the contractor right
            # away, not wait for the next scheduler.py batch run — capture the
            # transition before repo.update() overwrites db_ncr in place.
            newly_rejected = d.get('ownerApproval') == 'Rejected' and old_val.get('ownerApproval') != 'Rejected'

            # The due date of a Closed NCR — or of the request that closes it — is fixed: closing late must not be hidden by moving the deadline.
            if (
                d.get('status', db_ncr.status) == 'Closed'
                and 'dueDate' in d and db_ncr.dueDate
                and d['dueDate'] != db_ncr.dueDate
            ):
                raise strict_dates.DateValidationError([{
                    'field': 'dueDate', 'code': strict_dates.DUE_FIXED_AT_CLOSURE, 'value': d['dueDate'],
                    'msg': 'the due date of a closed NCR (or of the request that closes it) cannot be changed',
                }])

            # Date rules on the MERGED final content (stored row + this request incl. the values filled in above), BEFORE the
            # write: a changed date must be valid, and each order relation touching a changed date must hold. A historical
            # value re-sent unchanged, or an old inconsistency this request does not touch, is not a new write (2026-09-20).
            strict_dates.validate_date_write(
                {f: d[f] if f in d else getattr(db_ncr, f, None) for f in strict_dates.NCR_DATE_FIELDS},
                strict_dates.NCR_DATE_FIELDS,
                stored={f: getattr(db_ncr, f, None) for f in strict_dates.NCR_DATE_FIELDS},
                provided=set(d) & set(strict_dates.NCR_DATE_FIELDS),
                relations=strict_dates.NCR_ORDER_RELATIONS,
                client_fields=ncr_update.model_fields_set,
            )

            # Update the record, flush only: the commit is the single one below, together with the audit entries
            updated = self.repo.update(db_ncr, d, commit=False)

            # Audit (strict): what ACTUALLY changed — every column whose stored value differs after the write, including the values the server
            # set itself (closedBy, close-out date, the SLA due date...) — with the before and after value of each, by whom, when (server clock).
            # A save that changes nothing leaves no entry. Any failure to record it rolls the whole update back.
            new_val = _row_values(updated)
            changed = [k for k in new_val if new_val[k] != old_val.get(k)]
            if changed:
                log_audit(
                    self.repo.db, "UPDATE", "NCR", ncr_id, updated.documentNumber,
                    old_value={k: _audit_scalar(k, old_val.get(k)) for k in changed},
                    new_value={k: _audit_scalar(k, new_val[k]) for k in changed},
                    user_id=user_id, username=username, strict=True,
                )
            if 'status' in changed:                 # entering or leaving Closed (or any status change): the existing STATUS_CHANGE action
                log_audit(
                    self.repo.db, "STATUS_CHANGE", "NCR", ncr_id, updated.documentNumber,
                    old_value={"status": old_val.get('status')}, new_value={"status": new_val['status']},
                    user_id=user_id, username=username,
                    reason=f"Status changed from '{old_val.get('status')}' to '{new_val['status']}'", strict=True,
                )

            # NCR change + audit entries: ONE commit
            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(updated)

            if newly_rejected:
                vendor_email = updated.vendor_ref.email if updated.vendor_ref else ''
                # Don't block the HTTP response on a live SMTP round-trip — a
                # slow/unreachable mail server would otherwise turn a routine
                # save into a multi-second-to-minute hang for the caller.
                if background_tasks is not None:
                    background_tasks.add_task(
                        send_ncr_rejection_notification,
                        vendor_email, updated.documentNumber, updated.ownerApprovalNotes or ''
                    )
                else:
                    send_ncr_rejection_notification(
                        vendor_email, updated.documentNumber, updated.ownerApprovalNotes or ''
                    )

            return updated
        except (ValueError, NCRCloseNotPermitted) as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()                 # the NCR change and its audit entries both go, nothing half-saved
            logger.error(f"Error updating NCR {ncr_id}: {e}", exc_info=True)
            raise e

    def delete_ncr(self, ncr_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
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
            if not db_ncr or not record_in_scope(db_ncr, scope):
                return False

            # Only Void NCRs can be deleted — deleting Open/In Progress/Resolved/Closed
            # NCRs would game the Q-WorkFlow completion percentage to 100%.
            if db_ncr.status != 'Void':
                raise ValueError(
                    f"Cannot delete NCR '{db_ncr.documentNumber}' with status '{db_ncr.status}'. "
                    f"Please Void the NCR first, then delete."
                )

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

    def export_docx(self, ncr_id: str, scope=None):
        """
        Generate a formal .docx report for one NCR — same 7-section content
        as NCRPrintTemplate.tsx (BACKLOG #15 / #18 pilot), built directly
        with python-docx via core/docx_builder.py rather than converting the
        HTML print template (htmldocx doesn't handle the CSS-grid sections
        the print template uses — see BACKLOG.md for the write-up).

        Returns a StreamingResponse; raises ValueError (→ 404 in the router)
        if the NCR doesn't exist or isn't in the caller's scope.
        """
        import os as _os
        from core import docx_builder as db

        ncr = self.repo.get_by_id(ncr_id)
        if not ncr or not record_in_scope(ncr, scope):
            raise ValueError("NCR not found")

        from core.uploads import upload_root as _upload_root
        upload_root = _upload_root()

        def _parse_json_list(raw):
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, list) else []
            except (TypeError, ValueError):
                return []

        def _photo_paths(legacy_field: str, category: str) -> list:
            legacy = [u for u in _parse_json_list(legacy_field) if isinstance(u, str)]
            attachments = self.repo.db.query(models.Attachment).filter(
                models.Attachment.entity_type == "ncr",
                models.Attachment.entity_id == ncr_id,
                models.Attachment.category == category,
                models.Attachment.is_deleted == False,  # noqa: E712
            ).all()
            urls = legacy + [a.file_path for a in attachments]
            paths = []
            for u in urls:
                p = db.resolve_local_upload_path(u, upload_root)
                if p:
                    paths.append(p)
            return paths

        defect_photos = _photo_paths(ncr.defectPhotos, "defectPhoto")
        progress_photos = _photo_paths(ncr.progressPhotos, "progressPhoto")
        improvement_photos = _photo_paths(ncr.improvementPhotos, "improvementPhoto")

        sev_text = "MAJOR 重大" if ncr.severity == "Major" else "MINOR 輕微" if ncr.severity == "Minor" else db.DASH

        doc = db.new_document()
        db.add_masthead(
            doc, "不符合報告", "NON-CONFORMANCE REPORT",
            doc_no=ncr.documentNumber, rev=ncr.rev, status=ncr.status,
        )

        # 1. Non-conformance details
        db.add_section_heading(doc, "1", "不符合細節", "Non-Conformance Details")
        db.add_field_grid(doc, [
            [("Aconex／文管編號", "Doc-Control No.", ncr.aconex), ("NCR 編號", "NCR No.", ncr.documentNumber)],
            [("主旨", "Subject", ncr.subject)],
            [("承包商", "Contractor", ncr.vendor), ("專業類別", "Discipline", ncr.discipline)],
            [("類型", "Type", ncr.type), ("發現位置", "Found Location", ncr.foundLocation)],
            [("開立日期", "Raise Date", ncr.raiseDate), ("回覆期限", "Response Due", ncr.dueDate)],
            [("發現人", "Found By", ncr.foundBy), ("提出人", "Raised By", ncr.raisedBy)],
            [("嚴重度", "Severity", sev_text)],
        ])

        has_traceability = any([ncr.drawingNo, ncr.specNo, ncr.lineNo, ncr.weldJointNo, ncr.heatBatchNo, ncr.itrNumber, ncr.noiNumber])
        if has_traceability:
            db.add_subsection_heading(doc, "1.1 追溯資訊", "Traceability")
            db.add_field_grid(doc, [
                [("圖號", "Drawing No.", ncr.drawingNo), ("規範號", "Spec No.", ncr.specNo)],
                [("管線編號", "Line No.", ncr.lineNo), ("焊道編號", "Weld / Joint No.", ncr.weldJointNo)],
                [("材料批號", "Heat / Batch No.", ncr.heatBatchNo),
                 ("ITR／NOI 編號", "ITR / NOI No.", " / ".join(filter(None, [ncr.itrNumber, ncr.noiNumber])))],
            ])

        has_impact = any([ncr.qtyAffected, ncr.extent])
        if has_impact:
            db.add_subsection_heading(doc, "1.2 影響範圍", "Impact & Extent")
            qty = f"{ncr.qtyAffected}{' ' + ncr.qtyAffectedUnit if ncr.qtyAffectedUnit else ''}" if ncr.qtyAffected else None
            db.add_field_grid(doc, [[("受影響數量", "Qty Affected", qty), ("範圍", "Isolated / Systemic", ncr.extent)]])

        db.add_subsection_heading(doc, "1.3 不符合描述", "Description of Non-Conformance")
        db.add_field_box(doc, ncr.requirement, guide="說明圖面／規範／程序書要求為何")
        db.add_field_box(doc, ncr.deviation, guide="說明實況與要求之差異")

        # 2. Disposition
        db.add_section_heading(doc, "2", "處置", "Disposition")
        db.add_subsection_heading(doc, "2.1 產品處置", "Product Disposition")
        disp = ncr.productDisposition
        db.add_checkbox_row(doc, [
            ("科用 Use As Is", disp == "Use As Is"), ("返工 Rework", disp == "Rework"),
            ("維修 Repair", disp == "Repair"), ("報廢 Reject / Scrap", disp == "Reject"),
        ])
        db.add_field_grid(doc, [
            [("讓步／偏差核准編號", "Concession / Deviation No.", ncr.concessionNo)],
            [("業主／工程權責核准", "Owner / Engineering Approval",
              (ncr.ownerApproval or "") + (f"｜{ncr.ownerApprovalNotes}" if ncr.ownerApprovalNotes else ""))],
        ])
        db.add_subsection_heading(doc, "2.2 維修方法說明", "Repair Method Statement")
        db.add_field_box(doc, ncr.repairMethodStatement, guide="若處置為維修，說明維修方法與驗收標準", tall=True)

        # 3. Root cause & corrective action
        db.add_section_heading(doc, "3", "根本原因與矯正措施", "Root Cause & Corrective Action")
        db.add_subsection_heading(doc, "3.1 立即處置", "Immediate Correction")
        db.add_field_box(doc, ncr.immediateCorrectionAction, guide="為控制當前不符合所採取之立即措施")

        db.add_subsection_heading(doc, "3.2 根因分析", "Root Cause Analysis")
        db.add_field_box(doc, ncr.directCause, guide="直接導致不符合之原因")
        db.add_field_box(doc, ncr.rootCauseAnalysis, guide="制度／流程層面之根本原因")
        db.add_checkbox_row(doc, [("否 No", ncr.recurrence == "No"), ("是 Yes", ncr.recurrence == "Yes")])
        if ncr.recurrence == "Yes":
            db.add_field_grid(doc, [[("關聯前次 NCR", "Recurrence Ref", ncr.recurrenceRef)]])

        db.add_subsection_heading(doc, "3.3 矯正措施", "Corrective Actions")
        db.add_field_box(doc, ncr.correctiveActions, guide="消除根因之矯正措施")
        db.add_field_grid(doc, [[("負責人", "Owner", ncr.correctiveActionOwner), ("目標完成日", "Target Date", ncr.correctiveActionTargetDate)]])

        db.add_subsection_heading(doc, "3.4 預防措施", "Preventive Action")
        db.add_field_box(doc, ncr.preventiveAction, guide="防止類似不符合再發之措施")
        db.add_field_grid(doc, [[("負責人", "Owner", ncr.preventiveActionOwner), ("目標完成日", "Target Date", ncr.preventiveActionTargetDate)]])

        # 4. Attachments
        db.add_section_heading(doc, "4", "附件與證據", "Attachments & Evidence")
        general_attachments = self.repo.db.query(models.Attachment).filter(
            models.Attachment.entity_type == "ncr",
            models.Attachment.entity_id == ncr_id,
            models.Attachment.category == "attachment",
            models.Attachment.is_deleted == False,  # noqa: E712
        ).all()
        legacy_attachment_urls = [u for u in _parse_json_list(ncr.attachments) if isinstance(u, str)]
        att_names = [a.file_name for a in general_attachments] + [u.split("/")[-1] for u in legacy_attachment_urls]
        if not att_names:
            db.add_field_grid(doc, [[("附件", "Attachments", None)]])
        else:
            db.add_field_grid(doc, [[(str(i + 1), "", name)] for i, name in enumerate(att_names)])

        # 5. Verification & closure
        db.add_section_heading(doc, "5", "驗證與結案", "Verification & Closure")
        db.add_checkbox_row(doc, [("是 Yes", ncr.effectivenessVerified == "Yes"), ("否 No", ncr.effectivenessVerified == "No")])
        db.add_field_grid(doc, [
            [("結案日期", "Closeout Date", ncr.closeoutDate)],
            [("複驗編號", "Re-Inspection No.", ncr.reInspectionNumber), ("有效性備註", "Notes", ncr.effectivenessNotes)],
        ])

        # 6. Closure sign-off
        db.add_section_heading(doc, "6", "結案簽核", "Closure Sign-off")
        db.add_sign_off_grid(doc, [
            {"num": "6.1", "zh": "承包商", "en": "Contractor", "name": ncr.vendor},
            {"num": "6.2", "zh": "開立人", "en": "Issuer", "name": ncr.raisedBy or ncr.foundBy, "date": ncr.raiseDate},
            {"num": "6.3", "zh": "業主／工程權責", "en": "Owner / Engineering Authority",
             "name": ncr.ownerApprovalBy, "date": ncr.ownerApprovalDate, "req": ncr.ownerApproval},
        ])

        # 7. Photographic record
        if defect_photos or progress_photos or improvement_photos:
            doc.add_page_break()
            db.add_section_heading(doc, "7", "照片紀錄（前／中／後）", "Photographic Record (Before / During / After)")
            db.add_photo_section(doc, "缺失（前）Defect (Before)", defect_photos)
            db.add_photo_section(doc, "矯正中（中）In Progress (During)", progress_photos)
            db.add_photo_section(doc, "改善（後）Improvement (After)", improvement_photos)

        return db.finalize_response(doc, ncr.documentNumber or "NCR")
