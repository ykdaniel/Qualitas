"""HTTP/API tests for the four-way result + N/A reason rules (2026-09-19).

Same real-login, real-DB setup as test_checklist_pass_integrity_http.py (its
helpers are reused). Covers the backend half of the requirement: a NEW N/A
needs a non-blank reason, an untouched historical '/' does not (and is never
given one), reasons count as evidence and survive being cleared, re-inspection
clears them without touching the original, and N/A — with or without a reason —
still cannot support a Pass or an ITR approval.
"""
import json

import pytest

import models
from test_itr_revoke_approval_acceptance import env, _mk_itr, ITEM  # noqa: F401
from test_checklist_pass_integrity_http import (  # noqa: F401
    ITEM2, _linked, _row, _seed_row, _seed_itr, _audit_total, _inst_id, _itr_row,
)


def _items(*specs):
    """specs: (result, naReason|None) per item, aligned with ITEM, ITEM2."""
    out = []
    for base, (result, reason) in zip((ITEM, ITEM2), specs):
        it = {**base, "result": result}
        if reason is not None:
            it["naReason"] = reason
        out.append(it)
    return json.dumps({"items": out})


def _put(editor, inst, specs, status="Ongoing", pc=0, fc=0):
    return editor.put(f"/api/checklist/{inst}/", json={
        "detail_data": _items(*specs), "status": status, "passCount": pc, "failCount": fc})


# ── a NEW N/A needs a reason ─────────────────────────────────────────────

@pytest.mark.parametrize("reason", [None, "", "   ", "\t"])
def test_new_na_without_reason_is_rejected_and_nothing_changes(env, reason):
    editor, *_, inst = _linked(env)
    before, audits = _row(env, inst), _audit_total(env)
    r = _put(editor, inst, [("/", reason), ("", None)])
    assert r.status_code == 400, r.text
    assert "marked N/A but has no reason" in r.json()["detail"]
    assert _row(env, inst) == before and _audit_total(env) == audits


def test_new_na_with_reason_is_saved_with_the_reason(env):
    editor, *_, inst = _linked(env)
    r = _put(editor, inst, [("/", "no rebar in this bay"), ("O", None)], pc=1)
    assert r.status_code == 200, r.text
    items = json.loads(_row(env, inst)["detail_data"])["items"]
    assert items[0]["result"] == "/" and items[0]["naReason"] == "no rebar in this bay"
    assert items[0]["situation"] == ""                      # kept separate from the observation


def test_non_na_item_cannot_carry_a_reason(env):
    editor, *_, inst = _linked(env)
    before = _row(env, inst)
    r = _put(editor, inst, [("O", "stale reason"), ("", None)], pc=1)
    assert r.status_code == 400 and "result is not N/A" in r.json()["detail"]
    assert _row(env, inst) == before


# ── historical '/' is neither blocked nor "repaired" ─────────────────────

def test_untouched_historical_na_is_kept_without_inventing_a_reason(env):
    editor, *_, inst = _linked(env)
    legacy = _items(("/", None), ("", None))
    _seed_row(env, inst, detail_data=legacy)
    # an unrelated edit (the other item's observation) resends item 1 exactly as it was
    body = json.loads(legacy)
    body["items"][1]["situation"] = "checked on site"
    r = editor.put(f"/api/checklist/{inst}/", json={"detail_data": json.dumps(body)})
    assert r.status_code == 200, r.text
    saved = json.loads(_row(env, inst)["detail_data"])["items"]
    assert saved[0]["result"] == "/" and "naReason" not in saved[0]     # not invented
    assert saved[1]["situation"] == "checked on site"


def test_a_second_new_na_still_needs_its_reason_next_to_a_legacy_one(env):
    editor, *_, inst = _linked(env)
    _seed_row(env, inst, detail_data=_items(("/", None), ("", None)))
    r = _put(editor, inst, [("/", None), ("/", None)])
    assert r.status_code == 400 and "'Cover'" in r.json()["detail"] and "'Spacing'" not in r.json()["detail"]


def test_legacy_na_can_be_given_a_reason_but_not_lose_one(env):
    editor, *_, inst = _linked(env)
    _seed_row(env, inst, detail_data=_items(("/", None), ("", None)))
    assert _put(editor, inst, [("/", "added later"), ("", None)]).status_code == 200
    r = _put(editor, inst, [("/", ""), ("", None)])                      # clearing a recorded reason = a change
    assert r.status_code == 400 and "no reason" in r.json()["detail"]
    assert json.loads(_row(env, inst)["detail_data"])["items"][0]["naReason"] == "added later"


def test_returning_to_na_after_leaving_it_needs_a_reason_again(env):
    editor, *_, inst = _linked(env)
    _seed_row(env, inst, detail_data=_items(("/", None), ("", None)))
    assert _put(editor, inst, [("O", None), ("", None)], pc=1).status_code == 200
    assert _put(editor, inst, [("/", None), ("", None)]).status_code == 400
    assert _put(editor, inst, [("/", "applies after all"), ("", None)]).status_code == 200


