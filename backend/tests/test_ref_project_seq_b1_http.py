"""REF-PROJECT-SEQ-2026-001 batch 1 — where an account works decides what it sees (business decisions D4–D6, D8, D13, D20).

* A system administrator is unscoped and picks projects from the menu.
* Every other account works in ONE project per session: bound to one project, that one; bound to several, the one
  chosen after sign-in (POST /auth/select-project — once; switching means signing in again); the choice rides in the
  token and only counts while the account is still bound to it.
* Bound to none: a "non project member" — sees nothing (it used to be unscoped and see everything: a security fix).
* IAM: every non-admin account must have a project. PQP history is scope-checked (it answered for any id).
* Related documents stay inside the root record's project; a shared ITP template (no project) may appear anywhere.
* Legacy records without a project go to the only project, once.
Real logins and routes on a throw-away file-backed SQLite; brand-new Sessions for every database assertion.
"""
import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm


_NCR = dict(description="d", rev="Rev1.0", submit="2026-10-01")


def _seed(S):
    db = S()
    try:
        def role(name, codes):
            r = models.Role(name=name)
            r.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
            db.add(r)
            db.flush()
            return r
        worker = role("Worker", [perms.NCR_VIEW, perms.PQP_VIEW, perms.KM_VIEW])
        role("NoKM", [perms.NCR_VIEW])
        admin = role("admin", [perms.NCR_VIEW, perms.PQP_VIEW, perms.USER_MANAGE, perms.USER_VIEW, perms.ROLE_MANAGE])
        db.add_all([models.Project(id="PA", name="Alpha", code="PA"), models.Project(id="PB", name="Beta", code="PB"),
                    models.Contractor(id="V1", name="V One", abbreviation="V1")])
        db.flush()

        def user(username, r, projects=(), vendor=None):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True, company_name="Co",
                            hashed_password=get_password_hash(PW), role_id=r.id, vendor_id=vendor)
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        user("boss", admin)
        user("nobody", worker)                       # bound to no project
        user("solo", worker, ["PA"])
        user("multi", worker, ["PA", "PB"])
        user("vendor_only", worker, vendor="V1")    # contractor binding without a project: still not a member
        db.add_all([
            models.NCR(id="ncr-a", documentNumber="NCR-A", status="Open", project_id="PA", **_NCR),
            models.NCR(id="ncr-b", documentNumber="NCR-B", status="Open", project_id="PB", **_NCR),
            models.PQP(id="pqp-b", pqpNo="PQP-B", title="b", status="Draft", project_id="PB"),
            models.PQPHistory(id="h1", pqp_id="pqp-b", version="Rev1", version_no=1, title="old", created_at="2026-10-01"),
        ])
        db.commit()
    finally:
        db.close()


