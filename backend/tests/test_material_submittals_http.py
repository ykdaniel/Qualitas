"""MATERIAL-SUBMITTAL M6 — the approved-material register (DECISIONS 材料：只作為核准材料登錄簿).

The former submittal workflow (create draft, edit draft, submit, record / correct result, new revision, list submittals) was
removed with its routes on 2026-10-09; its tests went with it (kept in the M6 backup, not run). What is tested here:
register, edit, approved list, one-record detail, the route surface, photos, audit rollback and the append-only result history.
Real login + routes against a throwaway file database under tmp_path; uploads go to the suite's throw-away upload root
(conftest). No `main` import, no seeding, no scheduler, no development database.
"""
import importlib
import secrets
import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core.security import get_password_hash
from database import Base, get_db

VIEW, MANAGE = "material:view:all", "material:manage:all"
USERS = {
    "admin": ([VIEW, MANAGE, "contractors:view:all", "contractors:manage:all"], None, []),
    "manager": ([VIEW, MANAGE], None, []),
    "viewer": ([VIEW], None, []),
    "scoped": ([VIEW, MANAGE], None, ["P1"]),
    "vendor": ([VIEW, MANAGE], "V1", ["P1"]),
    "nobody": (["itp:view:all"], None, []),
    "legacy": (["material:record_result:all"], None, []),     # R2: the retired code grants nothing
}
PDF = b"%PDF-1.4\n% material test file\n"
def _png():
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (24, 16), (40, 120, 200)).save(buf, format="PNG")
    return buf.getvalue()


PNG = ("photo.png", _png(), "image/png")                       # R2: a real, decodable image
VENDOR_REFUSAL = "Material submittal is not available to contractor-scoped accounts."
TABLES = (models.Material, models.MaterialSubmittal, models.MaterialSubmittalRevision, models.MaterialSubmittalResultEntry,
          models.AuditLog, models.Attachment, models.ReferenceSequence, models.Project)


def _engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path / 'msa.db'}", connect_args={"check_same_thread": False, "timeout": 30})


@pytest.fixture
def env(tmp_path, monkeypatch):
    engine = _engine(tmp_path)
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    import core.security as security
    monkeypatch.setattr(security, "SessionLocal", S)
    password = secrets.token_urlsafe(24)
    perms = {}
    with S() as db:
        db.add_all([models.Project(id="P1", name="Project One"), models.Project(id="P2", name="Project Two"),
                    models.Contractor(id="V1", name="Vendor One", abbreviation="V1"),
                    models.Contractor(id="V2", name="Vendor Two", abbreviation="V2")])
        for name, (codes, vendor_id, projects) in USERS.items():
            role = models.Role(name=f"r-{name}")
            role.permissions_rel = [perms.setdefault(c, models.Permission(code=c, description=c)) for c in codes]
            db.add(role)
            db.flush()
            u = models.User(username=f"s-{name}", email=f"{name}@example.test", is_active=True, role_id=role.id,
                            vendor_id=vendor_id, hashed_password=get_password_hash(password))
            db.add(u)
            db.flush()
            for pid in projects:
                db.add(models.UserProject(user_id=u.id, project_id=pid))
        db.commit()
    app = FastAPI()
    for name in ["auth", "materials", "material_submittals", "file_router", "projects"]:
        app.include_router(importlib.import_module("routers." + name).router, prefix="/api")

    def session():
        with S() as db:
            yield db
    app.dependency_overrides[get_db] = session

    def login(name):
        c = TestClient(app, raise_server_exceptions=False)
        r = c.post("/api/auth/login", data={"username": f"s-{name}", "password": password})
        assert r.status_code == 200, r.text
        return c
    clients = {n: login(n) for n in USERS}
    yield SimpleNamespace(c=clients, Session=S, app=app, login=login)
    for c in clients.values():
        c.close()
    engine.dispose()


