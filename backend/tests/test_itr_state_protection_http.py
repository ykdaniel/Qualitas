"""ITR status protection and the races around it (2026-09-20, round 4).

Two independently reproduced gaps, plus the check-then-write races behind them:

1. `POST /itr/{id}/create-ncr` on an Approved or Void ITR (inspectionResult=Fail) returned 200 and
   rewrote the source ITR's `ncrNumber` — a write into a locked record.
2. `DELETE /itr/{id}` on an Approved or Void ITR with no checklist evidence returned 200 and deleted
   the record. (Historical / anomalous data can look like that; the parent record's protection must
   not depend on what its checklists happen to contain.)

Now: Approved / Void ITRs are never deleted and never receive the create-NCR write-back; delete,
create-NCR and create-re-inspection take the ITR write lock FIRST and re-read AFTER it, then check
status, scope, evidence and eligibility on that locked state, and copy from it. A row deleted by the
request that held the lock first is reported as not found, never a 500.

The re-inspection eligibility rule (inspectionResult Fail, or status Reject) applies on top of the
Approved/Void boundary added 2026-09-29 (business decision, confirmed after isolated verification
found the prior code let both through): Void is terminal and can never be re-inspected; Approved
must first go back to In Progress via revoke-approval before the usual eligibility rule is even
considered.

Part 1 (in-memory DB, real routes/logins/Sessions): refusals change nothing; legitimate flows still work.
Part 2 (file-backed SQLite, threads): real competing requests; every test asserts the race window
really opened. Nothing here imports `main`.
"""
import json
import threading  # noqa: F401  (used by the shared window helper)

import pytest

import models
from core import perms
from core.security import get_password_hash
from test_itr_approval_events_http import (   # noqa: F401  (fixtures re-exported on purpose)
    ITEM, PW, _Window, _add_second_approver, _approve, _ready_itr, _run_pair, _state,
    env, file_env,
)
from test_itr_revoke_approval_acceptance import _get_or_create_perm, _mk_itr
from test_itr_write_paths_atomic_http import _audit_rows, _itr_with_instances, _world


# ── helpers ──────────────────────────────────────────────────────────────

def _add_full_user(env):
    db = env.Session()
    try:
        role = models.Role(name="AcceptFull")
        role.permissions_rel = [_get_or_create_perm(db, c) for c in (
            perms.ITR_VIEW, perms.ITR_CREATE, perms.ITR_UPDATE, perms.ITR_DELETE, perms.NCR_CREATE, perms.NCR_VIEW,
            perms.CHECKLIST_VIEW, perms.CHECKLIST_CREATE, perms.CHECKLIST_UPDATE)]
        db.add(role); db.flush()
        db.add(models.User(username="acc_full", email="acc_full@example.com", full_name="Fay Full", is_active=True,
                           hashed_password=get_password_hash(PW), role_id=role.id))
        db.commit()
    finally:
        db.close()


@pytest.fixture
def full(env):
    _add_full_user(env)
    return env.login("acc_full")


def _set(env, itr_id, **fields):
    db = env.Session()
    try:
        itr = db.get(models.ITR, itr_id)
        for k, v in fields.items():
            setattr(itr, k, v)
        db.commit()
    finally:
        db.close()


def _full_world(env, itr_id):
    """Everything that must stay identical after a refusal — including approval events and sequences."""
    w = _world(env)
    w["events"] = _state(env, itr_id)["events"] if itr_id in w["itr"] else None
    return w


# ══ Part 1 — the four reproduced counter-examples are now refusals ═══════

@pytest.mark.parametrize("status", ["Approved", "Void"])
def test_create_ncr_from_an_approved_or_void_itr_is_refused_and_writes_nothing(env, full, status):
    itr_id, _ = _itr_with_instances(env, n=1, fail=True)            # inspectionResult = Fail, untouched instance
    _set(env, itr_id, status=status)
    before = _full_world(env, itr_id)
    r = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert r.status_code == 400 and status in r.text and "locked" in r.text
    after = _full_world(env, itr_id)
    assert after == before                                          # ITR row (ncrNumber), NCRs, audits, sequences, events
    assert after["itr"][itr_id]["ncrNumber"] is None and after["ncr"] == before["ncr"]


@pytest.mark.parametrize("status", ["Approved", "Void"])
@pytest.mark.parametrize("shape", ["no_checklists", "untouched_instance"])
def test_delete_of_an_approved_or_void_itr_is_refused_even_without_any_checklist_evidence(env, full, status, shape):
    if shape == "no_checklists":
        itr_id = _mk_itr(env)                                       # historical/anomalous: nothing that counts as evidence
    else:
        itr_id, _ = _itr_with_instances(env, n=1)
    _set(env, itr_id, status=status)
    before = _full_world(env, itr_id)
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 400 and status in r.text and "locked" in r.text
    assert _full_world(env, itr_id) == before


