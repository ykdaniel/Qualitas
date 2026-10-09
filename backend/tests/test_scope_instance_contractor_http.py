"""Data-scope consistency for Checklist instances and ITR statistics (2026-09-20).

Two independently reproduced gaps (an ISOLATED full-flow browser/API acceptance, then read in code):

  1. link_checklist / create_reinspection built the instance with the parent's project but NO contractor.
     A contractor-scoped user got 200 from "link", then 404 on the instance they had just created
     (record_in_scope excludes a NULL contractor) — an empty checklist area in the ITR, nothing to fill in.
  2. GET /api/itr/stats ignored the caller's data scope: an account that sees NO ITRs still read the
     whole-system totals (total / per-status / overdue).

Real logins, real routes, brand-new Sessions for every database assertion. Accounts:
    scA  project P-A + contractor V1          scB  project P-A + contractor V2 (same project, other contractor)
    scC  project P-B + contractor V1          scP  project P-A only (no contractor)
    acc_editor  unscoped                      nobody  no ITR view permission
"""
import json
import uuid
from datetime import datetime, timedelta

import pytest

import models
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import env, PW, ITEM  # noqa: F401  (fixture reuse)

ITEM2 = {**ITEM, "item": "Cover", "criteria": ">=40mm"}
PAST = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
FUTURE = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")


# ── world builders ───────────────────────────────────────────────────────

def _add_world(env):
    db = env.Session()
    try:
        editor_role = db.query(models.Role).filter_by(name="AcceptEditor").one()
        for cid, name in (("ACC-V2", "Beta Co"),):
            if not db.query(models.Contractor).filter_by(id=cid).first():
                db.add(models.Contractor(id=cid, name=name, abbreviation="BET"))
        for pid in ("P-A", "P-B"):
            if not db.query(models.Project).filter_by(id=pid).first():
                db.add(models.Project(id=pid, name=f"Project {pid}"))
        db.flush()

        def user(username, vendor, projects, role=editor_role):
            u = models.User(username=username, email=f"{username}@example.com", is_active=True,
                            hashed_password=get_password_hash(PW), role_id=role.id, vendor_id=vendor)
            db.add(u)
            db.flush()
            for p in projects:
                db.add(models.UserProject(user_id=u.id, project_id=p))
        user("scA", "ACC-V1", ["P-A"])
        user("scB", "ACC-V2", ["P-A"])
        user("scC", "ACC-V1", ["P-B"])
        user("scP", None, ["P-A"])
        noview = models.Role(name="NoView")
        db.add(noview)
        db.flush()
        user("nobody", None, [], role=noview)
        db.commit()
    finally:
        db.close()


def _itr(env, project, vendor, status="In Progress", due=FUTURE, **cols):
    db = env.Session()
    try:
        itr = models.ITR(id=uuid.uuid4().hex, project_id=project, vendor_id=vendor,
                         documentNumber=f"ITR-{uuid.uuid4().hex[:6]}", description="scope", rev="Rev1.0",
                         submit="2026-09-20", status=status, raiseDate="2026-09-20", dueDate=due, **cols)
        db.add(itr)
        db.commit()
        return itr.id
    finally:
        db.close()


def _template(env, activity="Rebar"):
    """A blank template made by the unscoped editor (any account may reference a template by id)."""
    r = env.login("acc_editor").post("/api/checklist/", json={
        "activity": activity, "date": "2026-09-20", "status": "Ongoing",
        "detail_data": json.dumps({"items": [ITEM, ITEM2]})})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _scoped_template(env, activity="Rebar"):
    """A template made by contractor A in project P-A. Since 2026-09-20 the SOURCE template must be readable by the
    account that links it, so scoped accounts link templates of their own scope (the unscoped editor's NULL-owner
    template is deliberately NOT a public template — see section 5)."""
    return _own_template(env.login("scA"), "P-A", "Accept Co", activity=activity)


def _instances(env, itr_id):
    db = env.Session()
    try:
        rows = db.query(models.Checklist).filter(models.Checklist.itrId == itr_id).order_by(models.Checklist.recordsNo).all()
        return [{"id": c.id, "contractor_id": c.contractor_id, "project_id": c.project_id, "template_id": c.template_id,
                 "src": c.source_template_version, "status": c.status, "detail": c.detail_data,
                 "itrNumber": c.itrNumber, "passCount": c.passCount, "failCount": c.failCount} for c in rows]
    finally:
        db.close()


