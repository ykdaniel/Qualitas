"""NCR create / update / closure: the data change and its audit entries are ONE transaction (2026-09-21).

Measured before this change (isolated stack, real uvicorn): 24 NCR writes — creates, updates, a legitimate closure — left NO `NCR` row in
`audit_logs`. The service committed the NCR through the repository first and then only `db.add()`-ed the audit entry with a non-strict
`log_audit`; nothing committed it afterwards, so the session dropped it at the end of the request.

Now: NCR row + reference-number sequence + audit entries are written with flush only and committed ONCE; the audit is strict; any failure — building
the entry, flushing it, or the commit itself — rolls EVERYTHING back (row, close-out fields, sequence, audit). Real logins and routes, brand-new
Sessions for every database assertion.
"""
import json

import pytest
from sqlalchemy import event
from sqlalchemy.orm import Session

import models
from ncr_photos import add_photo
from test_date_write_guard_http import _add_row, _body, _put, _raw, _snapshot, denv  # noqa: F401  (denv is a fixture)

RAISE, DUE = "2025-01-02", "2025-01-16"
CONTENT = dict(productDisposition="Rework", reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1", qtyAffected="1", extent="Isolated", effectivenessVerified="Yes")


def audit(env, action=None, entity_id=None):
    db = env.Session()
    try:
        q = db.query(models.AuditLog).filter(models.AuditLog.entity_type == "NCR")
        if action:
            q = q.filter(models.AuditLog.action == action)
        if entity_id:
            q = q.filter(models.AuditLog.entity_id == entity_id)
        return [dict(id=a.id, action=a.action, entity_id=a.entity_id, entity_name=a.entity_name, user_id=a.user_id, username=a.username, timestamp=a.timestamp,
                     old=json.loads(a.old_value) if a.old_value else None, new=json.loads(a.new_value) if a.new_value else None, reason=a.reason)
                for a in q.order_by(models.AuditLog.id).all()]
    finally:
        db.close()


def uid(env, username):
    db = env.Session()
    try:
        return db.query(models.User).filter_by(username=username).one().id
    finally:
        db.close()


def ready(env, ref="NCR-READY", **cols):
    base = dict(raiseDate=RAISE, dueDate=DUE, severity="Minor", **CONTENT)
    rid = _add_row(env, "ncr", ref, **{**base, **cols})
    add_photo(env, rid)
    return rid


def sequences(env):
    db = env.Session()
    try:
        return sorted((r.project, r.vendor, r.doc, r.current_sequence if hasattr(r, "current_sequence") else getattr(r, "last_number", None)) for r in db.query(models.ReferenceSequence).all())
    finally:
        db.close()


# ══ 1. success: the data and its audit are saved together ═════════════════════════════════════════════════════════════════════════

def test_create_saves_the_ncr_and_one_audit_entry_recording_what_was_stored_and_by_whom(denv):
    c = denv.login("dt_a")
    r = c.post("/api/ncr/", json=_body("ncr", severity="Minor", raiseDate=RAISE, subject="AUDITED", closedBy=999))
    assert r.status_code == 200
    rid, number = r.json()["id"], r.json()["documentNumber"]
    entries = audit(denv, entity_id=rid)
    assert [e["action"] for e in entries] == ["CREATE"]
    e = entries[0]
    assert (e["entity_name"], e["user_id"], e["username"]) == (number, uid(denv, "dt_a"), "dt_a") and e["timestamp"] and e["old"] is None
    assert e["new"]["documentNumber"] == number and e["new"]["subject"] == "AUDITED" and e["new"]["status"] == "Open"
    assert e["new"]["dueDate"] == "2025-01-16"                               # the SLA due date the SERVER filled in is part of what was stored
    assert "closedBy" not in e["new"]                                        # the forged operator was dropped, not recorded as a fact


def test_the_audit_never_holds_file_content_tokens_or_passwords(denv):
    c = denv.login("dt_a")
    blob = "data:image/png;base64," + "QUJD" * 200
    r = c.post("/api/ncr/", json=_body("ncr", raiseDate=RAISE, defectPhotos=[blob], improvementPhotos=[blob]))
    assert r.status_code == 200
    rid = r.json()["id"]
    assert _put(c, "ncr", rid, {"progressPhotos": [blob], "remark": "x"}).status_code == 200
    text = json.dumps(audit(denv, entity_id=rid))
    assert "QUJD" not in text and "base64" not in text
    e = audit(denv, entity_id=rid)
    assert e[0]["new"]["defectPhotos"] == {"items": 1, "content": "not recorded"}
    assert e[1]["new"]["progressPhotos"] == {"items": 1, "content": "not recorded"}
    for word in ("password", "token", "access_token", "csrf"):
        assert word not in text.lower()


def test_an_ordinary_update_records_the_actual_before_and_after_of_the_changed_fields_only(denv):
    rid = ready(denv)
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"remark": "first", "subject": "S1"}).status_code == 200
    (e,) = audit(denv, "UPDATE", rid)
    assert e["old"] == {"remark": None, "subject": None} and e["new"] == {"remark": "first", "subject": "S1"}
    assert (e["user_id"], e["username"]) == (uid(denv, "dt_a"), "dt_a") and e["entity_name"] == "NCR-READY" and e["timestamp"]
    assert audit(denv, "STATUS_CHANGE", rid) == []                            # no status change, no status entry
    n = len(audit(denv))
    assert _put(c, "ncr", rid, {"remark": "first", "subject": "S1"}).status_code == 200                # an unchanged resend
    assert len(audit(denv)) == n                                               # changes nothing, so records nothing


