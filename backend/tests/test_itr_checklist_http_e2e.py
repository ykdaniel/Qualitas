"""Genuine end-to-end HTTP tests for the Checklist/ITR approval-authority
and evidence-protection hardening (2026-09-19).

Every other "router" test in this codebase (test_scope_http.py,
test_ncr_router.py, and this feature's own earlier
test_itr_approval_authority_http.py) calls router functions directly as
plain Python calls, bypassing FastAPI's dependency-injection graph,
request parsing/validation, and routing entirely — useful for exercising
service/router *logic*, but not a real claim that "the HTTP API behaves
this way." This file instead builds a minimal standalone FastAPI app
(only the itr/checklist routers — not the full `main.app`, which runs
migrations/seeding/a background scheduler at import time against the real
dev DB) and drives it with `fastapi.testclient.TestClient`, so requests go
through real routing, real Pydantic request validation, and the real
`RoleChecker` dependency exactly as production would. `get_db` and
`get_current_user` are overridden via `app.dependency_overrides` — the
standard, idiomatic FastAPI testing technique — everything downstream of
those two (RoleChecker, get_scope, the services) runs unmodified.
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from core.security import get_current_user
from core.perms import ITR_APPROVE, ITR_CREATE, ITR_UPDATE, CHECKLIST_CREATE, CHECKLIST_UPDATE, CHECKLIST_VIEW, ITR_VIEW, ITR_DELETE
import models
from routers import itr as itr_router
from routers import checklist as checklist_router


@pytest.fixture
def http_env():
    # StaticPool: TestClient dispatches sync dependency resolution to a
    # worker thread — without a single shared connection, SQLite's
    # `:memory:` database is private per-connection, so a second
    # connection opened from a different thread would see an empty DB
    # ("no such table: users") even though it's nominally "the same" engine.
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()

    db.add(models.Contractor(id="V1", name="Acme", abbreviation="ACM"))

    perm_codes = [ITR_VIEW, ITR_CREATE, ITR_UPDATE, ITR_DELETE, CHECKLIST_VIEW, CHECKLIST_CREATE, CHECKLIST_UPDATE]
    perms = {code: models.Permission(code=code, description=code) for code in perm_codes}
    approve_perm = models.Permission(code=ITR_APPROVE, description=ITR_APPROVE)
    db.add_all(list(perms.values()) + [approve_perm])
    db.flush()

    editor_role = models.Role(name="Editor")
    editor_role.permissions_rel = list(perms.values())  # no ITR_APPROVE
    approver_role = models.Role(name="Approver")
    approver_role.permissions_rel = list(perms.values()) + [approve_perm]
    db.add_all([editor_role, approver_role])
    db.flush()

    editor_user = models.User(id=1, username="editor", email="e@x.com", is_active=True, role_id=editor_role.id)
    approver_user = models.User(id=2, username="approver", email="a@x.com", is_active=True, role_id=approver_role.id)
    db.add_all([editor_user, approver_user])
    db.commit()

    app = FastAPI()
    # Both routers already declare their own prefix (/itr, /checklist) —
    # only add the shared /api outer prefix, matching main.py's own
    # `api = APIRouter(prefix="/api")` wrapping.
    app.include_router(itr_router.router, prefix="/api")
    app.include_router(checklist_router.router, prefix="/api")

    def _override_get_db():
        try:
            yield db
        finally:
            pass  # the fixture itself closes the session

    current_user_holder = {"user": approver_user}  # mutated per-request by the test via `as_user`

    def _override_get_current_user():
        return current_user_holder["user"]

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = _override_get_current_user

    client = TestClient(app)

    def as_user(user):
        current_user_holder["user"] = user

    yield client, db, editor_user, approver_user, as_user
    db.close()


def _link_and_pass(client, itr_id, template_id):
    r = client.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": template_id})
    assert r.status_code == 200, r.text
    instances = client.get("/api/checklist/", params={"itr_id": itr_id}).json()
    instance_id = instances[0]["id"]
    r = client.put(f"/api/checklist/{instance_id}/", json={
        "status": "Pass", "passCount": 1, "failCount": 0,
        "detail_data": json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "14mm", "result": "O"}]}),
    })
    assert r.status_code == 200, r.text
    return instance_id


def test_real_http_editor_gets_403_creating_approved_itr(http_env):
    client, db, editor, approver, as_user = http_env
    as_user(editor)
    r = client.post("/api/itr/", json={
        "vendor": "Acme", "status": "Approved", "description": "d", "rev": "0", "submit": "",
    })
    assert r.status_code == 403
    assert "itr:approve:all" in r.json()["detail"]


def test_real_http_approver_can_approve_and_editor_cannot(http_env):
    client, db, editor, approver, as_user = http_env
    as_user(approver)

    tpl = client.post("/api/checklist/", json={
        "activity": "Spacing Check", "date": "2026-09-19", "status": "Ongoing",
        "detail_data": json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    }).json()

    itr = client.post("/api/itr/", json={
        "vendor": "Acme", "status": "In Progress", "description": "d", "rev": "0", "submit": "",
    }).json()
    instance_id = _link_and_pass(client, itr["id"], tpl["id"])

    as_user(editor)
    r = client.put(f"/api/itr/{itr['id']}", json={"status": "Approved"})
    assert r.status_code == 403

    as_user(approver)
    r = client.put(f"/api/itr/{itr['id']}", json={"status": "Approved"})
    assert r.status_code == 200
    assert r.json()["status"] == "Approved"

    # Real Pydantic request validation: a malformed body is rejected with 422
    # before the route body ever runs (proves this is genuine request parsing,
    # not a hand-built Python object bypassing validation).
    r = client.post("/api/itr/", json={"vendor": "Acme"})  # missing required description/rev/submit
    assert r.status_code == 422


def test_real_http_unlink_rejected_with_json_detail_message(http_env):
    client, db, editor, approver, as_user = http_env
    as_user(approver)
    tpl = client.post("/api/checklist/", json={
        "activity": "Spacing Check", "date": "2026-09-19", "status": "Ongoing",
        "detail_data": json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    }).json()
    itr = client.post("/api/itr/", json={
        "vendor": "Acme", "status": "In Progress", "description": "d", "rev": "0", "submit": "",
    }).json()
    instance_id = _link_and_pass(client, itr["id"], tpl["id"])

    r = client.delete(f"/api/itr/{itr['id']}/link-checklist/{instance_id}")
    assert r.status_code == 400
    body = r.json()
    assert "detail" in body
    assert "evidence" in body["detail"]


def test_real_http_revoke_approval_requires_itr_approve_not_itr_update(http_env):
    client, db, editor, approver, as_user = http_env
    as_user(approver)
    tpl = client.post("/api/checklist/", json={
        "activity": "Spacing Check", "date": "2026-09-19", "status": "Ongoing",
        "detail_data": json.dumps({"items": [{"item": "Spacing", "criteria": "x", "situation": "", "result": ""}]}),
    }).json()
    itr = client.post("/api/itr/", json={
        "vendor": "Acme", "status": "In Progress", "description": "d", "rev": "0", "submit": "",
    }).json()
    _link_and_pass(client, itr["id"], tpl["id"])
    client.put(f"/api/itr/{itr['id']}", json={"status": "Approved"})

    as_user(editor)
    r = client.post(f"/api/itr/{itr['id']}/revoke-approval", json={"new_status": "In Progress", "reason": "x"})
    assert r.status_code == 403  # real RoleChecker(ITR_APPROVE) dependency rejects editor

    as_user(approver)
    r = client.post(f"/api/itr/{itr['id']}/revoke-approval", json={"new_status": "In Progress", "reason": ""})
    assert r.status_code == 400  # passes the permission gate, fails service validation (empty reason)

    r = client.post(f"/api/itr/{itr['id']}/revoke-approval", json={"new_status": "In Progress", "reason": "found a typo"})
    assert r.status_code == 200
    assert r.json()["status"] == "In Progress"
