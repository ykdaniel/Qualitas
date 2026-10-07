"""Router-path enforcement for the 2026-09-19 ITR approval-authority and
evidence-protection hardening. Mirrors test_scope_http.py's pattern: call
the router endpoint functions directly against a real in-memory DB with
real Role/Permission/User rows, so `current_user.role.permissions_rel` is
genuine — this exercises the actual permission-check code paths the
routers run (RoleChecker's own dependency-injection wiring is a separate,
already-covered concern; what's new and untested here is the *service and
router-level* logic layered underneath it).
"""
import json

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from core.dependencies import RoleChecker
from core.perms import ITR_APPROVE, ITR_UPDATE, CHECKLIST_CLOSE, CHECKLIST_UPDATE
from core.scope import get_scope
import models
import schemas
from routers import itr as itr_router
from routers import checklist as checklist_router
from repositories.itr_repository import ITRRepository
from repositories.checklist_repository import ChecklistRepository
from services.itr_service import ITRService
from services.checklist_service import ChecklistService


@pytest.fixture
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()

    db.add(models.Contractor(id="V1", name="Acme", abbreviation="ACM"))

    itr_update_perm = models.Permission(code=ITR_UPDATE, description="update")
    itr_approve_perm = models.Permission(code=ITR_APPROVE, description="approve")
    chk_update_perm = models.Permission(code=CHECKLIST_UPDATE, description="update")
    chk_close_perm = models.Permission(code=CHECKLIST_CLOSE, description="close")
    db.add_all([itr_update_perm, itr_approve_perm, chk_update_perm, chk_close_perm])
    db.flush()

    editor_role = models.Role(name="Editor")
    editor_role.permissions_rel = [itr_update_perm, chk_update_perm]  # no approve/close authority
    approver_role = models.Role(name="Approver")
    approver_role.permissions_rel = [itr_update_perm, itr_approve_perm, chk_update_perm, chk_close_perm]
    db.add_all([editor_role, approver_role])
    db.flush()

    editor = models.User(id=1, username="editor", email="e@x.com", is_active=True, role_id=editor_role.id)
    approver = models.User(id=2, username="approver", email="a@x.com", is_active=True, role_id=approver_role.id)
    db.add_all([editor, approver])
    db.commit()

    itr_svc = ITRService(ITRRepository(db))
    chk_svc = ChecklistService(ChecklistRepository(db))
    scope = get_scope(user=editor, db=db)  # both users are unscoped-equivalent here (no UserProject rows) — fine, this suite is about permissions, not scope

    yield db, itr_svc, chk_svc, editor, approver, scope
    db.close()


