"""ITR approval attribution, approval-moment snapshots and update_itr atomicity (2026-09-20).

Before: entering Approved recorded nobody (itr.approvedBy / approvedAt were never
written and a client could write anything into them), the approval's audit entry
was lost (update_itr committed first and added the audit row after), and the only
snapshot of the checklists was taken later, at REVOKE time.

Now, in ONE transaction: the ITR change + version bump, the strict audit entry and
an APPROVED event holding the acting user (id, username, full name AS THEN), the
server clock and complete deep-copied snapshots of the ITR and of every linked
Checklist, all built from the very rows that passed the approval check.

Real logins, real HTTP routes, one Session per request, brand-new-session reads,
isolated DB. Concurrency tests use a file-backed SQLite DB and threads.
"""
import hashlib
import json
import threading
import time
from datetime import datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

import models
from core import perms
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import (   # noqa: F401  (env is a fixture, re-exported on purpose)
    ITEM, PW, Env, _mk_itr, _seed, env,
)

TEMPLATE_ITEMS = [
    {"item": "Spacing", "criteria": "<=200mm", "situation": "", "result": ""},
    {"item": "Cover", "criteria": ">=40mm", "situation": "", "result": ""},
]


# ── builders ─────────────────────────────────────────────────────────────

def _passing_items(situation="Measured 150mm"):
    return [{**TEMPLATE_ITEMS[0], "situation": situation, "result": "O"},
            {**TEMPLATE_ITEMS[1], "situation": "45mm", "result": "O"}]


def _link_and_pass(env, itr_id, activity="Rebar", situation="Measured 150mm"):
    editor = env.login("acc_editor")
    tpl = editor.post("/api/checklist/", json={"activity": activity, "date": "2026-09-20", "status": "Ongoing",
                                                "detail_data": json.dumps({"items": TEMPLATE_ITEMS})})
    assert tpl.status_code == 200, tpl.text
    r = editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl.json()["id"]})
    assert r.status_code == 200, r.text
    db = env.Session()
    try:
        inst_id = db.query(models.Checklist).filter(models.Checklist.itrId == itr_id,
                                                    models.Checklist.template_id == tpl.json()["id"]).one().id
    finally:
        db.close()
    r = editor.put(f"/api/checklist/{inst_id}/", json={
        "status": "Pass", "passCount": 2, "failCount": 0,
        "detail_data": json.dumps({"items": _passing_items(situation)})})
    assert r.status_code == 200, r.text
    return inst_id, tpl.json()["id"]


def _ready_itr(env, checklists=1):
    """An In-Progress ITR whose linked checklists are all legitimately Pass."""
    itr_id = _mk_itr(env)
    ids = [_link_and_pass(env, itr_id, activity=f"Rebar-{i}") for i in range(checklists)]
    return itr_id, [i for i, _ in ids]


def _add_second_approver(env):
    db = env.Session()
    try:
        role = db.query(models.Role).filter_by(name="AcceptApprover").one()
        db.add(models.User(username="acc_approver2", email="acc_approver2@example.com", full_name="Bea Approver",
                           is_active=True, hashed_password=get_password_hash(PW), role_id=role.id))
        me = db.query(models.User).filter_by(username="acc_approver").one()
        me.full_name = "Ada Approver"
        db.commit()
    finally:
        db.close()


def _uid(env, username):
    db = env.Session()
    try:
        return db.query(models.User).filter_by(username=username).one().id
    finally:
        db.close()


def _state(env, itr_id):
    """The ITR row, its events and its ITR audit rows, through a brand-new session."""
    db = env.Session()
    try:
        itr = db.get(models.ITR, itr_id)
        row = {c.name: getattr(itr, c.name) for c in itr.__table__.columns}
        events = db.query(models.ITRApprovalEvent).filter_by(itr_id=itr_id).order_by(models.ITRApprovalEvent.sequence).all()
        ev = [{c.name: getattr(e, c.name) for c in e.__table__.columns} for e in events]
        audits = [{"action": a.action, "user_id": a.user_id, "username": a.username, "new_value": a.new_value,
                   "old_value": a.old_value, "reason": a.reason}
                  for a in db.query(models.AuditLog).filter_by(entity_type="ITR", entity_id=itr_id).order_by(models.AuditLog.id).all()]
        checklists = {c.id: {"status": c.status, "detail": c.detail_data, "passCount": c.passCount, "location": c.location}
                      for c in db.query(models.Checklist).filter_by(itrId=itr_id).all()}
        return {"itr": row, "events": ev, "audits": audits, "checklists": checklists}
    finally:
        db.close()


