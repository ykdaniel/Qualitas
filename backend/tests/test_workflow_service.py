"""Tests for services.workflow_service.WorkflowService (Q-WorkFlow).

A Q-WorkFlow is 1:1 with an NOI and carries a sequential reference
number (``Q-WorkFlow-000001``). The 9 checkpoints are computed from
the NOI's downstream ITR / NCR rows; this module exercises the
rules, the N/A-as-done semantics, the all-or-nothing aggregation,
the linear-progress-front tri-state derivation, the bucket stats,
and the needs-attention ordering.

Uses the in-memory SQLite ``db_session`` fixture so real SQLAlchemy
relationships (NOI.itrs / NOI.ncrs / QWorkflow.noi_ref) are walked
end-to-end.

Fixture shape:

    Q-WF-1 → NOI with NO NCRs (happy path: W/H inspection only)
    Q-WF-2 → NOI + 1 partially-filled NCR (MoC missing)
    Q-WF-3 → NOI + 2 NCRs, one fully resolved + one still open
             (all-or-nothing: the half-open one blocks everything)
    Q-WF-4 → NOI + 1 fully resolved NCR, NOI closed, re-insp ITR
             exists → 100%
"""

from __future__ import annotations

import json
import uuid

import pytest

import models
from services.workflow_service import (
    CHECKPOINT_ACCEPTED,
    CHECKPOINT_CLOSE_NCR,
    CHECKPOINT_IMPROVEMENT,
    CHECKPOINT_ITR,
    CHECKPOINT_MOC,
    CHECKPOINT_NCR,
    CHECKPOINT_NOI,
    CHECKPOINT_ORDER,
    CHECKPOINT_REINSPECTION,
    CHECKPOINT_WH_INSPECTION,
    STATE_CURRENT,
    STATE_DONE,
    STATE_PENDING,
    TOTAL_CHECKPOINTS,
    WorkflowService,
)


def _make_qworkflow(
    db_session, noi: models.NOI, ref: str,
) -> models.QWorkflow:
    qwf = models.QWorkflow(
        id=str(uuid.uuid4()),
        referenceNo=ref,
        noi_id=noi.id,
        createdAt="2026-04-01T00:00:00",
    )
    db_session.add(qwf)
    return qwf


def _state_map(summary: dict) -> dict[str, str]:
    return {c["key"]: c["state"] for c in summary["checkpoints"]}


def _done_map(summary: dict) -> dict[str, bool]:
    return {c["key"]: c["done"] for c in summary["checkpoints"]}