# ── reasons are evidence; clearing them does not lift protection ─────────

def test_reason_counts_as_evidence_and_clearing_it_keeps_protection_and_history(env):
    from services.checklist_service import _instance_has_historical_evidence
    editor, approver, _, itr_id, inst = _linked(env)
    assert _put(editor, inst, [("/", "not part of this pour"), ("", None)]).status_code == 200
    db = env.Session()
    marked_at = db.get(models.Checklist, inst).evidence_recorded_at
    db.close()
    assert marked_at                                                     # first evidence recorded

    # revert to unfilled and clear the reason (allowed: nothing here is locked)
    assert _put(editor, inst, [("", None), ("", None)]).status_code == 200
    db = env.Session()
    row = db.get(models.Checklist, inst)
    assert row.evidence_recorded_at == marked_at                         # marker survives
    assert _instance_has_historical_evidence(row) is True
    db.close()

    # unlink is still refused, and the audit trail still holds the cleared reason
    r = editor.delete(f"/api/itr/{itr_id}/link-checklist/{inst}")
    assert r.status_code == 400
    db = env.Session()
    logs = db.query(models.AuditLog).filter_by(entity_type="Checklist", entity_id=inst, action="UPDATE").all()
    assert any("not part of this pour" in (l.new_value or "") for l in logs)
    assert any("not part of this pour" in (l.old_value or "") for l in logs)
    assert db.get(models.Checklist, inst) is not None
    db.close()


# ── re-inspection ────────────────────────────────────────────────────────

def test_reinspection_clears_reasons_observations_and_results_original_untouched(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    body = json.loads(_items(("X", None), ("/", "cover not applicable here")))
    body["items"][0]["situation"] = "Measured 350mm"
    assert editor.put(f"/api/checklist/{inst}/", json={
        "detail_data": json.dumps(body), "status": "Fail", "passCount": 0, "failCount": 1}).status_code == 200
    _seed_itr(env, itr_id, inspectionResult="Fail")
    original = _row(env, inst)

    r = editor.post(f"/api/itr/{itr_id}/re-inspect")
    assert r.status_code == 200, r.text
    fresh = json.loads(_row(env, _inst_id(env, r.json()["id"]))["detail_data"])["items"]
    assert [(i["item"], i["criteria"]) for i in fresh] == [("Spacing", "<=200mm"), ("Cover", ">=40mm")]
    assert all(i["result"] == "" and i["situation"] == "" and "naReason" not in i for i in fresh)
    assert _row(env, inst) == original                                   # reason still on the original
    assert json.loads(original["detail_data"])["items"][1]["naReason"] == "cover not applicable here"


# ── snapshots keep the reason ────────────────────────────────────────────

def test_revoke_snapshot_stores_na_reasons_verbatim(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    _seed_row(env, inst, status="Pass", passCount=1, detail_data=_items(("O", None), ("/", "historic reason")))
    _seed_itr(env, itr_id, status="Approved")
    assert approver.post(f"/api/itr/{itr_id}/revoke-approval",
                         json={"new_status": "In Progress", "reason": "na snapshot"}).status_code == 200
    db = env.Session()
    old = json.loads(db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="na snapshot").one().old_value)
    db.close()
    assert old["checklists"][0]["items"][1]["naReason"] == "historic reason"


# ── the approval boundary is unchanged: N/A never supports Pass ─────────

@pytest.mark.parametrize("specs,pc", [
    ([("O", None), ("/", "not applicable")], 1),      # O + N/A, with a reason
    ([("/", "n/a one"), ("/", "n/a two")], 0),        # all N/A, with reasons
])
def test_na_even_with_reasons_cannot_be_pass_or_approved(env, specs, pc):
    editor, approver, _, itr_id, inst = _linked(env)
    r = _put(editor, inst, specs, status="Pass", pc=pc)
    assert r.status_code == 400 and "N/A" in r.json()["detail"]
    # and a legacy Pass with N/A can't carry a new approval either
    _seed_row(env, inst, status="Pass", passCount=pc, detail_data=_items(*specs))
    r = approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    assert r.status_code == 400 and "not supported" in r.json()["detail"]
    assert _itr_row(env, itr_id)["status"] == "In Progress"


def test_valid_all_o_still_passes_and_approves(env):
    editor, approver, _, itr_id, inst = _linked(env)
    assert _put(editor, inst, [("O", None), ("O", None)], status="Pass", pc=2).status_code == 200
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200


# ── inventory ────────────────────────────────────────────────────────────

def test_inventory_lists_historical_na_without_reason_read_only(env):
    from scripts.verification.checklist_itr_inventory import find_na_items_without_reason
    editor, *_, inst = _linked(env)
    _seed_row(env, inst, detail_data=_items(("/", None), ("/", "has one")))
    before = _row(env, inst)
    db = env.Session()
    rec = db.get(models.Checklist, inst).recordsNo
    n, hits = find_na_items_without_reason(db)
    db.close()
    assert n >= 1 and any(h.startswith(rec + " ") and "1 N/A item" in h for h in hits)
    assert _row(env, inst) == before
