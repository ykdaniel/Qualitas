"""CHECKLIST-TEMPLATE-CLEAN-2026-001 (BACKLOG #22, user's decision 2026-10-10).

* checklist_service.blank_inspection_detail_data — what a fresh instance (and a cleaned template) keeps from a
  template's detail_data: the item structure and descriptive fields, never one inspection's values.
* db_migrations._clean_legacy_bare_template_results (step 23) — bare templates that still hold results are cleaned
  once, with an audit row each; instances and clean templates are left byte-for-byte alone.

Throwaway database from the suite's db_session fixture; no `main` import, no development database.
"""
import json
from unittest.mock import patch

import db_migrations
import models
from services.checklist_service import blank_inspection_detail_data

HEADER = {"activity": "Stakeout", "location": "Zone A", "stage": "Before", "remarks": "Mark O / X / '/'",
          "inspectionDate": "2024-03-20", "ncrNo": "NCR-9", "reInspectionDate": "2024-04-01", "agreementChecked": False,
          "passCount": 2, "failCount": 1, "itrId": "itr-old", "itrNumber": "QTS-ITR-000002", "recordsNo": "CHK-OLD",
          "noiNumber": "NOI-7", "signatures": {"siteEngineer": "Lin", "constructionLeader": "Wang", "subcontractorRep": ""}}
ITEMS = [{"id": 1, "item": "Level", "criteria": "±5mm", "situation": "Measured 3mm", "result": "O"},
         {"id": 2, "item": "Line", "criteria": "±10mm", "situation": "", "result": "X"}]


def _detail(**over):
    return json.dumps({**HEADER, "items": ITEMS, **over}, ensure_ascii=False)


# ── blank_inspection_detail_data ─────────────────────────────────────────────────────────────────────────────
def test_blank_keeps_structure_and_descriptive_fields_and_clears_one_inspections_values():
    out = json.loads(blank_inspection_detail_data(_detail()))
    assert [(i["id"], i["item"], i["criteria"]) for i in out["items"]] == [(1, "Level", "±5mm"), (2, "Line", "±10mm")]
    assert all(i["situation"] == "" and i["result"] == "" for i in out["items"])
    assert (out["activity"], out["location"], out["stage"], out["remarks"]) == ("Stakeout", "Zone A", "Before", "Mark O / X / '/'")
    assert (out["inspectionDate"], out["ncrNo"], out["reInspectionDate"]) == ("", "", "")
    assert out["agreementChecked"] is True and out["passCount"] == 0 and out["failCount"] == 0
    assert out["signatures"] == {"siteEngineer": "", "constructionLeader": "", "subcontractorRep": ""}
    assert not {"itrId", "itrNumber", "recordsNo", "noiNumber"} & set(out)


def test_blank_adds_nothing_that_was_not_there_and_leaves_odd_values_alone():
    assert json.loads(blank_inspection_detail_data(json.dumps({"items": []}))) == {"items": []}
    for raw in (None, "", "not json", "[1, 2]", "42"):
        assert blank_inspection_detail_data(raw) == raw
    assert json.loads(blank_inspection_detail_data({"inspectionDate": "2024-01-01"})) == {"inspectionDate": ""}


# ── step 23: one-time cleanup of bare templates holding results ──────────────────────────────────────────────
def _row(db, **kw):
    base = dict(status="Ongoing", passCount=0, failCount=0, activity="x", date="2026-10-01")
    db.add(models.Checklist(**{**base, **kw}))
    db.commit()


def _snapshot(db, rid):
    db.expire_all()
    c = db.get(models.Checklist, rid)
    return (c.status, c.passCount, c.failCount, c.itrId, c.itrNumber, c.template_id, c.detail_data)


