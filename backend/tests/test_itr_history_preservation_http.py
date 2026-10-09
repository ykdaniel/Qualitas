"""ITR history preservation: no hard delete that breaks the record chain (2026-09-20, round 5).

Before: `delete_itr` looked only at status (Approved/Void), NCR references and Checklist evidence.
An ITR that had been approved and then REVOKED (status back to In Progress), or a historical/anomalous
one with no checklists, could be hard-deleted — taking its approval history with it — and deleting an
original ITR silently CLEARED every re-inspection's `originalItrId`, cutting the first-inspection ->
re-inspection chain.

Rules now (all checked on the locked, re-read state, before anything is written):
  1. any ITRApprovalEvent for the ITR protects it; so does an approvedBy / approvedAt saved on the row
     itself (records from before events existed). ITRs with neither are NOT guessed about and nothing
     is back-filled;
  2. an ITR that another ITR refers to through originalItrId cannot be deleted (the pointer is never
     cleared to make a delete succeed);
  3. a never-approved, evidence-free, unreferenced (mistakenly created) ITR is still deleted as before.

This is a deliberate CHANGE of the history-preservation rule: the older tests that expected a delete to
clear the re-inspections' originalItrId were rewritten to refuse-and-preserve (see the notes in
test_itr_write_paths_atomic_http.py and test_itr_service.py).

Same harness as test_itr_state_protection_http.py: in-memory DB for the refusal/legit cases, an
isolated file-backed SQLite DB with threads for the races (each asserts the window really opened).
"""
import json

import pytest

import models
from test_itr_state_protection_http import (   # noqa: F401  (fixtures re-exported on purpose)
    _Window, _add_second_approver, _full_world, _ready_itr, _run_pair, _set, _state,
    env, file_env, full, race,
)
from test_itr_revoke_approval_acceptance import _mk_itr
from test_itr_write_paths_atomic_http import _audit_rows, _itr_with_instances, _world


