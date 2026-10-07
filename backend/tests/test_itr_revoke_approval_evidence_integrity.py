"""Regression tests for 4 bugs an independent review reproduced in an
isolated in-memory DB (2026-09-19), on top of the approval-authority /
evidence-protection hardening in test_checklist_itr_isolation_integration.py
and test_itr_approval_authority_http.py:

1. revoke_itr_approval committed the status change via repo.update()
   (which commits on its own) *before* log_audit() ran (add-only, no
   commit) — the audit entry was silently lost on session close.
2. The audit snapshot only captured the ITR's own columns, not the
   Checklist instances' actual item/criteria/situation/result content.
3. _touched_fields_carry_results (the shared evidence predicate used by
   both Unlink/delete's evidence lock and the bare-template guard) never
   looked at `situation` — an item with a real recorded observation
   ("Measured 14mm") but a still-blank `result` read as "no evidence."
4. _blanked_item_results (the re-inspection snapshot seeder) only cleared
   `result`, leaving the previous execution's `situation` text bleeding
   into the new instance.

Uses a StaticPool-backed in-memory engine (not per-test MagicMocks) so
"close the session, open a new one, verify persisted" is actually real —
that's the whole point of test #1 below.
"""
import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import database as database_module
from database import Base
import models
import schemas
from repositories.itr_repository import ITRRepository
from repositories.checklist_repository import ChecklistRepository
from services.itr_service import ITRService, _blanked_item_results
from services.checklist_service import ChecklistService, _instance_has_historical_evidence



def _make_approver(session, user_id=1):
    """A real, active user holding itr:approve:all — approval is attributed to a real identity now."""
    perm = session.query(models.Permission).filter_by(code="itr:approve:all").first() or models.Permission(code="itr:approve:all", description="approve")
    role = models.Role(name="Approver-%s" % user_id); role.permissions_rel = [perm]
    session.add(role); session.flush()
    session.add(models.User(id=user_id, username="tester", full_name="Test Approver", is_active=True, role_id=role.id))
    session.commit()


@pytest.fixture
def engine():
    eng = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture
def db_session(engine, monkeypatch):
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "SessionLocal", Session)
    yield session
    session.close()


@pytest.fixture
def vendor(db_session):
    c = models.Contractor(id="vendor-1", name="Acme Co", abbreviation="ACM")
    db_session.add(c)
    db_session.commit()
    return c


def _services(session):
    return ITRService(ITRRepository(session)), ChecklistService(ChecklistRepository(session))


def _make_approved_itr_with_evidence(engine, vendor_id, situation="Measured 14mm", result="O"):
    """Build an Approved ITR with one linked, evidenced Checklist instance,
    entirely through a throwaway session that's closed before returning —
    forces every subsequent step to go through fresh sessions, so nothing
    is "still attached and looks persisted" by accident."""
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    itr_svc, chk_svc = _services(session)
    itr = itr_svc.repo.create(models.ITR(
        id="itr-1", vendor_id=vendor_id, documentNumber="ITR-1", status="In Progress",
    ))
    template = models.Checklist(
        id="tpl-1", recordsNo="CHK-TPL-1", status="Ongoing", version=1,
        detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}]}),
    )
    session.add(template)
    session.commit()
    itr_svc.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = chk_svc.repo.get_all(itr_id=itr.id)[0]
    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(
            status="Pass" if result else "Ongoing", passCount=1 if result else 0, failCount=0,
            detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": situation, "result": result}]}),
        ),
        user_id=1, username="tester",
    )
    _make_approver(session)
    itr_svc.update_itr(itr.id, schemas.ITRUpdate(status="Approved"), user_id=1, username="tester")
    itr_id, instance_id = itr.id, instance.id
    session.close()
    return itr_id, instance_id


# ---------------------------------------------------------------------------
# Bug 1: atomicity — status + audit history in one transaction
# ---------------------------------------------------------------------------