def test_a_real_approval_record_is_never_rewritten_by_the_refused_actions(env, full):
    _add_second_approver(env)
    itr_id, _ = _ready_itr(env)
    _set(env, itr_id, inspectionResult="Fail")
    assert _approve(env, itr_id).status_code == 200
    before = _full_world(env, itr_id)
    assert len(before["events"]) == 1
    assert full.post(f"/api/itr/{itr_id}/create-ncr").status_code == 400
    assert full.delete(f"/api/itr/{itr_id}").status_code == 400
    after = _full_world(env, itr_id)
    assert after == before and after["events"][0]["itr_snapshot"] == before["events"][0]["itr_snapshot"]       # events and snapshots untouched


# ══ Part 1b — legitimate, unlocked flows still work ═════════════════════

def test_unlocked_itrs_can_still_be_deleted_and_can_still_raise_an_ncr(env, full):
    itr_id, insts = _itr_with_instances(env, n=1, fail=True)         # In Progress, Fail, no evidence
    ncr = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert ncr.status_code == 200 and _world(env)["itr"][itr_id]["ncrNumber"] == ncr.json()["documentNumber"]
    _set(env, itr_id, ncrNumber=None)
    rejected, _ = _itr_with_instances(env, n=1)
    _set(env, rejected, status="Reject")                             # 'Reject' is the other allowed source state
    assert full.post(f"/api/itr/{rejected}/create-ncr").status_code == 200
    assert full.delete(f"/api/itr/{itr_id}").status_code == 200
    assert itr_id not in _world(env)["itr"]


def test_reinspection_eligibility_and_the_approved_void_boundary_never_modify_the_original(env, full):
    itr_id, insts = _itr_with_instances(env, n=1, fail=True, fill=True)
    ok = full.post(f"/api/itr/{itr_id}/re-inspect")
    assert ok.status_code == 200
    ok_itr = _world(env)["itr"][ok.json()["id"]]
    assert ok_itr["originalItrId"] == itr_id and ok_itr["status"] == "In Progress"
    not_failed, _ = _itr_with_instances(env, n=1)
    assert full.post(f"/api/itr/{not_failed}/re-inspect").status_code == 400            # same rule as before

    # 2026-09-29 business decision: Approved must go back to In Progress via revoke-approval
    # first — re-inspecting straight off an Approved record is refused outright, even though
    # inspectionResult is still Fail (approval only checks the linked checklists, not this field).
    approved, _ = _itr_with_instances(env, n=1, fail=True)
    _set(env, approved, status="Approved")
    before_approved = _full_world(env, approved)
    resp = full.post(f"/api/itr/{approved}/re-inspect")
    assert resp.status_code == 400
    assert "Revoke the approval" in resp.json()["detail"]
    assert _full_world(env, approved) == before_approved                              # writes nothing into the locked original

    # Void is terminal: never re-inspectable, regardless of inspectionResult.
    voided, _ = _itr_with_instances(env, n=1, fail=True)
    _set(env, voided, status="Void")
    before_void = _full_world(env, voided)
    resp = full.post(f"/api/itr/{voided}/re-inspect")
    assert resp.status_code == 400
    assert "Void" in resp.json()["detail"]
    assert _full_world(env, voided) == before_void

    # After a legitimate revoke back to In Progress, the usual eligibility rule applies again.
    revoke = env.login("acc_approver").post(
        f"/api/itr/{approved}/revoke-approval",
        json={"new_status": "In Progress", "reason": "Boundary acceptance: reassess failed inspection"})
    assert revoke.status_code == 200, revoke.text
    resp = full.post(f"/api/itr/{approved}/re-inspect")
    assert resp.status_code == 200
    reinspected = _world(env)["itr"][resp.json()["id"]]
    assert reinspected["originalItrId"] == approved and reinspected["status"] == "In Progress"


@pytest.mark.parametrize("status", ["Approved", "Void"])
@pytest.mark.parametrize("result", ["Fail", "Pass"])
def test_reinspection_locked_status_refusal_preserves_all_related_rows(env, full, status, result):
    itr_id, _ = _itr_with_instances(env, n=1, fill=True)
    _set(env, itr_id, status=status, inspectionResult=result)
    before = _full_world(env, itr_id)
    response = full.post(f"/api/itr/{itr_id}/re-inspect")
    assert response.status_code == 400
    assert status in response.json()["detail"]
    assert _full_world(env, itr_id) == before