def _link(client, itr_id, tpl):
    return client.post(f"/api/itr/{itr_id}/link-checklist", params={"checklist_id": tpl})


def _pass_body():
    items = [{**ITEM, "result": "O", "situation": "150mm"}, {**ITEM2, "result": "O", "situation": "45mm"}]
    return {"status": "Pass", "passCount": 2, "failCount": 0, "detail_data": json.dumps({"items": items})}


@pytest.fixture
def world(env):
    _add_world(env)
    return env


# ══ 1. link_checklist ═══════════════════════════════════════════════════

def test_a_contractor_scoped_user_sees_and_can_fill_the_instance_they_just_linked(world):
    env = world
    itr = _itr(env, "P-A", "ACC-V1")
    tpl = _scoped_template(env)
    a = env.login("scA")
    assert _link(a, itr, tpl).status_code == 200
    (inst,) = _instances(env, itr)
    assert inst["contractor_id"] == "ACC-V1" and inst["project_id"] == "P-A"          # from the parent ITR (the real FK columns)
    assert inst["template_id"] == tpl and inst["src"] == 1 and inst["status"] == "Ongoing"
    # visible through the list (by itr) and the direct read ...
    assert [x["id"] for x in a.get("/api/checklist/", params={"itr_id": itr}).json()] == [inst["id"]]
    got = a.get(f"/api/checklist/{inst['id']}/")
    assert got.status_code == 200 and got.json()["contractor"] == "Accept Co"
    # ... and fillable under the ordinary rules
    r = a.put(f"/api/checklist/{inst['id']}/", json=_pass_body())
    assert r.status_code == 200, r.text
    assert _instances(env, itr)[0]["status"] == "Pass"


@pytest.mark.parametrize("who", ["scB", "scC"])
def test_other_contractor_or_other_project_cannot_read_or_touch_the_instance(world, who):
    env = world
    itr = _itr(env, "P-A", "ACC-V1")
    assert _link(env.login("scA"), itr, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr)
    other = env.login(who)
    assert other.get("/api/checklist/", params={"itr_id": itr}).json() == []
    assert other.get(f"/api/checklist/{inst['id']}/").status_code == 404
    assert other.put(f"/api/checklist/{inst['id']}/", json=_pass_body()).status_code == 404
    assert other.get(f"/api/itr/{itr}").status_code == 404
    assert _instances(env, itr)[0] == inst                                            # nothing was changed


def test_project_only_and_unscoped_accounts_are_unaffected(world):
    env = world
    itr = _itr(env, "P-A", "ACC-V1")
    assert _link(env.login("scA"), itr, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr)
    for who in ("scP", "acc_editor"):                                                 # project-only account, unscoped account
        c = env.login(who)
        assert [x["id"] for x in c.get("/api/checklist/", params={"itr_id": itr}).json()] == [inst["id"]]
        assert c.get(f"/api/checklist/{inst['id']}/").status_code == 200


def test_null_contractor_is_not_widened_into_visible_to_everyone(world):
    """An instance with no contractor (legacy) stays invisible to a contractor-scoped user — record_in_scope is unchanged."""
    env = world
    itr = _itr(env, "P-A", "ACC-V1")
    assert _link(env.login("scA"), itr, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr)
    db = env.Session()
    db.get(models.Checklist, inst["id"]).contractor_id = None                         # simulate a pre-fix row
    db.commit(); db.close()
    a = env.login("scA")
    assert a.get(f"/api/checklist/{inst['id']}/").status_code == 404
    assert a.get("/api/checklist/", params={"itr_id": itr}).json() == []
    assert env.login("scP").get(f"/api/checklist/{inst['id']}/").status_code == 200   # project-only scope still sees it


def test_an_itr_without_a_contractor_yields_an_instance_without_one_nothing_is_invented(world):
    env = world
    itr = _itr(env, "P-A", None)
    assert _link(env.login("scP"), itr, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr)
    assert inst["contractor_id"] is None and inst["project_id"] == "P-A"