def test_revoke_persists_audit_log_visible_from_a_new_session(engine, vendor):
    itr_id, _ = _make_approved_itr_with_evidence(engine, vendor.id)

    write_session = sessionmaker(bind=engine)()
    itr_svc, _ = _services(write_session)
    itr_svc.revoke_itr_approval(itr_id, new_status="In Progress", reason="fix a typo", user_id=1, username="tester")
    write_session.close()  # closing without an extra commit — revoke_itr_approval must have committed itself

    fresh_session = sessionmaker(bind=engine)()
    itr = fresh_session.get(models.ITR, itr_id)
    assert itr.status == "In Progress"
    logs = fresh_session.query(models.AuditLog).filter(
        models.AuditLog.entity_type == "ITR", models.AuditLog.action == "REVOKE_APPROVAL",
    ).all()
    assert len(logs) == 1
    fresh_session.close()


def test_audit_failure_prevents_status_change_and_rolls_back(engine, vendor, monkeypatch):
    itr_id, _ = _make_approved_itr_with_evidence(engine, vendor.id)

    write_session = sessionmaker(bind=engine)()
    itr_svc, _ = _services(write_session)
    monkeypatch.setattr(
        "services.itr_service.log_audit",
        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("simulated audit failure")),
    )
    with pytest.raises(RuntimeError):
        itr_svc.revoke_itr_approval(itr_id, new_status="In Progress", reason="fix a typo", user_id=1, username="tester")
    write_session.close()

    fresh_session = sessionmaker(bind=engine)()
    itr = fresh_session.get(models.ITR, itr_id)
    assert itr.status == "Approved"  # unchanged — rolled back together with the failed audit write
    logs = fresh_session.query(models.AuditLog).filter(
        models.AuditLog.entity_type == "ITR", models.AuditLog.action == "REVOKE_APPROVAL",
    ).all()
    assert len(logs) == 0
    fresh_session.close()


# ---------------------------------------------------------------------------
# Bug 2: snapshot must include Checklist content, and stay frozen afterward
# ---------------------------------------------------------------------------

def test_revoke_snapshot_includes_full_checklist_content(engine, vendor):
    itr_id, instance_id = _make_approved_itr_with_evidence(engine, vendor.id, situation="Measured 14mm", result="O")

    session = sessionmaker(bind=engine)()
    itr_svc, _ = _services(session)
    itr_svc.revoke_itr_approval(itr_id, new_status="In Progress", reason="fix a typo", user_id=1, username="tester")

    log = session.query(models.AuditLog).filter(
        models.AuditLog.entity_type == "ITR", models.AuditLog.action == "REVOKE_APPROVAL",
    ).one()
    old_value = json.loads(log.old_value)
    checklists = old_value["checklists"]
    assert len(checklists) == 1
    snap = checklists[0]
    assert snap["id"] == instance_id
    assert snap["status"] == "Pass"
    assert snap["items"] == [{"item": "Spacing", "criteria": "<=200mm", "situation": "Measured 14mm", "result": "O"}]
    session.close()


def test_revoked_snapshot_unaffected_by_later_checklist_edits(engine, vendor):
    """After revoking, the ITR is back in 'In Progress' — its checklist
    instance can legitimately be edited again. The audit snapshot taken
    at the revoke_itr_approval call (NOT at original approval time — see
    _build_checklist_approval_snapshot's docstring) must not change
    retroactively once further edits happen."""
    itr_id, instance_id = _make_approved_itr_with_evidence(engine, vendor.id, situation="Measured 14mm", result="O")

    session = sessionmaker(bind=engine)()
    itr_svc, chk_svc = _services(session)
    itr_svc.revoke_itr_approval(itr_id, new_status="In Progress", reason="fix a typo", user_id=1, username="tester")

    chk_svc.update_checklist(instance_id, schemas.ChecklistUpdate(status="Ongoing"), user_id=1, username="tester")  # Reopen
    chk_svc.update_checklist(
        instance_id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "Measured 19mm (corrected)", "result": "X"}]}
        ), status="Fail", passCount=0, failCount=1),
        user_id=1, username="tester",
    )

    log = session.query(models.AuditLog).filter(
        models.AuditLog.entity_type == "ITR", models.AuditLog.action == "REVOKE_APPROVAL",
    ).one()
    old_value = json.loads(log.old_value)
    snap = old_value["checklists"][0]
    # Still the content as it stood at the revoke call, not the just-made edit.
    assert snap["status"] == "Pass"
    assert snap["items"][0]["situation"] == "Measured 14mm"
    assert snap["items"][0]["result"] == "O"
    session.close()


