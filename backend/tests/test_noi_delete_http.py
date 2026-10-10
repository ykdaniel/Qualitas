"""NOI delete over HTTP (coordination center, 2026-10-11; found by the NOI full-feature simulation).

Deleting an NOI that ITR / NCR / Observation / Checklist records still cite is a business refusal: the router must answer
400 with the reason (it used to surface as `500 Internal Server Error: …` because DELETE did not map the service's
ValueError), and nothing may be deleted. An NOI with nothing under it is still deleted.
Every document that cites the NOI blocks deletion: ITR / NCR / Observation / Checklist by noiNumber, and a Follow-up
whose source is the NOI (business decision 2026-10-11 — the same set that locks the NOI's contractor).
A NOI created without a status starts at "Open", the start of the NOI workflow (it used to be "Draft", a state the
workflow does not have).
Same throwaway world as the other NOI HTTP tests (test_noi_create_atomic_http.noi_env).
"""
import pytest

import models
from core import perms
from test_noi_create_atomic_http import noi_env, _create, _noi_body  # noqa: F401  (fixture re-export)
from test_noi_contractor_lock_http import _cite, _followup


def _grant_delete(env):
    db = env.Session()
    try:
        role = db.query(models.Role).filter_by(name="NoiUser").one()
        perm = db.query(models.Permission).filter_by(code=perms.NOI_DELETE).first() or models.Permission(
            code=perms.NOI_DELETE, description=perms.NOI_DELETE)
        role.permissions_rel.append(perm)
        db.commit()
    finally:
        db.close()


def _exists(env, noi_id):
    db = env.Session()
    try:
        return db.get(models.NOI, noi_id) is not None
    finally:
        db.close()


@pytest.mark.parametrize("kind", ["itr", "ncr", "obs", "checklist"])
def test_deleting_a_cited_noi_is_a_400_and_deletes_nothing(noi_env, kind):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    _cite(env, kind, noi["referenceNo"])
    r = c.delete(f"/api/noi/{noi['id']}/")
    assert r.status_code == 400, r.text
    assert "Cannot delete NOI" in r.json()["detail"] and "referenced by" in r.json()["detail"]
    assert _exists(env, noi["id"])


def test_an_noi_with_nothing_under_it_is_deleted(noi_env):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    r = c.delete(f"/api/noi/{noi['id']}/")
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert not _exists(env, noi["id"])
    assert c.delete(f"/api/noi/{noi['id']}/").status_code == 404


def test_delete_still_needs_the_delete_permission(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")                                    # NoiUser without noi:delete
    noi = _create(c).json()
    assert c.delete(f"/api/noi/{noi['id']}/").status_code == 403
    assert _exists(env, noi["id"])


@pytest.mark.parametrize("module", ["NOI", " noi "])
def test_a_follow_up_raised_from_the_noi_blocks_deletion_too(noi_env, module):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    _followup(env, noi["referenceNo"], module)
    r = c.delete(f"/api/noi/{noi['id']}/")
    assert r.status_code == 400 and "Follow-up" in r.json()["detail"], r.text
    assert _exists(env, noi["id"])


def test_a_follow_up_of_another_module_with_the_same_number_does_not_block(noi_env):
    env, _ = noi_env
    _grant_delete(env)
    c = env.login("noi_a")
    noi = _create(c).json()
    _followup(env, noi["referenceNo"], module="NCR")
    assert c.delete(f"/api/noi/{noi['id']}/").status_code == 200
    assert not _exists(env, noi["id"])


def test_an_noi_created_without_a_status_starts_open(noi_env):
    env, _ = noi_env
    c = env.login("noi_a")
    body = _noi_body()
    del body["status"]                                        # the shared body sends "Open"; this create sends none
    r = c.post("/api/noi/", json=body)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Open"
