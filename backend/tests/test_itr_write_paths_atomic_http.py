"""ITR create / delete / link / unlink / create-NCR / re-inspect: change + audit in ONE transaction (2026-09-20).

Each of these paths used to commit the business change (through the repository or a direct
`db.commit()`) and only THEN call the non-strict `log_audit`, which just `db.add()`s the audit row —
nothing committed it afterwards, so the row vanished when the request's session closed, and an
exception raised after the commit (or between two commits, as in re-inspection) left a half-done
change behind. `update_itr` and `revoke_itr_approval` were fixed earlier; these six were not.

Real logins, real HTTP routes, one Session per request, brand-new-session assertions, isolated
in-memory DB (no `main`, so nothing here can reach a development database, backup or log).
Failure injection replaces `log_audit` / `generate_reference_no` / `Session.commit` for one request.
"""
import json

import pytest
from sqlalchemy.orm import Session

import models
from core import perms
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import (   # noqa: F401  (env is a fixture, re-exported on purpose)
    ITEM, PW, _get_or_create_perm, _mk_itr, env,
)

VENDOR_BODY = {"vendor": "Accept Co", "description": "d", "rev": "Rev1.0", "submit": "2026-09-20", "status": "In Progress"}


@pytest.fixture
def full(env):
    """An account that may create/update/delete ITRs and create NCRs (the shared roles lack delete / NCR create)."""
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
    return env.login("acc_full")


# ── builders ─────────────────────────────────────────────────────────────

def _template(env, activity="Rebar"):
    r = env.login("acc_editor").post("/api/checklist/", json={
        "activity": activity, "date": "2026-09-20", "status": "Ongoing", "detail_data": json.dumps({"items": [ITEM]})})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _itr_with_instances(env, n=1, fail=False, fill=False):
    itr_id = _mk_itr(env)
    editor = env.login("acc_editor")
    insts = []
    for i in range(n):
        tpl = _template(env, f"Act-{i}")
        assert editor.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl}).status_code == 200
    db = env.Session()
    try:
        insts = [c.id for c in db.query(models.Checklist).filter_by(itrId=itr_id).order_by(models.Checklist.recordsNo)]
        if fail:
            db.get(models.ITR, itr_id).inspectionResult = "Fail"
            db.commit()
    finally:
        db.close()
    if fill:                                    # give them real results so the re-inspection has something to blank
        for inst in insts:
            r = editor.put(f"/api/checklist/{inst}/", json={"status": "Fail", "passCount": 0, "failCount": 1, "detail_data": json.dumps(
                {"items": [{**ITEM, "situation": "Measured 350mm", "result": "X"}]})})
            assert r.status_code == 200, r.text
    return itr_id, insts


def _world(env):
    """Everything these paths can touch, through a brand-new session."""
    db = env.Session()
    try:
        def rows(model, key):
            return {getattr(r, key): {c.name: getattr(r, c.name) for c in r.__table__.columns} for r in db.query(model).all()}
        return {
            "itr": rows(models.ITR, "id"),
            "checklist": rows(models.Checklist, "id"),
            "ncr": rows(models.NCR, "id"),
            "audits": sorted((a.action, a.entity_type, a.entity_id, a.user_id, a.username)
                             for a in db.query(models.AuditLog).all() if not a.action.startswith(("LOGIN", "LOGOUT"))),
            "sequences": sorted(tuple(getattr(r, c.name) for c in r.__table__.columns) for r in db.query(models.ReferenceSequence).all()),
        }
    finally:
        db.close()


def _audit_rows(env, action, entity_id=None, entity_type=None):
    db = env.Session()
    try:
        q = db.query(models.AuditLog).filter_by(action=action)
        if entity_id is not None:
            q = q.filter_by(entity_id=entity_id)
        if entity_type is not None:
            q = q.filter_by(entity_type=entity_type)
        return [{"user_id": a.user_id, "username": a.username, "entity_type": a.entity_type, "entity_id": a.entity_id,
                 "entity_name": a.entity_name, "old": a.old_value, "new": a.new_value, "timestamp": a.timestamp} for a in q.all()]
    finally:
        db.close()


def _boom(*a, **k):
    raise RuntimeError("audit backend down")


