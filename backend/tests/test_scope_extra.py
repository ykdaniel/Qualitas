"""P0 follow-ups: update-path move-out guard, attachment scoping, workflow scoping."""

import pytest

import models
from core.scope import (
    Scope, UNSCOPED, ScopeForbidden,
    enforce_update_scope, entity_in_scope,
)
from services.workflow_service import WorkflowService


P1 = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
CONTRACTOR = Scope(project_ids=frozenset({"P1"}), vendor_id="V1")


# ── #3 enforce_update_scope ──────────────────────────────────────────────────

def test_update_blocks_moving_to_foreign_project():
    with pytest.raises(ScopeForbidden):
        enforce_update_scope({"project_id": "P2"}, P1)


def test_update_allows_same_project():
    enforce_update_scope({"project_id": "P1"}, P1)  # no raise


def test_update_blocks_vendor_reassign():
    with pytest.raises(ScopeForbidden):
        enforce_update_scope({"vendor_id": "V2"}, CONTRACTOR)


def test_update_noop_when_field_absent():
    enforce_update_scope({"status": "Closed"}, P1)        # project_id not in payload → fine


def test_update_noop_when_unscoped():
    enforce_update_scope({"project_id": "P2", "vendor_id": "V2"}, UNSCOPED)


def test_update_checklist_vendor_field():
    # Checklist uses contractor_id as the contractor key.
    with pytest.raises(ScopeForbidden):
        enforce_update_scope({"contractor_id": "V2"}, CONTRACTOR, vendor_field="contractor_id")


# ── #2 entity_in_scope (attachment parent gating) ────────────────────────────

@pytest.fixture
def seeded(db_session):
    db_session.add_all([
        models.Project(id="P1", name="P1"), models.Project(id="P2", name="P2"),
        models.Contractor(id="V1", name="V1"),
    ])
    db_session.add_all([
        models.NCR(id="n1", documentNumber="N1", status="Open", project_id="P1", vendor_id="V1"),
        models.NCR(id="n2", documentNumber="N2", status="Open", project_id="P2", vendor_id="V1"),
    ])
    db_session.commit()
    return db_session


def test_entity_in_scope_resolves_parent(seeded):
    assert entity_in_scope(seeded, "ncr", "n1", P1) is True       # P1 parent
    assert entity_in_scope(seeded, "ncr", "n2", P1) is False      # P2 parent
    assert entity_in_scope(seeded, "ncr", "missing", P1) is False  # unresolved → deny


def test_entity_in_scope_unmapped_type_allowed(seeded):
    assert entity_in_scope(seeded, "km", "whatever", P1) is True   # km not scoped


def test_entity_in_scope_unscoped_allows_all(seeded):
    assert entity_in_scope(seeded, "ncr", "n2", UNSCOPED) is True


# ── #1 workflow scoping (via the NOI the Q-WorkFlow belongs to) ──────────────

@pytest.fixture
def wf(db_session):
    db_session.add_all([
        models.Project(id="P1", name="P1"), models.Project(id="P2", name="P2"),
        models.Contractor(id="V1", name="V1"),
    ])
    db_session.add_all([
        models.NOI(id="noi1", referenceNo="NOI-1", status="Open", project_id="P1", vendor_id="V1"),
        models.NOI(id="noi2", referenceNo="NOI-2", status="Open", project_id="P2", vendor_id="V1"),
    ])
    db_session.add_all([
        models.QWorkflow(id="w1", referenceNo="QWF-1", noi_id="noi1"),
        models.QWorkflow(id="w2", referenceNo="QWF-2", noi_id="noi2"),
    ])
    db_session.commit()
    return db_session


def test_workflow_load_is_scoped(wf):
    svc = WorkflowService(wf)
    assert {q.id for q in svc._load_qworkflows(scope=P1)} == {"w1"}
    assert {q.id for q in svc._load_qworkflows(scope=UNSCOPED)} == {"w1", "w2"}


def test_workflow_stats_total_is_scoped(wf):
    svc = WorkflowService(wf)
    assert svc.get_stats(scope=P1)["total"] == 1
    assert svc.get_stats(scope=UNSCOPED)["total"] == 2