# ── helpers ─────────────────────────────────────────────────────────────────────────────────────────────────
def snapshot(env):
    with env.Session() as db:
        return {m.__tablename__: sorted(tuple(str(getattr(r, c.name)) for c in m.__table__.columns) for r in db.query(m).all())
                for m in TABLES}


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def rev(detail, n=None):
    revs = detail["revisions"]
    return revs[-1] if n is None else next(r for r in revs if r["revNo"] == n)


REG = {"projectId": "P1", "vendorId": "V1", "name": "Fire stop sealant", "brand": "A", "model": "FS-200", "category": "Fire",
       "resultCode": "Approved", "approvedDate": "2026-10-01", "decisionMaker": "Consultant A", "externalDocNo": "EXT-001",
       "specReference": "Spec 07 84 00"}


def register(env, who="admin", **kw):
    return env.c[who].post("/api/material-submittals/register", json={**REG, **kw})


def edit(env, sid, who="admin", **kw):
    return env.c[who].put(f"/api/material-submittals/{sid}/register", json=kw)


def approved(env, who="admin", **params):
    return env.c[who].get("/api/material-submittals/approved", params={"projectId": "P1", **params})


def upload(env, who, rid, category="catalogue", file=("doc.pdf", PDF, "application/pdf")):
    return env.c[who].post("/api/files/upload", data={"entity_type": "material_rev", "entity_id": rid, "category": category},
                           files={"files": file})


def legacy_row(env, statuses, name="Legacy", project="P1"):
    """A submittal written directly (as the removed workflow could have left it): revisions with the given statuses, Rev 0 first.
    Returns (submittal id, [revision ids]). Revisions with a result get one current result entry."""
    sid, rids = str(uuid.uuid4()), []
    with env.Session() as db:
        mat = models.Material(id=str(uuid.uuid4()), project_id=project, name=name, created_at="2026-10-01")
        db.add(mat)
        approved_rev = max((i for i, s in enumerate(statuses) if s in ("Approved", "ApprovedWithComments")), default=None)
        db.add(models.MaterialSubmittal(id=sid, project_id=project, vendor_id="V1", material_id=mat.id,
                                        document_number=f"LEGACY-{sid[:8]}", latest_rev_no=len(statuses) - 1,
                                        latest_status=statuses[-1], current_approved_rev_no=approved_rev,
                                        current_approved_result=statuses[approved_rev] if approved_rev is not None else None,
                                        created_at="2026-10-01", updated_at="2026-10-01"))
        db.flush()
        for n, status in enumerate(statuses):
            rid = str(uuid.uuid4())
            rids.append(rid)
            db.add(models.MaterialSubmittalRevision(id=rid, submittal_id=sid, project_id=project, vendor_id="V1", rev_no=n,
                                                    status=status, snap_name=f"{name} rev{n}", created_at="2026-10-01"))
            db.flush()
            if status in ("Approved", "ApprovedWithComments", "Rejected", "ReviseAndResubmit"):
                db.add(models.MaterialSubmittalResultEntry(
                    revision_id=rid, submittal_id=sid, project_id=project, vendor_id="V1", seq=1, entry_type="initial",
                    result_code=status, external_decision_maker="X", external_reply_date="2026-10-02",
                    logged_by_user_id="1", logged_by_name="seed", logged_at="2026-10-02"))
        db.commit()
    return sid, rids


