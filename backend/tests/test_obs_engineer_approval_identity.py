"""Regression tests for OBS engineer closure sign-off identity (2026-10-05,
BACKLOG #20). Before this fix, qualityEngineerApprovalBy / constructionEngineerApprovalBy
were plain client-submitted strings — any authenticated user with OBS_UPDATE could
stamp any name as having approved. obs_service.py::_apply_engineer_approval_identity
now derives ApprovedBy from the authenticated caller only, mirroring ITR's approvedBy.

Uses a real db_session (not a MagicMock repo) because the fix queries models.User
for the authenticated caller's real name/company — a mock repo can't exercise that.
"""
import models
import schemas
from repositories.obs_repository import OBSRepository
from services.obs_service import OBSService


def _make_user(db_session, **overrides):
    username = overrides.get("username", "alice")
    base = dict(username=username, full_name="Alice Wu", email=f"{username}@example.com", is_active=True)
    base.update(overrides)
    user = models.User(**base)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _make_obs(db_session, **overrides):
    base = dict(
        id="obs-1", documentNumber="OBS-1", description="x", rev="0",
        submit="v", status="Open",
        qualityEngineerApproval="Pending", constructionEngineerApproval="Pending",
    )
    base.update(overrides)
    obs = models.OBS(**base)
    db_session.add(obs)
    db_session.commit()
    db_session.refresh(obs)
    return obs


def _service(db_session):
    return OBSService(OBSRepository(db_session))


def test_approving_stamps_the_real_authenticated_user_not_a_forged_name(db_session):
    alice = _make_user(db_session, username="alice", full_name="Alice Wu")
    _make_obs(db_session)
    service = _service(db_session)

    update = schemas.OBSUpdate(
        qualityEngineerApproval="Approved",
        qualityEngineerApprovalBy="Someone Else — Forged Name",
    )
    updated = service.update_obs("obs-1", update, user_id=alice.id, username=alice.username)

    assert updated.qualityEngineerApprovalBy == "Alice Wu"
    assert updated.qualityEngineerApprovalBy != "Someone Else — Forged Name"


def test_approved_by_label_includes_company_when_set(db_session):
    bob = _make_user(db_session, username="bob", full_name="Bob Lin", company_name="Acme Corp")
    _make_obs(db_session)
    service = _service(db_session)

    update = schemas.OBSUpdate(constructionEngineerApproval="Approved")
    updated = service.update_obs("obs-1", update, user_id=bob.id, username=bob.username)

    assert updated.constructionEngineerApprovalBy == "Bob Lin / Acme Corp"


def test_resaving_an_already_approved_record_does_not_restamp_a_different_viewer(db_session):
    alice = _make_user(db_session, username="alice", full_name="Alice Wu")
    carol = _make_user(db_session, username="carol", full_name="Carol Chen")
    _make_obs(
        db_session,
        qualityEngineerApproval="Approved", qualityEngineerApprovalBy="Alice Wu",
    )
    service = _service(db_session)

    # Carol resends the form with the approval still "Approved" (frontend resends
    # the whole record every save) — this must NOT overwrite Alice's name with Carol's.
    update = schemas.OBSUpdate(qualityEngineerApproval="Approved", remark="unrelated edit")
    updated = service.update_obs("obs-1", update, user_id=carol.id, username=carol.username)

    assert updated.qualityEngineerApprovalBy == "Alice Wu"


def test_rejecting_then_reapproving_restamps_the_new_approver(db_session):
    alice = _make_user(db_session, username="alice", full_name="Alice Wu")
    carol = _make_user(db_session, username="carol", full_name="Carol Chen")
    _make_obs(
        db_session,
        qualityEngineerApproval="Approved", qualityEngineerApprovalBy="Alice Wu",
    )
    service = _service(db_session)

    # Send back to Rejected, then a different user re-approves it.
    service.update_obs("obs-1", schemas.OBSUpdate(qualityEngineerApproval="Rejected"), user_id=carol.id, username=carol.username)
    updated = service.update_obs("obs-1", schemas.OBSUpdate(qualityEngineerApproval="Approved"), user_id=carol.id, username=carol.username)

    assert updated.qualityEngineerApprovalBy == "Carol Chen"


def test_update_rejects_approval_from_an_unauthenticated_caller(db_session):
    _make_obs(db_session)
    service = _service(db_session)

    update = schemas.OBSUpdate(qualityEngineerApproval="Approved")
    try:
        service.update_obs("obs-1", update, user_id=None, username=None)
        assert False, "expected ValueError"
    except ValueError as e:
        assert "authenticated" in str(e)


def test_update_rejects_approval_from_a_deactivated_user(db_session):
    dave = _make_user(db_session, username="dave", full_name="Dave Kao", is_active=False)
    _make_obs(db_session)
    service = _service(db_session)

    update = schemas.OBSUpdate(qualityEngineerApproval="Approved")
    try:
        service.update_obs("obs-1", update, user_id=dave.id, username=dave.username)
        assert False, "expected ValueError"
    except ValueError as e:
        assert "authenticated" in str(e)


def test_create_strips_any_client_submitted_approved_by(db_session):
    alice = _make_user(db_session, username="alice", full_name="Alice Wu")
    service = _service(db_session)

    create = schemas.OBSCreate(
        vendor="TestVendor", description="d", rev="0", submit="v", status="Open",
        subject="s", foundLocation="Site A",
        qualityEngineerApproval="Approved",
        qualityEngineerApprovalBy="Forged Approver",
    )
    created = service.create_obs(create, user_id=alice.id, username=alice.username)

    assert created.qualityEngineerApprovalBy is None