def test_a_due_date_change_and_an_sla_recomputation_are_recorded_with_old_and_new_values(denv):
    rid = ready(denv)
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"dueDate": "2025-02-01"}).status_code == 200
    assert _put(c, "ncr", rid, {"severity": "Major"}).status_code == 200                # the SERVER recomputes the due date: raise + 7
    first, second = audit(denv, "UPDATE", rid)
    assert first["old"] == {"dueDate": DUE} and first["new"] == {"dueDate": "2025-02-01"}
    assert second["old"] == {"severity": "Minor", "dueDate": "2025-02-01"} and second["new"] == {"severity": "Major", "dueDate": "2025-01-09"}


def test_entering_closed_records_the_update_the_status_change_and_the_server_set_operator_and_date(denv):
    rid = ready(denv)
    c = denv.login("dt_a")
    r = _put(c, "ncr", rid, {"status": "Closed", "closedBy": 999, "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"})     # a LATE closure
    assert r.status_code == 200
    (upd,) = audit(denv, "UPDATE", rid)
    (chg,) = audit(denv, "STATUS_CHANGE", rid)
    assert upd["old"]["status"] == "Open" and upd["new"]["status"] == "Closed"
    assert upd["old"]["closedBy"] is None and upd["old"]["closeoutDate"] is None
    assert upd["new"]["closedBy"] == uid(denv, "dt_a") and upd["new"]["closeoutDate"] == "2025-03-01"       # the operator is the login, 999 is nowhere
    assert (chg["old"], chg["new"]) == ({"status": "Open"}, {"status": "Closed"}) and chg["reason"] == "Status changed from 'Open' to 'Closed'"
    assert (chg["user_id"], chg["username"]) == (uid(denv, "dt_a"), "dt_a")
    assert _raw(denv, "ncr", rid, "status", "closedBy", "closeoutDate", "dueDate") == ("Closed", uid(denv, "dt_a"), "2025-03-01", DUE)


def test_leaving_closed_is_recorded_too(denv):
    rid = ready(denv)
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"}).status_code == 200
    assert _put(c, "ncr", rid, {"status": "Open"}).status_code == 200
    changes = [(e["old"], e["new"]) for e in audit(denv, "STATUS_CHANGE", rid)]
    assert changes == [({"status": "Open"}, {"status": "Closed"}), ({"status": "Closed"}, {"status": "Open"})]


# ══ 2. refusals leave no "success" entry ═══════════════════════════════════════════════════════════════════════════════════════════

