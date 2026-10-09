"""An NCR cannot be created directly as Closed around the closure conditions (2026-09-21).

Reproduced first on the isolated stack (real uvicorn and login, account with create + update + close): `POST /api/ncr/` with status "Closed" and NONE of
the closure content answered HTTP 200 and stored a Closed NCR with no re-inspection number, drawing, spec, quantity, extent, photos or effectiveness
verdict — the same content sent as an update (Open -> Closed) is refused with 400. A client-supplied `closedBy` (999, not a user) was stored as well,
on the create AND on a legitimate closure by update.

Now: ONE shared check (services.ncr_service.assert_closure_conditions) runs for both, on the final content, before numbering or writing. Improvement
photos are attachments of the SAVED record, so a create can never satisfy them: an NCR cannot be born Closed. Permissions are separate and not
interchangeable: create + close to create Closed, update + close to close.
"""
import json
from datetime import datetime

import pytest

import models
from core import perms
from ncr_photos import add_photo
from test_date_write_guard_http import _add_row, _body, _put, _raw, _snapshot, denv  # noqa: F401  (denv is a fixture)

RAISE, DUE = "2025-01-02", "2025-01-16"

# Everything the closure conditions ask for, except the photos (which live on the saved record). Disposition "Rework" needs no owner approval.
CONTENT = dict(productDisposition="Rework", reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1", qtyAffected="1", extent="Isolated", effectivenessVerified="Yes")


def _attachments(env):
    db = env.Session()
    try:
        return db.query(models.Attachment).count()
    finally:
        db.close()


def _state(env):
    return _snapshot(env), _attachments(env)


def _post(c, **over):
    return c.post("/api/ncr/", json=_body("ncr", raiseDate=RAISE, **over))


def _open_row(env, ref, **cols):
    """The 'same content' as an existing OPEN NCR, ready to be closed by update (its improvement photo attached)."""
    base = dict(raiseDate=RAISE, dueDate=DUE, severity="Minor", **CONTENT)
    rid = _add_row(env, "ncr", ref, **{**base, **cols})
    add_photo(env, rid)
    return rid


def _uid(env, username):
    db = env.Session()
    try:
        return db.query(models.User).filter_by(username=username).one().id
    finally:
        db.close()


# ══ 1. the reproduced bug, and its parity with the update path ═════════════════════════════════════════════════════════════════════

def test_creating_as_closed_with_none_of_the_closure_content_is_refused_like_the_same_content_sent_as_an_update(denv):
    c = denv.login("dt_a")
    before = _state(denv)
    r = _post(c, status="Closed")                                              # was: 200, a Closed NCR with nothing
    assert r.status_code == 400 and "Cannot close NCR" in r.json()["detail"], r.text[:300]
    assert _state(denv) == before
    rid = _add_row(denv, "ncr", "NCR-EMPTY", raiseDate=RAISE, dueDate=DUE)     # the same (empty) content, updated to Closed
    u = _put(c, "ncr", rid, {"status": "Closed"})
    assert u.status_code == 400 and "Cannot close NCR" in u.json()["detail"]


# label -> (content override that breaks that one condition)
BREAKS = {
    "productDisposition": {"productDisposition": ""},
    "reInspectionNumber": {"reInspectionNumber": ""},
    "drawingNo": {"drawingNo": "  "},
    "specNo": {"specNo": None},
    "qtyAffected": {"qtyAffected": ""},
    "extent": {"extent": None},
    "recurrenceRef": {"recurrence": "Yes", "recurrenceRef": ""},
    "repairMethodStatement": {"productDisposition": "Repair", "repairMethodStatement": "", "repairMethodStatementStatus": ""},
    "effectivenessVerified": {"effectivenessVerified": "No"},
    "ownerApproval": {"productDisposition": "Use As Is"},                       # needs owner approval, none given
}


@pytest.mark.parametrize("label", sorted(BREAKS))
def test_every_missing_closure_condition_is_refused_by_create_and_by_update_alike_and_a_refusal_changes_nothing(denv, label):
    c = denv.login("dt_a")
    content = {**CONTENT, **BREAKS[label]}
    before = _state(denv)
    post = _post(c, status="Closed", **content)
    assert post.status_code == 400 and "Cannot close NCR" in post.json()["detail"], post.text[:300]
    assert _state(denv) == before                                              # no NCR row, no number taken, no audit, no attachment
    rid = _open_row(denv, f"NCR-{label}", **BREAKS[label])
    before = _state(denv)
    put = _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE})
    assert put.status_code == 400 and "Cannot close NCR" in put.json()["detail"], put.text[:300]
    assert _state(denv) == before and _raw(denv, "ncr", rid, "status") == ("Open",)
    if label not in ("effectivenessVerified", "ownerApproval"):               # the "missing fields" family names the field in BOTH refusals
        assert label in post.json()["detail"] and label in put.json()["detail"]


