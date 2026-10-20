"""REF-PROJECT-SEQ-2026-001 batch 3 — numbers carry the project (business decisions D2, D11, D14, D17, D21; DECISIONS item
8 and 11; the naming rules session's items 1-3; the ITR module session's numbering race).

* Format QTS-RKS-<project code>-<TYPE>-######, one counter per (project, type) for every contractor; shared templates
  (an ITP / Checklist template without a project) use STD. A number that already exists under the same prefix is
  continued, never handed out again; a project code change continues the project's counter.
* Project codes: required, 2-8 letters or digits, upper case, unique, STD reserved; a project without a code numbers
  nothing (400 PROJECT_CODE_MISSING).
* Naming rules: [PROJECT] required, [ABBREV] refused, KM exempt; migration step 29 rewrites the old rules, fills in the
  missing ones (with audit rows) and starts a project's counter after the old contractor counter of the same text.
* Migration step 27: shared ITPs the system numbered become QTS-RKS-STD-ITP-, their references follow, the map and
  audit rows are written, content is untouched; external numbers are kept and copied to external_doc_no only when empty.
* Q-WorkFlow-<code>-######; GET /noi/next-reference is per project and shown in full.
* Creates that take a number hold the write lock first: two creators racing never collide (ITR, Follow-up, Meeting
  minutes, Checklist).
Real logins and routes on a throw-away file-backed SQLite; brand-new Sessions for every database assertion.
"""
import hashlib
import json

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from test_itr_approval_events_http import _Window, _run_pair
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm

CODES = [perms.NCR_VIEW, perms.NCR_CREATE, perms.ITP_VIEW, perms.ITP_CREATE, perms.ITP_UPDATE, perms.CHECKLIST_VIEW,
         perms.CHECKLIST_CREATE, perms.NOI_VIEW, perms.NOI_CREATE, perms.ITR_VIEW, perms.ITR_CREATE, perms.FOLLOWUP_VIEW,
         perms.FOLLOWUP_CREATE, perms.CONTRACTOR_VIEW, perms.CONTRACTOR_MANAGE, perms.MEETING_VIEW, perms.MEETING_CREATE,
         perms.MEETING_DELETE,
         "settings:manage:all"]


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
                    models.Project(id="PN", name="No code yet", code=""),   # code="": really no code (see conftest)
                    models.Contractor(id="V1", name="V One", abbreviation="V1")])
        db.flush()
        for username, r, projects in (("boss", admin, ()), ("solo", worker, ("PA",)), ("nocode", worker, ("PN",))):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True, company_name="Co",
                            hashed_password=get_password_hash(PW), role_id=r.id)
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        db.add(models.ITP(id="itp-shared", referenceNo="ITP-SHARED", vendor_id="V1", description="d", rev="Rev1.0",
                          submit="s", status="Approved"))                    # a shared template every NOI may cite
        db.commit()
    finally:
        db.close()