def _unchanged(a, b):
    assert a["itr"] == b["itr"] and a["events"] == b["events"] and a["audits"] == b["audits"] and a["checklists"] == b["checklists"]


def _approve(env, itr_id, who="acc_approver", **extra):
    return env.login(who).put(f"/api/itr/{itr_id}", json={"status": "Approved", **extra})


# ── 1. a legal approval: identity, server time, complete snapshot ────────

def test_legal_approval_records_the_approver_the_server_time_and_a_complete_snapshot(env):
    _add_second_approver(env)
    itr_id, inst_ids = _ready_itr(env, checklists=2)
    approver_id = _uid(env, "acc_approver")
    before_state = _state(env, itr_id)
    assert before_state["itr"]["approvedBy"] is None and before_state["itr"]["approvedAt"] is None and before_state["events"] == []

    t0 = datetime.now(timezone.utc)
    r = _approve(env, itr_id)
    t1 = datetime.now(timezone.utc)
    assert r.status_code == 200, r.text
    st = _state(env, itr_id)

    # itr.approvedBy = the approver's USER ID (as a string); approvedAt = server UTC ISO 8601
    assert st["itr"]["status"] == "Approved" and st["itr"]["approvedBy"] == str(approver_id)
    at = datetime.fromisoformat(st["itr"]["approvedAt"])
    assert at.tzinfo is not None and t0.replace(microsecond=0) <= at <= t1

    # exactly one APPROVED event, with the actor as they were at the time
    (ev,) = st["events"]
    assert ev["event_type"] == "APPROVED" and ev["sequence"] == 1 and ev["itr_id"] == itr_id
    assert (ev["actor_user_id"], ev["actor_username"], ev["actor_full_name"]) == (approver_id, "acc_approver", "Ada Approver")
    assert ev["occurred_at"] == st["itr"]["approvedAt"] and (ev["status_before"], ev["status_after"]) == ("In Progress", "Approved")

    # the ITR snapshot is the whole row exactly as committed with the approval
    assert json.loads(ev["itr_snapshot"]) == json.loads(json.dumps(st["itr"], default=str))
    # the checklist snapshot: every linked instance, complete
    snap = {c["id"]: c for c in json.loads(ev["checklists_snapshot"])}
    assert sorted(snap) == sorted(inst_ids)
    db = env.Session()
    try:
        for inst_id in inst_ids:
            inst = db.get(models.Checklist, inst_id)
            s = snap[inst_id]
            assert s["recordsNo"] == inst.recordsNo and s["status"] == "Pass" and (s["passCount"], s["failCount"]) == (2, 0)
            assert s["template_id"] == inst.template_id and s["source_template_version"] == inst.source_template_version == 1
            assert s["items"] == _passing_items()                              # item, criteria, situation, result — all of it
            assert s["items"][0]["criteria"] == "<=200mm" and s["items"][0]["situation"] == "Measured 150mm"
    finally:
        db.close()
    # tamper-evidence: the stored hash matches the stored content
    canonical = json.dumps({"itr": json.loads(ev["itr_snapshot"]), "checklists": json.loads(ev["checklists_snapshot"])},
                           sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    assert ev["snapshot_sha256"] == hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    # the approval is in the audit trail (strict, same transaction) and points at the event
    (a,) = [a for a in st["audits"] if a["action"] == "APPROVE"]
    assert a["user_id"] == approver_id and a["username"] == "acc_approver"
    assert json.loads(a["new_value"])["approval_event_id"] == ev["id"] and json.loads(a["new_value"])["approvedBy"] == str(approver_id)


def test_na_reason_and_other_item_fields_are_kept_in_the_snapshot(env):
    itr_id = _mk_itr(env)
    editor = env.login("acc_editor")
    tpl = editor.post("/api/checklist/", json={"activity": "NA", "date": "2026-09-20", "status": "Ongoing",
                                                "detail_data": json.dumps({"items": TEMPLATE_ITEMS})}).json()
    editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl["id"]})
    db = env.Session(); inst_id = db.query(models.Checklist).filter_by(itrId=itr_id).one().id; db.close()
    items = [{**TEMPLATE_ITEMS[0], "situation": "ok", "result": "O", "extra_field": "kept"},
             {**TEMPLATE_ITEMS[1], "situation": "", "result": "O"}]
    assert editor.put(f"/api/checklist/{inst_id}/", json={"status": "Pass", "passCount": 2, "failCount": 0,
                                                            "detail_data": json.dumps({"items": items, "revision": 3})}).status_code == 200
    assert _approve(env, itr_id).status_code == 200
    (ev,) = _state(env, itr_id)["events"]
    (s,) = json.loads(ev["checklists_snapshot"])
    assert s["items"][0]["extra_field"] == "kept" and s["detail_other"] == {"revision": 3}


