"""WorkflowService — Q-WorkFlow checkpoint tracker (Phase 1 PR1b v3).

A Q-WorkFlow is a first-class entity that is auto-created 1:1 with
every NOI (see ``noi_service.NOIService._create_qworkflow_for_noi``).
Each Q-WorkFlow row just carries a sequential reference number
(``Q-WorkFlow-000001``) and an FK to its NOI — every *visible* column
on the Excel-style tracker is **computed** at read time by this
service from the NOI and its downstream ITR / NCR rows.

Nine canonical checkpoints make up one row on the tracker:

    1. NOI                — always done (the NOI exists, trivially)
    2. W/H Inspection     — at least one ITR is linked to the NOI
    3. NCR                — at least one NCR has been raised (or N/A)
    4. MoC                — every linked NCR has repair method
    5. Improvement        — every linked NCR has improvement photos
    6. Re-Inspection      — every linked NCR has re-insp number
    7. ITR (re-insp)      — every NCR's re-insp ITR exists
    8. Close NCR          — every linked NCR is Closed
    9. Accepted           — checkpoints 1-8 are all done

Three important semantics:

* **"No NCRs = N/A = done"** — if a NOI has zero NCRs linked to it,
  the NCR-derived rules (checkpoints 4-8) all evaluate True. A
  problem-free inspection can therefore sail from W/H straight to
  Accepted without manufacturing fake NCRs.
* **all-or-nothing aggregation** — when multiple NCRs are linked,
  every NCR must satisfy the rule. A half-finished NCR keeps the
  checkpoint as ``current`` even if the other NCR is complete.
  Rationale: the tracker is a completion gate, not a best-effort
  indicator.
* **Linear progress front** — the tri-state rendering is strictly
  sequential. Once the first un-done rule is hit the row stops
  there: the blocker is ``current`` and *every* downstream column
  renders ``pending``, even if its own rule would independently be
  True via the N/A shortcut. Rationale: the row is supposed to read
  as "progress only reached here", and a green cell to the right of
  an orange one would look like the work skipped ahead.

Tri-state:

* ``done``    — every rule up to and including this cell is satisfied
* ``current`` — the first un-done rule in canonical order
* ``pending`` — anything after the current front
"""

from __future__ import annotations

import json
import logging
from typing import Any, Callable, Dict, List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

import models
from core.scope import apply_scope

logger = logging.getLogger(__name__)

INSPECTION_RESULT_PASS = "Pass"
INSPECTION_RESULT_FAIL = "Fail"

# ─── Checkpoint definitions ──────────────────────────────────────────

CHECKPOINT_NOI = "noi"
CHECKPOINT_WH_INSPECTION = "wh_inspection"
CHECKPOINT_NCR = "ncr"
CHECKPOINT_MOC = "moc"
CHECKPOINT_IMPROVEMENT = "improvement"
CHECKPOINT_REINSPECTION = "reinspection"
CHECKPOINT_ITR = "itr"
CHECKPOINT_CLOSE_NCR = "close_ncr"
CHECKPOINT_ACCEPTED = "accepted"

# Canonical order — matches the Excel tracker. Accepted is last
# because the rule depends on every prior checkpoint.
CHECKPOINT_ORDER: tuple[str, ...] = (
    CHECKPOINT_NOI,
    CHECKPOINT_WH_INSPECTION,
    CHECKPOINT_NCR,
    CHECKPOINT_MOC,
    CHECKPOINT_IMPROVEMENT,
    CHECKPOINT_REINSPECTION,
    CHECKPOINT_ITR,
    CHECKPOINT_CLOSE_NCR,
    CHECKPOINT_ACCEPTED,
)

TOTAL_CHECKPOINTS = len(CHECKPOINT_ORDER)

STATE_DONE = "done"
STATE_CURRENT = "current"
STATE_PENDING = "pending"


def _has_text(value: Optional[str]) -> bool:
    """True if a text field has meaningful (non-whitespace) content."""
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    return bool(value)


