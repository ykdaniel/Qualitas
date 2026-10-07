"""
Checklist Service

Business logic layer for Checklist module
"""

import json
import uuid
import logging
from datetime import datetime
from typing import List, Optional
from sqlalchemy import inspect

import models
import schemas
from repositories.checklist_repository import ChecklistRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    lock_itr_for_write,
    reload_locked,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)
from core import validators

logger = logging.getLogger(__name__)

# A filled-in inspection item result is one of these three markers (see
# Checklist.tsx's item.result cycle: '' -> 'O' -> 'X' -> '/' -> 'O' ...).
# An empty/unset item has result == '' (or the key absent entirely).
_RESULT_MARKERS = {'O', 'X', '/'}


def _touched_fields_carry_results(fields: dict) -> bool:
    """True iff the *keys actually present* in `fields` (a partial create/
    update payload, or a full row's current values) would put real
    inspection evidence into status/passCount/failCount/detail_data. Only
    inspects touched keys — never re-flags an already-noncompliant legacy
    row for an unrelated edit that doesn't touch its results (see BACKLOG
    "Checklist bare-template backend gap" / §17 isolation hardening,
    2026-09-19).

    Checks each item's `situation` (the observation/measurement text —
    e.g. "Measured 14mm", per Checklist.tsx's "Enter observation..."
    placeholder) in addition to `result` (2026-09-19 fix): a row can hold
    real recorded evidence with `situation` filled in while `result` is
    still blank (not yet judged Pass/Fail/N-A) — the original version of
    this check only looked at `result` and missed that case entirely,
    inventoried against the actual item shape (`item`/`criteria`/
    `situation`/`result` — no separate photo/attachment/remark columns
    exist anywhere on the Checklist model itself, confirmed by inspecting
    every column)."""
    if fields.get('status') in ('Pass', 'Fail'):
        return True
    if (fields.get('passCount') or 0) > 0 or (fields.get('failCount') or 0) > 0:
        return True
    detail = fields.get('detail_data')
    if detail:
        try:
            parsed = json.loads(detail) if isinstance(detail, str) else detail
        except (TypeError, ValueError):
            parsed = None
        items = parsed.get('items') if isinstance(parsed, dict) else None
        if isinstance(items, list):
            for it in items:
                if not isinstance(it, dict):
                    continue
                if it.get('result') in _RESULT_MARKERS:
                    return True
                if (it.get('situation') or '').strip():
                    return True
                # An N/A reason (2026-09-19) is the user's own recorded
                # justification — evidence just like an observation, so
                # clearing it later must not make a row look untouched.
                if str(it.get('naReason') or '').strip():
                    return True
    return False


def _parse_detail_items(detail_data) -> list:
    """Best-effort extraction of the `items` list from a detail_data value
    (JSON string or already-parsed dict) — never raises, returns [] for
    anything unparsable so callers can compare safely."""
    if not detail_data:
        return []
    try:
        parsed = json.loads(detail_data) if isinstance(detail_data, str) else detail_data
    except (TypeError, ValueError):
        return []
    items = parsed.get('items') if isinstance(parsed, dict) else None
    return items if isinstance(items, list) else []


def _items_structure_changed(old_items: list, new_items: list) -> bool:
    """True if an ITR-owned instance's item/criteria list would drift from
    what was fixed at link time — situation/result are expected to change
    as the inspection is filled in, but item/criteria (and the count/order
    of items) are authored only in the template library and must never
    change on an instance via a normal update (2026-09-19, browser-
    verified gap: the frontend snapshot editor previously offered Add/
    Remove buttons with no backend check stopping the same via direct API
    use). The frontend always resends the whole record on save (same
    pattern as every other locked-field check in this file), so an
    unchanged list must short-circuit to "not changed" up front rather
    than fail the shape check below for non-dict item representations
    used in some older/lighter-weight test fixtures.

    Deliberately does NOT special-case old_items being empty (2026-09-19,
    tightened after browser verification): link_checklist always deep-
    copies the template's items at creation time, so a real instance is
    never legitimately empty — an empty-to-non-empty transition is exactly
    as much a structural change as any other and must be rejected the same
    way, not waved through as "first-time population". Only a genuine
    no-op (old == new, including empty == empty) is exempt."""
    if old_items == new_items:
        return False
    if len(old_items) != len(new_items):
        return True
    for old_it, new_it in zip(old_items, new_items):
        if not isinstance(old_it, dict) or not isinstance(new_it, dict):
            return True
        if old_it.get('item') != new_it.get('item') or old_it.get('criteria') != new_it.get('criteria'):
            return True
    return False


