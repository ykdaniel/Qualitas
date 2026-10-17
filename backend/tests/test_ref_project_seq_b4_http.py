"""REF-PROJECT-SEQ-2026-001 batch 4 — the loose ends of per-project numbering (B3 R1 P3-1 / P3-7 / P3-9 / P3-10, the
naming-rules second review's (1); decisions D-B4-1..3 of 2026-10-17).

* Without a project only a shared ITP / Checklist template is numbered (STD); any other type, Q-WorkFlow included, is
  refused (400 NUMBERING_PROJECT_REQUIRED) before a number is drawn — so deriving an NCR or a re-inspection from an ITR
  that belongs to no project is refused too.
* The start-up Q-WorkFlow back-fill numbers a project's NOI on the project's counter and records the project; only a
  NOI without a project gets the next global Q-WorkFlow-######. A project that cannot number yet does not stop the rest.
* A project created or recoded with a code equal to an old contractor abbreviation continues that abbreviation's
  counters (only ever upward), so no number the abbreviation already used is handed out again.
* The project id "STD" is refused; a chosen id is otherwise kept.
* crud.py no longer carries the old per-contractor numbering; the renumber-map export is read-only.
Real logins and routes on the batch-3 fixture (two projects PA / PB with codes, PN without one).
"""
import csv
import hashlib
import importlib.util
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from test_ref_project_seq_b3_http import env_engine, env, _add, _scalar, _ncr, _noi, _code   # noqa: F401  (fixtures)


def _counters(env, project_id):
    db = env.Session()
    try:
        return {s.doc: s.last_seq for s in db.query(models.ReferenceSequence)
                .filter_by(project=project_id, vendor="*").all()}
    finally:
        db.close()


def _qworkflows(env):
    db = env.Session()
    try:
        return {q.noi_id: (q.referenceNo, q.project_id) for q in db.query(models.QWorkflow).all()}
    finally:
        db.close()


def _plain_noi(noi_id, project_id):
    return models.NOI(id=noi_id, referenceNo=f"N-{noi_id}", project_id=project_id, vendor_id="V1", status="Open",
                      package="p", issueDate="2026-10-01", inspectionDate="2026-10-02", inspectionTime="09:00", type="R")


# ══ numbering without a project ══════════════════════════════════════════════════════════════════════

def test_numbering_without_a_project_is_refused_except_for_shared_templates():
    from database import Base
    from core.refusals import RefusalHTTPException
    from core.utils import generate_reference_no, preview_reference_no
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        assert generate_reference_no(db, "", "ITP", project_id=None) == "QTS-RKS-STD-ITP-000001"
        assert generate_reference_no(db, "", "CHECKLIST", project_id=None) == "QTS-RKS-STD-CHK-000001"
        for doc in ("NOI", "ITR", "NCR", "OBS", "PQP", "FOLLOWUP", "AUDIT", "OSD", "MEETING", "MSA", "QWORKFLOW", "ncr"):
            with pytest.raises(RefusalHTTPException) as exc:
                generate_reference_no(db, "", doc, project_id=None)
            assert (exc.value.status_code, exc.value.code) == (400, "NUMBERING_PROJECT_REQUIRED"), doc
            assert exc.value.params == {"docType": {"NCR": "NCR", "ncr": "NCR", "FOLLOWUP": "FUI", "AUDIT": "AUD",
                                                    "CHECKLIST": "CHK", "MEETING": "MOM"}.get(doc, doc)}
        with pytest.raises(RefusalHTTPException):
            preview_reference_no(db, "NCR", None)
        assert db.query(models.ReferenceSequence).count() == 2            # only the two template counters were ever written
    finally:
        db.close()
        engine.dispose()


def test_deriving_from_an_itr_that_belongs_to_no_project_is_refused_before_a_number_is_drawn(env):
    # a failed ITR (the state an NCR / re-inspection is derived from) that belongs to no project
    _add(env, models.ITR(id="itr-none", documentNumber="ITR-NONE", vendor_id="V1", status="Reject", inspectionResult="Fail",
                         description="d", rev="Rev1.0", submit=""))
    boss = env.login("boss")
    for path in ("/api/itr/itr-none/create-ncr", "/api/itr/itr-none/re-inspect"):
        r = boss.post(path)
        assert (r.status_code, _code(r)) == (400, "NUMBERING_PROJECT_REQUIRED"), (path, r.text)
    assert _scalar(env, "SELECT COUNT(*) FROM ncr") == 0
    assert _scalar(env, "SELECT COUNT(*) FROM itr") == 1
    assert _scalar(env, "SELECT COUNT(*) FROM reference_sequences") == 0


# ══ the Q-WorkFlow back-fill ═════════════════════════════════════════════════════════════════════════

def test_the_backfill_numbers_a_projects_noi_on_its_counter_and_a_legacy_noi_globally(env):
    import db_migrations
    _add(env, _plain_noi("n-pa", "PA"), _plain_noi("n-pb", "PB"), _plain_noi("n-old", None), _plain_noi("n-has", "PA"),
         models.QWorkflow(id="q-has", referenceNo="Q-WorkFlow-000007", noi_id="n-has", project_id="PA",
                          createdAt="2026-01-01T00:00:00+00:00"))
    db_migrations._backfill_qworkflows()
    db_migrations._backfill_qworkflows()                               # a second start changes nothing
    assert _qworkflows(env) == {
        "n-pa": ("Q-WorkFlow-PA-000001", "PA"),                        # the project's counter, project recorded
        "n-pb": ("Q-WorkFlow-PB-000001", "PB"),
        "n-old": ("Q-WorkFlow-000008", None),                          # no project: next global number
        "n-has": ("Q-WorkFlow-000007", "PA"),                          # an existing row is never touched
    }
    r = env.login("boss").post("/api/noi/", json=_noi(project_id="PA"))
    assert r.status_code == 200, r.text
    assert _scalar(env, "SELECT referenceNo FROM qworkflow WHERE noi_id = :i", i=r.json()["id"]) == "Q-WorkFlow-PA-000002"


