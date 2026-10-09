"""The attachment LIST route and its URL contract (2026-09-21).

The route is exactly `/api/files/by-entity`. The front end used to call `/api/files/by-entity/` (trailing slash): FastAPI answers that with a
307 whose Location is an ABSOLUTE url built from the request's Host — the browser then depends on every proxy in front (a rewrite of Location, or
a preserved Host) to reach the backend at all. The client now asks for the exact route; these tests pin what the server does on both URLs and that
the list is still refused / filtered the same way (permission, scope, soft-deleted), on the exact URL.
"""
from core import perms
from core.security import get_password_hash
import models
from ncr_photos import add_photo
from test_date_write_guard_http import _add_row, denv  # noqa: F401  (denv is a fixture)
from test_itr_revoke_approval_acceptance import PW, _get_or_create_perm

PARAMS = lambda rid, cat="improvementPhoto": {"entity_type": "ncr", "entity_id": rid, "category": cat}


def test_the_exact_route_answers_directly_and_the_slash_variant_is_a_redirect_the_client_must_not_need(denv):
    rid = _add_row(denv, "ncr", "NCR-L")
    aid, _ = add_photo(denv, rid)
    c = denv.login("dt_a")
    direct = c.get("/api/files/by-entity", params=PARAMS(rid), follow_redirects=False)
    assert direct.status_code == 200 and [x["id"] for x in direct.json()] == [aid]
    slash = c.get("/api/files/by-entity/", params=PARAMS(rid), follow_redirects=False)
    assert slash.status_code == 307 and slash.headers["location"].startswith("http")         # absolute: works only if the proxies cooperate


def _user_without_ncr_view(env):
    db = env.Session()
    try:
        r = models.Role(name="NoNcrView")
        r.permissions_rel = [_get_or_create_perm(db, perms.OBS_VIEW)]
        db.add(r)
        db.flush()
        db.add(models.User(username="dt_noview", email="dt_noview@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=r.id))
        db.commit()
    finally:
        db.close()


def test_the_list_still_needs_view_and_scope_and_hides_soft_deleted_files(denv):
    _user_without_ncr_view(denv)
    rid = _add_row(denv, "ncr", "NCR-L2", project_id="P-A")
    keep, _ = add_photo(denv, rid)
    gone, _ = add_photo(denv, rid, deleted=True)
    listed = denv.login("dt_a").get("/api/files/by-entity", params=PARAMS(rid), follow_redirects=False)
    assert listed.status_code == 200 and [x["id"] for x in listed.json()] == [keep]          # the soft-deleted photo is not listed
    other = denv.login("dt_scoped").get("/api/files/by-entity", params=PARAMS(rid), follow_redirects=False)      # another contractor's record: an empty list, as before
    assert other.status_code == 200 and other.json() == []
    same = denv.login("dt_v1").get("/api/files/by-entity", params=PARAMS(rid), follow_redirects=False)           # same contractor and project
    assert same.status_code == 200 and [x["id"] for x in same.json()] == [keep]
    assert denv.anonymous().get("/api/files/by-entity", params=PARAMS(rid), follow_redirects=False).status_code == 401
    assert denv.login("dt_noview").get("/api/files/by-entity", params=PARAMS(rid), follow_redirects=False).status_code == 403   # no ncr:view:all
