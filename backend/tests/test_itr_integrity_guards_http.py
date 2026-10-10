"""ITR integrity guards (2026-10-10, ITR module review items #3–#8).

Each gap was confirmed by reading the code path end to end. Run against the pre-fix code, 21 of these tests failed;
the 4 that passed are controls (an ordinary create, an unchanged lineage echo, deleting an uncited ITR, and
Void -> In Progress, which the workflow already refused).

  #3  PUT {"status": ""} (or null) skipped the transition check and was stored, so a record could leave the
      workflow for good — a Void ITR could leave Void that way. Create accepted any status string.
  #4  A Void ITR's own fields (result, numbers, photos, text) were still writable through PUT, although Void is
      treated as locked everywhere else.
  #5  isReInspection / originalItrId / reInspectionCount were accepted from the client on create and update, so a
      hand-made "re-inspection" skipped create_reinspection's Approved/Void guards, and the delete chain
      protection could be added or removed at will.
  #6  noiNumber / ncrNumber were only checked for existence: a scoped account could link another tenant's NOI or
      NCR (and probe which numbers exist), or file a new ITR under a Closed/Void NOI; the related-documents graph
      for ITR / NOI / ITP was not filtered by the caller's scope.
  #7  Raise NCR could be repeated: each click raised another NCR and overwrote ITR.ncrNumber.
  #8  Deleting an ITR ignored NCRs raised from it (NCR.itrNumber) and Observations citing it (OBS.itrNumber).

In-memory DB, real routes and logins, nothing imports `main`.
"""
import uuid

import pytest

import models
from test_itr_revoke_approval_acceptance import env, _mk_itr  # noqa: F401  (fixture reuse)
from test_itr_state_protection_http import full, _set  # noqa: F401  (fixture reuse)
from test_scope_instance_contractor_http import _add_world, _itr as _scoped_itr


@pytest.fixture
def editor(env):
    return env.login("acc_editor")


@pytest.fixture
def world(env):
    _add_world(env)
    return env


def _row(env, model, row_id):
    db = env.Session()
    try:
        obj = db.get(model, row_id)
        return None if obj is None else {c.name: getattr(obj, c.name) for c in obj.__table__.columns}
    finally:
        db.close()


def _add(env, obj):
    db = env.Session()
    try:
        db.add(obj)
        db.commit()
        return obj.id
    finally:
        db.close()


def _noi(env, status="Open", project=None, vendor="ACC-V1"):
    ref = f"NOI-{uuid.uuid4().hex[:6]}"
    _add(env, models.NOI(id=uuid.uuid4().hex, referenceNo=ref, status=status, project_id=project, vendor_id=vendor,
                         package="guard test", issueDate="2026-10-01", inspectionDate="2026-10-02"))
    return ref


def _ncr(env, status="Open", project=None, vendor="ACC-V1", **cols):
    doc = f"NCR-{uuid.uuid4().hex[:6]}"
    _add(env, models.NCR(id=uuid.uuid4().hex, documentNumber=doc, status=status, project_id=project, vendor_id=vendor,
                         description="guard test", **cols))
    return doc


def _create_payload(**extra):
    return {"description": "guard", "rev": "Rev1.0", "submit": "2026-10-10", "status": "In Progress",
            "raiseDate": "2026-10-10", "vendor": "Accept Co", **extra}


# ── #3 status outside the workflow ───────────────────────────────────────

@pytest.mark.parametrize("value", ["", None])
def test_an_empty_status_is_refused_and_the_record_stays_in_the_workflow(env, editor, value):
    itr_id = _mk_itr(env)
    before = _row(env, models.ITR, itr_id)
    r = editor.put(f"/api/itr/{itr_id}", json={"status": value})
    assert r.status_code == 400 and "status" in r.text
    assert _row(env, models.ITR, itr_id) == before


@pytest.mark.parametrize("status", ["", "Done"])
def test_an_itr_cannot_be_created_outside_the_workflow(env, editor, status):
    r = editor.post("/api/itr/", json=_create_payload(status=status))
    assert r.status_code == 400
    db = env.Session()
    try:
        assert db.query(models.ITR).count() == 0
    finally:
        db.close()


