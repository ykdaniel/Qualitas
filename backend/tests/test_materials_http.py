"""MATERIAL-SUBMITTAL M1 — material data API, project reply days, scope and permissions (spec §9.4).

Since 2026-10-09 the material data API is READ ONLY (DECISIONS 材料主檔 API 只留查詢, option A): POST / PUT were removed, so
the create / update tests became "the write routes are gone and write nothing"; materials are seeded directly in the
database here (in the application only the approved-material register writes them).

Real login + routes against a throwaway file database under tmp_path. No `main` import, no seeding, no scheduler,
no uploads, no development database.
"""
import importlib
import secrets
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core.security import get_password_hash
from database import Base, get_db

MAT = ["material:view:all", "material:manage:all"]
PROJECT_ADMIN = ["contractors:view:all", "contractors:manage:all"]


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'materials.db'}", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, "SessionLocal", S)
    password = secrets.token_urlsafe(24)
    perms = {}

    def perm(code):
        if code not in perms:
            perms[code] = models.Permission(code=code, description=code)
        return perms[code]

    with S() as db:
        db.add_all([models.Project(id="P1", name="Project One"), models.Project(id="P2", name="Project Two"),
                    models.Contractor(id="V1", name="Vendor One", abbreviation="V1")])
        users = {
            "admin": (MAT + PROJECT_ADMIN, None, []),
            "scoped": (MAT, None, ["P1"]),
            "viewer": (["material:view:all"], None, []),
            "nobody": (["itp:view:all"], None, []),
            "vendor": (MAT, "V1", ["P1"]),           # material permissions granted BY MISTAKE to a contractor account
        }
        for name, (codes, vendor_id, projects) in users.items():
            role = models.Role(name=f"role-{name}")
            role.permissions_rel = [perm(c) for c in codes]
            db.add(role)
            db.flush()
            user = models.User(username=f"m-{name}", email=f"{name}@example.test", is_active=True, role_id=role.id,
                               vendor_id=vendor_id, hashed_password=get_password_hash(password))
            db.add(user)
            db.flush()
            for pid in projects:
                db.add(models.UserProject(user_id=user.id, project_id=pid))
        db.commit()

    app = FastAPI()
    for name in ["auth", "materials", "projects"]:
        app.include_router(importlib.import_module("routers." + name).router, prefix="/api")

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session

    clients = {}
    for name in users:
        c = TestClient(app, raise_server_exceptions=False)
        r = c.post("/api/auth/login", data={"username": f"m-{name}", "password": password})
        assert r.status_code == 200, r.text
        clients[name] = c
    yield SimpleNamespace(c=clients, Session=S)
    for c in clients.values():
        c.close()
    engine.dispose()


def snapshot(env):
    with env.Session() as db:
        return {m.__tablename__: sorted(tuple(str(getattr(r, col.name)) for col in m.__table__.columns) for r in db.query(m).all())
                for m in (models.Material, models.AuditLog, models.Project)}


def create(env, project="P1", name="Fire stop sealant", **fields):
    """Seed one material row directly (the API no longer creates materials); returns its id."""
    import uuid
    mid = str(uuid.uuid4())
    with env.Session() as db:
        db.add(models.Material(id=mid, project_id=project, name=name, created_by="seed", created_at="2026-10-01", **fields))
        db.commit()
    return mid


# ── 2026-10-09: read only — the write routes are gone ─────────────────────────────────────────────────────────
def test_material_api_is_read_only(env):
    import routers.materials as r
    assert {(m, route.path) for route in r.router.routes for m in route.methods} == {("GET", "/materials/"), ("GET", "/materials/{material_id}")}
    mid = create(env)
    before = snapshot(env)
    for who in ("admin", "scoped", "viewer", "vendor", "nobody"):
        c = env.c[who]
        assert c.post("/api/materials/", json={"projectId": "P1", "name": "x"}).status_code == 405, who
        assert c.put(f"/api/materials/{mid}", json={"name": "hijack"}).status_code == 405, who
        assert c.patch(f"/api/materials/{mid}", json={"name": "hijack"}).status_code == 405, who
    assert snapshot(env) == before                                            # nothing written, no audit row


def test_get_returns_camelcase(env):
    mid = create(env, brand="A brand", model="FS-200", category="Fire")
    body = env.c["admin"].get(f"/api/materials/{mid}").json()
    assert body["id"] == mid and body["projectId"] == "P1" and body["name"] == "Fire stop sealant" and body["brand"] == "A brand"
    assert "project_id" not in body and body["createdBy"] == "seed"


