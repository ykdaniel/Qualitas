"""REF-PROJECT-SEQ-2026-001 batch 2 — every record is created in a project; links stay in one project; shared templates
(business decisions D3, D7, D9, D10, D18; user's decision 2026-10-13: Checklist templates are administrator-only).

* A create names its project — a system administrator too (400 PROJECT_REQUIRED_FOR_CREATE in "All projects"), except an
  ITP an administrator creates in "All projects": that is a shared template.
* Shared templates (an ITP without a project, a bare Checklist template) are visible in every project; only a system
  administrator creates or changes them (403 SHARED_TEMPLATE_ADMIN_ONLY), attachments included.
* A link to another document must stay in the record's project (400 LINK_OTHER_PROJECT); a shared ITP may be cited anywhere.
* A Q-WorkFlow tracker takes its NOI's project. Migration step 26 assigns records created between batch 1 and 2.
Real logins and routes on a throw-away file-backed SQLite; brand-new Sessions for every database assertion.
"""
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm

CODES = [perms.NCR_VIEW, perms.NCR_CREATE, perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.ITP_DELETE,
         perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE, perms.NOI_VIEW, perms.NOI_CREATE,
         perms.ITR_VIEW, perms.ITR_CREATE, perms.FOLLOWUP_VIEW, perms.FOLLOWUP_CREATE, perms.CONTRACTOR_VIEW,
         perms.NCR_UPDATE, perms.ITR_UPDATE, perms.CHECKLIST_DELETE, perms.FOLLOWUP_UPDATE]


def _seed(S):
    db = S()
    try:
        def role(name):
            r = models.Role(name=name)
            r.permissions_rel = [_get_or_create_perm(db, c) for c in CODES]
            db.add(r)
            db.flush()
            return r
        worker, admin = role("Worker"), role("admin")
        db.add_all([models.Project(id="PA", name="Alpha", code="PA"), models.Project(id="PB", name="Beta", code="PB"),
                    models.Contractor(id="V1", name="V One", abbreviation="V1")])
        db.flush()
        for username, r, projects in (("boss", admin, ()), ("solo", worker, ("PA",))):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True, company_name="Co",
                            hashed_password=get_password_hash(PW), role_id=r.id)
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        common = dict(vendor_id="V1", description="d", rev="Rev1.0", submit="s", status="Approved")
        db.add_all([
            models.ITP(id="itp-shared", referenceNo="ITP-SHARED", **common),                     # shared template
            models.ITP(id="itp-a", referenceNo="ITP-A", project_id="PA", **common),
            models.ITP(id="itp-b", referenceNo="ITP-B", project_id="PB", **common),
            models.Checklist(id="chk-template", recordsNo="CHK-TPL", status="Ongoing", date="2026-10-01",
                             activity="a"),                                                      # shared bare template
            models.NOI(id="noi-b", referenceNo="NOI-B", project_id="PB", vendor_id="V1", status="Open", package="p",
                       issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="09:00", type="Rebar"),
        ])
        db.commit()
    finally:
        db.close()


@pytest.fixture
def env(tmp_path):
    from database import Base, get_db
    from core.refusals import RefusalHTTPException, refusal_exception_handler
    from routers import (auth as auth_router, checklist as checklist_router, file_router, followup as followup_router,
                         itp as itp_router, itr as itr_router, ncr as ncr_router, noi as noi_router)
    import database as database_module
    import db_migrations
    import core.security as security_module
    engine = create_engine(f"sqlite:///{tmp_path / 'b2.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(S)
    app = FastAPI()
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)
    for r in (auth_router.router, checklist_router.router, file_router.router, followup_router.router, itp_router.router,
              itr_router.router, ncr_router.router, noi_router.router):
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


def _get(env, model, rid):
    db = env.Session()
    try:
        return db.get(model, rid)
    finally:
        db.close()


def _ncr(**kw):
    return {"description": "d", "rev": "Rev1.0", "submit": "", "status": "Open", "vendor": "V One", "severity": "Minor",
            "raiseDate": "2026-10-05", **kw}


def _noi(**kw):
    return {"package": "p", "issueDate": "2026-10-01", "inspectionTime": "09:00", "itpNo": "ITP-SHARED",
            "inspectionDate": "2026-10-02", "type": "Rebar", "contractor": "V One", "status": "Open", **kw}


def _code(r):
    return r.json().get("code")


# ══ every create names its project ════════════════════════════════════════════════════════════════════