@pytest.fixture
def env_engine(tmp_path):
    from database import Base, get_db
    from core.refusals import RefusalHTTPException, refusal_exception_handler
    from routers import (auth as auth_router, checklist as checklist_router, followup as followup_router,
                         itp as itp_router, itr as itr_router, meeting_minutes as meeting_router, ncr as ncr_router,
                         noi as noi_router, projects as projects_router, settings as settings_router)
    import database as database_module
    import db_migrations
    import core.security as security_module
    engine = create_engine(f"sqlite:///{tmp_path / 'b3.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(S)
    app = FastAPI()
    app.add_exception_handler(RefusalHTTPException, refusal_exception_handler)
    for r in (auth_router.router, checklist_router.router, followup_router.router, itp_router.router, itr_router.router,
              meeting_router.router, ncr_router.router, noi_router.router, projects_router.router, settings_router.router):
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
        db_migrations._create_migration_flags_table()
        yield Env(app, S), engine
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def env(env_engine):
    return env_engine[0]


def _ncr(**kw):
    return {"description": "d", "rev": "Rev1.0", "submit": "", "status": "Open", "vendor": "V One", "severity": "Minor",
            "raiseDate": "2026-10-05", **kw}


def _noi(**kw):
    return {"package": "p", "issueDate": "2026-10-01", "inspectionTime": "09:00", "inspectionDate": "2026-10-02",
            "type": "Rebar", "contractor": "V One", "status": "Open", "itpNo": "ITP-SHARED", **kw}


def _itp(**kw):
    return {"vendor": "V One", "description": "x", "rev": "Rev1.0", "status": "Draft", **kw}


def _code(r):
    return r.json().get("code")


def _add(env, *rows):
    db = env.Session()
    try:
        db.add_all(rows)
        db.commit()
    finally:
        db.close()


def _scalar(env, sql, **params):
    db = env.Session()
    try:
        return db.execute(text(sql), params).scalar()
    finally:
        db.close()


# ══ the number format ═══════════════════════════════════════════════════════════════════════════════

def test_each_project_numbers_from_1_and_two_projects_never_collide(env):
    boss = env.login("boss")
    a1 = boss.post("/api/ncr/", json=_ncr(project_id="PA")).json()["documentNumber"]
    b1 = boss.post("/api/ncr/", json=_ncr(project_id="PB")).json()["documentNumber"]
    a2 = env.login("solo").post("/api/ncr/", json=_ncr()).json()["documentNumber"]
    assert (a1, b1, a2) == ("QTS-RKS-PA-NCR-000001", "QTS-RKS-PB-NCR-000001", "QTS-RKS-PA-NCR-000002")


def test_the_contractor_is_no_longer_part_of_the_number_or_of_the_counter(env):
    _add(env, models.Contractor(id="V2", name="V Two", abbreviation="V2"))
    solo = env.login("solo")
    refs = [solo.post("/api/ncr/", json=_ncr(vendor=v)).json()["documentNumber"] for v in ("V One", "V Two", "V One")]
    assert refs == ["QTS-RKS-PA-NCR-000001", "QTS-RKS-PA-NCR-000002", "QTS-RKS-PA-NCR-000003"]


def test_a_number_that_already_exists_under_the_same_prefix_is_continued(env):
    """Old numbers of a contractor whose abbreviation is the project code (contractor HL / project HL) have the same text."""
    _add(env, models.NCR(id="old-7", documentNumber="QTS-RKS-PA-NCR-000007", project_id="PA", vendor_id="V1",
                         status="Open", description="old"))
    r = env.login("solo").post("/api/ncr/", json=_ncr())
    assert r.json()["documentNumber"] == "QTS-RKS-PA-NCR-000008", r.text


def test_shared_templates_are_numbered_std(env):
    boss = env.login("boss")
    r = boss.post("/api/itp/", json=_itp())                                    # "All projects": a shared template
    assert r.json()["referenceNo"] == "QTS-RKS-STD-ITP-000001", r.text
    r = boss.post("/api/checklist/", json={"activity": "a", "status": "Ongoing", "date": "2026-10-01"})
    assert r.json()["recordsNo"] == "QTS-RKS-STD-CHK-000001", r.text
    r = env.login("solo").post("/api/itp/", json=_itp())                       # a member's ITP is its project's
    assert r.json()["referenceNo"] == "QTS-RKS-PA-ITP-000001", r.text


def test_a_project_code_change_continues_the_projects_counter(env):
    boss = env.login("boss")
    assert boss.post("/api/ncr/", json=_ncr(project_id="PA")).json()["documentNumber"] == "QTS-RKS-PA-NCR-000001"
    r = boss.put("/api/projects/PA", json={"code": "px"})
    assert r.status_code == 200 and r.json()["code"] == "PX", r.text
    assert boss.post("/api/ncr/", json=_ncr(project_id="PA")).json()["documentNumber"] == "QTS-RKS-PX-NCR-000002"


def test_a_project_without_a_code_numbers_nothing(env):
    r = env.login("nocode").post("/api/ncr/", json=_ncr())
    assert (r.status_code, _code(r)) == (400, "PROJECT_CODE_MISSING"), r.text
    assert _scalar(env, "SELECT COUNT(*) FROM ncr") == 0


def test_two_creates_in_one_transaction_get_distinct_numbers_for_every_type():
    """generate_reference_no called twice before a commit (e.g. an ITR and its checklists) never repeats a number."""
    from database import Base
    from core.utils import generate_reference_no
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        db.add(models.Project(id="P", name="P", code="HL"))
        db.flush()
        for doc in ("ITP", "NOI", "ITR", "NCR", "OBS", "PQP", "FOLLOWUP", "AUDIT", "CHECKLIST", "OSD", "MEETING", "MSA",
                    "QWORKFLOW"):
            first = generate_reference_no(db, "", doc, project_id="P")
            second = generate_reference_no(db, "", doc, project_id="P")
            assert first != second and first[-6:] == "000001" and second[-6:] == "000002", (doc, first, second)
        assert generate_reference_no(db, "", "meeting", project_id="P").endswith("000003")   # one counter whatever the case
        with pytest.raises(TypeError):
            generate_reference_no(db, "", "NCR")                                    # the project must be named
    finally:
        db.close()
        engine.dispose()


# ══ project codes ════════════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("code, refusal", [
    ("", "PROJECT_CODE_REQUIRED"), ("  ", "PROJECT_CODE_REQUIRED"), (None, "PROJECT_CODE_REQUIRED"),
    ("A", "PROJECT_CODE_INVALID"), ("TOOLONGCODE", "PROJECT_CODE_INVALID"), ("H-L", "PROJECT_CODE_INVALID"),
    ("std", "PROJECT_CODE_RESERVED"), ("pa", "PROJECT_CODE_DUPLICATE"),
])
def test_a_project_code_is_required_well_formed_unique_and_never_std(env, code, refusal):
    boss = env.login("boss")
    r = boss.post("/api/projects/", json={"name": "Gamma", "code": code})
    assert (r.status_code, _code(r)) == (400, refusal), r.text
    r = boss.put("/api/projects/PB", json={"code": code})
    assert (r.status_code, _code(r)) == (400, refusal), r.text
    assert _scalar(env, "SELECT code FROM projects WHERE id = 'PB'") == "PB"