def test_the_client_cannot_choose_or_move_the_instance_ownership(world):
    env = world
    itr = _itr(env, "P-A", "ACC-V1")
    a = env.login("scA")
    assert _link(a, itr, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr)
    # link has no ownership input at all; nor can a normal update move it to another contractor / ITR / template
    assert a.put(f"/api/checklist/{inst['id']}/", json={"contractor": "Beta Co"}).status_code in (400, 403, 404)
    assert a.put(f"/api/checklist/{inst['id']}/", json={"itrId": "someone-else"}).status_code == 400
    assert a.post("/api/checklist/", json={"activity": "x", "date": "2026-09-20", "status": "Ongoing", "itrId": itr}).status_code == 400
    assert _instances(env, itr)[0] == inst


def test_a_failed_link_creates_no_instance_and_leaves_no_half_state(world, monkeypatch):
    env = world
    itr = _itr(env, "P-A", "ACC-V1")
    tpl = _scoped_template(env)
    import services.itr_service as svc

    def boom(*a, **k):
        raise RuntimeError("audit down")
    monkeypatch.setattr(svc, "log_audit", boom)
    a = env.login("scA")
    with pytest.raises(RuntimeError):                                                 # the TestClient re-raises the unhandled server error
        _link(a, itr, tpl)
    assert _instances(env, itr) == []                                                 # rolled back; still atomic


def test_parent_itr_lock_still_applies(world):
    env = world
    itr = _itr(env, "P-A", "ACC-V1", status="Approved")
    r = _link(env.login("scA"), itr, _scoped_template(env))
    assert r.status_code == 400 and _instances(env, itr) == []


# ══ 2. create_reinspection ══════════════════════════════════════════════

def _failed_original(env):
    itr = _itr(env, "P-A", "ACC-V1")
    a = env.login("scA")
    assert _link(a, itr, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr)
    items = [{**ITEM, "result": "X", "situation": "230mm"}, {**ITEM2, "result": "O"}]
    assert a.put(f"/api/checklist/{inst['id']}/", json={"status": "Fail", "passCount": 1, "failCount": 1,
                                                        "detail_data": json.dumps({"items": items})}).status_code == 200
    db = env.Session()
    db.get(models.ITR, itr).inspectionResult = "Fail"
    db.commit(); db.close()
    return itr, _instances(env, itr)[0]


def test_reinspection_instance_has_the_new_itrs_ownership_and_the_original_is_untouched(world):
    env = world
    itr, original = _failed_original(env)
    a = env.login("scA")
    before_itr = a.get(f"/api/itr/{itr}").json()
    r = a.post(f"/api/itr/{itr}/re-inspect")
    assert r.status_code == 200, r.text
    child = r.json()["id"]
    (new_inst,) = _instances(env, child)
    assert new_inst["contractor_id"] == "ACC-V1" and new_inst["project_id"] == "P-A"
    assert new_inst["template_id"] == original["template_id"] and new_inst["src"] == original["src"]
    assert new_inst["status"] == "Ongoing" and new_inst["itrNumber"] != original["itrNumber"]
    # visible and fillable for the contractor account, invisible to the others
    assert [x["id"] for x in a.get("/api/checklist/", params={"itr_id": child}).json()] == [new_inst["id"]]
    assert a.put(f"/api/checklist/{new_inst['id']}/", json=_pass_body()).status_code == 200
    for who in ("scB", "scC"):
        o = env.login(who)
        assert o.get(f"/api/checklist/{new_inst['id']}/").status_code == 404 and o.get(f"/api/itr/{child}").status_code == 404
    # the first failure is exactly as it was
    assert _instances(env, itr)[0] == original
    assert a.get(f"/api/itr/{itr}").json() == before_itr


def test_a_failed_reinspection_rolls_back_every_new_row(world, monkeypatch):
    env = world
    itr, original = _failed_original(env)
    import services.itr_service as svc
    monkeypatch.setattr(svc, "log_audit", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("audit down")))
    a = env.login("scA")
    with pytest.raises(RuntimeError):
        a.post(f"/api/itr/{itr}/re-inspect")
    db = env.Session()
    try:
        assert db.query(models.ITR).filter(models.ITR.originalItrId == itr).count() == 0
        assert db.query(models.Checklist).filter(models.Checklist.itrId != itr, models.Checklist.itrId.isnot(None)).count() == 0
    finally:
        db.close()
    assert _instances(env, itr)[0] == original


# ══ 3. history is never rewritten; the inventory is read-only ═══════════

