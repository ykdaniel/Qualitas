"""The unified Checklist status rule (2026-09-20): "N/A must not be judged Fail".

  all items O                                   -> Pass
  every item judged (O / X / '/'), >=1 X        -> Fail
  anything unfilled / unknown / no items        -> Ongoing   (an X already found is still counted)
  no X but contains '/' (incl. all '/')         -> Ongoing   ("contains N/A, pending, cannot be approved")
passCount / failCount stay exactly the number of O / X items.

Real HTTP with real logins, brand-new-Session assertions (harness reused from the other checklist HTTP tests).
Historical rows are seeded straight into the DB, the way old data got there.
"""
import json

import pytest

import models
from services import checklist_service as svc
from test_itr_revoke_approval_acceptance import env, ITEM  # noqa: F401
from test_checklist_pass_integrity_http import (  # noqa: F401
    ITEM2, _linked, _row, _seed_row, _audit_total, _valid_pass, _itr_row,
)
from test_itr_approval_events_http import _ready_itr, _approve, _state, _unchanged  # noqa: F401

NA = "cover not applicable here"


def _it(base, result, **extra):
    d = {**base, "result": result, **extra}
    if result == "/" and "naReason" not in d:
        d["naReason"] = NA
    return d


def _body(results, **extra):
    """results: list of result codes for (ITEM, ITEM2, ...) -> detail_data JSON string."""
    bases = [ITEM, ITEM2]
    return json.dumps({"items": [_it(b, r) for b, r in zip(bases, results)]})


def _counts(results):
    return sum(r == "O" for r in results), sum(r == "X" for r in results)


def _put(editor, inst, status, results, **kw):
    p, f = _counts(results)
    return editor.put(f"/api/checklist/{inst}/", json={
        "status": status, "passCount": kw.get("p", p), "failCount": kw.get("f", f), "detail_data": _body(results)})


# ── 1. the pure rule ─────────────────────────────────────────────────────

def _derive(items):
    return svc.derive_checklist_status(svc.summarize_items(json.dumps({"items": items})))


@pytest.mark.parametrize("results,expected", [
    (["O", "O"], "Pass"),
    (["O", "/"], "Ongoing"),
    (["/", "/"], "Ongoing"),
    (["X", "O"], "Fail"),
    (["X", "/"], "Fail"),
    (["X", "X"], "Fail"),
    (["X", ""], "Ongoing"),
    (["X", "-"], "Ongoing"),
    (["O", ""], "Ongoing"),
    (["O", "♦"], "Ongoing"),
    (["X", "♦"], "Ongoing"),
    (["/", "♦"], "Ongoing"),
])
def test_the_derivation_matrix(results, expected):
    assert _derive([{"item": "a", "criteria": "c", "situation": "", "result": r, **({"naReason": NA} if r == "/" else {})}
                    for r in results]) == expected


def test_empty_and_unparseable_item_lists_are_ongoing():
    assert svc.derive_checklist_status(svc.summarize_items(json.dumps({"items": []}))) == "Ongoing"
    assert svc.derive_checklist_status(svc.summarize_items("not json")) == "Ongoing"
    assert svc.derive_checklist_status(svc.summarize_items(None)) == "Ongoing"


# ── 2. legitimate saves ──────────────────────────────────────────────────

@pytest.mark.parametrize("results,status", [
    (["O", "/"], "Ongoing"), (["/", "/"], "Ongoing"), (["X", "/"], "Fail"), (["X", "O"], "Fail"),
    (["X", ""], "Ongoing"), (["O", "O"], "Pass"),
])
def test_legitimate_saves_store_status_and_counts_and_survive_a_fresh_read(env, results, status):
    editor, _, _, _, inst = _linked(env)
    r = _put(editor, inst, status, results)
    assert r.status_code == 200, r.text
    row = _row(env, inst)                                                 # a brand-new Session
    assert (row["status"], row["passCount"], row["failCount"]) == (status, *_counts(results))
    assert json.loads(row["detail_data"])["items"][0]["result"] == results[0]
    got = editor.get(f"/api/checklist/{inst}/")                           # ... and through the API
    assert got.status_code == 200 and got.json()["status"] == status


