"""HTTP/API tests for the Reopen path the ITR snapshot now exposes (2026-09-19).

The UI entry sends exactly one thing — PUT /checklist/{id}/ {"status": "Ongoing"}
— through the pre-existing backend Reopen path. These tests pin the backend
half of the contract with real logins and a real DB: who may do it, that only
the status changes (nothing cleared), that a Pass/Fail lock or an Approved/Void
parent still refuses it, and that the audit trail records it while earlier
snapshots stay untouched. No backend rule was changed for this feature.
"""
import json

import models
from test_itr_revoke_approval_acceptance import env, _mk_itr, ITEM  # noqa: F401
from test_checklist_pass_integrity_http import (  # noqa: F401
    ITEM2, _linked, _row, _seed_itr, _audit_total, _valid_pass,
)


def _fail_with_na(editor, inst):
    body = {"items": [
        {**ITEM, "result": "X", "situation": "Measured 350mm"},
        {**ITEM2, "result": "/", "naReason": "cover not applicable here"},
    ]}
    r = editor.put(f"/api/checklist/{inst}/", json={
        "status": "Fail", "passCount": 0, "failCount": 1, "detail_data": json.dumps(body)})
    assert r.status_code == 200, r.text


def _audit_rows(env, inst):
    db = env.Session()
    try:
        return db.query(models.AuditLog).filter_by(
            entity_type="Checklist", entity_id=inst, action="UPDATE").order_by(models.AuditLog.id).all()
    finally:
        db.close()


def test_only_the_close_permission_can_reopen_and_refusals_change_nothing(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    before, audits = _row(env, inst), _audit_total(env)
    for who in (editor, approver):                       # neither holds checklist:close:all
        r = who.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"})
        assert r.status_code == 403, r.text
        assert "checklist:close:all" in r.json()["detail"]
    assert _row(env, inst) == before and _audit_total(env) == audits
    r = closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"})
    assert r.status_code == 200 and r.json()["status"] == "Ongoing"


def test_reopen_changes_only_the_status_nothing_is_cleared(env):
    editor, _, closer, _, inst = _linked(env)
    _fail_with_na(editor, inst)
    before = _row(env, inst)
    db = env.Session(); marker = db.get(models.Checklist, inst).evidence_recorded_at; db.close()
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200
    after = _row(env, inst)
    assert after["status"] == "Ongoing"
    assert after["detail_data"] == before["detail_data"]                  # byte-identical items
    assert (after["passCount"], after["failCount"]) == (before["passCount"], before["failCount"])
    items = json.loads(after["detail_data"])["items"]
    assert items[0]["situation"] == "Measured 350mm" and items[1]["naReason"] == "cover not applicable here"
    db = env.Session(); assert db.get(models.Checklist, inst).evidence_recorded_at == marker; db.close()


def test_reopen_and_later_edit_are_audited_and_earlier_snapshot_is_untouched(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200
    assert approver.post(f"/api/itr/{itr_id}/revoke-approval",
                         json={"new_status": "In Progress", "reason": "reopen audit"}).status_code == 200
    db = env.Session()
    snap = db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="reopen audit").one().old_value
    db.close()
    n_before = len(_audit_rows(env, inst))

    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200
    rows = _audit_rows(env, inst)
    assert len(rows) == n_before + 1
    reopen = rows[-1]
    assert reopen.username == "acc_closer" and reopen.user_id
    assert json.loads(reopen.old_value)["status"] == "Pass"
    assert json.loads(reopen.new_value) == {"status": "Ongoing"}          # only the necessary change was submitted
    assert reopen.timestamp

    changed = json.dumps({"items": [{**ITEM, "result": "X"}, {**ITEM2, "result": "O"}]})
    assert closer.put(f"/api/checklist/{inst}/", json={
        "status": "Fail", "passCount": 1, "failCount": 1, "detail_data": changed}).status_code == 200
    rows = _audit_rows(env, inst)
    assert len(rows) == n_before + 2 and json.loads(rows[-1].old_value)["status"] == "Ongoing"

    db = env.Session()
    assert db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id, reason="reopen audit").one().old_value == snap
    db.close()


def test_parent_itr_approved_or_void_blocks_reopen_for_every_account(env):
    editor, approver, closer, itr_id, inst = _linked(env)
    _valid_pass(editor, inst)
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200
    before, audits = _row(env, inst), _audit_total(env)
    for who in (editor, approver, closer):
        r = who.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"})
        assert r.status_code in (400, 403), r.text
    assert closer.put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 400
    assert _row(env, inst) == before and _audit_total(env) == audits

    # Void parent (separate data): a closed checklist behind it can't be reopened either
    editor2, approver2, closer2, itr2, inst2 = _linked(env)
    _valid_pass(editor2, inst2)
    assert editor2.put(f"/api/itr/{itr2}", json={"status": "Void"}).status_code == 200
    before2, audits2 = _row(env, inst2), _audit_total(env)
    r = closer2.put(f"/api/checklist/{inst2}/", json={"status": "Ongoing"})
    assert r.status_code == 400 and "Void" in r.json()["detail"]
    assert _row(env, inst2) == before2 and _audit_total(env) == audits2