def test_legacy_instances_are_only_reported_never_backfilled_and_frozen_ones_are_marked(world):
    from scripts.verification.checklist_itr_inventory import find_instances_missing_contractor
    env = world
    open_itr = _itr(env, "P-A", "ACC-V1")
    frozen_itr = _itr(env, "P-A", "ACC-V1", status="Approved")
    no_vendor_itr = _itr(env, "P-A", None)
    db = env.Session()
    ids = {}
    for key, parent in (("open", open_itr), ("frozen", frozen_itr), ("novendor", no_vendor_itr)):
        c = models.Checklist(id=uuid.uuid4().hex, recordsNo=f"LEG-{key}", activity="legacy", date="2026-09-01", status="Pass" if key == "frozen" else "Ongoing",
                             detail_data=json.dumps({"items": [{**ITEM, "result": "O"}]}), passCount=1 if key == "frozen" else 0, failCount=0,
                             project_id="P-A", itrId=parent, contractor_id=None)
        db.add(c); ids[key] = c.id
    db.commit(); db.close()

    def snap():
        d = env.Session()
        try:
            return [(c.id, c.contractor_id, c.status, c.detail_data, c.passCount) for c in d.query(models.Checklist).order_by(models.Checklist.id).all()], \
                   [(i.id, i.status, i.approvedBy) for i in d.query(models.ITR).order_by(models.ITR.id).all()], d.query(models.ITRApprovalEvent).count()
        finally:
            d.close()
    before = snap()
    d = env.Session()
    try:
        n, hits = find_instances_missing_contractor(d)
    finally:
        d.close()
    assert n == 2                                                                     # 'novendor' has nothing to inherit -> not reported
    assert any("LEG-open" in h and "open parent" in h for h in hits) and any("LEG-frozen" in h and "FROZEN parent" in h for h in hits)
    assert not any("LEG-novendor" in h for h in hits)
    assert snap() == before                                                           # read-only: rows, approved parent, events all unchanged


# ══ 4. /api/itr/stats ═══════════════════════════════════════════════════

def _stats_world(env):
    """ITRs across projects / contractors / statuses, more than one page of them."""
    plan = [("P-A", "ACC-V1", "In Progress", FUTURE, 4), ("P-A", "ACC-V1", "In Progress", PAST, 2),      # 2 overdue
            ("P-A", "ACC-V1", "Approved", PAST, 3), ("P-A", "ACC-V1", "Void", PAST, 1),
            ("P-A", "ACC-V2", "Reject", PAST, 2), ("P-A", "ACC-V2", "In Progress", FUTURE, 3),
            ("P-B", "ACC-V1", "Approved", PAST, 3), ("P-B", "ACC-V1", "In Progress", PAST, 2)]
    for project, vendor, status, due, n in plan:
        for _ in range(n):
            _itr(env, project, vendor, status=status, due=due)


def _expected_from(rows):
    """Independent of the code under test: count the (already-fetched, full) visible set."""
    today = datetime.now().strftime("%Y-%m-%d")
    by = lambda s: sum(1 for r in rows if r["status"] == s)
    return {"total": len(rows), "in_progress": by("In Progress"), "approved": by("Approved"), "rejected": by("Reject"), "void": by("Void"),
            "overdue": sum(1 for r in rows if r["status"] not in ("Approved", "Void") and r.get("dueDate") and r["dueDate"] < today)}


def _all_visible(client):
    rows, skip = [], 0
    while True:
        page = client.get("/api/itr/", params={"skip": skip, "limit": 2}).json()          # deliberately tiny pages
        rows += page
        if len(page) < 2:
            return rows
        skip += 2


@pytest.mark.parametrize("who,total", [("scA", 10), ("scB", 5), ("scC", 5), ("scP", 15), ("acc_editor", 20)])
def test_stats_equal_the_whole_visible_set_not_the_first_page(world, who, total):
    env = world
    _stats_world(env)
    c = env.login(who)
    visible = _all_visible(c)
    assert len(visible) == total > 2                                                  # really spans several pages (page size 2)
    assert c.get("/api/itr/stats").json() == _expected_from(visible)


def test_an_account_with_no_visible_itr_gets_zeros_not_the_site_totals(world):
    env = world
    _stats_world(env)
    db = env.Session()
    u = models.User(username="scZ", email="scz@example.com", is_active=True, hashed_password=get_password_hash(PW),
                    role_id=db.query(models.Role).filter_by(name="AcceptEditor").one().id, vendor_id="ACC-V1")
    db.add(u); db.flush(); db.add(models.UserProject(user_id=u.id, project_id="P-EMPTY")); db.commit(); db.close()
    c = env.login("scZ")
    assert _all_visible(c) == []
    assert c.get("/api/itr/stats").json() == {"total": 0, "in_progress": 0, "approved": 0, "rejected": 0, "void": 0, "overdue": 0}