def test_real_approval_then_revoke_restores_reinspection_without_changing_source(env, full):
    itr_id, _ = _ready_itr(env)
    _set(env, itr_id, inspectionResult="Fail")
    approved = _approve(env, itr_id)
    assert approved.status_code == 200, approved.text
    assert full.post(f"/api/itr/{itr_id}/re-inspect").status_code == 400
    revoked = env.login("acc_approver").post(
        f"/api/itr/{itr_id}/revoke-approval",
        json={"new_status": "In Progress", "reason": "Reassess the failed inspection"})
    assert revoked.status_code == 200, revoked.text
    before = _full_world(env, itr_id)
    response = full.post(f"/api/itr/{itr_id}/re-inspect")
    assert response.status_code == 200, response.text
    after = _full_world(env, itr_id)
    assert after["itr"][itr_id] == before["itr"][itr_id]
    for checklist_id, row in before["checklist"].items():
        assert after["checklist"][checklist_id] == row
    assert after["events"] == before["events"]
    child = after["itr"][response.json()["id"]]
    assert child["originalItrId"] == itr_id and child["status"] == "In Progress"


# ══ Part 2 — real races on a file-backed SQLite database ═════════════════

@pytest.fixture
def race(file_env):
    env, engine = file_env
    _add_full_user(env)
    return env, engine


def _final_itr(env, itr_id):
    return _world(env)["itr"].get(itr_id)


def test_delete_racing_a_saved_result_delete_second_sees_the_evidence_and_refuses(race):
    """The save holds the transaction first; the delete must wait, re-read, and find the evidence."""
    env, engine = race
    itr_id, (inst,) = _itr_with_instances(env, n=1)                                     # untouched: a delete would be allowed
    editor, full = env.login("acc_editor"), env.login("acc_full")
    window = _Window(engine, "insert into audit_logs")
    try:
        out = _run_pair(
            # 2026-09-20: the request now declares the status the single O item derives to. It used to omit
            # `status` (=> stored Ongoing), which the status-consistency rule (Ongoing must equal the derived
            # status) refuses with 400; the race being tested is unchanged.
            lambda: editor.put(f"/api/checklist/{inst}/", json={"status": "Pass", "passCount": 1, "failCount": 0, "detail_data": json.dumps(
                {"items": [{**ITEM, "situation": "Measured 150mm", "result": "O"}]})}).status_code,
            lambda: full.delete(f"/api/itr/{itr_id}").status_code)
    finally:
        window.close()
    assert window.fired
    w = _world(env)
    assert out["first"] == 200 and out["second"] == 400
    assert itr_id in w["itr"] and inst in w["checklist"]
    assert "Measured 150mm" in w["checklist"][inst]["detail_data"]                      # the evidence was NOT destroyed
    assert not _audit_rows(env, "DELETE", itr_id, "ITR")


def test_delete_racing_a_saved_result_delete_first_leaves_no_orphan_evidence(race):
    """The delete holds the transaction first; the save then finds its row gone: not found, never a 500 and never an orphan."""
    env, engine = race
    itr_id, (inst,) = _itr_with_instances(env, n=1)
    editor, full = env.login("acc_editor"), env.login("acc_full")
    window = _Window(engine, "delete from checklist")
    try:
        out = _run_pair(
            lambda: full.delete(f"/api/itr/{itr_id}").status_code,
            lambda: editor.put(f"/api/checklist/{inst}/", json={"passCount": 1, "failCount": 0, "detail_data": json.dumps(
                {"items": [{**ITEM, "situation": "Measured 150mm", "result": "O"}]})}).status_code)
    finally:
        window.close()
    assert window.fired
    w = _world(env)
    assert out["first"] == 200 and out["second"] == 404
    assert itr_id not in w["itr"] and inst not in w["checklist"]
    assert len(_audit_rows(env, "DELETE", itr_id, "ITR")) == 1


@pytest.mark.parametrize("order", ["approval_first", "ncr_first"])
def test_create_ncr_racing_an_approval_the_snapshot_always_matches_the_record(race, order):
    env, engine = race
    _add_second_approver(env)
    itr_id, _ = _ready_itr(env)
    _set(env, itr_id, inspectionResult="Fail")
    approver, full = env.login("acc_approver"), env.login("acc_full")
    approve = lambda: approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code
    make_ncr = lambda: full.post(f"/api/itr/{itr_id}/create-ncr").status_code
    window = _Window(engine, "insert into itr_approval_events" if order == "approval_first" else "insert into ncr (")
    try:
        out = _run_pair(approve, make_ncr) if order == "approval_first" else _run_pair(make_ncr, approve)
    finally:
        window.close()
    assert window.fired
    st = _state(env, itr_id)
    live = st["itr"]
    (ev,) = st["events"]
    snap = json.loads(ev["itr_snapshot"])
    assert live["status"] == "Approved"
    assert snap["ncrNumber"] == live["ncrNumber"]                                        # snapshot == the record, either way
    if order == "approval_first":
        assert out["first"] == 200 and out["second"] == 400 and live["ncrNumber"] is None
        assert _world(env)["ncr"] == {}
    else:
        assert out["first"] == 200 and out["second"] == 200 and live["ncrNumber"]
        assert list(_world(env)["ncr"].values())[0]["documentNumber"] == live["ncrNumber"]