def test_o_plus_na_saved_as_ongoing_is_not_locked_and_can_be_finished_later(env):
    editor, _, _, _, inst = _linked(env)
    assert _put(editor, inst, "Ongoing", ["O", "/"]).status_code == 200
    assert _put(editor, inst, "Pass", ["O", "O"]).status_code == 200      # not locked by a wrongly closed state
    assert _row(env, inst)["status"] == "Pass"


# ── 3. forged declarations are refused and change nothing ────────────────

@pytest.mark.parametrize("results,claimed", [
    (["O", "/"], "Fail"),          # the old rule
    (["/", "/"], "Fail"),
    (["O", "/"], "Pass"),
    (["/", "/"], "Pass"),
    (["X", ""], "Fail"),           # not all judged
    (["X", "♦"], "Fail"),          # unknown value
    (["X", "/"], "Pass"),
    (["X", "O"], "Pass"),
    (["O", ""], "Fail"),
])
def test_forged_status_is_refused_with_data_and_audit_unchanged(env, results, claimed):
    editor, _, _, _, inst = _linked(env)
    before, audits = _row(env, inst), _audit_total(env)
    p, f = _counts(results)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": claimed, "passCount": p, "failCount": f,
                                                    "detail_data": _body(results)})
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before and _audit_total(env) == audits


@pytest.mark.parametrize("claimed", ["Pass", "Fail"])
def test_empty_item_list_cannot_be_declared_pass_or_fail(env, claimed):
    editor, _, _, _, inst = _linked(env, items=[])
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": claimed, "passCount": 0, "failCount": 0})
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


@pytest.mark.parametrize("p,f", [(0, 0), (1, 1), (2, 0), (0, 2), (5, 5)])
def test_forged_counts_on_a_real_fail_are_refused(env, p, f):
    editor, _, _, _, inst = _linked(env)
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Fail", "passCount": p, "failCount": f,
                                                    "detail_data": _body(["X", "O"])})     # truth is 1 / 1
    if (p, f) == (1, 1):
        assert r.status_code == 200
    else:
        assert r.status_code == 400, r.text
        assert _row(env, inst) == before


def test_status_only_fail_over_stored_o_plus_na_items_is_refused(env):
    """Partial update: the request carries no items, the merged row (O + '/') is what is judged."""
    editor, _, _, _, inst = _linked(env)
    assert _put(editor, inst, "Ongoing", ["O", "/"]).status_code == 200
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"status": "Fail"})
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


def test_na_reason_is_still_required(env):
    editor, _, _, _, inst = _linked(env)
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={
        "status": "Ongoing", "passCount": 1, "failCount": 0,
        "detail_data": json.dumps({"items": [{**ITEM, "result": "O"}, {**ITEM2, "result": "/"}]})})
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


# ── 4. approval is unchanged ─────────────────────────────────────────────

def test_all_o_still_approves_and_the_snapshot_keeps_the_pass(env):
    itr_id, insts = _ready_itr(env)
    r = _approve(env, itr_id)
    assert r.status_code == 200, r.text
    st = _state(env, itr_id)
    assert st["itr"]["status"] == "Approved" and [e["event_type"] for e in st["events"]] == ["APPROVED"]
    assert st["checklists"][insts[0]]["status"] == "Pass"
    snap = json.dumps(st["events"][0]["checklists_snapshot"])
    assert '"Pass"' in snap or "Pass" in snap


@pytest.mark.parametrize("results,status", [
    (["O", "/"], "Ongoing"), (["/", "/"], "Ongoing"), (["X", "O"], "Fail"), (["X", "/"], "Fail"),
    (["X", ""], "Ongoing"), (["O", ""], "Ongoing"),
])
def test_anything_but_all_o_cannot_approve_and_nothing_changes(env, results, status):
    editor, _, _, itr_id, inst = _linked(env)
    assert _put(editor, inst, status, results).status_code == 200
    before = _state(env, itr_id)
    r = _approve(env, itr_id)
    assert r.status_code == 400, r.text
    _unchanged(_state(env, itr_id), before)
    assert _itr_row(env, itr_id)["status"] == "In Progress"