# ---------------------------------------------------------------------------
# Bug 3: situation-only evidence must be recognized
# ---------------------------------------------------------------------------

def test_situation_only_instance_counts_as_evidence(engine, vendor):
    """An Ongoing instance with situation filled in but result still blank
    — _instance_has_historical_evidence must say True (the exact bug
    reproduced)."""
    session = sessionmaker(bind=engine)()
    itr_svc, chk_svc = _services(session)
    itr = itr_svc.repo.create(models.ITR(id="itr-2", vendor_id=vendor.id, documentNumber="ITR-2", status="In Progress"))
    template = models.Checklist(
        id="tpl-2", recordsNo="CHK-TPL-2", status="Ongoing", version=1,
        detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    )
    session.add(template)
    session.commit()
    itr_svc.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = chk_svc.repo.get_all(itr_id=itr.id)[0]
    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "Spacing", "criteria": "x", "situation": "Measured 14mm", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    refreshed = chk_svc.get_checklist(instance.id)
    assert refreshed.status == "Ongoing"  # never reached Pass/Fail
    assert refreshed.evidence_recorded_at is not None  # the permanent marker, not just current content
    assert _instance_has_historical_evidence(refreshed) is True

    # Cannot be deleted directly (it's an instance — always refused) ...
    with pytest.raises(ValueError):
        chk_svc.delete_checklist(instance.id, user_id=1, username="tester")
    # ... nor unlinked, specifically because it holds evidence.
    with pytest.raises(ValueError, match="evidence"):
        itr_svc.unlink_checklist(itr.id, instance.id, user_id=1, username="tester")
    session.close()


