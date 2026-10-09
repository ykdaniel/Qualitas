"""Closing an NCR needs ncr:close:all — enforced by the BACKEND (2026-09-21).

Before this, only the front end (a read-only form) stopped an account with ncr:update:all but WITHOUT ncr:close:all from closing an NCR: a direct
PUT { status: "Closed" } and a POST with status "Closed" both succeeded (reproduced on the isolated stack: HTTP 200, status Closed, closedBy set).

Real logins and routes (the fixtures of test_date_write_guard_http.py: dt_a = update + close, dt_noclose = update only, dt_closeonly = close only),
brand-new Sessions for every database assertion (rows, audit log, sequences).
"""
import json

import pytest

import models
from core import perms
from core.security import get_password_hash
from ncr_photos import add_photo
from test_date_write_guard_http import _add_row, _body, _detail_fields, _put, _raw, _snapshot, denv  # noqa: F401  (denv is a fixture)
from test_itr_revoke_approval_acceptance import PW

RAISE, DUE = "2025-01-02", "2025-01-16"
NEED_CLOSE = f"Operation not permitted. Required: {perms.NCR_CLOSE}"
NEED_UPDATE = f"Operation not permitted. Required: {perms.NCR_UPDATE}"
NEED_CREATE = f"Operation not permitted. Required: {perms.NCR_CREATE}"


def _ready(env, ref="NCR-READY", photo=True, **cols):
    """An open NCR that satisfies every closure requirement except the status change itself (photo=False: without its improvement photo)."""
    base = dict(raiseDate=RAISE, dueDate=DUE, severity="Minor", productDisposition="Use As Is", ownerApproval="Approved",
                reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1", qtyAffected="1", extent="Isolated",
                effectivenessVerified="Yes")
    rid = _add_row(env, "ncr", ref, **{**base, **cols})
    if photo:
        add_photo(env, rid)
    return rid


def _close(**over):
    return {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, **over}


def _row(env, rid):
    return _raw(env, "ncr", rid, "status", "closeoutDate", "closedBy", "dueDate")


# ══ 1. the bug: update permission alone must not close ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("body", [
    _close(),                                                 # blank close-out: the service would stamp today
    _close(closeoutDate="2025-01-10"),                        # on time
    _close(closeoutDate="2025-03-01"),                        # late
    {"status": "Closed"},                                     # a bare partial update
], ids=["blank", "on-time", "late", "partial"])
def test_an_account_with_update_but_not_close_permission_cannot_close_and_nothing_changes(denv, body):
    rid = _ready(denv)
    c = denv.login("dt_noclose")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, body)
    assert r.status_code == 403 and r.json()["detail"] == NEED_CLOSE, r.text[:200]
    assert _snapshot(denv) == before                          # rows, audit log, sequences: exactly as they were
    assert _row(denv, rid) == ("Open", None, None, DUE)


def test_the_refusal_comes_before_the_closure_conditions_so_it_does_not_reveal_what_is_missing(denv):
    rid = _ready(denv, ref="NCR-INCOMPLETE", effectivenessVerified="No", photo=False)
    r = _put(denv.login("dt_noclose"), "ncr", rid, _close(closeoutDate="2025-03-01"))
    assert r.status_code == 403 and r.json()["detail"] == NEED_CLOSE


def test_the_403_precedes_date_validation_and_the_due_date_rule_too(denv):
    rid = _ready(denv, ref="NCR-DATES")
    c = denv.login("dt_noclose")
    before = _snapshot(denv)
    for body in (_close(closeoutDate="2024-12-01"), _close(closeoutDate="garbage"), _close(closeoutDate="2025-03-01", dueDate="2025-06-01")):
        assert _put(c, "ncr", rid, body).status_code == 403
    assert _snapshot(denv) == before


# ══ 2. close permission WITHOUT the update permission is no way around either ═══════════════════════════════════════════════════

def test_close_permission_alone_does_not_get_past_the_update_permission(denv):
    rid = _ready(denv)
    before = _snapshot(denv)
    r = _put(denv.login("dt_closeonly"), "ncr", rid, _close(closeoutDate="2025-03-01"))
    assert r.status_code == 403 and r.json()["detail"] == NEED_UPDATE
    born = denv.login("dt_closeonly").post("/api/ncr/", json=_body("ncr", status="Closed", raiseDate=RAISE))
    assert born.status_code == 403 and born.json()["detail"] == NEED_CREATE
    assert _snapshot(denv) == before


# ══ 3. full permissions: on-time and late closures still work; missing conditions are still refused ═══════════════════════════════

@pytest.mark.parametrize("closeout", ["2025-01-10", "2025-01-16", "2025-03-01", None], ids=["before-due", "on-due", "late", "blank-today"])
def test_with_update_and_close_and_every_condition_met_closing_succeeds_on_time_or_late(denv, closeout):
    rid = _ready(denv, ref=f"NCR-OK-{closeout}")
    body = _close(**({"closeoutDate": closeout} if closeout else {}))
    r = _put(denv.login("dt_a"), "ncr", rid, body)
    assert r.status_code == 200, r.text[:300]
    status, closeout_d, closed_by, due = _row(denv, rid)
    assert status == "Closed" and closed_by is not None and due == DUE and closeout_d


@pytest.mark.parametrize("missing", [{"photo": False}, {"reInspectionNumber": ""}, {"drawingNo": ""}, {"effectivenessVerified": "No"}, {"ownerApproval": "Pending"}])
def test_with_full_permissions_a_missing_closure_condition_is_still_refused_and_nothing_changes(denv, missing):
    rid = _ready(denv, **missing)
    before = _snapshot(denv)
    r = _put(denv.login("dt_a"), "ncr", rid, _close(closeoutDate="2025-03-01"))
    assert r.status_code == 400 and "Cannot close NCR" in r.json()["detail"]
    assert _snapshot(denv) == before and _row(denv, rid)[0] == "Open"