@pytest.mark.parametrize("photos", [None, [], ["/uploads/a.jpg"], ["/api/files/download/ncr/0123456789abcdef0123456789abcdef.png"], ["data:image/png;base64,AAAA"]],
                         ids=["none", "empty", "arbitrary-path", "another-records-attachment-url", "legacy-base64"])
def test_a_fully_specified_body_is_still_refused_because_photos_cannot_exist_before_the_record_does(denv, photos):
    """Whatever the body lists as improvementPhotos — an arbitrary path, another NCR's attachment URL, inline data — it cannot count: attachments
    hang off the saved record's id."""
    c = denv.login("dt_a")
    before = _state(denv)
    r = _post(c, status="Closed", **CONTENT, **({} if photos is None else {"improvementPhotos": photos}))
    assert r.status_code == 400 and "improvementPhotos" in r.json()["detail"] and "create it first, then close it" in r.json()["detail"], r.text[:300]
    assert _state(denv) == before


def test_the_same_body_created_Open_is_fine_and_can_then_be_closed_on_time_or_late(denv):
    c = denv.login("dt_a")
    for i, closeout in enumerate(("2025-01-10", "2025-03-01", None)):
        created = _post(c, status="Open", **CONTENT, subject=f"S{i}")
        assert created.status_code == 200, created.text[:200]
        rid = created.json()["id"]
        add_photo(denv, rid)                                                 # the photo now has a record to belong to: a real file + attachment row, as an upload leaves them
        r = _put(c, "ncr", rid, {"status": "Closed", **({"closeoutDate": closeout} if closeout else {})})
        assert r.status_code == 200, r.text[:300]
        status, closeout_d, closed_by = _raw(denv, "ncr", rid, "status", "closeoutDate", "closedBy")
        assert status == "Closed" and closed_by == _uid(denv, "dt_a") and closeout_d == (closeout or datetime.now().strftime("%Y-%m-%d"))


# ══ 2. one shared check, and permissions that do not substitute for each other ═════════════════════════════════════════════════════

def test_create_and_update_call_the_same_single_closure_check(denv, monkeypatch):
    import services.ncr_service as svc
    seen = []
    real = svc.assert_closure_conditions

    def spy(final, photos, **kw):
        seen.append(("create" if kw.get("photos_on_saved_record") is False else "update", dict(final)))
        return real(final, photos, **kw)
    monkeypatch.setattr(svc, "assert_closure_conditions", spy)
    c = denv.login("dt_a")
    _post(c, status="Closed", **CONTENT)
    rid = _open_row(denv, "NCR-SPY")
    _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE})
    assert [k for k, _ in seen] == ["create", "update"]
    assert set(seen[0][1]) == set(seen[1][1]) == set(svc.CLOSURE_FIELDS)        # both judge exactly the same set of fields


