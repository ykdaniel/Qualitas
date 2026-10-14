"""NOI delete / update / delete prompt / expected reference number (NOI-DEFECTS-2026-001, 2026-10-12).

Audit: the change and its audit entry are ONE transaction (NOI-DEFECTS-2026-001, 2026-10-12).

Found by the NOI-batch independent review (2026-10-11): `delete_noi` and `update_noi` committed the NOI through the repository
first and only then `db.add()`-ed the audit entry with a non-strict `log_audit`; nothing committed it afterwards, so the session
dropped it at the end of the request — no `DELETE` / `UPDATE` row ever reached `audit_logs` (the same defect NCR create/update had,
fixed 2026-09-21 in test_ncr_audit_atomic_http). Create was already atomic (test_noi_create_atomic_http).

Now: the change + the Q-WorkFlow clean-up + the audit entry are committed ONCE with a strict audit; a failing audit or commit rolls
EVERYTHING back. Brand-new Sessions for every database assertion.
"""
import pytest
from sqlalchemy.orm import Session

import models
from test_noi_create_atomic_http import noi_env, _create  # noqa: F401  (fixture re-export)
from test_noi_delete_http import _grant_delete, _exists
from test_noi_contractor_lock_http import _cite, _followup


def _audits(env, action, entity_id):
    db = env.Session()
    try:
        return db.query(models.AuditLog).filter_by(entity_type="NOI", action=action, entity_id=entity_id).all()
    finally:
        db.close()


def _qworkflows(env, noi_id):
    db = env.Session()
    try:
        return db.query(models.QWorkflow).filter_by(noi_id=noi_id).count()
    finally:
        db.close()


def test_a_delete_records_one_audit_entry_with_the_deleted_row_and_who(noi_env):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    assert c.delete(f"/api/noi/{noi['id']}/").status_code == 200
    assert not _exists(env, noi["id"]) and _qworkflows(env, noi["id"]) == 0
    (a,) = _audits(env, "DELETE", noi["id"])
    assert (a.entity_name, a.username) == (noi["referenceNo"], "noi_a")
    assert noi["referenceNo"] in a.old_value


def test_an_update_records_one_audit_entry(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    noi = _create(c).json()
    r = c.put(f"/api/noi/{noi['id']}/", json={"package": "PKG-CHANGED"})
    assert r.status_code == 200, r.text
    (a,) = _audits(env, "UPDATE", noi["id"])
    assert a.username == "noi_a" and "PKG-CHANGED" in a.new_value


@pytest.mark.parametrize("kind", ["audit", "commit"])
def test_a_failing_audit_or_commit_rolls_a_delete_back_completely(noi_env, monkeypatch, kind):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    if kind == "audit":
        import core.utils as cu
        real = cu.AuditLog
        monkeypatch.setattr(cu, "AuditLog", lambda **kw: (_ for _ in ()).throw(RuntimeError("audit down")) if kw.get("action") == "DELETE" else real(**kw))
    else:
        real_commit = Session.commit
        monkeypatch.setattr(Session, "commit", lambda self: (_ for _ in ()).throw(RuntimeError("disk full")))
    with pytest.raises(RuntimeError):
        c.delete(f"/api/noi/{noi['id']}/")
    monkeypatch.undo()
    assert _exists(env, noi["id"]) and _qworkflows(env, noi["id"]) == 1
    assert _audits(env, "DELETE", noi["id"]) == []


# ══ delete prompt: GET /noi/{id}/delete-check reads the same list the delete refuses on ══════════════════

def test_the_delete_check_lists_every_citing_document_and_changes_nothing(noi_env):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    r = c.get(f"/api/noi/{noi['id']}/delete-check")
    assert r.status_code == 200 and r.json() == {"referenceNo": noi["referenceNo"], "canDelete": True, "references": []}
    for kind in ("itr", "obs", "checklist"):
        _cite(env, kind, noi["referenceNo"])
    _followup(env, noi["referenceNo"], "NOI")
    body = c.get(f"/api/noi/{noi['id']}/delete-check").json()
    assert body["canDelete"] is False
    assert {(x["type"], x["count"]) for x in body["references"]} == {("ITR", 1), ("Observation", 1), ("Checklist", 1), ("Follow-up", 1)}
    assert _exists(env, noi["id"])


def test_the_delete_check_needs_the_delete_permission_and_an_existing_noi(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")                                    # no noi:delete
    noi = _create(c).json()
    assert c.get(f"/api/noi/{noi['id']}/delete-check").status_code == 403
    _grant_delete(env)
    assert c.get("/api/noi/no-such-id/delete-check").status_code == 404


# ══ expected reference number: GET /noi/next-reference ══════════════════════════════════════════════

def _sequences(env):
    db = env.Session()
    try:
        return sorted((r.project, r.vendor, r.doc, r.last_seq) for r in db.query(models.ReferenceSequence).all())
    finally:
        db.close()


# REF-PROJECT-SEQ-2026-001 B3, design change: numbering is per project (D2), so the expected number is asked for a
# project (the caller's sign-in project, or an administrator's chosen one), never for a contractor, and it is shown in
# full to everyone who may create an NOI there (the 2026-10-12 mask is gone). Was: per contractor, masked for callers
# limited to projects.

def test_the_expected_number_is_what_the_next_create_gets_and_reserves_nothing(noi_env):
    env, _ = noi_env
    c = env.login("noi_admin")                                # a system administrator: names the project
    first = c.get("/api/noi/next-reference", params={"project_id": "P-A"})
    assert first.status_code == 200, first.text
    assert first.json() == {"referenceNo": "QTS-RKS-PA-NOI-000001", "pattern": "QTS-RKS-PA-NOI-######"}
    assert c.get("/api/noi/next-reference", params={"project_id": "P-A"}).json() == first.json()   # asking twice takes nothing
    assert _sequences(env) == []
    created = _create(c, project_id="P-A").json()           # an admin names the project it creates in (REF-PROJECT-SEQ B2, G1)
    assert created["referenceNo"] == first.json()["referenceNo"]
    nxt = c.get("/api/noi/next-reference", params={"project_id": "P-A"}).json()["referenceNo"]
    assert nxt != created["referenceNo"] and _create(c, project_id="P-A", contractor="Beta Co").json()["referenceNo"] == nxt
    assert c.get("/api/noi/next-reference").status_code == 400            # "All projects": choose a project first


def test_the_expected_number_needs_create_permission_and_stays_in_the_callers_project(noi_env):
    env, _ = noi_env
    assert env.login("noi_view").get("/api/noi/next-reference").status_code == 403
    s = env.login("noi_scoped")                               # contractor-scoped to Accept Co, works in project P-A
    own = s.get("/api/noi/next-reference")
    assert own.status_code == 200 and own.json() == {"referenceNo": "QTS-RKS-PA-NOI-000001", "pattern": "QTS-RKS-PA-NOI-######"}
    assert s.get("/api/noi/next-reference", params={"project_id": "P-B"}).status_code == 403


def _project_only_user(env, username="noi_project_only"):
    from test_noi_create_atomic_http import PW
    from core.security import get_password_hash
    db = env.Session()
    try:
        role = db.query(models.Role).filter_by(name="NoiUser").one()
        u = models.User(username=username, email=f"{username}@example.com", is_active=True,
                        hashed_password=get_password_hash(PW), role_id=role.id, full_name=username)
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="P-A"))
        db.commit()
    finally:
        db.close()
    return env.login(username)


