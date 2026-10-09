"""Entering Closed needs improvement photos the SERVER can confirm (2026-09-21).

Measured before this change (isolated stack, real uvicorn): an NCR closed (HTTP 200, status Closed) with `improvementPhotos` = an arbitrary string,
a path to a file that does not exist, another NCR's real photo path, its own soft-deleted photo, and its own photo filed under the wrong category.
The condition was "the NCR's own improvementPhotos column is a non-empty list" — text the client sent.

Now the condition reads the ATTACHMENTS table and the disk: at least one row of THIS NCR, category improvementPhoto, not deleted, whose file is
present under the upload root and starts with image bytes. Real logins and routes, real image files in the run's temporary upload root, brand-new
Sessions for every database assertion. The legacy `improvementPhotos` column is never evidence and never rewritten.
"""
import os
import threading
import time
import uuid

import pytest

import models
from core.uploads import upload_root
from ncr_photos import NOT_AN_IMAGE, PNG, add_photo
from test_date_write_guard_http import _add_row, _put, _raw, _snapshot, denv  # noqa: F401  (denv is a fixture)

RAISE, DUE = "2025-01-02", "2025-01-16"                      # long past: closing now is a LATE closure
READY = dict(raiseDate=RAISE, dueDate=DUE, severity="Minor", productDisposition="Rework", reInspectionNumber="ITR-1", drawingNo="D1", specNo="S1",
             qtyAffected="1", extent="Isolated", effectivenessVerified="Yes")
CLOSE = {"status": "Closed", "raiseDate": RAISE, "dueDate": DUE, "closeoutDate": "2025-03-01"}
HINT = "add at least one improvement photo"


def ncr(env, ref="NCR-P", **cols):
    """An open NCR with every closure requirement EXCEPT a photo."""
    return _add_row(env, "ncr", ref, **{**READY, **cols})


def upload(client, rid, category="improvementPhoto", name="after.png", content=PNG, mime="image/png"):
    return client.post("/api/files/upload", data={"entity_type": "ncr", "entity_id": rid, "category": category}, files=[("files", (name, content, mime))])


def attachments(env):
    db = env.Session()
    try:
        return sorted((a.id, a.entity_type, a.entity_id, a.file_path, a.category, bool(a.is_deleted)) for a in db.query(models.Attachment).all())
    finally:
        db.close()


def files_on_disk():
    root = upload_root()
    return sorted(os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs)


def state(env):
    return _snapshot(env), attachments(env), files_on_disk()


def audit_actions(env, rid):
    db = env.Session()
    try:
        return [a.action for a in db.query(models.AuditLog).filter(models.AuditLog.entity_id == rid).order_by(models.AuditLog.id).all()]
    finally:
        db.close()


def refused(env, c, rid, body=CLOSE, contains=HINT):
    before = state(env)
    r = _put(c, "ncr", rid, body)
    assert r.status_code == 400 and "Cannot close NCR" in r.json()["detail"] and "improvementPhotos" in r.json()["detail"], r.text[:400]
    if contains:
        assert contains in r.json()["detail"], r.text[:400]
    assert state(env) == before                                              # NCR row, audit, sequences, attachment rows AND files: exactly as they were
    assert _raw(env, "ncr", rid, "status", "closedBy", "closeoutDate") == ("Open", None, None)
    return r


# ══ 1. a real upload supports the closure ═════════════════════════════════════════════════════════════════════════════════════════════

def test_a_photo_uploaded_through_the_api_supports_a_late_closure_and_the_closure_is_audited(denv):
    rid = ncr(denv)
    c = denv.login("dt_a")
    up = upload(c, rid)
    assert up.status_code == 200, up.text[:300]
    row = up.json()[0]
    assert _raw(denv, "ncr", rid, "improvementPhotos") == (None,)              # the upload does NOT touch the NCR's own photo column: the row IS the evidence
    r = _put(c, "ncr", rid, CLOSE)                                            # RAISE/DUE are in 2025: this closure is late
    assert r.status_code == 200, r.text[:300]
    assert _raw(denv, "ncr", rid, "status", "dueDate", "closeoutDate") == ("Closed", DUE, "2025-03-01")
    assert audit_actions(denv, rid) == ["UPDATE", "STATUS_CHANGE"]
    path = row["file_url"].split("/api/files/download/", 1)[1]
    assert c.get(f"/api/files/download/{path}").status_code == 200            # the evidence stays downloadable after the closure


def test_the_download_url_of_the_uploaded_photo_and_the_attachment_row_correspond(denv):
    rid = ncr(denv)
    c = denv.login("dt_a")
    j = upload(c, rid).json()[0]
    (aid, etype, eid, fpath, cat, deleted), = attachments(denv)
    assert (aid, etype, eid, cat, deleted) == (j["id"], "ncr", rid, "improvementPhoto", False)
    assert j["file_url"].endswith(fpath) and fpath.startswith("ncr/")


