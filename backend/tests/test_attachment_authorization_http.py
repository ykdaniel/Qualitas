"""Attachment API (/api/files) authorization — real logins, real routes, real files in a temporary upload root (2026-09-20).

BATCH 1 — the target of an upload must exist and be inside the caller's data scope; a refused or half-failed upload leaves no attachment
row and no file; a soft-deleted attachment cannot be fetched by anyone through the download entry point or its path.

BATCH 2 (plan A) — read needs the record type's view permission; upload and delete need its update permission (a create-only account cannot
attach files); the state locks the records' own rules already define are applied to attachments; data scope and existence are unchanged.

Every attachment assertion looks at the database through a brand-new Session and at the files in the temporary upload root (never the
project's uploads/ — QUALITAS_UPLOAD_ROOT points at tmp_path, and conftest fails the run if backend/uploads changes).
"""
import os
from pathlib import Path

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

import models
from core import perms
from core.security import get_password_hash
from core.startup_guard import BACKEND_DIR, ENV_UPLOAD_ROOT
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm

# The update-class permission of every attachment type. Most types call it `<module>:update:all`; contractor uses `contractors:manage:all`,
# and a material revision uses `material:manage:all` for every category (the separate `material:record_result:all` for
# `replyDocument` was removed in M6 — DECISIONS 材料：只作為核准材料登錄簿).
VIEW_UPDATE = [v for k, v in vars(perms).items() if isinstance(v, str) and (v.endswith(":view:all") or v.endswith(":update:all"))] + [
    perms.CONTRACTOR_MANAGE, perms.MATERIAL_MANAGE]


