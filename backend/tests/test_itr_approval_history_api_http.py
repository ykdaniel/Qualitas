"""Read-only ITR approval history API (2026-09-20).

GET /api/itr/{id}/approval-events            page of events, fixed order, NO snapshots
GET /api/itr/{id}/approval-events/{event_id} one event WITH its snapshots

Same permission (itr:view:all) and data scope as reading the ITR; the event must belong to the ITR in
the path, so typing an event id can never reach another ITR's or an out-of-scope snapshot. Everything
shown comes from the stored event (actor id/username/full name AS THEN, server UTC time, snapshots) —
never from the current user or checklist rows. Nothing here writes.

Real logins, real routes, one Session per request, brand-new-session reads, isolated in-memory DB.
"""
import json

import pytest
from sqlalchemy import text

import models
from core import perms
from core.security import get_password_hash
from test_itr_approval_events_http import (   # noqa: F401  (env is a fixture, re-exported on purpose)
    PW, TEMPLATE_ITEMS, _add_second_approver, _approve, _passing_items, _ready_itr, _state, _uid, env,
)
from test_itr_revoke_approval_acceptance import _get_or_create_perm, _mk_itr


def _add_readers(env):
    db = env.Session()
    try:
        db.add(models.Contractor(id="OTHER-V", name="Other Co", abbreviation="OTH"))
        specs = {"HistViewer": ([perms.ITR_VIEW], None), "HistSameVendor": ([perms.ITR_VIEW], "ACC-V1"),
                 "HistOtherVendor": ([perms.ITR_VIEW], "OTHER-V"), "HistNoPerm": ([perms.CHECKLIST_VIEW], None)}
        for name, (codes, vendor) in specs.items():
            role = models.Role(name=name)
            role.permissions_rel = [_get_or_create_perm(db, c) for c in codes]
            db.add(role); db.flush()
            uname = name.lower()
            db.add(models.User(username=uname, email=f"{uname}@example.com", is_active=True, vendor_id=vendor,
                               hashed_password=get_password_hash(PW), role_id=role.id))
        db.commit()
    finally:
        db.close()


@pytest.fixture
def hist(env):
    _add_second_approver(env)
    _add_readers(env)
    return env


def _revoke(env, itr_id, reason="wrong measurement"):
    r = env.login("acc_approver").post(f"/api/itr/{itr_id}/revoke-approval", json={"new_status": "In Progress", "reason": reason})
    assert r.status_code == 200, r.text


def _full_history(env):
    """approve (A) -> revoke -> Reopen + correct -> approve (B). Returns (itr_id, inst_id)."""
    itr_id, (inst,) = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    _revoke(env, itr_id)
    assert env.login("acc_closer").put(f"/api/checklist/{inst}/", json={"status": "Ongoing"}).status_code == 200
    assert env.login("acc_editor").put(f"/api/checklist/{inst}/", json={
        "status": "Pass", "passCount": 2, "failCount": 0,
        "detail_data": json.dumps({"items": _passing_items("Re-measured 148mm")})}).status_code == 200
    assert _approve(env, itr_id, who="acc_approver2").status_code == 200
    return itr_id, inst


def _insert_events(env, itr_id, n, start=1):
    db = env.Session()
    try:
        for i in range(start, start + n):
            db.add(models.ITRApprovalEvent(
                itr_id=itr_id, document_number="DOC", sequence=i, event_type="APPROVED" if i % 2 else "REVOKED",
                occurred_at=f"2026-09-20T00:00:{i:02d}+00:00", actor_user_id=1, actor_username="seeded", actor_full_name="Seed Person",
                status_before="In Progress", status_after="Approved", reason=None if i % 2 else f"reason {i}"))
        db.commit()
    finally:
        db.close()


def _snapshot_of_reads(env, itr_id):
    st = _state(env, itr_id)
    return st["itr"], st["events"], st["audits"], st["checklists"]


# ── 1. the real history, in order, from the stored events ────────────────