def test_an_unknown_value_cannot_approve(env):
    editor, _, _, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Pass", passCount=1, failCount=0,
              detail_data=json.dumps({"items": [{**ITEM, "result": "O"}, {**ITEM2, "result": "♦"}]}))
    before = _state(env, itr_id)
    assert _approve(env, itr_id).status_code == 400
    _unchanged(_state(env, itr_id), before)


# ── 5. history is not rewritten ──────────────────────────────────────────

def _legacy_fail_without_x(env, inst, results=("O", "/")):
    """Historical row written under the old rule: no X anywhere, yet status Fail."""
    _seed_row(env, inst, status="Fail", passCount=1, failCount=0, detail_data=_body(list(results)))


def test_a_legacy_fail_can_be_reopened_and_is_then_saved_under_the_new_rule(env):
    editor, _, closer, itr_id, inst = _linked(env)
    _legacy_fail_without_x(env, inst)
    before = _row(env, inst)
    # the editor cannot touch results of a closed checklist ...
    assert _put(editor, inst, "Ongoing", ["O", "/"]).status_code in (400, 403)
    assert _row(env, inst) == before
    # ... the close-permission holder reopens (pure Reopen: exempt from re-deriving the old result)
    r = closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"})
    assert r.status_code == 200, r.text
    reopened = _row(env, inst)
    assert reopened["status"] == "Ongoing"
    assert (reopened["passCount"], reopened["failCount"], reopened["detail_data"]) == (1, 0, before["detail_data"])
    # saving again follows the new rule: O + '/' can no longer be a Fail
    assert _put(editor, inst, "Fail", ["O", "/"]).status_code == 400
    assert _put(editor, inst, "Ongoing", ["O", "/"]).status_code == 200
    assert _put(editor, inst, "Fail", ["X", "/"]).status_code == 200


def test_an_unrelated_edit_never_recomputes_a_legacy_fail(env):
    _, _, closer, itr_id, inst = _linked(env)                               # a closed checklist: any PUT needs checklist:close:all
    _legacy_fail_without_x(env, inst)
    before = _row(env, inst)
    r = closer.put(f"/api/checklist/{inst}/", json={"location": "Grid B-4"})
    assert r.status_code == 200, r.text
    after = _row(env, inst)
    assert (after["status"], after["passCount"], after["failCount"], after["detail_data"]) == \
           (before["status"], before["passCount"], before["failCount"], before["detail_data"]) == \
           ("Fail", 1, 0, before["detail_data"])


def test_viewing_never_rewrites_anything(env):
    editor, _, _, itr_id, inst = _linked(env)
    _legacy_fail_without_x(env, inst)
    before, audits = _row(env, inst), _audit_total(env)
    assert editor.get(f"/api/checklist/{inst}/").json()["status"] == "Fail"
    assert editor.get("/api/checklist/", params={"itr_id": itr_id}).status_code == 200
    assert _row(env, inst) == before and _audit_total(env) == audits


def test_an_approval_snapshot_taken_before_the_rule_is_not_rewritten_by_later_reopens_elsewhere(env):
    """Approved snapshot stays byte-identical while a different ITR's legacy Fail is reopened and re-saved."""
    itr_a, _ = _ready_itr(env)
    assert _approve(env, itr_a).status_code == 200
    snap_before = _state(env, itr_a)
    editor, _, closer, itr_b, inst = _linked(env)
    _legacy_fail_without_x(env, inst)
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200
    assert _put(editor, inst, "Ongoing", ["O", "/"]).status_code == 200
    _unchanged(_state(env, itr_a), snap_before)


# ── 6. mutation check of the new backend Fail guard ──────────────────────

def test_the_fail_guard_is_what_refuses_o_plus_na_fail(env, monkeypatch):
    """Sanity of the tests above: with the guard neutralised the forged Fail would be accepted."""
    editor, _, _, _, inst = _linked(env)
    assert _put(editor, inst, "Fail", ["O", "/"]).status_code == 400
    monkeypatch.setattr(svc, "fail_support_problems", lambda *a, **k: [])
    r = _put(editor, inst, "Fail", ["O", "/"])
    assert r.status_code == 200, "guard removed -> forged Fail slips through (proves the test bites)"


# ── 7. read-only inventory of historical "Fail without any X" ────────────