def test_closing_in_the_same_request_that_lists_photo_paths_uses_the_stored_attachment_not_the_list(denv):
    """A photo uploaded earlier supports the closure even when the closing request says nothing (or something else) about improvementPhotos."""
    rid = ncr(denv)
    c = denv.login("dt_a")
    assert upload(c, rid).status_code == 200
    assert _put(c, "ncr", rid, {**CLOSE, "improvementPhotos": ["whatever"]}).status_code == 200


# ══ 2. what cannot support it — refused, and nothing changes ═══════════════════════════════════════════════════════════════════════

def test_no_photo_at_all_is_refused_with_an_actionable_hint(denv):
    rid = ncr(denv)
    r = refused(denv, denv.login("dt_a"), rid)
    assert "upload the photo" in r.json()["detail"] and "save the NCR" in r.json()["detail"]


@pytest.mark.parametrize("claim", ["totally-made-up", "/uploads/a.jpg", "data:image/png;base64,AAAA", "ncr/0123456789abcdef0123456789abcdef.png"])
def test_a_photo_path_or_string_in_the_NCR_columns_or_the_request_is_not_evidence(denv, claim):
    stored = ncr(denv, improvementPhotos=f'["{claim}"]')                      # a historical / hand-written value on the row
    refused(denv, denv.login("dt_a"), stored)
    sent = ncr(denv, ref="NCR-P2")
    refused(denv, denv.login("dt_a"), sent, {**CLOSE, "improvementPhotos": [claim]})   # a client claim in the closing request itself


def test_another_ncrs_real_photo_is_not_evidence_even_when_its_path_is_listed_on_this_one(denv):
    other = ncr(denv, ref="NCR-OTHER")
    _, other_path = add_photo(denv, other)
    mine = ncr(denv, ref="NCR-MINE", improvementPhotos=f'["{other_path}", "/api/files/download/{other_path}"]')
    c = denv.login("dt_a")
    refused(denv, c, mine, {**CLOSE, "improvementPhotos": [other_path]})
    assert _put(c, "ncr", other, CLOSE).status_code == 200                    # the other NCR, which really owns it, closes


@pytest.mark.parametrize("category", ["defectPhoto", "progressPhoto", "attachment"])
def test_a_photo_of_this_ncr_under_another_category_is_not_improvement_evidence(denv, category):
    rid = ncr(denv)
    add_photo(denv, rid, category=category)
    refused(denv, denv.login("dt_a"), rid)


def test_a_soft_deleted_improvement_photo_is_not_evidence(denv):
    rid = ncr(denv)
    c = denv.login("dt_a")
    aid = upload(c, rid).json()[0]["id"]
    assert c.delete(f"/api/files/{aid}").status_code == 200
    refused(denv, c, rid)


def test_an_attachment_row_whose_file_is_missing_is_not_evidence_and_the_hint_says_why(denv):
    rid = ncr(denv)
    add_photo(denv, rid, write_file=False, file_name="ghost.png")
    r = refused(denv, denv.login("dt_a"), rid)
    assert "ghost.png" in r.json()["detail"] and "missing on the server" in r.json()["detail"]


def test_a_file_that_is_not_an_image_is_not_evidence_whatever_name_extension_and_mime_the_row_records(denv):
    rid = ncr(denv)
    add_photo(denv, rid, content=NOT_AN_IMAGE, ext=".png", mime="image/png", file_name="fake.png")
    r = refused(denv, denv.login("dt_a"), rid)
    assert "not an image" in r.json()["detail"]


def test_a_file_uploaded_through_the_api_with_image_declarations_but_text_content_does_not_count_either(denv):
    """The upload endpoint accepts a text body named .png / declared image/png (its own check falls back to the declaration); closing must not."""
    rid = ncr(denv)
    c = denv.login("dt_a")
    r = upload(c, rid, name="fake.png", content=NOT_AN_IMAGE, mime="image/png")
    if r.status_code == 200:                                                   # accepted as an attachment ...
        refused(denv, c, rid)                                                  # ... but it is not a photo
    else:                                                                       # or refused at upload: also fine, nothing to close on
        assert r.status_code == 400
        refused(denv, c, rid)


def test_a_row_of_another_record_type_with_this_ncrs_id_is_not_evidence(denv):
    rid = ncr(denv)
    add_photo(denv, rid, entity_type="obs")
    refused(denv, denv.login("dt_a"), rid)