@pytest.fixture
def env(tmp_path):
    from database import Base, get_db
    from routers import auth as auth_router, file_router, iam as iam_router, ncr as ncr_router, pqp as pqp_router
    import database as database_module
    import db_migrations
    import core.security as security_module
    engine = create_engine(f"sqlite:///{tmp_path / 'b1.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(S)
    from core.refusals import RefusalHTTPException, refusal_exception_handler
    app = FastAPI()
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)     # as main.py: coded refusals carry `code`
    for r in (auth_router.router, file_router.router, iam_router.router, ncr_router.router, pqp_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = S()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    orig = (database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal)
    database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = engine, S, engine, S
    try:
        yield Env(app, S)
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _ncrs(client, **params):
    r = client.get("/api/ncr/", params=params)
    assert r.status_code == 200, r.text
    return {n["id"] for n in r.json()}


def _profile(client):
    r = client.get("/api/user/profile")
    assert r.status_code == 200, r.text
    return r.json()


# ══ who sees what ═══════════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("username", ["nobody", "vendor_only"])
def test_an_account_without_a_project_sees_nothing(env, username):
    c = env.login(username)
    p = _profile(c)
    assert p["project_status"] == "non_member" and p["current_project_id"] is None and p["is_admin"] is False
    assert _ncrs(c) == set() and _ncrs(c, project_id="PA") == set()
    assert c.get("/api/ncr/ncr-a").status_code == 404


def test_one_project_works_in_it_without_choosing(env):
    c = env.login("solo")
    p = _profile(c)
    assert p["project_status"] == "working" and p["current_project_id"] == "PA"
    assert [x["id"] for x in p["projects"]] == ["PA"]
    assert _ncrs(c) == {"ncr-a"} and _ncrs(c, project_id="PB") == set()
    assert c.get("/api/ncr/ncr-b").status_code == 404


def test_several_projects_choose_once_and_then_see_only_that_one(env):
    c = env.login("multi")
    p = _profile(c)
    assert p["project_status"] == "choose" and {x["id"] for x in p["projects"]} == {"PA", "PB"}
    assert _ncrs(c) == set()                                  # nothing before choosing
    r = c.post("/api/auth/select-project", json={"project_id": "PX"})
    assert (r.status_code, r.json()["code"]) == (403, "NOT_PROJECT_MEMBER")
    r = c.post("/api/auth/select-project", json={"project_id": "PB"})
    assert r.status_code == 200, r.text
    assert _profile(c)["current_project_id"] == "PB"
    assert _ncrs(c) == {"ncr-b"}
    assert _ncrs(c, project_id="PA") == set()                 # a request parameter cannot reach the other project
    assert c.get("/api/ncr/ncr-a").status_code == 404
    again = c.post("/api/auth/select-project", json={"project_id": "PA"})
    assert again.status_code == 409 and "sign in again" in again.json()["detail"]
    assert again.json()["code"] == "PROJECT_ALREADY_CHOSEN"


def test_the_chosen_project_survives_a_token_refresh(env):
    c = env.login("multi")
    assert c.post("/api/auth/select-project", json={"project_id": "PB"}).status_code == 200
    assert c.post("/api/auth/refresh").status_code == 200
    assert _profile(c)["current_project_id"] == "PB" and _ncrs(c) == {"ncr-b"}


def test_taking_the_project_away_ends_access_on_the_next_request(env):
    c = env.login("solo")
    assert _ncrs(c) == {"ncr-a"}
    db = env.Session()
    try:
        uid = db.query(models.User).filter_by(username="solo").one().id
        db.query(models.UserProject).filter_by(user_id=uid).delete()
        db.add(models.UserProject(user_id=uid, project_id="PB"))
        db.commit()
    finally:
        db.close()
    assert _profile(c)["project_status"] == "relogin"
    assert _ncrs(c) == set()


def test_an_admin_sees_every_project_and_needs_no_choice(env):
    c = env.login("boss")
    p = _profile(c)
    assert p["project_status"] == "admin" and p["is_admin"] is True
    assert _ncrs(c) == {"ncr-a", "ncr-b"} and _ncrs(c, project_id="PA") == {"ncr-a"}
    r = c.post("/api/auth/select-project", json={"project_id": "PA"})
    assert (r.status_code, r.json()["code"]) == (400, "ADMIN_NO_PROJECT_SELECTION")


# ══ IAM: a project is required for every non-admin account ═════════════════════════════════════════

def _role_id(env, name):
    db = env.Session()
    try:
        return db.query(models.Role).filter_by(name=name).one().id
    finally:
        db.close()


def _new_user(**kw):
    body = {"username": "newbie", "email": "newbie@example.com", "password": "Strong-Pass-123", "company_name": "Co",
            "reason": "onboarding"}
    body.update(kw)
    return body


def test_a_non_admin_account_cannot_be_created_without_a_project(env):
    c = env.login("boss")
    r = c.post("/api/iam/users/", json=_new_user(role_id=_role_id(env, "Worker")))
    assert r.status_code == 400 and "project" in r.json()["detail"] and r.json()["code"] == "PROJECT_REQUIRED"
    r = c.post("/api/iam/users/", json=_new_user(role_id=_role_id(env, "Worker"), project_ids=["PA"]))
    assert r.status_code == 200, r.text
    db = env.Session()
    try:
        assert [p.project_id for p in db.query(models.UserProject).filter_by(user_id=r.json()["id"]).all()] == ["PA"]
        audit = db.query(models.AuditLog).filter_by(action="CREATE", entity_type="User", entity_id=str(r.json()["id"])).one()
        assert json.loads(audit.new_value)["project_ids"] == ["PA"]
    finally:
        db.close()
    assert c.post("/api/iam/users/", json=_new_user(username="x2", email="x2@example.com", role_id=_role_id(env, "Worker"),
                                                    project_ids=["NOPE"])).status_code == 400


def test_an_admin_account_needs_no_project_and_a_scope_cannot_be_emptied(env):
    c = env.login("boss")
    assert c.post("/api/iam/users/", json=_new_user(role_id=_role_id(env, "admin"))).status_code == 200
    db = env.Session()
    try:
        solo = db.query(models.User).filter_by(username="solo").one().id
    finally:
        db.close()
    r = c.put(f"/api/iam/users/{solo}/scope", json={"project_ids": [], "vendor_id": None})
    assert r.status_code == 400 and "project" in r.json()["detail"] and r.json()["code"] == "PROJECT_REQUIRED"
    assert c.put(f"/api/iam/users/{solo}/scope", json={"project_ids": ["PB"], "vendor_id": None}).status_code == 200


# ══ PQP history is scope-checked ═════════════════════════════════════════════════════════════════

def test_pqp_history_of_another_project_is_not_found(env):
    assert env.login("solo").get("/api/pqp/pqp-b/history").status_code == 404
    r = env.login("boss").get("/api/pqp/pqp-b/history")
    assert r.status_code == 200 and [h["id"] for h in r.json()] == ["h1"]


# ══ related documents stay in the root's project ═════════════════════════════════════════════════

def test_related_documents_stay_inside_the_root_project(env):
    from services.related_service import RelatedService
    db = env.Session()
    try:
        db.add_all([
            models.ITP(id="itp-shared", referenceNo="ITP-SHARED", status="Approved"),             # shared template
            models.NOI(id="noi-a", referenceNo="NOI-A", itpNo="ITP-SHARED", project_id="PA"),
            models.ITR(id="itr-a", documentNumber="ITR-A", noiNumber="NOI-A", project_id="PA"),
            models.ITR(id="itr-b", documentNumber="ITR-B", noiNumber="NOI-A", project_id="PB"),  # mis-linked across projects
        ])
        db.commit()
        related = RelatedService(db).get_related("noi", "noi-a", scope=None)               # an admin
        ids = {x["id"] for x in related["upstream"] + related["downstream"]}
        assert "itp-shared" in ids and "itr-a" in ids and "itr-b" not in ids
    finally:
        db.close()


# ══ legacy records without a project go to the only project, once ═══════════════════════════════

def test_records_without_a_project_go_to_the_only_project_once(env):
    import db_migrations
    db_migrations._create_migration_flags_table()
    db = env.Session()
    try:
        db.query(models.Project).filter_by(id="PB").delete()
        db.query(models.UserProject).filter_by(project_id="PB").delete()
        db.add_all([models.NCR(id="ncr-legacy", documentNumber="NCR-L", status="Open", **_NCR),
                    models.ITP(id="itp-legacy", referenceNo="ITP-L", status="Approved"),
                    models.Checklist(id="chk-template", recordsNo="CHK-T", status="Ongoing"),            # bare template
                    models.Checklist(id="chk-instance", recordsNo="CHK-I", status="Ongoing", itrId="itr-x")])
        db.commit()
    finally:
        db.close()
    db_migrations._assign_projectless_records_to_the_only_project()
    db = env.Session()
    try:
        assert db.get(models.NCR, "ncr-legacy").project_id == "PA"
        assert db.get(models.NCR, "ncr-legacy").documentNumber == "NCR-L"                 # number untouched
        assert db.get(models.ITP, "itp-legacy").project_id is None                         # a shared template stays shared
        assert db.get(models.Checklist, "chk-template").project_id is None                 # so does a bare Checklist template (D9)
        assert db.get(models.Checklist, "chk-instance").project_id == "PA"
        row = db.query(models.AuditLog).filter_by(action="ASSIGN_PROJECT", entity_type="ncr").one()
        assert "ncr-legacy" in json.loads(row.old_value)["ids"]
        db.add(models.NCR(id="ncr-late", documentNumber="NCR-LATE", status="Open", **_NCR))
        db.commit()
    finally:
        db.close()
    db_migrations._assign_projectless_records_to_the_only_project()                         # flag: never again
    db = env.Session()
    try:
        assert db.get(models.NCR, "ncr-late").project_id is None
    finally:
        db.close()


def test_with_several_projects_nothing_is_guessed(env):
    import db_migrations
    db_migrations._create_migration_flags_table()
    db = env.Session()
    try:
        db.add(models.NCR(id="ncr-legacy", documentNumber="NCR-L", status="Open", **_NCR))
        db.commit()
    finally:
        db.close()
    db_migrations._assign_projectless_records_to_the_only_project()
    db = env.Session()
    try:
        assert db.get(models.NCR, "ncr-legacy").project_id is None
        assert db.execute(text("SELECT 1 FROM migration_flags WHERE flag_name = :f"),
                          {"f": db_migrations.PROJECTLESS_RECORDS_FLAG}).first() is None
    finally:
        db.close()


# ══ product fixes found while adapting the suite ════════════════════════════════════════════════════

def test_two_sign_ins_in_the_same_second_get_distinct_tokens_and_revoking_one_keeps_the_other(env):
    """Tokens carry a unique jti: before, two sign-ins within one second got byte-identical tokens, so choosing a
    project (which revokes the presented token) or signing out in one session killed the other."""
    first, second = TestClient(env.app), TestClient(env.app)
    for c in (first, second):
        assert c.post("/api/auth/login", data={"username": "multi", "password": PW}).status_code == 200
    assert first.cookies.get("access_token") != second.cookies.get("access_token")
    assert first.cookies.get("refresh_token") != second.cookies.get("refresh_token")
    assert first.post("/api/auth/select-project", json={"project_id": "PA"}).status_code == 200
    assert second.post("/api/auth/select-project", json={"project_id": "PB"}).status_code == 200    # not revoked by the first
    assert _ncrs(first) == {"ncr-a"} and _ncrs(second) == {"ncr-b"}
    assert first.post("/api/auth/refresh").status_code == 200 and _ncrs(first) == {"ncr-a"}       # refresh keeps project + works


def test_a_token_issued_before_jti_existed_is_still_accepted(env):
    from datetime import datetime, timedelta, timezone
    from jose import jwt
    from core.config import settings
    now = datetime.now(timezone.utc)
    legacy = jwt.encode({"sub": "solo", "user_id": 0, "exp": now + timedelta(minutes=5), "iat": now, "type": "access"},
                        settings.SECRET_KEY, algorithm=settings.ALGORITHM)                           # no jti, no project
    c = TestClient(env.app)
    r = c.get("/api/user/profile", headers={"Authorization": f"Bearer {legacy}"})
    assert r.status_code == 200 and r.json()["current_project_id"] == "PA"                         # one project: works in it


def _km_image(root):
    name = "km/km_" + "ab" * 16 + ".png"
    (root / "km").mkdir(parents=True, exist_ok=True)
    (root / name).write_bytes(b"\x89PNG\r\n\x1a\nxx")
    return name


def test_a_project_member_with_km_view_sees_km_article_images(env, tmp_path, monkeypatch):
    """KM is shared by every project (D9). Its article images have no attachment row; they used to be refused to any
    project-scoped account — after batch 1 that would be every non-admin. km:view:all is still required."""
    from core.startup_guard import ENV_UPLOAD_ROOT
    monkeypatch.setenv(ENV_UPLOAD_ROOT, str(tmp_path))
    name = _km_image(tmp_path)
    (tmp_path / "stray").mkdir()
    (tmp_path / "stray" / "s.txt").write_bytes(b"stray")
    db = env.Session()
    try:
        u = models.User(username="nokm", email="nokm@example.com", is_active=True, company_name="Co",
                        hashed_password=get_password_hash(PW), role_id=db.query(models.Role).filter_by(name="NoKM").one().id)
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="PA"))
        db.commit()
    finally:
        db.close()
    assert env.login("solo").get(f"/api/files/download/{name}").status_code == 200
    assert env.login("nokm").get(f"/api/files/download/{name}").status_code == 403                 # still needs km:view
    assert env.login("solo").get("/api/files/download/stray/s.txt").status_code == 404             # other row-less files: no