def na_reason_problems(old_items: list, new_items: list) -> list:
    """N/A reason rules for an ITR-owned instance's item list (2026-09-19).

    - An item whose result is '/' (N/A) must carry a non-blank `naReason`
      (a separate key from `situation`, which stays the observation).
    - EXCEPT a historical '/' that this write leaves exactly as it was
      (already '/', no reason before, no reason now): it is not touched,
      not invented a reason for, and not blocked — the UI labels it
      "no reason recorded (historical)".
    - Turning a '/' with a recorded reason into a blank reason is a change
      and is rejected like any new N/A without one.
    - A non-blank `naReason` on an item whose result is not '/' is rejected
      rather than silently dropped (the client clears it when the choice
      changes; the prior value stays in the audit trail).
    Items are compared by position — the structure guard already guarantees
    item order/count is unchanged by the time this runs."""
    problems = []
    for idx, new_it in enumerate(new_items):
        if not isinstance(new_it, dict):
            continue
        old_it = old_items[idx] if idx < len(old_items) and isinstance(old_items[idx], dict) else {}
        label = new_it.get('item') or f"#{idx + 1}"
        reason = str(new_it.get('naReason') or '').strip()
        if new_it.get('result') == '/':
            old_reason = str(old_it.get('naReason') or '').strip()
            legacy_untouched = old_it.get('result') == '/' and not old_reason and not reason
            if not reason and not legacy_untouched:
                problems.append(f"item '{label}' is marked N/A but has no reason")
        elif reason:
            problems.append(f"item '{label}' has an N/A reason but its result is not N/A")
    return problems


# --- Pass-integrity (2026-09-19): one shared judgement of what an item list
# actually supports, used by BOTH the write path (update_checklist) and the
# ITR approval path (ITRService._validate_approval) so the two can never
# disagree. Nothing here trusts a client-supplied status/passCount/failCount.
#
# Result vocabulary as it exists today (see the 2026-09-19 inventory): 'O'
# pass, 'X' fail, '/' N/A, ''/absent/'-' unfilled ('-' is what the ITP
# "Generate Checklist" seed writes). Anything else is UNKNOWN — never
# guessed at. THIS ROUND a valid Pass means: a non-empty item list in which
# EVERY item is 'O' (N/A is deliberately not accepted yet — that is a
# pending business rule, not something to open up here).
_UNFILLED_MARKERS = {'', '-'}


def summarize_items(detail_data) -> dict:
    """Parse detail_data into counts. Never raises. `ok` is False when the
    value is missing/unparsable/not a dict with an `items` list — such data
    cannot support anything."""
    summary = {'ok': False, 'total': 0, 'o': 0, 'x': 0, 'na': 0, 'unfilled': 0, 'unknown': 0}
    if not detail_data:
        return summary
    try:
        parsed = json.loads(detail_data) if isinstance(detail_data, str) else detail_data
    except (TypeError, ValueError):
        return summary
    items = parsed.get('items') if isinstance(parsed, dict) else None
    if not isinstance(items, list):
        return summary
    summary['ok'] = True
    summary['total'] = len(items)
    for it in items:
        if not isinstance(it, dict):
            summary['unknown'] += 1
            continue
        result = it.get('result')
        if result is None or (isinstance(result, str) and result.strip() in _UNFILLED_MARKERS):
            summary['unfilled'] += 1
        elif result == 'O':
            summary['o'] += 1
        elif result == 'X':
            summary['x'] += 1
        elif result == '/':
            summary['na'] += 1
        else:
            summary['unknown'] += 1
    return summary


def count_mismatch_problems(pass_count, fail_count, summary: dict) -> list:
    """passCount/failCount must equal the actual number of 'O'/'X' items."""
    problems = []
    if (pass_count or 0) != summary['o']:
        problems.append(f"passCount={pass_count or 0} does not match the {summary['o']} item(s) marked O")
    if (fail_count or 0) != summary['x']:
        problems.append(f"failCount={fail_count or 0} does not match the {summary['x']} item(s) marked X")
    return problems