def test_a_stored_path_that_escapes_the_upload_folder_is_not_evidence(denv):
    rid = ncr(denv)
    outside = os.path.join(os.path.dirname(upload_root()), f"outside_{uuid.uuid4().hex}.png")
    with open(outside, "wb") as fh:
        fh.write(PNG)
    try:
        db = denv.Session()
        db.add(models.Attachment(id=uuid.uuid4().hex, entity_type="ncr", entity_id=rid, file_name="esc.png", file_path="../" + os.path.basename(outside),
                                 mime_type="image/png", category="improvementPhoto", uploaded_at="2026-09-21T00:00:00", is_deleted=False))
        db.commit()
        db.close()
        r = refused(denv, denv.login("dt_a"), rid)
        assert "outside the upload folder" in r.json()["detail"]
    finally:
        os.remove(outside)


def test_one_usable_photo_is_enough_next_to_unusable_ones(denv):
    rid = ncr(denv)
    add_photo(denv, rid, write_file=False)
    add_photo(denv, rid, content=NOT_AN_IMAGE)
    add_photo(denv, rid, category="defectPhoto")
    add_photo(denv, rid)
    assert _put(denv.login("dt_a"), "ncr", rid, CLOSE).status_code == 200


# ══ 3. historical data: not rewritten, not re-validated unless it is being closed again ═══════════════════════════════════════════

def test_a_historical_closed_ncr_is_read_and_edited_without_photo_validation_and_nothing_is_backfilled(denv):
    rid = ncr(denv, ref="NCR-HIST", status="Closed", closeoutDate="2025-01-10", improvementPhotos='["/uploads/old.jpg"]', ownerApproval="Approved")
    c = denv.login("dt_noclose")
    before = attachments(denv)
    assert c.get(f"/api/ncr/{rid}/").status_code == 200
    assert _put(c, "ncr", rid, {"remark": "unrelated edit"}).status_code == 200
    assert _put(c, "ncr", rid, {"status": "Closed", "remark": "again"}).status_code == 200            # 'Closed' re-sent is not a closure
    assert _raw(denv, "ncr", rid, "status", "improvementPhotos") == ("Closed", '["/uploads/old.jpg"]')     # the legacy value is untouched
    assert attachments(denv) == before                                       # and no attachment row was invented for it


def test_reopening_and_closing_again_needs_a_usable_photo_the_old_string_does_not_count(denv):
    rid = ncr(denv, ref="NCR-REOPEN", status="Closed", closeoutDate="2025-01-10", improvementPhotos='["/uploads/old.jpg"]', ownerApproval="Approved")
    c = denv.login("dt_a")
    assert _put(c, "ncr", rid, {"status": "Open"}).status_code == 200
    r = _put(c, "ncr", rid, {"status": "Closed"})
    assert r.status_code == 400 and HINT in r.json()["detail"]
    assert _raw(denv, "ncr", rid, "status")[0] == "Open"
    assert upload(c, rid).status_code == 200                                 # an Open NCR takes photos again ...
    assert _put(c, "ncr", rid, {"status": "Closed"}).status_code == 200      # ... and now closes


def test_a_photo_removed_while_the_ncr_is_open_makes_a_later_closure_fail_until_a_new_one_is_added(denv):
    rid = ncr(denv)
    c = denv.login("dt_a")
    aid = upload(c, rid).json()[0]["id"]
    assert c.delete(f"/api/files/{aid}").status_code == 200
    refused(denv, c, rid)
    assert upload(c, rid, name="second.png").status_code == 200
    assert _put(c, "ncr", rid, CLOSE).status_code == 200


def test_a_closed_ncrs_improvement_photo_cannot_be_deleted_and_still_counts(denv):
    rid = ncr(denv)
    c = denv.login("dt_a")
    aid = upload(c, rid).json()[0]["id"]
    assert _put(c, "ncr", rid, CLOSE).status_code == 200
    d = c.delete(f"/api/files/{aid}")
    assert d.status_code == 409 and "locked" in d.json()["detail"]
    assert [a for a in attachments(denv) if a[0] == aid][0][5] is False


# ══ 4. the race between deleting the photo and closing ═════════════════════════════════════════════════════════════════════════════

def _in_thread(fn):
    box = {}

    def run():
        try:
            box["r"] = fn()
        except Exception as e:                                               # noqa: BLE001 — reported by the assertion below
            box["e"] = e
    t = threading.Thread(target=run, daemon=True)
    t.start()
    return t, box