# ── 2. the client cannot forge, set, rewrite or clear approval identity ──

@pytest.mark.parametrize("forged", [
    {"approvedBy": "someone-else"},
    {"approvedAt": "2001-01-01T00:00:00+00:00"},
    {"approvedBy": "99", "approvedAt": "2001-01-01T00:00:00+00:00"},
])          # (an explicit null on a still-NULL field is an unchanged echo, covered separately)
def test_forged_approval_identity_is_refused_and_changes_nothing(env, forged):
    itr_id, _ = _ready_itr(env)
    before = _state(env, itr_id)
    for who in ("acc_approver", "acc_editor"):
        r = env.login(who).put(f"/api/itr/{itr_id}", json={"status": "Approved", **forged})
        assert r.status_code in (400, 403), r.text
    assert env.login("acc_editor").put(f"/api/itr/{itr_id}", json={"subject": "edit", **forged}).status_code == 400
    _unchanged(_state(env, itr_id), before)


def test_forged_identity_cannot_be_added_rewritten_or_cleared_after_approval(env):
    itr_id, _ = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    after_approval = _state(env, itr_id)
    approver = env.login("acc_approver")
    for body in ({"approvedBy": "1"}, {"approvedBy": None}, {"approvedAt": "2001-01-01T00:00:00+00:00"}, {"approvedAt": None}):
        assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved", **body}).status_code == 400
    _unchanged(_state(env, itr_id), after_approval)


def test_an_unchanged_echo_of_the_current_identity_is_ignored_not_refused(env):
    itr_id, _ = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    st = _state(env, itr_id)
    r = env.login("acc_approver").put(f"/api/itr/{itr_id}", json={
        "status": "Approved", "type": "Rev2.0", "approvedBy": st["itr"]["approvedBy"], "approvedAt": st["itr"]["approvedAt"]})
    assert r.status_code == 200, r.text
    after = _state(env, itr_id)
    assert after["itr"]["type"] == "Rev2.0" and after["itr"]["approvedBy"] == st["itr"]["approvedBy"] and after["itr"]["approvedAt"] == st["itr"]["approvedAt"]
    assert len(after["events"]) == 1


def test_creating_an_itr_with_approval_identity_is_refused(env):
    editor = env.login("acc_editor")
    r = editor.post("/api/itr/", json={"vendor": "Accept Co", "description": "d", "rev": "A", "submit": "x", "status": "In Progress",
                                        "approvedBy": "1", "approvedAt": "2001-01-01T00:00:00+00:00"})
    assert r.status_code == 400 and "approvedBy" in r.text
    db = env.Session()
    try:
        assert db.query(models.ITR).filter(models.ITR.approvedBy.isnot(None)).count() == 0
    finally:
        db.close()


# ── 3. no authority / checklists not fit => nothing changes ──────────────

def test_editor_cannot_approve_by_put_or_by_the_batch_route(env):
    itr_id, _ = _ready_itr(env)
    before = _state(env, itr_id)
    editor = env.login("acc_editor")
    assert editor.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 403
    r = editor.post("/api/itr/batch-update", json={"ids": [itr_id], "status": "Approved"})
    assert r.status_code == 403                                   # was open before: batch only needed itr:update
    assert env.anonymous().put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code in (401, 403)
    _unchanged(_state(env, itr_id), before)