def test_a_project_code_is_stored_upper_case_and_another_field_can_change_without_it(env):
    boss = env.login("boss")
    r = boss.post("/api/projects/", json={"name": "Gamma", "code": " gm2 "})
    assert r.status_code == 200 and r.json()["code"] == "GM2", r.text
    assert boss.put("/api/projects/PN", json={"description": "still no code"}).status_code == 200   # code not touched


def test_losing_a_race_for_the_same_code_is_the_same_coded_400_not_a_500():
    """Two administrators saving the same code at once: the loser hits the unique index (step 28) — R1 P3-4."""
    from sqlalchemy.exc import IntegrityError
    from core.refusals import Refusal
    from services.project_service import _code_clash
    err = IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: index 'ux_projects_code_upper'"))
    refusal = _code_clash(err, " ab ")
    assert isinstance(refusal, Refusal) and (refusal.code, refusal.params) == ("PROJECT_CODE_DUPLICATE", {"projectCode": "AB"})
    # REFUSAL-DIALOG-2026-003 (by design, not loosened): a duplicate project NAME is now its own coded 400 too (it used to be a 500)
    name_clash = IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: projects.name"))
    by_name = _code_clash(name_clash, "AB", "Tower")
    assert isinstance(by_name, Refusal) and (by_name.code, by_name.params) == ("DUPLICATE_NAME", {"docType": "project", "name": "Tower"})
    assert str(by_name) == "A project named 'Tower' already exists."
    other = IntegrityError("INSERT", {}, Exception("UNIQUE constraint failed: projects.id"))
    assert _code_clash(other, "AB", "Tower") is other                          # anything else is left as it was