# ── AC-M1-2 / AC-R3-8 ─────────────────────────────────────────────────────────────────────────────────────────
def test_scoped_user_sees_only_own_project(env):
    a = create(env)
    b = create(env, project="P2", name="Other project material")
    s = env.c["scoped"]
    assert s.get(f"/api/materials/{b}").status_code == 404
    assert s.get("/api/materials/", params={"projectId": "P2"}).status_code == 404
    page = s.get("/api/materials/", params={"projectId": "P1"}).json()
    assert [m["id"] for m in page["items"]] == [a] and page["total"] == 1
    with env.Session() as db:
        assert db.get(models.Material, b).name == "Other project material"


def test_list_requires_project_and_reports_full_total(env):
    for i in range(5):
        create(env, name=f"M{i}")
    create(env, project="P2", name="elsewhere")
    assert env.c["admin"].get("/api/materials/").status_code == 422
    assert env.c["admin"].get("/api/materials/", params={"projectId": "NOPE"}).status_code == 404
    page = env.c["admin"].get("/api/materials/", params={"projectId": "P1", "limit": 2, "offset": 0}).json()
    assert page["total"] == 5 and len(page["items"]) == 2 and page["limit"] == 2 and page["offset"] == 0
    rest = env.c["admin"].get("/api/materials/", params={"projectId": "P1", "limit": 2, "offset": 4}).json()
    assert rest["total"] == 5 and len(rest["items"]) == 1
    assert env.c["admin"].get("/api/materials/", params={"projectId": "P1", "limit": 501}).status_code == 422


def test_list_search_and_category_stay_inside_project(env):
    create(env, name="Steel pipe", category="Pipe")
    create(env, name="Copper pipe", category="Pipe")
    create(env, project="P2", name="Steel pipe P2", category="Pipe")
    page = env.c["admin"].get("/api/materials/", params={"projectId": "P1", "q": "steel"}).json()
    assert [m["name"] for m in page["items"]] == ["Steel pipe"]
    page = env.c["admin"].get("/api/materials/", params={"projectId": "P1", "category": "Pipe"}).json()
    assert page["total"] == 2


# ── AC-M1-5 permissions and vendor scope ───────────────────────────────────────────────────────────────────
def test_permissions(env):
    mid = create(env)
    assert env.c["nobody"].get("/api/materials/", params={"projectId": "P1"}).status_code == 403
    assert env.c["nobody"].get(f"/api/materials/{mid}").status_code == 403
    v = env.c["viewer"]
    assert v.get("/api/materials/", params={"projectId": "P1"}).status_code == 200
    assert v.get(f"/api/materials/{mid}").status_code == 200


def test_vendor_scoped_account_is_refused_even_with_material_permissions(env):
    mid = create(env)
    v = env.c["vendor"]
    assert v.get("/api/materials/", params={"projectId": "P1"}).status_code == 403
    assert v.get(f"/api/materials/{mid}").status_code == 403


def test_there_is_no_delete_route(env):
    mid = create(env)
    assert env.c["admin"].delete(f"/api/materials/{mid}").status_code == 405
    with env.Session() as db:
        assert db.get(models.Material, mid) is not None


# ── AC-R3-6 / AC-M1-4 project reply days ───────────────────────────────────────────────────────────────────
@pytest.mark.parametrize("value", [None, 0, 14])
def test_project_reply_days_accepts_null_and_non_negative_integers(env, value):
    r = env.c["admin"].put("/api/projects/P1", json={"materialReplyDays": value})
    assert r.status_code == 200, r.text
    assert r.json()["materialReplyDays"] == value
    with env.Session() as db:
        assert db.get(models.Project, "P1").material_reply_days == value


@pytest.mark.parametrize("value", [-1, 1.5, "14", True])
def test_project_reply_days_rejects_invalid(env, value):
    before = snapshot(env)
    r = env.c["admin"].put("/api/projects/P1", json={"materialReplyDays": value})
    assert r.status_code == 422, r.text
    assert snapshot(env) == before


def test_project_reply_days_has_no_default_and_can_be_cleared(env):
    assert env.c["admin"].get("/api/projects/P1").json()["materialReplyDays"] is None
    assert env.c["admin"].post("/api/projects/", json={"name": "New"}).json()["materialReplyDays"] is None
    env.c["admin"].put("/api/projects/P1", json={"materialReplyDays": 10})
    r = env.c["admin"].put("/api/projects/P1", json={"materialReplyDays": None})
    assert r.json()["materialReplyDays"] is None
    r = env.c["admin"].put("/api/projects/P1", json={"owner": "Someone"})          # unrelated update keeps the value
    assert r.json()["materialReplyDays"] is None


# ── AC-M1-7 project deletion guard ─────────────────────────────────────────────────────────────────────────
def test_project_with_materials_cannot_be_deleted(env):
    create(env, project="P2")
    from repositories.project_repository import ProjectRepository
    from services.project_service import ProjectService
    with env.Session() as db:
        with pytest.raises(ValueError, match="Material"):
            ProjectService(ProjectRepository(db)).delete_project("P2")
    with env.Session() as db:
        assert db.get(models.Project, "P2") is not None