def test_the_batch_route_approves_for_an_approver_and_records_the_same_event(env):
    itr_id, _ = _ready_itr(env)
    r = env.login("acc_approver").post("/api/itr/batch-update", json={"ids": [itr_id], "status": "Approved"})
    assert r.status_code == 200 and r.json()["updated"] == [itr_id]
    st = _state(env, itr_id)
    assert st["itr"]["approvedBy"] == str(_uid(env, "acc_approver")) and len(st["events"]) == 1 and st["events"][0]["sequence"] == 1


@pytest.mark.parametrize("problem", ["no_checklist", "ongoing", "fail", "unsupported_pass"])
def test_unfit_checklists_block_approval_and_leave_data_audit_and_events_unchanged(env, problem):
    itr_id = _mk_itr(env)
    if problem != "no_checklist":
        inst_id, _ = _link_and_pass(env, itr_id)
        db = env.Session()
        try:
            inst = db.get(models.Checklist, inst_id)
            if problem == "ongoing":
                inst.status = "Ongoing"
            elif problem == "fail":
                inst.status = "Fail"; inst.failCount = 1; inst.passCount = 1
            else:                                                     # legacy 'Pass' not backed by its items
                inst.detail_data = json.dumps({"items": [{**TEMPLATE_ITEMS[0], "result": ""}]})
            db.commit()
        finally:
            db.close()
    before = _state(env, itr_id)
    r = _approve(env, itr_id)
    assert r.status_code == 400, r.text
    _unchanged(_state(env, itr_id), before)
    assert before["itr"]["approvedBy"] is None


# ── 4. a failed write rolls the WHOLE approval back ──────────────────────

def _boom(*a, **k):
    raise RuntimeError("backend down")


@pytest.mark.parametrize("failure", ["audit", "snapshot", "commit"])
def test_failure_during_approval_rolls_back_status_identity_event_audit_and_version(env, failure):
    itr_id, _ = _ready_itr(env)
    before = _state(env, itr_id)
    import services.itr_service as svc
    approver = env.login("acc_approver")
    with pytest.MonkeyPatch.context() as m:
        if failure == "audit":
            m.setattr(svc, "log_audit", _boom)
        elif failure == "snapshot":
            m.setattr(svc.ITRService, "_record_approval_event", _boom)
        else:
            def failing_commit(self, *a, **k):
                raise RuntimeError("disk full")
            m.setattr(Session, "commit", failing_commit)
        with pytest.raises(RuntimeError):                       # the app re-raises the injected fault (TestClient default)
            approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"})
    after = _state(env, itr_id)
    _unchanged(after, before)
    assert after["itr"]["status"] == "In Progress" and after["itr"]["approvedBy"] is None and after["itr"]["closeoutDate"] is None
    assert after["itr"]["detail_data"] == before["itr"]["detail_data"]        # the optimistic-lock version was not bumped either
    assert approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200   # and the system is not wedged


def test_an_ordinary_update_is_atomic_with_its_audit_too(env):
    itr_id, _ = _ready_itr(env)
    editor = env.login("acc_editor")
    before = _state(env, itr_id)
    import services.itr_service as svc
    with pytest.MonkeyPatch.context() as m:
        m.setattr(svc, "log_audit", _boom)
        with pytest.raises(RuntimeError):
            editor.put(f"/api/itr/{itr_id}", json={"subject": "New subject"})
    _unchanged(_state(env, itr_id), before)
    assert editor.put(f"/api/itr/{itr_id}", json={"subject": "New subject"}).status_code == 200
    st = _state(env, itr_id)
    (a,) = [a for a in st["audits"] if a["action"] == "UPDATE"]                # previously lost; now committed with the change
    assert a["username"] == "acc_editor" and st["itr"]["subject"] == "New subject"
    assert json.loads(st["itr"]["detail_data"])["_version"] == 1              # exactly one version bump, from the one successful update


# ── 5. revoke / reopen / edit / re-approve: every snapshot keeps its own state ──