def _has_photos(photos_json: Optional[str]) -> bool:
    """``improvementPhotos`` is a JSON array of paths stored as TEXT.
    Empty arrays, nulls and parse failures all count as "no photos"
    so malformed blobs can't accidentally mark the Improvement
    checkpoint as done."""
    if not photos_json:
        return False
    try:
        parsed = json.loads(photos_json)
    except (ValueError, TypeError):
        return False
    return isinstance(parsed, list) and len(parsed) > 0


def _all_ncrs(
    ncrs: List[models.NCR],
    predicate: Callable[[models.NCR], bool],
) -> bool:
    """All-or-nothing aggregation with the N/A = done shortcut.

    If the NOI has zero NCRs linked, every NCR-derived checkpoint
    auto-satisfies (there's nothing to block on). Otherwise, every
    single NCR must satisfy the predicate — partial wins count as a
    "still stuck" for the whole Q-WorkFlow."""
    if not ncrs:
        return True
    return all(predicate(n) for n in ncrs)


def _inspection_passed(itr: Optional[models.ITR]) -> bool:
    """An ITR is considered "passed" when its explicit inspectionResult
    is ``Pass``. Note: ``status`` (the document workflow state) is a
    separate axis — an ITR can be ``status=Closed`` while still having
    ``inspectionResult=Fail``. Re-inspection checkpoints key on the
    inspection axis, not the document axis.

    A Voided ITR is excluded regardless of its inspectionResult — Void
    means the record itself was cancelled/invalidated (wrong NOI,
    duplicate, mistaken entry), so whatever result it used to carry no
    longer represents a real inspection outcome. Mirrors how Void NCRs
    are excluded from checkpoint aggregation via _active_ncrs_for_noi."""
    if itr is None or (itr.status or "").strip() == "Void":
        return False
    return (itr.inspectionResult or "").strip() == INSPECTION_RESULT_PASS


def _inspection_failed(itr: models.ITR) -> bool:
    if (itr.status or "").strip() == "Void":
        return False
    return (itr.inspectionResult or "").strip() == INSPECTION_RESULT_FAIL


# ─── Checkpoint context ──────────────────────────────────────────────

class _CheckpointContext:
    """Bundle of everything a checkpoint rule might need. Built once
    per Q-WorkFlow so rule functions can stay as pure predicates."""

    def __init__(
        self,
        noi: models.NOI,
        itrs: List[models.ITR],
        ncrs: List[models.NCR],
        itr_by_doc_no: Dict[str, models.ITR],
        reinsp_itrs_by_original_id: Dict[str, List[models.ITR]],
    ) -> None:
        self.noi = noi
        self.itrs = itrs
        self.ncrs = ncrs
        self.itr_by_doc_no = itr_by_doc_no
        self.reinsp_itrs_by_original_id = reinsp_itrs_by_original_id


_CheckpointRule = Callable[[_CheckpointContext], bool]


def _rule_noi(_ctx: _CheckpointContext) -> bool:
    # Q-WorkFlow exists ⇒ NOI exists; this column is always green.
    return True


def _rule_wh_inspection(ctx: _CheckpointContext) -> bool:
    # W/H Inspection = "at least one ITR has been filed against this
    # NOI". It doesn't matter whether the ITR passed or failed — an
    # ITR simply means "we went and looked". A failed ITR is still a
    # completed inspection; whether an NCR must then exist is the
    # concern of the next checkpoint. A Voided ITR doesn't count —
    # Void means the record was cancelled, not that an inspection
    # actually took place.
    return any((itr.status or "").strip() != "Void" for itr in ctx.itrs)


def _rule_ncr(ctx: _CheckpointContext) -> bool:
    # The NCR column closes the loop between ITR failure and NCR
    # paperwork. Two paths to "done":
    #   - No ITR failed → no NCR required (N/A ⇒ done).
    #   - At least one NCR has been raised against this NOI.
    # A failed ITR with zero NCRs (i.e. the inspection flunked but no
    # non-conformance was filed) is the only configuration that blocks
    # the column — exactly the silent gap this rule exists to catch.
    if any(_inspection_failed(itr) for itr in ctx.itrs):
        return len(ctx.ncrs) > 0
    return True


def _moc_ok(_ctx: _CheckpointContext, n: models.NCR) -> bool:
    # MoC = Method of Construction / Repair Method Statement. Mapped
    # onto the NCR form's ``repairMethodStatement`` field for
    # historical reasons (the form predates the MoC label).
    return _has_text(n.repairMethodStatement)


