"""NCR delete: the deletion and its audit entry are ONE transaction (NCR-DELETE-AUDIT-2026-001, 2026-10-12).

Before: `delete_ncr` deleted through the repository (whose delete() commits on its own) and only then `db.add()`-ed the audit entry with a
non-strict `log_audit`; nothing committed it afterwards, so the session dropped it at the end of the request — no NCR deletion ever reached
`audit_logs`. The same defect NCR create/update had (fixed 2026-09-21, test_ncr_audit_atomic_http) and NOI delete/update had (fixed in
NOI-DEFECTS-2026-001, test_noi_audit_delete_update_http).

Now: the NCR write lock is taken and the NCR re-read BEFORE the Void-only rule and the ITR-reference check; the delete + a strict audit entry are
committed ONCE; a failing audit, flush or commit rolls EVERYTHING back. The two refusals keep their messages and answer 400 (they used to escape
the route as 500s). Real logins and routes, brand-new Sessions for every database assertion.
"""
import uuid

import pytest

import models
from core import perms
from test_date_write_guard_http import _add_row, _snapshot, denv  # noqa: F401  (denv is a fixture)
from test_ncr_audit_atomic_http import FAILURES, _inject, audit, uid


def _grant_delete(env, role_name="DateUser"):
    db = env.Session()
    try:
        role = db.query(models.Role).filter_by(name=role_name).one()
        perm = db.query(models.Permission).filter_by(code=perms.NCR_DELETE).first() or models.Permission(
            code=perms.NCR_DELETE, description=perms.NCR_DELETE)
        role.permissions_rel.append(perm)
        db.commit()
    finally:
        db.close()


def _exists(env, ncr_id):
    db = env.Session()
    try:
        return db.get(models.NCR, ncr_id) is not None
    finally:
        db.close()


def _cite_by_itr(env, ncr_ref):
    db = env.Session()
    try:
        i = uuid.uuid4().hex
        db.add(models.ITR(id=i, vendor_id="ACC-V1", documentNumber=f"ITR-{i[:6]}", description="d", rev="Rev1.0", submit="s",
                          status="In Progress", ncrNumber=ncr_ref))
        db.commit()
    finally:
        db.close()


def _void(env, ref="NCR-VOID"):
    return _add_row(env, "ncr", ref, status="Void")


def _delete(c, rid):
    return c.delete(f"/api/ncr/{rid}/")


# ══ 1. success: the deletion and its audit are saved together ══════════════════════════════════════════════════════════════════════

def test_a_delete_records_one_audit_entry_with_the_deleted_row_and_who(denv):
    _grant_delete(denv)
    rid = _void(denv)
    r = _delete(denv.login("dt_a"), rid)
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert not _exists(denv, rid)
    (e,) = audit(denv, "DELETE", rid)
    assert (e["entity_name"], e["user_id"], e["username"]) == ("NCR-VOID", uid(denv, "dt_a"), "dt_a") and e["timestamp"]
    assert e["old"]["documentNumber"] == "NCR-VOID" and e["old"]["status"] == "Void" and e["old"]["id"] == rid and e["new"] is None


# ══ 2. refusals: same rules, same messages, now a 400 — nothing deleted, nothing audited ═════════════════════════════════════════

@pytest.mark.parametrize("status", ["Open", "In Progress", "Resolved", "Closed"])
def test_a_non_void_ncr_is_refused_with_400_and_nothing_changes(denv, status):
    _grant_delete(denv)
    rid = _add_row(denv, "ncr", "NCR-LIVE", status=status)
    before = _snapshot(denv)
    r = _delete(denv.login("dt_a"), rid)
    assert r.status_code == 400
    assert r.json()["detail"] == f"Cannot delete NCR 'NCR-LIVE' with status '{status}'. Please Void the NCR first, then delete."
    assert _snapshot(denv) == before and audit(denv, "DELETE") == []


def test_a_void_ncr_still_cited_by_an_itr_is_refused_with_400_and_nothing_changes(denv):
    _grant_delete(denv)
    rid = _void(denv)
    _cite_by_itr(denv, "NCR-VOID")
    before = _snapshot(denv)
    r = _delete(denv.login("dt_a"), rid)
    assert r.status_code == 400
    assert r.json()["detail"] == "Cannot delete NCR 'NCR-VOID': referenced by 1 ITR record(s)"
    assert _snapshot(denv) == before and audit(denv, "DELETE") == []