def _run(db):
    with patch("db_migrations.engine", db.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._clean_legacy_bare_template_results()


def test_only_bare_templates_holding_results_are_cleaned_with_an_audit_row_each(db_session):
    db = db_session
    _row(db, id="t-pass", recordsNo="CHK-000001", status="Pass", passCount=1, detail_data=_detail())       # like production
    _row(db, id="t-desync", recordsNo="CHK-000006", status="Ongoing", itrNumber="QTS-ITR-000001",
         detail_data=_detail(items=[]))                                                                      # ITR ref only
    _row(db, id="t-obs", recordsNo="CHK-OBS", detail_data=json.dumps({"items": [{"id": 1, "item": "a", "criteria": "b",
                                                                                 "situation": "noted", "result": ""}]}))
    _row(db, id="t-clean", recordsNo="CHK-CLEAN", detail_data=_detail(items=[{"id": 1, "item": "a", "criteria": "b",
                                                                              "situation": "", "result": ""}]))
    _row(db, id="i-linked", recordsNo="CHK-INST", status="Pass", passCount=2, itrId="itr-1", itrNumber="QTS-ITR-1",
         template_id="t-clean", detail_data=_detail())
    untouched = {rid: _snapshot(db, rid) for rid in ("t-clean", "i-linked")}

    _run(db)

    for rid in ("t-pass", "t-desync", "t-obs"):
        status, passes, fails, itr_id, itr_no, tpl, detail = _snapshot(db, rid)
        assert (status, passes, fails, itr_id, itr_no, tpl) == ("Ongoing", 0, 0, None, None, None), rid
        d = json.loads(detail)
        assert all(i["result"] == "" and i["situation"] == "" for i in d["items"]), rid
        assert "itrNumber" not in d and d.get("inspectionDate", "") == "", rid
    assert [i["item"] for i in json.loads(_snapshot(db, "t-pass")[6])["items"]] == ["Level", "Line"]   # structure kept
    for rid, before in untouched.items():
        assert _snapshot(db, rid) == before, rid                                    # clean template + instance untouched

    audits = db.query(models.AuditLog).filter_by(action="CLEANUP_TEMPLATE_RESULTS").order_by(models.AuditLog.entity_name).all()
    assert [a.entity_name for a in audits] == ["CHK-000001", "CHK-000006", "CHK-OBS"]
    old = json.loads(audits[0].old_value)
    assert (old["status"], old["passCount"], json.loads(old["detail_data"])["inspectionDate"]) == ("Pass", 1, "2024-03-20")
    assert audits[0].username == "system-migration" and audits[0].entity_type == "Checklist"


def test_cleanup_runs_once(db_session):
    db = db_session
    _row(db, id="t1", recordsNo="CHK-1", status="Pass", passCount=1, detail_data=_detail())
    _run(db)
    _row(db, id="t2", recordsNo="CHK-2", status="Fail", failCount=1, detail_data=_detail())   # appears after the sweep
    before = _snapshot(db, "t2")
    _run(db)
    assert _snapshot(db, "t2") == before                                            # the flag stops a second sweep
    assert db.query(models.AuditLog).filter_by(action="CLEANUP_TEMPLATE_RESULTS").count() == 1
    flags = db.execute(db_migrations.text("SELECT flag_name FROM migration_flags")).fetchall()
    assert (db_migrations.CHECKLIST_TEMPLATE_CLEANUP_FLAG,) in flags


def test_a_failure_writes_nothing_and_the_next_start_retries(db_session):
    db = db_session
    _row(db, id="t1", recordsNo="CHK-1", status="Pass", passCount=1, detail_data=_detail())
    before = _snapshot(db, "t1")
    with patch("services.checklist_service.blank_inspection_detail_data", side_effect=RuntimeError("boom")):
        _run(db)
    assert _snapshot(db, "t1") == before
    assert db.query(models.AuditLog).count() == 0
    assert db.execute(db_migrations.text("SELECT COUNT(*) FROM migration_flags")).scalar() == 0
    _run(db)
    assert _snapshot(db, "t1")[0] == "Ongoing"


# ── link_checklist: a new instance never inherits one inspection's values from its template ──────────────────
def test_linked_instance_starts_blank_and_the_template_is_not_changed(db_session):
    import uuid
    from repositories.itr_repository import ITRRepository
    from services.itr_service import ITRService
    db = db_session
    db.add(models.Contractor(id="vendor-1", name="Acme Co", abbreviation="ACM"))
    db.commit()
    svc = ITRService(ITRRepository(db))
    itr = svc.repo.create(models.ITR(id=uuid.uuid4().hex, vendor_id="vendor-1", documentNumber="ITR-NEW",
                                     status="In Progress", raiseDate="2026-10-10"))
    # a template as the form saves it: header defaults next to blank items (plus stale values a legacy row may hold)
    template_detail = _detail(items=[{"id": 1, "item": "Level", "criteria": "±5mm", "situation": "", "result": ""}])
    _row(db, id="tpl", recordsNo="CHK-TPL", date="2025-01-15", detail_data=template_detail)

    svc.link_checklist(itr.id, "tpl", user_id=1, username="tester")

    inst = db.query(models.Checklist).filter(models.Checklist.template_id == "tpl").one()
    d = json.loads(inst.detail_data)
    assert (inst.status, inst.passCount, inst.failCount, inst.itrId, inst.itrNumber) == ("Ongoing", 0, 0, itr.id, "ITR-NEW")
    assert inst.date == ""                                                  # not the template's date (column shown on the ITR card)
    assert [(i["item"], i["criteria"], i["situation"], i["result"]) for i in d["items"]] == [("Level", "±5mm", "", "")]
    assert (d["inspectionDate"], d["ncrNo"], d["reInspectionDate"], d["agreementChecked"]) == ("", "", "", True)
    assert d["signatures"] == {"siteEngineer": "", "constructionLeader": "", "subcontractorRep": ""}
    assert not {"itrId", "itrNumber", "recordsNo", "noiNumber"} & set(d)                 # stale ITR-000002 etc. gone
    assert (d["activity"], d["location"], d["remarks"]) == ("Stakeout", "Zone A", "Mark O / X / '/'")
    db.expire_all()
    assert db.get(models.Checklist, "tpl").detail_data == template_detail             # the template itself untouched


# ── the start-up seed itself: a fresh database must not get a bare template holding results ─────────────────────
def test_seeded_checklist_is_a_clean_template(db_session, monkeypatch):
    from sqlalchemy.orm import sessionmaker
    import db_seeder
    from services.checklist_service import _touched_fields_carry_results
    monkeypatch.setattr(db_seeder, "SessionLocal", sessionmaker(bind=db_session.get_bind()))
    db_seeder.seed_initial_data()
    db_session.expire_all()
    seeded = db_session.query(models.Checklist).all()
    assert [c.recordsNo for c in seeded] == ["QTS-RKS-HL-CHK-000001"]
    c = seeded[0]
    assert (c.itrId, c.template_id, c.status) == (None, None, "Ongoing")
    assert not _touched_fields_carry_results({"status": c.status, "passCount": c.passCount, "failCount": c.failCount,
                                              "detail_data": c.detail_data})
    assert json.loads(c.detail_data)["inspectionDate"] == "" and "recordsNo" not in json.loads(c.detail_data)
