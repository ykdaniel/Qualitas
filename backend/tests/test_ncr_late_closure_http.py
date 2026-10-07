"""Closing an NCR AFTER its due date (2026-09-21): legal, and the original due date stays.

Real logins and routes (the fixtures of test_date_write_guard_http.py), brand-new Sessions for every database assertion.

What changed: the rule `closeoutDate <= dueDate` is gone. What did NOT change and is asserted here again: closeout may not be before the
raise date; every closure requirement (fields, effectiveness = Yes, owner approval for Use As Is / Repair) still applies and a refusal leaves
the row, the audit log and the sequences exactly as they were; the due date of a Closed NCR (or of the request that closes it) cannot be
moved, so the late closure remains visible in the data; nothing that counts "overdue" or "closed" treats a late-closed NCR differently
from any other closed one.
"""
import asyncio
import json
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

import models
from ncr_photos import add_photo
from test_date_write_guard_http import _add_row, _detail_fields, _put, _raw, _snapshot, denv  # noqa: F401  (denv is a fixture)

RAISE, DUE = "2025-01-02", "2025-01-16"                      # both long past: whatever "today" is, closing now is late


def _ready(env, ref="NCR-READY", photo=True, **cols):
    """An open NCR that satisfies every closure requirement except the status change itself (photo=False: without its improvement photo)."""
    base = dict(raiseDate=RAISE, dueDate=DUE, severity="Minor", productDisposition="Use As Is", ownerApproval="Approved",
                reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1", qtyAffected="1", extent="Isolated",
                effectivenessVerified="Yes")
    rid = _add_row(env, "ncr", ref, **{**base, **cols})
    if photo:
        add_photo(env, rid)                                                  # a real image file + its attachment row, the way an upload leaves them
    return rid


def _close_body(**over):
    """What the UI sends when closing: the full record, the due date as it is stored."""
    return {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, **over}


def _row(env, rid):
    return _raw(env, "ncr", rid, "status", "raiseDate", "dueDate", "closeoutDate", "closedBy")


# ══ 1. a late closure is legal, and the due date is untouched ═════════════════════════════════════════════════════════════════════

def test_closing_after_the_due_date_with_an_explicit_closeout_date_is_saved(denv):
    rid = _ready(denv)
    c = denv.login("dt_a")
    r = _put(c, "ncr", rid, _close_body(closeoutDate="2025-03-01"))
    assert r.status_code == 200, r.text[:300]
    status, raise_d, due, closeout, closed_by = _row(denv, rid)
    assert (status, raise_d, due, closeout) == ("Closed", RAISE, DUE, "2025-03-01") and closed_by is not None
    assert r.json()["date_issues"] == []                                     # not reported as a date problem any more
    assert c.get(f"/api/ncr/{rid}/").json()["dueDate"] == DUE               # reads show the ORIGINAL due date and the later closeout


def test_closing_with_a_blank_closeout_stamps_today_even_though_that_is_after_the_due_date(denv):
    rid = _ready(denv)
    r = _put(denv.login("dt_a"), "ncr", rid, _close_body())                  # no closeoutDate: the service stamps today
    assert r.status_code == 200, r.text[:300]
    assert _row(denv, rid)[3] == datetime.now().strftime("%Y-%m-%d") and _row(denv, rid)[2] == DUE


def test_a_partial_update_may_set_a_closeout_date_after_the_stored_due_date(denv):
    rid = _ready(denv)
    assert _put(denv.login("dt_a"), "ncr", rid, {"closeoutDate": "2025-04-01"}).status_code == 200
    assert _row(denv, rid)[2:4] == (DUE, "2025-04-01")


def test_closing_on_the_due_date_or_before_it_still_works(denv):
    for closeout in ("2025-01-16", "2025-01-10"):
        rid = _ready(denv, ref=f"NCR-{closeout}")
        assert _put(denv.login("dt_a"), "ncr", rid, _close_body(closeoutDate=closeout)).status_code == 200


# ══ 2. what is still refused — and refused BEFORE anything is written ═══════════════════════════════════════════════════════════

@pytest.mark.parametrize("closeout", ["2025-01-01", "2024-12-31", "2000-01-01"])
def test_a_closeout_date_before_the_raise_date_is_still_refused_and_nothing_changes(denv, closeout):
    rid = _ready(denv)
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, _close_body(closeoutDate=closeout))
    assert r.status_code == 422 and _detail_fields(r) == {"closeoutDate"} and "before or equal to closeout date" in r.text
    assert _snapshot(denv) == before and _row(denv, rid)[0] == "Open"


@pytest.mark.parametrize("missing", [
    {"photo": False}, {"reInspectionNumber": ""}, {"drawingNo": ""}, {"specNo": ""}, {"qtyAffected": ""}, {"extent": ""},
    {"productDisposition": ""}, {"effectivenessVerified": "No"}, {"effectivenessVerified": None}, {"ownerApproval": "Pending"}, {"ownerApproval": None},
])
def test_every_closure_requirement_still_applies_to_a_late_closure_and_a_refusal_changes_nothing(denv, missing):
    rid = _ready(denv, **missing)
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, _close_body(closeoutDate="2025-03-01"))
    assert r.status_code == 400 and "Cannot close NCR" in r.json()["detail"], r.text[:200]
    assert _snapshot(denv) == before                                         # no status, no closeout, no closedBy, no audit row
    assert _row(denv, rid) == ("Open", RAISE, DUE, None, None)


def test_the_owner_approval_condition_is_the_existing_one_rejected_or_pending_blocks_the_close(denv):
    for i, approval in enumerate(("Rejected", "Pending")):
        rid = _ready(denv, ref=f"NCR-OA-{i}", ownerApproval=approval)
        assert _put(denv.login("dt_a"), "ncr", rid, _close_body(closeoutDate="2025-03-01")).status_code == 400
    ok = _ready(denv, ref="NCR-OA-OK")
    assert _put(denv.login("dt_a"), "ncr", ok, _close_body(closeoutDate="2025-03-01")).status_code == 200