def test_permission_condition_and_date_refusals_write_no_audit_and_change_nothing(denv):
    rid = ready(denv)
    before = _snapshot(denv)
    n = len(audit(denv))
    assert _put(denv.login("dt_noclose"), "ncr", rid, {"status": "Closed"}).status_code == 403                                 # no close permission
    assert denv.login("dt_a").post("/api/ncr/", json=_body("ncr", status="Closed", raiseDate=RAISE, **CONTENT)).status_code == 400    # born Closed
    bad = ready(denv, ref="NCR-BAD", drawingNo="")
    assert _put(denv.login("dt_a"), "ncr", bad, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE}).status_code == 400   # a condition is missing
    assert _put(denv.login("dt_a"), "ncr", rid, {"status": "Closed", "closeoutDate": "2024-12-01", "raiseDate": RAISE, "dueDate": DUE}).status_code == 422
    assert _put(denv.login("dt_a"), "ncr", rid, {"status": "Closed", "closeoutDate": "2025-03-01", "raiseDate": RAISE, "dueDate": "2025-06-01"}).status_code == 422
    assert len(audit(denv)) == n
    after = _snapshot(denv)
    after["ncr"] = [r for r in after["ncr"] if "NCR-BAD" not in r]; before["ncr"] = [r for r in before["ncr"] if "NCR-BAD" not in r]
    assert after == before


# ══ 3. failure injection: nothing of the write survives ════════════════════════════════════════════════════════════════════════════

def _fail_at_construction(monkeypatch):
    import services.ncr_service as svc
    def boom(*a, **k):
        raise RuntimeError("audit construction failed")
    monkeypatch.setattr(svc, "log_audit", boom)


def _fail_at_audit_object(monkeypatch):
    """The REAL log_audit runs; building the AuditLog row fails inside it. Only `strict=True` lets that failure reach the caller — the default
    swallows it and the write would be saved with no audit entry."""
    import core.utils as utils

    class Broken:
        def __init__(self, *a, **k):
            raise RuntimeError("audit row could not be built")
    monkeypatch.setattr(utils, "AuditLog", Broken)


def _fail_at_flush(monkeypatch):
    def before_flush(session, ctx, instances):
        if any(isinstance(o, models.AuditLog) for o in session.new):
            raise RuntimeError("audit flush failed")
    event.listen(Session, "before_flush", before_flush)
    return lambda: event.remove(Session, "before_flush", before_flush)


def _fail_at_commit(monkeypatch):
    calls = []

    def boom(self):
        calls.append(1)
        raise RuntimeError("commit failed")
    monkeypatch.setattr(Session, "commit", boom)
    return calls


FAILURES = ["construction", "audit-object", "flush", "commit"]


def _inject(kind, monkeypatch):
    if kind == "construction":
        _fail_at_construction(monkeypatch)
        return lambda: None
    if kind == "audit-object":
        _fail_at_audit_object(monkeypatch)
        return lambda: None
    if kind == "flush":
        return _fail_at_flush(monkeypatch)
    _fail_at_commit(monkeypatch)
    return lambda: None


@pytest.mark.parametrize("kind", FAILURES)
def test_a_failing_audit_or_commit_rolls_a_CREATE_back_completely_row_number_and_audit(denv, monkeypatch, kind):
    c = denv.login("dt_a")
    first = c.post("/api/ncr/", json=_body("ncr", raiseDate=RAISE, subject="FIRST"))
    assert first.status_code == 200
    before, seq = _snapshot(denv), sequences(denv)
    n_audit = len(audit(denv))
    undo = _inject(kind, monkeypatch)
    try:
        with pytest.raises(RuntimeError):
            c.post("/api/ncr/", json=_body("ncr", raiseDate=RAISE, subject="DOOMED"))
    finally:
        undo()
        monkeypatch.undo()
    assert _snapshot(denv) == before and sequences(denv) == seq and len(audit(denv)) == n_audit           # no row, no number burned, no audit
    ok = c.post("/api/ncr/", json=_body("ncr", raiseDate=RAISE, subject="SECOND"))
    assert ok.status_code == 200
    assert int(ok.json()["documentNumber"].rsplit("-", 1)[1]) == int(first.json()["documentNumber"].rsplit("-", 1)[1]) + 1      # the failed create left no gap


@pytest.mark.parametrize("kind", FAILURES)
def test_a_failing_audit_or_commit_rolls_a_CLOSURE_back_completely_status_operator_dates_and_audit(denv, monkeypatch, kind):
    rid = ready(denv)
    c = denv.login("dt_a")
    before, n_audit = _snapshot(denv), len(audit(denv))
    undo = _inject(kind, monkeypatch)
    try:
        with pytest.raises(RuntimeError):
            _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"})
    finally:
        undo()
        monkeypatch.undo()
    assert _snapshot(denv) == before and len(audit(denv)) == n_audit
    assert _raw(denv, "ncr", rid, "status", "closedBy", "closeoutDate", "effectivenessVerifiedBy") == ("Open", None, None, None)      # close-out fields untouched
    ok = _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"})                 # and the same request works afterwards
    assert ok.status_code == 200 and len(audit(denv, entity_id=rid)) == 2