def test_an_ordinary_create_still_works(env, editor):
    r = editor.post("/api/itr/", json=_create_payload())
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "In Progress" and r.json()["isReInspection"] is False


# ── #4 Void is locked ─────────────────────────────────────────────────────

@pytest.mark.parametrize("payload", [
    {"inspectionResult": "Pass"},
    {"description": "rewritten"},
    {"status": "In Progress"},
    {"status": ""},
])
def test_a_void_itr_cannot_be_modified(env, editor, payload):
    itr_id = _mk_itr(env, status="Void")
    before = _row(env, models.ITR, itr_id)
    r = editor.put(f"/api/itr/{itr_id}", json=payload)
    assert r.status_code == 400
    assert ("status cannot be empty" if payload.get("status") == "" else "Void") in r.text
    assert _row(env, models.ITR, itr_id) == before


# ── #5 re-inspection lineage is the system's ─────────────────────────────

@pytest.mark.parametrize("field,value", [("isReInspection", True), ("reInspectionCount", 1), ("originalItrId", "x")])
def test_lineage_cannot_be_supplied_on_create(env, editor, field, value):
    if field == "originalItrId":
        value = _mk_itr(env, status="Void")                                     # the bypass: "re-inspect" a Void ITR
    r = editor.post("/api/itr/", json=_create_payload(**{field: value}))
    assert r.status_code == 400 and field in r.text


@pytest.mark.parametrize("field,value", [("isReInspection", True), ("reInspectionCount", 3), ("originalItrId", None)])
def test_lineage_cannot_be_changed_on_update(env, editor, field, value):
    original = _mk_itr(env, status="Reject")
    child = _mk_itr(env)
    _set(env, child, isReInspection=True, originalItrId=original, reInspectionCount=1)
    if field == "isReInspection":
        child, value = _mk_itr(env), True                                       # an ordinary ITR claiming to be one
    before = _row(env, models.ITR, child)
    r = editor.put(f"/api/itr/{child}", json={field: value})
    assert r.status_code == 400 and field in r.text
    assert _row(env, models.ITR, child) == before


def test_an_unchanged_lineage_echo_is_accepted(env, editor):
    original = _mk_itr(env, status="Reject")
    child = _mk_itr(env)
    _set(env, child, isReInspection=True, originalItrId=original, reInspectionCount=1)
    r = editor.put(f"/api/itr/{child}", json={"isReInspection": True, "originalItrId": original,
                                              "reInspectionCount": 1, "description": "edited"})
    assert r.status_code == 200, r.text
    row = _row(env, models.ITR, child)
    assert row["description"] == "edited" and row["originalItrId"] == original and row["reInspectionCount"] == 1


# ── #6 references respect scope and NOI state; related graph is scoped ──

def test_a_scoped_account_cannot_link_another_tenants_noi_or_ncr_and_cannot_tell_it_exists(world):
    sc = world.login("scA")                                                     # ACC-V1, project P-A
    itr_id = _scoped_itr(world, "P-A", "ACC-V1")
    foreign_noi = _noi(world, project="P-B")
    foreign_ncr = _ncr(world, project="P-A", vendor="ACC-V2")
    missing = sc.put(f"/api/itr/{itr_id}", json={"noiNumber": "NOI-does-not-exist"})
    out_of_scope = sc.put(f"/api/itr/{itr_id}", json={"noiNumber": foreign_noi})
    assert missing.status_code == out_of_scope.status_code == 400
    assert out_of_scope.json()["detail"] == missing.json()["detail"].replace("NOI-does-not-exist", foreign_noi)
    r = sc.put(f"/api/itr/{itr_id}", json={"ncrNumber": foreign_ncr})
    assert r.status_code == 400 and "not found" in r.text
    row = _row(world, models.ITR, itr_id)
    assert row["noiNumber"] is None and row["ncrNumber"] is None

    own_noi = _noi(world, project="P-A")
    assert sc.put(f"/api/itr/{itr_id}", json={"noiNumber": own_noi}).status_code == 200


