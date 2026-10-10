"""An NOI's contractor is fixed once documents are filed under it (business decision, 2026-10-10).

Changing an NOI's contractor regenerates its reference number, and ITR / NCR / OBS / Checklist cite the NOI by that
number with nothing to carry the change over: the ITR could no longer be saved (its noiNumber no longer resolved), the
NOI close check and Q-Workflow stopped seeing it. Now the change is refused while anything cites the NOI; an NOI with
nothing under it can still change contractor (and is renumbered, as before), and ordinary saves are unaffected.
Likewise, when the SAME contractor's abbreviation changed after the NOI was numbered, an NOI with documents under it
keeps its number on save (the UI resends the contractor every time); one with nothing under it is still renumbered.

In-memory DB, real routes and logins, nothing imports `main`.
"""
import uuid

import pytest

import models
from test_noi_create_atomic_http import noi_env, _create  # noqa: F401  (fixture re-export)


def _noi_row(env, noi_id):
    db = env.Session()
    try:
        n = db.get(models.NOI, noi_id)
        return {c.name: getattr(n, c.name) for c in n.__table__.columns}
    finally:
        db.close()


def _cite(env, kind, ref):
    db = env.Session()
    try:
        uid = uuid.uuid4().hex
        row = {
            "itr": lambda: models.ITR(id=uid, vendor_id="ACC-V1", documentNumber=f"ITR-{uid[:6]}", description="d",
                                      rev="Rev1.0", submit="s", status="In Progress", noiNumber=ref),
            "ncr": lambda: models.NCR(id=uid, vendor_id="ACC-V1", documentNumber=f"NCR-{uid[:6]}", description="d",
                                      status="Open", noiNumber=ref),
            "obs": lambda: models.OBS(id=uid, vendor_id="ACC-V1", documentNumber=f"OBS-{uid[:6]}", description="d",
                                      status="Open", noiNumber=ref),
            "checklist": lambda: models.Checklist(id=uid, recordsNo=f"CHK-{uid[:6]}", activity="a", date="2026-10-10",
                                                  status="Ongoing", noiNumber=ref),
        }[kind]()
        db.add(row)
        db.commit()
    finally:
        db.close()


def _new_noi(env):
    c = env.login("noi_a")
    r = _create(c)
    assert r.status_code == 200, r.text
    return c, r.json()


@pytest.mark.parametrize("kind", ["itr", "ncr", "obs", "checklist"])
def test_the_contractor_cannot_change_once_a_document_cites_the_noi(noi_env, kind):
    env, _ = noi_env
    c, noi = _new_noi(env)
    _cite(env, kind, noi["referenceNo"])
    before = _noi_row(env, noi["id"])
    r = c.put(f"/api/noi/{noi['id']}", json={"contractor": "Beta Co"})
    assert r.status_code == 400 and "contractor" in r.text and noi["referenceNo"] in r.text
    after = _noi_row(env, noi["id"])
    assert after["referenceNo"] == before["referenceNo"] and after["vendor_id"] == before["vendor_id"] == "ACC-V1"


def test_an_unknown_contractor_name_is_refused_too_instead_of_clearing_the_contractor(noi_env):
    env, _ = noi_env
    c, noi = _new_noi(env)
    _cite(env, "itr", noi["referenceNo"])
    r = c.put(f"/api/noi/{noi['id']}", json={"contractor": "No Such Co"})
    assert r.status_code == 400
    assert _noi_row(env, noi["id"])["vendor_id"] == "ACC-V1"


def test_ordinary_saves_that_resend_the_same_contractor_are_unaffected(noi_env):
    env, _ = noi_env
    c, noi = _new_noi(env)
    _cite(env, "itr", noi["referenceNo"])
    r = c.put(f"/api/noi/{noi['id']}", json={"contractor": "Accept Co", "package": "PKG-edited"})
    assert r.status_code == 200, r.text
    row = _noi_row(env, noi["id"])
    assert row["package"] == "PKG-edited" and row["referenceNo"] == noi["referenceNo"]


def test_an_noi_with_nothing_under_it_can_still_change_contractor(noi_env):
    env, _ = noi_env
    c, noi = _new_noi(env)
    r = c.put(f"/api/noi/{noi['id']}", json={"contractor": "Beta Co"})
    assert r.status_code == 200, r.text
    row = _noi_row(env, noi["id"])
    assert row["vendor_id"] == "ACC-V2" and row["referenceNo"] != noi["referenceNo"]       # renumbered, as before


# ── same contractor, abbreviation changed since the NOI was numbered (business decision, 2026-10-10) ──

def _rename_abbreviation(env, vendor_id, abbreviation):
    db = env.Session()
    try:
        db.get(models.Contractor, vendor_id).abbreviation = abbreviation
        db.commit()
    finally:
        db.close()


def test_an_noi_with_documents_keeps_its_number_when_its_contractor_abbreviation_changes(noi_env):
    env, _ = noi_env
    c, noi = _new_noi(env)
    _cite(env, "itr", noi["referenceNo"])
    _rename_abbreviation(env, "ACC-V1", "ACX")
    r = c.put(f"/api/noi/{noi['id']}", json={"contractor": "Accept Co", "package": "PKG-edited"})   # an ordinary save
    assert r.status_code == 200, r.text
    row = _noi_row(env, noi["id"])
    assert row["referenceNo"] == noi["referenceNo"] and row["package"] == "PKG-edited"


def test_an_noi_with_nothing_under_it_is_still_renumbered_to_the_new_abbreviation(noi_env):
    env, _ = noi_env
    c, noi = _new_noi(env)
    _rename_abbreviation(env, "ACC-V1", "ACX")
    r = c.put(f"/api/noi/{noi['id']}", json={"contractor": "Accept Co"})
    assert r.status_code == 200, r.text
    row = _noi_row(env, noi["id"])
    assert row["referenceNo"] != noi["referenceNo"] and "-ACX-" in row["referenceNo"]
