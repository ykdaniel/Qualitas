"""ITP-VP-CODES-2026-001 (user's decision 2026-10-17: "Q 清成空白").

db_migrations._clear_itp_vp_q (step 30) — every VP cell holding "Q" in an ITP inspection plan becomes empty, once, with
one audit row per changed ITP; every other value, key and ITP is left byte-for-byte alone.

Throwaway database from the suite's db_session fixture; no `main` import, no development database.
"""
import json
from unittest.mock import patch

from sqlalchemy import text

import db_migrations
import models


def _item(item_id, sub, teco, employer, hse, **extra):
    return {"id": item_id, "activity": {"en": f"Activity {item_id}", "ch": "項目"},
            "vp": {"sub": sub, "teco": teco, "employer": employer, "hse": hse}, **extra}


def _itp(db, itp_id, detail):
    raw = detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)
    db.add(models.ITP(id=itp_id, referenceNo=f"QTS-RKS-STD-ITP-{itp_id}", description=itp_id, status="Pending",
                      hasDetails=True, detail_data=raw))
    db.commit()


def _detail(db, itp_id):
    db.expire_all()
    return db.get(models.ITP, itp_id).detail_data


def _run(db):
    with patch("db_migrations.engine", db.get_bind()):
        db_migrations._create_migration_flags_table()
        db_migrations._clear_itp_vp_q()


def _audits(db):
    return db.execute(text("SELECT entity_id, entity_name, old_value, new_value FROM audit_logs "
                           "WHERE action = 'CLEAR_VP_Q' ORDER BY entity_id")).fetchall()


def test_only_q_cells_are_cleared_and_everything_else_is_kept(db_session):
    db = db_session
    _itp(db, "with-q", {
        "a": [_item("A1", "Q", "W/R", "I", "■"), _item("A2", " q ", "H", "-", "N/A", record="CHK-1")],
        "b": [_item("B1", "H", "Q", "□", "※")],
        "c": [_item("C1", "", "R", "W", "Q")],
        "checklist": [{"vp": {"sub": "Q"}}],                        # not an inspection-plan phase: left alone
        "self_inspection": None,
    })
    clean_raw = json.dumps({"a": [_item("A1", "H", "W", "R", "-")], "b": [], "c": []})
    _itp(db, "no-q", clean_raw)
    _itp(db, "not-json", "{not json Q")
    _itp(db, "odd-shape", json.dumps({"a": [{"id": "A1", "vp": "Q"}, "Q", {"id": "A2"}], "b": "Q"}))
    odd_raw = _detail(db, "odd-shape")

    _run(db)

    out = json.loads(_detail(db, "with-q"))
    assert out["a"][0]["vp"] == {"sub": "", "teco": "W/R", "employer": "I", "hse": "■"}
    assert out["a"][1]["vp"] == {"sub": "", "teco": "H", "employer": "-", "hse": "N/A"}
    assert out["a"][1]["record"] == "CHK-1" and out["a"][0]["activity"] == {"en": "Activity A1", "ch": "項目"}
    assert out["b"][0]["vp"] == {"sub": "H", "teco": "", "employer": "□", "hse": "※"}
    assert out["c"][0]["vp"] == {"sub": "", "teco": "R", "employer": "W", "hse": ""}
    assert out["checklist"] == [{"vp": {"sub": "Q"}}] and out["self_inspection"] is None
    # ITPs without a Q in a / b / c are not rewritten at all
    assert _detail(db, "no-q") == clean_raw
    assert _detail(db, "not-json") == "{not json Q"
    assert _detail(db, "odd-shape") == odd_raw

    rows = _audits(db)
    assert [(r[0], r[1]) for r in rows] == [("with-q", "QTS-RKS-STD-ITP-with-q")]
    old, new = json.loads(rows[0][2]), json.loads(rows[0][3])
    assert old["vp_value"] == "Q" and old["cells"] == 4 and new == {"vp_value": "", "cells": 4}
    assert {(c["phase"], c["id"], c["role"]) for c in old["cell_list"]} == {
        ("a", "A1", "sub"), ("a", "A2", "sub"), ("b", "B1", "teco"), ("c", "C1", "hse")}
    assert db.execute(text("SELECT 1 FROM migration_flags WHERE flag_name = :f"),
                      {"f": db_migrations.ITP_VP_Q_CLEAR_FLAG}).first() is not None


def test_a_second_start_changes_nothing_and_writes_no_second_audit_row(db_session):
    db = db_session
    _itp(db, "with-q", {"a": [_item("A1", "Q", "H", "W", "-")], "b": [], "c": []})
    _run(db)
    after_first = _detail(db, "with-q")
    # a Q added after the step ran is not touched again: the step runs once
    data = json.loads(after_first)
    data["a"][0]["vp"]["teco"] = "Q"
    db.get(models.ITP, "with-q").detail_data = json.dumps(data)
    db.commit()

    _run(db)

    assert json.loads(_detail(db, "with-q"))["a"][0]["vp"] == {"sub": "", "teco": "Q", "employer": "W", "hse": "-"}
    assert len(_audits(db)) == 1


def test_nothing_to_clear_still_marks_the_step_done(db_session):
    db = db_session
    _itp(db, "no-q", {"a": [_item("A1", "H", "W", "R", "N/A")], "b": [], "c": []})
    _run(db)
    assert _audits(db) == []
    assert db.execute(text("SELECT 1 FROM migration_flags WHERE flag_name = :f"),
                      {"f": db_migrations.ITP_VP_Q_CLEAR_FLAG}).first() is not None