def test_the_unique_project_code_index_ignores_case(env_engine):
    import db_migrations
    env, engine = env_engine
    db_migrations._create_unique_project_code_index()
    with pytest.raises(Exception):
        _add(env, models.Project(id="PC", name="Gamma", code="pa"))


# ══ naming rules ═════════════════════════════════════════════════════════════════════════════════════

def _rules(env, rules):
    return env.login("boss").put("/api/settings/naming-rules", json=rules)


def test_a_naming_rule_needs_project_and_refuses_abbrev_km_is_exempt(env):
    r = _rules(env, [{"doc_type": "ncr", "prefix": "QTS-RKS-NCR-", "sequence_digits": 6}])
    assert r.status_code == 400 and "[PROJECT]" in r.json()["detail"], r.text
    r = _rules(env, [{"doc_type": "ncr", "prefix": "QTS-[ABBREV]-[PROJECT]-NCR-", "sequence_digits": 6}])
    assert r.status_code == 400 and "[ABBREV]" in r.json()["detail"], r.text
    assert _rules(env, [{"doc_type": "km", "prefix": "QTS-KM-", "sequence_digits": 6}]).status_code == 200
    assert _rules(env, [{"doc_type": "ncr", "prefix": "Q-[PROJECT]-NC-", "sequence_digits": 4}]).status_code == 200
    r = env.login("solo").post("/api/ncr/", json=_ncr())
    assert r.json()["documentNumber"] == "Q-PA-NC-0001", r.text                 # the rule is what numbers it


def test_the_default_naming_rules_are_the_project_format():
    from routers.settings import DEFAULT_NAMING_RULES
    assert len(DEFAULT_NAMING_RULES) == 18        # 13 numbered modules + 5 controlled project-document types (KM-DOCS-2026-001 D1)
    assert all(r["prefix"].startswith("QTS-RKS-[PROJECT]-") and "[ABBREV]" not in r["prefix"] for r in DEFAULT_NAMING_RULES)
    assert {r["doc_type"] for r in DEFAULT_NAMING_RULES} >= {"meeting", "msa"}


def test_migration_29_rewrites_old_rules_fills_in_missing_ones_and_continues_old_counters(env):
    import db_migrations
    _add(env, *[models.DocumentNamingRule(doc_type=t, prefix=f"QTS-RKS-[ABBREV]-{label}-", sequence_digits=6)
                for t, label in (("ncr", "NCR"), ("noi", "NOI"), ("followup", "FUI"))],
         models.DocumentNamingRule(doc_type="km", prefix="QTS-KM-", sequence_digits=6),
         # old per-contractor counters: contractor "PA" shares the project's text; contractor V1 does not
         models.ReferenceSequence(project="QTS", vendor="PA", doc="NCR", last_seq=12),
         models.ReferenceSequence(project="QTS", vendor="V1", doc="NOI", last_seq=40),
         models.ReferenceSequence(project="QTS", vendor="PB", doc="followup", last_seq=5))
    db_migrations._naming_rules_to_project_format()
    db = env.Session()
    try:
        rules = {r.doc_type: r.prefix for r in db.query(models.DocumentNamingRule).all()}
        assert rules["ncr"] == "QTS-RKS-[PROJECT]-NCR-" and rules["followup"] == "QTS-RKS-[PROJECT]-FUI-"
        assert rules["km"] == "QTS-KM-"                                         # exempt, untouched
        assert len(rules) == 19 and rules["msa"] == "QTS-RKS-[PROJECT]-MSA-"      # all 13 + km + 5 controlled project-document types (KM-DOCS D1)
        assert rules["plan"] == "QTS-RKS-[PROJECT]-PLN-"
        audits = db.query(models.AuditLog).filter_by(entity_type="NamingRule").all()
        assert {a.entity_id for a in audits if a.action == "UPDATE"} == {"ncr", "noi", "followup"}
        assert json.loads(next(a for a in audits if a.entity_id == "ncr").old_value) == {"prefix": "QTS-RKS-[ABBREV]-NCR-"}
        assert len([a for a in audits if a.action == "CREATE"]) == 15        # 10 missing module rules + 5 controlled project-document types (KM-DOCS D1)
        seq = {(s.project, s.doc): s.last_seq for s in db.query(models.ReferenceSequence).filter_by(vendor="*")}
        assert seq == {("PA", "NCR"): 12, ("PB", "FOLLOWUP"): 5}                  # V1's counter has other text: not carried
    finally:
        db.close()
    assert env.login("solo").post("/api/ncr/", json=_ncr()).json()["documentNumber"] == "QTS-RKS-PA-NCR-000013"
    db_migrations._naming_rules_to_project_format()                             # runs once
    assert _scalar(env, "SELECT COUNT(*) FROM audit_logs WHERE entity_type = 'NamingRule'") == 18        # 3 rewrites + 15 inserts (KM-DOCS D1 added 5 types)


