"""
Real-DB integration tests for the 2026-09-19 Checklist/ITR §17 isolation
and traceability hardening.

Unit tests in test_checklist_service.py / test_itr_service.py already
cover every guard's condition in isolation with mocks. These tests instead
exercise the parts that genuinely need real rows and real foreign keys:
independence between instances, that editing a template can't leak into
an already-linked instance, the end-to-end ITR-Approved lock working
across both services together, and re-inspection traceability.
"""

import json

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import database as database_module
from database import Base
import models
import schemas
from repositories.itr_repository import ITRRepository
from repositories.checklist_repository import ChecklistRepository
from services.itr_service import ITRService
from services.checklist_service import ChecklistService
from scripts.verification.checklist_itr_inventory import find_bare_templates_with_results



def _make_approver(session, user_id=1):
    """A real, active user holding itr:approve:all — approval is attributed to a real identity now."""
    perm = session.query(models.Permission).filter_by(code="itr:approve:all").first() or models.Permission(code="itr:approve:all", description="approve")
    role = models.Role(name="Approver-%s" % user_id); role.permissions_rel = [perm]
    session.add(role); session.flush()
    session.add(models.User(id=user_id, username="tester", full_name="Test Approver", is_active=True, role_id=role.id))
    session.commit()


@pytest.fixture
def db_session(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "SessionLocal", TestingSessionLocal)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def vendor(db_session):
    contractor = models.Contractor(id="vendor-1", name="Acme Co", abbreviation="ACM")
    db_session.add(contractor)
    db_session.commit()
    return contractor


@pytest.fixture
def itr_service(db_session):
    return ITRService(ITRRepository(db_session))


@pytest.fixture
def checklist_service(db_session):
    return ChecklistService(ChecklistRepository(db_session))


def _make_itr(itr_service, vendor, **overrides):
    data = {
        "status": "In Progress",
        "raiseDate": "2026-09-19",
    }
    data.update(overrides)
    documentNumber = data.pop("documentNumber", None)
    itr = itr_service.repo.create(models.ITR(
        id=data.pop("id", None) or __import__("uuid").uuid4().hex,
        vendor_id=vendor.id,
        documentNumber=documentNumber or f"ITR-{__import__('uuid').uuid4().hex[:8]}",
        **data,
    ))
    return itr


def _make_template(checklist_service, vendor, **overrides):
    data = {
        "activity": "Rebar Installation",
        "date": "2026-09-19",
        "status": "Ongoing",
        "detail_data": json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}]}),
        "recordsNo": f"CHK-{__import__('uuid').uuid4().hex[:8]}",
    }
    data.update(overrides)
    template = checklist_service.repo.create(models.Checklist(id=__import__("uuid").uuid4().hex, **data))
    return template


def test_two_itrs_link_same_template_get_independent_instances(itr_service, checklist_service, vendor):
    itr_a = _make_itr(itr_service, vendor)
    itr_b = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor)

    instance_a = itr_service.link_checklist(itr_a.id, template.id, user_id=1, username="tester")
    instance_b = itr_service.link_checklist(itr_b.id, template.id, user_id=1, username="tester")
    assert instance_a is not None and instance_b is not None

    inst_a = checklist_service.repo.get_all(itr_id=itr_a.id)[0]
    inst_b = checklist_service.repo.get_all(itr_id=itr_b.id)[0]
    assert inst_a.id != inst_b.id
    assert inst_a.template_id == template.id == inst_b.template_id

    # Fill in instance A's result — must not appear on instance B.
    checklist_service.update_checklist(
        inst_a.id,
        schemas.ChecklistUpdate(
            status="Pass", passCount=1, failCount=0,
            detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "O"}]}),
        ),
        user_id=1, username="tester",
    )

    refreshed_b = checklist_service.get_checklist(inst_b.id)
    assert refreshed_b.status == "Ongoing"
    assert refreshed_b.passCount == 0


def test_editing_template_after_link_does_not_affect_instance(itr_service, checklist_service, vendor):
    itr = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor)

    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]
    original_detail = instance.detail_data

    # Edit the template afterward.
    checklist_service.update_checklist(
        template.id,
        schemas.ChecklistUpdate(
            activity="Different Activity",
            detail_data=json.dumps({"items": [{"item": "Totally Different", "criteria": "n/a", "situation": "", "result": ""}]}),
        ),
        user_id=1, username="tester",
    )

    refreshed_instance = checklist_service.get_checklist(instance.id)
    assert refreshed_instance.detail_data == original_detail
    assert refreshed_instance.activity == "Rebar Installation"

    refreshed_template = checklist_service.get_checklist(template.id)
    assert refreshed_template.activity == "Different Activity"
    assert refreshed_template.version == 2  # bumped once for the one real content change