def test_query_parameters_only_narrow_never_widen(world):
    env = world
    _stats_world(env)
    a = env.login("scA")                                                              # sees 10 ITRs (P-A / V1)
    own = a.get("/api/itr/stats").json()
    assert own["total"] == 10
    zeros = {"total": 0, "in_progress": 0, "approved": 0, "rejected": 0, "void": 0, "overdue": 0}
    assert a.get("/api/itr/stats", params={"project_id": "P-B"}).json() == zeros       # another project's id gives nothing
    assert a.get("/api/itr/stats", params={"vendor_id": "ACC-V2"}).json() == zeros     # another contractor's id gives nothing
    assert a.get("/api/itr/stats", params={"project_id": "P-A", "vendor_id": "ACC-V1"}).json() == own   # its own = same
    assert a.get("/api/itr/stats", params={"project_id": "P-A"}).json() == own
    u = env.login("acc_editor")                                                       # unscoped: params narrow within everything
    assert u.get("/api/itr/stats").json()["total"] == 20
    assert u.get("/api/itr/stats", params={"project_id": "P-B"}).json()["total"] == 5
    assert u.get("/api/itr/stats", params={"vendor_id": "ACC-V2"}).json()["total"] == 5


def test_stats_still_needs_view_permission_and_login(world):
    env = world
    assert env.login("nobody").get("/api/itr/stats").status_code == 403
    assert env.anonymous().get("/api/itr/stats").status_code in (401, 403)


def test_stats_scope_is_what_makes_the_difference(world, monkeypatch):
    """Mutation check: neutralise apply_scope in the repository and a scoped account reads site totals again."""
    env = world
    _stats_world(env)
    a = env.login("scA")
    assert a.get("/api/itr/stats").json()["total"] == 10
    import repositories.itr_repository as repo
    monkeypatch.setattr(repo, "apply_scope", lambda q, m, s: q)
    assert a.get("/api/itr/stats").json()["total"] == 20                              # the old, leaking behaviour


# ══ 5. the SOURCE template must be readable by the caller (2026-09-20) ══════════════════════════
# Reproduced gap (measured, not only read): contractor B got 404 reading contractor A's template, yet
# POST /itr/{B's itr}/link-checklist?checklist_id=<A's template> returned 200 and B then read the copied
# content. link_checklist checked the TARGET ITR's scope but never the SOURCE template's. Three separate
# checks now: target ITR scope (unchanged), source template readable (new, same rule as GET), and the new
# instance's ownership from the target ITR (previous fix) — none stands in for another.

def _own_template(client, project=None, contractor=None, activity="Scoped template"):
    body = {"activity": activity, "date": "2026-09-20", "status": "Ongoing", "detail_data": json.dumps({"items": [ITEM, ITEM2]})}
    if project:
        body["project_id"] = project
    if contractor:
        body["contractor"] = contractor
    r = client.post("/api/checklist/", json=body)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _everything(env):
    """Every table a refused link must not touch, read through a brand-new Session."""
    db = env.Session()
    try:
        cols = lambda o: {c.name: getattr(o, c.name) for c in o.__table__.columns}
        return {
            "itr": sorted((json.dumps(cols(i), default=str) for i in db.query(models.ITR).all())),
            "checklist": sorted((json.dumps(cols(c), default=str) for c in db.query(models.Checklist).all())),
            "sequences": sorted((json.dumps(cols(s), default=str) for s in db.query(models.ReferenceSequence).all())),
            "audits": db.query(models.AuditLog).count(),
            "events": db.query(models.ITRApprovalEvent).count(),
        }
    finally:
        db.close()


def test_the_reproduced_gap_direct_read_404_means_link_404_and_nothing_is_written(world):
    env = world
    tpl = _own_template(env.login("scA"), "P-A", "Accept Co")                          # A's own template
    b = env.login("scB")
    itr_b = _itr(env, "P-A", "ACC-V2")                                                # B's own, in-scope ITR
    assert b.get(f"/api/checklist/{tpl}/").status_code == 404                          # direct read: refused
    before = _everything(env)
    r = _link(b, itr_b, tpl)                                                          # ... and so must the copy be
    assert r.status_code == 404, r.text
    assert _everything(env) == before                                                 # ITR, checklists, sequences, audits, events untouched
    assert _instances(env, itr_b) == []