def _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope):
    itr = itr_svc.create_itr(
        schemas.ITRCreate(vendor="Acme", status="In Progress", description="d", rev="0", submit=""),
        user_id=1, username="editor", scope=scope,
    )
    template = models.Checklist(
        id="tpl-1", recordsNo="CHK-TPL-1", status="Ongoing",
        detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    )
    db.add(template)
    db.commit()
    itr_svc.link_checklist(itr.id, "tpl-1", user_id=1, username="editor", scope=scope)
    instance = chk_svc.repo.get_all(itr_id=itr.id)[0]
    chk_svc.update_checklist(
        instance.id,
        schemas.ChecklistUpdate(status="Pass", passCount=1, failCount=0,
                                 detail_data=json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": "O"}]})),
        user_id=1, username="editor",
    )
    return itr, instance


# 1. Only ITR_UPDATE (no approve authority) cannot approve via create or update.

def test_plain_editor_cannot_create_itr_as_approved(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    with pytest.raises(HTTPException) as exc:
        itr_router.create_itr(
            schemas.ITRCreate(vendor="Acme", status="Approved", description="d", rev="0", submit=""),
            itr_service=itr_svc, scope=scope, current_user=editor,
        )
    assert exc.value.status_code == 403


def test_plain_editor_cannot_update_itr_into_approved(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, _ = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    with pytest.raises(HTTPException) as exc:
        itr_router.update_itr(
            itr.id, schemas.ITRUpdate(status="Approved"),
            itr_service=itr_svc, scope=scope, current_user=editor,
        )
    assert exc.value.status_code == 403


def test_approver_can_approve_a_passing_itr(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, _ = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    result = itr_router.update_itr(
        itr.id, schemas.ITRUpdate(status="Approved"),
        itr_service=itr_svc, scope=scope, current_user=approver,
    )
    assert result.status == "Approved"


# 2. Plain editor can't Approved -> In Progress -> edit/unlink (blocked
#    outright regardless of permission — even the approver can't use the
#    normal update path).

def test_nobody_can_revert_approved_via_normal_update(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, instance = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    itr_router.update_itr(itr.id, schemas.ITRUpdate(status="Approved"), itr_service=itr_svc, scope=scope, current_user=approver)

    for user in (editor, approver):
        with pytest.raises(HTTPException) as exc:
            itr_router.update_itr(
                itr.id, schemas.ITRUpdate(status="In Progress"),
                itr_service=itr_svc, scope=scope, current_user=user,
            )
        assert exc.value.status_code == 400

    # Unlink on the still-Approved ITR is also refused.
    with pytest.raises(HTTPException) as exc:
        itr_router.unlink_checklist_from_itr(itr.id, instance.id, itr_service=itr_svc, scope=scope, current_user=approver)
    assert exc.value.status_code == 400

    # The dedicated revoke-approval endpoint is gated entirely by
    # RoleChecker(ITR_APPROVE) as its own FastAPI dependency (this route
    # has no other logic to gate — unlike create/update ITR, which share a
    # single broader permission and need the in-body check above). Since
    # this test calls router functions directly (bypassing FastAPI's
    # dependency injection, per test_scope_http.py's own established
    # pattern), exercise RoleChecker itself directly here to prove the
    # gate is real:
    role_checker = RoleChecker(ITR_APPROVE)
    with pytest.raises(HTTPException) as exc:
        role_checker(user=editor)
    assert exc.value.status_code == 403
    assert role_checker(user=approver) is approver  # approver passes through unchanged

    revoked = itr_router.revoke_itr_approval(
        itr.id, schemas.ITRRevokeApproval(new_status="In Progress", reason="fix a typo"),
        itr_service=itr_svc, scope=scope, current_user=approver,
    )
    assert revoked.status == "In Progress"


# 3. Approved content can't be overwritten via detail_data or any other update path.

def test_approved_itr_detail_data_cannot_carry_business_content(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, _ = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    itr_router.update_itr(itr.id, schemas.ITRUpdate(status="Approved"), itr_service=itr_svc, scope=scope, current_user=approver)

    with pytest.raises(HTTPException) as exc:
        itr_router.update_itr(
            itr.id, schemas.ITRUpdate(detail_data=json.dumps({"subject": "sneaked in"})),
            itr_service=itr_svc, scope=scope, current_user=approver,
        )
    assert exc.value.status_code == 400


# 4. An un-approved ITR's filled-in/Fail Checklist can't be Unlink-hard-deleted.

def test_unapproved_itr_checklist_with_evidence_cannot_be_unlinked(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, instance = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    assert itr.status == "In Progress"  # never approved

    with pytest.raises(HTTPException) as exc:
        itr_router.unlink_checklist_from_itr(itr.id, instance.id, itr_service=itr_svc, scope=scope, current_user=approver)
    assert exc.value.status_code == 400


# 5. Ongoing Checklist with real evidence can't be directly deleted either.

def test_ongoing_checklist_with_evidence_cannot_be_deleted_directly(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, instance = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    # instance.itrId is set (it's an instance) — delete_checklist already
    # refuses any instance outright, which is itself the evidence-safe
    # answer here (an instance is never directly deletable, evidence or not).
    with pytest.raises(HTTPException) as exc:
        checklist_router.delete_checklist(
            instance.id, reason=None, service=chk_svc, scope=scope, current_user=approver,
        )
    assert exc.value.status_code == 400


# 6. Deleting the parent ITR must not cascade-remove evidence.

def test_deleting_parent_itr_with_evidence_is_refused(env):
    db, itr_svc, chk_svc, editor, approver, scope = env
    itr, instance = _make_passing_itr_with_checklist(db, itr_svc, chk_svc, scope)
    with pytest.raises(HTTPException) as exc:
        itr_router.delete_itr(itr.id, itr_service=itr_svc, scope=scope, current_user=approver)
    assert exc.value.status_code == 400
    # The instance must still exist afterward.
    assert chk_svc.get_checklist(instance.id) is not None
