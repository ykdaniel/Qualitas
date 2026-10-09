"""HTTP/API regression tests for the Pass-integrity hardening (2026-09-19).

The hole these close: an instance whose items were still unfilled could be
saved as status='Pass' (passCount=1) and that stored Pass then carried an
ITR to Approved — the backend trusted the client's status/counts and only
the frontend's own arithmetic stood in the way.

Real everything except the network: real SQLAlchemy DB, real routers, real
login per account (see test_itr_revoke_approval_acceptance.py — its `env`
fixture and helpers are reused; also runnable against the real main.app with
ACCEPT_FULLSTACK=1 + a throwaway DATABASE_URL). Legacy/anomalous rows are
seeded straight into the DB, exactly as historical data got there.

Scope THIS round: a valid Pass = non-empty item list where EVERY item is
'O' and passCount/failCount match. O+N/A as a Pass is intentionally NOT
accepted (pending business rule) and is asserted as rejected here.
"""
import json

import pytest

import models
from test_itr_revoke_approval_acceptance import env, _mk_itr, ITEM  # noqa: F401  (fixture reuse)

ITEM2 = {**ITEM, "item": "Cover", "criteria": ">=40mm"}


# ── helpers ───────────────────────────────────────────────────────────────

def _linked(env, items=None, tpl_items=None):
    """editor links a template with `items`; returns (editor, approver, closer, itr_id, inst_id)."""
    editor, approver, closer = env.login("acc_editor"), env.login("acc_approver"), env.login("acc_closer")
    itr_id = _mk_itr(env)
    tpl = editor.post("/api/checklist/", json={
        "activity": "Rebar", "date": "2026-09-19", "status": "Ongoing",
        "detail_data": json.dumps({"items": items if items is not None else [ITEM, ITEM2]}),
    })
    assert tpl.status_code == 200, tpl.text
    r = editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl.json()["id"]})
    assert r.status_code == 200, r.text
    return editor, approver, closer, itr_id, _inst_id(env, itr_id)


def _inst_id(env, itr_id):
    db = env.Session()
    try:
        return db.query(models.Checklist).filter_by(itrId=itr_id).order_by(models.Checklist.recordsNo).first().id
    finally:
        db.close()


def _extra_instance(env, editor, itr_id, items):
    tpl = editor.post("/api/checklist/", json={
        "activity": "Second", "date": "2026-09-19", "status": "Ongoing",
        "detail_data": json.dumps({"items": items})}).json()
    assert editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl["id"]}).status_code == 200
    db = env.Session()
    try:
        return db.query(models.Checklist).filter(
            models.Checklist.itrId == itr_id, models.Checklist.template_id == tpl["id"]).one().id
    finally:
        db.close()


def _items(results, base=(ITEM, ITEM2)):
    return json.dumps({"items": [{**b, "result": r} for b, r in zip(base, results)]})


def _row(env, inst_id):
    db = env.Session()
    try:
        c = db.get(models.Checklist, inst_id)
        return {"status": c.status, "passCount": c.passCount, "failCount": c.failCount, "detail_data": c.detail_data}
    finally:
        db.close()


def _seed_row(env, inst_id, **cols):
    """Legacy-style write straight into the DB, bypassing every service guard."""
    db = env.Session()
    for k, v in cols.items():
        setattr(db.get(models.Checklist, inst_id), k, v)
    db.commit()
    db.close()


def _seed_itr(env, itr_id, **cols):
    db = env.Session()
    for k, v in cols.items():
        setattr(db.get(models.ITR, itr_id), k, v)
    db.commit()
    db.close()


def _itr_row(env, itr_id):
    db = env.Session()
    try:
        i = db.get(models.ITR, itr_id)
        return {"status": i.status, "closeoutDate": i.closeoutDate, "approvedBy": i.approvedBy,
                "approvedAt": i.approvedAt, "detail_data": i.detail_data}
    finally:
        db.close()


def _audit_total(env):
    db = env.Session()
    try:
        return db.query(models.AuditLog).count()
    finally:
        db.close()