class _Fail:
    """Context factory: run a request with one injected fault."""
    @staticmethod
    def audit():
        import services.itr_service as svc
        m = pytest.MonkeyPatch()
        m.setattr(svc, "log_audit", _boom)
        return m

    @staticmethod
    def commit():
        m = pytest.MonkeyPatch()

        def failing_commit(self, *a, **k):
            raise RuntimeError("disk full")
        m.setattr(Session, "commit", failing_commit)
        return m

    @staticmethod
    def nth_reference(n):
        import services.itr_service as svc
        real, calls = svc.generate_reference_no, {"n": 0}

        def flaky(*a, **k):
            calls["n"] += 1
            if calls["n"] == n:
                raise RuntimeError("numbering backend down")
            return real(*a, **k)
        m = pytest.MonkeyPatch()
        m.setattr(svc, "generate_reference_no", flaky)
        return m


def _expect_fault(fault, request_fn):
    m = fault
    try:
        with pytest.raises(RuntimeError):
            request_fn()
    finally:
        m.undo()


# ══ create_itr ═══════════════════════════════════════════════════════════

def test_create_itr_success_persists_the_row_and_its_audit(env, full):
    r = full.post("/api/itr/", json=VENDOR_BODY)
    assert r.status_code == 200, r.text
    itr_id = r.json()["id"]
    rows = _audit_rows(env, "CREATE", itr_id, "ITR")
    assert len(rows) == 1 and rows[0]["username"] == "acc_full" and rows[0]["user_id"] and rows[0]["timestamp"]   # previously lost
    assert _world(env)["itr"][itr_id]["documentNumber"] == r.json()["documentNumber"]


@pytest.mark.parametrize("fault", ["audit", "commit"])
def test_create_itr_failure_leaves_no_itr_no_audit_and_no_consumed_number(env, full, fault):
    before = _world(env)
    _expect_fault(getattr(_Fail, fault)(), lambda: full.post("/api/itr/", json=VENDOR_BODY))
    assert _world(env) == before
    assert full.post("/api/itr/", json=VENDOR_BODY).status_code == 200                      # and the system is usable


# ══ delete_itr ═══════════════════════════════════════════════════════════

# 2026-09-20 (history-preservation rule CHANGE, round 5): these tests used to build a re-inspection child
# and expect a successful delete to CLEAR the child's originalItrId ("existing cleanup still happens").
# That behaviour is gone on purpose: an ITR that a re-inspection refers to can no longer be deleted at all
# (see test_itr_history_preservation_http.py for the refusal and the preserved chain). The atomicity tests
# below therefore use a genuinely deletable ITR — never approved, no evidence, not referenced.
def _deletable_itr(env):
    itr_id, insts = _itr_with_instances(env, n=2, fail=True)                              # untouched instances: no evidence
    return itr_id, insts


def test_delete_itr_success_removes_it_and_records_the_audit(env, full):
    itr_id, insts = _deletable_itr(env)
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 200, r.text
    w = _world(env)
    assert itr_id not in w["itr"] and not any(i in w["checklist"] for i in insts)
    (a,) = _audit_rows(env, "DELETE", itr_id, "ITR")
    assert a["username"] == "acc_full" and json.loads(a["old"])["id"] == itr_id             # previously lost


@pytest.mark.parametrize("fault", ["audit", "commit"])
def test_delete_itr_failure_deletes_nothing(env, full, fault):
    itr_id, insts = _deletable_itr(env)
    before = _world(env)
    _expect_fault(getattr(_Fail, fault)(), lambda: full.delete(f"/api/itr/{itr_id}"))
    after = _world(env)
    assert after == before                                                                  # ITR, its instances, audits
    assert itr_id in after["itr"] and all(i in after["checklist"] for i in insts)


def test_delete_itr_refusals_still_apply_and_change_nothing(env, full):
    itr_id, insts = _itr_with_instances(env, n=1, fill=True)                               # holds evidence -> existing rule refuses
    before = _world(env)
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 400 and "evidence" in r.text
    assert _world(env) == before


# ══ link_checklist ═══════════════════════════════════════════════════════