def test_a_caller_limited_to_projects_now_sees_the_full_number_of_its_project(noi_env):
    """B3: the sequence is the project's own, so it tells only how many NOIs this project has had — the mask of 2026-10-12
    (format only, referenceNo None) is gone."""
    env, _ = noi_env
    a = env.login("noi_a")
    for _ in range(3):
        assert _create(a).status_code == 200                  # project P-A now has 3 NOIs
    p = _project_only_user(env)
    r = p.get("/api/noi/next-reference")
    assert r.status_code == 200 and r.json() == {"referenceNo": "QTS-RKS-PA-NOI-000004", "pattern": "QTS-RKS-PA-NOI-######"}, r.text
    assert env.login("noi_admin").get("/api/noi/next-reference", params={"project_id": "P-A"}).json()["referenceNo"] == "QTS-RKS-PA-NOI-000004"


def _noi_row(env, noi_id):
    db = env.Session()
    try:
        n = db.get(models.NOI, noi_id)
        return {c.name: getattr(n, c.name) for c in n.__table__.columns}
    finally:
        db.close()


@pytest.mark.parametrize("kind", ["audit", "commit"])
@pytest.mark.parametrize("change", [{"package": "PKG-CHANGED"}, {"contractor": "Beta Co"}])   # the 2nd changed the number until B3
def test_a_failing_audit_or_commit_rolls_an_update_back_completely(noi_env, monkeypatch, kind, change):
    env, _ = noi_env
    c = env.login("noi_a")
    noi = _create(c).json()
    before, seq_before = _noi_row(env, noi["id"]), _sequences(env)
    if kind == "audit":
        import core.utils as cu
        real = cu.AuditLog
        monkeypatch.setattr(cu, "AuditLog", lambda **kw: (_ for _ in ()).throw(RuntimeError("audit down")) if kw.get("action") == "UPDATE" else real(**kw))
    else:
        monkeypatch.setattr(Session, "commit", lambda self: (_ for _ in ()).throw(RuntimeError("disk full")))
    with pytest.raises(RuntimeError):
        c.put(f"/api/noi/{noi['id']}/", json=change)
    monkeypatch.undo()
    assert _noi_row(env, noi["id"]) == before                 # fields, vendor and referenceNo unchanged
    assert _sequences(env) == seq_before                      # a renumbering took no number
    assert _audits(env, "UPDATE", noi["id"]) == []
    if "contractor" in change:                                # and the same change still goes through afterwards
        r = c.put(f"/api/noi/{noi['id']}/", json=change)
        assert r.status_code == 200 and r.json()["referenceNo"] == noi["referenceNo"], r.text   # B3: no renumbering (was -BET-)