@pytest.fixture
def workflow_fixture(db_session, sample_contractor):
    """Populate four Q-WorkFlows covering every interesting shape."""
    vendor_id = sample_contractor.id

    itp = models.ITP(
        id="itp-wf", vendor_id=vendor_id, referenceNo="ITP-WF-001",
        description="workflow-test ITP", status="Approved",
    )
    db_session.add(itp)

    # ── Q-WF-1: NOI with NO NCRs, W/H ITR exists, NOI closed.
    # Expected: everything done (N/A = done for checkpoints 3-12),
    # plus W/H Inspection done. Should reach 100%.
    noi_happy = models.NOI(
        id="noi-happy", package="P-HAPPY", referenceNo="NOI-WF-HAPPY",
        issueDate="2026-03-01", inspectionTime="10:00",
        itpNo="ITP-WF-001", inspectionDate="2026-03-02", type="site",
        vendor_id=vendor_id, status="Closed",
    )
    db_session.add(noi_happy)
    db_session.add(models.ITR(
        id="itr-happy", vendor_id=vendor_id, documentNumber="ITR-HAPPY",
        description="pass", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-WF-HAPPY", raiseDate="2026-03-02",
    ))
    _make_qworkflow(db_session, noi_happy, "Q-WorkFlow-000001")

    # ── Q-WF-2: NOI + 1 partially-filled NCR (RCA only).
    noi_part = models.NOI(
        id="noi-part", package="P-PART", referenceNo="NOI-WF-PART",
        issueDate="2026-03-10", inspectionTime="10:00",
        itpNo="ITP-WF-001", inspectionDate="2026-03-11", type="site",
        vendor_id=vendor_id, status="In Progress",
    )
    db_session.add(noi_part)
    db_session.add(models.ITR(
        id="itr-part", vendor_id=vendor_id, documentNumber="ITR-PART",
        description="witnessed", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-WF-PART", raiseDate="2026-03-11",
    ))
    db_session.add(models.NCR(
        id="ncr-part", vendor_id=vendor_id, documentNumber="NCR-PART",
        description="started", rev="A", submit="Initial", status="Open",
        subject="partial", raiseDate="2026-03-12",
        noiNumber="NOI-WF-PART",
        rootCauseAnalysis="root cause identified",
    ))
    _make_qworkflow(db_session, noi_part, "Q-WorkFlow-000002")

    # ── Q-WF-3: NOI + 2 NCRs — one fully resolved, one still empty.
    # The all-or-nothing rule means the empty NCR blocks *every*
    # NCR-derived checkpoint even though the other NCR is complete.
    noi_mixed = models.NOI(
        id="noi-mixed", package="P-MIXED", referenceNo="NOI-WF-MIXED",
        issueDate="2026-03-15", inspectionTime="10:00",
        itpNo="ITP-WF-001", inspectionDate="2026-03-16", type="site",
        vendor_id=vendor_id, status="In Progress",
    )
    db_session.add(noi_mixed)
    db_session.add(models.ITR(
        id="itr-mixed-1", vendor_id=vendor_id, documentNumber="ITR-MIXED-1",
        description="witnessed", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-WF-MIXED", raiseDate="2026-03-16",
    ))
    # Fully-resolved NCR — every field filled, closed, re-insp exists.
    db_session.add(models.ITR(
        id="itr-mixed-reinsp", vendor_id=vendor_id,
        documentNumber="ITR-MIXED-REINSP", description="re-insp",
        rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-WF-MIXED", raiseDate="2026-03-20",
    ))
    db_session.add(models.NCR(
        id="ncr-mixed-done", vendor_id=vendor_id,
        documentNumber="NCR-MIXED-DONE", description="done NCR",
        rev="A", submit="Initial", status="Closed",
        subject="resolved", raiseDate="2026-03-17",
        noiNumber="NOI-WF-MIXED",
        rootCauseAnalysis="rca", repairMethodStatement="moc",
        immediateCorrectionAction="imm", correctiveActions="corr",
        preventiveAction="prev",
        improvementPhotos=json.dumps(["/uploads/a.jpg"]),
        reInspectionNumber="ITR-MIXED-REINSP",
    ))
    # Half-open NCR — blocks everything.
    db_session.add(models.NCR(
        id="ncr-mixed-open", vendor_id=vendor_id,
        documentNumber="NCR-MIXED-OPEN", description="open NCR",
        rev="A", submit="Initial", status="Open",
        subject="still open", raiseDate="2026-03-18",
        noiNumber="NOI-WF-MIXED",
        rootCauseAnalysis="rca only",  # everything else blank
    ))
    _make_qworkflow(db_session, noi_mixed, "Q-WorkFlow-000003")

    # ── Q-WF-4: NOI + single fully-resolved NCR, NOI closed → 100%.
    noi_full = models.NOI(
        id="noi-full", package="P-FULL", referenceNo="NOI-WF-FULL",
        issueDate="2026-03-20", inspectionTime="10:00",
        itpNo="ITP-WF-001", inspectionDate="2026-03-21", type="site",
        vendor_id=vendor_id, status="Closed",
    )
    db_session.add(noi_full)
    db_session.add(models.ITR(
        id="itr-full", vendor_id=vendor_id, documentNumber="ITR-FULL",
        description="witnessed", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-WF-FULL", raiseDate="2026-03-21",
    ))
    db_session.add(models.ITR(
        id="itr-full-reinsp", vendor_id=vendor_id,
        documentNumber="ITR-FULL-REINSP", description="re-insp",
        rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-WF-FULL", raiseDate="2026-03-25",
    ))
    db_session.add(models.NCR(
        id="ncr-full", vendor_id=vendor_id, documentNumber="NCR-FULL",
        description="done", rev="A", submit="Initial", status="Closed",
        subject="resolved", raiseDate="2026-03-22",
        noiNumber="NOI-WF-FULL",
        rootCauseAnalysis="rca", repairMethodStatement="moc",
        immediateCorrectionAction="imm", correctiveActions="corr",
        preventiveAction="prev",
        improvementPhotos=json.dumps(["/uploads/b.jpg"]),
        reInspectionNumber="ITR-FULL-REINSP",
    ))
    _make_qworkflow(db_session, noi_full, "Q-WorkFlow-000004")

    db_session.commit()
    return db_session


def _summary_for(service: WorkflowService, ref: str) -> dict:
    rows = {row["reference_no"]: row for row in service.list_workflows(limit=100)}
    assert ref in rows, f"{ref} missing from list_workflows output"
    return rows[ref]