def test_list_and_details_follow_approve_revoke_reapprove_by_another_person(hist):
    env = hist
    itr_id, inst = _full_history(env)
    a, b = _uid(env, "acc_approver"), _uid(env, "acc_approver2")
    viewer = env.login("histviewer")
    r = viewer.get(f"/api/itr/{itr_id}/approval-events")
    assert r.status_code == 200, r.text
    page = r.json()
    assert (page["total"], page["skip"], page["limit"]) == (3, 0, 20)
    e1, e2, e3 = page["items"]
    assert [e["sequence"] for e in page["items"]] == [1, 2, 3] and [e["event_type"] for e in page["items"]] == ["APPROVED", "REVOKED", "APPROVED"]
    assert (e1["actor_user_id"], e1["actor_username"], e1["actor_full_name"]) == (a, "acc_approver", "Ada Approver")
    assert (e3["actor_user_id"], e3["actor_username"], e3["actor_full_name"]) == (b, "acc_approver2", "Bea Approver")
    assert e2["reason"] == "wrong measurement" and e2["approval_event_id"] == e1["id"] and e2["approval_event_sequence"] == 1
    assert (e2["status_before"], e2["status_after"]) == ("Approved", "In Progress") and all(e["occurred_at"].endswith("+00:00") for e in page["items"])
    assert [e["has_snapshot"] for e in page["items"]] == [True, False, True]
    for e in page["items"]:                                            # the list never carries the (large) snapshots
        assert "itr_snapshot" not in e and "checklists_snapshot" not in e and "snapshot_sha256" not in e

    d1 = viewer.get(f"/api/itr/{itr_id}/approval-events/{e1['id']}").json()
    d3 = viewer.get(f"/api/itr/{itr_id}/approval-events/{e3['id']}").json()
    assert d1["checklists_snapshot"][0]["items"][0]["situation"] == "Measured 150mm"
    assert d3["checklists_snapshot"][0]["items"][0]["situation"] == "Re-measured 148mm"
    for d in (d1, d3):
        c = d["checklists_snapshot"][0]
        assert c["id"] == inst and c["status"] == "Pass" and c["source_template_version"] == 1 and c["template_id"]
        assert c["items"][0]["criteria"] == "<=200mm" and d["itr_snapshot"]["status"] == "Approved"
        assert d["snapshot_sha256_matches"] is True and len(d["snapshot_sha256"]) == 64
    assert d1["itr_snapshot"]["approvedBy"] == str(a) and d3["itr_snapshot"]["approvedBy"] == str(b)
    rev = viewer.get(f"/api/itr/{itr_id}/approval-events/{e2['id']}").json()
    assert rev["itr_snapshot"] is None and rev["checklists_snapshot"] is None and rev["snapshot_sha256_matches"] is None


def test_history_is_the_stored_event_not_the_current_user_or_records(hist):
    env = hist
    itr_id, inst = _full_history(env)
    viewer = env.login("histviewer")
    before_list = viewer.get(f"/api/itr/{itr_id}/approval-events").json()
    ids = [e["id"] for e in before_list["items"]]
    before_detail = [viewer.get(f"/api/itr/{itr_id}/approval-events/{i}").json() for i in ids]

    db = env.Session()                                                 # rename + deactivate the approver, change live records
    try:
        u = db.query(models.User).filter_by(username="acc_approver").one()
        u.username, u.full_name, u.is_active = "renamed_person", "Totally New Name", False
        chk = db.get(models.Checklist, inst); chk.detail_data = json.dumps({"items": [{"item": "LIVE CHANGED"}]}); chk.recordsNo = "X-LIVE"
        itr = db.get(models.ITR, itr_id); itr.subject = "LIVE SUBJECT"
        db.commit()
    finally:
        db.close()

    assert viewer.get(f"/api/itr/{itr_id}/approval-events").json() == before_list
    assert [viewer.get(f"/api/itr/{itr_id}/approval-events/{i}").json() for i in ids] == before_detail
    blob = json.dumps(before_detail)
    assert "renamed_person" not in blob and "Totally New Name" not in blob and "LIVE CHANGED" not in blob and "LIVE SUBJECT" not in blob


def test_reading_never_changes_anything(hist):
    env = hist
    itr_id, _ = _full_history(env)
    viewer = env.login("histviewer")
    before = _snapshot_of_reads(env, itr_id)
    page = viewer.get(f"/api/itr/{itr_id}/approval-events").json()
    for e in page["items"]:
        assert viewer.get(f"/api/itr/{itr_id}/approval-events/{e['id']}").status_code == 200
    assert _snapshot_of_reads(env, itr_id) == before                   # ITR, events (incl. snapshots), audits (no read audit), checklists


def test_there_is_no_way_to_modify_or_delete_an_event_through_the_api(hist):
    env = hist
    itr_id, _ = _full_history(env)
    approver = env.login("acc_approver")                               # holds itr:approve, the strongest ITR permission in the suite
    before = _snapshot_of_reads(env, itr_id)
    ev_id = _state(env, itr_id)["events"][0]["id"]
    for method in ("post", "put", "patch", "delete"):
        for path in (f"/api/itr/{itr_id}/approval-events", f"/api/itr/{itr_id}/approval-events/{ev_id}"):
            r = getattr(approver, method)(path, json={"reason": "tamper"}) if method != "delete" else approver.delete(path)
            assert r.status_code in (404, 405), (method, path, r.status_code)
    assert _snapshot_of_reads(env, itr_id) == before


# ── 2. permission and data scope ─────────────────────────────────────────