def test_permission_scope_and_missing_record_still_decide_and_write_nothing(denv):
    rid = _void(denv)
    before = _snapshot(denv)
    assert _delete(denv.login("dt_a"), rid).status_code == 403                  # no ncr:delete:all yet
    _grant_delete(denv)
    assert _delete(denv.login("dt_scoped"), rid).status_code == 404             # contractor Beta Co: an Accept Co NCR is not theirs
    assert _delete(denv.login("dt_a"), "no-such-ncr").status_code == 404
    assert _snapshot(denv) == before and audit(denv, "DELETE") == []


# ══ 3. failure injection: nothing of the delete survives ═══════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("kind", FAILURES)
def test_a_failing_audit_flush_or_commit_rolls_a_delete_back_completely(denv, monkeypatch, kind):
    _grant_delete(denv)
    rid = _void(denv)
    c = denv.login("dt_a")
    before = _snapshot(denv)
    undo = _inject(kind, monkeypatch)
    try:
        with pytest.raises(RuntimeError):
            _delete(c, rid)
    finally:
        undo()
        monkeypatch.undo()
    assert _exists(denv, rid) and _snapshot(denv) == before                      # the NCR is still there, no DELETE entry
    assert _delete(c, rid).status_code == 200                                    # and the same delete works afterwards, with exactly one entry
    assert not _exists(denv, rid) and len(audit(denv, "DELETE", rid)) == 1


# ══ 4. the checks are made under the write lock, on the re-read NCR ════════════════════════════════════════════════════════════════

def _just_before_the_lock(monkeypatch, action):
    """Runs `action` (another request's committed write) after delete_ncr has read the NCR but right before it takes the write lock."""
    import services.ncr_service as svc
    real, ran = svc.lock_ncr_for_write, []

    def lock(db, ncr_id):
        ran.append(ncr_id)
        action()
        return real(db, ncr_id)
    monkeypatch.setattr(svc, "lock_ncr_for_write", lock)
    return ran


def test_an_itr_citing_the_ncr_saved_just_before_the_lock_is_counted(denv, monkeypatch):
    _grant_delete(denv)
    rid = _void(denv)
    ran = _just_before_the_lock(monkeypatch, lambda: _cite_by_itr(denv, "NCR-VOID"))
    r = _delete(denv.login("dt_a"), rid)
    assert ran == [rid]
    assert r.status_code == 400 and "referenced by 1 ITR record(s)" in r.json()["detail"]
    assert _exists(denv, rid) and audit(denv, "DELETE") == []


def test_an_ncr_deleted_by_another_request_first_is_a_404_not_a_500(denv, monkeypatch):
    _grant_delete(denv)
    rid = _void(denv)

    def other_request_deletes_it():
        db = denv.Session()
        try:
            db.delete(db.get(models.NCR, rid))
            db.commit()
        finally:
            db.close()
    ran = _just_before_the_lock(monkeypatch, other_request_deletes_it)
    r = _delete(denv.login("dt_a"), rid)
    assert ran == [rid]
    assert r.status_code == 404 and audit(denv, "DELETE") == []


def test_an_ncr_moved_out_of_the_callers_scope_just_before_the_lock_is_a_404_and_stays(denv, monkeypatch):
    """Scope is judged again on the re-read NCR (as update_ncr judges it after the lock), not only on the copy read before it."""
    _grant_delete(denv)
    keep = _add_row(denv, "ncr", "NCR-SCOPED-OK", status="Void", project_id="P-A")
    assert _delete(denv.login("dt_v1"), keep).status_code == 200              # dt_v1 (Accept Co, P-A) may delete its own NCRs
    rid = _add_row(denv, "ncr", "NCR-SCOPED", status="Void", project_id="P-A")

    def other_request_moves_it():
        db = denv.Session()
        try:
            db.get(models.NCR, rid).vendor_id = "ACC-V2"
            db.commit()
        finally:
            db.close()
    ran = _just_before_the_lock(monkeypatch, other_request_moves_it)
    r = _delete(denv.login("dt_v1"), rid)
    assert ran == [rid]
    assert r.status_code == 404 and _exists(denv, rid)
    assert [e["entity_id"] for e in audit(denv, "DELETE")] == [keep]