# ─── Rule-level tests ────────────────────────────────────────────────


def test_happy_path_with_no_ncrs_is_fully_complete(workflow_fixture):
    """A NOI with W/H Inspection done and zero NCRs should hit 100%
    thanks to the "N/A = done" shortcut on checkpoints 3-12."""
    service = WorkflowService(workflow_fixture)
    summary = _summary_for(service, "Q-WorkFlow-000001")

    assert summary["completion_percent"] == 100
    assert summary["done_count"] == TOTAL_CHECKPOINTS
    done = _done_map(summary)
    for key in CHECKPOINT_ORDER:
        assert done[key] is True, f"{key} should be done for happy path"


def test_partial_ncr_blocks_most_checkpoints(workflow_fixture):
    """Q-WF-2 has a single NCR with only rootCauseAnalysis filled but
    no ``repairMethodStatement``. Under the simplified 9-checkpoint
    model, MoC is the first NCR-derived column — it must be the
    progress front, and every column after it must be pending."""
    service = WorkflowService(workflow_fixture)
    done = _done_map(_summary_for(service, "Q-WorkFlow-000002"))

    assert done[CHECKPOINT_NOI] is True
    assert done[CHECKPOINT_WH_INSPECTION] is True
    assert done[CHECKPOINT_NCR] is True  # always-done column
    for key in (
        CHECKPOINT_MOC, CHECKPOINT_IMPROVEMENT,
        CHECKPOINT_REINSPECTION, CHECKPOINT_ITR, CHECKPOINT_CLOSE_NCR,
        CHECKPOINT_ACCEPTED,
    ):
        assert done[key] is False, f"{key} should block on empty fields"


def test_all_or_nothing_half_open_ncr_blocks_done_ncr(workflow_fixture):
    """Q-WF-3 has one fully-resolved NCR + one half-open NCR missing
    its repairMethodStatement. The all-or-nothing rule means MoC
    fails — the half-open NCR drags the whole Q-WorkFlow down even
    though its sibling is done. Under the linear-progress-front
    model, every column after MoC must also render pending."""
    service = WorkflowService(workflow_fixture)
    done = _done_map(_summary_for(service, "Q-WorkFlow-000003"))

    # NOI / W/H / NCR are all green (W/H has an ITR, NCR column is
    # always-done). MoC is where the half-open NCR blocks.
    assert done[CHECKPOINT_NOI] is True
    assert done[CHECKPOINT_WH_INSPECTION] is True
    assert done[CHECKPOINT_NCR] is True
    for key in (
        CHECKPOINT_MOC, CHECKPOINT_IMPROVEMENT,
        CHECKPOINT_REINSPECTION, CHECKPOINT_ITR, CHECKPOINT_CLOSE_NCR,
    ):
        assert done[key] is False, f"{key} should fail due to half-open NCR"
    assert done[CHECKPOINT_ACCEPTED] is False


def test_full_workflow_hits_100_percent(workflow_fixture):
    """Q-WF-4: single NCR with every field, closed, re-insp ITR
    exists, NOI closed → every checkpoint done."""
    service = WorkflowService(workflow_fixture)
    summary = _summary_for(service, "Q-WorkFlow-000004")

    assert summary["completion_percent"] == 100
    assert summary["done_count"] == TOTAL_CHECKPOINTS
    state = _state_map(summary)
    assert all(s == STATE_DONE for s in state.values())


def test_accepted_requires_every_previous_checkpoint(workflow_fixture):
    """Accepted is a pure rollup: done iff every earlier checkpoint
    is done. Q-WF-2 has incomplete work → Accepted must be False."""
    service = WorkflowService(workflow_fixture)
    done = _done_map(_summary_for(service, "Q-WorkFlow-000002"))
    assert done[CHECKPOINT_ACCEPTED] is False


def test_wh_inspection_requires_linked_itr(db_session, sample_contractor):
    """W/H Inspection is done only when at least one ITR references
    the NOI. A bare NOI with no ITRs must fail it."""
    noi = models.NOI(
        id="noi-bare", package="P-BARE", referenceNo="NOI-BARE",
        issueDate="2026-03-01", inspectionTime="10:00",
        itpNo=None, inspectionDate="2026-03-02", type="site",
        vendor_id=sample_contractor.id, status="Draft",
    )
    db_session.add(noi)
    _make_qworkflow(db_session, noi, "Q-WorkFlow-999001")
    db_session.commit()

    service = WorkflowService(db_session)
    done = _done_map(_summary_for(service, "Q-WorkFlow-999001"))
    assert done[CHECKPOINT_WH_INSPECTION] is False