# ── route surface: only the register is left ───────────────────────────────────────────────────────────────
def test_api_surface_is_the_register_only(env):
    routes = {(m, r.path) for r in env.app.routes if getattr(r, "path", "").startswith("/api/material") for m in r.methods}
    assert routes == {
        ("GET", "/api/materials/"), ("GET", "/api/materials/{material_id}"),          # material data: read only (2026-10-09)
        ("GET", "/api/material-submittals/approved"),
        ("GET", "/api/material-submittals/duplicates"), ("GET", "/api/material-submittals/stats"),      # R2, read-only
        ("GET", "/api/material-submittals/{submittal_id}"),
        ("POST", "/api/material-submittals/register"),
        ("PUT", "/api/material-submittals/{submittal_id}/register"),
    }
    assert not any(m == "DELETE" for m, p in routes)
    # no internal approval ACTION: the only path that mentions "approv" is the read-only GET list
    assert {(m, p) for m, p in routes if "approv" in p.lower()} == {("GET", "/api/material-submittals/approved")}
    sid = ok(register(env))["submittalId"]
    before = snapshot(env)
    for method, path in (("POST", "/api/material-submittals/"), ("GET", "/api/material-submittals/?projectId=P1"),
                         ("POST", f"/api/material-submittals/{sid}/revisions"),
                         ("POST", f"/api/material-submittals/{sid}/revisions/x/submit"),
                         ("POST", f"/api/material-submittals/{sid}/revisions/x/result"),
                         ("POST", f"/api/material-submittals/{sid}/revisions/x/result-corrections"),
                         ("PUT", f"/api/material-submittals/{sid}/revisions/x")):
        assert env.c["admin"].request(method, path, json={}).status_code in (404, 405), (method, path)   # gone
    assert snapshot(env) == before


# ── register ────────────────────────────────────────────────────────────────────────────────────────────────
def test_register_creates_an_approved_record_in_one_step(env):
    item = ok(register(env))
    assert item["documentNumber"] == "QTS-V1-MSA-000001"
    assert (item["revNo"], item["result"], item["approvedDate"], item["decisionMaker"], item["externalDocNo"]) == (
        0, "Approved", "2026-10-01", "Consultant A", "EXT-001")
    assert (item["name"], item["brand"], item["model"], item["category"], item["specReference"], item["vendorName"]) == (
        "Fire stop sealant", "A", "FS-200", "Fire", "Spec 07 84 00", "Vendor One")
    assert [i["submittalId"] for i in ok(approved(env))["items"]] == [item["submittalId"]]
    d = ok(env.c["admin"].get(f"/api/material-submittals/{item['submittalId']}"))
    assert (d["latestStatus"], d["currentApprovedRevNo"], d["currentApprovedResult"]) == ("Approved", 0, "Approved")
    r0 = rev(d, 0)
    assert r0["status"] == "Approved" and [e["entryType"] for e in r0["resultEntries"]] == ["initial"]
    with env.Session() as db:
        m = db.get(models.Material, d["materialId"])
        assert (m.project_id, m.name, m.model) == ("P1", "Fire stop sealant", "FS-200")
        assert db.query(models.AuditLog).filter_by(entity_type="MaterialSubmittal", entity_id=item["submittalId"], action="REGISTER").count() == 1


def test_register_requires_name_contractor_date_and_an_approval_result(env):
    before = snapshot(env)
    for bad in ({"name": "  "}, {"name": None}, {"vendorId": ""}, {"approvedDate": None}, {"approvedDate": "2026-13-40"},
                {"resultCode": "Rejected"}, {"resultCode": "ReviseAndResubmit"}, {"resultCode": None}, {"unknownField": 1}):
        r = register(env, **bad)
        assert r.status_code == 422, (bad, r.text)
    assert snapshot(env) == before
    minimal = {k: REG[k] for k in ("projectId", "vendorId", "name", "resultCode", "approvedDate")}
    item = ok(env.c["admin"].post("/api/material-submittals/register", json=minimal))    # optional fields really are optional
    assert (item["decisionMaker"], item["externalDocNo"], item["brand"]) == (None, None, None)


def test_register_permission_scope_and_vendor(env):
    before = snapshot(env)
    assert register(env, "viewer").status_code == 403            # view only
    assert register(env, "nobody").status_code == 403
    r = register(env, "vendor")
    assert r.status_code == 403 and r.json()["detail"] == VENDOR_REFUSAL
    assert register(env, "scoped", projectId="P2").status_code == 404
    assert register(env, projectId="NOPE").status_code == 404
    assert register(env, vendorId="NOPE").status_code == 404
    assert snapshot(env) == before
    assert ok(register(env, "manager"))["result"] == "Approved"