# ── harness ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def aenv(tmp_path, monkeypatch):
    from database import Base, get_db
    from routers import auth as auth_router, file_router, ncr as ncr_router, obs as obs_router, noi as noi_router
    import database as database_module
    import db_migrations
    root = tmp_path / "uploads"
    monkeypatch.setenv(ENV_UPLOAD_ROOT, str(root))
    engine = create_engine(f"sqlite:///{tmp_path / 'att.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(S)
    app = FastAPI()
    for r in (auth_router.router, file_router.router, ncr_router.router, obs_router.router, noi_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = S()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    import core.security as security_module                       # imported `SessionLocal` by name: the token blacklist would otherwise read/write ANOTHER database
    orig = (database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal)
    database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = engine, S, engine, S
    env = Env(app, S)
    env.root = root
    try:
        yield env
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _seed(S):
    db = S()
    try:
        def role(name, codes):
            r = models.Role(name=name)
            r.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
            db.add(r)
            db.flush()
            return r
        full = role("AttFull", VIEW_UPDATE)
        admin = role("Admin", VIEW_UPDATE)
        create_codes = [v for k, v in vars(perms).items() if isinstance(v, str) and v.endswith(":create:all")]
        view_codes = [v for v in VIEW_UPDATE if v.endswith(":view:all")]
        update_codes = [v for v in VIEW_UPDATE if not v.endswith(":view:all")]
        r_none = role("AttNone", [])
        r_view = role("AttViewer", view_codes)
        r_create = role("AttCreateOnly", view_codes + create_codes)          # view + create, NO update
        r_update = role("AttUpdateOnly", update_codes)                       # update, but NOT view
        for cid, name in (("C1", "C One"), ("C2", "C Two")):
            db.add(models.Contractor(id=cid, name=name, abbreviation=cid))
        for pid in ("P-A", "P-B"):
            db.add(models.Project(id=pid, name=pid))
        db.flush()

        def user(username, r, vendor=None, projects=()):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=r.id, vendor_id=vendor)
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        user("adm", admin)                       # unscoped
        user("sA", full, "C1", ["P-A"])          # the target's own project AND contractor
        user("sP", full, None, ["P-B"])          # another project only
        user("sV", full, "C2", [])               # another contractor only
        user("sB", full, "C2", ["P-B"])          # another project and contractor
        user("noperm", r_none)                   # unscoped, no permission at all
        user("viewer", r_view)                   # unscoped, view only
        user("create_only", r_create)            # unscoped, view + create, no update
        user("updater", r_update)                # unscoped, update but no view
        # material revisions: material:manage for every category (M6); a view-only account may not change files
        user("mat_manage", role("MatManage", [perms.MATERIAL_VIEW, perms.MATERIAL_MANAGE]))
        user("mat_view", role("MatView", [perms.MATERIAL_VIEW]))
        for name, project, vendor in (("a", "P-A", "C1"), ("b", "P-B", "C2")):
            db.add(models.NCR(id=f"ncr-{name}", documentNumber=f"NCR-{name}", project_id=project, vendor_id=vendor, status="Open", description="d", rev="0", submit=""))
            db.add(models.OBS(id=f"obs-{name}", documentNumber=f"OBS-{name}", project_id=project, vendor_id=vendor, status="Open", description="d", rev="0", submit=""))
        db.add(models.KMArticle(id="km-1", articleNo="KM-1", title="t", content="c"))
        db.flush()
        _seed_matrix_records(db)
        db.commit()
    finally:
        db.close()


def _mk(db, model, rid, **kw):
    cols = {"id": rid, "project_id": "P-A", "description": "d", "rev": "0", "submit": "", "status": "Open", **kw}
    db.add(model(**{k: v for k, v in cols.items() if hasattr(model, k) and not isinstance(getattr(model, k, None), property)}))


# One record per attachment entity type, in their default (open) state, for the permission matrix.
MATRIX = {"itp": "itp-1", "ncr": "ncr-a", "noi": "noi-1", "itr": "itr-1", "pqp": "pqp-1", "obs": "obs-a", "osd": "osd-1", "fat": "fat-1",
          "audit": "audit-1", "checklist": "chk-1", "followup": "fu-1", "meeting": "mtg-1", "km": "km-1", "contractor": "C1",
          "material_rev": "msr-1"}
# The category the generic matrix uses for a type. `attachment` everywhere, except a material revision, which has no `attachment`
# category (spec §3.4); `catalogue` is one of its submission categories, governed by `material:manage:all` while the revision is a Draft.
MATRIX_CATEGORY = {"material_rev": "catalogue"}


def _seed_matrix_records(db):
    _mk(db, models.ITP, "itp-1", referenceNo="ITP-1", vendor_id="C1")
    _mk(db, models.NOI, "noi-1", referenceNo="NOI-1", vendor_id="C1", package="p", issueDate="2026-09-01", inspectionDate="2026-09-10", inspectionTime="09:00", type="Rebar")
    _mk(db, models.ITR, "itr-1", documentNumber="ITR-1", vendor_id="C1")
    _mk(db, models.PQP, "pqp-1", documentNumber="PQP-1", vendor_id="C1", status="Under Review")
    _mk(db, models.OSD, "osd-1", documentNumber="OSD-1", vendor_id="C1")
    _mk(db, models.FAT, "fat-1", documentNumber="FAT-1", vendor_id="C1")
    _mk(db, models.Audit, "audit-1", auditNo="AUD-1", date="2026-09-01", vendor_id="C1")
    _mk(db, models.Checklist, "chk-1", recordsNo="CHK-1", contractor_id="C1", activity="a")
    _mk(db, models.FollowUp, "fu-1", issueNo="FU-1", vendor_id="C1")
    _mk(db, models.MeetingMinutes, "mtg-1", documentNumber="MTG-1", vendor_id="C1", status="Draft")
    db.add(models.Material(id="mat-1", project_id="P-A", name="Material"))
    db.add(models.MaterialSubmittal(id="ms-1", project_id="P-A", vendor_id="C1", material_id="mat-1", document_number="MSA-1",
                                    latest_rev_no=0, latest_status="Draft"))
    db.add(models.MaterialSubmittalRevision(id="msr-1", submittal_id="ms-1", project_id="P-A", vendor_id="C1", rev_no=0,
                                            status="Draft", snap_name="Material"))


def up(client, etype, eid, files=(("a.txt", b"hello", "text/plain"),), category=None):
    category = category or MATRIX_CATEGORY.get(etype, "attachment")
    return client.post("/api/files/upload", data={"entity_type": etype, "entity_id": eid, "category": category},
                       files=[("files", (n, c, m)) for n, c, m in files])


def rows(env):
    s: Session = env.Session()
    try:
        return sorted((a.id, a.entity_type, a.entity_id, a.file_name, bool(a.is_deleted), a.file_path) for a in s.query(models.Attachment).all())
    finally:
        s.close()


def files_on_disk(env):
    return sorted(str(p.relative_to(env.root)) for p in env.root.rglob("*") if p.is_file()) if env.root.exists() else []


def nothing_added(env, before):
    return rows(env) == before[0] and files_on_disk(env) == before[1]


def state(env):
    return rows(env), files_on_disk(env)


# ══ BATCH 1 · 1. upload lands in the temporary root, only for an existing in-scope target ═════════════════════════════════════════

def test_upload_to_an_existing_in_scope_target_stores_the_row_and_the_file_in_the_temporary_root(aenv):
    r = up(aenv.login("sA"), "ncr", "ncr-a", files=(("a.txt", b"hello", "text/plain"), ("b.txt", b"world", "text/plain")))
    assert r.status_code == 200 and len(r.json()) == 2
    got = rows(aenv)
    assert len(got) == 2 and all(row[1:3] == ("ncr", "ncr-a") for row in got)
    on_disk = files_on_disk(aenv)
    assert len(on_disk) == 2 and all(p.startswith("ncr/") for p in on_disk)
    assert all((aenv.root / p).is_file() for p in on_disk)
    # …and they really are in the temp root, not the project's uploads
    assert os.path.realpath(aenv.root) == os.path.realpath(os.environ[ENV_UPLOAD_ROOT])
    assert not os.path.realpath(aenv.root).startswith(str(BACKEND_DIR))


@pytest.mark.parametrize("who", ["adm", "sA"])
def test_downloading_an_uploaded_file_returns_its_bytes_from_the_temporary_root(aenv, who):
    fid = up(aenv.login("sA"), "ncr", "ncr-a", files=(("a.txt", b"payload-123", "text/plain"),)).json()[0]
    path = fid["file_url"].split("/api/files/download/", 1)[1]
    r = aenv.login(who).get(f"/api/files/download/{path}")
    assert r.status_code == 200 and r.content == b"payload-123"


@pytest.mark.parametrize("etype,eid", [("ncr", "does-not-exist"), ("obs", "does-not-exist"), ("noi", "x"), ("itr", "x"), ("itp", "x"), ("pqp", "x"),
                                       ("osd", "x"), ("fat", "x"), ("audit", "x"), ("checklist", "x"), ("followup", "x"), ("meeting", "x"),
                                       ("km", "does-not-exist"), ("contractor", "NOPE")])
@pytest.mark.parametrize("who", ["adm", "sA"])
def test_upload_to_a_target_that_does_not_exist_is_404_for_everyone_and_leaves_nothing(aenv, etype, eid, who):
    c = aenv.login(who)
    before = state(aenv)
    r = up(c, etype, eid)
    assert r.status_code == 404 and r.json()["detail"] == "Attachment target not found"
    assert nothing_added(aenv, before)
    assert not (aenv.root / etype).exists()                       # not even the module directory was created


@pytest.mark.parametrize("who", ["sP", "sV", "sB"])
@pytest.mark.parametrize("target", [("ncr", "ncr-a"), ("obs", "obs-a")])
def test_upload_to_a_record_outside_the_callers_project_or_contractor_is_refused_with_the_same_404_and_leaves_nothing(aenv, who, target):
    before = state(aenv)
    r = up(aenv.login(who), *target)
    missing = up(aenv.login(who), target[0], "does-not-exist")
    assert r.status_code == 404 and r.json() == missing.json()      # indistinguishable from a record that does not exist
    assert nothing_added(aenv, before)


def test_the_legitimate_scoped_user_and_the_unscoped_admin_can_still_upload(aenv):
    for who, eid in (("sA", "ncr-a"), ("adm", "ncr-a"), ("adm", "ncr-b"), ("sB", "ncr-b"), ("sP", "ncr-b"), ("sV", "ncr-b")):
        before = len(rows(aenv))
        assert up(aenv.login(who), "ncr", eid).status_code == 200, (who, eid)
        assert len(rows(aenv)) == before + 1


def test_types_without_project_or_contractor_ownership_keep_their_existing_scope_rule_but_the_target_must_exist(aenv):
    for who in ("sV", "sB", "adm"):
        assert up(aenv.login(who), "km", "km-1").status_code == 200
        assert up(aenv.login(who), "contractor", "C1").status_code == 200


def test_an_unknown_entity_type_is_still_a_400(aenv):
    before = state(aenv)
    r = up(aenv.login("adm"), "not-a-module", "x")
    assert r.status_code == 400 and "Unknown entity_type" in r.json()["detail"]
    assert nothing_added(aenv, before)


def test_unauthenticated_upload_is_401_and_leaves_nothing(aenv):
    before = state(aenv)
    assert up(aenv.anonymous(), "ncr", "ncr-a").status_code == 401
    assert nothing_added(aenv, before)


# ══ BATCH 1 · 2. all-or-nothing ══════════════════════════════════════════════════════════════════════════════════════════════════

def test_one_invalid_file_in_a_batch_rejects_the_whole_upload_no_row_and_no_file(aenv):
    before = state(aenv)
    r = up(aenv.login("sA"), "ncr", "ncr-a", files=(("good.txt", b"ok", "text/plain"), ("bad.exe", b"MZ..", "application/x-msdownload")))
    assert r.status_code == 400
    assert nothing_added(aenv, before)                            # the good file, first in the batch, was NOT left behind


def test_an_oversized_file_rejects_the_batch(aenv, monkeypatch):
    import routers.file_router as fr
    monkeypatch.setattr(fr, "MAX_FILE_SIZE_BYTES", 10)
    before = state(aenv)
    r = up(aenv.login("sA"), "ncr", "ncr-a", files=(("small.txt", b"ok", "text/plain"), ("big.txt", b"x" * 50, "text/plain")))
    assert r.status_code == 400 and "exceeds" in r.json()["detail"]
    assert nothing_added(aenv, before)


def test_a_failed_commit_leaves_neither_a_row_nor_an_orphan_file(aenv, monkeypatch):
    c = aenv.login("sA")
    before = state(aenv)

    def boom(self):
        raise RuntimeError("commit failed")
    monkeypatch.setattr(Session, "commit", boom)
    with pytest.raises(RuntimeError):
        up(c, "ncr", "ncr-a", files=(("a.txt", b"1", "text/plain"), ("b.txt", b"2", "text/plain")))
    monkeypatch.undo()
    monkeypatch.setenv(ENV_UPLOAD_ROOT, str(aenv.root))
    assert nothing_added(aenv, before)


# ══ BATCH 1 · 3. a soft-deleted attachment is gone for everyone ══════════════════════════════════════════════════════════════════

def _deleted_file(env):
    j = up(env.login("sA"), "ncr", "ncr-a", files=(("gone.txt", b"secret-bytes", "text/plain"),)).json()[0]
    path = j["file_url"].split("/api/files/download/", 1)[1]
    assert env.login("sA").get(f"/api/files/download/{path}").status_code == 200        # downloadable while it is alive
    assert env.login("sA").delete(f"/api/files/{j['id']}").status_code == 200
    return j["id"], path


@pytest.mark.parametrize("who", ["adm", "sA", "sP", "sV", "sB"])
def test_a_soft_deleted_attachment_cannot_be_downloaded_by_path_by_any_account(aenv, who):
    fid, path = _deleted_file(aenv)
    assert aenv.login(who).get(f"/api/files/download/{path}").status_code == 404
    assert aenv.anonymous().get(f"/api/files/download/{path}").status_code == 401


def test_soft_delete_still_keeps_the_row_flag_and_the_file_but_hides_it_everywhere_else(aenv):
    fid, path = _deleted_file(aenv)
    assert [row for row in rows(aenv) if row[0] == fid][0][4] is True            # soft: flagged, not removed
    assert (aenv.root / path).is_file()                                          # the bytes are retained on disk (unchanged behaviour)
    assert aenv.login("adm").get(f"/api/files/{fid}").status_code == 404
    assert fid not in [x["id"] for x in aenv.login("adm").get("/api/files/by-entity", params={"entity_type": "ncr", "entity_id": "ncr-a"}).json()]


def test_deleting_one_attachment_does_not_take_a_sibling_offline(aenv):
    c = aenv.login("sA")
    a, b = (up(c, "ncr", "ncr-a", files=((f"{n}.txt", n.encode(), "text/plain"),)).json()[0] for n in ("one", "two"))
    assert c.delete(f"/api/files/{a['id']}").status_code == 200
    assert c.get(f"/api/files/download/{b['file_url'].split('/api/files/download/', 1)[1]}").content == b"two"


def test_files_without_an_attachment_row_are_still_served_as_before(aenv):
    """KM images (services/km_service.upload_image) are stored without an Attachment row and are served through the same entry point."""
    (aenv.root / "km").mkdir(parents=True)
    (aenv.root / "km" / ("km_" + "ab" * 16 + ".png")).write_bytes(b"\x89PNG\r\n\x1a\nxx")
    r = aenv.login("adm").get("/api/files/download/km/km_" + "ab" * 16 + ".png")
    assert r.status_code == 200 and r.content.startswith(b"\x89PNG")


def test_path_traversal_is_still_refused(aenv):
    r = aenv.login("adm").get("/api/files/download/../att.db")
    assert r.status_code in (403, 404)


# ══ BATCH 2 · 1. module permissions — every legal entity_type ═════════════════════════════════════════════════════════════════════

from core.attachment_access import ENTITY_PERMISSIONS  # noqa: E402

ALL_TYPES = sorted(MATRIX)


def test_the_permission_table_covers_exactly_the_legal_entity_types():
    import routers.file_router as fr
    assert set(ENTITY_PERMISSIONS) == fr._VALID_ENTITY_TYPES == set(MATRIX)


def _seed_file(env, etype):
    """A file that already exists on the record (put there by an account that may)."""
    j = up(env.login("adm"), etype, MATRIX[etype], files=(("seed.txt", b"seed-bytes", "text/plain"),)).json()[0]
    return j["id"], j["file_url"].split("/api/files/download/", 1)[1]


def _needed(etype, action):
    return ENTITY_PERMISSIONS[etype][0 if action == "view" else 1]


@pytest.mark.parametrize("etype", ALL_TYPES)
@pytest.mark.parametrize("who", ["noperm", "viewer", "create_only"])
def test_without_the_update_permission_upload_and_delete_are_403_and_change_nothing(aenv, etype, who):
    fid, path = _seed_file(aenv, etype)
    c = aenv.login(who)
    before = state(aenv)
    r = up(c, etype, MATRIX[etype])
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {_needed(etype, 'update')}"
    d = c.delete(f"/api/files/{fid}")
    assert d.status_code == 403 and d.json()["detail"] == f"Operation not permitted. Required: {_needed(etype, 'update')}"
    assert nothing_added(aenv, before)                                    # the row is not flagged deleted, the file is still there


@pytest.mark.parametrize("etype", ALL_TYPES)
@pytest.mark.parametrize("who", ["noperm", "updater"])
def test_without_the_view_permission_list_metadata_and_download_are_403(aenv, etype, who):
    fid, path = _seed_file(aenv, etype)
    c = aenv.login(who)
    for r in (c.get("/api/files/by-entity", params={"entity_type": etype, "entity_id": MATRIX[etype]}), c.get(f"/api/files/{fid}"), c.get(f"/api/files/download/{path}")):
        assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {_needed(etype, 'view')}", r.text


@pytest.mark.parametrize("etype", ALL_TYPES)
@pytest.mark.parametrize("who", ["viewer", "create_only", "adm"])
def test_the_view_permission_alone_reads_everything_and_the_bytes_come_back(aenv, etype, who):
    fid, path = _seed_file(aenv, etype)
    c = aenv.login(who)
    listed = c.get("/api/files/by-entity", params={"entity_type": etype, "entity_id": MATRIX[etype]})
    assert listed.status_code == 200 and fid in [x["id"] for x in listed.json()]
    assert c.get(f"/api/files/{fid}").status_code == 200
    got = c.get(f"/api/files/download/{path}")
    assert got.status_code == 200 and got.content == b"seed-bytes"


@pytest.mark.parametrize("etype", ALL_TYPES)
def test_the_update_permission_alone_uploads_and_deletes(aenv, etype):
    c = aenv.login("updater")                                             # update, but no view
    r = up(c, etype, MATRIX[etype])
    assert r.status_code == 200
    assert c.delete(f"/api/files/{r.json()[0]['id']}").status_code == 200


@pytest.mark.parametrize("etype", ALL_TYPES)
def test_a_full_account_uploads_lists_downloads_and_deletes_as_before(aenv, etype):
    c = aenv.login("adm")
    r = up(c, etype, MATRIX[etype], files=(("f.txt", b"abc", "text/plain"),))
    assert r.status_code == 200
    j = r.json()[0]
    assert c.get(f"/api/files/download/{j['file_url'].split('/api/files/download/', 1)[1]}").content == b"abc"
    assert c.delete(f"/api/files/{j['id']}").status_code == 200


def test_list_with_an_unknown_entity_type_is_a_400_not_a_silent_empty_answer(aenv):
    r = aenv.login("adm").get("/api/files/by-entity", params={"entity_type": "nonsense", "entity_id": "x"})
    assert r.status_code == 400


def test_an_inactive_account_has_no_attachment_access_at_all(aenv):
    fid, path = _seed_file(aenv, "ncr")
    c = aenv.login("adm")
    db = aenv.Session()
    db.query(models.User).filter_by(username="adm").update({"is_active": False})
    db.commit()
    db.close()
    for r in (c.get(f"/api/files/{fid}"), c.get(f"/api/files/download/{path}"), up(c, "ncr", "ncr-a")):
        assert r.status_code in (401, 403), r.text


def test_files_without_an_attachment_row_are_served_only_as_KM_images_with_the_km_view_permission(aenv):
    km = "km/km_" + "cd" * 16 + ".png"
    (aenv.root / "km").mkdir(parents=True)
    (aenv.root / km).write_bytes(b"\x89PNG\r\n\x1a\nxx")
    (aenv.root / "stray").mkdir()
    (aenv.root / "stray" / "s.txt").write_bytes(b"stray")
    assert aenv.login("viewer").get(f"/api/files/download/{km}").status_code == 200                # km:view:all
    assert aenv.login("noperm").get(f"/api/files/download/{km}").status_code == 403
    assert aenv.login("adm").get("/api/files/download/stray/s.txt").status_code == 404             # belongs to no module: nobody
    assert aenv.login("adm").get("/api/files/download/km/nope.png").status_code == 404


def test_scope_still_applies_on_top_of_the_permissions(aenv):
    fid, path = _seed_file(aenv, "ncr")                                   # ncr-a: P-A / C1
    for who in ("sP", "sV", "sB"):
        c = aenv.login(who)                                               # they DO hold view+update — but for another project / contractor
        assert c.get(f"/api/files/{fid}").status_code == 404
        assert c.get(f"/api/files/download/{path}").status_code == 404
        assert c.delete(f"/api/files/{fid}").status_code == 404
        assert up(c, "ncr", "ncr-a").status_code == 404


# ══ BATCH 2 · 2. the create-only account ═════════════════════════════════════════════════════════════════════════════════════════

CREATE_BODIES = {
    "ncr": ("/api/ncr/", dict(vendor="C One", description="own", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2026-09-05", subject="own", type="Design",
                              severity="Minor", discipline="Civil", foundBy="q", raisedBy="q", foundLocation="g", referenceStandards="s", deviation="d")),
    "obs": ("/api/obs/", dict(vendor="C One", description="own", rev="", submit="v", status="Open", hasDetails=True, raiseDate="2026-09-05", subject="own")),
    "noi": ("/api/noi/", dict(package="own", issueDate="2026-09-05", inspectionDate="2026-09-15", inspectionTime="09:00", itpNo="", eventNumber="E", checkpoint="H",
                             type="Rebar", contractor="C One", contacts="b", phone="1", email="b@example.com", status="Open")),
}


@pytest.mark.parametrize("module", ["ncr", "obs", "noi"])
def test_a_create_only_account_can_create_the_record_but_cannot_attach_files_to_it_and_nothing_is_created_twice(aenv, module):
    path, body = CREATE_BODIES[module]
    c = aenv.login("create_only")
    made = c.post(path, json=body)
    assert made.status_code == 200
    rid = made.json()["id"]
    before = state(aenv)
    r = up(c, module, rid)                                                # the "retry the attachment" call of the UI
    assert r.status_code == 403 and "Required" in r.json()["detail"]
    assert nothing_added(aenv, before)
    db = aenv.Session()
    try:
        model = {"ncr": models.NCR, "obs": models.OBS, "noi": models.NOI}[module]
        assert db.query(model).filter(model.id == rid).count() == 1        # the record is there, exactly once
    finally:
        db.close()
    put = c.put(path + rid + ("" if module == "obs" else "/"), json={"remark": "x"})
    assert put.status_code == 403                                          # the same account cannot update the record either: consistent


# ══ BATCH 2 · 3. state locks the records' own rules already define ═══════════════════════════════════════════════════════════════

def _set_state(env, model, rid, **cols):
    db = env.Session()
    db.query(model).filter_by(id=rid).update(cols)
    db.commit()
    db.close()


UNCONDITIONAL = [
    ("noi", models.NOI, "noi-1", {"status": "Closed"}),
    ("audit", models.Audit, "audit-1", {"status": "Closed"}),
    ("followup", models.FollowUp, "fu-1", {"status": "Closed"}),
    ("meeting", models.MeetingMinutes, "mtg-1", {"status": "Published"}),
    ("meeting", models.MeetingMinutes, "mtg-1", {"status": "Void"}),
    ("itr", models.ITR, "itr-1", {"status": "Approved"}),
    ("itr", models.ITR, "itr-1", {"status": "Void"}),
    ("pqp", models.PQP, "pqp-1", {"status": "Approved"}),
]


@pytest.mark.parametrize("etype,model,rid,cols", UNCONDITIONAL, ids=[f"{u[0]}-{u[3]['status']}" for u in UNCONDITIONAL])
def test_a_record_whose_own_rules_freeze_it_refuses_upload_and_delete_of_attachments_even_for_a_full_account(aenv, etype, model, rid, cols):
    c = aenv.login("adm")                                                 # holds every view/update permission: no permission lifts a lock
    alive = up(c, etype, rid).json()[0]                                   # uploaded while the record was still open
    _set_state(aenv, model, rid, **cols)
    before = state(aenv)
    r = up(c, etype, rid)
    assert r.status_code == 409 and "locked" in r.json()["detail"].lower()
    d = c.delete(f"/api/files/{alive['id']}")
    assert d.status_code == 409
    assert nothing_added(aenv, before)                                    # nothing added, nothing flagged deleted, no file removed
    assert c.get(f"/api/files/{alive['id']}").status_code == 200          # reading is not a change: still allowed
    assert c.get(f"/api/files/download/{alive['file_url'].split('/api/files/download/', 1)[1]}").status_code == 200


def test_checklist_is_frozen_when_its_parent_itr_is_approved_or_void_and_open_otherwise(aenv):
    c = aenv.login("adm")
    _set_state(aenv, models.Checklist, "chk-1", itrId="itr-1")
    for itr_status, expect in (("In Progress", 200), ("Approved", 409), ("Void", 409)):
        _set_state(aenv, models.ITR, "itr-1", status=itr_status)
        assert up(c, "checklist", "chk-1").status_code == expect, itr_status
    _set_state(aenv, models.Checklist, "chk-1", itrId=None)                 # a bare template has no parent: never frozen by this rule
    assert up(c, "checklist", "chk-1").status_code == 200


CATEGORY_LOCKS = [
    ("obs", models.OBS, "obs-a", "defectPhoto", 409), ("obs", models.OBS, "obs-a", "improvementPhoto", 409), ("obs", models.OBS, "obs-a", "attachment", 200),
    ("ncr", models.NCR, "ncr-a", "improvementPhoto", 409), ("ncr", models.NCR, "ncr-a", "defectPhoto", 200),
    ("ncr", models.NCR, "ncr-a", "progressPhoto", 200), ("ncr", models.NCR, "ncr-a", "attachment", 200),
]


@pytest.mark.parametrize("etype,model,rid,category,expect", CATEGORY_LOCKS, ids=[f"{c[0]}-closed-{c[3]}" for c in CATEGORY_LOCKS])
def test_a_closed_ncr_or_obs_locks_only_the_photo_categories_its_own_rules_lock(aenv, etype, model, rid, category, expect):
    c = aenv.login("adm")
    alive = up(c, etype, rid, category=category).json()[0]
    _set_state(aenv, model, rid, status="Closed")
    assert up(c, etype, rid, category=category).status_code == expect
    assert c.delete(f"/api/files/{alive['id']}").status_code == (200 if expect == 200 else 409)


def test_the_same_records_are_open_to_uploads_while_they_are_not_locked(aenv):
    c = aenv.login("adm")
    for etype in ALL_TYPES:
        assert up(c, etype, MATRIX[etype]).status_code == 200, etype


@pytest.mark.parametrize("etype,model,rid,status", [("ncr", models.NCR, "ncr-a", "Void"), ("obs", models.OBS, "obs-a", "Void"),
                                                    ("pqp", models.PQP, "pqp-1", "Void"), ("noi", models.NOI, "noi-1", "Reject")])
def test_PENDING_DECISION_states_without_an_attachment_policy_are_not_locked_yet(aenv, etype, model, rid, status):
    """Deliberately pins today's behaviour for states the records' own rules say nothing about (see core.attachment_access.PENDING_STATE_DECISIONS).
    When the policy is decided, this test is the one to change."""
    _set_state(aenv, model, rid, status=status)
    assert up(aenv.login("adm"), etype, rid).status_code == 200


# ══ MATERIAL-SUBMITTAL M2 · material_rev in the shared attachment flow (spec §3.4, §9.2) ═════════════════════════════════════════════
# The generic tests above cover material_rev through MATRIX (submission category `catalogue`, Draft revision). These pin what is
# specific to it: the per-category update permission, the three state locks and the refusal of contractor-scoped accounts.

SUBMISSION = ["catalogue", "technicalData", "certificate", "testReport", "other"]


def _rev_state(env, status):
    _set_state(env, models.MaterialSubmittalRevision, "msr-1", status=status)


@pytest.mark.parametrize("category", SUBMISSION)
def test_material_submission_categories_need_manage(aenv, category):
    before = state(aenv)
    r = up(aenv.login("mat_view"), "material_rev", "msr-1", category=category)
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {perms.MATERIAL_MANAGE}"
    assert nothing_added(aenv, before)
    assert up(aenv.login("mat_manage"), "material_rev", "msr-1", category=category).status_code == 200


def test_material_reply_document_needs_manage_since_record_result_was_removed(aenv):
    _rev_state(aenv, "Submitted")
    before = state(aenv)
    r = up(aenv.login("mat_view"), "material_rev", "msr-1", category="replyDocument")
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {perms.MATERIAL_MANAGE}"
    assert nothing_added(aenv, before)
    ok = up(aenv.login("mat_manage"), "material_rev", "msr-1", category="replyDocument")
    assert ok.status_code == 200
    assert aenv.login("mat_manage").delete(f"/api/files/{ok.json()[0]['id']}").status_code == 200


@pytest.mark.parametrize("status,category,expect", [
    ("Draft", "catalogue", 200), ("Draft", "replyDocument", 409),
    ("Submitted", "catalogue", 409), ("Submitted", "testReport", 409), ("Submitted", "replyDocument", 200),
    ("Approved", "catalogue", 409), ("Approved", "replyDocument", 409),
    ("ApprovedWithComments", "replyDocument", 409), ("ReviseAndResubmit", "other", 409), ("Rejected", "replyDocument", 409),
])
def test_material_revision_state_locks_upload_and_delete(aenv, status, category, expect):
    c = aenv.login("adm")
    # an existing file of this category, put there in the one state that allows it
    _rev_state(aenv, "Submitted" if category == "replyDocument" else "Draft")
    existing = up(c, "material_rev", "msr-1", category=category).json()[0]["id"]
    _rev_state(aenv, status)
    before = state(aenv)
    r = up(c, "material_rev", "msr-1", category=category)
    assert r.status_code == expect, r.text
    if expect != 200:
        assert nothing_added(aenv, before)
    assert c.delete(f"/api/files/{existing}").status_code == expect


# M6: material photos — a submission category (manage permission, same state locks) that only accepts images.
# R2: real, decodable images (the former constant was only a PNG signature followed by zero bytes).
def _image(fmt, size=(24, 16)):
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, (180, 90, 40)).save(buf, format=fmt)
    return buf.getvalue()