# ══ migration 27: shared ITPs to STD, external numbers kept ════════════════════════════════════════════

def _content_hash(env, itp_id):
    db = env.Session()
    try:
        i = db.get(models.ITP, itp_id)
        return hashlib.sha256(json.dumps([i.description, i.detail_data, i.rev, i.status, i.vendor_id, i.project_id],
                                         ensure_ascii=False).encode()).hexdigest()
    finally:
        db.close()


def test_migration_27_renumbers_system_numbered_shared_itps_and_keeps_external_ones(env):
    import db_migrations
    common = dict(vendor_id="V1", description="d", rev="Rev1.0", submit="s", status="Approved", detail_data="[]")
    _add(env,
         models.ITP(id="q10", referenceNo="QTS-RKS-HL-ITP-000010", **common),
         models.ITP(id="q2", referenceNo="QTS-RKS-HL-ITP-000002", **common),
         models.ITP(id="t1", referenceNo="TEST-1", **common),
         models.ITP(id="none", referenceNo=None, **common),
         models.ITP(id="ext", referenceNo="ABC-ITP-77", **common),
         models.ITP(id="ext-kept", referenceNo="XYZ-1", external_doc_no="ALREADY", **common),
         models.ITP(id="proj", referenceNo="QTS-RKS-PA-ITP-000075", project_id="PA", **common),
         models.NOI(id="n1", referenceNo="N-1", project_id="PA", vendor_id="V1", status="Open", package="p",
                    issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="09:00", type="R",
                    itpNo="QTS-RKS-HL-ITP-000002"),
         models.FollowUp(id="f1", title="t", description="d", status="Open", sourceModule="ITP",
                         sourceReferenceNo="TEST-1", project_id="PA"),
         models.ITR(id="r1", documentNumber="R-1", project_id="PA", vendor_id="V1", status="In Progress",
                    detail_data=json.dumps({"itpNo": "QTS-RKS-HL-ITP-000010", "x": 1})))
    before = {i: _content_hash(env, i) for i in ("q10", "q2", "t1", "none", "ext")}
    db_migrations._renumber_shared_itps_to_std()
    db = env.Session()
    try:
        refs = {i.id: (i.referenceNo, i.external_doc_no) for i in db.query(models.ITP).all()}
        assert refs["q2"] == ("QTS-RKS-STD-ITP-000001", None)                  # QTS- by numeric order, then TEST-, then none
        assert refs["q10"] == ("QTS-RKS-STD-ITP-000002", None)
        assert refs["t1"] == ("QTS-RKS-STD-ITP-000003", None)
        assert refs["none"] == ("QTS-RKS-STD-ITP-000004", None)
        assert refs["ext"] == ("ABC-ITP-77", "ABC-ITP-77")                      # external: kept, copied
        assert refs["ext-kept"] == ("XYZ-1", "ALREADY")                         # never overwritten
        assert refs["proj"] == ("QTS-RKS-PA-ITP-000075", None)                  # a project's ITP is not touched
        assert db.get(models.NOI, "n1").itpNo == "QTS-RKS-STD-ITP-000001"
        assert db.get(models.FollowUp, "f1").sourceReferenceNo == "QTS-RKS-STD-ITP-000003"
        assert json.loads(db.get(models.ITR, "r1").detail_data) == {"itpNo": "QTS-RKS-STD-ITP-000002", "x": 1}
        mapping = {(m.itp_id, m.old_referenceNo, m.new_referenceNo) for m in db.query(models.ItpRenumberMap).all()}
        assert mapping == {("q2", "QTS-RKS-HL-ITP-000002", "QTS-RKS-STD-ITP-000001"),
                           ("q10", "QTS-RKS-HL-ITP-000010", "QTS-RKS-STD-ITP-000002"),
                           ("t1", "TEST-1", "QTS-RKS-STD-ITP-000003"), ("none", None, "QTS-RKS-STD-ITP-000004")}
        actions = [(a.action, a.entity_id) for a in db.query(models.AuditLog).filter_by(entity_type="ITP")]
        assert sorted(actions) == sorted([("RENUMBER_STD", i) for i in ("q2", "q10", "t1", "none")]
                                      + [("COPY_EXTERNAL_DOC_NO", "ext"), ("COPY_EXTERNAL_DOC_NO", "itp-shared")])   # + the seed's
        seq = {(s.project, s.doc): s.last_seq for s in db.query(models.ReferenceSequence).filter_by(vendor="*")}
        assert seq[("STD", "ITP")] == 4 and seq[("PA", "ITP")] == 75             # old project numbers are never reused
    finally:
        db.close()
    assert {i: _content_hash(env, i) for i in before} == before                 # content untouched
    boss = env.login("boss")
    assert boss.post("/api/itp/", json=_itp()).json()["referenceNo"] == "QTS-RKS-STD-ITP-000005"
    assert boss.post("/api/itp/", json=_itp(project_id="PA")).json()["referenceNo"] == "QTS-RKS-PA-ITP-000076"
    db_migrations._renumber_shared_itps_to_std()                                # runs once
    assert _scalar(env, "SELECT COUNT(*) FROM itp_renumber_map") == 4