def test_register_and_edit_roll_back_completely_when_the_audit_write_fails(env, monkeypatch):
    sid = ok(register(env))["submittalId"]
    before = snapshot(env)
    import services.material_submittal_service as svc

    def boom(*a, **k):
        raise RuntimeError("injected audit failure")
    monkeypatch.setattr(svc, "log_audit", boom)
    assert register(env, name="Another").status_code == 500
    assert edit(env, sid, model="X", resultCode="ApprovedWithComments").status_code == 500
    assert snapshot(env) == before                                                        # no half record, no half edit


# ── edit ────────────────────────────────────────────────────────────────────────────────────────────────────
def test_edit_changes_material_fields_in_place_and_keeps_an_audit_record(env):
    sid = ok(register(env))["submittalId"]
    out = ok(edit(env, sid, model="FS-300", supplier="Supplier X", specReference="Spec 07 84 13"))
    assert (out["model"], out["supplier"], out["specReference"], out["revNo"]) == ("FS-300", "Supplier X", "Spec 07 84 13", 0)
    d = ok(env.c["admin"].get(f"/api/material-submittals/{sid}"))
    with env.Session() as db:
        assert db.get(models.Material, d["materialId"]).model == "FS-300"                 # the material master follows
        logs = db.query(models.AuditLog).filter_by(entity_type="MaterialSubmittal", entity_id=sid, action="UPDATE").all()
        assert len(logs) == 1 and "FS-200" in (logs[0].old_value or "") and "FS-300" in (logs[0].new_value or "")
    assert len(rev(d, 0)["resultEntries"]) == 1                                           # result untouched: no extra entry
    before = snapshot(env)
    ok(edit(env, sid, model="FS-300"))                                                     # same value: nothing written
    assert snapshot(env) == before


def test_edit_of_result_fields_appends_a_correction_and_keeps_the_original(env):
    sid = ok(register(env))["submittalId"]
    out = ok(edit(env, sid, resultCode="ApprovedWithComments", approvedDate="2026-10-05", decisionMaker="Consultant B"))
    assert (out["result"], out["approvedDate"], out["decisionMaker"], out["externalDocNo"]) == (
        "ApprovedWithComments", "2026-10-05", "Consultant B", "EXT-001")
    entries = rev(ok(env.c["admin"].get(f"/api/material-submittals/{sid}")), 0)["resultEntries"]
    assert [(e["entryType"], e["resultCode"], e["isCurrent"]) for e in entries] == [
        ("initial", "Approved", False), ("correction", "ApprovedWithComments", True)]
    assert entries[0]["externalReplyDate"] == "2026-10-01" and entries[1]["supersedesEntryId"] == entries[0]["id"]
    assert ok(approved(env))["items"][0]["result"] == "ApprovedWithComments"


def test_edit_validation_and_permissions(env):
    sid = ok(register(env))["submittalId"]
    before = snapshot(env)
    for bad in ({"name": ""}, {"name": None}, {"resultCode": None}, {"resultCode": "Rejected"}, {"approvedDate": None},
                {"projectId": "P2"}, {"vendorId": "V2"}):
        assert edit(env, sid, **bad).status_code == 422, bad
    assert edit(env, sid, "viewer", model="X").status_code == 403
    assert edit(env, sid, "vendor", model="X").status_code == 403
    assert edit(env, "no-such-id", model="X").status_code == 404
    assert snapshot(env) == before                                                         # every refusal above wrote nothing
    assert edit(env, sid, "scoped", model="X").status_code == 200                         # P1 is in this account's scope
    legacy, _ = legacy_row(env, ["Draft"])                                                 # not a register record
    before = snapshot(env)
    assert edit(env, legacy, model="X").status_code == 409
    assert snapshot(env) == before


def test_result_entries_are_append_only_in_the_orm(env):
    rid = ok(register(env))["revisionId"]
    with env.Session() as db:
        e = db.query(models.MaterialSubmittalResultEntry).filter_by(revision_id=rid).one()
        e.result_code = "Rejected"
        with pytest.raises(models.AppendOnlyViolation):
            db.commit()
        db.rollback()
        e = db.query(models.MaterialSubmittalResultEntry).filter_by(revision_id=rid).one()
        db.delete(e)
        with pytest.raises(models.AppendOnlyViolation):
            db.commit()