@pytest.mark.parametrize("action", ["create-ncr", "re-inspect"])
def test_a_result_change_committed_first_is_seen_by_create_ncr_and_reinspection(race, action):
    """update_itr flips inspectionResult Fail -> Pass while the other request is waiting: that request must re-read and refuse."""
    env, engine = race
    itr_id, _ = _itr_with_instances(env, n=1, fail=True)
    editor, full = env.login("acc_editor"), env.login("acc_full")
    before = _world(env)
    window = _Window(engine, "insert into audit_logs")
    try:
        out = _run_pair(
            lambda: editor.put(f"/api/itr/{itr_id}", json={"inspectionResult": "Pass"}).status_code,
            lambda: full.post(f"/api/itr/{itr_id}/{action}").status_code)
    finally:
        window.close()
    assert window.fired
    after = _world(env)
    assert out["first"] == 200 and out["second"] == 400
    assert after["itr"][itr_id]["inspectionResult"] == "Pass" and after["itr"][itr_id]["ncrNumber"] is None
    assert after["ncr"] == before["ncr"] and set(after["itr"]) == set(before["itr"])     # no NCR, no re-inspection ITR


@pytest.mark.parametrize("order", ["edit_first", "reinspection_first"])
def test_reinspection_copies_exactly_the_state_it_checked(race, order):
    env, engine = race
    itr_id, (inst,) = _itr_with_instances(env, n=1, fail=True, fill=True)               # original instance: Fail
    closer, full = env.login("acc_closer"), env.login("acc_full")                       # editing a Fail checklist needs checklist:close
    edit = lambda: closer.put(f"/api/checklist/{inst}/", json={"location": "MOVED"}).status_code
    reinspect = lambda: full.post(f"/api/itr/{itr_id}/re-inspect").status_code
    window = _Window(engine, "insert into audit_logs" if order == "edit_first" else "insert into itr (")
    try:
        out = _run_pair(edit, reinspect) if order == "edit_first" else _run_pair(reinspect, edit)
    finally:
        window.close()
    assert window.fired
    w = _world(env)
    assert out["first"] == 200 and out["second"] == 200
    (new_inst,) = [c for c in w["checklist"].values() if c["itrId"] not in (None, itr_id)]      # (templates have no itrId)
    original = w["checklist"][inst]
    assert original["location"] == "MOVED"
    if order == "edit_first":
        assert new_inst["location"] == "MOVED"                                           # waited, re-read, copied the edited state
    else:
        assert new_inst["location"] != "MOVED"                                            # copied the state it checked; the edit applied afterwards
    assert json.loads(new_inst["detail_data"])["items"][0]["result"] == ""              # results blanked as before


def test_delete_first_then_a_late_approval_gets_not_found_not_a_server_error(race):
    env, engine = race
    itr_id = _mk_itr(env)                                                                # no checklists: a delete is allowed
    approver, full = env.login("acc_approver"), env.login("acc_full")
    window = _Window(engine, "delete from checklist")
    try:
        out = _run_pair(lambda: full.delete(f"/api/itr/{itr_id}").status_code,
                        lambda: approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code)
    finally:
        window.close()
    assert window.fired
    assert out["first"] == 200 and out["second"] == 404
    assert itr_id not in _world(env)["itr"] and _state_events(env, itr_id) == []


def test_approval_first_then_a_late_delete_is_refused_and_the_record_survives(race):
    env, engine = race
    _add_second_approver(env)
    itr_id, _ = _ready_itr(env)
    approver, full = env.login("acc_approver"), env.login("acc_full")
    window = _Window(engine, "insert into itr_approval_events")
    try:
        out = _run_pair(lambda: approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code,
                        lambda: full.delete(f"/api/itr/{itr_id}").status_code)
    finally:
        window.close()
    assert window.fired
    st = _state(env, itr_id)
    assert out["first"] == 200 and out["second"] == 400
    assert st["itr"]["status"] == "Approved" and len(st["events"]) == 1 and st["checklists"]


def _state_events(env, itr_id):
    db = env.Session()
    try:
        return [e.id for e in db.query(models.ITRApprovalEvent).filter_by(itr_id=itr_id).all()]
    finally:
        db.close()