PNG = ("photo.png", _image("PNG"), "image/png")


def test_material_photo_category_accepts_images_only(aenv):
    c = aenv.login("mat_manage")
    before = state(aenv)
    r = up(c, "material_rev", "msr-1", category="photo")                                   # a.txt, text/plain
    assert r.status_code == 400 and "only accepts images" in r.json()["detail"]
    r = up(c, "material_rev", "msr-1", files=(("fake.png", b"%PDF-1.4 not an image", "image/png"),), category="photo")
    assert r.status_code == 400                                                            # detected type wins over the name / claim
    assert nothing_added(aenv, before)
    ok = up(c, "material_rev", "msr-1", files=(PNG,), category="photo")
    assert ok.status_code == 200 and ok.json()[0]["category"] == "photo"
    assert up(c, "material_rev", "msr-1", category="catalogue").status_code == 200        # other categories unchanged


def test_material_photo_is_decided_by_decoding_the_content_not_by_name_or_mime(aenv):
    """M6 R2 (review R2): a renamed text file, a forged MIME, a RIFF/WAVE file named .webp and corrupt / truncated images are
    refused with nothing written; one bad file in a multi-file upload refuses the whole upload. Real PNG / JPEG / GIF / WebP
    pass and are stored with the DECODED type, whatever the client claimed."""
    c = aenv.login("mat_manage")
    png = _image("PNG")
    wave = b"RIFF" + (36).to_bytes(4, "little") + b"WAVEfmt " + b"\x10\x00\x00\x00\x01\x00\x01\x00" + b"\x00" * 24
    bad = {
        "renamed text": ("fake.png", b"just some text, not a picture", "image/png"),
        "text with image MIME, no extension": ("photo", b"plain text body", "image/jpeg"),
        "RIFF/WAVE named webp": ("audio.webp", wave, "image/webp"),
        "signature only": ("sig.png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 32, "image/png"),
        "truncated PNG": ("cut.png", png[: len(png) // 2], "image/png"),
        "corrupt JPEG": ("broken.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 64, "image/jpeg"),
        "PDF named png": ("doc.png", b"%PDF-1.4 not an image", "image/png"),
    }
    for label, f in bad.items():
        before = state(aenv)
        r = up(c, "material_rev", "msr-1", files=(f,), category="photo")
        assert r.status_code == 400 and "not a valid image" in r.json()["detail"], (label, r.status_code, r.text)
        assert nothing_added(aenv, before), label
    before = state(aenv)
    r = up(c, "material_rev", "msr-1", files=(PNG, bad["RIFF/WAVE named webp"]), category="photo")
    assert r.status_code == 400 and nothing_added(aenv, before)                     # one bad file: nothing of the batch is kept
    good = [("a.png", _image("PNG"), "image/png"), ("b.jpg", _image("JPEG"), "image/png"),    # wrong claim on purpose
            ("c.gif", _image("GIF"), "image/gif"), ("d.webp", _image("WEBP"), "image/webp")]
    r = up(c, "material_rev", "msr-1", files=good, category="photo")
    assert r.status_code == 200, r.text
    assert [a["mime_type"] for a in r.json()] == ["image/png", "image/jpeg", "image/gif", "image/webp"]   # decoded type, not the claim
    assert up(c, "material_rev", "msr-1", files=(("a.txt", b"hello", "text/plain"),), category="catalogue").status_code == 200  # others unchanged
    assert up(c, "material_rev", "msr-1", files=(("audio.webp", wave, "image/webp"),), category="catalogue").status_code == 200  # contract kept


def test_material_photo_needs_manage_and_is_never_locked_by_state(aenv):
    """DECISIONS 材料：只作為核准材料登錄簿 — photos of a registered (approved) material stay maintainable; permission and
    scope still apply, and the OTHER submission categories keep their state locks."""
    before = state(aenv)
    r = up(aenv.login("mat_view"), "material_rev", "msr-1", files=(PNG,), category="photo")
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {perms.MATERIAL_MANAGE}"
    assert nothing_added(aenv, before)
    c = aenv.login("adm")
    for status in ("Draft", "Submitted", "Approved", "ApprovedWithComments"):
        _rev_state(aenv, status)
        added = up(c, "material_rev", "msr-1", files=(PNG,), category="photo")
        assert added.status_code == 200, (status, added.text)
        assert c.delete(f"/api/files/{added.json()[0]['id']}").status_code == 200
    _rev_state(aenv, "Approved")
    before = state(aenv)
    assert up(c, "material_rev", "msr-1", category="catalogue").status_code == 409        # other evidence: still locked
    assert nothing_added(aenv, before)


# Contractor-scoped accounts on material revisions (spec §9.2, plan A decided 2026-10-08). Every account here holds EVERY material permission.
#   sA — the revision's OWN project and contractor: in scope, so the refusal itself shows (403) on every endpoint.
#   sV, sB — another contractor (and project): upload and list check the permission first (403); the id / path endpoints check
#            "exists and in scope" first and answer 404, which hides whether the id exists — the existing attachment-API rule.
VENDOR_REFUSAL = "Not available to contractor-scoped accounts."
VENDOR_CASES = {
    #           upload,                     by-entity,                  metadata,                         delete,                           download
    "sA": {"upload": (403, VENDOR_REFUSAL), "list": (403, VENDOR_REFUSAL), "metadata": (403, VENDOR_REFUSAL), "delete": (403, VENDOR_REFUSAL), "download": (403, VENDOR_REFUSAL)},
    "sV": {"upload": (403, VENDOR_REFUSAL), "list": (403, VENDOR_REFUSAL), "metadata": (404, "Attachment not found"), "delete": (404, "Attachment not found"), "download": (404, "File not found")},
    "sB": {"upload": (403, VENDOR_REFUSAL), "list": (403, VENDOR_REFUSAL), "metadata": (404, "Attachment not found"), "delete": (404, "Attachment not found"), "download": (404, "File not found")},
}


@pytest.mark.parametrize("endpoint", ["upload", "list", "metadata", "delete", "download"])
@pytest.mark.parametrize("who", sorted(VENDOR_CASES))
def test_contractor_scoped_accounts_cannot_reach_material_revision_attachments(aenv, who, endpoint):
    """One endpoint per case, so a failure on one cannot hide the others. Exact status and detail per case (no "403 or 404")."""
    fid, path = _seed_file(aenv, "material_rev")
    c = aenv.login(who)
    before = state(aenv)
    r = {"upload": lambda: up(c, "material_rev", "msr-1"),
         "list": lambda: c.get("/api/files/by-entity", params={"entity_type": "material_rev", "entity_id": "msr-1"}),
         "metadata": lambda: c.get(f"/api/files/{fid}"),
         "delete": lambda: c.delete(f"/api/files/{fid}"),
         "download": lambda: c.get(f"/api/files/download/{path}")}[endpoint]()
    code, detail = VENDOR_CASES[who][endpoint]
    assert (r.status_code, r.json()["detail"]) == (code, detail), r.text
    assert nothing_added(aenv, before)                       # no row added / flagged deleted, no file added / removed
    if endpoint == "delete":
        db = aenv.Session()
        try:
            att = db.get(models.Attachment, fid)
            assert att is not None and att.is_deleted is False
        finally:
            db.close()
        assert (aenv.root / path).is_file()
        assert aenv.login("adm").get(f"/api/files/download/{path}").content == b"seed-bytes"


def test_a_contractor_account_in_scope_still_reaches_its_other_attachment_types(aenv):
    """The refusal is specific to material revisions: the same account (sA, P-A / C1) keeps its NCR attachments as before."""
    assert up(aenv.login("sA"), "ncr", "ncr-a").status_code == 200