def _valid_pass(editor, inst_id, base=(ITEM, ITEM2)):
    r = editor.put(f"/api/checklist/{inst_id}/", json={
        "status": "Pass", "passCount": len(base), "failCount": 0, "detail_data": _items(["O"] * len(base), base)})
    assert r.status_code == 200, r.text


# ── 1. the reproduced hole ────────────────────────────────────────────────

def test_unfilled_items_cannot_be_declared_pass_or_approved(env):
    editor, approver, _, itr_id, inst = _linked(env)
    before, audits = _row(env, inst), _audit_total(env)

    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 1})
    assert r.status_code == 400, r.text
    assert "not filled in" in r.json()["detail"]
    assert _row(env, inst) == before               # data unchanged
    assert _audit_total(env) == audits             # and no audit residue

    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 400
    assert _itr_row(env, itr_id)["status"] == "In Progress"


# ── 2. status-only / counts-only can't bypass the content check ──────────

@pytest.mark.parametrize("body", [
    {"status": "Pass"},                         # status only
    {"status": "Pass", "passCount": 2},         # status + counts, no items in the request
    {"passCount": 2},                           # counts only
    {"failCount": 1},
])
def test_partial_updates_are_judged_on_the_merged_row(env, body):
    editor, _, _, _, inst = _linked(env)        # both items unfilled in the DB
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json=body)
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


def test_status_only_pass_over_half_filled_items_rejected(env):
    editor, _, _, _, inst = _linked(env)
    r = editor.put(f"/api/checklist/{inst}/", json={
        "detail_data": _items(["O", ""]), "passCount": 1, "failCount": 0})
    assert r.status_code == 200, r.text         # honest partial fill is fine (Ongoing)
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Pass"})   # items already in DB, 1 unfilled
    assert r.status_code == 400 and "not filled in" in r.json()["detail"]
    assert _row(env, inst) == before


def test_status_only_pass_with_stale_counts_rejected_even_if_items_all_o(env):
    editor, _, _, _, inst = _linked(env)
    _seed_row(env, inst, detail_data=_items(["O", "O"]), passCount=0, failCount=0)   # legacy-shaped drift
    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Pass"})
    assert r.status_code == 400 and "passCount=0" in r.json()["detail"]
    assert _row(env, inst)["status"] == "Ongoing"


# ── 3. empty / unknown / malformed can't support Pass ────────────────────

def test_empty_item_list_cannot_be_pass(env):
    editor, _, _, _, inst = _linked(env, items=[])
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 0, "failCount": 0})
    assert r.status_code == 400 and "no items" in r.json()["detail"]
    assert _row(env, inst) == before


@pytest.mark.parametrize("code", ["P", "o", "♦", "OK", "Y"])
def test_unknown_result_codes_cannot_be_pass(env, code):
    editor, _, _, _, inst = _linked(env, items=[ITEM])
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={
        "status": "Pass", "passCount": 1, "failCount": 0,
        "detail_data": json.dumps({"items": [{**ITEM, "result": code}]})})
    assert r.status_code == 400, r.text
    assert "unknown" in r.json()["detail"]
    assert _row(env, inst) == before


@pytest.mark.parametrize("bad", ["not json at all", '{"items": "x"}', '{"items": {"a": 1}}', "[1,2]", '{"nothing": true}'])
def test_malformed_item_data_cannot_be_pass(env, bad):
    editor, _, _, _, inst = _linked(env, items=[])       # empty snapshot so the structure guard isn't what stops it
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 0, "failCount": 0, "detail_data": bad})
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


@pytest.mark.parametrize("pc,fc", [(2, 0), (0, 0), (1, 1), (3, 0)])
def test_counts_must_match_actual_o_x(env, pc, fc):
    editor, _, _, _, inst = _linked(env)
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={
        "status": "Pass", "passCount": pc, "failCount": fc, "detail_data": _items(["O", "O"])})
    if (pc, fc) == (2, 0):
        assert r.status_code == 200
    else:
        assert r.status_code == 400 and "does not match" in r.json()["detail"]
        assert _row(env, inst) == before