def test_with_full_permissions_the_date_rules_still_hold(denv):
    rid = _ready(denv, ref="NCR-FULL-DATES")
    c = denv.login("dt_a")
    before = _snapshot(denv)
    r = _put(c, "ncr", rid, _close(closeoutDate="2024-12-01"))
    assert r.status_code == 422 and _detail_fields(r) == {"closeoutDate"}
    r = _put(c, "ncr", rid, _close(closeoutDate="2025-03-01", dueDate="2025-06-01"))
    assert r.status_code == 422 and r.json()["detail"][0]["code"] == "due_fixed_at_closure"
    assert _snapshot(denv) == before


# ══ 4. creating an NCR that is already Closed is a closure too ═════════════════════════════════════════════════════════════════════

def test_creating_an_ncr_as_closed_needs_the_close_permission_and_a_refusal_leaves_no_row_no_number_no_audit(denv):
    before = _snapshot(denv)
    r = denv.login("dt_noclose").post("/api/ncr/", json=_body("ncr", status="Closed", raiseDate=RAISE))
    assert r.status_code == 403 and r.json()["detail"] == NEED_CLOSE
    assert _snapshot(denv) == before                          # not even a reference number was taken
    # with the permission the request gets PAST the permission check; what then refuses it is the closure CONDITIONS (400, test_ncr_closed_creation_http.py):
    # an NCR cannot be born Closed since 2026-09-21
    with_perm = denv.login("dt_a").post("/api/ncr/", json=_body("ncr", status="Closed", raiseDate=RAISE))
    assert with_perm.status_code == 400 and "Cannot close NCR" in with_perm.json()["detail"]
    assert _snapshot(denv) == before


def test_creating_an_open_ncr_needs_no_close_permission(denv):
    r = denv.login("dt_noclose").post("/api/ncr/", json=_body("ncr", raiseDate=RAISE))
    assert r.status_code == 200 and _row(denv, r.json()["id"])[0] == "Open"


# ══ 5. what is NOT a closure keeps working for an update-only account ═══════════════════════════════════════════════════════════════

def test_ordinary_partial_updates_and_other_status_changes_are_unaffected(denv):
    rid = _ready(denv)
    c = denv.login("dt_noclose")
    assert _put(c, "ncr", rid, {"remark": "note"}).status_code == 200
    assert _put(c, "ncr", rid, {"status": "In Progress"}).status_code == 200
    assert _put(c, "ncr", rid, {"status": "Resolved"}).status_code == 200
    assert _put(c, "ncr", rid, {"status": "Void"}).status_code == 200
    assert _row(denv, rid)[0] == "Void"


def test_an_already_closed_ncr_re_sent_as_closed_is_not_a_new_closure_and_no_other_lock_is_loosened(denv):
    rid = _ready(denv, ref="NCR-CLOSED")
    assert _put(denv.login("dt_a"), "ncr", rid, _close(closeoutDate="2025-03-01")).status_code == 200
    c = denv.login("dt_noclose")
    before = _row(denv, rid)
    assert _put(c, "ncr", rid, _close(closeoutDate="2025-03-01", remark="edited")).status_code == 200        # unchanged resend + an ordinary edit
    assert _row(denv, rid) == before
    r = _put(c, "ncr", rid, {"status": "Closed", "improvementPhotos": ["/uploads/other.jpg"]})              # a locked quality field on a Closed NCR
    assert r.status_code == 400 and "Closed NCR" in r.json()["detail"]
    r = _put(c, "ncr", rid, {"status": "Closed", "dueDate": "2025-09-01"})                                   # the due date stays fixed
    assert r.status_code == 422 and r.json()["detail"][0]["code"] == "due_fixed_at_closure"
    assert _row(denv, rid) == before


# ══ 6. the permission list decides — not a role name, not the front end ════════════════════════════════════════════════════════════

def test_a_role_called_admin_without_the_close_permission_gets_no_exception(denv):
    db = denv.Session()
    role = models.Role(name="Administrator")
    role.permissions_rel = [p for p in db.query(models.Permission).filter(models.Permission.code.in_([perms.NCR_VIEW, perms.NCR_UPDATE, perms.NCR_CREATE])).all()]
    db.add(role)
    db.flush()
    db.add(models.User(username="dt_adminish", email="adminish@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=role.id))
    db.commit()
    db.close()
    rid = _ready(denv, ref="NCR-ADMINISH")
    before = _snapshot(denv)
    r = _put(denv.login("dt_adminish"), "ncr", rid, _close(closeoutDate="2025-03-01"))
    assert r.status_code == 403 and r.json()["detail"] == NEED_CLOSE
    assert _snapshot(denv) == before


def test_the_check_is_in_the_service_not_only_in_the_route(denv):
    """A caller that reaches the service without passing permissions (a future script or route) can never close."""
    from database import get_db
    import schemas
    from repositories.ncr_repository import NCRRepository
    from services.ncr_service import NCRCloseNotPermitted, NCRService
    rid = _ready(denv, ref="NCR-SVC")
    db = denv.Session()
    try:
        svc = NCRService(NCRRepository(db))
        with pytest.raises(NCRCloseNotPermitted):
            svc.update_ncr(rid, schemas.NCRUpdate(status="Closed", closeoutDate="2025-03-01"), user_id=1, username="x")
        db.rollback()
    finally:
        db.close()
    assert _row(denv, rid)[0] == "Open"