def pass_support_problems(pass_count, fail_count, detail_data) -> list:
    """Reasons a Pass is NOT supported by its actual content (empty list =
    supported). Valid Pass this round: non-empty item list, every item 'O',
    counts matching."""
    summary = summarize_items(detail_data)
    if not summary['ok']:
        return ["item data is missing or cannot be parsed"]
    if summary['total'] == 0:
        return ["the checklist has no items"]
    problems = []
    if summary['unfilled']:
        problems.append(f"{summary['unfilled']} item(s) are not filled in")
    if summary['x']:
        problems.append(f"{summary['x']} item(s) are marked Fail")
    if summary['na']:
        problems.append(f"{summary['na']} item(s) are marked N/A (N/A is judged but is not a pass — a checklist containing N/A is not Pass)")
    if summary['unknown']:
        problems.append(f"{summary['unknown']} item(s) have an unknown result code or format")
    problems += count_mismatch_problems(pass_count, fail_count, summary)
    return problems


def derive_checklist_status(summary: dict) -> str:
    """THE status rule (2026-09-20) — the single backend definition, mirrored by the frontend's
    deriveChecklistStatus (react-app/src/utils/checklistResult.ts); keep the two in step.

    * no parsable / empty item list, or any item not filled in, or any unknown value -> Ongoing
    * otherwise (every item judged as O / X / '/'):
        - at least one X                          -> Fail
        - no X but at least one '/'  (incl. all)  -> Ongoing  (N/A is judged, but is not a pass, and
                                                    a checklist containing it cannot be approved)
        - every item O                            -> Pass
    passCount / failCount stay exactly the number of O / X items."""
    if not summary['ok'] or summary['total'] == 0 or summary['unfilled'] or summary['unknown']:
        return 'Ongoing'
    if summary['x']:
        return 'Fail'
    if summary['na']:
        return 'Ongoing'
    return 'Pass'


def fail_support_problems(pass_count, fail_count, detail_data) -> list:
    """Reasons a declared Fail is NOT supported by the actual items (empty = supported): every item must be
    judged and at least one must be X; N/A alone (or an unfinished list) never makes a Fail; counts must match."""
    summary = summarize_items(detail_data)
    if not summary['ok']:
        return ["item data is missing or cannot be parsed"]
    if summary['total'] == 0:
        return ["the checklist has no items"]
    problems = []
    if summary['unfilled']:
        problems.append(f"{summary['unfilled']} item(s) are not filled in (a Fail needs every item judged)")
    if summary['unknown']:
        problems.append(f"{summary['unknown']} item(s) have an unknown result code or format")
    if not summary['x']:
        problems.append("no item is marked X (N/A alone does not make a Fail)")
    problems += count_mismatch_problems(pass_count, fail_count, summary)
    return problems


def _instance_has_historical_evidence(checklist: 'models.Checklist') -> bool:
    """True if this instance has EVER been marked as holding real
    inspection evidence, OR its true history is unknown and therefore
    conservatively protected. PROTECTION never depends on reliability —
    an unverified `evidence_recorded_at` protects exactly as strongly as
    a verified one, or as `evidence_historical_unknown`; reliability only
    affects how the timestamp should be DISPLAYED/interpreted, never
    whether the row is safe to delete. Checks, in order:
    1. `evidence_recorded_at` — set either by update_checklist (a real,
       known first-save moment) or, for a pre-existing row, by the v3
       repair migration (either a real moment reconstructed from a
       corroborating audit_logs entry, or an unverified leftover value
       preserved as-is from the original v2 backfill — see
       `evidence_recorded_at_reliable` to tell which). Never cleared by
       any update path once set.
    2. `evidence_historical_unknown` — set only by the migration repair,
       for a row with no provable evidence history; protected the same
       way, but doesn't claim a real timestamp.
    3. The row's CURRENT values, as a defensive fallback only — for a row
       no migration step above has reached yet.

    (2026-09-19, iterated three times the same day: first split from a
    single overloaded column after re-running the backfill on every app
    restart mis-stamped brand-new instances — db_migrations.py's
    `checklist_evidence_marker_v2` flag; then further split again after
    that same v2 fix was found to overwrite/clear genuinely reliable
    prior timestamps based on current content alone —
    `checklist_evidence_timestamp_repair_v3`.)

    This — not `_touched_fields_carry_results` alone — is what decides
    "safe to hard-delete": clearing situation/result back to blank must
    not make a record that once held evidence look safe to destroy again
    (2026-09-19 business decision)."""
    if checklist.evidence_recorded_at or checklist.evidence_historical_unknown:
        return True
    return _touched_fields_carry_results({
        'status': checklist.status,
        'passCount': checklist.passCount,
        'failCount': checklist.failCount,
        'detail_data': checklist.detail_data,
    })