@pytest.mark.parametrize("results,expect", [
    (["O", "X"], "marked Fail"),
    (["O", "/"], "N/A"),            # O + N/A is intentionally NOT a Pass this round
    (["/", "/"], "N/A"),            # all N/A neither
    (["O", ""], "not filled in"),
    (["O", "-"], "not filled in"),  # '-' is the ITP seed's "unanswered"
])
def test_non_all_o_combinations_are_not_a_pass(env, results, expect):
    editor, _, _, _, inst = _linked(env)
    o, x = results.count("O"), results.count("X")
    r = editor.put(f"/api/checklist/{inst}/", json={
        "status": "Pass", "passCount": o, "failCount": x, "detail_data": _items(results)})
    assert r.status_code == 400 and expect in r.json()["detail"], r.text


# ── 4. the valid path still works end to end ─────────────────────────────

def test_non_empty_all_o_with_matching_counts_passes_and_approves(env):
    editor, approver, _, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    assert _row(env, inst)["status"] == "Pass"
    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 200 and r.json()["status"] == "Approved"


# ── 5. legacy anomalous Pass can't carry a NEW approval ──────────────────

LEGACY = {
    "empty items list":            dict(detail_data=json.dumps({"items": []}), passCount=1),
    "NULL detail_data":            dict(detail_data=None, passCount=2),
    "unfilled items":              dict(detail_data=_items(["", ""]), passCount=2),
    "counts don't add up":         dict(detail_data=_items(["O", "O"]), passCount=1),
    "unknown code":                dict(detail_data=_items(["O", "♦"]), passCount=1),
    "contains Fail":               dict(detail_data=_items(["O", "X"]), passCount=1, failCount=1),
    "O plus N/A":                  dict(detail_data=_items(["O", "/"]), passCount=1),
    "unparsable":                  dict(detail_data="{{{", passCount=1),
}


@pytest.mark.parametrize("label", list(LEGACY))
def test_legacy_anomalous_pass_cannot_support_new_approval(env, label):
    editor, approver, _, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Pass", failCount=LEGACY[label].get("failCount", 0), **{
        k: v for k, v in LEGACY[label].items() if k != "failCount"})
    db = env.Session(); rec_no = db.get(models.Checklist, inst).recordsNo; db.close()
    itr_before, audits = _itr_row(env, itr_id), _audit_total(env)

    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 400, (label, r.text)
    detail = r.json()["detail"]
    assert rec_no in detail and "not supported" in detail          # names the checklist and says why
    assert _itr_row(env, itr_id) == itr_before                      # nothing approved
    assert _audit_total(env) == audits                              # nothing half-written
    assert _row(env, inst)["status"] == "Pass"                      # and nothing "repaired" either


def test_batch_update_cannot_approve_on_anomalous_pass(env):
    editor, approver, _, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Pass", passCount=1, detail_data=json.dumps({"items": []}))
    r = approver.post("/api/itr/batch-update", json={"ids": [itr_id], "status": "Approved"})
    assert r.status_code == 200
    assert r.json()["updated"] == [] and "not supported" in r.json()["failed"][0]["error"]
    assert _itr_row(env, itr_id)["status"] == "In Progress"


def test_one_bad_checklist_among_good_ones_blocks_and_is_named(env):
    editor, approver, _, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    bad = _extra_instance(env, editor, itr_id, [ITEM])
    _seed_row(env, bad, status="Pass", passCount=1, detail_data=_items([""], (ITEM,)))
    db = env.Session(); good_no = db.get(models.Checklist, inst).recordsNo; bad_no = db.get(models.Checklist, bad).recordsNo; db.close()
    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 400
    assert bad_no in r.json()["detail"] and good_no not in r.json()["detail"]


# ── 6. re-approval after a revoke is re-checked ──────────────────────────