@pytest.mark.parametrize("status", ["Closed", "Void"])
def test_no_new_itr_under_a_closed_or_void_noi_but_existing_ones_stay_saveable(env, editor, status):
    noi = _noi(env, status=status)
    r = editor.post("/api/itr/", json=_create_payload(noiNumber=noi))
    assert r.status_code == 400 and status in r.text

    itr_id = _mk_itr(env)
    _set(env, itr_id, noiNumber=noi)                                            # filed before the NOI was closed
    r = editor.put(f"/api/itr/{itr_id}", json={"noiNumber": noi, "description": "still editable"})
    assert r.status_code == 200, r.text


def test_an_itr_whose_noi_number_no_longer_exists_stays_saveable_when_unchanged(env, editor):
    itr_id = _mk_itr(env)
    _set(env, itr_id, noiNumber="NOI-renumbered-away")
    r = editor.put(f"/api/itr/{itr_id}", json={"noiNumber": "NOI-renumbered-away", "description": "saved"})
    assert r.status_code == 200, r.text


def test_the_related_graph_hides_records_outside_the_callers_scope(world):
    foreign_noi = _noi(world, project="P-B")
    own_noi = _noi(world, project="P-A")
    leaky = _scoped_itr(world, "P-A", "ACC-V1", noiNumber=foreign_noi)          # e.g. linked before this fix
    fine = _scoped_itr(world, "P-A", "ACC-V1", noiNumber=own_noi)
    sc = world.login("scA")
    r = sc.get(f"/api/itr/{leaky}/related")
    assert r.status_code == 200 and foreign_noi not in r.text
    r = sc.get(f"/api/itr/{fine}/related")
    assert r.status_code == 200 and own_noi in r.text
    r = world.login("acc_editor").get(f"/api/itr/{leaky}/related")              # unscoped: unchanged
    assert foreign_noi in r.text


# ── #7 Raise NCR once ─────────────────────────────────────────────────────

def test_raise_ncr_cannot_be_repeated_while_the_first_ncr_is_live(env, full):
    itr_id = _mk_itr(env)
    _set(env, itr_id, inspectionResult="Fail")
    first = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert first.status_code == 200, first.text
    ncr_no = first.json()["documentNumber"]

    again = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert again.status_code == 400 and ncr_no in again.text
    assert _row(env, models.ITR, itr_id)["ncrNumber"] == ncr_no
    db = env.Session()
    try:
        assert db.query(models.NCR).filter(models.NCR.itrNumber == _row(env, models.ITR, itr_id)["documentNumber"]).count() == 1
        db.query(models.NCR).filter(models.NCR.documentNumber == ncr_no).update({"status": "Void"})
        db.commit()
    finally:
        db.close()

    after_void = full.post(f"/api/itr/{itr_id}/create-ncr")                     # the first NCR was voided
    assert after_void.status_code == 200, after_void.text
    assert _row(env, models.ITR, itr_id)["ncrNumber"] == after_void.json()["documentNumber"] != ncr_no


# ── #8 delete keeps the source of NCRs / Observations ────────────────────

@pytest.mark.parametrize("citing", ["ncr", "obs"])
def test_an_itr_cited_as_source_cannot_be_deleted(env, full, citing):
    itr_id = _mk_itr(env, status="Reject")
    doc = _row(env, models.ITR, itr_id)["documentNumber"]
    if citing == "ncr":
        ref = _ncr(env, itrNumber=doc)
    else:
        ref = f"OBS-{uuid.uuid4().hex[:6]}"
        _add(env, models.OBS(id=uuid.uuid4().hex, documentNumber=ref, vendor_id="ACC-V1", itrNumber=doc,
                             description="guard test", status="Open"))
    r = full.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 400 and ref in r.text
    assert _row(env, models.ITR, itr_id) is not None


def test_an_uncited_itr_can_still_be_deleted(env, full):
    itr_id = _mk_itr(env, status="Reject")
    assert full.delete(f"/api/itr/{itr_id}").status_code == 200
    assert _row(env, models.ITR, itr_id) is None


# ── independent review follow-ups (2026-10-10) ───────────────────────────