# ── one record (detail) ─────────────────────────────────────────────────────────────────────────────────────
def test_detail_permission_scope_and_vendor(env):
    sid = ok(register(env))["submittalId"]
    p2 = ok(register(env, projectId="P2", name="Other project"))["submittalId"]
    assert ok(env.c["viewer"].get(f"/api/material-submittals/{sid}"))["documentNumber"] == "QTS-V1-MSA-000001"
    assert env.c["nobody"].get(f"/api/material-submittals/{sid}").status_code == 403
    r = env.c["vendor"].get(f"/api/material-submittals/{sid}")
    assert r.status_code == 403 and r.json()["detail"] == VENDOR_REFUSAL
    assert env.c["scoped"].get(f"/api/material-submittals/{p2}").status_code == 404      # P2 is outside this account's scope
    assert env.c["admin"].get("/api/material-submittals/no-such-id").status_code == 404


# ── approved list ───────────────────────────────────────────────────────────────────────────────────────────
def test_approved_lists_only_records_with_a_current_approved_revision(env):
    a = ok(register(env, name="Sealant A"))
    w = ok(register(env, name="Pipe B", resultCode="ApprovedWithComments"))
    for statuses in (["Draft"], ["Submitted"], ["Rejected"], ["ReviseAndResubmit"]):         # data the old workflow could leave
        legacy_row(env, statuses)
    page = ok(approved(env))
    assert page["total"] == 2 and {i["submittalId"] for i in page["items"]} == {a["submittalId"], w["submittalId"]}


def test_approved_shows_the_approved_revision_not_a_newer_one(env):
    sid, rids = legacy_row(env, ["Approved", "Submitted"], name="Old")                     # Rev 0 approved, Rev 1 under review
    item = next(i for i in ok(approved(env))["items"] if i["submittalId"] == sid)
    assert (item["revNo"], item["revisionId"], item["name"]) == (0, rids[0], "Old rev0")


def test_approved_filters_and_paginates(env):
    for n, cat in (("Alpha", "Fire"), ("Beta", "Pipe"), ("Gamma", "Fire")):
        ok(register(env, name=n, category=cat))
    assert ok(approved(env, category="Fire"))["total"] == 2
    assert [i["name"] for i in ok(approved(env, q="bet"))["items"]] == ["Beta"]
    page = ok(approved(env, limit=2))
    assert page["total"] == 3 and len(page["items"]) == 2
    assert len(ok(approved(env, limit=2, offset=2))["items"]) == 1


def test_approved_filters_by_result_for_the_list_chips(env):
    ok(register(env, name="A1"))
    ok(register(env, name="W1", resultCode="ApprovedWithComments"))
    ok(register(env, name="A2"))
    assert ok(approved(env))["total"] == 3
    assert [i["name"] for i in ok(approved(env, result="Approved"))["items"]] == ["A1", "A2"]
    assert [i["name"] for i in ok(approved(env, result="ApprovedWithComments"))["items"]] == ["W1"]
    assert approved(env, result="Rejected").status_code == 422          # only the two approval results exist in the register


def test_approved_permission_scope_and_vendor_refusal(env):
    ok(register(env))
    assert ok(approved(env, "viewer"))["total"] == 1                         # view permission is enough
    assert approved(env, "nobody").status_code == 403
    r = approved(env, "vendor")
    assert r.status_code == 403 and r.json()["detail"] == VENDOR_REFUSAL
    assert ok(approved(env, "scoped"))["total"] == 1                          # P1 is in this account's projects
    assert env.c["scoped"].get("/api/material-submittals/approved", params={"projectId": "P2"}).status_code == 404
    assert env.c["admin"].get("/api/material-submittals/approved", params={"projectId": "NOPE"}).status_code == 404
    assert env.c["admin"].get("/api/material-submittals/approved").status_code == 422      # projectId is required
    assert ok(env.c["admin"].get("/api/material-submittals/approved", params={"projectId": "P2"}))["total"] == 0


