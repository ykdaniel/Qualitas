"""P0 data-isolation tests.

Covers the scope primitives (core.scope) and their enforcement through the NCR
repository/service: scoped users see only their own projects/contractor, and
single-record get/update/delete on out-of-scope records behaves as not-found.
"""

import pytest

import models
from core.scope import (
    Scope,
    UNSCOPED,
    ScopeForbidden,
    compute_scope,
    apply_scope,
    record_in_scope,
    enforce_create_scope,
)
from repositories.ncr_repository import NCRRepository
from services.ncr_service import NCRService


# ── fixtures ────────────────────────────────────────────────────────────────

def _mk_ncr(db, ncr_id, doc, project_id, vendor_id, status="Open"):
    ncr = models.NCR(
        id=ncr_id, documentNumber=doc, status=status,
        project_id=project_id, vendor_id=vendor_id,
    )
    db.add(ncr)
    db.commit()
    return ncr


@pytest.fixture
def seeded(db_session):
    """Two projects, two contractors, three NCRs spread across them."""
    for pid, name in [("P1", "Project 1"), ("P2", "Project 2")]:
        db_session.add(models.Project(id=pid, name=name))
    for vid, name in [("V1", "Vendor 1"), ("V2", "Vendor 2")]:
        db_session.add(models.Contractor(id=vid, name=name))
    db_session.commit()
    _mk_ncr(db_session, "n1", "NCR-001", "P1", "V1")
    _mk_ncr(db_session, "n2", "NCR-002", "P1", "V2")
    _mk_ncr(db_session, "n3", "NCR-003", "P2", "V1")
    return db_session


def _svc(db):
    return NCRService(NCRRepository(db))


# ── compute_scope ───────────────────────────────────────────────────────────

def test_admin_is_unscoped(db_session):
    role = models.Role(name="admin")
    db_session.add(role)
    db_session.commit()
    user = models.User(username="boss", email="b@x.com", role_id=role.id)
    db_session.add(user)
    db_session.commit()
    assert compute_scope(user, db_session).unrestricted is True


def test_user_without_config_is_unscoped(db_session):
    user = models.User(username="legacy", email="l@x.com")
    db_session.add(user)
    db_session.commit()
    assert compute_scope(user, db_session).unrestricted is True


def test_project_scoped_user(seeded):
    db = seeded
    user = models.User(username="owner", email="o@x.com")
    db.add(user)
    db.commit()
    db.add(models.UserProject(user_id=user.id, project_id="P1"))
    db.commit()
    scope = compute_scope(user, db)
    assert scope.project_ids == frozenset({"P1"})
    assert scope.vendor_id is None


def test_contractor_scoped_user(seeded):
    db = seeded
    user = models.User(username="contractor", email="c@x.com", vendor_id="V1")
    db.add(user)
    db.commit()
    db.add(models.UserProject(user_id=user.id, project_id="P1"))
    db.commit()
    scope = compute_scope(user, db)
    assert scope.project_ids == frozenset({"P1"})
    assert scope.vendor_id == "V1"


# ── list filtering (repo.get_all via apply_scope) ───────────────────────────

def test_unscoped_sees_all(seeded):
    rows = _svc(seeded).get_ncrs(scope=UNSCOPED)
    assert {r.id for r in rows} == {"n1", "n2", "n3"}


def test_project_scope_filters_list(seeded):
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    rows = _svc(seeded).get_ncrs(scope=scope)
    assert {r.id for r in rows} == {"n1", "n2"}  # both vendors in P1, not P2


def test_contractor_scope_filters_list(seeded):
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id="V1")
    rows = _svc(seeded).get_ncrs(scope=scope)
    assert {r.id for r in rows} == {"n1"}  # P1 + V1 only


def test_vendor_only_scope_spans_projects(seeded):
    scope = Scope(project_ids=None, vendor_id="V1")
    rows = _svc(seeded).get_ncrs(scope=scope)
    assert {r.id for r in rows} == {"n1", "n3"}  # V1 across P1 and P2


# ── single-record gating (get / update / delete) ────────────────────────────

def test_get_out_of_scope_is_none(seeded):
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    svc = _svc(seeded)
    assert svc.get_ncr("n1", scope=scope) is not None   # in scope
    assert svc.get_ncr("n3", scope=scope) is None        # P2, hidden


def test_update_out_of_scope_is_none(seeded):
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    import schemas
    upd = schemas.NCRUpdate(remark="x")
    assert _svc(seeded).update_ncr("n3", upd, scope=scope) is None


def test_delete_out_of_scope_is_false(seeded):
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    assert _svc(seeded).delete_ncr("n3", scope=scope) is False


# ── create enforcement ──────────────────────────────────────────────────────

def test_enforce_create_rejects_foreign_project():
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    with pytest.raises(ScopeForbidden):
        enforce_create_scope({"project_id": "P2"}, scope)


def test_enforce_create_autofills_single_project():
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)
    data = {}
    enforce_create_scope(data, scope)
    assert data["project_id"] == "P1"


def test_enforce_create_forces_vendor():
    scope = Scope(project_ids=None, vendor_id="V1")
    data = {"vendor_id": "V2"}      # caller tried to spoof another vendor
    enforce_create_scope(data, scope)
    assert data["vendor_id"] == "V1"


def test_enforce_create_noop_when_unscoped():
    data = {"project_id": "P2", "vendor_id": "V2"}
    enforce_create_scope(data, UNSCOPED)
    assert data == {"project_id": "P2", "vendor_id": "V2"}


# ── primitives ──────────────────────────────────────────────────────────────

def test_record_in_scope():
    scope = Scope(project_ids=frozenset({"P1"}), vendor_id="V1")

    class R:
        project_id = "P1"
        vendor_id = "V1"

    assert record_in_scope(R(), scope) is True
    R.vendor_id = "V2"
    assert record_in_scope(R(), scope) is False
    R.vendor_id = "V1"
    R.project_id = "P2"
    assert record_in_scope(R(), scope) is False
    assert record_in_scope(None, scope) is False
    assert record_in_scope(R(), UNSCOPED) is True