def test_create_as_closed_needs_create_plus_close_and_update_to_close_needs_update_plus_close(denv):
    body = dict(status="Closed", **CONTENT)
    before = _state(denv)
    # no close permission: 403 first — before (and instead of) any statement about what is missing
    r = _post(denv.login("dt_noclose"), **body)
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {perms.NCR_CLOSE}"
    # close without create: the route refuses
    r = _post(denv.login("dt_updateclose"), **body)
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {perms.NCR_CREATE}"
    r = _post(denv.login("dt_closeonly"), **body)
    assert r.status_code == 403
    assert _state(denv) == before
    # create + close: past the permission checks, so what is refused now is the CONTENT (the photos)
    r = _post(denv.login("dt_createclose"), **body)
    assert r.status_code == 400 and "Cannot close NCR" in r.json()["detail"]
    # create + close is NOT update + close: it cannot close an existing NCR
    rid = _open_row(denv, "NCR-PERM")
    r = _put(denv.login("dt_createclose"), "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE})
    assert r.status_code == 403 and r.json()["detail"] == f"Operation not permitted. Required: {perms.NCR_UPDATE}"
    assert _raw(denv, "ncr", rid, "status") == ("Open",)
    # update + close does
    r = _put(denv.login("dt_updateclose"), "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE})
    assert r.status_code == 200 and _raw(denv, "ncr", rid, "status") == ("Closed",)


def test_without_permission_the_403_never_reveals_which_conditions_are_missing(denv):
    r = _post(denv.login("dt_noclose"), status="Closed")
    assert r.status_code == 403 and "missing" not in r.text and "improvementPhotos" not in r.text
    rid = _add_row(denv, "ncr", "NCR-LEAK", raiseDate=RAISE, dueDate=DUE)
    r = _put(denv.login("dt_noclose"), "ncr", rid, {"status": "Closed"})
    assert r.status_code == 403 and "missing" not in r.text


# ══ 3. the operator and the dates of a legitimate closure ══════════════════════════════════════════════════════════════════════════

def test_a_client_supplied_closedBy_is_never_stored_on_create(denv):
    created = _post(denv.login("dt_a"), status="Open", closedBy=999)
    assert created.status_code == 200
    assert _raw(denv, "ncr", created.json()["id"], "closedBy") == (None,)


def test_closedBy_of_a_legitimate_closure_is_the_authenticated_user_not_the_request_body(denv):
    rid = _open_row(denv, "NCR-FORGE")
    r = _put(denv.login("dt_a"), "ncr", rid, {"status": "Closed", "closedBy": 999, "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"})
    assert r.status_code == 200
    assert _raw(denv, "ncr", rid, "status", "closedBy", "closeoutDate") == ("Closed", _uid(denv, "dt_a"), "2025-03-01")      # late, and 999 was ignored


def test_closedBy_cannot_be_written_on_an_open_or_closed_ncr_through_an_ordinary_update_either(denv):
    rid = _open_row(denv, "NCR-FORGE2")
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"closedBy": 999}).status_code == 200
    assert _raw(denv, "ncr", rid, "closedBy") == (None,)
    assert _put(c, "ncr", rid, {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE}).status_code == 200
    assert _put(c, "ncr", rid, {"closedBy": 999, "remark": "x"}).status_code == 200
    assert _raw(denv, "ncr", rid, "closedBy") == (_uid(denv, "dt_a"),)


# ══ 4. the rest of the closure rules did not move ═══════════════════════════════════════════════════════════════════════════════════

def test_date_validity_and_the_raise_date_rule_still_apply_to_a_closing_update(denv):
    rid = _open_row(denv, "NCR-DATES")
    c = denv.login("dt_a")
    before = _state(denv)
    assert _put(c, "ncr", rid, {"status": "Closed", "closeoutDate": "2024-12-01", "raiseDate": RAISE, "dueDate": DUE}).status_code == 422
    assert _put(c, "ncr", rid, {"status": "Closed", "closeoutDate": "2025-02-30", "raiseDate": RAISE, "dueDate": DUE}).status_code == 422
    assert _state(denv) == before