def _rule_moc(ctx: _CheckpointContext) -> bool:
    return _all_ncrs(ctx.ncrs, lambda n: _moc_ok(ctx, n))


def _improvement_ok(_ctx: _CheckpointContext, n: models.NCR) -> bool:
    return _has_photos(n.improvementPhotos)


def _rule_improvement(ctx: _CheckpointContext) -> bool:
    return _all_ncrs(ctx.ncrs, lambda n: _improvement_ok(ctx, n))


def _reinspection_text_ok(_ctx: _CheckpointContext, n: models.NCR) -> bool:
    return _has_text(n.reInspectionNumber)


def _rule_reinspection(ctx: _CheckpointContext) -> bool:
    return _all_ncrs(ctx.ncrs, lambda n: _reinspection_text_ok(ctx, n))


def _close_ncr_ok(_ctx: _CheckpointContext, n: models.NCR) -> bool:
    return (n.status or "").strip() == "Closed"


def _rule_close_ncr(ctx: _CheckpointContext) -> bool:
    return _all_ncrs(ctx.ncrs, lambda n: _close_ncr_ok(ctx, n))


def _itr_reinsp_ok(ctx: _CheckpointContext, n: models.NCR) -> bool:
    """Every NCR has a re-inspection ITR that actually passed.

    Two accepted paths to "resolved":

    * **String path** — ``NCR.reInspectionNumber`` matches an existing
      ``ITR.documentNumber`` (the long-standing contract).
    * **Typed path** — an ITR exists with ``isReInspection=True`` and
      ``originalItrId`` pointing at the NCR's triggering ITR (``NCR.itrNumber``
      resolved to ``ITR.id``). This covers the case where a user created
      a proper re-inspection ITR via the typed relationship but forgot
      to write the document number back onto the NCR.

    In both paths the re-insp ITR must have ``inspectionResult=Pass`` —
    a linked-but-failed re-inspection doesn't clear the checkpoint,
    only a closed-the-loop successful re-inspection does.

    The typed path is only trusted when exactly one NCR traces back to
    the same original ITR (``NCR.itrNumber``). ``reinsp_itrs_by_original_id``
    is keyed purely by original-ITR id — it has no way to know which
    specific NCR a given re-inspection ITR was actually filed for. If two
    NCRs both point at the same failed ITR, a re-inspection created for
    one would otherwise silently satisfy the checkpoint for both,
    including the one that was never actually re-inspected. When that's
    ambiguous, only the explicit string path (``reInspectionNumber``)
    counts — same as if the typed path didn't exist at all.

    N/A-as-done shortcut still applies: no NCRs ⇒ done.
    """
    if _has_text(n.reInspectionNumber):
        itr = ctx.itr_by_doc_no.get(n.reInspectionNumber)
        if _inspection_passed(itr):
            return True
    if _has_text(n.itrNumber):
        orig = ctx.itr_by_doc_no.get(n.itrNumber)
        siblings = sum(1 for other in ctx.ncrs if other.itrNumber == n.itrNumber)
        if orig is not None and siblings == 1:
            for reinsp in ctx.reinsp_itrs_by_original_id.get(orig.id, []):
                if _inspection_passed(reinsp):
                    return True
    return False


def _rule_itr_reinsp(ctx: _CheckpointContext) -> bool:
    return _all_ncrs(ctx.ncrs, lambda n: _itr_reinsp_ok(ctx, n))


def _rule_itr_terminal(ctx: _CheckpointContext) -> bool:
    """Every ITR against this NOI has reached a terminal document status
    (Approved or Void) — the exact same condition noi_service.py's
    close-gate requires (``ITR.status.notin_(['Approved', 'Void'])`` must
    be empty). The 8 numbered checkpoints never look at ``ITR.status`` at
    all (only ``inspectionResult``), so without this, "Accepted"/100% could
    show green while the NOI itself is still un-closeable because an ITR is
    stuck at In Progress/Reject — two independently-computed "is this NOI
    done" answers that could disagree. Folded into the Accepted rollup
    rather than its own numbered checkpoint so the visible 9-checkpoint
    structure and completion-percentage math don't change.
    """
    return all((itr.status or "").strip() in ("Approved", "Void") for itr in ctx.itrs)