def test_missing_and_out_of_scope_templates_answer_identically_and_leak_nothing(world):
    env = world
    tpl = _own_template(env.login("scA"), "P-A", "Accept Co", activity="Secret activity name")
    b = env.login("scB")
    itr_b = _itr(env, "P-A", "ACC-V2")
    out_of_scope = _link(b, itr_b, tpl)
    missing = _link(b, itr_b, uuid.uuid4().hex)
    assert (out_of_scope.status_code, out_of_scope.json()) == (missing.status_code, missing.json())
    assert out_of_scope.status_code == 404
    text = out_of_scope.text
    assert tpl not in text and "Secret" not in text and "Accept" not in text and "Rev" not in text    # no name / id / version / owner


def test_a_template_from_another_project_is_refused_even_when_the_contractor_matches(world):
    env = world
    tpl_c = _own_template(env.login("scC"), "P-B", "Accept Co")                       # project P-B, contractor V1
    a = env.login("scA")                                                              # project P-A, contractor V1
    itr_a = _itr(env, "P-A", "ACC-V1")
    assert a.get(f"/api/checklist/{tpl_c}/").status_code == 404
    before = _everything(env)
    assert _link(a, itr_a, tpl_c).status_code == 404
    assert _everything(env) == before


def test_a_readable_template_does_not_open_an_itr_outside_the_scope(world):
    env = world
    a = env.login("scA")
    tpl = _own_template(a, "P-A", "Accept Co")
    assert a.get(f"/api/checklist/{tpl}/").status_code == 200                          # source is fine ...
    for other_itr in (_itr(env, "P-A", "ACC-V2"), _itr(env, "P-B", "ACC-V1")):         # ... the TARGET is not A's to write to
        before = _everything(env)
        r = _link(a, other_itr, tpl)
        assert r.status_code == 404 and _everything(env) == before


def test_a_legitimate_link_still_works_and_the_instance_takes_the_target_itrs_ownership(world):
    env = world
    a = env.login("scA")
    tpl = _own_template(a, "P-A", "Accept Co")
    itr = _itr(env, "P-A", "ACC-V1")
    assert _link(a, itr, tpl).status_code == 200
    (inst,) = _instances(env, itr)
    assert (inst["contractor_id"], inst["project_id"], inst["template_id"], inst["src"]) == ("ACC-V1", "P-A", tpl, 1)
    assert [x["id"] for x in a.get("/api/checklist/", params={"itr_id": itr}).json()] == [inst["id"]]
    assert env.login("scB").get(f"/api/checklist/{inst['id']}/").status_code == 404


def test_source_readable_and_target_ownership_are_different_checks(world):
    """A project-only account can read a template of its project made by contractor V1 and link it into a V2 ITR of the
    same project: the instance gets the ITR's contractor (V2), NOT the template's."""
    env = world
    tpl = _own_template(env.login("scA"), "P-A", "Accept Co")
    p = env.login("scP")
    assert p.get(f"/api/checklist/{tpl}/").status_code == 200
    itr_v2 = _itr(env, "P-A", "ACC-V2")
    assert _link(p, itr_v2, tpl).status_code == 200
    (inst,) = _instances(env, itr_v2)
    assert inst["contractor_id"] == "ACC-V2"
    assert env.login("scB").get(f"/api/checklist/{inst['id']}/").status_code == 200    # the V2 account sees it, V1 does not
    assert env.login("scA").get(f"/api/checklist/{inst['id']}/").status_code == 404