def test_clearing_recorded_evidence_still_blocks_unlink_and_itr_delete(engine, vendor):
    """The business decision (2026-09-19): normal editing of an
    in-progress inspection stays allowed, including clearing a mistaken
    entry — but that must NOT turn a once-evidenced instance back into
    something that can be hard-deleted. Save observation -> clear
    observation -> close session -> fresh session attempts Unlink and
    deleting the parent ITR -> both must be refused, and both the
    original save and the clearing operation must be visible in the
    audit history."""
    itr_id = "itr-clear-1"
    write_session = sessionmaker(bind=engine)()
    itr_svc, chk_svc = _services(write_session)
    itr = itr_svc.repo.create(models.ITR(id=itr_id, vendor_id=vendor.id, documentNumber="ITR-CLEAR-1", status="In Progress"))
    template = models.Checklist(
        id="tpl-clear-1", recordsNo="CHK-TPL-CLEAR-1", status="Ongoing", version=1,
        detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    )
    write_session.add(template)
    write_session.commit()
    itr_svc.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = chk_svc.repo.get_all(itr_id=itr.id)[0]
    instance_id = instance.id

    # Save an observation.
    chk_svc.update_checklist(
        instance_id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "Spacing", "criteria": "x", "situation": "Measured 14mm", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    # Clear it back to blank — normal editing, must stay allowed.
    chk_svc.update_checklist(
        instance_id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    write_session.close()

    # Fresh session, fresh service instances — nothing "still attached".
    fresh_session = sessionmaker(bind=engine)()
    fresh_itr_svc, fresh_chk_svc = _services(fresh_session)

    refreshed = fresh_chk_svc.get_checklist(instance_id)
    assert json.loads(refreshed.detail_data)["items"][0]["situation"] == ""  # genuinely cleared now
    assert refreshed.evidence_recorded_at is not None  # ... but the permanent marker survived the clear

    with pytest.raises(ValueError, match="evidence"):
        fresh_itr_svc.unlink_checklist(itr_id, instance_id, user_id=1, username="tester")
    with pytest.raises(ValueError, match="evidence"):
        fresh_itr_svc.delete_itr(itr_id, user_id=1, username="tester")

    # Both the original save and the clearing operation are in the audit
    # trail — before/after values, actor, and timestamp for each.
    logs = fresh_session.query(models.AuditLog).filter(
        models.AuditLog.entity_type == "Checklist", models.AuditLog.entity_id == instance_id,
        models.AuditLog.action == "UPDATE",
    ).order_by(models.AuditLog.timestamp).all()
    assert len(logs) == 2
    save_log, clear_log = logs
    assert "Measured 14mm" in save_log.new_value
    assert json.loads(save_log.old_value)["detail_data"] != save_log.new_value  # before/after both captured
    assert "Measured 14mm" not in clear_log.new_value
    assert "Measured 14mm" in clear_log.old_value  # the pre-clear value is recoverable from history
    assert save_log.user_id == 1 and clear_log.user_id == 1
    assert save_log.timestamp and clear_log.timestamp
    fresh_session.close()


def test_never_evidenced_mistaken_link_can_still_be_unlinked(engine, vendor):
    """Companion case: a brand-new instance that was never touched at all
    (a genuine mistaken link, e.g. wrong template picked) must still be
    removable under the existing rules — this hardening protects records
    that actually held evidence, it must not lock down every link."""
    session = sessionmaker(bind=engine)()
    itr_svc, chk_svc = _services(session)
    itr = itr_svc.repo.create(models.ITR(id="itr-never", vendor_id=vendor.id, documentNumber="ITR-NEVER", status="In Progress"))
    template = models.Checklist(
        id="tpl-never", recordsNo="CHK-TPL-NEVER", status="Ongoing", version=1,
        detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    )
    session.add(template)
    session.commit()
    itr_svc.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = chk_svc.repo.get_all(itr_id=itr.id)[0]

    assert instance.evidence_recorded_at is None
    assert _instance_has_historical_evidence(instance) is False

    result = itr_svc.unlink_checklist(itr.id, instance.id, user_id=1, username="tester")
    assert result is not None
    assert chk_svc.get_checklist(instance.id) is None  # actually removed
    session.close()


# ---------------------------------------------------------------------------
# Bug 4: re-inspection must clear situation, not just result
# ---------------------------------------------------------------------------

def test_reinspection_clears_situation_and_result_keeps_item_and_criteria(engine, vendor):
    session = sessionmaker(bind=engine)()
    itr_svc, chk_svc = _services(session)
    itr = itr_svc.repo.create(models.ITR(
        id="itr-4", vendor_id=vendor.id, documentNumber="ITR-4", status="In Progress", inspectionResult="Fail",
    ))
    template = models.Checklist(
        id="tpl-4", recordsNo="CHK-TPL-4", status="Ongoing", version=1,
        detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}]}),
    )
    session.add(template)
    session.commit()
    itr_svc.link_checklist(itr.id, template.id, user_id=1, username="tester")
    original_instance = chk_svc.repo.get_all(itr_id=itr.id)[0]
    chk_svc.update_checklist(
        original_instance.id,
        schemas.ChecklistUpdate(
            status="Fail", passCount=0, failCount=1,
            detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "Measured 250mm — over spec", "result": "X"}]}),
        ),
        user_id=1, username="tester",
    )
    original_detail_before = chk_svc.get_checklist(original_instance.id).detail_data

    new_itr = itr_svc.create_reinspection(itr.id, user_id=1, username="tester")
    new_instance = chk_svc.repo.get_all(itr_id=new_itr.id)[0]
    new_items = json.loads(new_instance.detail_data)["items"]

    assert new_items == [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}]

    # Original record must remain unchanged by the snapshot operation.
    original_detail_after = chk_svc.get_checklist(original_instance.id).detail_data
    assert original_detail_after == original_detail_before
    assert json.loads(original_detail_after)["items"][0]["situation"] == "Measured 250mm — over spec"
    session.close()


def test_blanked_item_results_does_not_mutate_input():
    original = json.dumps({"items": [{"item": "A", "criteria": "B", "situation": "Measured X", "result": "O"}]})
    _blanked_item_results(original)
    assert json.loads(original)["items"][0]["situation"] == "Measured X"
    assert json.loads(original)["items"][0]["result"] == "O"