def test_an_admin_in_all_projects_cannot_create_and_one_in_a_project_can(env):
    boss = env.login("boss")
    r = boss.post("/api/ncr/", json=_ncr())
    assert (r.status_code, _code(r)) == (400, "PROJECT_REQUIRED_FOR_CREATE"), r.text
    r = boss.post("/api/ncr/", json=_ncr(project_id="PA"))
    assert r.status_code == 200, r.text
    assert _get(env, models.NCR, r.json()["id"]).project_id == "PA"


def test_a_project_member_creates_in_the_project_it_works_in(env):
    r = env.login("solo").post("/api/ncr/", json=_ncr())
    assert r.status_code == 200, r.text
    assert _get(env, models.NCR, r.json()["id"]).project_id == "PA"


def test_an_itp_an_admin_creates_in_all_projects_is_a_shared_template(env):
    r = env.login("boss").post("/api/itp/", json={"vendor": "V One", "description": "x", "rev": "Rev1.0", "status": "Draft"})
    assert r.status_code == 200, r.text
    assert _get(env, models.ITP, r.json()["id"]).project_id is None
    r = env.login("solo").post("/api/itp/", json={"vendor": "V One", "description": "y", "rev": "Rev1.0", "status": "Draft"})
    assert r.status_code == 200, r.text
    assert _get(env, models.ITP, r.json()["id"]).project_id == "PA"          # a member creates its project's ITP


# ══ shared templates ═════════════════════════════════════════════════════════════════════════════════

def test_shared_templates_are_visible_in_every_project_but_other_projects_items_are_not(env):
    solo = env.login("solo")
    ids = {i["id"] for i in solo.get("/api/itp/", params={"limit": 500}).json()}
    assert {"itp-shared", "itp-a"} <= ids and "itp-b" not in ids
    ids = {i["id"] for i in solo.get("/api/itp/", params={"limit": 500, "project_id": "PA"}).json()}
    assert {"itp-shared", "itp-a"} <= ids and "itp-b" not in ids
    assert solo.get("/api/itp/itp-shared").status_code == 200
    boss_ids = {i["id"] for i in env.login("boss").get("/api/itp/", params={"limit": 500, "project_id": "PB"}).json()}
    assert boss_ids >= {"itp-shared", "itp-b"} and "itp-a" not in boss_ids                  # admin in PB: PB + shared
    templates = {c["id"] for c in solo.get("/api/checklist/").json()}
    assert "chk-template" in templates


def test_only_an_admin_changes_a_shared_itp(env):
    solo = env.login("solo")
    r = solo.put("/api/itp/itp-shared/", json={"description": "edited"})
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text
    r = solo.delete("/api/itp/itp-shared/")
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text
    assert _get(env, models.ITP, "itp-shared").description == "d"
    assert solo.put("/api/itp/itp-a/", json={"description": "own"}).status_code == 200                # its project's ITP: fine
    assert env.login("boss").put("/api/itp/itp-shared/", json={"description": "by admin"}).status_code == 200


def test_only_an_admin_creates_or_changes_a_checklist_template(env):
    solo = env.login("solo")
    r = solo.post("/api/checklist/", json={"activity": "a", "status": "Ongoing", "date": "2026-10-01"})
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text
    r = solo.put("/api/checklist/chk-template/", json={"activity": "edited"})
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text
    r = env.login("boss").post("/api/checklist/", json={"activity": "a", "status": "Ongoing", "date": "2026-10-01",
                                                        "project_id": "PA"})
    assert r.status_code == 200, r.text
    assert _get(env, models.Checklist, r.json()["id"]).project_id is None                    # a template is never a project's


def test_a_contractor_account_sees_shared_templates_naming_no_contractor_or_its_own(env):
    """A shared template naming no contractor is for every contractor; one naming a contractor stays that contractor's."""
    db = env.Session()
    try:
        db.add(models.Contractor(id="V2", name="V Two", abbreviation="V2"))
        db.add(models.Checklist(id="chk-generic", recordsNo="CHK-GEN", status="Ongoing", date="2026-10-01", activity="g"))
        r = db.query(models.Role).filter_by(name="Worker").one()
        u = models.User(username="vendor2", email="vendor2@example.com", is_active=True, company_name="Co",
                        hashed_password=get_password_hash(PW), role_id=r.id, vendor_id="V2")
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="PA"))
        db.commit()
    finally:
        db.close()
    c = env.login("vendor2")
    assert c.get("/api/checklist/chk-generic").status_code == 200          # no contractor named: every contractor
    assert c.get("/api/itp/itp-shared").status_code == 404                 # names contractor V1: not V2's
    assert "chk-generic" in {x["id"] for x in c.get("/api/checklist/").json()}