def test_improvement_rule_ignores_malformed_photos_blob(
    db_session, sample_contractor,
):
    """Improvement is done only when improvementPhotos parses to a
    non-empty list. Bad JSON / empty array / null all count as
    'no photos'."""
    noi = models.NOI(
        id="noi-photo", package="P-PHOTO", referenceNo="NOI-PHOTO",
        issueDate="2026-03-01", inspectionTime="10:00",
        itpNo=None, inspectionDate="2026-03-02", type="site",
        vendor_id=sample_contractor.id, status="Draft",
    )
    db_session.add(noi)
    db_session.add(models.NCR(
        id="ncr-bad-photos", vendor_id=sample_contractor.id,
        documentNumber="NCR-BAD-PHOTOS", description="x", rev="A",
        submit="Initial", status="Open", subject="photos",
        raiseDate="2026-03-05", noiNumber="NOI-PHOTO",
        improvementPhotos="not json at all",
    ))
    _make_qworkflow(db_session, noi, "Q-WorkFlow-999002")
    db_session.commit()

    service = WorkflowService(db_session)
    done = _done_map(_summary_for(service, "Q-WorkFlow-999002"))
    assert done[CHECKPOINT_IMPROVEMENT] is False


# ─── Tri-state derivation ────────────────────────────────────────────


def test_current_marks_first_undone_checkpoint_in_order(workflow_fixture):
    """Q-WF-2 has NOI + W/H + NCR done; MoC is the first un-done
    column (the NCR has no repairMethodStatement), so MoC is the
    progress front and everything after it is pending."""
    service = WorkflowService(workflow_fixture)
    state = _state_map(_summary_for(service, "Q-WorkFlow-000002"))

    assert state[CHECKPOINT_MOC] == STATE_CURRENT
    # Everything after MoC is pending.
    after_moc = False
    for key in CHECKPOINT_ORDER:
        if key == CHECKPOINT_MOC:
            after_moc = True
            continue
        if after_moc:
            assert state[key] == STATE_PENDING, f"{key} should be pending"


def test_full_workflow_has_no_current(workflow_fixture):
    """A 100%-complete Q-WorkFlow has every cell green."""
    service = WorkflowService(workflow_fixture)
    state = _state_map(_summary_for(service, "Q-WorkFlow-000004"))
    assert STATE_CURRENT not in state.values()


def test_linear_progress_front_hides_downstream_na_columns(
    db_session, sample_contractor,
):
    """A NOI with zero ITR and zero NCRs should render as "progress
    only reached W/H Inspection". Even though the N/A shortcut would
    independently satisfy the NCR-derived rules (RCA, MoC, ...), the
    tracker must show them as pending because the row is blocked at
    an earlier column. Completion % must reflect what's visually
    green — 1/9, not 8/9."""
    noi = models.NOI(
        id="noi-noitr", package="P-NOITR", referenceNo="NOI-NOITR",
        issueDate="2026-03-01", inspectionTime="10:00",
        itpNo=None, inspectionDate="2026-03-02", type="site",
        vendor_id=sample_contractor.id, status="Draft",
    )
    db_session.add(noi)
    _make_qworkflow(db_session, noi, "Q-WorkFlow-999003")
    db_session.commit()

    service = WorkflowService(db_session)
    summary = _summary_for(service, "Q-WorkFlow-999003")
    state = _state_map(summary)

    assert state[CHECKPOINT_NOI] == STATE_DONE
    assert state[CHECKPOINT_WH_INSPECTION] == STATE_CURRENT
    # Everything after W/H — including the N/A-satisfied NCR-derived
    # rules — must render pending, not done.
    for key in (
        CHECKPOINT_NCR, CHECKPOINT_MOC, CHECKPOINT_IMPROVEMENT,
        CHECKPOINT_REINSPECTION, CHECKPOINT_ITR,
        CHECKPOINT_CLOSE_NCR, CHECKPOINT_ACCEPTED,
    ):
        assert state[key] == STATE_PENDING, (
            f"{key} should be pending — progress only reached W/H"
        )
    # Only NOI counts toward completion under the linear-front model.
    assert summary["done_count"] == 1
    assert summary["completion_percent"] == round(1 * 100 / TOTAL_CHECKPOINTS)