def test_external_doc_no_is_searchable_and_editable(env):
    boss = env.login("boss")
    r = boss.post("/api/itp/", json=_itp(external_doc_no="  CTR-ITP-9  "))
    itp_id = r.json()["id"]
    assert r.json()["external_doc_no"] == "CTR-ITP-9", r.text
    found = {i["id"] for i in boss.get("/api/itp/", params={"search": "CTR-ITP"}).json()}
    assert found == {itp_id}
    assert boss.put(f"/api/itp/{itp_id}/", json={"external_doc_no": ""}).json()["external_doc_no"] is None


# ══ Q-WorkFlow and the expected NOI number ════════════════════════════════════════════════════════════

def test_qworkflow_is_numbered_per_project_and_old_global_numbers_stay(env):
    _add(env, models.NOI(id="noi-old", referenceNo="QTS-V1-NOI-000001", project_id="PA", vendor_id="V1", status="Open",
                         package="p", issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="09:00", type="R"),
         models.QWorkflow(id="old", referenceNo="Q-WorkFlow-000009", noi_id="noi-old", project_id="PA", createdAt="2026-10-01"))
    boss = env.login("boss")
    for project in ("PA", "PA", "PB"):
        assert boss.post("/api/noi/", json=_noi(project_id=project)).status_code == 200
    db = env.Session()
    try:
        refs = sorted(q.referenceNo for q in db.query(models.QWorkflow).all())
        assert refs == ["Q-WorkFlow-000009", "Q-WorkFlow-PA-000001", "Q-WorkFlow-PA-000002", "Q-WorkFlow-PB-000001"]
    finally:
        db.close()