def test_inventory_lists_legacy_fail_without_x_separating_templates_from_instances_and_writes_nothing(env):
    from scripts.verification.checklist_itr_inventory import find_fail_without_x
    editor, _, _, itr_id, inst = _linked(env)
    _legacy_fail_without_x(env, inst)                                           # an ITR instance: O + N/A saved as Fail
    tpl_id = editor.post("/api/checklist/", json={"activity": "Old template", "date": "2026-09-20", "status": "Ongoing",
                                                  "detail_data": json.dumps({"items": [ITEM]})}).json()["id"]
    _seed_row(env, tpl_id, status="Fail", passCount=0, failCount=0, detail_data=_body(["/"]))   # a bare template (anomalous)
    good_id = editor.post("/api/checklist/", json={"activity": "Real fail", "date": "2026-09-20", "status": "Ongoing",
                                                   "detail_data": json.dumps({"items": [ITEM]})}).json()["id"]
    _seed_row(env, good_id, status="Fail", passCount=0, failCount=1, detail_data=_body(["X"]))  # has an X: not reported
    before = (_row(env, inst), _row(env, tpl_id), _row(env, good_id), _audit_total(env))
    db = env.Session()
    try:
        recs = {i: db.get(models.Checklist, i).recordsNo for i in (inst, tpl_id, good_id)}
        n, hits = find_fail_without_x(db)
    finally:
        db.close()
    assert n == 2
    assert any(h.startswith(recs[inst] + " [instance") for h in hits)
    assert any(h.startswith(recs[tpl_id] + " [template") for h in hits)
    assert not any(recs[good_id] in h for h in hits)
    assert (_row(env, inst), _row(env, tpl_id), _row(env, good_id), _audit_total(env)) == before   # read-only


# ══ 8. Ongoing is judged against the merged items too (2026-09-20, follow-up) ═══════════════
# Independently reproduced gap: a normal update carrying results + correct counts + status='Ongoing' was stored as
# Ongoing even when the items derive to Pass (O+O) or Fail (X+O). Only a declared Pass/Fail used to be verified.

@pytest.mark.parametrize("results,derived", [(["O", "O"], "Pass"), (["X", "O"], "Fail"), (["X", "X"], "Fail"), (["X", "/"], "Fail")])
def test_results_that_derive_pass_or_fail_cannot_be_declared_ongoing(env, results, derived):
    editor, _, _, _, inst = _linked(env)
    before, audits = _row(env, inst), _audit_total(env)
    r = _put(editor, inst, "Ongoing", results)                     # counts are the correct O / X counts
    assert r.status_code == 400, r.text
    assert derived in r.json()["detail"] and "Ongoing" in r.json()["detail"]
    assert _row(env, inst) == before and _audit_total(env) == audits      # not silently corrected either


@pytest.mark.parametrize("results,claimed_counts", [(["O", "O"], (2, 0)), (["X", "O"], (1, 1))])
def test_results_and_counts_with_status_omitted_are_judged_on_the_merged_status(env, results, claimed_counts):
    """The stored status is Ongoing, so omitting status still means 'Ongoing' — and the items say otherwise."""
    editor, _, _, _, inst = _linked(env)
    before, audits = _row(env, inst), _audit_total(env)
    r = editor.put(f"/api/checklist/{inst}/", json={"passCount": claimed_counts[0], "failCount": claimed_counts[1],
                                                    "detail_data": _body(results)})
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before and _audit_total(env) == audits
    r = editor.put(f"/api/checklist/{inst}/", json={"detail_data": _body(results)})             # results only, no counts, no status
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


def test_counts_only_change_over_stored_all_o_items_is_judged_on_the_merged_row(env):
    editor, _, _, _, inst = _linked(env)
    _seed_row(env, inst, status="Ongoing", passCount=0, failCount=0, detail_data=_body(["O", "O"]))   # legacy-shaped drift
    before = _row(env, inst)
    r = editor.put(f"/api/checklist/{inst}/", json={"passCount": 2})                             # now consistent, but Ongoing over O+O
    assert r.status_code == 400, r.text
    assert _row(env, inst) == before