def test_reapproval_after_revoke_is_rechecked(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200
    assert approver.post(f"/api/itr/{itr_id}/revoke-approval",
                         json={"new_status": "In Progress", "reason": "recheck"}).status_code == 200

    # (a) legacy-style drift while the ITR was open again: Pass claim, but an item is blank
    _seed_row(env, inst, detail_data=_items(["O", ""]))
    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 400 and "not supported" in r.json()["detail"]
    assert _itr_row(env, itr_id)["status"] == "In Progress"

    # (b) the legitimate route: Reopen, fill properly, Pass again, re-approve
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200
    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 400 and "not passed" in r.json()["detail"]      # Ongoing can't approve
    _valid_pass(editor, inst)
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200


# ── 7. approved history and audit snapshots are never touched ────────────

def test_legacy_approved_record_and_snapshot_are_left_exactly_as_is(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    # A historical, already-Approved ITR whose Pass is anomalous (empty items) — seeded as history.
    _seed_row(env, inst, status="Pass", passCount=1, detail_data=json.dumps({"items": []}))
    _seed_itr(env, itr_id, status="Approved")
    chk_before, itr_before = _row(env, inst), _itr_row(env, itr_id)

    # Nothing re-evaluates or downgrades it: a Publish-style resend leaves it Approved and untouched.
    r = approver.put(f"/api/itr/{itr_id}", json={"type": "Rev2.0", "status": "Approved"})
    assert r.status_code == 200 and r.json()["status"] == "Approved"
    assert _row(env, inst) == chk_before
    assert _itr_row(env, itr_id)["status"] == "Approved"
    # ...and the checklist itself stays frozen behind the parent ITR.
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 400

    # Revoking snapshots the RAW legacy content, not a "corrected" one.
    assert approver.post(f"/api/itr/{itr_id}/revoke-approval",
                         json={"new_status": "In Progress", "reason": "legacy check"}).status_code == 200
    db = env.Session()
    log = db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="legacy check").one()
    snap_json = log.old_value
    db.close()
    snap = json.loads(snap_json)["checklists"][0]
    assert snap["status"] == "Pass" and snap["passCount"] == 1 and snap["items"] == []
    assert _row(env, inst) == chk_before

    # New approval is refused; snapshot bytes never change through any of it.
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 400
    assert editor.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 1}).status_code in (400, 403)
    db = env.Session()
    assert db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="legacy check").one().old_value == snap_json
    db.close()


def test_valid_approved_snapshot_survives_later_rejected_and_legitimate_edits(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    approver.post(f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress", "reason": "snap check"})
    db = env.Session()
    snap = db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="snap check").one().old_value
    db.close()

    assert editor.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 9}).status_code in (400, 403)  # rejected
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200                    # legit reopen
    assert closer.put(f"/api/checklist/{inst}/", json={
        "status": "Fail", "passCount": 1, "failCount": 1, "detail_data": _items(["O", "X"])}).status_code == 200  # legit edit

    db = env.Session()
    assert db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="snap check").one().old_value == snap
    db.close()


# ── 8. legitimate flows are not broken ───────────────────────────────────

