"""
ITR (Inspection and Test Record) Service

Business logic layer for ITR module
"""

import copy
import hashlib
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

import models
import schemas
from repositories.itr_repository import ITRRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    lock_itr_for_write,
    reload_locked,
    WorkflowEngine
)
from core.perms import ITR_APPROVE
from services.checklist_service import _instance_has_historical_evidence, pass_support_problems


def _blanked_item_results(detail_data) -> str:
    """Copy of a Checklist instance's detail_data with every item's
    execution-time content cleared — `result` (the Pass/Fail/N-A
    judgement) *and* `situation` (the observation/measurement text, e.g.
    "Measured 14mm" — the same field a 2026-09-19 fix found the shared
    evidence predicate had been missing) — while
    keeping `item`/`criteria` (what's being checked, and against what
    standard) intact. Used when seeding a re-inspection's checklist
    snapshot: the new instance starts genuinely fresh (Ongoing, no prior
    observations carried over) but must inspect against the exact same
    items the original failure was assessed against, not whatever the
    live template currently looks like.

    Never mutates the input — `{**it, ...}` builds new dicts and the
    parsed structure is a fresh object from `json.loads`, so the
    original instance's own `detail_data` string is untouched; a
    regression test proves this explicitly (the original record must
    stay unchanged)."""
    try:
        parsed = json.loads(detail_data) if isinstance(detail_data, str) else (detail_data or {})
    except (TypeError, ValueError):
        return detail_data
    items = parsed.get('items') if isinstance(parsed, dict) else None
    if isinstance(items, list):
        parsed['items'] = [
            ({**{k: v for k, v in it.items() if k != 'naReason'}, 'situation': '', 'result': ''}
             if isinstance(it, dict) else it)
            for it in items
        ]
    return json.dumps(parsed, ensure_ascii=False)


# `_instance_has_historical_evidence` (imported above from
# checklist_service.py, the single shared definition) is what
# unlink_checklist/delete_itr below use to decide whether a Checklist
# instance is safe to remove — it checks the permanent
# `evidence_recorded_at` marker, not just current field values, so
# clearing situation/result back to blank does not make a
# previously-evidenced instance look removable again (2026-09-19,
# closing the gap a prior round's ITR-local `_instance_holds_evidence` —
# current-values-only — left open, which a regression test had documented
# rather than silently fixed).

logger = logging.getLogger(__name__)


# Recorded ONLY by update_itr at the moment an ITR really enters Approved, from the
# authenticated caller and the server clock. approvedBy = the approver's USER ID as
# a string (stable across renames; who they were at the time is in the event row).
_APPROVAL_IDENTITY_FIELDS = ("approvedBy", "approvedAt")

# Re-inspection lineage, with the value an ordinary ITR has. Written ONLY by create_reinspection(); a client can
# neither set nor rewrite it (2026-10-10): a hand-made "re-inspection" skipped create_reinspection's Approved/Void
# guards and counted as a real one in Q-Workflow, and the delete chain protection could be added or removed at will.
_REINSPECTION_LINEAGE_DEFAULTS = {"isReInspection": False, "originalItrId": None, "reInspectionCount": 0}

# Statuses an ITR may be created in. Approved is refused separately with its own explanation; anything else
# (including "") would put the record outside the workflow, where no transition out of it is ever valid.
_ITR_CREATE_STATUSES = ("In Progress", "Reject", "Void")


class ApprovalAuthorityError(ValueError):
    """The caller may not approve (routers map this to 403)."""


class TemplateNotFoundError(ValueError):
    """The source Checklist template does not exist OR is outside the caller's data scope (routers map this to
    404). ONE exception, ONE message for both, so the answer cannot be used to probe which ids exist or what
    they hold."""


def _jsonable(value):
    """Deep copy through JSON: what is stored can never alias a live object."""
    return json.loads(json.dumps(value, default=str, ensure_ascii=False))