def test_clearing_the_itr_ncr_link_does_not_reopen_raise_ncr(env, full):
    """B-1: the one-live-NCR rule is decided on the NCRs themselves, not on ITR.ncrNumber — an ordinary save that
    clears that field (e.g. a stale form) must not let a second live NCR be raised."""
    itr_id = _mk_itr(env)
    _set(env, itr_id, inspectionResult="Fail")
    first = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert first.status_code == 200, first.text
    assert full.put(f"/api/itr/{itr_id}", json={"ncrNumber": ""}).status_code == 200
    again = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert again.status_code == 400 and first.json()["documentNumber"] in again.text
    doc = _row(env, models.ITR, itr_id)["documentNumber"]
    db = env.Session()
    try:
        assert db.query(models.NCR).filter(models.NCR.itrNumber == doc).count() == 1
    finally:
        db.close()


def test_an_ncr_citing_the_itr_from_the_ncr_module_also_counts_as_live(env, full):
    itr_id = _mk_itr(env)
    _set(env, itr_id, inspectionResult="Fail")
    ncr_doc = _ncr(env, itrNumber=_row(env, models.ITR, itr_id)["documentNumber"])
    r = full.post(f"/api/itr/{itr_id}/create-ncr")
    assert r.status_code == 400 and ncr_doc in r.text


def _scoped_deleter(env):
    from core import perms
    from test_itr_revoke_approval_acceptance import _get_or_create_perm, PW
    from core.security import get_password_hash
    db = env.Session()
    try:
        role = models.Role(name="ScopedDeleter")
        role.permissions_rel = [_get_or_create_perm(db, c) for c in (perms.ITR_VIEW, perms.ITR_DELETE)]
        db.add(role)
        db.flush()
        u = models.User(username="scDel", email="scDel@example.com", is_active=True, vendor_id="ACC-V1",
                        hashed_password=get_password_hash(PW), role_id=role.id)
        db.add(u)
        db.flush()
        db.add(models.UserProject(user_id=u.id, project_id="P-A"))
        db.commit()
    finally:
        db.close()
    return env.login("scDel")


def test_a_delete_blocked_by_another_tenants_record_names_nothing_of_theirs(world):
    """B-2: NCR/OBS itrNumber is free text, so a citer may be outside the caller's scope — counted, never named."""
    sc = _scoped_deleter(world)
    itr_id = _scoped_itr(world, "P-A", "ACC-V1", status="Reject")
    doc = _row(world, models.ITR, itr_id)["documentNumber"]
    foreign = _ncr(world, project="P-B", vendor="ACC-V2", itrNumber=doc)
    own = _ncr(world, project="P-A", vendor="ACC-V1", itrNumber=doc)
    r = sc.delete(f"/api/itr/{itr_id}")
    assert r.status_code == 400
    assert own in r.text and foreign not in r.text and "1 record(s) outside your access" in r.text
    assert _row(world, models.ITR, itr_id) is not None


@pytest.mark.parametrize("noi_status,expected", [("Void", 400), ("Closed", 400), ("Open", 200)])
def test_no_reinspection_is_filed_under_a_closed_or_void_noi(env, full, noi_status, expected):
    """B-3: a re-inspection is a new ITR under the same NOI, so the #6 rule applies to it too."""
    noi = _noi(env, status=noi_status)
    itr_id = _mk_itr(env, status="Reject")
    _set(env, itr_id, inspectionResult="Fail", noiNumber=noi)
    r = full.post(f"/api/itr/{itr_id}/re-inspect")
    assert r.status_code == expected, r.text
    if expected == 400:
        assert noi_status in r.text


def test_a_scoped_account_cannot_create_an_itr_under_another_tenants_noi(world):
    sc = world.login("scA")
    foreign_noi = _noi(world, project="P-B")
    own_noi = _noi(world, project="P-A")
    r = sc.post("/api/itr/", json=_create_payload(noiNumber=foreign_noi, project_id="P-A"))
    assert r.status_code == 400 and "not found" in r.text
    r = sc.post("/api/itr/", json=_create_payload(noiNumber=own_noi, project_id="P-A"))
    assert r.status_code == 200, r.text