def test_approved_itr_freezes_its_checklist_instance_end_to_end(itr_service, checklist_service, vendor):
    """The central finding this hardening closes: once the ITR is
    Approved, its linked instance can't be Reopened/edited/deleted/
    unlinked — not just its own Pass/Fail lock, the ITR-level one too."""
    itr = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]

    checklist_service.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(
            status="Pass", passCount=1, failCount=0,
            detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "O"}]}),
        ),
        user_id=1, username="tester",
    )

    _make_approver(itr_service.repo.db)
    itr_service.update_itr(itr.id, schemas.ITRUpdate(status="Approved"), user_id=1, username="tester")
    refreshed_itr = itr_service.get_itr(itr.id)
    assert refreshed_itr.status == "Approved"

    # Reopen attempt on the instance must fail now.
    with pytest.raises(ValueError, match="Approved"):
        checklist_service.update_checklist(
            instance.id, schemas.ChecklistUpdate(status="Ongoing"), user_id=1, username="tester",
        )

    # Direct delete must fail (it's an instance, guarded separately too).
    with pytest.raises(ValueError):
        checklist_service.delete_checklist(instance.id, user_id=1, username="tester")

    # Unlink via the ITR must also fail while Approved.
    with pytest.raises(ValueError, match="Approved"):
        itr_service.unlink_checklist(itr.id, instance.id, user_id=1, username="tester")

    # A normal update can no longer move it out of Approved at all —
    # revoke_itr_approval is the only sanctioned path now (2026-09-19).
    with pytest.raises(ValueError, match="revoke-approval"):
        itr_service.update_itr(itr.id, schemas.ITRUpdate(status="In Progress"), user_id=1, username="tester")

    # Sanctioned path: revoke approval (requires a reason), then Reopen works again.
    itr_service.revoke_itr_approval(
        itr.id, new_status="In Progress", reason="Found a transcription error", user_id=1, username="tester",
    )
    reopened = checklist_service.update_checklist(
        instance.id, schemas.ChecklistUpdate(status="Ongoing"), user_id=1, username="tester",
    )
    assert reopened.status == "Ongoing"


def test_reinspection_preserves_original_failure_and_before_after_link(itr_service, checklist_service, vendor):
    itr = _make_itr(itr_service, vendor, inspectionResult="Fail")
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    original_instance = checklist_service.repo.get_all(itr_id=itr.id)[0]

    checklist_service.update_checklist(
        original_instance.id,
        schemas.ChecklistUpdate(
            status="Fail", passCount=0, failCount=1,
            detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "X"}]}),
        ),
        user_id=1, username="tester",
    )

    # Edit the template *after* the failure, before re-inspecting — the
    # re-inspection must NOT silently pick up this new content/version.
    checklist_service.update_checklist(
        template.id,
        schemas.ChecklistUpdate(detail_data=json.dumps(
            {"items": [{"item": "Totally Different Check", "criteria": "n/a", "situation": "", "result": ""}]}
        )),
        user_id=1, username="tester",
    )
    refreshed_template = checklist_service.get_checklist(template.id)
    assert refreshed_template.version == 2

    new_itr = itr_service.create_reinspection(itr.id, user_id=1, username="tester")
    assert new_itr.originalItrId == itr.id

    # The original ITR and its failing instance are completely untouched.
    original_after = itr_service.get_itr(itr.id)
    assert original_after.status == "In Progress"  # unchanged by re-inspection creation
    original_instance_after = checklist_service.get_checklist(original_instance.id)
    assert original_instance_after.status == "Fail"

    # §17 re-inspection snapshot preservation (2026-09-19): create_reinspection
    # auto-seeds the new ITR's checklist instance from the ORIGINAL failing
    # instance's content — not a fresh link_checklist off the (now-changed)
    # live template.
    new_instances = checklist_service.repo.get_all(itr_id=new_itr.id)
    assert len(new_instances) == 1
    new_instance = new_instances[0]
    assert new_instance.status == "Ongoing"
    assert new_instance.template_id == template.id
    assert new_instance.source_template_version == 1  # original version, NOT the template's new version=2
    new_items = json.loads(new_instance.detail_data)["items"]
    assert new_items == [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}]  # same item, result blanked

    checklist_service.update_checklist(
        new_instance.id,
        schemas.ChecklistUpdate(
            status="Pass", passCount=1, failCount=0,
            detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "O"}]}),
        ),
        user_id=1, username="tester",
    )

    # Two-hop traceability: passed instance -> its ITR -> originalItrId -> original ITR -> original failing instance.
    passed_instance = checklist_service.get_checklist(new_instance.id)
    passed_itr = itr_service.get_itr(passed_instance.itrId)
    assert passed_itr.originalItrId == itr.id
    original_itr_again = itr_service.get_itr(passed_itr.originalItrId)
    original_failing_instance_again = checklist_service.repo.get_all(itr_id=original_itr_again.id)[0]
    assert original_failing_instance_again.status == "Fail"
    assert original_failing_instance_again.id == original_instance.id