@pytest.mark.parametrize("results,status", [(["O", "O"], "Pass"), (["X", "O"], "Fail"), (["X", "/"], "Fail")])
def test_the_correct_pass_or_fail_declaration_still_succeeds(env, results, status):
    editor, _, _, _, inst = _linked(env)
    assert _put(editor, inst, status, results).status_code == 200
    assert _row(env, inst)["status"] == status


@pytest.mark.parametrize("results", [["O", "/"], ["/", "/"], ["X", ""], ["O", ""], ["", ""], ["X", "♦"]])
def test_ongoing_derived_results_are_still_saved_as_ongoing(env, results):
    editor, _, _, _, inst = _linked(env)
    r = _put(editor, inst, "Ongoing", results)
    assert r.status_code == 200, r.text
    row = _row(env, inst)
    assert (row["status"], row["passCount"], row["failCount"]) == ("Ongoing", *_counts(results))


@pytest.mark.parametrize("closed", ["Pass", "Fail"])
def test_a_pure_reopen_still_works_and_a_reopen_carrying_result_changes_does_not(env, closed):
    editor, _, closer, _, inst = _linked(env)
    results = ["O", "O"] if closed == "Pass" else ["X", "O"]
    assert _put(editor, inst, closed, results).status_code == 200
    closed_row = _row(env, inst)
    # carrying a change of results (or of counts) is not a pure Reopen — it is refused whatever it derives to
    for body in ({"status": "Ongoing", "passCount": 1, "failCount": 0, "detail_data": _body(["O", ""])},
                 {"status": "Ongoing", "passCount": 2, "failCount": 0, "detail_data": _body(["O", "O"] if closed == "Fail" else ["O", "/"])},
                 {"status": "Ongoing", "passCount": 0}):
        r = closer.put(f"/api/checklist/{inst}/", json=body)
        assert r.status_code == 400, (body, r.text)
        assert _row(env, inst) == closed_row
    # the pure Reopen (status only, or a byte-for-byte resend of the stored results alongside it) succeeds
    r = closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing", "passCount": closed_row["passCount"],
                                                    "failCount": closed_row["failCount"], "detail_data": closed_row["detail_data"]})
    assert r.status_code == 200, r.text
    reopened = _row(env, inst)
    assert reopened["status"] == "Ongoing" and reopened["detail_data"] == closed_row["detail_data"]
    assert (reopened["passCount"], reopened["failCount"]) == (closed_row["passCount"], closed_row["failCount"])


def test_a_legacy_row_stored_as_ongoing_over_pass_items_is_not_recomputed_by_unrelated_changes(env):
    editor, _, _, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Ongoing", passCount=2, failCount=0, detail_data=_body(["O", "O"]))   # history: O+O left Ongoing
    before = _row(env, inst)
    assert editor.put(f"/api/checklist/{inst}/", json={"location": "Grid C-2"}).status_code == 200
    assert editor.put(f"/api/checklist/{inst}/", json={"status": "Ongoing", "passCount": 2, "failCount": 0,
                                                       "detail_data": before["detail_data"]}).status_code == 200      # byte-for-byte resend
    after = _row(env, inst)
    assert (after["status"], after["passCount"], after["failCount"], after["detail_data"]) == \
           (before["status"], before["passCount"], before["failCount"], before["detail_data"])
    assert editor.get(f"/api/checklist/{inst}/").json()["status"] == "Ongoing"              # viewing never recomputes


def test_the_ongoing_check_leaves_approval_and_the_frozen_parent_alone(env):
    itr_id, insts = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    before = _state(env, itr_id)
    closer = env.login("acc_closer")                                                        # (any PUT on a closed checklist needs close)
    r = _put(closer, insts[0], "Ongoing", ["O", "O"])
    assert r.status_code == 400 and "Approved" in r.text                                    # the parent-ITR lock still answers first
    _unchanged(_state(env, itr_id), before)


def test_the_ongoing_guard_is_what_refuses_o_plus_o_ongoing(env, monkeypatch):
    """Mutation check: neutralise the derived-status comparison and the counterexample is accepted again."""
    editor, _, _, _, inst = _linked(env)
    assert _put(editor, inst, "Ongoing", ["O", "O"]).status_code == 400
    monkeypatch.setattr(svc, "derive_checklist_status", lambda summary: "Ongoing")
    assert _put(editor, inst, "Ongoing", ["O", "O"]).status_code == 200