def test_an_invalid_closeout_date_is_still_a_422_whatever_its_relation_to_the_due_date(denv):
    rid = _ready(denv)
    before = _snapshot(denv)
    for bad in ("2025-02-30", "2025-03-01T10:00:00Z", "garbage", " 2025-03-01"):
        assert _put(denv.login("dt_a"), "ncr", rid, _close_body(closeoutDate=bad)).status_code == 422
    assert _snapshot(denv) == before


# ══ 3. the due date is the fact a late closure is measured against — it cannot be moved around ══════════════════════════════════

def test_the_request_that_closes_an_ncr_cannot_move_its_due_date(denv):
    rid = _ready(denv)
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, _close_body(closeoutDate="2025-03-01", dueDate="2025-06-01"))
    assert r.status_code == 422 and _detail_fields(r) == {"dueDate"} and r.json()["detail"][0]["code"] == "due_fixed_at_closure"
    assert _snapshot(denv) == before and _row(denv, rid)[0] == "Open"
    assert _put(c, "ncr", rid, _close_body(closeoutDate="2025-03-01")).status_code == 200                  # the same request with the stored due date


def test_a_closed_ncr_keeps_its_due_date_but_an_unchanged_resend_and_other_edits_still_save(denv):
    rid = _ready(denv)
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, _close_body(closeoutDate="2025-03-01")).status_code == 200
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, {"dueDate": "2025-09-01"})
    assert r.status_code == 422 and r.json()["detail"][0]["code"] == "due_fixed_at_closure"
    assert _snapshot(denv) == before
    assert _put(c, "ncr", rid, {"dueDate": DUE, "remark": "kept"}).status_code == 200                      # unchanged resend + an ordinary edit
    assert _row(denv, rid)[2] == DUE


def test_an_open_ncr_may_still_have_its_due_date_changed_and_a_severity_change_still_recomputes_it(denv):
    rid = _ready(denv)
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"dueDate": "2025-02-01"}).status_code == 200
    assert _row(denv, rid)[2] == "2025-02-01"
    assert _put(c, "ncr", rid, {"severity": "Major"}).status_code == 200                                    # Major = raise + 7 days
    assert _row(denv, rid)[2] == "2025-01-09"


def test_changing_severity_in_the_request_that_closes_does_not_shift_the_due_date(denv):
    rid = _ready(denv)
    r = _put(denv.login("dt_a"), "ncr", rid, {"status": "Closed", "severity": "Major", "closeoutDate": "2025-03-01"})
    assert r.status_code == 200
    assert _row(denv, rid)[2] == DUE                                                                          # not recomputed to 2025-01-09


# ══ 4. reading: a late closure is not a "date issue", and nothing that counts open / overdue / closed changes ═════════════════════

def test_a_late_closed_ncr_and_an_ordinary_closed_one_read_alike_and_the_list_still_loads(denv):
    late, on_time = _ready(denv, ref="NCR-L"), _ready(denv, ref="NCR-O")
    c = denv.login("dt_a")
    assert _put(c, "ncr", late, _close_body(closeoutDate="2025-03-01")).status_code == 200
    assert _put(c, "ncr", on_time, _close_body(closeoutDate="2025-01-10")).status_code == 200
    rows = {r["documentNumber"]: r for r in c.get("/api/ncr/").json()}
    assert rows["NCR-L"]["status"] == rows["NCR-O"]["status"] == "Closed"
    assert rows["NCR-L"]["date_issues"] == rows["NCR-O"]["date_issues"] == []


def test_an_old_row_that_was_closed_late_before_this_change_is_no_longer_flagged(denv):
    rid = _add_row(denv, "ncr", "NCR-OLD", status="Closed", raiseDate=RAISE, dueDate=DUE, closeoutDate="2025-05-05")
    assert denv.login("dt_a").get(f"/api/ncr/{rid}/").json()["date_issues"] == []


def _scheduler_labels(db):
    from scheduler import check_and_send_reminders
    with patch("scheduler.SessionLocal", return_value=db), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mail:
        asyncio.run(check_and_send_reminders())
    return [c.args[1] for c in mail.call_args_list if len(c.args) > 2 and c.args[2] == "NCR"]


def test_the_daily_reminder_still_chases_an_open_overdue_ncr_and_never_a_closed_one_late_or_not(db_session):
    for i, (status, closeout) in enumerate((("Open", None), ("In Progress", None), ("Closed", "2025-03-01"), ("Closed", "2025-01-10"), ("Void", None))):
        db_session.add(models.NCR(id=f"n{i}", documentNumber=f"NCR-S{i}", status=status, raiseDate=RAISE, dueDate=DUE, closeoutDate=closeout))
    db_session.commit()
    assert sorted(_scheduler_labels(db_session)) == ["OVERDUE NCR: NCR-S0", "OVERDUE NCR: NCR-S1"]


def test_q_workflow_counts_a_late_closed_ncr_as_closed_exactly_like_any_other():
    from services.workflow_service import _close_ncr_ok
    late = models.NCR(id="a", status="Closed", raiseDate=RAISE, dueDate=DUE, closeoutDate="2025-03-01")
    on_time = models.NCR(id="b", status="Closed", raiseDate=RAISE, dueDate=DUE, closeoutDate="2025-01-10")
    open_overdue = models.NCR(id="c", status="Open", raiseDate=RAISE, dueDate=DUE)
    assert _close_ncr_ok(None, late) and _close_ncr_ok(None, on_time) and not _close_ncr_ok(None, open_overdue)