@pytest.mark.parametrize("who,project,vendor,expect", [
    ("scA", None, None, 404),              # no project, no contractor: NOT a public template for a scoped account
    ("scA", "P-A", None, 404),             # project matches but contractor NULL: contractor-scoped account still refused
    ("scP", "P-A", None, 200),             # project-only account: matches by project (existing record_in_scope rule)
    ("scP", None, None, 404),              # project-scoped account, template without project
    ("acc_editor", None, None, 200),       # unscoped account: everything
])
def test_null_ownership_follows_the_existing_rule_for_the_read_and_for_the_link(world, who, project, vendor, expect):
    env = world
    db = env.Session()
    tpl_id = _template(env)                                                           # made by the unscoped editor: NULL project / contractor
    t = db.get(models.Checklist, tpl_id)
    t.project_id, t.contractor_id = project, vendor
    db.commit(); db.close()
    c = env.login(who)
    assert c.get(f"/api/checklist/{tpl_id}/").status_code == expect                    # what a direct read says ...
    itr = _itr(env, "P-A", "ACC-V1")
    r = _link(c, itr, tpl_id)
    assert (200 if r.status_code == 200 else r.status_code) == expect                  # ... is exactly what the link says


def test_an_out_of_scope_instance_id_is_not_confirmed_as_an_instance(world):
    env = world
    itr_a = _itr(env, "P-A", "ACC-V1")
    assert _link(env.login("scA"), itr_a, _scoped_template(env)).status_code == 200
    (inst,) = _instances(env, itr_a)
    b = env.login("scB")
    itr_b = _itr(env, "P-A", "ACC-V2")
    r = _link(b, itr_b, inst["id"])                                                   # B passes A's INSTANCE id as the "template"
    assert r.status_code == 404 and "instance" not in r.text.lower()                   # not the 400 "ITR-bound instance" message
    a = env.login("scA")
    r2 = _link(a, _itr(env, "P-A", "ACC-V1"), inst["id"])                             # in-scope instance: the old refusal is unchanged
    assert r2.status_code == 400 and "instance" in r2.text.lower()


def test_the_target_itr_checks_still_apply_before_anything_else(world):
    env = world
    a = env.login("scA")
    tpl = _own_template(a, "P-A", "Accept Co")
    approved = _itr(env, "P-A", "ACC-V1", status="Approved")
    nobody = env.login("nobody")                                                      # (a login itself writes an audit row: log in first)
    before = _everything(env)
    assert _link(a, approved, tpl).status_code == 400                                 # parent ITR lock unchanged
    assert nobody.post(f"/api/itr/{approved}/link-checklist", params={"checklist_id": tpl}).status_code == 403   # permission unchanged
    assert _everything(env) == before


def test_an_approved_itrs_history_is_untouched_by_a_refused_link(world):
    """Approved ITR with an approval event: a refused cross-scope link changes neither the ITR, its instances nor its events."""
    env = world
    a = env.login("scA")
    itr = _itr(env, "P-A", "ACC-V1")
    assert _link(a, itr, _own_template(a, "P-A", "Accept Co")).status_code == 200
    (inst,) = _instances(env, itr)
    assert a.put(f"/api/checklist/{inst['id']}/", json=_pass_body()).status_code == 200
    db = env.Session()
    approver = models.User(username="scAppr", email="scappr@example.com", is_active=True, hashed_password=get_password_hash(PW),
                           role_id=db.query(models.Role).filter_by(name="AcceptApprover").one().id, vendor_id="ACC-V1")
    db.add(approver); db.flush(); db.add(models.UserProject(user_id=approver.id, project_id="P-A")); db.commit(); db.close()
    appr = env.login("scAppr")
    assert appr.put(f"/api/itr/{itr}", json={"status": "Approved"}).status_code == 200
    foreign = _own_template(env.login("scC"), "P-B", "Accept Co")
    before = _everything(env)
    assert _link(appr, itr, foreign).status_code in (400, 404)                        # Approved parent or foreign source — refused either way
    assert _everything(env) == before
    assert _everything(env)["events"] == 1                                            # the approval event is still exactly the one


def test_removing_the_source_check_reopens_the_hole(world, monkeypatch):
    """Mutation check: make the service treat every Checklist as in scope and the reproduced 'read 404, link 200' returns."""
    env = world
    tpl = _own_template(env.login("scA"), "P-A", "Accept Co")
    b = env.login("scB")
    itr_b = _itr(env, "P-A", "ACC-V2")
    assert _link(b, itr_b, tpl).status_code == 404
    import services.itr_service as svc
    real = svc.record_in_scope
    monkeypatch.setattr(svc, "record_in_scope", lambda rec, sc: True if isinstance(rec, models.Checklist) else real(rec, sc))
    assert b.get(f"/api/checklist/{tpl}/").status_code == 404                          # the direct read is a different code path: still 404
    assert _link(b, itr_b, tpl).status_code == 200                                    # ... while the link copies it: the defect