def test_attachments_of_a_shared_template_are_admin_only(env):
    r = env.login("solo").post("/api/files/upload", data={"entity_type": "itp", "entity_id": "itp-shared", "category": "attachment"},
                               files=[("files", ("a.txt", b"hello", "text/plain"))])
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text


# ══ links stay in one project ═════════════════════════════════════════════════════════════════════

def test_a_noi_may_cite_its_projects_itp_or_a_shared_one_but_not_another_projects(env):
    solo = env.login("solo")
    assert solo.post("/api/noi/", json=_noi(itpNo="ITP-SHARED")).status_code == 200
    assert solo.post("/api/noi/", json=_noi(itpNo="ITP-A")).status_code == 200
    boss = env.login("boss")
    r = boss.post("/api/noi/", json=_noi(itpNo="ITP-B", project_id="PA"))
    assert (r.status_code, _code(r)) == (400, "LINK_OTHER_PROJECT"), r.text
    assert r.json()["params"] == {"docType": "ITP", "number": "ITP-B"}


def test_an_itr_cannot_cite_another_projects_noi(env):
    r = env.login("boss").post("/api/itr/", json={"vendor": "V One", "description": "d", "rev": "Rev1.0", "submit": "",
                                                  "status": "In Progress", "noiNumber": "NOI-B", "project_id": "PA"})
    assert (r.status_code, _code(r)) == (400, "LINK_OTHER_PROJECT"), r.text


def test_a_follow_up_cannot_come_from_another_projects_document(env):
    r = env.login("boss").post("/api/followup/", json={"title": "t", "description": "d", "status": "Open", "sourceModule": "NOI",
                                                       "sourceReferenceNo": "NOI-B", "project_id": "PA",
                                                       "createdAt": "2026-10-05", "updatedAt": "2026-10-05"})
    assert (r.status_code, _code(r)) == (400, "LINK_OTHER_PROJECT"), r.text


def test_a_qworkflow_tracker_takes_its_nois_project(env):
    r = env.login("solo").post("/api/noi/", json=_noi())
    assert r.status_code == 200, r.text
    db = env.Session()
    try:
        (q,) = db.query(models.QWorkflow).filter_by(noi_id=r.json()["id"]).all()
        assert q.project_id == "PA"
    finally:
        db.close()


# ══ migration step 26 ═════════════════════════════════════════════════════════════════════════════

def test_step_26_assigns_records_created_after_step_25_once(env):
    import db_migrations
    db_migrations._create_migration_flags_table()
    db = env.Session()
    try:
        db.query(models.Project).filter_by(id="PB").delete()
        db.query(models.NOI).filter_by(id="noi-b").delete()
        db.query(models.ITP).filter_by(id="itp-b").delete()
        db.add(models.NCR(id="ncr-between", documentNumber="NCR-BETWEEN", status="Open", description="d", rev="R", submit=""))
        db.execute(text("INSERT INTO migration_flags (flag_name, completed_at) VALUES (:f, 'x')"),
                   {"f": db_migrations.PROJECTLESS_RECORDS_FLAG})                      # step 25 already ran (batch 1)
        db.commit()
    finally:
        db.close()
    db_migrations._assign_projectless_records_to_the_only_project()                       # step 25: flagged, nothing
    assert _get(env, models.NCR, "ncr-between").project_id is None
    db_migrations._assign_projectless_records_to_the_only_project(db_migrations.PROJECTLESS_RECORDS_FLAG_B2)
    assert _get(env, models.NCR, "ncr-between").project_id == "PA"
    assert _get(env, models.ITP, "itp-shared").project_id is None                          # shared templates untouched
    assert _get(env, models.Checklist, "chk-template").project_id is None


# ══ R1 follow-ups: links changed on UPDATE, link-checklist, visible ITPs, more shared-template writes ═══════════════════

def _row(env, obj):
    db = env.Session()
    try:
        db.add(obj)
        db.commit()
    finally:
        db.close()