def test_legitimate_reopen_fill_and_fail_flow(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    # honest partial fill
    assert editor.put(f"/api/checklist/{inst}/", json={
        "detail_data": _items(["O", ""]), "passCount": 1, "failCount": 0}).status_code == 200
    _valid_pass(editor, inst)
    # Reopen with the old results still on the items and counts still 2/0: must not be tripped by them
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200
    assert _row(env, inst)["passCount"] == 2
    # then a real correction to a Fail
    r = closer.put(f"/api/checklist/{inst}/", json={
        "status": "Fail", "passCount": 1, "failCount": 1, "detail_data": _items(["O", "X"])})
    assert r.status_code == 200 and r.json()["status"] == "Fail"


def test_reopen_of_legacy_anomalous_pass_is_not_blocked(env):
    _, _, closer, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Pass", passCount=2, detail_data=None)     # like a real dev-DB legacy row
    r = closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"})
    assert r.status_code == 200, r.text
    assert _row(env, inst)["status"] == "Ongoing"
    assert _row(env, inst)["detail_data"] is None                          # nothing invented or repaired


def test_reinspection_keeps_standard_blanks_results_and_cannot_start_as_pass(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    assert editor.put(f"/api/checklist/{inst}/", json={
        "status": "Fail", "passCount": 1, "failCount": 1, "detail_data": _items(["O", "X"])}).status_code == 200
    _seed_itr(env, itr_id, inspectionResult="Fail")
    original = _row(env, inst)

    r = editor.post(f"/api/itr/{itr_id}/re-inspect")
    assert r.status_code == 200, r.text
    new_itr = r.json()["id"]
    new_inst = _inst_id(env, new_itr)

    items = json.loads(_row(env, new_inst)["detail_data"])["items"]
    assert [(i["item"], i["criteria"]) for i in items] == [("Spacing", "<=200mm"), ("Cover", ">=40mm")]
    assert all(i["result"] == "" and i["situation"] == "" for i in items)
    assert _row(env, inst) == original                                       # original failure untouched

    # nothing pre-filled: claiming Pass on the fresh copy is refused, filling it properly works
    assert editor.put(f"/api/checklist/{new_inst}/", json={"status": "Pass", "passCount": 2}).status_code == 400
    _valid_pass(editor, new_inst)


# ── 9. no partial commits ────────────────────────────────────────────────

def test_rejected_checklist_write_leaves_row_and_audit_untouched(env):
    editor, _, _, _, inst = _linked(env)
    editor.put(f"/api/checklist/{inst}/", json={"detail_data": _items(["O", ""]), "passCount": 1, "failCount": 0})
    row, audits = _row(env, inst), _audit_total(env)
    for body in ({"status": "Pass", "passCount": 2, "detail_data": _items(["O", "O", ])[:-1] + "x"},
                 {"status": "Pass", "passCount": 1},
                 {"status": "Pass", "passCount": 2, "failCount": 0, "detail_data": _items(["O", "P"])}):
        assert editor.put(f"/api/checklist/{inst}/", json=body).status_code == 400
        assert _row(env, inst) == row and _audit_total(env) == audits


def test_rejected_approval_leaves_itr_and_audit_untouched(env):
    editor, approver, _, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Pass", passCount=2, detail_data=_items(["", ""]))
    itr_row, audits = _itr_row(env, itr_id), _audit_total(env)
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved", "remark": "should not stick"}).status_code == 400
    assert _itr_row(env, itr_id) == itr_row
    assert _audit_total(env) == audits
    db = env.Session(); assert db.get(models.ITR, itr_id).remark != "should not stick"; db.close()


# ── inventory (read-only) ────────────────────────────────────────────────

def test_inventory_reports_the_three_anomaly_classes_without_writing(env):
    from scripts.verification.checklist_itr_inventory import (
        find_pass_with_unusable_items, find_pass_not_all_o, find_count_mismatches)
    editor, _, _, itr_id, inst = _linked(env)
    a = _extra_instance(env, editor, itr_id, [ITEM])
    b = _extra_instance(env, editor, itr_id, [ITEM])
    _seed_row(env, inst, status="Pass", passCount=1, detail_data=json.dumps({"items": []}))     # unusable
    _seed_row(env, a, status="Pass", passCount=1, failCount=0, detail_data=_items(["X"], (ITEM,)))  # not all O (+ counts)
    _seed_row(env, b, status="Ongoing", passCount=5, detail_data=_items([""], (ITEM,)))          # counts drift only
    snapshot = [(_row(env, x)) for x in (inst, a, b)]

    db = env.Session()
    try:
        n1, hits1 = find_pass_with_unusable_items(db)
        n2, hits2 = find_pass_not_all_o(db)
        n3, hits3 = find_count_mismatches(db)
    finally:
        db.close()
    # Assert on OUR seeded rows (a shared full-stack DB may hold other tests' rows too).
    db = env.Session()
    no = {k: db.get(models.Checklist, v).recordsNo for k, v in (("inst", inst), ("a", a), ("b", b))}
    db.close()
    mine = lambda hits, rec: [h for h in hits if h.startswith(rec + " ")]
    assert len(mine(hits1, no["inst"])) == 1 and "no items" in mine(hits1, no["inst"])[0]
    assert not mine(hits1, no["a"]) and not mine(hits1, no["b"])
    assert len(mine(hits2, no["a"])) == 1 and "marked Fail" in mine(hits2, no["a"])[0]
    assert not mine(hits2, no["inst"])                       # empty list belongs to the "unusable" class only
    assert all(len(mine(hits3, r)) == 1 for r in no.values())  # all three have count drift
    assert n1 >= 1 and n2 >= 1 and n3 >= 3
    assert [(_row(env, x)) for x in (inst, a, b)] == snapshot                                    # read-only