# ── photos and other files of a registered record ───────────────────────────────────────────────────────────
def test_register_photos_stay_editable_other_evidence_still_locked(env):
    item = ok(register(env))
    r = upload(env, "admin", item["revisionId"], "photo", PNG)
    assert r.status_code == 200, r.text
    assert env.c["admin"].delete(f"/api/files/{r.json()[0]['id']}").status_code == 200
    assert upload(env, "admin", item["revisionId"], "catalogue").status_code == 409      # approved evidence stays locked
    assert upload(env, "viewer", item["revisionId"], "photo", PNG).status_code == 403
    assert upload(env, "vendor", item["revisionId"], "photo", PNG).status_code == 403


def test_unknown_category_is_refused(env):
    item = ok(register(env))
    assert upload(env, "admin", item["revisionId"], "attachment", PNG).status_code == 400


def test_approved_counts_records_registered_from_a_day_for_the_dashboard(env):
    old = ok(register(env, name="Old one"))["submittalId"]
    ok(register(env, name="New one"))
    with env.Session() as db:                                     # pretend the first one was registered last month
        db.query(models.MaterialSubmittal).filter_by(id=old).update({"created_at": "2026-09-15T10:00:00+00:00"})
        db.commit()
    assert ok(approved(env))["total"] == 2
    page = ok(approved(env, registeredFrom="2026-10-01", limit=1))
    assert page["total"] == 1                                     # the dashboard reads only the total
    assert approved(env, registeredFrom="not-a-date").status_code == 422



# ── R2 (review R1): a repeated register request never registers the material twice ───────────────────────────────
def count_records(env, project="P1"):
    with env.Session() as db:
        return (db.query(models.MaterialSubmittal).filter_by(project_id=project).count(),
                db.query(models.Material).filter_by(project_id=project).count(),
                db.query(models.AuditLog).filter_by(entity_type="MaterialSubmittal", action="REGISTER").count())


def test_register_with_the_same_request_id_returns_the_first_record(env):
    rid = str(uuid.uuid4())
    first = ok(register(env, clientRequestId=rid))
    before = snapshot(env)
    again = ok(register(env, clientRequestId=rid, name="Changed meanwhile"))       # retry after a lost answer
    assert again == first                                                            # the record as created, not a new one
    assert snapshot(env) == before and count_records(env) == (1, 1, 1)
    # the form then sends what changed as an edit of THAT record
    item = ok(edit(env, first["submittalId"], name="Changed meanwhile"))
    assert (item["submittalId"], item["documentNumber"], item["name"]) == (first["submittalId"], first["documentNumber"], "Changed meanwhile")
    assert count_records(env) == (1, 1, 1)
    # another form (another id) is another record; the same id in another project is independent
    ok(register(env, clientRequestId=str(uuid.uuid4())))
    ok(register(env, projectId="P2", clientRequestId=rid))
    assert count_records(env) == (2, 2, 3) and count_records(env, "P2")[:2] == (1, 1)
    # without an id the old behaviour stays (each request is a record)
    ok(register(env)); ok(register(env))
    assert count_records(env)[0] == 4


def test_request_id_reused_for_another_contractor_is_refused_and_malformed_ids_are_rejected(env):
    rid = str(uuid.uuid4())
    ok(register(env, clientRequestId=rid))
    before = snapshot(env)
    r = register(env, clientRequestId=rid, vendorId="V2")
    assert r.status_code == 409 and snapshot(env) == before
    for bad in ("short", "x" * 65, "has space in it", "../../etc"):
        assert register(env, clientRequestId=bad).status_code == 422, bad
    assert snapshot(env) == before