def test_the_expected_noi_number_is_per_project_and_shown_in_full(env):
    solo = env.login("solo")
    r = solo.get("/api/noi/next-reference")
    assert r.json() == {"referenceNo": "QTS-RKS-PA-NOI-000001", "pattern": "QTS-RKS-PA-NOI-######"}, r.text
    assert solo.post("/api/noi/", json=_noi()).json()["referenceNo"] == "QTS-RKS-PA-NOI-000001"
    assert solo.get("/api/noi/next-reference").json()["referenceNo"] == "QTS-RKS-PA-NOI-000002"
    assert solo.get("/api/noi/next-reference", params={"project_id": "PB"}).status_code == 403   # not its project
    boss = env.login("boss")
    r = boss.get("/api/noi/next-reference")
    assert (r.status_code, _code(r)) == (400, "PROJECT_REQUIRED_FOR_CREATE"), r.text
    assert boss.get("/api/noi/next-reference", params={"project_id": "PB"}).json()["referenceNo"] == "QTS-RKS-PB-NOI-000001"
    assert _scalar(env, "SELECT COUNT(*) FROM reference_sequences WHERE project = 'PB'") == 0      # nothing reserved


# ══ two creators racing never collide ═══════════════════════════════════════════════════════════════════

# The first create is held at the INSERT of its record: its number is already taken (the sequence row written, in the
# same uncommitted transaction). Without the write lock taken BEFORE the sequence is read, the second creator reads the
# old sequence and gets the same number (checked: each of these fails with the lock removed).
_RACES = {
    "itr": ("/api/itr/", {"vendor": "V One", "description": "d", "rev": "Rev1.0", "submit": "", "status": "In Progress"},
            models.ITR, "documentNumber", "insert into itr ("),
    "followup": ("/api/followup/", {"title": "t", "description": "d", "status": "Open", "createdAt": "2026-10-05",
                                    "updatedAt": "2026-10-05"}, models.FollowUp, "issueNo", "insert into followup ("),
    "meeting": ("/api/meeting-minutes/", {"status": "Draft", "title": "Weekly", "vendor": "V One"},
                models.MeetingMinutes, "documentNumber", "insert into meeting_minutes ("),
}


@pytest.mark.parametrize("module", sorted(_RACES))
def test_two_simultaneous_creates_get_distinct_numbers(env_engine, module):
    env, engine = env_engine
    path, body, model, column, needle = _RACES[module]
    a, b = env.login("solo"), env.login("solo")
    window = _Window(engine, needle)
    try:
        out = _run_pair(lambda: a.post(path, json=body).status_code, lambda: b.post(path, json=body).status_code,
                        window=window)
    finally:
        window.close()
    assert window.fired and out == {"first": 200, "second": 200}, out
    db = env.Session()
    try:
        numbers = sorted(getattr(r, column) for r in db.query(model).all())
    finally:
        db.close()
    assert len(numbers) == 2 and numbers[0] != numbers[1] and numbers[0].endswith("000001") and numbers[1].endswith("000002")


def test_two_simultaneous_checklist_templates_get_distinct_numbers(env_engine):
    env, engine = env_engine
    a, b = env.login("boss"), env.login("boss")
    body = {"activity": "a", "status": "Ongoing", "date": "2026-10-01"}
    window = _Window(engine, "insert into checklist (")
    try:
        out = _run_pair(lambda: a.post("/api/checklist/", json=body).status_code,
                        lambda: b.post("/api/checklist/", json=body).status_code, window=window)
    finally:
        window.close()
    assert window.fired and out == {"first": 200, "second": 200}, out
    assert _scalar(env, "SELECT COUNT(DISTINCT recordsNo) FROM checklist") == 2