def test_choosing_a_project_ends_the_project_less_session(env):
    """The token pair presented to POST /auth/select-project is revoked: neither can be used again (R1 P3-4)."""
    c = TestClient(env.app)
    assert c.post("/api/auth/login", data={"username": "multi", "password": PW}).status_code == 200
    old_access, old_refresh = c.cookies.get("access_token"), c.cookies.get("refresh_token")
    assert c.post("/api/auth/select-project", json={"project_id": "PA"}).status_code == 200
    stale = TestClient(env.app)
    assert stale.get("/api/user/profile", headers={"Authorization": f"Bearer {old_access}"}).status_code == 401
    stale.cookies.set("refresh_token", old_refresh)
    assert stale.post("/api/auth/refresh").status_code == 401


def test_a_role_merely_named_administrator_is_an_ordinary_scoped_role(env):
    """Only the role named "admin" (any case) is the system administrator — the same rule IAM uses. A non-admin role
    manager can create a role called "Administrator"; its holders must stay in their project (R1 P1-1)."""
    db = env.Session()
    try:
        r = models.Role(name="Administrator")
        r.permissions_rel = [_get_or_create_perm(db, c) for c in (perms.NCR_VIEW,)]
        db.add(r)
        db.flush()
        u = models.User(username="shadow", email="shadow@example.com", is_active=True, company_name="Co",
                        hashed_password=get_password_hash(PW), role_id=r.id)
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="PA"))
        db.commit()
    finally:
        db.close()
    c = env.login("shadow")
    p = _profile(c)
    assert p["is_admin"] is False and p["project_status"] == "working" and p["current_project_id"] == "PA"
    assert _ncrs(c) == {"ncr-a"}