def test_link_success_persists_the_instance_and_its_audit(env, full):
    itr_id = _mk_itr(env)
    tpl = _template(env)
    r = full.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl})
    assert r.status_code == 200, r.text
    w = _world(env)
    (inst,) = [c for c in w["checklist"].values() if c["itrId"] == itr_id]
    (a,) = _audit_rows(env, "LINK_CHECKLIST", itr_id, "ITR")
    assert a["username"] == "acc_full" and json.loads(a["new"]) == {"template_id": tpl, "instance_id": inst["id"]}     # previously lost
    assert inst["template_id"] == tpl and inst["source_template_version"] == 1


@pytest.mark.parametrize("fault", ["audit", "commit", "numbering"])
def test_link_failure_leaves_no_instance_audit_or_consumed_number(env, full, fault):
    itr_id = _mk_itr(env)
    tpl = _template(env)
    before = _world(env)
    fault_cm = _Fail.nth_reference(1) if fault == "numbering" else getattr(_Fail, fault)()
    _expect_fault(fault_cm, lambda: full.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl}))
    assert _world(env) == before


# ══ unlink_checklist ═════════════════════════════════════════════════════

def test_unlink_success_removes_the_instance_and_records_the_audit(env, full):
    itr_id, (inst,) = _itr_with_instances(env, n=1)
    r = full.delete(f"/api/itr/{itr_id}/link-checklist/{inst}")
    assert r.status_code == 200, r.text
    assert inst not in _world(env)["checklist"]
    (a,) = _audit_rows(env, "UNLINK_CHECKLIST", itr_id, "ITR")
    assert a["username"] == "acc_full" and json.loads(a["old"]) == {"instance_id": inst}                              # previously lost


@pytest.mark.parametrize("fault", ["audit", "commit"])
def test_unlink_failure_keeps_the_instance_and_writes_nothing(env, full, fault):
    itr_id, (inst,) = _itr_with_instances(env, n=1)
    before = _world(env)
    _expect_fault(getattr(_Fail, fault)(), lambda: full.delete(f"/api/itr/{itr_id}/link-checklist/{inst}"))
    after = _world(env)
    assert after == before and inst in after["checklist"]


# ══ create_ncr_from_itr ══════════════════════════════════════════════════

def test_create_ncr_success_persists_ncr_link_and_both_audits(env, full):
    itr_id, _ = _itr_with_instances(env, n=1, fail=True)
    r = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert r.status_code == 200, r.text
    ncr_id, ncr_no = r.json()["id"], r.json()["documentNumber"]
    w = _world(env)
    assert w["ncr"][ncr_id]["itrNumber"] == w["itr"][itr_id]["documentNumber"] and w["itr"][itr_id]["ncrNumber"] == ncr_no
    (a1,) = _audit_rows(env, "CREATE", ncr_id, "NCR")
    (a2,) = _audit_rows(env, "CREATE_NCR_FROM_ITR", itr_id, "ITR")
    assert a1["username"] == a2["username"] == "acc_full" and json.loads(a2["new"]) == {"ncrId": ncr_id, "ncrNumber": ncr_no}   # previously lost


@pytest.mark.parametrize("fault", ["audit", "commit", "numbering"])
def test_create_ncr_failure_creates_no_ncr_no_link_no_audit_no_number(env, full, fault):
    itr_id, _ = _itr_with_instances(env, n=1, fail=True)
    before = _world(env)
    fault_cm = _Fail.nth_reference(1) if fault == "numbering" else getattr(_Fail, fault)()
    _expect_fault(fault_cm, lambda: full.post(f"/api/itr/{itr_id}/create-ncr"))
    after = _world(env)
    assert after == before and after["itr"][itr_id]["ncrNumber"] is None


def test_create_ncr_second_audit_failing_rolls_back_the_ncr_too(env, full):
    """Two audit entries are written; a failure on the SECOND one must not leave the NCR (and the first entry) behind."""
    itr_id, _ = _itr_with_instances(env, n=1, fail=True)
    before = _world(env)
    import services.itr_service as svc
    real, calls = svc.log_audit, {"n": 0}

    def second_fails(*a, **k):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("second audit down")
        return real(*a, **k)
    m = pytest.MonkeyPatch(); m.setattr(svc, "log_audit", second_fails)
    _expect_fault(m, lambda: full.post(f"/api/itr/{itr_id}/create-ncr"))
    assert calls["n"] == 2 and _world(env) == before