# Note: _rule_accepted is special-cased in _evaluate_checkpoints — it
# depends on the previous 8 results (plus _rule_itr_terminal), not on the
# raw context via the normal per-checkpoint dispatch.

_CHECKPOINT_RULES: Dict[str, _CheckpointRule] = {
    CHECKPOINT_NOI: _rule_noi,
    CHECKPOINT_WH_INSPECTION: _rule_wh_inspection,
    CHECKPOINT_NCR: _rule_ncr,
    CHECKPOINT_MOC: _rule_moc,
    CHECKPOINT_IMPROVEMENT: _rule_improvement,
    CHECKPOINT_REINSPECTION: _rule_reinspection,
    CHECKPOINT_ITR: _rule_itr_reinsp,
    CHECKPOINT_CLOSE_NCR: _rule_close_ncr,
}

# Per-NCR predicates for the 5 checkpoints whose aggregate rule is
# "every NCR satisfies X" — reused to find which *specific* NCR is
# blocking the checkpoint (see _first_blocking_ncr_id), so the frontend
# can deep-link straight at it instead of guessing "first linked NCR".
_NCR_RULE_PREDICATES: Dict[str, Callable[[_CheckpointContext, models.NCR], bool]] = {
    CHECKPOINT_MOC: _moc_ok,
    CHECKPOINT_IMPROVEMENT: _improvement_ok,
    CHECKPOINT_REINSPECTION: _reinspection_text_ok,
    CHECKPOINT_ITR: _itr_reinsp_ok,
    CHECKPOINT_CLOSE_NCR: _close_ncr_ok,
}


def _first_blocking_ncr_id(
    ctx: _CheckpointContext,
    predicate: Callable[[_CheckpointContext, models.NCR], bool],
) -> Optional[str]:
    for n in ctx.ncrs:
        if not predicate(ctx, n):
            return n.id
    return None


# Completion buckets for the Dashboard distribution card. Inclusive
# on both ends of the final bucket so 100% has somewhere to land.
_BUCKETS: tuple[tuple[str, int, int], ...] = (
    ("bucket_0_25", 0, 25),
    ("bucket_26_50", 26, 50),
    ("bucket_51_75", 51, 75),
    ("bucket_76_100", 76, 100),
)

# Safety cap — keeps response size bounded.
_MAX_LIMIT = 500


class _Lookups:
    """Pre-computed cross-NOI lookups shared by every checkpoint
    evaluation in a single request. Built once per public-method call
    to avoid quadratic re-queries."""

    __slots__ = ("itr_by_doc_no", "extra_ncrs_by_noi", "reinsp_itrs_by_original_id")

    def __init__(
        self,
        itr_by_doc_no: Dict[str, models.ITR],
        extra_ncrs_by_noi: Dict[str, List[models.NCR]],
        reinsp_itrs_by_original_id: Dict[str, List[models.ITR]],
    ) -> None:
        self.itr_by_doc_no = itr_by_doc_no
        self.extra_ncrs_by_noi = extra_ncrs_by_noi
        self.reinsp_itrs_by_original_id = reinsp_itrs_by_original_id