def test_chained_reinspections_trace_back_to_first_failure(itr_service, checklist_service, vendor):
    """Two re-inspections deep — the very first failure must still be
    reachable by walking originalItrId repeatedly (no new fields added
    for query convenience, per the requirement)."""
    itr_1 = _make_itr(itr_service, vendor, inspectionResult="Fail")
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr_1.id, template.id, user_id=1, username="tester")
    instance_1 = checklist_service.repo.get_all(itr_id=itr_1.id)[0]
    checklist_service.update_checklist(
        instance_1.id,
        schemas.ChecklistUpdate(status="Fail", passCount=0, failCount=1,
                                 detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "X"}]})),
        user_id=1, username="tester",
    )

    itr_2 = itr_service.create_reinspection(itr_1.id, user_id=1, username="tester")
    instance_2 = checklist_service.repo.get_all(itr_id=itr_2.id)[0]
    checklist_service.update_checklist(
        instance_2.id,
        schemas.ChecklistUpdate(status="Fail", passCount=0, failCount=1,
                                 detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "X"}]})),
        user_id=1, username="tester",
    )
    itr_service.update_itr(itr_2.id, schemas.ITRUpdate(inspectionResult="Fail"), user_id=1, username="tester")

    itr_3 = itr_service.create_reinspection(itr_2.id, user_id=1, username="tester")
    instance_3 = checklist_service.repo.get_all(itr_id=itr_3.id)[0]
    assert instance_3.template_id == template.id  # still the same item being re-inspected
    checklist_service.update_checklist(
        instance_3.id,
        schemas.ChecklistUpdate(status="Pass", passCount=1, failCount=0,
                                 detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": "O"}]})),
        user_id=1, username="tester",
    )

    # Walk the chain back from the final pass to the very first failure.
    hop_2 = itr_service.get_itr(itr_3.originalItrId)
    assert hop_2.id == itr_2.id
    hop_1 = itr_service.get_itr(hop_2.originalItrId)
    assert hop_1.id == itr_1.id
    assert hop_1.originalItrId is None  # the actual first failure — chain ends here
    first_failing_instance = checklist_service.repo.get_all(itr_id=hop_1.id)[0]
    assert first_failing_instance.status == "Fail"
    assert first_failing_instance.id == instance_1.id


def test_inventory_finds_bare_template_with_results(db_session, checklist_service, vendor):
    """The read-only inventory script's counting function must catch a
    legacy-shaped anomaly (bare template carrying results) inserted
    directly, bypassing the service-layer guards — exactly the shape the
    known production row QTS-RKS-HL-CHK-000001 has."""
    clean_template = _make_template(checklist_service, vendor)
    bad_row = models.Checklist(
        id="legacy-bad-1", recordsNo="CHK-LEGACY-001", status="Pass", passCount=1, failCount=0,
        detail_data=json.dumps({"items": [{"item": "x", "criteria": "y", "situation": "", "result": "O"}]}),
    )
    db_session.add(bad_row)
    db_session.commit()

    count, sample = find_bare_templates_with_results(db_session)
    assert count == 1
    assert sample == ["CHK-LEGACY-001"]


# --- 2026-09-19 browser-verified fix: ITR snapshot items must be locked ---

def test_instance_update_cannot_add_an_item(itr_service, checklist_service, vendor):
    """Direct API use (bypassing the frontend, which no longer offers an
    Add button at all) must still be rejected — item/criteria are fixed
    at link time, only situation/result may be filled in."""
    itr = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]

    with pytest.raises(ValueError, match="add, remove, or rewrite"):
        checklist_service.update_checklist(
            instance.id,
            schemas.ChecklistUpdate(detail_data=json.dumps({"items": [
                {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""},
                {"item": "Extra Item", "criteria": "n/a", "situation": "", "result": ""},
            ]})),
            user_id=1, username="tester",
        )

    refreshed = checklist_service.repo.get_by_id(instance.id)
    assert json.loads(refreshed.detail_data)["items"] == [
        {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}
    ]