# ══ create_reinspection (multi-row) ══════════════════════════════════════

def test_reinspection_success_persists_new_itr_all_blanked_instances_and_both_audits(env, full):
    itr_id, insts = _itr_with_instances(env, n=2, fail=True, fill=True)
    r = full.post(f"/api/itr/{itr_id}/re-inspect")
    assert r.status_code == 200, r.text
    new_id = r.json()["id"]
    w = _world(env)
    new_insts = [c for c in w["checklist"].values() if c["itrId"] == new_id]
    assert len(new_insts) == 2 and all(c["status"] == "Ongoing" for c in new_insts)
    assert all(json.loads(c["detail_data"])["items"][0]["result"] == "" for c in new_insts)            # results blanked, structure kept
    assert {c["template_id"] for c in new_insts} == {w["checklist"][i]["template_id"] for i in insts}
    assert w["checklist"][insts[0]]["status"] == "Fail"                                                # the original is untouched
    (a1,) = _audit_rows(env, "CREATE", new_id, "ITR")
    (a2,) = _audit_rows(env, "CREATE_REINSPECTION", itr_id, "ITR")
    assert a1["username"] == a2["username"] == "acc_full"                                              # previously lost


@pytest.mark.parametrize("fault", ["audit", "commit", "second_instance_numbering", "itr_numbering"])
def test_reinspection_failure_leaves_no_new_itr_no_partial_instances_no_audit(env, full, fault):
    itr_id, insts = _itr_with_instances(env, n=2, fail=True, fill=True)
    before = _world(env)
    fault_cm = {"audit": _Fail.audit, "commit": _Fail.commit,
                "second_instance_numbering": lambda: _Fail.nth_reference(3),      # ITR number, instance 1, instance 2 <- fails
                "itr_numbering": lambda: _Fail.nth_reference(1)}[fault]()
    _expect_fault(fault_cm, lambda: full.post(f"/api/itr/{itr_id}/re-inspect"))
    after = _world(env)
    assert after == before
    assert len(after["itr"]) == len(before["itr"]) and len(after["checklist"]) == len(before["checklist"])


def test_reinspection_second_audit_failing_rolls_back_everything(env, full):
    itr_id, _ = _itr_with_instances(env, n=2, fail=True, fill=True)
    before = _world(env)
    import services.itr_service as svc
    real, calls = svc.log_audit, {"n": 0}

    def second_fails(*a, **k):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("second audit down")
        return real(*a, **k)
    m = pytest.MonkeyPatch(); m.setattr(svc, "log_audit", second_fails)
    _expect_fault(m, lambda: full.post(f"/api/itr/{itr_id}/re-inspect"))
    assert calls["n"] == 2 and _world(env) == before


def test_reinspection_still_refuses_a_non_failed_itr_and_changes_nothing(env, full):
    itr_id, _ = _itr_with_instances(env, n=1)                                                          # not Fail
    before = _world(env)
    assert full.post(f"/api/itr/{itr_id}/re-inspect").status_code == 400
    assert full.post(f"/api/itr/{itr_id}/create-ncr").status_code == 400
    assert _world(env) == before


# ══ permissions and scope are unchanged ══════════════════════════════════

def test_permissions_still_gate_every_path_and_refused_requests_change_nothing(env, full):
    itr_id, (inst,) = _itr_with_instances(env, n=1, fail=True)
    tpl = _template(env, "Other")
    before = _world(env)
    editor, closer = env.login("acc_editor"), env.login("acc_closer")                      # no itr:delete, no ncr:create
    assert editor.delete(f"/api/itr/{itr_id}").status_code == 403
    assert editor.post(f"/api/itr/{itr_id}/create-ncr").status_code == 403
    anon = env.anonymous()
    for fn in (lambda: anon.post("/api/itr/", json=VENDOR_BODY), lambda: anon.delete(f"/api/itr/{itr_id}"),
               lambda: anon.post(f"/api/itr/{itr_id}/re-inspect"), lambda: anon.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl}),
               lambda: anon.delete(f"/api/itr/{itr_id}/link-checklist/{inst}")):
        assert fn().status_code in (401, 403)
    assert _world(env) == before