def test_permission_and_scope_gate_the_list_and_every_single_event(hist):
    env = hist
    itr_id, _ = _full_history(env)
    other_itr, _ = _ready_itr(env)
    assert _approve(env, other_itr).status_code == 200
    ev = _state(env, itr_id)["events"][0]["id"]
    foreign_ev = _state(env, other_itr)["events"][0]["id"]

    for who in ("histviewer", "histsamevendor"):                        # unscoped viewer, and a viewer scoped to the ITR's own contractor
        c = env.login(who)
        assert c.get(f"/api/itr/{itr_id}/approval-events").status_code == 200
        assert c.get(f"/api/itr/{itr_id}/approval-events/{ev}").status_code == 200

    other = env.login("histothervendor")                               # scoped to a DIFFERENT contractor: same answer as a missing ITR
    assert other.get(f"/api/itr/{itr_id}/approval-events").status_code == 404
    assert other.get(f"/api/itr/{itr_id}/approval-events/{ev}").status_code == 404
    assert other.get(f"/api/itr/{itr_id}").status_code == 404           # consistent with reading the ITR itself

    noperm = env.login("histnoperm")
    assert noperm.get(f"/api/itr/{itr_id}/approval-events").status_code == 403
    assert noperm.get(f"/api/itr/{itr_id}/approval-events/{ev}").status_code == 403
    anon = env.anonymous()
    assert anon.get(f"/api/itr/{itr_id}/approval-events").status_code in (401, 403)
    assert anon.get(f"/api/itr/{itr_id}/approval-events/{ev}").status_code in (401, 403)

    viewer = env.login("histviewer")
    assert viewer.get(f"/api/itr/{itr_id}/approval-events/{foreign_ev}").status_code == 404        # another ITR's event id under this ITR
    assert viewer.get(f"/api/itr/{itr_id}/approval-events/999999").status_code == 404
    assert viewer.get("/api/itr/no-such-itr/approval-events").status_code == 404
    assert viewer.get(f"/api/itr/{itr_id}/approval-events/abc").status_code == 422


# ── 3. what is NOT invented ──────────────────────────────────────────────

def test_no_events_is_an_empty_list_not_an_error_and_nothing_is_made_up_for_legacy_records(hist):
    env = hist
    plain = _mk_itr(env)
    legacy = _mk_itr(env)
    db = env.Session()
    try:
        row = db.get(models.ITR, legacy); row.status = "Approved"; row.approvedBy = "7"; row.approvedAt = "2026-01-02T03:04:05+00:00"
        db.commit()
    finally:
        db.close()
    viewer = env.login("histviewer")
    for itr_id in (plain, legacy):
        r = viewer.get(f"/api/itr/{itr_id}/approval-events")
        assert r.status_code == 200 and r.json() == {"items": [], "total": 0, "skip": 0, "limit": 20}
    assert _state(env, legacy)["events"] == []                          # still nothing stored


def test_a_revocation_of_a_pre_event_approval_reports_its_target_as_unknown(hist):
    env = hist
    itr_id, _ = _ready_itr(env)
    db = env.Session()
    try:
        db.get(models.ITR, itr_id).status = "Approved"; db.commit()      # legacy approval: no event
    finally:
        db.close()
    _revoke(env, itr_id, "legacy fix")
    (rev,) = env.login("histviewer").get(f"/api/itr/{itr_id}/approval-events").json()["items"]
    assert rev["event_type"] == "REVOKED" and rev["approval_event_id"] is None and rev["approval_event_sequence"] is None


def test_a_snapshot_whose_content_no_longer_matches_its_hash_is_reported_not_hidden(hist):
    env = hist
    itr_id, _ = _ready_itr(env)
    assert _approve(env, itr_id).status_code == 200
    ev = _state(env, itr_id)["events"][0]["id"]
    db = env.Session()
    try:                                                                # raw SQL: what a database administrator could do
        db.execute(text("UPDATE itr_approval_events SET checklists_snapshot = replace(checklists_snapshot, 'Measured 150mm', 'Altered') WHERE id = :i"), {"i": ev})
        db.commit()
    finally:
        db.close()
    d = env.login("histviewer").get(f"/api/itr/{itr_id}/approval-events/{ev}").json()
    assert "Altered" in json.dumps(d["checklists_snapshot"]) and d["snapshot_sha256_matches"] is False       # it never claims more than a consistency check


# ── 4. pagination ────────────────────────────────────────────────────────

def test_pagination_has_a_fixed_order_and_bounded_pages(hist):
    env = hist
    itr_id = _mk_itr(env)
    _insert_events(env, itr_id, 7)
    v = env.login("histviewer")
    pages = [v.get(f"/api/itr/{itr_id}/approval-events", params={"skip": s, "limit": 3}).json() for s in (0, 3, 6)]
    assert [len(p["items"]) for p in pages] == [3, 3, 1] and all(p["total"] == 7 for p in pages)
    assert [e["sequence"] for p in pages for e in p["items"]] == [1, 2, 3, 4, 5, 6, 7]              # ascending, no gaps or repeats
    again = v.get(f"/api/itr/{itr_id}/approval-events", params={"skip": 3, "limit": 3}).json()
    assert again == pages[1]                                                                        # stable
    assert v.get(f"/api/itr/{itr_id}/approval-events", params={"skip": 50, "limit": 3}).json()["items"] == []
    assert v.get(f"/api/itr/{itr_id}/approval-events").json()["limit"] == 20                        # default page size
    for bad in ({"limit": 0}, {"limit": 101}, {"skip": -1}, {"limit": "x"}):
        assert v.get(f"/api/itr/{itr_id}/approval-events", params=bad).status_code == 422
    assert len(v.get(f"/api/itr/{itr_id}/approval-events", params={"limit": 100}).json()["items"]) == 7