def test_simultaneous_requests_with_one_request_id_create_one_record(env):
    import threading
    rid, results, clients = str(uuid.uuid4()), [], [env.login("admin") for _ in range(4)]
    barrier = threading.Barrier(len(clients))

    def go(c):
        barrier.wait()
        results.append(c.post("/api/material-submittals/register", json={**REG, "clientRequestId": rid}))
    threads = [threading.Thread(target=go, args=(c,)) for c in clients]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert [r.status_code for r in results] == [200] * 4, [r.text for r in results]
    assert len({r.json()["submittalId"] for r in results}) == 1
    assert count_records(env) == (1, 1, 1)
    for c in clients:
        c.close()


def test_register_needs_manage_the_retired_permission_grants_nothing(env):
    before = snapshot(env)
    for path in ("/api/material-submittals/approved?projectId=P1", "/api/material-submittals/stats",
                 "/api/material-submittals/duplicates?projectId=P1&name=x"):
        assert env.c["legacy"].get(path).status_code == 403, path
    assert register(env, "legacy", clientRequestId=str(uuid.uuid4())).status_code == 403
    assert snapshot(env) == before


# ── R2 (review R3): duplicate check over every record of the project ─────────────────────────────────────────────
def duplicates(env, who="admin", **params):
    return env.c[who].get("/api/material-submittals/duplicates", params={"projectId": "P1", **params})


def bulk(env, n, project="P1", name="Common pipe"):
    """n registered records named `name` (models B000…) written through the service in one session (fast)."""
    from core.scope import UNSCOPED
    from services.material_submittal_service import MaterialSubmittalService
    import schemas
    with env.Session() as db:
        svc, actor = MaterialSubmittalService(db), SimpleNamespace(id=1, username="bulk")
        for i in range(n):
            svc.register(schemas.MaterialRegisterCreate(projectId=project, vendorId="V1", name=name, brand="B", model=f"B{i:03d}",
                                                        resultCode="Approved", approvedDate="2026-10-01"), UNSCOPED, actor)


def test_duplicates_cover_every_record_not_one_page(env):
    bulk(env, 520)                                                    # 520 records match the text "Common pipe"
    target = ok(register(env, name="  common PIPE ", brand="b", model=" zz-9 "))   # the real duplicate is the 521st
    page = ok(approved(env, q="Common pipe", limit=500))
    assert page["total"] == 521 and target["submittalId"] not in [i["submittalId"] for i in page["items"]]   # beyond one page
    got = ok(duplicates(env, name="Common Pipe", brand="B", model="ZZ-9"))["items"]
    assert got == [{"submittalId": target["submittalId"], "documentNumber": target["documentNumber"]}]
    assert ok(duplicates(env, name="Common pipe", brand="B", model="ZZ-9", excludeId=target["submittalId"]))["items"] == []   # self
    assert ok(duplicates(env, name="Common pipe", brand="B"))["items"] == []                          # model differs ("" vs zz-9)
    assert ok(duplicates(env, projectId="P2", name="Common pipe", brand="B", model="ZZ-9"))["items"] == []   # other project


def test_duplicates_ignore_the_record_of_the_same_form_and_respect_permission_and_scope(env):
    rid = str(uuid.uuid4())
    mine = ok(register(env, clientRequestId=rid))
    other = ok(register(env))
    names = dict(name=REG["name"], brand=REG["brand"], model=REG["model"])
    assert [i["submittalId"] for i in ok(duplicates(env, **names))["items"]] == [mine["submittalId"], other["submittalId"]]
    assert [i["submittalId"] for i in ok(duplicates(env, clientRequestId=rid, **names))["items"]] == [other["submittalId"]]
    assert duplicates(env, "nobody", **names).status_code == 403
    assert duplicates(env, "vendor", **names).json()["detail"] == VENDOR_REFUSAL
    assert duplicates(env, "scoped", projectId="P2", **names).status_code == 404
    assert duplicates(env, projectId="NOPE", **names).status_code == 404
    assert duplicates(env, brand="x").status_code == 422                                              # name is required
    assert ok(duplicates(env, "viewer", **names))["items"]                                           # view is enough to check