def test_a_delete_that_arrives_after_the_closure_check_waits_and_is_then_refused_the_evidence_is_not_lost(denv, monkeypatch):
    """The closure has confirmed the photo; a DELETE for it arrives right then. It must not slip in between the check and the write: it waits for the
    closure to commit, then finds the NCR Closed (improvementPhoto locked) and is refused. The NCR ends Closed WITH its photo."""
    import services.ncr_service as svc
    rid = ncr(denv)
    c, c2 = denv.login("dt_a"), denv.login("dt_a")
    aid = upload(c, rid).json()[0]["id"]
    real, seen = svc.improvement_photo_evidence, {}

    def evidence_then_a_delete_arrives(db, ncr_id):
        out = real(db, ncr_id)
        assert out[0] == 1                                                   # the check passed ...
        seen["thread"], seen["box"] = _in_thread(lambda: c2.delete(f"/api/files/{aid}"))
        time.sleep(0.6)                                                      # ... and the delete has had time to run if nothing held it back
        seen["alive_during_check"] = seen["thread"].is_alive()
        return out
    monkeypatch.setattr(svc, "improvement_photo_evidence", evidence_then_a_delete_arrives)
    r = _put(c, "ncr", rid, CLOSE)
    monkeypatch.undo()
    seen["thread"].join(30)
    assert r.status_code == 200, r.text[:300]
    assert seen["alive_during_check"] is True                                # the delete was held back until the closure finished
    assert "e" not in seen["box"] and seen["box"]["r"].status_code == 409, seen["box"]
    assert _raw(denv, "ncr", rid, "status")[0] == "Closed"
    assert [a for a in attachments(denv) if a[0] == aid][0][5] is False      # the evidence is still there
    assert svc.improvement_photo_evidence(denv.Session(), rid)[0] == 1


def test_a_closure_that_arrives_while_the_photo_is_being_deleted_sees_the_deletion_and_is_refused(denv, monkeypatch):
    """The other order: the delete holds the lock first. The closure waits, then judges the state AFTER the deletion: refused, NCR stays Open."""
    import routers.file_router as fr
    rid = ncr(denv)
    c, c2 = denv.login("dt_a"), denv.login("dt_a")
    aid = upload(c, rid).json()[0]["id"]
    real, seen = fr.find_attachment_record, {}

    def record_then_a_closure_arrives(db, etype, eid):
        out = real(db, etype, eid)
        if "thread" not in seen:                                              # the delete already holds the NCR lock here
            seen["thread"], seen["box"] = _in_thread(lambda: _put(c2, "ncr", rid, CLOSE))
            time.sleep(0.6)
            seen["alive"] = seen["thread"].is_alive()
        return out
    monkeypatch.setattr(fr, "find_attachment_record", record_then_a_closure_arrives)
    d = c.delete(f"/api/files/{aid}")
    monkeypatch.undo()
    seen["thread"].join(30)
    assert d.status_code == 200 and seen["alive"] is True
    resp = seen["box"]["r"]
    assert resp.status_code == 400 and HINT in resp.json()["detail"], resp.text[:300]
    assert _raw(denv, "ncr", rid, "status", "closedBy")[0] == "Open" and _raw(denv, "ncr", rid, "closedBy")[0] is None
    assert audit_actions(denv, rid) == []


def test_the_delete_of_a_scoped_account_also_judges_the_ncr_as_it_is_under_the_lock_not_as_it_was_read_before(denv, monkeypatch):
    """A contractor-scoped account makes the route read the NCR (scope check) BEFORE it takes the lock, so that object can be stale by then: after the
    lock the NCR must be read again, or a photo of an NCR closed in the meantime would be deleted."""
    import services.ncr_service as svc
    rid = ncr(denv, project_id="P-A")
    c, c2 = denv.login("dt_a"), denv.login("dt_v1")
    aid = upload(c, rid).json()[0]["id"]
    real, seen = svc.improvement_photo_evidence, {}

    def evidence_then_a_delete_arrives(db, ncr_id):
        out = real(db, ncr_id)
        seen["thread"], seen["box"] = _in_thread(lambda: c2.delete(f"/api/files/{aid}"))
        time.sleep(0.6)
        return out
    monkeypatch.setattr(svc, "improvement_photo_evidence", evidence_then_a_delete_arrives)
    r = _put(c, "ncr", rid, CLOSE)
    monkeypatch.undo()
    seen["thread"].join(30)
    assert r.status_code == 200 and seen["box"]["r"].status_code == 409, (r.text[:200], seen["box"])
    assert [a for a in attachments(denv) if a[0] == aid][0][5] is False


def test_deleting_an_already_deleted_photo_is_a_404_and_deleting_an_open_ncrs_photo_still_works(denv):
    rid = ncr(denv)
    c = denv.login("dt_a")
    aid = upload(c, rid).json()[0]["id"]
    assert c.delete(f"/api/files/{aid}").status_code == 200
    assert c.delete(f"/api/files/{aid}").status_code == 404