def test_deleting_a_draft_meeting_is_audited_even_when_its_number_cannot_be_given_back(env):
    """R1 P3-3: the delete commits first; giving the number back is best effort and must not lose the DELETE audit."""
    _add(env, models.MeetingMinutes(id="mm-pn", documentNumber="OLD-MOM-1", project_id="PN", status="Draft", title="t"))
    r = env.login("nocode").delete("/api/meeting-minutes/mm-pn")
    assert r.status_code in (200, 204), r.text
    assert _scalar(env, "SELECT COUNT(*) FROM meeting_minutes WHERE id = 'mm-pn'") == 0
    assert _scalar(env, "SELECT COUNT(*) FROM audit_logs WHERE entity_id = 'mm-pn' AND action = 'DELETE'") == 1


def test_the_seeder_does_not_recreate_a_demo_itp_after_step_27_renumbered_it(env_engine, monkeypatch):
    """Found in the isolated preview: start-up runs the migrations and THEN the seeder, which looks for its demo ITPs by
    their old seed number (QTS-RKS-HL-ITP-000001 / -000002). On a database where those rows already existed (production:
    random ids, HL numbers), step 27 moves them to STD; the seeder must recognise them and not create them again."""
    import db_migrations
    import db_seeder
    env, _ = env_engine
    monkeypatch.setattr(db_seeder, "SessionLocal", env.Session)
    common = dict(vendor_id="V1", description="demo", rev="Rev1.0", submit="", status="Approved")
    _add(env, models.ITP(id="old-rebar", referenceNo="QTS-RKS-HL-ITP-000001", **common),
         models.ITP(id="old-formwork", referenceNo="QTS-RKS-HL-ITP-000002", **common))
    db_migrations._renumber_shared_itps_to_std()
    db_seeder.seed_rebar_itp()
    db_seeder.seed_formwork_itp()
    assert _scalar(env, "SELECT COUNT(*) FROM itp WHERE referenceNo LIKE 'QTS-RKS-HL-ITP-%'") == 0
    assert _scalar(env, "SELECT COUNT(*) FROM itp WHERE id IN ('old-rebar', 'old-formwork') "
                        "AND referenceNo LIKE 'QTS-RKS-STD-ITP-%'") == 2
    assert _scalar(env, "SELECT COUNT(*) FROM itp WHERE id LIKE 'seed-itp-%'") == 0          # nothing created again


def test_on_a_new_database_the_demo_itps_are_shared_templates_numbered_std(env_engine, monkeypatch):
    """Found in the isolated preview (coordination center, 2026-10-14): on a NEW database step 27 runs first (no ITP yet,
    flag set), then the seeder created the demo ITPs under their hard-coded QTS-RKS-HL-ITP- numbers — shared templates
    (no project) outside the STD series, never renumbered later. They are now numbered on the STD counter, keep a fixed
    id, and a second start-up creates nothing."""
    import db_migrations
    import db_seeder
    env, _ = env_engine
    monkeypatch.setattr(db_seeder, "SessionLocal", env.Session)
    db_migrations._renumber_shared_itps_to_std()                       # start-up order: migrations first ...
    db_seeder.seed_rebar_itp()                                         # ... then the seeder
    db_seeder.seed_formwork_itp()
    assert _scalar(env, "SELECT COUNT(*) FROM itp WHERE project_id IS NULL AND referenceNo LIKE 'QTS-RKS-HL-%'") == 0
    db = env.Session()
    try:
        seeded = {i.id: (i.referenceNo, i.project_id) for i in db.query(models.ITP).filter(models.ITP.id.like("seed-itp-%"))}
    finally:
        db.close()
    assert seeded == {"seed-itp-QTS-RKS-HL-ITP-000001": ("QTS-RKS-STD-ITP-000001", None),
                      "seed-itp-QTS-RKS-HL-ITP-000002": ("QTS-RKS-STD-ITP-000002", None)}
    db_seeder.seed_rebar_itp()                                         # the next start-up
    db_seeder.seed_formwork_itp()
    assert _scalar(env, "SELECT COUNT(*) FROM itp") == 3               # the 2 demo ITPs + the fixture's shared ITP