def test_checkpoint_order_is_nine_columns():
    """The simplified 9-checkpoint model. Dropping RCA / Immediate /
    Corrective / Preventive Action from the v3 list was an explicit
    product call (v4 simplification)."""
    assert TOTAL_CHECKPOINTS == 9
    assert CHECKPOINT_ORDER == (
        "noi",
        "wh_inspection",
        "ncr",
        "moc",
        "improvement",
        "reinspection",
        "itr",
        "close_ncr",
        "accepted",
    )


# ─── Stats ───────────────────────────────────────────────────────────


def test_get_stats_buckets_by_completion_percent(workflow_fixture):
    """4 Q-WorkFlows, expected distribution under the 9-checkpoint
    linear-front model:
        Q-WF-1 → 9/9  → 100%  → bucket_76_100
        Q-WF-2 → 3/9  → 33%   → bucket_26_50 (stuck at MoC)
        Q-WF-3 → 3/9  → 33%   → bucket_26_50 (stuck at MoC)
        Q-WF-4 → 9/9  → 100%  → bucket_76_100
    """
    service = WorkflowService(workflow_fixture)
    stats = service.get_stats()

    assert stats["total"] == 4
    # Two 100%s + two partials.
    assert stats["bucket_76_100"] == 2
    # The two partials both land in 26-50.
    assert stats["bucket_26_50"] == 2
    assert stats["bucket_0_25"] == 0
    assert stats["bucket_51_75"] == 0


# ─── Needs attention ─────────────────────────────────────────────────


def test_needs_attention_excludes_fully_complete(workflow_fixture):
    """100% Q-WorkFlows are filtered out — there's nothing to act on."""
    service = WorkflowService(workflow_fixture)
    attention = service.get_needs_attention(limit=10)
    refs = [w["reference_no"] for w in attention]
    assert "Q-WorkFlow-000001" not in refs
    assert "Q-WorkFlow-000004" not in refs


def test_needs_attention_sorts_by_lowest_completion_first(workflow_fixture):
    """Lowest-completion actionable Q-WorkFlows come first."""
    service = WorkflowService(workflow_fixture)
    attention = service.get_needs_attention(limit=10)
    percents = [w["completion_percent"] for w in attention]
    assert percents == sorted(percents)


def test_needs_attention_respects_limit(workflow_fixture):
    service = WorkflowService(workflow_fixture)
    top_one = service.get_needs_attention(limit=1)
    assert len(top_one) == 1


# ─── List pagination / filters ──────────────────────────────────────


def test_list_workflows_filters_by_completion_range(workflow_fixture):
    service = WorkflowService(workflow_fixture)

    low = service.list_workflows(limit=100, max_completion=50)
    low_refs = {w["reference_no"] for w in low}
    assert "Q-WorkFlow-000002" in low_refs
    assert "Q-WorkFlow-000003" in low_refs
    assert "Q-WorkFlow-000001" not in low_refs
    assert "Q-WorkFlow-000004" not in low_refs

    high = service.list_workflows(limit=100, min_completion=76)
    high_refs = {w["reference_no"] for w in high}
    assert high_refs == {"Q-WorkFlow-000001", "Q-WorkFlow-000004"}


def test_list_workflows_exposes_summary_fields(workflow_fixture):
    service = WorkflowService(workflow_fixture)
    summary = _summary_for(service, "Q-WorkFlow-000002")

    assert summary["reference_no"] == "Q-WorkFlow-000002"
    assert summary["noi_id"] == "noi-part"
    assert summary["noi_reference_no"] == "NOI-WF-PART"
    assert summary["noi_package"] == "P-PART"
    assert summary["vendor_name"] is not None
    assert len(summary["checkpoints"]) == TOTAL_CHECKPOINTS


def test_list_workflows_filters_by_vendor(workflow_fixture, db_session):
    """vendor_id filter should narrow results to that contractor only."""
    # Add a second contractor with its own NOI + Q-WorkFlow.
    other_vendor = models.Contractor(id="vendor-2", name="Other Vendor")
    db_session.add(other_vendor)
    noi = models.NOI(
        id="noi-other", package="P-OTHER", referenceNo="NOI-OTHER",
        issueDate="2026-03-01", inspectionTime="10:00",
        itpNo=None, inspectionDate="2026-03-02", type="site",
        vendor_id="vendor-2", status="Draft",
    )
    db_session.add(noi)
    _make_qworkflow(db_session, noi, "Q-WorkFlow-000099")
    db_session.commit()

    service = WorkflowService(db_session)
    filtered = service.list_workflows(limit=100, vendor_id="vendor-2")
    refs = {w["reference_no"] for w in filtered}
    assert refs == {"Q-WorkFlow-000099"}