def _template_content_signature(activity, detail_data) -> tuple:
    """Structural fingerprint of what a template *defines* — its activity
    (what it inspects) and its item/criteria/situation list — deliberately
    ignoring `result` (never legitimately present on a template) and every
    other field (packageName/location/contractor/inspectionDate are
    execution-context for a specific inspection run, not template content;
    confirmed against the frontend's own "Base Information" vs "Checklist
    Template" tab split). Used only to decide whether `version` bumps."""
    try:
        parsed = json.loads(detail_data) if isinstance(detail_data, str) else (detail_data or {})
    except (TypeError, ValueError):
        parsed = {}
    items = parsed.get('items') if isinstance(parsed, dict) else None
    normalized_items = tuple(
        (it.get('item'), it.get('criteria'), it.get('situation'))
        for it in items if isinstance(it, dict)
    ) if isinstance(items, list) else ()
    return (activity, normalized_items)


class ChecklistService:
    """Service layer for Checklist business logic"""

    def __init__(self, repo: ChecklistRepository):
        self.repo = repo

    def _get_parent_itr(self, db_checklist: models.Checklist) -> Optional[models.ITR]:
        """The ITR this instance belongs to, or None for a template (or an
        orphaned/legacy row — treat missing itrId as falsy, matching the
        frontend's own `!editingRecord.itrId` bare-template check rather
        than SQLAlchemy's `is not None`, since a known production anomaly
        has itrId='' rather than NULL)."""
        if not db_checklist.itrId:
            return None
        # populate_existing: the parent's status is what decides whether this write is
        # allowed — never read it from a stale identity-map copy.
        return (self.repo.db.query(models.ITR).populate_existing()
                .filter(models.ITR.id == db_checklist.itrId).first())

    def get_checklists(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.Checklist]:
        """
        Get list of Checklists with optional filters

        Args:
            skip: Number of records to skip
            limit: Maximum number of records
            **filters: Optional filters (search, status, start_date, end_date, itr_id, noi_number)

        Returns:
            List of Checklist objects
        """
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_checklist(self, checklist_id: str, scope=None) -> Optional[models.Checklist]:
        """
        Get a single Checklist by ID

        Args:
            checklist_id: Checklist identifier

        Returns:
            Checklist object if found, None otherwise
        """
        chk = self.repo.get_by_id(checklist_id)
        return chk if record_in_scope(chk, scope) else None

    def get_checklists_by_itr(self, itr_id: str) -> List[models.Checklist]:
        """
        Get all Checklists associated with a specific ITR

        Args:
            itr_id: ITR identifier

        Returns:
            List of Checklist objects
        """
        return self.repo.get_by_itr(itr_id)

    def get_checklists_by_noi(self, noi_number: str) -> List[models.Checklist]:
        """
        Get all Checklists associated with a specific NOI

        Args:
            noi_number: NOI reference number

        Returns:
            List of Checklist objects
        """
        return self.repo.get_by_noi(noi_number)

    def create_checklist(self, checklist_create: schemas.ChecklistCreate,
                        user_id: int = None, username: str = None, scope=None) -> models.Checklist:
        """
        Create a new Checklist with business logic validation

        Business logic:
        - Maps contractor name to contractor_id
        - Generates recordsNo automatically if not provided
        - Serializes JSON fields (detail_data)
        - Logs audit trail

        Args:
            checklist_create: Checklist creation schema
            user_id: ID of user creating the Checklist
            username: Username of user creating the Checklist

        Returns:
            Created Checklist object

        Raises:
            Exception: If creation fails
        """
        try:
            data = checklist_create.model_dump()
            data = _json_serialize(data, ['detail_data'])

            # §17 isolation hardening (2026-09-19): itrId/template_id are
            # provenance fields that must only ever be set by
            # ITRService.link_checklist's deep-copy — a direct POST here
            # with either one set would fabricate an "instance" that never
            # went through that flow (no guaranteed template_id back-ref,
            # no ITR-status/scope check), and _validate_approval would
            # still happily count it as a legitimately-linked checklist.
            if data.get('itrId') or data.get('template_id'):
                raise ValueError(
                    "Cannot create a Checklist with itrId or template_id set directly — "
                    "ITR-bound instances must be created via POST /itr/{itr_id}/link-checklist "
                    "so they are always a validated, template-derived copy."
                )

            # Every row created through this endpoint is therefore a bare
            # template (guard above guarantees itrId/template_id are both
            # empty) — templates must never carry inspection results.
            if _touched_fields_carry_results(data):
                raise ValueError(
                    "A Checklist without itrId/template_id is a template — it cannot hold "
                    "Pass/Fail status, passCount/failCount, or filled-in item results. "
                    "Link it to an ITR via POST /itr/{itr_id}/link-checklist to create an "
                    "editable instance."
                )

            # Validate foreign keys BEFORE allocating a reference number,
            # so failed creates don't leave gaps in the Checklist sequence.
            if data.get('itpId'):
                itp = self.repo.db.query(models.ITP).filter(models.ITP.id == data['itpId']).first()
                if not itp:
                    raise ValueError(f"ITP with ID '{data['itpId']}' not found")

            if data.get('noiNumber'):
                validators.validate_noi_reference(self.repo.db, data['noiNumber'])

            if data.get('itrNumber'):
                validators.validate_itr_reference(self.repo.db, data['itrNumber'])

            # Generate recordsNo automatically if not provided.
            # The legacy "[AUTO-GENERATE]" sentinel is still accepted for
            # backwards compatibility with frontends that send it, but it
            # is deprecated — the frontend should send null/None instead so
            # we don't overload a string value with control semantics.
            contractor_name = data.get('contractor', '')
            records_no = data.get('recordsNo')
            if records_no == "[AUTO-GENERATE]":
                logger.info(
                    "checklist_service: legacy [AUTO-GENERATE] sentinel received; "
                    "frontends should send null to request auto-generation"
                )
                records_no = None
            if not records_no:
                data['recordsNo'] = generate_reference_no(
                    self.repo.db, contractor_name, 'CHECKLIST'
                )

            # Handle contractor name -> contractor_id mapping
            if 'contractor' in data:
                contractor_name = data.pop('contractor')
                if contractor_name:
                    data['contractor_id'] = _resolve_vendor_id(self.repo.db, contractor_name)

            # P0 data isolation: confine the new record to the caller's scope.
            # Checklist exposes its contractor FK as `contractor_id` (DB column
            # is still `vendor_id`).
            enforce_create_scope(data, scope, vendor_field="contractor_id")

            # Create Checklist object
            db_checklist = models.Checklist(**data)
            if not db_checklist.id:
                db_checklist.id = str(uuid.uuid4())

            # Save to database — flush only; the commit below covers the audit entry too (2026-09-23 atomicity
            # fix, same shape as update_checklist/delete_checklist above: repo.create() used to commit on its
            # own before log_audit() ran, so a failure writing the audit entry left the new row with no
            # corresponding history).
            created = self.repo.create(db_checklist, commit=False)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "Checklist", created.id, created.recordsNo,
                new_value=checklist_create.model_dump(), user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating Checklist: {e}", exc_info=True)
            raise e

    def update_checklist(self, checklist_id: str, checklist_update: schemas.ChecklistUpdate,
                        user_id: int = None, username: str = None, scope=None) -> Optional[models.Checklist]:
        """
        Update an existing Checklist with validation

        Business logic:
        - Validates status transitions using WorkflowEngine (Ongoing <-> Pass/Fail)
        - Maps contractor name to contractor_id
        - Serializes JSON fields (detail_data)
        - Logs audit trail

        Args:
            checklist_id: Checklist identifier
            checklist_update: Checklist update schema
            user_id: ID of user updating the Checklist
            username: Username of user updating the Checklist

        Returns:
            Updated Checklist object if found, None otherwise

        Raises:
            ValueError: If status transition is invalid
            Exception: If update fails
        """
        try:
            db_checklist = self.repo.get_by_id(checklist_id)
            if not db_checklist or not record_in_scope(db_checklist, scope):
                return None

            # An instance's writes must not interleave with its ITR's approval
            # (2026-09-20): take the ITR's write lock FIRST, then re-read this row and
            # (in _get_parent_itr below) the parent's status. itrId is immutable, so it
            # is safe to read before the lock.
            if db_checklist.itrId:
                lock_itr_for_write(self.repo.db, db_checklist.itrId)
                if not reload_locked(self.repo.db, db_checklist):
                    self.repo.db.rollback()
                    return None                    # its ITR (and with it this instance) was deleted by a request that held the lock first

            # Workflow validation: Check status transition
            if checklist_update.status and not WorkflowEngine.validate_transition(
                "Checklist", db_checklist.status, checklist_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_checklist.status} to {checklist_update.status}"
                )

            # Capture old values for audit using inspect
            mapper = inspect(models.Checklist)
            old_val = {prop.key: getattr(db_checklist, prop.key) for prop in mapper.column_attrs}

            # Prepare update data
            d = checklist_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['detail_data'])

            # §17 isolation hardening (2026-09-19): itrId/template_id are
            # provenance — set once, either never (a template) or by
            # ITRService.link_checklist (an instance) — and immutable
            # afterward. A normal update walking either to a different
            # value would silently forge/re-target an instance, bypassing
            # link_checklist's template-validity and ITR-status checks.
            for _field in ('itrId', 'template_id'):
                if _field in d and d[_field] != getattr(db_checklist, _field, None):
                    raise ValueError(
                        f"Cannot change '{_field}' via a normal Checklist update — "
                        f"use the ITR's link/unlink action instead."
                    )

            # Guard: once its parent ITR is Approved or Void, a linked
            # instance is fully frozen — no field may change, including via
            # Reopen (see the Pass/Fail lock below, which is checklist-
            # status-based only and has no idea about the parent ITR). This
            # is what actually protects approved evidence: the Pass/Fail
            # lock alone can be lifted by anyone holding CHECKLIST_CLOSE,
            # but that permission only ever governs the checklist's own
            # result, never the ITR's approval. The sanctioned way back in
            # is moving the ITR itself from Approved to In Progress (a
            # legal WorkflowEngine transition) before touching its checklists.
            parent_itr = self._get_parent_itr(db_checklist)
            if parent_itr is not None and parent_itr.status in ('Approved', 'Void') and d:
                raise ValueError(
                    f"Cannot modify Checklist instance '{db_checklist.recordsNo}' — its "
                    f"parent ITR '{parent_itr.documentNumber}' is {parent_itr.status}. "
                    f"Move the ITR back to 'In Progress' or create a re-inspection "
                    f"before editing its checklist."
                )

            # Guard (2026-09-19, browser-verified gap): an ITR-owned
            # instance's item/criteria list is a fixed snapshot of the
            # template taken at link time — only situation/result may be
            # filled in per item, and items can't be added/removed/
            # rewritten. Nothing previously enforced this at the API
            # boundary (the frontend snapshot editor's Add/Remove buttons
            # were the only thing stopping it); a direct update call could
            # silently rewrite the standard being inspected against.
            is_instance = bool(d.get('itrId', db_checklist.itrId))
            if is_instance and 'detail_data' in d:
                old_items = _parse_detail_items(db_checklist.detail_data)
                new_items = _parse_detail_items(d.get('detail_data'))
                if _items_structure_changed(old_items, new_items):
                    raise ValueError(
                        "Cannot add, remove, or rewrite inspection items on a linked "
                        "Checklist instance — item/criteria are fixed from the template "
                        "at link time; only situation/result may be filled in here."
                    )
                if d.get('detail_data') != db_checklist.detail_data:
                    reason_problems = na_reason_problems(old_items, new_items)
                    if reason_problems:
                        raise ValueError(
                            f"Cannot save Checklist '{db_checklist.recordsNo}': "
                            + "; ".join(reason_problems) + "."
                        )

            # Guard: a bare template (itrId/template_id both empty) must
            # never carry real inspection results — closes the gap where
            # this was previously enforced only by the frontend's readOnly
            # prop (BACKLOG "Checklist bare-template backend gap").
            is_bare_template = not d.get('itrId', db_checklist.itrId) and not d.get('template_id', db_checklist.template_id)
            if is_bare_template and _touched_fields_carry_results(d):
                raise ValueError(
                    "A Checklist without itrId/template_id is a template — it cannot hold "
                    "Pass/Fail status, passCount/failCount, or filled-in item results."
                )

            # Version bump: a bare template's `version` increments only
            # when what it *defines* changes — its activity (what it
            # inspects) or its item/criteria list. packageName/location/
            # contractor/inspectionDate are execution context for a
            # specific inspection run (the frontend's own "Base
            # Information" tab), not template content, so they never bump
            # it. Instances never bump `version` themselves — they carry
            # `source_template_version`, captured once at link time.
            if is_bare_template and ('activity' in d or 'detail_data' in d):
                old_sig = _template_content_signature(db_checklist.activity, db_checklist.detail_data)
                new_sig = _template_content_signature(
                    d.get('activity', db_checklist.activity), d.get('detail_data', db_checklist.detail_data)
                )
                if new_sig != old_sig:
                    d['version'] = (db_checklist.version or 1) + 1

            # Guard: once Pass/Fail, the actual inspection results are locked
            # — mirrors OBS's/PQP's reopen-aware _LOCKED_*_FIELDS pattern.
            # WorkflowEngine.TRANSITIONS["Checklist"] already defines
            # "Pass"/"Fail": ["Ongoing"] as legal (comment: 允許回退修改), so
            # this can't be an unconditional lock like NOI's. The frontend
            # has no manual status dropdown though — status is always
            # re-derived from item results on save — so the only way back to
            # Ongoing is a dedicated "Reopen" action that sends status=
            # 'Ongoing' on its own, which this exempts.
            _LOCKED_CHECKLIST_FIELDS = {'detail_data', 'passCount', 'failCount'}
            is_already_locked = db_checklist.status in ('Pass', 'Fail')
            # A Reopen is PURE (2026-09-20): it moves Pass/Fail to a non-closed status and changes no result
            # field. A byte-for-byte resend of the stored results next to it is not a change; a request that
            # also changes results/counts is not a Reopen at all (it used to slip through this exemption) and
            # is refused like any other edit of a closed checklist — reopen first, then save the results.
            changed_locked = {
                f for f in (_LOCKED_CHECKLIST_FIELDS & set(d.keys()))
                if d[f] != getattr(db_checklist, f, None)
            } if is_already_locked else set()
            if changed_locked:
                raise ValueError(
                    "Cannot modify inspection results on a Pass/Fail Checklist — "
                    "use Reopen (a status-only change back to Ongoing) first, then save the results."
                )

            # Pass-integrity guard (2026-09-19): never trust a client-supplied
            # Pass / passCount / failCount. Judged on the row AS IT WOULD BE
            # after this update (existing values merged with the request), so
            # a status-only or count-only request can't sneak past by not
            # mentioning the items. Only runs when the request actually
            # CHANGES one of the four fields — a byte-for-byte resend of an
            # existing (possibly legacy) value is not a new declaration, and a
            # pure Reopen (status -> Ongoing, nothing else) stays available
            # even for a legacy row whose stored content is anomalous.
            if is_instance:
                _fields = ('status', 'passCount', 'failCount', 'detail_data')
                _changed = {f for f in _fields if f in d and d[f] != getattr(db_checklist, f, None)}
                if _changed:
                    merged = {f: d[f] if f in d else getattr(db_checklist, f, None) for f in _fields}
                    if merged['status'] == 'Pass':
                        problems = pass_support_problems(merged['passCount'], merged['failCount'], merged['detail_data'])
                    elif merged['status'] == 'Fail':
                        # A declared Fail is judged on the merged items too (2026-09-20): all judged, at least one X.
                        problems = fail_support_problems(merged['passCount'], merged['failCount'], merged['detail_data'])
                    elif _changed & {'passCount', 'failCount', 'detail_data'}:
                        # Not a Pass/Fail: content being written must still be
                        # self-consistent (counts follow the real O/X items) AND the declared status must be
                        # the one those items derive to (2026-09-20): O+O cannot be saved as Ongoing, nor X+O.
                        # Refused, never silently corrected. Only when results/counts actually change — a
                        # status-only Reopen, a resend or an unrelated field never gets here.
                        summary = summarize_items(merged['detail_data'])
                        problems = count_mismatch_problems(merged['passCount'], merged['failCount'], summary)
                        if not summary['ok'] and merged['detail_data']:
                            problems.append("item data cannot be parsed")
                        expected = derive_checklist_status(summary)
                        if (merged['status'] or 'Ongoing') != expected:
                            problems.append(f"the items derive to {expected}, not {merged['status'] or 'Ongoing'}")
                    else:
                        problems = []
                    if problems:
                        raise ValueError(
                            f"Cannot save Checklist '{db_checklist.recordsNo}' as "
                            f"{merged['status']}: " + "; ".join(problems) + ". "
                            "Status and counts must follow the actual item results."
                        )

            # Historical-evidence marker (2026-09-19 business decision):
            # normal editing of an in-progress inspection stays fully
            # allowed, including clearing a mistaken entry back to blank —
            # but the FIRST time a save carries real evidence
            # (situation/result), permanently record that fact. This is a
            # one-way flag: set once, in this `if`, and — critically —
            # never reachable from any *other* branch, so no update can
            # ever clear it back. Deletion/unlink guards
            # (_instance_has_historical_evidence) check this instead of
            # just the row's current content, so clearing the fields
            # afterward does not make the record look "never touched"
            # again.
            # A new save cannot establish the first-ever save of a legacy
            # record. Keep its historical timestamp (including NULL) intact;
            # the audit entry below records this operation's actual time.
            if db_checklist.evidence_historical_unknown:
                d['evidence_recorded_at_reliable'] = False
            elif _touched_fields_carry_results(d) and not db_checklist.evidence_recorded_at:
                d['evidence_recorded_at'] = datetime.now().isoformat()
                d['evidence_recorded_at_reliable'] = True

            # Handle contractor name -> contractor_id mapping
            if 'contractor' in d:
                contractor_name = d.pop('contractor')
                if contractor_name:
                    d['contractor_id'] = _resolve_vendor_id(self.repo.db, contractor_name)

            enforce_update_scope(d, scope, vendor_field="contractor_id")

            # Validate references to other modules if being updated
            if 'itpId' in d and d['itpId']:
                itp = self.repo.db.query(models.ITP).filter(models.ITP.id == d['itpId']).first()
                if not itp:
                    raise ValueError(f"ITP with ID '{d['itpId']}' not found")

            if 'noiNumber' in d and d['noiNumber']:
                validators.validate_noi_reference(self.repo.db, d['noiNumber'])

            if 'itrId' in d and d['itrId']:
                validators.validate_itr_by_id(self.repo.db, d['itrId'])

            if 'itrNumber' in d and d['itrNumber']:
                validators.validate_itr_reference(self.repo.db, d['itrNumber'])

            # Update the record and log the audit trail in ONE transaction
            # (2026-09-19 atomicity fix — this method previously called
            # self.repo.update(), which commits on its own, *before*
            # log_audit() ran; log_audit() itself only db.add()s, so a
            # failure writing the audit entry — or simply the process
            # dying between the two calls — could persist a Checklist
            # change (including a newly-set evidence_recorded_at) with no
            # corresponding history record. Mutating directly + a single
            # commit + strict=True means either both persist or neither
            # does.
            for key, value in d.items():
                setattr(db_checklist, key, value)
            self.repo.db.add(db_checklist)

            log_audit(
                self.repo.db, "UPDATE", "Checklist", checklist_id, db_checklist.recordsNo,
                old_value=old_val, new_value=checklist_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True,
            )

            self.repo.db.commit()
            self.repo.db.refresh(db_checklist)
            return db_checklist
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating Checklist {checklist_id}: {e}", exc_info=True)
            raise e

    def delete_checklist(self, checklist_id: str, user_id: int = None, username: str = None, reason: str = None, scope=None) -> bool:
        """
        Delete a Checklist with audit logging

        Args:
            checklist_id: Checklist identifier
            user_id: ID of user deleting the Checklist
            username: Username of user deleting the Checklist

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_checklist = self.repo.get_by_id(checklist_id)
            if not db_checklist or not record_in_scope(db_checklist, scope):
                return False

            # §17 isolation hardening (2026-09-19): an ITR-owned instance
            # must only ever be removed via the ITR's own Unlink action
            # (ITRService.unlink_checklist), which re-validates the ITR's
            # own status/scope first — a direct delete here would let
            # anyone with plain checklist:delete:all silently erase an
            # instance's results with none of those checks, including one
            # behind an Approved ITR.
            if db_checklist.itrId:
                raise ValueError(
                    f"Cannot delete Checklist '{db_checklist.recordsNo}' — it is an "
                    f"ITR-owned instance linked to ITR "
                    f"{db_checklist.itrNumber or db_checklist.itrId}. Use the ITR's "
                    f"Unlink action instead of deleting it directly."
                )

            # A template that has (incorrectly, per the guards above) ended
            # up holding evidence — historically, even if its current
            # fields have since been cleared (2026-09-19: was `status in
            # ('Pass','Fail')` only, which a clear-then-delete could
            # bypass) — can never be hard-deleted. Checklist has no Void
            # state to route it through first (unlike NCR/Audit/FollowUp),
            # so the only rule available is: never hard-delete a row that
            # has ever held evidence.
            if _instance_has_historical_evidence(db_checklist):
                raise ValueError(
                    f"Cannot delete Checklist '{db_checklist.recordsNo}' — it has held "
                    f"inspection evidence (now or previously)."
                )

            # Capture old values for audit using inspect
            mapper = inspect(models.Checklist)
            old_val = {prop.key: getattr(db_checklist, prop.key) for prop in mapper.column_attrs}

            # Delete + log the audit trail in ONE transaction (2026-09-19
            # atomicity fix — same shape as update_checklist above).
            self.repo.db.delete(db_checklist)

            log_audit(
                self.repo.db, "DELETE", "Checklist", checklist_id, db_checklist.recordsNo,
                old_value=old_val, user_id=user_id, username=username, reason=reason, strict=True,
            )

            self.repo.db.commit()
            return True
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting Checklist {checklist_id}: {e}", exc_info=True)
            raise e