def _approve_and_revoke(env, itr_id):
    from test_itr_approval_events_http import _approve
    assert _approve(env, itr_id).status_code == 200
    r = env.login("acc_approver").post(f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress", "reason": "history test"})
    assert r.status_code == 200, r.text


def _drop_checklists(env, itr_id):
    db = env.Session()
    try:
        db.query(models.Checklist).filter(models.Checklist.itrId == itr_id).delete()
        db.commit()
    finally:
        db.close()


def _refused(full, env, itr_id, message_part):
    before = _full_world(env, itr_id)
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 400 and message_part in r.text, r.text
    after = _full_world(env, itr_id)
    assert after == before                                             # ITR row, checklists, NCRs, audits, sequences, events (incl. snapshots)
    assert itr_id in after["itr"]
    return after


# ══ 1. approval history ═════════════════════════════════════════════════

def test_a_really_approved_then_revoked_itr_cannot_be_deleted(env, full):
    _add_second_approver(env)
    itr_id, _ = _ready_itr(env)
    _approve_and_revoke(env, itr_id)
    st = _state(env, itr_id)
    assert st["itr"]["status"] == "In Progress" and [e["event_type"] for e in st["events"]] == ["APPROVED", "REVOKED"]
    after = _refused(full, env, itr_id, "approval history")
    assert len(after["events"]) == 2 and after["events"][0]["itr_snapshot"] and after["events"][0]["checklists_snapshot"]   # snapshots intact


def test_events_alone_protect_an_itr_whose_checklists_are_gone(env, full):
    """Simulated anomalous history: events exist, no Checklist rows at all — neither evidence nor status can be the reason."""
    _add_second_approver(env)
    itr_id, _ = _ready_itr(env)
    _approve_and_revoke(env, itr_id)
    _drop_checklists(env, itr_id)
    assert _world(env)["checklist"] and not any(c["itrId"] == itr_id for c in _world(env)["checklist"].values())
    _refused(full, env, itr_id, "approval history")


@pytest.mark.parametrize("fields", [{"approvedBy": "7"}, {"approvedAt": "2026-01-02T03:04:05+00:00"},
                                    {"approvedBy": "7", "approvedAt": "2026-01-02T03:04:05+00:00"}])
def test_a_saved_approver_or_time_without_any_event_also_protects_the_itr(env, full, fields):
    itr_id = _mk_itr(env)                                              # no checklists, no events, In Progress
    _set(env, itr_id, **fields)
    after = _refused(full, env, itr_id, "approval history")
    assert after["events"] == [] and after["itr"][itr_id]["approvedBy"] == fields.get("approvedBy")   # nothing was back-filled or cleared


@pytest.mark.parametrize("empty", [None, "", "   "])
def test_an_itr_with_no_recorded_approval_history_is_not_guessed_about(env, full, empty):
    itr_id = _mk_itr(env)
    _set(env, itr_id, approvedBy=empty, approvedAt=empty)
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 200 and itr_id not in _world(env)["itr"]
    assert len(_audit_rows(env, "DELETE", itr_id, "ITR")) == 1


# ══ 2. re-inspection chain ══════════════════════════════════════════════

def test_an_original_with_a_reinspection_cannot_be_deleted_and_the_pointer_is_preserved(env, full):
    original, insts = _itr_with_instances(env, n=1, fail=True)         # untouched instance: only the reference can be the reason
    child = full.post(f"/api/itr/{original}/re-inspect")
    assert child.status_code == 200, child.text
    child_id, child_no = child.json()["id"], child.json()["documentNumber"]
    after = _refused(full, env, original, child_no)
    assert after["itr"][child_id]["originalItrId"] == original and insts[0] in after["checklist"]


def test_the_whole_chain_is_protected_link_by_link(env, full):
    first, _ = _itr_with_instances(env, n=1, fail=True)
    second = full.post(f"/api/itr/{first}/re-inspect").json()["id"]
    _set(env, second, inspectionResult="Fail")
    third = full.post(f"/api/itr/{second}/re-inspect").json()["id"]
    _refused(full, env, first, "refer to it as their original")
    _refused(full, env, second, "refer to it as their original")
    w = _world(env)
    assert w["itr"][third]["originalItrId"] == second and w["itr"][second]["originalItrId"] == first
    assert full.delete(f"/api/itr/{third}").status_code == 200                       # the LAST link is referenced by nobody
    assert third not in _world(env)["itr"] and _world(env)["itr"][second]["originalItrId"] == first


# ══ 3. legitimate mistaken records are unaffected ═══════════════════════

def test_a_never_approved_unreferenced_evidence_free_itr_is_still_deleted_with_its_audit(env, full):
    itr_id, insts = _itr_with_instances(env, n=2)
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 200
    w = _world(env)
    assert itr_id not in w["itr"] and not any(i in w["checklist"] for i in insts)
    (a,) = _audit_rows(env, "DELETE", itr_id, "ITR")
    assert a["username"] == "acc_full"


def test_existing_refusals_are_unchanged(env, full):
    itr_id, _ = _itr_with_instances(env, n=1, fill=True)
    _refused(full, env, itr_id, "evidence")
    approved = _mk_itr(env); _set(env, approved, status="Approved")
    _refused(full, env, approved, "locked record")


# ══ 4. races with re-inspection ═════════════════════════════════════════

def test_reinspection_first_then_a_late_delete_is_refused_and_the_new_reinspection_keeps_its_source(race):
    env, engine = race
    original, _ = _itr_with_instances(env, n=1, fail=True)
    full = env.login("acc_full")
    window = _Window(engine, "insert into itr (")                                    # the new re-inspection ITR being inserted
    try:
        out = _run_pair(lambda: full.post(f"/api/itr/{original}/re-inspect").status_code,
                        lambda: full.delete(f"/api/itr/{original}").status_code)
    finally:
        window.close()
    assert window.fired
    w = _world(env)
    (child,) = [i for i in w["itr"].values() if i["originalItrId"] == original]
    assert out["first"] == 200 and out["second"] == 400
    assert original in w["itr"] and child["originalItrId"] == original             # the source survived; nothing was orphaned


def test_delete_first_then_a_late_reinspection_finds_no_source_and_creates_nothing(race):
    env, engine = race
    original, _ = _itr_with_instances(env, n=1, fail=True)
    full = env.login("acc_full")
    before_ids = set(_world(env)["itr"])
    window = _Window(engine, "delete from checklist")                                # delete holds its transaction
    try:
        out = _run_pair(lambda: full.delete(f"/api/itr/{original}").status_code,
                        lambda: full.post(f"/api/itr/{original}/re-inspect").status_code)
    finally:
        window.close()
    assert window.fired
    w = _world(env)
    assert out["first"] == 200 and out["second"] == 404
    assert original not in w["itr"] and set(w["itr"]) == before_ids - {original}
    assert not any(i["originalItrId"] == original for i in w["itr"].values())        # no re-inspection that lost its source
    assert not any(c["itrId"] == original for c in w["checklist"].values())
    assert len(_audit_rows(env, "DELETE", original, "ITR")) == 1 and not _audit_rows(env, "CREATE_REINSPECTION", original, "ITR")