class WorkflowService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── Public API ───────────────────────────────────────────────

    def list_workflows(
        self,
        skip: int = 0,
        limit: int = 100,
        min_completion: Optional[int] = None,
        max_completion: Optional[int] = None,
        vendor_id: Optional[str] = None,
        scope=None,
    ) -> List[Dict[str, Any]]:
        """Return a page of Q-WorkFlow summaries. Completion filtering
        happens after computation because the percentage is derived,
        not stored."""
        limit = max(1, min(limit, _MAX_LIMIT))
        skip = max(0, skip)

        qworkflows = self._load_qworkflows(vendor_id=vendor_id, scope=scope)
        lookups = self._build_lookups(qworkflows, scope=scope)

        summaries = [
            self._summarise(qwf, lookups) for qwf in qworkflows
        ]

        if min_completion is not None:
            summaries = [
                s for s in summaries if s["completion_percent"] >= min_completion
            ]
        if max_completion is not None:
            summaries = [
                s for s in summaries if s["completion_percent"] <= max_completion
            ]

        return summaries[skip : skip + limit]

    def get_stats(self, scope=None) -> Dict[str, int]:
        """Completion-distribution stats for the Dashboard card."""
        qworkflows = self._load_qworkflows(scope=scope)
        lookups = self._build_lookups(qworkflows, scope=scope)

        bucket_counts: Dict[str, int] = {name: 0 for name, _, _ in _BUCKETS}
        for qwf in qworkflows:
            completion = self._completion_percent(qwf, lookups)
            for name, lo, hi in _BUCKETS:
                if lo <= completion <= hi:
                    bucket_counts[name] += 1
                    break

        return {"total": len(qworkflows), **bucket_counts}

    def get_needs_attention(self, limit: int = 3, scope=None) -> List[Dict[str, Any]]:
        """Lowest-completion non-complete Q-WorkFlows.

        100%-complete ones are excluded — there's nothing left to
        act on. Ties are broken by NOI ``issueDate`` desc so newer
        problem workflows surface over ancient zombies."""
        qworkflows = self._load_qworkflows(scope=scope)
        lookups = self._build_lookups(qworkflows, scope=scope)

        summaries = [
            self._summarise(qwf, lookups) for qwf in qworkflows
        ]
        actionable = [s for s in summaries if s["completion_percent"] < 100]
        actionable.sort(
            key=lambda s: (
                s["completion_percent"],
                _sort_date_desc(s["issue_date"]),
            )
        )
        return actionable[: max(1, limit)]

    # ─── Internal helpers ─────────────────────────────────────────

    def _load_qworkflows(
        self, vendor_id: Optional[str] = None, scope=None,
    ) -> List[models.QWorkflow]:
        """Load all Q-WorkFlows plus the NOI/NCR/ITR graph they span
        in a bounded number of queries (thanks to selectinload)."""
        query = (
            self.db.query(models.QWorkflow)
            .join(models.NOI, models.QWorkflow.noi_id == models.NOI.id)
            .options(
                selectinload(models.QWorkflow.noi_ref).selectinload(
                    models.NOI.ncrs
                ),
                selectinload(models.QWorkflow.noi_ref).selectinload(
                    models.NOI.itrs
                ),
                selectinload(models.QWorkflow.noi_ref).selectinload(
                    models.NOI.vendor_ref
                ),
            )
        )
        if vendor_id:
            query = query.filter(models.NOI.vendor_id == vendor_id)
        # P0 data isolation: a Q-WorkFlow is owned by its NOI, so scope by the
        # NOI's project/contractor.
        query = apply_scope(query, models.NOI, scope)
        # Newest Q-WorkFlow first. Ordering by referenceNo desc gives
        # "most recently created" since numbers are monotonically
        # assigned.
        query = query.order_by(models.QWorkflow.referenceNo.desc())
        return query.all()

    def _build_extra_ncrs_by_noi(
        self, qworkflows: List[models.QWorkflow], scope=None,
    ) -> Dict[str, List[models.NCR]]:
        """Find NCRs that should belong to a NOI via ``NCR.itrNumber``
        but whose ``noiNumber`` is missing (or pointing elsewhere) and
        would therefore be invisible to ``NOI.ncrs``.

        Scenario: user raises an NCR directly from an ITR, the ITR is
        linked to a NOI, but the NCR only records ``itrNumber`` and
        leaves ``noiNumber`` null. Without this lookup the Q-WorkFlow
        would incorrectly treat the NOI as having zero NCRs and sail
        straight to 100% via the N/A shortcut.
        """
        itr_doc_to_noi_id: Dict[str, str] = {}
        for qwf in qworkflows:
            noi = qwf.noi_ref
            if noi is None:
                continue
            for itr in noi.itrs or []:
                if itr.documentNumber:
                    itr_doc_to_noi_id[itr.documentNumber] = noi.id

        if not itr_doc_to_noi_id:
            return {}

        query = (
            self.db.query(models.NCR)
            .filter(models.NCR.itrNumber.in_(list(itr_doc_to_noi_id.keys())))
            # ncr_service.py writes '' (not NULL) when it drops a dangling
            # noiNumber, so both must be treated as "missing" here.
            .filter(or_(models.NCR.noiNumber.is_(None), models.NCR.noiNumber == ''))
        )
        # P0 data isolation: itrNumber/noiNumber are free-text (not FK
        # enforced), so without this an out-of-scope NCR whose itrNumber
        # happens to match an in-scope ITR's document number would leak
        # its status into this caller's checkpoint colors.
        query = apply_scope(query, models.NCR, scope)
        rows = query.all()

        grouped: Dict[str, List[models.NCR]] = {}
        for ncr in rows:
            noi_id = itr_doc_to_noi_id.get(ncr.itrNumber or "")
            if noi_id is None:
                continue
            grouped.setdefault(noi_id, []).append(ncr)
        return grouped

    def _build_itr_lookup(
        self, qworkflows: List[models.QWorkflow],
        extra_ncrs_by_noi: Dict[str, List[models.NCR]],
        scope=None,
    ) -> Dict[str, models.ITR]:
        """Pre-resolve every ``NCR.reInspectionNumber`` and
        ``NCR.itrNumber`` → ITR in one query rather than N per rule
        call. Two axes are needed:

        * ``reInspectionNumber`` — powers the string-path re-insp
          lookup (the long-standing contract).
        * ``itrNumber`` — the NCR's originating ITR; needed to resolve
          the typed re-insp path (``ITR.originalItrId`` points at this
          ITR's ``id``).
        """
        interesting_doc_numbers: set[str] = set()
        for qwf in qworkflows:
            noi = qwf.noi_ref
            if noi is None:
                continue
            ncr_iter = list(noi.ncrs or []) + list(
                extra_ncrs_by_noi.get(noi.id, [])
            )
            for ncr in ncr_iter:
                if ncr.reInspectionNumber:
                    interesting_doc_numbers.add(ncr.reInspectionNumber)
                if ncr.itrNumber:
                    interesting_doc_numbers.add(ncr.itrNumber)

        if not interesting_doc_numbers:
            return {}

        query = (
            self.db.query(models.ITR)
            .filter(models.ITR.documentNumber.in_(interesting_doc_numbers))
        )
        # P0 data isolation — see _build_extra_ncrs_by_noi.
        query = apply_scope(query, models.ITR, scope)
        rows = query.all()
        return {itr.documentNumber: itr for itr in rows}

    def _build_reinsp_by_original(
        self, itr_by_doc_no: Dict[str, models.ITR], scope=None,
    ) -> Dict[str, List[models.ITR]]:
        """Find every ITR filed as a re-inspection of one of the
        originating ITRs we already loaded (``isReInspection=True`` and
        ``originalItrId`` in our set).

        Returns ``{original_itr_id: [reinsp_itr, ...]}`` so
        ``_rule_itr_reinsp`` can find the typed-path re-insp without
        another query per NCR.
        """
        original_ids = [itr.id for itr in itr_by_doc_no.values()]
        if not original_ids:
            return {}
        query = (
            self.db.query(models.ITR)
            .filter(models.ITR.isReInspection.is_(True))
            .filter(models.ITR.originalItrId.in_(original_ids))
        )
        # P0 data isolation — see _build_extra_ncrs_by_noi.
        query = apply_scope(query, models.ITR, scope)
        rows = query.all()
        grouped: Dict[str, List[models.ITR]] = {}
        for itr in rows:
            if itr.originalItrId is None:
                continue
            grouped.setdefault(itr.originalItrId, []).append(itr)
        return grouped

    def _active_ncrs_for_noi(
        self,
        noi: Optional[models.NOI],
        lookups: _Lookups,
    ) -> List[models.NCR]:
        """NCRs the checkpoint rules (and their summary deep-links) should
        see for this NOI: linked directly plus the itrNumber-fallback ones,
        excluding Void.

        A Voided NCR is a cancelled entry, not an open obligation — the
        NOI's own close-gate already accepts Void NCRs as non-blocking, and
        ``delete_ncr`` only allows deleting Void ones on the premise that
        Void "doesn't count" toward completion. Without this exclusion, one
        erroneously-raised-then-Voided NCR would permanently fail every
        NCR-derived checkpoint (MoC/Improvement/Re-inspection/ITR/Close) for
        this NOI, since ``_all_ncrs`` requires every NCR in the list to
        satisfy the rule.
        """
        ncrs = list(noi.ncrs) if noi and noi.ncrs else []
        if noi is not None:
            ncrs.extend(lookups.extra_ncrs_by_noi.get(noi.id, []))
        return [n for n in ncrs if (n.status or "").strip() != "Void"]

    def _make_context(
        self,
        qwf: models.QWorkflow,
        lookups: _Lookups,
    ) -> _CheckpointContext:
        noi = qwf.noi_ref
        itrs = list(noi.itrs) if noi and noi.itrs else []
        ncrs = self._active_ncrs_for_noi(noi, lookups)
        return _CheckpointContext(
            noi=noi, itrs=itrs, ncrs=ncrs,
            itr_by_doc_no=lookups.itr_by_doc_no,
            reinsp_itrs_by_original_id=lookups.reinsp_itrs_by_original_id,
        )

    def _build_lookups(
        self, qworkflows: List[models.QWorkflow], scope=None,
    ) -> _Lookups:
        """Build every cross-NOI lookup needed by the checkpoint rules
        in one coordinated pass, so downstream evaluation is O(1) per
        NCR rather than firing extra queries."""
        extra_ncrs_by_noi = self._build_extra_ncrs_by_noi(qworkflows, scope)
        itr_by_doc_no = self._build_itr_lookup(qworkflows, extra_ncrs_by_noi, scope)
        reinsp_itrs_by_original_id = self._build_reinsp_by_original(itr_by_doc_no, scope)
        return _Lookups(
            itr_by_doc_no=itr_by_doc_no,
            extra_ncrs_by_noi=extra_ncrs_by_noi,
            reinsp_itrs_by_original_id=reinsp_itrs_by_original_id,
        )

    def _evaluate_checkpoints(
        self,
        qwf: models.QWorkflow,
        lookups: _Lookups,
    ) -> List[Dict[str, Any]]:
        """Run every checkpoint rule, then render as a **linear
        progress front**: everything before the first un-done rule is
        green (done), the first un-done rule itself is orange
        (current), and everything *after* it is blank (pending) —
        regardless of whether its own rule would independently return
        True. Rationale: the tracker reads as "progress only reached
        here", so a future column auto-satisfied by the N/A shortcut
        would be visually confusing if rendered green while an earlier
        column is still orange.

        Accepted (checkpoint 9) is the rollup column: it only turns
        green when the first eight are all green, which automatically
        falls out of the "nothing un-done" path below.
        """
        ctx = self._make_context(qwf, lookups)

        rule_results: Dict[str, bool] = {}
        for key in CHECKPOINT_ORDER:
            if key == CHECKPOINT_ACCEPTED:
                continue  # Accepted is a rollup, no standalone rule
            rule = _CHECKPOINT_RULES[key]
            try:
                rule_results[key] = bool(rule(ctx))
            except Exception as exc:  # pragma: no cover - defensive
                logger.warning(
                    "Checkpoint rule %s raised for Q-WorkFlow %s: %s",
                    key, qwf.id, exc,
                )
                rule_results[key] = False

        # Walk left-to-right and find the first un-done rule. Accepted
        # isn't in rule_results — it's implicitly un-done until the
        # progress front reaches it, at which point current_idx is
        # None and everything renders green.
        current_idx: Optional[int] = None
        for idx, key in enumerate(CHECKPOINT_ORDER):
            if key == CHECKPOINT_ACCEPTED:
                # If we reach Accepted without finding a blocker, every
                # prior rule is satisfied — but Accepted also means "this
                # NOI could actually be closed right now", which additionally
                # requires every ITR to have reached Approved/Void (see
                # _rule_itr_terminal). Otherwise the row would show 100%
                # while noi_service.py's own close-gate would still reject
                # closing it.
                if not _rule_itr_terminal(ctx):
                    current_idx = idx
                break
            if not rule_results[key]:
                current_idx = idx
                break

        out: List[Dict[str, Any]] = []
        for idx, key in enumerate(CHECKPOINT_ORDER):
            if current_idx is None:
                state = STATE_DONE  # full row green, including Accepted
            elif idx < current_idx:
                state = STATE_DONE
            elif idx == current_idx:
                state = STATE_CURRENT
            else:
                state = STATE_PENDING
            blocking_ncr_id: Optional[str] = None
            predicate = _NCR_RULE_PREDICATES.get(key)
            if predicate is not None:
                blocking_ncr_id = _first_blocking_ncr_id(ctx, predicate)
            out.append(
                {
                    "key": key,
                    "state": state,
                    "done": state == STATE_DONE,
                    "blocking_ncr_id": blocking_ncr_id,
                }
            )
        return out

    def _completion_percent(
        self,
        qwf: models.QWorkflow,
        lookups: _Lookups,
    ) -> int:
        checkpoints = self._evaluate_checkpoints(qwf, lookups)
        done_count = sum(1 for c in checkpoints if c["done"])
        return round(done_count * 100 / TOTAL_CHECKPOINTS)

    def _summarise(
        self,
        qwf: models.QWorkflow,
        lookups: _Lookups,
    ) -> Dict[str, Any]:
        checkpoints = self._evaluate_checkpoints(qwf, lookups)
        done_count = sum(1 for c in checkpoints if c["done"])
        completion_percent = round(done_count * 100 / TOTAL_CHECKPOINTS)

        noi = qwf.noi_ref
        vendor_name = (
            noi.vendor_ref.name
            if noi is not None and getattr(noi, "vendor_ref", None)
            else None
        )

        # Collect linked entity IDs so the frontend can deep-link
        # from checkpoint markers to the relevant forms. The NCR list
        # includes any "visible via itrNumber fallback" NCRs — matches
        # what the checkpoint rules actually saw.
        ncrs_for_summary: List[models.NCR] = self._active_ncrs_for_noi(noi, lookups)
        ncr_ids = [n.id for n in ncrs_for_summary]
        itr_ids = [i.id for i in (noi.itrs or [])] if noi else []

        # Re-inspection ITR ids — the specific ITRs that satisfy (or
        # should satisfy) checkpoint 7. Lets the frontend deep-link
        # the "ITR (re-insp)" checkpoint marker directly at the
        # relevant report instead of guessing "last ITR".
        reinsp_itr_ids: List[str] = []
        seen_reinsp: set[str] = set()
        for ncr in ncrs_for_summary:
            candidates: List[models.ITR] = []
            if ncr.reInspectionNumber:
                itr = lookups.itr_by_doc_no.get(ncr.reInspectionNumber)
                if itr is not None:
                    candidates.append(itr)
            if ncr.itrNumber:
                orig = lookups.itr_by_doc_no.get(ncr.itrNumber)
                if orig is not None:
                    candidates.extend(
                        lookups.reinsp_itrs_by_original_id.get(orig.id, [])
                    )
            for itr in candidates:
                if itr.id and itr.id not in seen_reinsp:
                    seen_reinsp.add(itr.id)
                    reinsp_itr_ids.append(itr.id)

        return {
            "qworkflow_id": qwf.id,
            "reference_no": qwf.referenceNo,
            "noi_id": noi.id if noi else None,
            "noi_reference_no": noi.referenceNo if noi else None,
            # NOI's "package" field is what the UI actually labels/fills in
            # as "Subject" — same field related_service.py treats as NOI's
            # title elsewhere (see its title_fields comment).
            "noi_package": noi.package if noi else None,
            "issue_date": noi.issueDate if noi else None,
            "vendor_name": vendor_name,
            "checkpoints": checkpoints,
            "done_count": done_count,
            "completion_percent": completion_percent,
            "ncr_ids": ncr_ids,
            "itr_ids": itr_ids,
            "reinsp_itr_ids": reinsp_itr_ids,
        }


def _sort_date_desc(value: Optional[str]) -> str:
    """Comparison key that flips ISO-date strings so newer dates sort
    first when used alongside an ascending numeric key in a tuple.
    Missing dates sort last."""
    if not value:
        return ""
    return "".join(
        chr(0x7E - ord(c)) if 0x20 <= ord(c) <= 0x7E else c
        for c in value
    )