def test_reapproval_after_revoke_and_reopen_appends_new_events_and_never_rewrites_old_ones(env):
    _add_second_approver(env)
    itr_id, (inst_id,) = _ready_itr(env)
    a1, a2 = _uid(env, "acc_approver"), None
    assert _approve(env, itr_id).status_code == 200
    first = _state(env, itr_id)
    first_event = dict(first["events"][0])

    r = env.login("acc_approver").post(f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress", "reason": "wrong measurement"})
    assert r.status_code == 200, r.text
    after_revoke = _state(env, itr_id)
    assert after_revoke["events"][0] == first_event                            # untouched
    revoked = after_revoke["events"][1]
    assert (revoked["event_type"], revoked["sequence"], revoked["reason"], revoked["approval_event_id"]) == ("REVOKED", 2, "wrong measurement", first_event["id"])
    assert (revoked["actor_user_id"], revoked["actor_username"]) == (a1, "acc_approver") and revoked["status_after"] == "In Progress"

    # legitimate Reopen of the checklist, a real correction, and Pass again
    closer = env.login("acc_closer")
    assert closer.put(f"/api/checklist/{inst_id}/", json={"status": "Ongoing"}).status_code == 200
    editor = env.login("acc_editor")
    corrected = _passing_items(situation="Re-measured 148mm")
    assert editor.put(f"/api/checklist/{inst_id}/", json={"status": "Pass", "passCount": 2, "failCount": 0,
                                                            "detail_data": json.dumps({"items": corrected})}).status_code == 200

    assert _approve(env, itr_id, who="acc_approver2").status_code == 200
    a2 = _uid(env, "acc_approver2")
    st = _state(env, itr_id)
    e1, e2, e3 = st["events"]
    assert [e["sequence"] for e in st["events"]] == [1, 2, 3] and [e["event_type"] for e in st["events"]] == ["APPROVED", "REVOKED", "APPROVED"]
    assert e1 == first_event and e2 == revoked                                # every earlier row byte-for-byte the same
    assert json.loads(e1["checklists_snapshot"])[0]["items"][0]["situation"] == "Measured 150mm"      # first approval keeps ITS state
    assert json.loads(e3["checklists_snapshot"])[0]["items"][0]["situation"] == "Re-measured 148mm"   # the second has the corrected one
    assert (e3["actor_user_id"], e3["actor_username"], e3["actor_full_name"]) == (a2, "acc_approver2", "Bea Approver")
    assert (e1["actor_user_id"], e1["actor_full_name"]) == (a1, "Ada Approver")
    # the ITR row mirrors the LATEST approval only
    assert st["itr"]["approvedBy"] == str(a2) and st["itr"]["approvedAt"] == e3["occurred_at"]
    # the revoke's own audit row (with its own, later snapshot) is still there and different from approval #1's
    assert any(a["action"] == "REVOKE_APPROVAL" for a in st["audits"]) and len([a for a in st["audits"] if a["action"] == "APPROVE"]) == 2


def test_snapshots_do_not_follow_later_changes_to_the_live_records(env):
    itr_id, (inst_id,) = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    stored = _state(env, itr_id)["events"][0]
    # (a) even a direct database change to the live checklist and ITR (bypassing every guard) cannot reach the event
    db = env.Session()
    try:
        inst = db.get(models.Checklist, inst_id); inst.detail_data = json.dumps({"items": [{"item": "TAMPERED"}]}); inst.recordsNo = "X-CHANGED"
        itr = db.get(models.ITR, itr_id); itr.subject = "TAMPERED"
        db.commit()
    finally:
        db.close()
    now = _state(env, itr_id)["events"][0]
    assert now == stored and "TAMPERED" not in now["itr_snapshot"] + now["checklists_snapshot"]


def test_approval_events_are_append_only(env):
    itr_id, _ = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    db = env.Session()
    try:
        ev = db.query(models.ITRApprovalEvent).one()
        ev.actor_username = "forged"
        with pytest.raises(ValueError, match="append-only"):
            db.commit()
        db.rollback()
        db.delete(db.query(models.ITRApprovalEvent).one())
        with pytest.raises(ValueError, match="append-only"):
            db.commit()
        db.rollback()
    finally:
        db.close()
    assert len(_state(env, itr_id)["events"]) == 1 and _state(env, itr_id)["events"][0]["actor_username"] == "acc_approver"


# ── 6. Approved resend / Publish is not an approval ──────────────────────

def test_publish_and_resends_do_not_reset_identity_time_or_create_events(env):
    itr_id, _ = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    st = _state(env, itr_id)
    for who in ("acc_approver", "acc_editor"):                                # Publish needs only itr:update
        r = env.login(who).put(f"/api/itr/{itr_id}", json={"type": f"Rev{who[-3:]}", "status": "Approved"})
        assert r.status_code == 200, r.text
    assert env.login("acc_approver").put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code == 200
    assert env.login("acc_approver").post("/api/itr/batch-update", json={"ids": [itr_id], "status": "Approved"}).status_code == 200
    after = _state(env, itr_id)
    assert after["itr"]["approvedBy"] == st["itr"]["approvedBy"] and after["itr"]["approvedAt"] == st["itr"]["approvedAt"]
    assert after["events"] == st["events"]                                    # no new approval event, nothing modified
    assert len([a for a in after["audits"] if a["action"] == "APPROVE"]) == 1
    assert len([a for a in after["audits"] if a["action"] == "UPDATE"]) >= 4  # the resends are ordinary, now-audited, updates


# ── 7. history that predates event recording stays unknown ───────────────

def test_a_legacy_approval_stays_unknown_and_is_never_fabricated(env):
    _add_second_approver(env)
    itr_id, (inst_id,) = _ready_itr(env)
    db = env.Session()                                                         # simulate a pre-existing approval: Approved, NULL approver/time, no event
    try:
        itr = db.get(models.ITR, itr_id); itr.status = "Approved"; db.commit()
    finally:
        db.close()
    legacy = _state(env, itr_id)
    assert legacy["itr"]["approvedBy"] is None and legacy["itr"]["approvedAt"] is None and legacy["events"] == []

    # a Publish resend neither fills in an approver nor invents an event
    assert env.login("acc_editor").put(f"/api/itr/{itr_id}", json={"type": "Rev2.0", "status": "Approved"}).status_code == 200
    resent = _state(env, itr_id)
    assert resent["itr"]["approvedBy"] is None and resent["itr"]["approvedAt"] is None and resent["events"] == []

    # revoking it records a REVOKED event that points at NO approval event (unknown), and the columns stay NULL
    assert env.login("acc_approver").post(f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress", "reason": "legacy fix"}).status_code == 200
    (rev,) = _state(env, itr_id)["events"]
    assert rev["event_type"] == "REVOKED" and rev["approval_event_id"] is None and rev["sequence"] == 1
    assert _state(env, itr_id)["itr"]["approvedBy"] is None

    # a genuine new approval then records a real APPROVED event as sequence 2
    assert _approve(env, itr_id, who="acc_approver2").status_code == 200
    st = _state(env, itr_id)
    assert [e["event_type"] for e in st["events"]] == ["REVOKED", "APPROVED"] and st["events"][1]["sequence"] == 2
    assert st["itr"]["approvedBy"] == str(_uid(env, "acc_approver2"))


def test_a_rename_after_approval_does_not_change_who_the_event_says_approved(env):
    _add_second_approver(env)                                                  # gives acc_approver the full name "Ada Approver"
    itr_id, _ = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    db = env.Session()
    try:
        u = db.query(models.User).filter_by(username="acc_approver").one()
        u.username, u.full_name = "renamed_person", "New Name"
        db.commit()
    finally:
        db.close()
    (ev,) = _state(env, itr_id)["events"]
    assert (ev["actor_username"], ev["actor_full_name"]) == ("acc_approver", "Ada Approver")      # who they were THEN
    assert ev["actor_user_id"] == _uid(env, "renamed_person")                                      # ...and the id still resolves to the same person


# ── 8. concurrency: what was checked is what was recorded ────────────────

@pytest.fixture
def file_env(tmp_path):
    from database import Base, get_db
    from routers import auth as auth_router, itr as itr_router, checklist as checklist_router
    import database as database_module
    engine = create_engine(f"sqlite:///{tmp_path / 'race.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    Session_ = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    _seed(Session_)
    app = FastAPI()
    for r in (auth_router.router, itr_router.router, checklist_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = Session_()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    orig = (database_module.engine, database_module.SessionLocal)
    database_module.engine, database_module.SessionLocal = engine, Session_
    try:
        yield Env(app, Session_), engine
    finally:
        database_module.engine, database_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


class _Window:
    """Opens the race window: the FIRST statement (after arming) containing `needle` sleeps, i.e. the request that
    issues it is held mid-transaction. (Requests run in the TestClient's own worker threads, so the trigger is
    "first matching statement", not a thread name.) `fired` proves the window really opened."""

    def __init__(self, engine, needle, seconds=0.9):
        self.engine, self.needle, self.seconds, self.fired = engine, needle, seconds, False
        self._lock = threading.Lock()
        event.listen(engine, "after_cursor_execute", self._listener)

    def _listener(self, conn, cursor, statement, parameters, context, executemany):
        if self.needle in statement.lower():
            with self._lock:
                first = not self.fired
                self.fired = True
            if first:
                time.sleep(self.seconds)

    def close(self):
        event.remove(self.engine, "after_cursor_execute", self._listener)


def _run_pair(first, second, gap=0.25):
    out = {}

    def call(name, fn):
        out[name] = fn()

    t1 = threading.Thread(target=call, args=("first", first), name="first")
    t2 = threading.Thread(target=call, args=("second", second), name="second")
    t1.start(); time.sleep(gap); t2.start(); t1.join(60); t2.join(60)
    return out


def test_a_checklist_edit_racing_an_approval_cannot_leave_a_snapshot_that_differs_from_the_record(file_env):
    env, engine = file_env
    itr_id, (inst_id,) = _ready_itr(env)
    approver, closer = env.login("acc_approver"), env.login("acc_closer")          # editing a Pass checklist needs checklist:close
    window = _Window(engine, "insert into itr_approval_events")                    # approval holds its transaction open after snapshotting
    try:
        out = _run_pair(
            lambda: approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code,
            lambda: closer.put(f"/api/checklist/{inst_id}/", json={"location": "SNEAKED IN AFTER THE CHECK"}).status_code)   # a field the Pass lock does not cover
    finally:
        window.close()
    assert window.fired                                                             # the race window really opened
    st = _state(env, itr_id)
    (ev,) = st["events"]
    snap = json.loads(ev["checklists_snapshot"])[0]
    live = st["checklists"][inst_id]
    assert out["first"] == 200 and st["itr"]["status"] == "Approved"
    assert out["second"] in (400, 403)                                            # refused: its parent ITR is Approved once it re-reads
    assert snap["location"] == live["location"] and snap["items"] == json.loads(live["detail"])["items"]   # the approved content IS the record's content
    assert "SNEAKED" not in ev["checklists_snapshot"] and live["location"] != "SNEAKED IN AFTER THE CHECK"


def test_a_link_racing_an_approval_cannot_add_an_instance_the_snapshot_never_saw(file_env):
    env, engine = file_env
    itr_id, (inst_id,) = _ready_itr(env)
    approver, editor = env.login("acc_approver"), env.login("acc_editor")
    tpl = editor.post("/api/checklist/", json={"activity": "Late", "date": "2026-09-20", "status": "Ongoing",
                                                "detail_data": json.dumps({"items": TEMPLATE_ITEMS})}).json()
    window = _Window(engine, "insert into itr_approval_events")
    try:
        out = _run_pair(
            lambda: approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code,
            lambda: editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl["id"]}).status_code)
    finally:
        window.close()
    assert window.fired                                                             # the race window really opened
    st = _state(env, itr_id)
    (ev,) = st["events"]
    assert out["first"] == 200 and out["second"] == 400
    assert sorted(c["id"] for c in json.loads(ev["checklists_snapshot"])) == sorted(st["checklists"])      # snapshot == the linked set


def test_a_checklist_change_committed_first_is_seen_by_the_approval_check(file_env):
    """Reverse order: the edit holds the transaction first (Pass -> Ongoing by a closer). The approval must wait,
    re-read, and refuse — not approve on a stale 'Pass'."""
    env, engine = file_env
    itr_id, (inst_id,) = _ready_itr(env)
    approver, closer = env.login("acc_approver"), env.login("acc_closer")
    window = _Window(engine, "insert into audit_logs")                               # the edit's own audit write, inside its transaction
    try:
        out = _run_pair(
            lambda: closer.put(f"/api/checklist/{inst_id}/", json={"status": "Ongoing"}).status_code,
            lambda: approver.put(f"/api/itr/{itr_id}", json={"status": "Approved"}).status_code)
    finally:
        window.close()
    assert window.fired                                                             # the race window really opened
    st = _state(env, itr_id)
    assert out["first"] == 200 and out["second"] == 400
    assert st["itr"]["status"] == "In Progress" and st["events"] == [] and st["itr"]["approvedBy"] is None
    assert st["checklists"][inst_id]["status"] == "Ongoing"
