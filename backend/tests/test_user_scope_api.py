"""IAM scope-assignment service tests (P0).

Verifies an admin can set a user's project/contractor scope, that it round-trips,
validates referenced ids, and that the resulting scope drives compute_scope.
"""

import pytest

import models
from services.user_service import UserService
from repositories.user_repository import UserRepository
from core.scope import compute_scope


@pytest.fixture
def svc(db_session):
    for pid, name in [("P1", "Project 1"), ("P2", "Project 2")]:
        db_session.add(models.Project(id=pid, name=name))
    db_session.add(models.Contractor(id="V1", name="Vendor 1"))
    db_session.commit()
    return UserService(UserRepository(db_session))


def _mk_user(db, uid=1, username="u1"):
    u = models.User(id=uid, username=username, email=f"{username}@x.com")
    db.add(u)
    db.commit()
    return u


def test_set_and_get_scope_roundtrip(svc, db_session):
    _mk_user(db_session)
    out = svc.set_user_scope(1, ["P1", "P2"], "V1")
    assert set(out["project_ids"]) == {"P1", "P2"}
    assert out["vendor_id"] == "V1"

    got = svc.get_user_scope(1)
    assert set(got["project_ids"]) == {"P1", "P2"}
    assert got["vendor_id"] == "V1"


def test_set_scope_replaces_previous(svc, db_session):
    _mk_user(db_session)
    svc.set_user_scope(1, ["P1", "P2"], "V1")
    svc.set_user_scope(1, ["P1"], None)   # narrow + clear vendor
    got = svc.get_user_scope(1)
    assert got["project_ids"] == ["P1"]
    assert got["vendor_id"] is None


def test_unknown_project_rejected(svc, db_session):
    _mk_user(db_session)
    with pytest.raises(ValueError):
        svc.set_user_scope(1, ["P1", "NOPE"], None)


def test_unknown_contractor_rejected(svc, db_session):
    _mk_user(db_session)
    with pytest.raises(ValueError):
        svc.set_user_scope(1, ["P1"], "GHOST")


def test_missing_user_returns_none(svc):
    assert svc.set_user_scope(999, ["P1"], None) is None
    assert svc.get_user_scope(999) is None


def test_assigned_scope_drives_compute_scope(svc, db_session):
    u = _mk_user(db_session, uid=7, username="contractor")
    svc.set_user_scope(7, ["P1"], "V1")
    db_session.refresh(u)
    scope = compute_scope(u, db_session)
    assert scope.project_ids == frozenset({"P1"})
    assert scope.vendor_id == "V1"
    assert scope.unrestricted is False