class ITRService:
    """Service layer for ITR business logic"""

    def __init__(self, repo: ITRRepository):
        self.repo = repo

    def get_itrs(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.ITR]:
        """
        Get list of ITRs with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date)

        Returns:
            List of ITR objects
        """
        items, _total = self.repo.get_all(skip, limit, scope=scope, **filters)
        return items

    def get_itr(self, itr_id: str, scope=None) -> Optional[models.ITR]:
        """
        Get a single ITR by ID

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object if found, None otherwise
        """
        obj = self.repo.get_by_id(itr_id)
        return obj if record_in_scope(obj, scope) else None

    def get_itr_with_checklists(self, itr_id: str) -> Optional[models.ITR]:
        """
        Get ITR with associated Checklists

        Args:
            itr_id: ITR identifier

        Returns:
            ITR object with checklists if found, None otherwise
        """
        return self.repo.get_with_checklists(itr_id)

    def _check_reference_links(self, data: dict, scope, current: Optional[models.ITR] = None) -> None:
        """noiNumber / ncrNumber must name a record the caller can see — out of scope answers exactly like
        "not found", so the reply cannot be used to probe other projects' numbers — and a NOI that is Closed or
        Void takes no new ITR (a Closed NOI can never reopen, so that ITR could never be cleared). On update
        (`current` given) only a value that actually changes is checked: the UI resends both on every save, and
        an ITR whose NOI has since been closed must stay saveable (2026-10-10)."""
        noi_no = data.get('noiNumber')
        if noi_no and (current is None or noi_no != current.noiNumber):
            noi = self.repo.db.query(models.NOI).filter(models.NOI.referenceNo == noi_no).first()
            if not noi or not record_in_scope(noi, scope):
                raise ValueError(f"NOI with reference number '{noi_no}' not found")
            if noi.status in ('Closed', 'Void'):
                raise ValueError(f"NOI '{noi_no}' is {noi.status}; a new ITR cannot be filed under it.")

        ncr_no = data.get('ncrNumber')
        if ncr_no and (current is None or ncr_no != current.ncrNumber):
            ncr = self.repo.db.query(models.NCR).filter(models.NCR.documentNumber == ncr_no).first()
            if not ncr or not record_in_scope(ncr, scope):
                raise ValueError(f"NCR with document number '{ncr_no}' not found")

    def create_itr(self, itr_create: schemas.ITRCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.ITR:
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

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            # Approval identity is recorded by the system when an ITR really
            # enters Approved — never accepted from a client (2026-09-20).
            for _f in _APPROVAL_IDENTITY_FIELDS:
                if data.get(_f) is not None:
                    raise ValueError(
                        f"'{_f}' is recorded by the system at approval and cannot be supplied when creating an ITR."
                    )

            # Approval-authority hardening (2026-09-19): an ITR being
            # created can never legitimately be born Approved — approval
            # requires at least one already-passing linked Checklist
            # (_validate_approval), and a brand-new ITR has no linked
            # Checklists yet by construction. Closes the "create ... with
            # itrId + status=Approved directly" path around update_itr's
            # approval gate entirely.
            if data.get('status') == 'Approved':
                raise ValueError(
                    "Cannot create an ITR as Approved directly — create it in another "
                    "status, link at least one passing Checklist, then approve via update."
                )
            if data.get('status') not in _ITR_CREATE_STATUSES:
                raise ValueError(
                    f"Invalid ITR status '{data.get('status')}' — an ITR is created as one of: "
                    f"{', '.join(_ITR_CREATE_STATUSES)}."
                )

            for _f, _default in _REINSPECTION_LINEAGE_DEFAULTS.items():
                if data.get(_f, _default) != _default:
                    raise ValueError(
                        f"'{_f}' is set by the system when a re-inspection is raised from an ITR "
                        f"and cannot be supplied when creating an ITR."
                    )

            # Validate foreign keys BEFORE allocating a reference number,
            # so failed creates don't leave gaps in the ITR sequence.
            self._check_reference_links(data, scope)

            # Generate Reference No automatically if not provided
            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'ITR'
                )

            # Create ITR object
            db_itr = models.ITR(**data)
            if not db_itr.id:
                db_itr.id = str(uuid.uuid4())

            # Row + audit entry in ONE transaction (2026-09-20): flushed here, committed below.
            created = self.repo.create(db_itr, commit=False)

            log_audit(
                self.repo.db, "CREATE", "ITR", created.id, created.documentNumber,
                new_value=itr_create.model_dump(), user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()                  # surface an audit insert failure before committing
            self.repo.db.commit()
            self.repo.db.refresh(created)
            return created
        except Exception as e:
            self.repo.db.rollback()               # also releases the reference number allocated above
            logger.error(f"Error creating ITR: {e}", exc_info=True)
            raise e

    def _get_detail_data_dict(self, db_itr: models.ITR) -> dict:
        """Parse detail_data JSON from an ITR into a dict (empty dict if None/invalid)."""
        if not db_itr.detail_data:
            return {}
        if isinstance(db_itr.detail_data, dict):
            return db_itr.detail_data
        try:
            parsed = json.loads(db_itr.detail_data)
            return parsed if isinstance(parsed, dict) else {}
        except (json.JSONDecodeError, TypeError):
            return {}

    def _load_instances_for_approval(self, itr_id: str) -> list:
        """The linked Checklist instances, read FRESH from the database (never a
        stale identity-map copy). Approval validation and the approval snapshot
        both use exactly this list, so what is checked is what is recorded."""
        return (
            self.repo.db.query(models.Checklist)
            .populate_existing()
            .filter(models.Checklist.itrId == itr_id)
            .order_by(models.Checklist.recordsNo, models.Checklist.id)
            .all()
        )

    def _validate_approval(self, itr_id: str, checklists: Optional[list] = None) -> None:
        """
        Validate that an ITR can transition to 'Approved'.

        Rules:
        - Must have at least one linked checklist
        - Every linked checklist must have status == 'Pass' — an 'Ongoing'
          (unfilled or incomplete) checklist must not silently allow
          approval either, not just an explicit 'Fail'.

        Raises:
            ValueError: If approval requirements are not met
        """
        if checklists is None:
            checklists = self._load_instances_for_approval(itr_id)

        if not checklists:
            raise ValueError("Cannot approve ITR without any linked checklists")

        not_passed = [
            f"{cl.recordsNo} ({cl.status})" for cl in checklists if cl.status != "Pass"
        ]
        if not_passed:
            raise ValueError(
                f"Cannot approve ITR — checklist(s) not passed: {', '.join(not_passed)}"
            )

        # A stored 'Pass' is only a claim — re-check it against the actual
        # items and counts, with the SAME core judgement update_checklist
        # applies on write (pass_support_problems), so a legacy/anomalous
        # Pass (empty items, unfilled or unknown results, counts that don't
        # add up) can never carry a NEW approval — first-time or re-approval
        # after a revoke. Read-only: nothing is repaired or rewritten.
        unsupported = []
        for cl in checklists:
            problems = pass_support_problems(cl.passCount, cl.failCount, cl.detail_data)
            if problems:
                unsupported.append(f"{cl.recordsNo}: " + "; ".join(problems))
        if unsupported:
            raise ValueError(
                "Cannot approve ITR — checklist(s) marked Pass are not supported by "
                "their actual items: " + " | ".join(unsupported)
            )

    def update_itr(self, itr_id: str, itr_update: schemas.ITRUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.ITR]:
        """
        Update an existing ITR with validation

        Business logic:
        - Validates status transitions using WorkflowEngine
        - Validates approval prerequisites (checklists)
        - Auto-sets closeoutDate on approval
        - Optimistic locking via _version in detail_data
        - Maps vendor name to vendor_id
        - Serializes JSON fields
        - Logs audit trail

        Transaction (2026-09-20): the ITR change, the optimistic-lock version
        bump, the strict audit entry and — when the ITR really enters Approved
        — the approval event (with its snapshot) are written and committed ONCE;
        any failure rolls all of it back. The write lock is taken FIRST and the
        ITR / its checklists are re-read after it, so a concurrent Checklist
        edit, link or unlink cannot slip in between "checked" and "recorded".

        Args:
            itr_id: ITR identifier
            itr_update: ITR update schema
            user_id: ID of user updating the ITR
            username: Username of user updating the ITR

        Returns:
            Updated ITR object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid, approval validation
                        fails, or optimistic lock conflict detected
            Exception: If update fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr or not record_in_scope(db_itr, scope):
                return None

            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):       # what the lock now guards is what we decide on
                self.repo.db.rollback()
                return None                                    # deleted by a request that held the lock first

            # --- Optimistic locking via _version in detail_data ---
            d = itr_update.model_dump(exclude_unset=True)

            # Approval identity is the system's to record. A client can neither
            # set, rewrite nor clear it: an unchanged echo of the current value
            # (the UI resends whole records) is ignored, anything else is refused.
            for _f in _APPROVAL_IDENTITY_FIELDS:
                if _f in d:
                    if d[_f] != getattr(db_itr, _f):
                        raise ValueError(
                            f"'{_f}' is recorded by the system when an ITR is approved and cannot be set, changed or cleared."
                        )
                    d.pop(_f)
            # Re-inspection lineage likewise: an unchanged echo is ignored, any change is refused.
            for _f, _default in _REINSPECTION_LINEAGE_DEFAULTS.items():
                if _f in d:
                    stored = getattr(db_itr, _f)
                    if d[_f] != (_default if stored is None else stored):
                        raise ValueError(
                            f"'{_f}' is set by the system when a re-inspection is raised and cannot be changed."
                        )
                    d.pop(_f)

            # An empty status skipped the transition check below and was stored, taking the record out of the
            # workflow for good — a Void ITR could leave Void that way (2026-10-10).
            if 'status' in d and not d['status']:
                raise ValueError("ITR status cannot be empty.")

            existing_detail = self._get_detail_data_dict(db_itr)
            db_version = existing_detail.get("_version", 0)

            # The client may send _version inside detail_data (JSON string or dict)
            incoming_detail = d.get("detail_data")
            incoming_version = None
            if incoming_detail is not None:
                if isinstance(incoming_detail, str):
                    try:
                        incoming_detail = json.loads(incoming_detail)
                    except (json.JSONDecodeError, TypeError):
                        incoming_detail = None
                if isinstance(incoming_detail, dict):
                    incoming_version = incoming_detail.pop("_version", None)

            if incoming_version is not None and incoming_version != db_version:
                raise ValueError(
                    f"Optimistic lock conflict: expected version {incoming_version}, "
                    f"but current version is {db_version}. "
                    f"Another user may have modified this record."
                )

            # Workflow validation: Check status transition
            if itr_update.status and not WorkflowEngine.validate_transition(
                "ITR", db_itr.status, itr_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_itr.status} to {itr_update.status}"
                )

            # A Void ITR is cancelled for good (Void has no way out in the workflow — any status change was already
            # refused just above) and is treated as locked everywhere else: delete, link/unlink, Raise NCR, its
            # checklists and attachments. Its own fields were still writable here (2026-10-10).
            if db_itr.status == 'Void':
                raise ValueError(
                    f"Cannot modify ITR '{db_itr.documentNumber}': it is Void (a locked record)."
                )

            # --- Approval validation: require passing checklists ---
            # "Really entering Approved" = the stored status is not Approved yet.
            # An Approved -> Approved resend (Publish) is NOT an approval event.
            entering_approved = d.get('status') == 'Approved' and db_itr.status != 'Approved'
            approval_instances = None
            if entering_approved:
                approval_instances = self._load_instances_for_approval(itr_id)
                self._validate_approval(itr_id, approval_instances)

            # Approval-authority hardening (2026-09-19): leaving Approved
            # via this normal update path is disabled outright, regardless
            # of permission. WorkflowEngine still legally allows
            # Approved -> In Progress/Void, but nothing here preserved a
            # reason, verified a dedicated approval-authority permission,
            # or explicitly recorded the prior approved content beyond the
            # generic audit log — exactly the "must not just add a
            # permission check and let history be overwritten" concern.
            # revoke_itr_approval() below is the only sanctioned way out of
            # Approved now; it requires ITR_APPROVE (router-enforced) and a
            # mandatory reason.
            if db_itr.status == 'Approved' and 'status' in d and d['status'] != 'Approved':
                raise ValueError(
                    "Cannot change status away from Approved via a normal update — "
                    "use the dedicated revoke-approval action instead, which requires "
                    "approval authority and a reason."
                )

            # 勾稽鎖定：Approved 狀態的 ITR 只允許 Publish（變更 type/status）或轉為 Reject/Void
            # 任何其他欄位更新均被阻擋，以防止已批准記錄被竄改
            if db_itr.status == 'Approved':
                allowed_keys = {'type', 'status', 'detail_data'}
                update_keys = set(d.keys())
                blocked = update_keys - allowed_keys
                if blocked:
                    raise ValueError(
                        f"Cannot modify a locked (Approved) ITR. "
                        f"Blocked fields: {', '.join(sorted(blocked))}. "
                        f"Use Publish to create a new revision."
                    )
                # detail_data on an Approved ITR may only carry the
                # optimistic-lock version bump — nothing else. Without
                # this, an Approved record's `detail_data` field being in
                # the allowlist above (needed so the version counter can
                # still increment) would otherwise let arbitrary business
                # data be smuggled into a "locked" record via that one
                # still-writable field.
                if isinstance(incoming_detail, dict) and incoming_detail:
                    raise ValueError(
                        "Cannot modify detail_data content on an Approved ITR — "
                        "only its internal version counter may change."
                    )

            # Capture old values for audit
            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}

            # Prepare update data
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            # Handle vendor name -> vendor_id mapping
            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            self._check_reference_links(d, scope, current=db_itr)

            # --- Auto-set closeoutDate on approval ---
            if d.get('status') == 'Approved' and not d.get('closeoutDate') and not db_itr.closeoutDate:
                d['closeoutDate'] = datetime.now().strftime('%Y-%m-%d')

            # --- Approver identity + time: from the authenticated caller and the server clock ---
            approver = None
            approved_at = None
            if entering_approved:
                approver = self._require_approver(user_id)
                approved_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
                d['approvedBy'] = str(approver.id)
                d['approvedAt'] = approved_at

            # --- Increment _version in detail_data ---
            # Merge incoming detail_data with the version bump
            new_version = db_version + 1
            if isinstance(incoming_detail, dict):
                merged_detail = {**existing_detail, **incoming_detail, "_version": new_version}
            else:
                merged_detail = {**existing_detail, "_version": new_version}
            d['detail_data'] = json.dumps(merged_detail, ensure_ascii=False)

            # Update the record — flushed, NOT committed: the commit below covers
            # the row, the approval event and the audit entry together.
            status_before = db_itr.status
            updated = self.repo.update(db_itr, d, commit=False)

            new_value = itr_update.model_dump(exclude_unset=True)
            action = "UPDATE"
            if entering_approved:
                event = self._record_approval_event(updated, approval_instances, approver, approved_at, status_before)
                action = "APPROVE"
                new_value = {**new_value, "approvedBy": updated.approvedBy, "approvedAt": updated.approvedAt,
                             "approval_event_id": event.id}

            # Log audit trail (strict: a failure to build the entry aborts the whole change)
            log_audit(
                self.repo.db, action, "ITR", itr_id, updated.documentNumber,
                old_value=old_val, new_value=new_value,
                user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()                  # surface an audit insert failure before committing
            self.repo.db.commit()
            self.repo.db.refresh(updated)
            return updated
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating ITR {itr_id}: {e}", exc_info=True)
            raise e

    # ── approval history (READ-ONLY) ───────────────────────────────────────
    _EVENT_SUMMARY_COLUMNS = (
        "id", "itr_id", "document_number", "sequence", "event_type", "occurred_at", "actor_user_id",
        "actor_username", "actor_full_name", "status_before", "status_after", "reason", "approval_event_id",
    )

    def _ended_event_sequences(self, itr_id: str, event_ids) -> dict:
        ids = [i for i in set(event_ids) if i is not None]
        if not ids:
            return {}
        rows = (self.repo.db.query(models.ITRApprovalEvent.id, models.ITRApprovalEvent.sequence)
                .filter(models.ITRApprovalEvent.itr_id == itr_id, models.ITRApprovalEvent.id.in_(ids)).all())
        return {r[0]: r[1] for r in rows}

    def list_approval_events(self, itr_id: str, scope=None, skip: int = 0, limit: int = 20) -> Optional[dict]:
        """A page of the ITR's approval / revocation events, in a FIXED order (sequence, then id), WITHOUT the
        snapshots. None if the ITR does not exist or is outside the caller's scope — the same answer as for
        reading the ITR itself, so this can never be used to probe records the caller may not see."""
        if self.get_itr(itr_id, scope=scope) is None:
            return None
        E = models.ITRApprovalEvent
        total = self.repo.db.query(E.id).filter(E.itr_id == itr_id).count()
        cols = [getattr(E, c) for c in self._EVENT_SUMMARY_COLUMNS]
        rows = (self.repo.db.query(*cols, E.itr_snapshot.isnot(None))
                .filter(E.itr_id == itr_id).order_by(E.sequence, E.id).offset(skip).limit(limit).all())
        seq = self._ended_event_sequences(itr_id, [r[12] for r in rows])
        items = []
        for r in rows:
            d = dict(zip(self._EVENT_SUMMARY_COLUMNS, r[:13]))
            d["approval_event_sequence"] = seq.get(d["approval_event_id"])
            d["has_snapshot"] = bool(r[13])
            items.append(d)
        return {"items": items, "total": total, "skip": skip, "limit": limit}

    def get_approval_event(self, itr_id: str, event_id: int, scope=None) -> Optional[dict]:
        """One event WITH its snapshots. The event must belong to `itr_id` AND that ITR must be in scope: an
        event id typed directly into the URL cannot reach a snapshot of another ITR or of an out-of-scope one."""
        if self.get_itr(itr_id, scope=scope) is None:
            return None
        E = models.ITRApprovalEvent
        ev = self.repo.db.query(E).filter(E.id == event_id, E.itr_id == itr_id).first()
        if ev is None:
            return None
        d = {c: getattr(ev, c) for c in self._EVENT_SUMMARY_COLUMNS}
        d["approval_event_sequence"] = self._ended_event_sequences(itr_id, [ev.approval_event_id]).get(ev.approval_event_id)
        d["has_snapshot"] = ev.itr_snapshot is not None
        itr_snap = json.loads(ev.itr_snapshot) if ev.itr_snapshot else None
        chk_snap = json.loads(ev.checklists_snapshot) if ev.checklists_snapshot else None
        matches = None
        if itr_snap is not None and chk_snap is not None and ev.snapshot_sha256:
            canonical = json.dumps({"itr": itr_snap, "checklists": chk_snap}, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
            matches = hashlib.sha256(canonical.encode("utf-8")).hexdigest() == ev.snapshot_sha256
        d.update(itr_snapshot=itr_snap, checklists_snapshot=chk_snap, snapshot_sha256=ev.snapshot_sha256, snapshot_sha256_matches=matches)
        return d

    # ── approval events ────────────────────────────────────────────────────
    def _require_approver(self, user_id) -> models.User:
        """The authenticated, active user who is approving — and one who really
        holds approval authority (the router checks too; this is the choke point
        for any other caller). There is no such thing as an anonymous approval."""
        approver = (self.repo.db.query(models.User).filter(models.User.id == user_id).first()
                    if user_id is not None else None)
        if approver is None or not approver.is_active:
            raise ApprovalAuthorityError("Cannot approve an ITR without an authenticated, active approver.")
        codes = {p.code for p in approver.role.permissions_rel} if approver.role else set()
        if ITR_APPROVE not in codes:
            raise ApprovalAuthorityError(f"Operation not permitted. Required: {ITR_APPROVE}")
        return approver

    def _next_event_sequence(self, itr_id: str) -> int:
        last = (
            self.repo.db.query(models.ITRApprovalEvent.sequence)
            .filter(models.ITRApprovalEvent.itr_id == itr_id)
            .order_by(models.ITRApprovalEvent.sequence.desc())
            .first()
        )
        return (last[0] if last else 0) + 1

    def _record_approval_event(self, updated_itr: models.ITR, instances: list, approver: models.User,
                               approved_at: str, status_before: str) -> models.ITRApprovalEvent:
        """Append the APPROVED event: the ITR row exactly as flushed with this
        approval, plus the linked Checklist instances exactly as they were read
        for (and passed) the approval check, all deep-copied into JSON."""
        itr_snapshot = _jsonable({c.name: getattr(updated_itr, c.name) for c in updated_itr.__table__.columns})
        checklists_snapshot = self._build_checklist_approval_snapshot(updated_itr.id, instances)
        canonical = json.dumps({"itr": itr_snapshot, "checklists": checklists_snapshot},
                               sort_keys=True, ensure_ascii=False, separators=(",", ":"))
        event = models.ITRApprovalEvent(
            itr_id=updated_itr.id,
            document_number=updated_itr.documentNumber,
            sequence=self._next_event_sequence(updated_itr.id),
            event_type="APPROVED",
            occurred_at=approved_at,
            actor_user_id=approver.id,
            actor_username=approver.username,
            actor_full_name=approver.full_name,
            status_before=status_before,
            status_after="Approved",
            itr_snapshot=json.dumps(itr_snapshot, ensure_ascii=False),
            checklists_snapshot=json.dumps(checklists_snapshot, ensure_ascii=False),
            snapshot_sha256=hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        )
        self.repo.db.add(event)
        self.repo.db.flush()                      # id assigned; a failure surfaces here, before the commit
        return event

    def _build_checklist_approval_snapshot(self, itr_id: str, instances: Optional[list] = None) -> list:
        """Full, self-contained snapshot of every Checklist instance linked to
        this ITR: identity (id / recordsNo), provenance (template_id and the
        template VERSION it was linked from), status and counts, and the complete
        item list — item, criteria, situation, result, naReason and any other item
        field — plus the remaining detail_data keys. Deep-copied through JSON, so
        later edits to the Checklist rows can never change what was stored.

        Used in two places, with a different meaning each time:
        * at APPROVAL (update_itr): `instances` is the very list that just passed
          the approval check, so the stored snapshot IS what was approved;
        * at REVOKE (revoke_itr_approval): the state at revoke time, kept in the
          REVOKE_APPROVAL audit row exactly as before. It is never used in place of
          the approval-time snapshot."""
        if instances is None:
            instances = self._load_instances_for_approval(itr_id)
        snapshot = []
        for inst in instances:
            try:
                detail = json.loads(inst.detail_data) if isinstance(inst.detail_data, str) else (inst.detail_data or {})
            except (TypeError, ValueError):
                detail = {}
            if not isinstance(detail, dict):
                detail = {}
            items = detail.get('items')
            snapshot.append(_jsonable({
                "id": inst.id,
                "recordsNo": inst.recordsNo,
                "activity": inst.activity,
                "packageName": inst.packageName,
                "location": inst.location,
                "date": inst.date,
                "itpId": inst.itpId,
                "itpVersion": inst.itpVersion,
                "status": inst.status,
                "passCount": inst.passCount,
                "failCount": inst.failCount,
                "template_id": inst.template_id,
                "source_template_version": inst.source_template_version,
                "version": inst.version,
                "items": items if isinstance(items, list) else [],
                "detail_other": {k: v for k, v in detail.items() if k != 'items'},
            }))
        return snapshot

    def revoke_itr_approval(self, itr_id: str, new_status: str, reason: str,
                            user_id: int = None, username: str = None, scope=None) -> Optional[models.ITR]:
        """
        The only sanctioned way to leave an Approved ITR (2026-09-19
        approval-authority hardening). update_itr refuses this transition
        outright — a plain permission check was judged not enough to
        safely reopen an approved record, so this is a separate, narrower
        action: it requires the caller to hold ITR_APPROVE (checked by the
        router, matching CHECKLIST_CLOSE's pattern), a non-empty `reason`,
        and preserves every ITR column as it stood right before this call
        (including approvedBy/approvedAt — left on the row as historical
        record, not cleared) *and* a complete snapshot of every linked
        Checklist instance's items/results, taken AT THIS REVOKE CALL —
        see _build_checklist_approval_snapshot's docstring for the
        precise timing caveat: this is NOT a snapshot captured back when
        the ITR was originally approved, there is no such mechanism yet.

        Atomicity (2026-09-19 fix): the status change and the audit-log
        entry are written in ONE transaction — this method never calls
        `self.repo.update()` (which commits on its own), and calls
        `log_audit(..., strict=True)` so a failure building the audit
        entry raises instead of being silently swallowed. Either both the
        status change and the history snapshot persist together, or
        neither does — on any failure the whole transaction is rolled
        back, so the ITR is never left showing a revoked status with no
        corresponding audit trail.

        Args:
            itr_id: ITR identifier
            new_status: legal WorkflowEngine target from 'Approved'
                        (e.g. 'In Progress' or 'Void')
            reason: mandatory justification for the revocation
            user_id / username: actor for the audit trail

        Returns:
            Updated ITR object, or None if not found / out of scope.

        Raises:
            ValueError: if the ITR isn't currently Approved, `new_status`
                        isn't a legal transition from Approved, or `reason`
                        is empty.
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr or not record_in_scope(db_itr, scope):
                return None

            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):
                self.repo.db.rollback()
                return None

            if db_itr.status != 'Approved':
                raise ValueError(
                    f"ITR '{db_itr.documentNumber}' is not Approved — nothing to revoke."
                )

            if not WorkflowEngine.validate_transition("ITR", "Approved", new_status):
                raise ValueError(
                    f"Cannot revoke Approved ITR '{db_itr.documentNumber}' into "
                    f"'{new_status}' — not a legal transition."
                )

            if not reason or not reason.strip():
                raise ValueError("A reason is required to revoke an ITR's approval.")

            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}
            checklist_snapshot = self._build_checklist_approval_snapshot(itr_id)

            db_itr.status = new_status
            self.repo.db.add(db_itr)

            log_audit(
                self.repo.db, "REVOKE_APPROVAL", "ITR", itr_id, db_itr.documentNumber,
                old_value={**old_val, "checklists": checklist_snapshot},
                new_value={"status": new_status, "reason": reason},
                user_id=user_id, username=username, reason=reason,
                strict=True,
            )

            # History: an appended REVOKED event that points at the APPROVED event it ends
            # (NULL when the approval predates event recording — never guessed).
            ended = (
                self.repo.db.query(models.ITRApprovalEvent)
                .filter(models.ITRApprovalEvent.itr_id == itr_id, models.ITRApprovalEvent.event_type == "APPROVED")
                .order_by(models.ITRApprovalEvent.sequence.desc()).first()
            )
            actor = (self.repo.db.query(models.User).filter(models.User.id == user_id).first()
                     if user_id is not None else None)
            self.repo.db.add(models.ITRApprovalEvent(
                itr_id=itr_id,
                document_number=db_itr.documentNumber,
                sequence=self._next_event_sequence(itr_id),
                event_type="REVOKED",
                occurred_at=datetime.now(timezone.utc).isoformat(timespec='seconds'),
                actor_user_id=user_id,
                actor_username=actor.username if actor else username,
                actor_full_name=actor.full_name if actor else None,
                status_before="Approved",
                status_after=new_status,
                reason=reason,
                approval_event_id=ended.id if ended else None,
            ))

            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(db_itr)
            return db_itr
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error revoking approval for ITR {itr_id}: {e}", exc_info=True)
            raise e

    def delete_itr(self, itr_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
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
            if not db_itr or not record_in_scope(db_itr, scope):
                return False

            # Lock FIRST, re-read AFTER (2026-09-20): everything below — status, references, evidence —
            # is decided on what the lock now guards, so a request that changed the ITR or its
            # checklists a moment ago (an approval, a Void, a saved result) cannot be missed.
            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):
                self.repo.db.rollback()
                return False                                   # already deleted by a request that held the lock first

            # An Approved or Void ITR is a locked record: it is never deleted, whatever its checklists
            # contain (historical/anomalous data may have none, or none that count as evidence).
            if db_itr.status in ('Approved', 'Void'):
                raise ValueError(
                    f"Cannot delete ITR '{db_itr.documentNumber}': it is {db_itr.status} (a locked record). "
                    f"Approved and Void ITRs are kept for the record."
                )

            # History preservation (2026-09-20). Read on the locked, re-read state, before anything is written.
            # (a) An ITR that was ever approved keeps its record even after the approval is revoked and even
            #     if its checklists are gone: any approval EVENT protects it, and so does an approver /
            #     approval time saved on the row itself (records from before events existed). ITRs with
            #     neither are not guessed about — nothing is inferred and nothing is back-filled.
            event_count = self.repo.db.query(models.ITRApprovalEvent.id).filter(
                models.ITRApprovalEvent.itr_id == itr_id
            ).count()
            row_history = [f for f in ('approvedBy', 'approvedAt') if str(getattr(db_itr, f) or '').strip()]
            if event_count or row_history:
                raise ValueError(
                    f"Cannot delete ITR '{db_itr.documentNumber}': it has approval history "
                    f"({event_count} recorded approval/revocation event(s)"
                    f"{', plus ' + ' / '.join(row_history) + ' saved on the record' if row_history else ''}). "
                    f"ITRs that were ever approved are kept for the record."
                )
            # 勾稽鎖定：刪除 ITR 前確認沒有 NCR 透過 reInspectionNumber 參照此 ITR
            if db_itr.documentNumber:
                referencing_ncrs = self.repo.db.query(models.NCR).filter(
                    models.NCR.reInspectionNumber == db_itr.documentNumber
                ).all()
                if referencing_ncrs:
                    ncr_refs = [ncr.documentNumber or ncr.id for ncr in referencing_ncrs]
                    raise ValueError(
                        f"Cannot delete ITR '{db_itr.documentNumber}': "
                        f"referenced by NCR(s): {', '.join(ncr_refs)}. "
                        f"Please remove the re-inspection reference from those NCRs first."
                    )

                # NCRs raised from this ITR (create_ncr_from_itr sets NCR.itrNumber) and Observations that cite it
                # keep its number as their origin; deleting it left that origin pointing at nothing and broke
                # Q-Workflow's re-inspection lookup, which resolves NCR.itrNumber (2026-10-10).
                # itrNumber is free text on NCR / OBS, so a citer may sit outside the caller's scope: those are
                # counted, never named.
                citers = self.repo.db.query(models.NCR).filter(models.NCR.itrNumber == db_itr.documentNumber).all() \
                    + self.repo.db.query(models.OBS).filter(models.OBS.itrNumber == db_itr.documentNumber).all()
                if citers:
                    visible = [str(c.documentNumber) for c in citers if record_in_scope(c, scope)]
                    hidden = len(citers) - len(visible)
                    parts = visible + ([f"{hidden} record(s) outside your access"] if hidden else [])
                    raise ValueError(
                        f"Cannot delete ITR '{db_itr.documentNumber}': it is cited as the source ITR by "
                        f"{', '.join(parts)}. Void the ITR instead of deleting it."
                    )

            # (b) A re-inspection points at its original by originalItrId. Deleting the original would cut the
            #     first-inspection -> re-inspection chain (the old code cleared the pointer to let the delete
            #     succeed); the original is now kept while anything refers to it.
            referencing_itrs = self.repo.db.query(models.ITR.documentNumber).filter(
                models.ITR.originalItrId == itr_id
            ).all()
            if referencing_itrs:
                raise ValueError(
                    f"Cannot delete ITR '{db_itr.documentNumber}': re-inspection ITR(s) "
                    f"{', '.join(str(r[0]) for r in referencing_itrs)} refer to it as their original. "
                    f"The first-inspection -> re-inspection chain is kept."
                )

            # Evidence-protection hardening (2026-09-19): deleting the ITR
            # outright must not be a back door around Unlink's own evidence
            # check — the bulk-cleanup below has no status/content check at
            # all today, so anyone with plain itr:delete:all could silently
            # wipe out Pass/Fail Checklist instances just by deleting their
            # parent ITR. Refuse the whole delete if any owned instance
            # holds evidence; Void the ITR instead (Checklist instances
            # stay intact but frozen — see checklist_service.py's parent-
            # ITR-status lock).
            owned_instances = self.repo.db.query(models.Checklist).populate_existing().filter(
                models.Checklist.itrId == itr_id
            ).all()                                            # fresh rows: evidence saved a moment ago counts
            evidence_instances = [c for c in owned_instances if _instance_has_historical_evidence(c)]
            if evidence_instances:
                raise ValueError(
                    f"Cannot delete ITR '{db_itr.documentNumber}' — it has Checklist "
                    f"instance(s) holding inspection evidence: "
                    f"{', '.join(c.recordsNo for c in evidence_instances)}. "
                    f"Void the ITR instead of deleting it."
                )

            # Capture old values for audit
            old_val = {c.name: getattr(db_itr, c.name) for c in db_itr.__table__.columns}

            # Clean up owned Checklist instances (§17: an instance is a
            # deep copy that belongs to this ITR, with no independent
            # existence — Checklist.itrId declares ondelete="CASCADE" and
            # the ORM relationship declares cascade="all, delete-orphan",
            # but SQLite's FK enforcement is off so neither actually fires
            # without this explicit cleanup). Safe now — the check above
            # already guarantees none of these hold evidence.
            self.repo.db.query(models.Checklist).filter(
                models.Checklist.itrId == itr_id
            ).delete()

            # (No back-reference clearing any more: an ITR that a re-inspection refers to is refused above,
            # so nothing can be left pointing at a deleted original.)

            # Delete the record (flushed, not committed): the instance cleanup, the back-reference
            # nulling above, the ITR row and the audit entry all commit together or not at all.
            self.repo.delete(db_itr, commit=False)

            log_audit(
                self.repo.db, "DELETE", "ITR", itr_id, old_val.get("documentNumber"),
                old_value=old_val, user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()
            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting ITR {itr_id}: {e}", exc_info=True)
            raise e

    def link_checklist(self, itr_id: str, checklist_id: str,
                       user_id: int = None, username: str = None, scope=None) -> Optional[models.ITR]:
        """
        Link a checklist *template* to an ITR by creating an INSTANCE (§17).

        The chosen checklist is treated as a blank, reusable template that is
        shared across projects — it is NEVER mutated. Instead we deep-copy its
        structure into a fresh Checklist row that belongs to this ITR (``itrId``)
        and points back to the template (``template_id``). That instance is what
        the user fills in, and what ``_validate_approval`` / print read — so the
        table is the single source of truth (no more detail_data JSON snapshot).

        Args:
            itr_id: ITR identifier
            checklist_id: Checklist TEMPLATE id to instantiate onto the ITR
            user_id / username: actor for the audit trail

        Returns:
            Updated ITR object, or None if the ITR does not exist (or is out
            of the caller's scope — same as every other ITR mutation).
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr or not record_in_scope(db_itr, scope):
                return None

            # Lock first, re-read after (2026-09-20): a concurrent approval must not
            # be able to snapshot the ITR between this check and this write.
            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):
                self.repo.db.rollback()
                return None

            # §17 isolation hardening (2026-09-19): linking a fresh blank
            # instance onto an already-Approved/Void ITR would create a row
            # that Checklist's own new parent-ITR-status lock (see
            # checklist_service.py::update_checklist) makes permanently
            # unfillable — nobody could ever enter results into it. Block
            # at the source instead.
            if db_itr.status in ('Approved', 'Void'):
                raise ValueError(
                    f"Cannot link a checklist while ITR '{db_itr.documentNumber}' is "
                    f"{db_itr.status}. Move it back to 'In Progress' first."
                )

            template = self.repo.db.query(models.Checklist).filter(
                models.Checklist.id == checklist_id
            ).first()
            # The SOURCE must be readable by the caller under exactly the rule GET /checklist/{id} applies
            # (record_in_scope, unchanged: a NULL project / contractor is NOT a public template). This is a
            # separate check from the target ITR's scope above and from the ownership the new instance gets
            # from that ITR below — none of the three can stand in for another. It runs before the
            # "not a blank template" message (which would otherwise confirm that an out-of-scope instance
            # id exists) and before any reference number, instance or audit entry is created.
            if not template or not record_in_scope(template, scope):
                raise TemplateNotFoundError("Checklist template not found")

            # A blank template has both itrId and template_id NULL (see the
            # §17 comment on the Checklist model) — anything else is itself an
            # ITR-bound instance carrying real, filled-in inspection answers
            # in detail_data, not a blank structure. Copying that in as if it
            # were blank would leak one ITR's answers onto another's instance.
            if template.itrId is not None or template.template_id is not None:
                raise ValueError(
                    f"Checklist {checklist_id} is an ITR-bound instance, not a "
                    "blank template — link the template it was created from instead."
                )

            itr_vendor = db_itr.vendor_ref.name if db_itr.vendor_ref else ''
            instance = models.Checklist(
                id=str(uuid.uuid4()),
                recordsNo=generate_reference_no(self.repo.db, itr_vendor, 'CHECKLIST'),
                activity=template.activity,
                date=template.date,
                status='Ongoing',                 # fresh — not yet inspected
                packageName=template.packageName,
                location=template.location,
                itpIndex=template.itpIndex,
                itpId=template.itpId,
                itpVersion=template.itpVersion,
                detail_data=template.detail_data,  # blank item structure (copied)
                passCount=0,
                failCount=0,
                project_id=db_itr.project_id,
                # Contractor ownership comes from the parent ITR as re-read under the write lock above (the real
                # FK column, never a client value): a contractor-scoped user must be able to see the instance
                # they just created. NULL is NOT "visible to everyone" — record_in_scope excludes it.
                contractor_id=db_itr.vendor_id,
                itrId=db_itr.id,
                itrNumber=db_itr.documentNumber,
                template_id=template.id,
                # §17 versioning (2026-09-19): snapshot which version of the
                # template this instance was made from — captured once,
                # here, never updated again even if the template changes
                # later.
                source_template_version=template.version,
            )
            # Instance + audit entry in ONE transaction (2026-09-20): no commit before the audit entry exists.
            self.repo.db.add(instance)
            self.repo.db.flush()

            log_audit(
                self.repo.db, "LINK_CHECKLIST", "ITR", itr_id, db_itr.documentNumber,
                new_value={"template_id": template.id, "instance_id": instance.id},
                user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(db_itr)
            return db_itr
        except TemplateNotFoundError:
            self.repo.db.rollback()               # nothing was written; release the ITR write lock
            raise
        except Exception as e:
            self.repo.db.rollback()               # releases the ITR write lock and the reference number too
            logger.error(f"Error linking checklist to ITR {itr_id}: {e}", exc_info=True)
            raise e

    def unlink_checklist(self, itr_id: str, checklist_id: str,
                         user_id: int = None, username: str = None, scope=None) -> Optional[models.ITR]:
        """
        Remove a checklist instance from an ITR (§17).

        Deletes the instance row (it is an ITR-owned copy, not a template). The
        instance must actually belong to this ITR; templates and other ITRs'
        instances are never touched.

        Returns the updated ITR, or None if the ITR or instance is not found
        (or the ITR is out of the caller's scope).
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr or not record_in_scope(db_itr, scope):
                return None

            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):
                self.repo.db.rollback()
                return None

            # §17 isolation hardening (2026-09-19): unlinking deletes the
            # instance outright — a stronger violation of "approved
            # evidence is protected" than merely editing it would be.
            if db_itr.status in ('Approved', 'Void'):
                raise ValueError(
                    f"Cannot unlink a checklist while ITR '{db_itr.documentNumber}' is "
                    f"{db_itr.status}. Move it back to 'In Progress' first."
                )

            instance = self.repo.db.query(models.Checklist).filter(
                models.Checklist.id == checklist_id,
                models.Checklist.itrId == itr_id,
            ).first()
            if not instance:
                return None

            # Evidence-protection hardening (2026-09-19): the Approved/Void
            # check above only guards the parent ITR's *current* status —
            # but that status can itself be changed (e.g. Approved -> In
            # Progress) precisely to get past it. Check the instance's own
            # content directly: an instance that already holds real
            # inspection results can never be hard-deleted via Unlink,
            # regardless of the parent ITR's status. Checklist has no Void/
            # archive state to route it through instead (confirmed:
            # WorkflowEngine.TRANSITIONS["Checklist"] has no such state),
            # so a mistaken link can only be undone while it still has no
            # evidence — otherwise this is a hard refusal, not a permission
            # gate, per the instruction not to just add a check that then
            # allows the delete to proceed.
            if _instance_has_historical_evidence(instance):
                evidence_note = (
                    f"first recorded {instance.evidence_recorded_at}" if instance.evidence_recorded_at
                    else f"status={instance.status}, passCount={instance.passCount}, failCount={instance.failCount}"
                )
                raise ValueError(
                    f"Cannot unlink Checklist '{instance.recordsNo}' — it has held "
                    f"inspection evidence ({evidence_note}), even if its fields have since "
                    f"been cleared. Checklist has no archive/void state to route it through "
                    f"instead; an instance that has ever held real results can never be removed."
                )

            # Delete + audit entry in ONE transaction (2026-09-20).
            self.repo.db.delete(instance)
            self.repo.db.flush()

            log_audit(
                self.repo.db, "UNLINK_CHECKLIST", "ITR", itr_id, db_itr.documentNumber,
                old_value={"instance_id": checklist_id},
                user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(db_itr)
            return db_itr
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error unlinking checklist from ITR {itr_id}: {e}", exc_info=True)
            raise e

    def create_ncr_from_itr(self, itr_id: str,
                            user_id: int = None, username: str = None,
                            scope=None) -> Optional[models.NCR]:
        """
        Create an NCR from a failed or rejected ITR.

        Pre-populates the NCR with data from the source ITR so the user
        does not have to re-enter vendor, NOI reference, etc.

        Args:
            itr_id: ITR identifier
            user_id: ID of user performing the action
            username: Username of user performing the action

        Returns:
            The newly created NCR object, or None if the ITR does not
            exist (or is out of the caller's scope)

        Raises:
            ValueError: If the ITR is not in a failed/rejected state
            Exception: If creation fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr or not record_in_scope(db_itr, scope):
                return None

            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):
                self.repo.db.rollback()
                return None

            # Creating the NCR writes back into the source ITR (ncrNumber). An Approved or Void ITR is
            # a locked record, so that write-back — and therefore this action — is refused outright.
            # (Ordinary NCR creation through the NCR module is a different path and is unaffected.)
            if db_itr.status in ('Approved', 'Void'):
                raise ValueError(
                    f"Cannot create an NCR from ITR '{db_itr.documentNumber}': it is {db_itr.status} "
                    f"(a locked record) and cannot be modified. Raise the NCR from the NCR module instead."
                )

            # Only allow NCR creation from a failed or rejected ITR
            if db_itr.inspectionResult != "Fail" and db_itr.status != "Reject":
                raise ValueError(
                    f"Cannot create NCR from ITR '{db_itr.documentNumber}': "
                    f"inspectionResult must be 'Fail' or status must be 'Reject' "
                    f"(current inspectionResult='{db_itr.inspectionResult}', status='{db_itr.status}')"
                )

            # One live NCR per ITR from this action (2026-10-10): a second click used to raise another NCR and
            # overwrite ITR.ncrNumber, leaving the first NCR pointing at an ITR that no longer pointed back (and
            # without its delete protection). Allowed again only when no live (non-Void) NCR is tied to this ITR.
            # Decided on the NCRs themselves — the one ITR.ncrNumber names AND every NCR whose itrNumber cites this
            # ITR — not on ITR.ncrNumber alone, which an ordinary ITR save can clear (independent review, 2026-10-10).
            tied = []
            if db_itr.ncrNumber:
                tied += self.repo.db.query(models.NCR).filter(models.NCR.documentNumber == db_itr.ncrNumber).all()
            if db_itr.documentNumber:
                tied += self.repo.db.query(models.NCR).filter(models.NCR.itrNumber == db_itr.documentNumber).all()
            live = [n for n in tied if n.status != 'Void']
            if live:
                visible = sorted({n.documentNumber for n in live if record_in_scope(n, scope)})
                named = f"NCR {', '.join(visible)}" if visible else "an NCR"
                raise ValueError(
                    f"ITR '{db_itr.documentNumber}' already has {named} raised from it. "
                    f"Continue with that NCR, or void it before raising a new one."
                )

            # Resolve vendor name for the NCR
            vendor_name = db_itr.vendor  # uses the @property

            ncr_data = {
                "vendor_id": db_itr.vendor_id,
                "project_id": db_itr.project_id,
                "noiNumber": db_itr.noiNumber,
                "itrNumber": db_itr.documentNumber,
                "description": f"NCR raised from failed ITR {db_itr.documentNumber}",
                "status": "Open",
                "raiseDate": datetime.now().strftime('%Y-%m-%d'),
                "rev": "0",
                "submit": "",
            }

            # Generate NCR documentNumber
            ncr_data['documentNumber'] = generate_reference_no(
                self.repo.db, vendor_name or '', 'NCR'
            )

            db_ncr = models.NCR(**ncr_data)
            db_ncr.id = str(uuid.uuid4())

            self.repo.db.add(db_ncr)
            self.repo.db.flush()

            # Link the NCR back to the ITR
            db_itr.ncrNumber = db_ncr.documentNumber
            self.repo.db.flush()

            # NCR row + the ITR back-link + BOTH audit entries are ONE transaction (2026-09-20):
            # the single commit is below, after the second entry.

            # Log audit trail for NCR creation
            log_audit(
                self.repo.db, "CREATE", "NCR", db_ncr.id, db_ncr.documentNumber,
                new_value={
                    "source": "ITR",
                    "sourceItrId": itr_id,
                    "sourceItrNumber": db_itr.documentNumber,
                },
                user_id=user_id, username=username, strict=True,
            )

            # Log audit trail on the ITR side
            log_audit(
                self.repo.db, "CREATE_NCR_FROM_ITR", "ITR", itr_id, db_itr.documentNumber,
                new_value={"ncrId": db_ncr.id, "ncrNumber": db_ncr.documentNumber},
                user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(db_ncr)
            return db_ncr
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating NCR from ITR {itr_id}: {e}", exc_info=True)
            raise e

    def create_reinspection(self, itr_id: str,
                            user_id: int = None, username: str = None,
                            scope=None) -> Optional[models.ITR]:
        """
        Create a re-inspection ITR from a failed or rejected ITR.

        Copies key fields from the original ITR and marks the new one
        as a re-inspection with an incremented counter.

        Args:
            itr_id: ITR identifier of the original (failed/rejected) ITR
            user_id: ID of user performing the action
            username: Username of user performing the action

        Returns:
            The newly created re-inspection ITR object, or None if the
            original ITR does not exist (or is out of the caller's scope)

        Raises:
            ValueError: If the original ITR is not in a failed/rejected state
            Exception: If creation fails
        """
        try:
            db_itr = self.repo.get_by_id(itr_id)
            if not db_itr or not record_in_scope(db_itr, scope):
                return None

            # Lock first, re-read after (2026-09-20): the eligibility check below and the copy of the
            # original's data and instances further down are made from the SAME locked state — a
            # concurrent result change, status change or approval cannot fall between them.
            lock_itr_for_write(self.repo.db, itr_id)
            if not reload_locked(self.repo.db, db_itr):
                self.repo.db.rollback()
                return None

            # Approved/Void boundary (2026-09-29 business decision, confirmed after isolated
            # verification found the prior code let both through — see the chain-walkthrough
            # handoff's re-inspect boundary sections): Void is terminal and can never be
            # re-inspected. Approved must first go back to In Progress via the dedicated
            # revoke-approval action (which itself requires ITR_APPROVE and a reason) before the
            # normal re-inspection conditions below are even considered — there is no "re-inspect
            # straight off an Approved record" path.
            if db_itr.status == 'Void':
                raise ValueError(
                    f"Cannot create a re-inspection from ITR '{db_itr.documentNumber}': it is Void. "
                    f"A Void record can never be re-inspected."
                )
            if db_itr.status == 'Approved':
                raise ValueError(
                    f"Cannot create a re-inspection from ITR '{db_itr.documentNumber}': it is Approved. "
                    f"Revoke the approval first (moves it back to In Progress), then re-inspect if it "
                    f"still meets the usual conditions."
                )

            # Only allow re-inspection from a failed or rejected ITR
            if db_itr.inspectionResult != "Fail" and db_itr.status != "Reject":
                raise ValueError(
                    f"Cannot create re-inspection from ITR '{db_itr.documentNumber}': "
                    f"inspectionResult must be 'Fail' or status must be 'Reject' "
                    f"(current inspectionResult='{db_itr.inspectionResult}', status='{db_itr.status}')"
                )

            # The re-inspection is a new ITR filed under the same NOI, so the same rule as any new ITR applies: a
            # Closed or Void NOI takes no new ITR (independent review, 2026-10-10 — an NOI can be voided while an ITR
            # under it is still Reject).
            if db_itr.noiNumber:
                noi = self.repo.db.query(models.NOI).filter(models.NOI.referenceNo == db_itr.noiNumber).first()
                if noi and noi.status in ('Closed', 'Void'):
                    raise ValueError(
                        f"Cannot create a re-inspection from ITR '{db_itr.documentNumber}': its NOI "
                        f"'{db_itr.noiNumber}' is {noi.status}, and a new ITR cannot be filed under it."
                    )

            vendor_name = db_itr.vendor  # uses the @property

            new_doc_number = generate_reference_no(
                self.repo.db, vendor_name or '', 'ITR'
            )

            new_itr_data = {
                "vendor_id": db_itr.vendor_id,
                "project_id": db_itr.project_id,
                "noiNumber": db_itr.noiNumber,
                "subject": db_itr.subject,
                "description": db_itr.description or '',
                "rev": "0",
                "submit": "",
                "status": "In Progress",
                "documentNumber": new_doc_number,
                "raiseDate": datetime.now().strftime('%Y-%m-%d'),
                "isReInspection": True,
                "originalItrId": itr_id,
                "reInspectionCount": (db_itr.reInspectionCount or 0) + 1,
                "eventNumber": db_itr.eventNumber,
                "checkpoint": db_itr.checkpoint,
                "discipline": db_itr.discipline,
                "type": db_itr.type,
                "foundLocation": db_itr.foundLocation,
                # Initialize detail_data with _version for optimistic locking
                "detail_data": json.dumps({"_version": 0}, ensure_ascii=False),
            }

            db_new_itr = models.ITR(**new_itr_data)
            db_new_itr.id = str(uuid.uuid4())

            # The new ITR, EVERY copied instance and both audit entries are one unit (2026-09-20):
            # nothing is committed until all of them exist; any failure rolls back the lot
            # (previously the new ITR was committed first, so a later failure left an ITR without
            # its instances, and the audit entries were never committed at all).
            self.repo.db.add(db_new_itr)
            self.repo.db.flush()

            # Re-inspection snapshot preservation (2026-09-19): default to
            # reusing the *original failing instance's* item/criteria
            # content and source_template_version — never re-derive from
            # the live template, which may have been edited since. If
            # switching template/version is ever wanted, that needs its
            # own explicit action recording a reason/source/diff; until
            # then, silently picking up "whatever the template currently
            # looks like" is exactly what this avoids. Copies every
            # instance the original ITR had (usually one), each seeded
            # fresh (Ongoing, no results) via _blanked_item_results.
            original_instances = self.repo.db.query(models.Checklist).populate_existing().filter(
                models.Checklist.itrId == itr_id
            ).order_by(models.Checklist.recordsNo, models.Checklist.id).all()      # fresh rows, deterministic order
            for original_instance in original_instances:
                snapshot = models.Checklist(
                    id=str(uuid.uuid4()),
                    recordsNo=generate_reference_no(self.repo.db, vendor_name or '', 'CHECKLIST'),
                    activity=original_instance.activity,
                    date=original_instance.date,
                    status='Ongoing',
                    packageName=original_instance.packageName,
                    location=original_instance.location,
                    itpIndex=original_instance.itpIndex,
                    itpId=original_instance.itpId,
                    itpVersion=original_instance.itpVersion,
                    detail_data=_blanked_item_results(original_instance.detail_data),
                    passCount=0,
                    failCount=0,
                    project_id=db_new_itr.project_id,
                    contractor_id=db_new_itr.vendor_id,        # ownership from the NEW re-inspection ITR, like project_id
                    itrId=db_new_itr.id,
                    itrNumber=db_new_itr.documentNumber,
                    template_id=original_instance.template_id,
                    source_template_version=original_instance.source_template_version,
                )
                self.repo.db.add(snapshot)
            self.repo.db.flush()

            # Log audit trail for the new re-inspection ITR
            log_audit(
                self.repo.db, "CREATE", "ITR", db_new_itr.id, db_new_itr.documentNumber,
                new_value={
                    "source": "RE_INSPECTION",
                    "originalItrId": itr_id,
                    "originalItrNumber": db_itr.documentNumber,
                    "reInspectionCount": db_new_itr.reInspectionCount,
                },
                user_id=user_id, username=username, strict=True,
            )

            # Log audit trail on the original ITR
            log_audit(
                self.repo.db, "CREATE_REINSPECTION", "ITR", itr_id, db_itr.documentNumber,
                new_value={
                    "newItrId": db_new_itr.id,
                    "newItrNumber": db_new_itr.documentNumber,
                },
                user_id=user_id, username=username, strict=True,
            )

            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(db_new_itr)
            return db_new_itr
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating re-inspection from ITR {itr_id}: {e}", exc_info=True)
            raise e

    def export_docx(self, itr_id: str, scope=None):
        """
        Generate a formal .docx report for one ITR (ITR-EXPORT-DOCX-2026-001),
        mirroring NCRService.export_docx's approach: built directly with
        python-docx via core/docx_builder.py, not an HTML-to-docx conversion.

        Includes the linked Checklists' Item/Criteria/Situation/Result data —
        previously missing even from the web print preview (fixed in
        ITR-INPUT-UX-IMPLEMENT-2026-006) and never present in any ITR export
        before this.

        Returns a StreamingResponse; raises ValueError (-> 404 in the router)
        if the ITR doesn't exist or isn't in the caller's scope.
        """
        from core import docx_builder as db
        from core.uploads import upload_root as _upload_root

        itr = self.get_itr(itr_id, scope=scope)
        if not itr:
            raise ValueError("ITR not found")

        # Photo/attachment sections — mirrors NCRService.export_docx's _photo_paths exactly
        # (legacy JSON column or detail_data key, plus the Attachment table, resolved to local
        # filesystem paths via docx_builder.resolve_local_upload_path). Added per user follow-up
        # after the first version of this export shipped with no images at all.
        upload_root = _upload_root()
        detail_data_dict = self._get_detail_data_dict(itr)

        def _parse_json_list(raw):
            if not raw:
                return []
            try:
                parsed = json.loads(raw)
                return parsed if isinstance(parsed, list) else []
            except (TypeError, ValueError):
                return []

        def _attachment_paths(legacy_value, category: str) -> list:
            legacy = [u for u in (legacy_value if isinstance(legacy_value, list) else _parse_json_list(legacy_value)) if isinstance(u, str)]
            attachments = self.repo.db.query(models.Attachment).filter(
                models.Attachment.entity_type == "itr",
                models.Attachment.entity_id == itr_id,
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

        defect_photos = _attachment_paths(itr.defectPhotos, "defectPhoto")
        improvement_photos = _attachment_paths(itr.improvementPhotos, "improvementPhoto")
        drawings = _attachment_paths(detail_data_dict.get("drawings"), "drawing")
        certificates = _attachment_paths(detail_data_dict.get("certificates"), "certificate")
        general_attachments = _attachment_paths(itr.attachments, "attachment")

        # Related ITP: derived live from the linked NOI, same as the frontend's
        # `relatedItp` (ITR-INPUT-UX-IMPLEMENT-2026-003/005) — the backend has no
        # persisted itpNo column on ITR (confirmed dead field, see that round's
        # findings), so this mirrors the same NOI -> ITP lookup server-side,
        # read-only, no writes.
        related_itp_display = None
        if itr.noiNumber:
            noi = self.repo.db.query(models.NOI).filter(models.NOI.referenceNo == itr.noiNumber).first()
            if noi and noi.itpNo:
                itp = self.repo.db.query(models.ITP).filter(models.ITP.referenceNo == noi.itpNo).first()
                if itp:
                    related_itp_display = itp.referenceNo or itp.description

        def _result_label(raw) -> str:
            v = (raw or "").strip() if isinstance(raw, str) else raw
            if not v or v == "-":
                return "未填寫 Not filled"
            if v == "O":
                return "合格 Pass"
            if v == "X":
                return "不合格 Fail"
            if v == "/":
                return "不適用 N/A"
            return str(raw)

        doc = db.new_document()
        db.add_masthead(
            doc, "檢驗及測試記錄", "INSPECTION & TEST RECORD",
            doc_no=itr.documentNumber, rev=itr.type, status=itr.status,
        )

        db.add_field_grid(doc, [
            [("編號", "Reference No.", itr.documentNumber), ("主旨", "Subject", itr.subject)],
            [("檢驗日期", "Inspection Date", itr.raiseDate), ("版次", "Version", itr.type)],
            [("到期日", "Due Date", itr.dueDate), ("結案日期", "Close-out Date", itr.closeoutDate)],
            [("NOI 編號", "NOI No.", itr.noiNumber), ("承包商", "Contractor", itr.vendor)],
            [("關聯 ITP", "Related ITP", related_itp_display), ("NCR 編號", "NCR No.", itr.ncrNumber)],
            [("狀態", "Status", itr.status), ("提出人", "Raised By", itr.raisedBy)],
        ])

        for checklist in (itr.checklists or []):
            dd = {}
            if checklist.detail_data:
                try:
                    dd = json.loads(checklist.detail_data)
                except (TypeError, ValueError):
                    dd = {}
            items = dd.get("items") or []
            heading = f"{checklist.recordsNo or ''} — {checklist.activity or ''}"
            if checklist.status:
                heading += f"（{checklist.status}）"
            db.add_paragraph(doc, heading, bold=True)
            if items:
                db.add_data_table(
                    doc,
                    headers=["#", "項目 Item", "標準 Criteria", "現況 Situation", "結果 Result"],
                    rows=[
                        [str(i + 1), it.get("item"), it.get("criteria"), it.get("situation"), _result_label(it.get("result"))]
                        for i, it in enumerate(items)
                    ],
                )
            else:
                db.add_paragraph(doc, "（尚無檢驗項目 No items）", size=9, italic=True)
            doc.add_paragraph()

        for label_zh, label_en, value in [
            ("參考標準", "Reference Standards", detail_data_dict.get("referenceStandards")),
            ("不符合地點", "Found Location", itr.foundLocation),
            ("說明", "Details/Description", itr.description),
            ("備註", "Remark", itr.remark),
        ]:
            if not value:
                continue
            db.add_subsection_heading(doc, label_zh, label_en)
            db.add_field_box(doc, value=value)

        # Photographic record + non-photo attachments — added per user follow-up ("改" after
        # noting the first version shipped with no images at all).
        if defect_photos or improvement_photos:
            doc.add_page_break()
            db.add_subsection_heading(doc, "照片紀錄", "Photographic Record")
            db.add_photo_section(doc, "缺失照片 Defect Photos", defect_photos)
            db.add_photo_section(doc, "改善照片 Improvement Photos", improvement_photos)

        if drawings or certificates or general_attachments:
            db.add_subsection_heading(doc, "附件清單", "Attachments")
            db.add_file_list(doc, "最新圖面 Latest Drawings", drawings)
            db.add_file_list(doc, "校驗證書 Calibration Certificates", certificates)
            db.add_file_list(doc, "一般附件 Attachments", general_attachments)

        db.add_sign_off_grid(doc, [
            {"num": "1", "zh": "製表", "en": "Prepared By"},
            {"num": "2", "zh": "複核", "en": "Reviewed By"},
            {"num": "3", "zh": "核准", "en": "Approved By"},
        ])

        return db.finalize_response(doc, itr.documentNumber or "ITR")