@pytest.mark.parametrize("kind", ["second-construction", "second-flush"])
def test_a_failure_of_the_SECOND_audit_entry_of_a_closure_rolls_back_the_first_entry_and_the_status_too(denv, monkeypatch, kind):
    """A closure writes two audit rows in one request: UPDATE (what changed) and STATUS_CHANGE. The injectors above fail at the FIRST one; here the
    UPDATE entry is built (and added to the session) successfully and only the STATUS_CHANGE one fails — nothing may survive, not even the UPDATE row."""
    rid = ready(denv)
    c = denv.login("dt_a")
    before, n_audit = _snapshot(denv), len(audit(denv))
    body = {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"}
    undo = lambda: None
    if kind == "second-construction":
        import services.ncr_service as svc
        real, seen = svc.log_audit, []

        def second_fails(db, action, *a, **k):
            seen.append(action)
            if action == "STATUS_CHANGE":
                raise RuntimeError("second audit entry failed")
            return real(db, action, *a, **k)
        monkeypatch.setattr(svc, "log_audit", second_fails)
    else:
        def before_flush(session, ctx, instances):
            if any(isinstance(o, models.AuditLog) and o.action == "STATUS_CHANGE" for o in session.new):
                raise RuntimeError("second audit entry flush failed")
        event.listen(Session, "before_flush", before_flush)
        undo = lambda: event.remove(Session, "before_flush", before_flush)
    try:
        with pytest.raises(RuntimeError):
            _put(c, "ncr", rid, body)
    finally:
        undo()
        monkeypatch.undo()
    if kind == "second-construction":
        assert seen == ["UPDATE", "STATUS_CHANGE"]                                   # the first entry really was built before the second failed
    assert _snapshot(denv) == before and len(audit(denv)) == n_audit                # no UPDATE row either, no status, no close-out fields
    assert _raw(denv, "ncr", rid, "status", "closedBy", "closeoutDate") == ("Open", None, None)
    ok = _put(c, "ncr", rid, body)                                                   # the same request works afterwards, with exactly its two entries
    assert ok.status_code == 200 and [e["action"] for e in audit(denv, entity_id=rid)] == ["UPDATE", "STATUS_CHANGE"]


@pytest.mark.parametrize("kind", FAILURES)
def test_a_failing_audit_or_commit_rolls_an_ORDINARY_update_and_a_due_date_change_back(denv, monkeypatch, kind):
    rid = ready(denv)
    c = denv.login("dt_a")
    before, n_audit = _snapshot(denv), len(audit(denv))
    undo = _inject(kind, monkeypatch)
    try:
        with pytest.raises(RuntimeError):
            _put(c, "ncr", rid, {"remark": "lost", "dueDate": "2025-02-01"})
    finally:
        undo()
        monkeypatch.undo()
    assert _snapshot(denv) == before and len(audit(denv)) == n_audit
    assert _raw(denv, "ncr", rid, "remark", "dueDate") == (None, DUE)


# ══ 4. the rules of the last rounds did not move ═══════════════════════════════════════════════════════════════════════════════════

def test_late_closure_the_due_date_lock_and_the_born_closed_refusal_still_hold_and_a_late_closure_is_audited(denv):
    rid = ready(denv)
    c = denv.login("dt_a")
    r = _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-06-01"})       # far after the due date
    assert r.status_code == 200
    assert _put(c, "ncr", rid, {"dueDate": "2025-09-01"}).status_code == 422                                                  # the due date is fixed once closed
    assert c.post("/api/ncr/", json=_body("ncr", status="Closed", raiseDate=RAISE, **CONTENT)).status_code == 400
    upd = audit(denv, "UPDATE", rid)
    assert len(upd) == 1 and upd[0]["new"]["closeoutDate"] == "2025-06-01" and "dueDate" not in upd[0]["new"]              # the deadline itself never changed