# ── R2 (review R4): dashboard figures over every visible project, server side ────────────────────────────────────
def stats(env, who="admin", **params):
    return env.c[who].get("/api/material-submittals/stats", params=params)


def test_stats_cover_every_visible_project_beyond_the_project_list_page(env):
    with env.Session() as db:
        db.add_all([models.Project(id=f"PX{i:03d}", name=f"Extra {i}") for i in range(203)])
        db.commit()
    assert ok(stats(env)) == {"total": 0, "registeredSince": 0}                                     # a real zero
    ok(register(env)); ok(register(env, projectId="P2"))
    ok(register(env, projectId="PX202", vendorId="V2"))                                               # the 205th project
    assert env.c["admin"].get("/api/projects/").json().__len__() == 200                               # the list a client gets by default
    assert ok(stats(env))["total"] == 3
    assert ok(stats(env, vendorId="V2"))["total"] == 1
    assert ok(stats(env, projectId="PX202"))["total"] == 1
    assert ok(stats(env, projectId="P1", vendorId="V2"))["total"] == 0
    with env.Session() as db:
        db.query(models.MaterialSubmittal).filter_by(project_id="P2").update({"created_at": "2026-09-15T10:00:00+00:00"})
        db.commit()
    assert ok(stats(env, registeredFrom="2026-10-01")) == {"total": 3, "registeredSince": 2}


def test_stats_respect_scope_permission_and_count_only_approved_records(env):
    ok(register(env)); ok(register(env, projectId="P2"))
    legacy_row(env, ["Draft"])                                                                        # never approved: not counted
    assert ok(stats(env))["total"] == 2
    assert ok(stats(env, "scoped")) == {"total": 1, "registeredSince": 0}                            # only P1 is visible
    assert stats(env, "scoped", projectId="P2").status_code == 404
    assert stats(env, projectId="NOPE").status_code == 404
    assert stats(env, "nobody").status_code == 403
    assert stats(env, "vendor").json()["detail"] == VENDOR_REFUSAL
    assert stats(env, registeredFrom="nope").status_code == 422


# ── shelf view (user's choice 2026-10-09): first photo + photo count on every approved item ────────────────────────
def test_approved_items_carry_the_first_photo_and_the_photo_count(env):
    a = ok(register(env, name="With photos"))
    b = ok(register(env, name="Without photos"))
    first = ok(upload(env, "admin", a["revisionId"], "photo", ("front.png", PNG[1], "image/png")))[0]
    second = ok(upload(env, "admin", a["revisionId"], "photo", ("side.png", PNG[1], "image/png")))[0]
    with env.Session() as db:                                       # the first upload is the earliest one
        db.query(models.Attachment).filter_by(id=first["id"]).update({"uploaded_at": "2026-10-01T00:00:00+00:00"})
        db.commit()
        first_path = db.get(models.Attachment, first["id"]).file_path
    items = {i["name"]: i for i in ok(approved(env))["items"]}
    assert (items["With photos"]["coverPhotoPath"], items["With photos"]["photoCount"]) == (first_path, 2)
    assert (items["Without photos"]["coverPhotoPath"], items["Without photos"]["photoCount"]) == (None, 0)
    assert first_path.startswith("material_rev/")
    # a deleted photo is not counted and no longer the cover; register / edit answers carry the same fields
    assert env.c["admin"].delete(f"/api/files/{first['id']}").status_code == 200
    item = ok(edit(env, a["submittalId"], brand="Z"))
    assert item["photoCount"] == 1 and item["coverPhotoPath"] != first_path
    assert ok(approved(env))["items"][0]["photoCount"] == 1
    assert b["photoCount"] == 0 and b["coverPhotoPath"] is None
    # the cover path is served by the attachment download route with its own permission / scope checks
    assert env.c["admin"].get(f"/api/files/download/{item['coverPhotoPath']}").status_code == 200
    assert env.c["nobody"].get(f"/api/files/download/{item['coverPhotoPath']}").status_code in (403, 404)
    assert second["id"]