def test_a_project_that_cannot_number_yet_does_not_stop_the_backfill_for_the_others(env):
    import db_migrations
    _add(env, _plain_noi("n-pn", "PN"), _plain_noi("n-pa", "PA"))      # PN has no project code (fixture)
    db_migrations._backfill_qworkflows()
    db_migrations._backfill_qworkflows()
    assert _qworkflows(env) == {"n-pa": ("Q-WorkFlow-PA-000001", "PA")}   # PN's NOI waits, PA's is done
    assert env.login("boss").put("/api/projects/PN", json={"code": "PN"}).status_code == 200
    db_migrations._backfill_qworkflows()                               # the next start completes it
    assert _qworkflows(env)["n-pn"] == ("Q-WorkFlow-PN-000001", "PN")


# ══ a code equal to an old contractor abbreviation ═══════════════════════════════════════════════════

def test_a_new_project_whose_code_equals_an_old_contractor_abbreviation_continues_its_numbers(env):
    _add(env, models.ReferenceSequence(project="QTS", vendor="zz", doc="NCR", last_seq=41),     # old key (QTS, abbrev, doc)
         models.ReferenceSequence(project="QTS", vendor="ZZ", doc="audit", last_seq=3),
         models.ReferenceSequence(project="QTS", vendor="ZZ", doc="km", last_seq=66))          # KM: not a project-numbered type
    boss = env.login("boss")
    r = boss.post("/api/projects/", json={"name": "Zeta", "code": "zz"})
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    assert _counters(env, pid) == {"NCR": 41, "AUDIT": 3}
    assert boss.post("/api/ncr/", json=_ncr(project_id=pid)).json()["documentNumber"] == "QTS-RKS-ZZ-NCR-000042"


def test_recoding_a_project_continues_the_new_codes_old_numbers_and_only_upward(env):
    _add(env, models.ReferenceSequence(project="PA", vendor="*", doc="NCR", last_seq=50),      # PA already past the old counter
         models.ReferenceSequence(project="QTS", vendor="YY", doc="NCR", last_seq=30),
         models.ReferenceSequence(project="QTS", vendor="YY", doc="OBS", last_seq=4))
    boss = env.login("boss")
    assert boss.put("/api/projects/PA", json={"code": "YY"}).status_code == 200
    assert _counters(env, "PA") == {"NCR": 50, "OBS": 4}                # NCR kept (higher), OBS continued
    assert boss.put("/api/projects/PA", json={"code": "YY", "owner": "x"}).status_code == 200   # the same code again
    assert _counters(env, "PA") == {"NCR": 50, "OBS": 4}
    assert boss.post("/api/ncr/", json=_ncr(project_id="PA")).json()["documentNumber"] == "QTS-RKS-YY-NCR-000051"


# ══ the reserved project id ══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("pid", ["STD", " std "])
def test_a_project_id_of_std_is_refused_a_chosen_id_is_kept(env, pid):
    boss = env.login("boss")
    r = boss.post("/api/projects/", json={"id": pid, "name": f"X{pid.strip()}", "code": "XX"})
    assert (r.status_code, _code(r)) == (400, "PROJECT_ID_RESERVED"), r.text
    assert r.json()["params"] == {"projectId": pid.strip()}
    assert _scalar(env, "SELECT COUNT(*) FROM projects WHERE UPPER(TRIM(id)) = 'STD'") == 0
    r = boss.post("/api/projects/", json={"id": "MY-SITE", "name": "Mine", "code": "MS"})
    assert r.status_code == 200 and r.json()["id"] == "MY-SITE", r.text


# ══ dead code and the export ═════════════════════════════════════════════════════════════════════════

def test_the_old_per_contractor_numbering_is_gone_from_crud():
    import crud
    for name in ("generate_reference_no", "get_contractor_abbreviation", "PROJECT_CODE"):
        assert not hasattr(crud, name), name
    assert hasattr(crud, "create_user") and hasattr(crud, "get_role_by_name")   # what the seeder and auth still use


def test_the_export_script_writes_the_renumber_map_without_touching_the_database(env_engine, tmp_path):
    env, engine = env_engine
    db_path = engine.url.database
    spec = importlib.util.spec_from_file_location(
        "export_itp_renumber_map", Path(__file__).resolve().parents[1] / "scripts/verification/export_itp_renumber_map.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out = tmp_path / "map.csv"
    assert mod.export(db_path, str(out)) == 0                          # nothing renumbered yet: an empty map is reported
    _add(env, models.ItpRenumberMap(itp_id="i2", old_referenceNo="QTS-RKS-HL-ITP-000010",
                                    new_referenceNo="QTS-RKS-STD-ITP-000002", migrated_at="t"),
         models.ItpRenumberMap(itp_id="i1", old_referenceNo=None, new_referenceNo="QTS-RKS-STD-ITP-000001", migrated_at="t"))
    before = hashlib.sha256(Path(db_path).read_bytes()).hexdigest()
    assert mod.export(db_path, str(out)) == 2
    assert hashlib.sha256(Path(db_path).read_bytes()).hexdigest() == before
    with open(out, newline="", encoding="utf-8") as fh:
        rows = list(csv.reader(fh))
    assert rows == [["itp_id", "old_referenceNo", "new_referenceNo", "migrated_at"],
                    ["i1", "", "QTS-RKS-STD-ITP-000001", "t"],
                    ["i2", "QTS-RKS-HL-ITP-000010", "QTS-RKS-STD-ITP-000002", "t"]]