def test_changing_a_link_to_another_projects_document_is_refused_on_update(env):
    _row(env, models.NCR(id="ncr-a", documentNumber="NCR-A", status="Open", description="d", rev="R", submit="", project_id="PA"))
    _row(env, models.ITR(id="itr-b", documentNumber="ITR-B", status="In Progress", description="d", rev="R", submit="",
                         project_id="PB", noiNumber="NOI-B"))
    _row(env, models.FollowUp(id="fu-a", issueNo="FU-A", title="t", description="d", status="Open", project_id="PA",
                              createdAt="2026-10-05", updatedAt="2026-10-05"))
    _row(env, models.Checklist(id="chk-inst-a", recordsNo="CHK-I-A", status="Ongoing", date="2026-10-01", activity="a",
                               project_id="PA", itrId="itr-x", template_id="chk-template"))
    boss = env.login("boss")
    for path, body in (("/api/ncr/ncr-a/", {"itrNumber": "ITR-B"}), ("/api/ncr/ncr-a/", {"noiNumber": "NOI-B"}),
                       ("/api/followup/fu-a", {"sourceModule": "NOI", "sourceReferenceNo": "NOI-B"}),
                       ("/api/checklist/chk-inst-a/", {"itrNumber": "ITR-B"})):
        r = boss.put(path, json=body)
        assert (r.status_code, _code(r)) == (400, "LINK_OTHER_PROJECT"), (path, r.text)


def test_a_project_template_cannot_be_linked_into_another_projects_itr(env):
    _row(env, models.Checklist(id="chk-proj-b", recordsNo="CHK-PB", status="Ongoing", date="2026-10-01", activity="a",
                               project_id="PB"))                                   # a project template made in batch 1
    _row(env, models.ITR(id="itr-a", documentNumber="ITR-A", status="In Progress", description="d", rev="R", submit="",
                         project_id="PA", vendor_id="V1"))
    boss = env.login("boss")
    r = boss.post("/api/itr/itr-a/link-checklist", params={"checklist_id": "chk-proj-b"})
    assert (r.status_code, _code(r)) == (400, "LINK_OTHER_PROJECT"), r.text
    r = boss.post("/api/itr/itr-a/link-checklist", params={"checklist_id": "chk-template"})    # a shared one: fine
    assert r.status_code == 200, r.text


def test_a_noi_cannot_cite_an_itp_its_author_cannot_see(env):
    db = env.Session()
    try:
        db.add(models.Contractor(id="V2", name="V Two", abbreviation="V2"))
        u = models.User(username="vendor2", email="vendor2@example.com", is_active=True, company_name="Co",
                        hashed_password=get_password_hash(PW), role_id=db.query(models.Role).filter_by(name="Worker").one().id,
                        vendor_id="V2")
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="PA"))
        db.commit()
    finally:
        db.close()
    r = env.login("vendor2").post("/api/noi/", json=_noi(itpNo="ITP-SHARED", contractor="V Two"))   # names V1: not V2's
    assert r.status_code == 400 and "ITP" in r.json()["detail"], r.text


def test_every_write_to_a_shared_itp_or_checklist_template_is_admin_only(env):
    solo = env.login("solo")
    r = solo.put("/api/itp/itp-shared/detail", json={"a": [], "b": [], "c": [], "checklist": []})
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text
    r = solo.delete("/api/checklist/chk-template/")
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text
    up = env.login("boss").post("/api/files/upload", data={"entity_type": "itp", "entity_id": "itp-shared", "category": "attachment"},
                                files=[("files", ("a.txt", b"hello", "text/plain"))])
    assert up.status_code == 200, up.text
    r = solo.delete(f"/api/files/{up.json()[0]['id']}")
    assert (r.status_code, _code(r)) == (403, "SHARED_TEMPLATE_ADMIN_ONLY"), r.text


def test_a_checklist_instance_without_a_project_is_not_a_shared_template(env):
    _row(env, models.Checklist(id="chk-orphan", recordsNo="CHK-ORPHAN", status="Ongoing", date="2026-10-01", activity="a",
                               itrId="itr-x"))                                     # no project, but an ITR instance
    solo = env.login("solo")
    assert solo.get("/api/checklist/chk-orphan").status_code == 404
    assert "chk-orphan" not in {c["id"] for c in solo.get("/api/checklist/", params={"include_instances": True}).json()}


def test_an_empty_project_on_an_admins_itp_means_shared(env):
    r = env.login("boss").post("/api/itp/", json={"vendor": "V One", "description": "x", "rev": "Rev1.0", "status": "Draft",
                                                  "project_id": ""})
    assert r.status_code == 200, r.text
    assert _get(env, models.ITP, r.json()["id"]).project_id is None