def test_instance_update_cannot_remove_an_item(itr_service, checklist_service, vendor):
    itr = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor, detail_data=json.dumps({"items": [
        {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""},
        {"item": "Cover", "criteria": ">=40mm", "situation": "", "result": ""},
    ]}))
    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]

    with pytest.raises(ValueError, match="add, remove, or rewrite"):
        checklist_service.update_checklist(
            instance.id,
            schemas.ChecklistUpdate(detail_data=json.dumps({"items": [
                {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""},
            ]})),
            user_id=1, username="tester",
        )


def test_instance_update_cannot_rewrite_item_or_criteria_text(itr_service, checklist_service, vendor):
    itr = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]

    with pytest.raises(ValueError, match="add, remove, or rewrite"):
        checklist_service.update_checklist(
            instance.id,
            schemas.ChecklistUpdate(detail_data=json.dumps({"items": [
                {"item": "Spacing", "criteria": "<=500mm", "situation": "", "result": ""},  # criteria altered
            ]})),
            user_id=1, username="tester",
        )


def test_instance_update_situation_and_result_only_still_allowed(itr_service, checklist_service, vendor):
    """The actual, expected use of this endpoint — filling in the
    inspection — must be completely unaffected by the new guard."""
    itr = _make_itr(itr_service, vendor)
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr.id, template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]

    updated = checklist_service.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(
            status="Pass", passCount=1, failCount=0,
            detail_data=json.dumps({"items": [
                {"item": "Spacing", "criteria": "<=200mm", "situation": "Measured 150mm", "result": "O"},
            ]}),
        ),
        user_id=1, username="tester",
    )
    assert updated.status == "Pass"
    assert json.loads(updated.detail_data)["items"][0]["situation"] == "Measured 150mm"


def test_instance_from_blank_template_cannot_gain_an_item(itr_service, checklist_service, vendor):
    """2026-09-19 tightening: a blank template (zero items) linked to an
    ITR produces a genuinely empty instance snapshot — empty-to-non-empty
    is a structural change exactly like any other and must be rejected,
    not waved through as "first-time population". Real DB, no mocks."""
    itr = _make_itr(itr_service, vendor)
    blank_template = _make_template(checklist_service, vendor, detail_data=json.dumps({"items": []}))
    itr_service.link_checklist(itr.id, blank_template.id, user_id=1, username="tester")
    instance = checklist_service.repo.get_all(itr_id=itr.id)[0]
    assert json.loads(instance.detail_data)["items"] == []

    with pytest.raises(ValueError, match="add, remove, or rewrite"):
        checklist_service.update_checklist(
            instance.id,
            schemas.ChecklistUpdate(detail_data=json.dumps({"items": [
                {"item": "Snuck In", "criteria": "n/a", "situation": "", "result": ""},
            ]})),
            user_id=1, username="tester",
        )

    # Data unchanged — still genuinely empty, not silently populated.
    refreshed = checklist_service.repo.get_by_id(instance.id)
    assert json.loads(refreshed.detail_data)["items"] == []


def test_reinspection_preserves_original_criteria_blanks_result_leaves_original_failure_untouched(
    itr_service, checklist_service, vendor
):
    """Business rule check: a re-inspection reuses the original snapshot's
    item/criteria unchanged, starts with observation/result blanked, and
    never touches the original (still-failing) instance."""
    itr_1 = _make_itr(itr_service, vendor, inspectionResult="Fail")
    template = _make_template(checklist_service, vendor)
    itr_service.link_checklist(itr_1.id, template.id, user_id=1, username="tester")
    instance_1 = checklist_service.repo.get_all(itr_id=itr_1.id)[0]
    checklist_service.update_checklist(
        instance_1.id,
        schemas.ChecklistUpdate(status="Fail", passCount=0, failCount=1,
                                 detail_data=json.dumps({"items": [
                                     {"item": "Spacing", "criteria": "<=200mm", "situation": "Measured 350mm", "result": "X"},
                                 ]})),
        user_id=1, username="tester",
    )

    itr_2 = itr_service.create_reinspection(itr_1.id, user_id=1, username="tester")
    instance_2 = checklist_service.repo.get_all(itr_id=itr_2.id)[0]

    # New instance: same item/criteria as the original snapshot, but
    # observation/result both blanked — nothing pre-filled from the failure.
    assert json.loads(instance_2.detail_data)["items"] == [
        {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""}
    ]

    # The original failing instance itself is completely untouched.
    original_still = checklist_service.repo.get_by_id(instance_1.id)
    assert original_still.status == "Fail"
    assert json.loads(original_still.detail_data)["items"][0]["situation"] == "Measured 350mm"
    assert json.loads(original_still.detail_data)["items"][0]["result"] == "X"
