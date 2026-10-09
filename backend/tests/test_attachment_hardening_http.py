"""Attachment API hardening (2026-09-21): ITR Void, category validation, no-row downloads, ?token= — real logins, real routes, real files.

Written BEFORE the fixes and run against the unfixed code first: every assertion that failed then is a measured gap (recorded in
docs/workflow/itr-ui-improvement-notes.md). Uses the fixtures of test_attachment_authorization_http.py (temporary upload root, file DB).
"""
import re
import time
from datetime import timedelta

import pytest
from jose import jwt

import models
from core.auth_cookies import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME
from core.config import settings
from core.security import create_access_token
from test_attachment_authorization_http import (  # noqa: F401  (aenv is a fixture)
    MATRIX, aenv, files_on_disk, nothing_added, rows, state, up, _seed_file, _set_state,
)


def _png(name="p.png"):
    return (name, b"\x89PNG\r\n\x1a\n" + b"x" * 20, "image/png")


# ══ 1. ITR Void ══════════════════════════════════════════════════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("status", ["Approved", "Void"])
def test_an_approved_or_void_itr_refuses_upload_and_delete_and_nothing_changes(aenv, status):
    c = aenv.login("adm")
    alive = up(c, "itr", "itr-1").json()[0]
    _set_state(aenv, models.ITR, "itr-1", status=status)
    before = state(aenv)
    r = up(c, "itr", "itr-1")
    assert r.status_code == 409 and "locked" in r.json()["detail"].lower()
    assert c.delete(f"/api/files/{alive['id']}").status_code == 409
    assert nothing_added(aenv, before)                              # no new row, no row flagged deleted, no file added or removed
    assert c.get(f"/api/files/{alive['id']}").status_code == 200    # reading stays possible


# ══ 2. categories ════════════════════════════════════════════════════════════════════════════════════════════════════════════

# exactly what the front end sends today, per module (grep of every uploadFiles / FileAttachment use, 2026-09-21)
FRONTEND_CATEGORIES = {
    "ncr": {"defectPhoto", "progressPhoto", "improvementPhoto", "attachment"},
    "obs": {"defectPhoto", "improvementPhoto", "attachment"},
    "osd": {"defectPhoto", "improvementPhoto", "attachment"},
    "itr": {"defectPhoto", "improvementPhoto", "attachment", "drawing", "certificate"},
    "noi": {"attachment"}, "pqp": {"attachment"}, "itp": {"attachment"}, "meeting": {"attachment"},
}
ALL_KNOWN = {"defectPhoto", "progressPhoto", "improvementPhoto", "attachment", "drawing", "certificate"}
BYPASS_ATTEMPTS = ["", " ", "foo", "DefectPhoto", "defectphoto", "DEFECTPHOTO", " defectPhoto", "defectPhoto ", "defect_photo", "photo", "General", "attachment ", "Attachment"]


@pytest.mark.parametrize("etype,category", sorted((e, c) for e, cs in FRONTEND_CATEGORIES.items() for c in cs))
def test_every_category_the_front_end_sends_is_accepted_for_its_module(aenv, etype, category):
    assert up(aenv.login("adm"), etype, MATRIX[etype], category=category).status_code == 200


@pytest.mark.parametrize("etype,category", sorted((e, c) for e, cs in FRONTEND_CATEGORIES.items() for c in ALL_KNOWN - cs))
def test_a_known_category_that_belongs_to_another_module_is_refused(aenv, etype, category):
    before = state(aenv)
    r = up(aenv.login("adm"), etype, MATRIX[etype], category=category)
    assert r.status_code == 400 and "category" in r.json()["detail"].lower()
    assert nothing_added(aenv, before)


@pytest.mark.parametrize("etype", ["audit", "fat", "followup", "checklist", "km", "contractor"])
def test_modules_whose_front_end_never_sends_a_category_take_only_the_default(aenv, etype):
    c = aenv.login("adm")
    assert up(c, etype, MATRIX[etype], category="attachment").status_code == 200
    before = state(aenv)
    assert up(c, etype, MATRIX[etype], category="defectPhoto").status_code == 400
    assert nothing_added(aenv, before)


def test_an_omitted_category_is_the_default_attachment(aenv):
    r = aenv.login("adm").post("/api/files/upload", data={"entity_type": "ncr", "entity_id": "ncr-a"}, files=[("files", ("a.txt", b"x", "text/plain"))])
    assert r.status_code == 200 and r.json()[0]["category"] == "attachment"


NOT_EMPTY_ATTEMPTS = [c for c in BYPASS_ATTEMPTS if c != ""]


@pytest.mark.parametrize("etype,rid", [("obs", "obs-a"), ("ncr", "ncr-a"), ("noi", "noi-1"), ("itr", "itr-1")])
@pytest.mark.parametrize("category", NOT_EMPTY_ATTEMPTS)
def test_unknown_and_case_variant_categories_are_refused_on_open_and_on_closed_records_alike(aenv, etype, rid, category):
    model = {"obs": models.OBS, "ncr": models.NCR, "noi": models.NOI, "itr": models.ITR}[etype]
    c = aenv.login("adm")
    before = state(aenv)
    assert up(c, etype, rid, category=category).status_code == 400
    closed = {"obs": "Closed", "ncr": "Closed", "noi": "Closed", "itr": "Approved"}[etype]
    _set_state(aenv, model, rid, status=closed)
    r = up(c, etype, rid, category=category)
    assert r.status_code in (400, 409)                              # never 200
    assert nothing_added(aenv, before)


@pytest.mark.parametrize("etype,rid,closed_expect", [("obs", "obs-a", 200), ("ncr", "ncr-a", 200), ("noi", "noi-1", 409), ("itr", "itr-1", 409)])
def test_an_EMPTY_category_is_dropped_by_the_form_parser_and_becomes_the_default_attachment_never_a_locked_label(aenv, etype, rid, closed_expect):
    """A multipart field with an empty value reaches the endpoint as "not sent", so it takes the API default `attachment` — which is what is
    stored and what every lock is judged on. It cannot be used to reach a locked category; on a locked record it is refused like any upload."""
    model = {"obs": models.OBS, "ncr": models.NCR, "noi": models.NOI, "itr": models.ITR}[etype]
    c = aenv.login("adm")
    r = up(c, etype, rid, category="")
    assert r.status_code == 200 and r.json()[0]["category"] == "attachment"
    stored = {a.id: a.category for a in aenv.Session().query(models.Attachment).all()}
    assert stored[r.json()[0]["id"]] == "attachment"
    _set_state(aenv, model, rid, status={"obs": "Closed", "ncr": "Closed", "noi": "Closed", "itr": "Approved"}[etype])
    assert up(c, etype, rid, category="").status_code == closed_expect


def test_historical_rows_with_an_unknown_category_stay_readable_and_are_never_rewritten(aenv):
    fid, path = _seed_file(aenv, "obs")
    db = aenv.Session()
    for cat in ("legacy-photo", "DefectPhoto", None):
        db.add(models.Attachment(id=f"old-{cat}", entity_type="obs", entity_id="obs-a", file_name="old.txt", file_path=f"obs/old-{cat}.txt", file_size=1,
                                 mime_type="text/plain", category=cat, uploaded_by="x", uploaded_at="2026-01-01T00:00:00+00:00", is_deleted=False))
    db.commit()
    db.query(models.Attachment).filter_by(id="old-None").update({"category": None})       # (the column default fills None on INSERT; a real legacy row has NULL)
    db.commit()
    db.close()
    (aenv.root / "obs").mkdir(parents=True, exist_ok=True)
    for cat in ("legacy-photo", "DefectPhoto", None):
        (aenv.root / "obs" / f"old-{cat}.txt").write_bytes(b"old")
    c = aenv.login("adm")
    listed = c.get("/api/files/by-entity", params={"entity_type": "obs", "entity_id": "obs-a"}).json()
    assert {"old-legacy-photo", "old-DefectPhoto", "old-None"} <= {x["id"] for x in listed}
    assert c.get("/api/files/old-legacy-photo").status_code == 200
    assert c.get("/api/files/download/obs/old-legacy-photo.txt").content == b"old"
    stored = {a.id: a.category for a in aenv.Session().query(models.Attachment).all()}
    assert stored["old-legacy-photo"] == "legacy-photo" and stored["old-DefectPhoto"] == "DefectPhoto" and stored["old-None"] is None   # not rewritten


def test_on_a_closed_record_a_historical_unknown_category_cannot_be_deleted_but_an_open_record_can(aenv):
    db = aenv.Session()
    db.add(models.Attachment(id="old-x", entity_type="obs", entity_id="obs-a", file_name="o.txt", file_path="obs/old-x.txt", file_size=1, mime_type="text/plain",
                             category="legacy-photo", uploaded_by="x", uploaded_at="2026-01-01T00:00:00+00:00", is_deleted=False))
    db.commit()
    db.close()
    c = aenv.login("adm")
    _set_state(aenv, models.OBS, "obs-a", status="Closed")
    before = state(aenv)
    assert c.delete("/api/files/old-x").status_code == 409          # deny by default under a category lock
    assert nothing_added(aenv, before)
    _set_state(aenv, models.OBS, "obs-a", status="Open")
    assert c.delete("/api/files/old-x").status_code == 200


def test_LIMIT_a_photo_can_still_be_added_to_a_closed_obs_or_ncr_by_labelling_it_attachment(aenv):
    """The category lock restricts the LABEL, not the content: `attachment` is a legitimate category that stays open on a closed OBS / NCR
    (see PENDING_STATE_DECISIONS), and an image uploaded as `attachment` is accepted. So the category lock cannot guarantee that the
    record's evidence is unchanged — it only keeps files out of the locked photo categories. Pinned so nobody reads it as a full lock."""
    for etype, model, rid in (("obs", models.OBS, "obs-a"), ("ncr", models.NCR, "ncr-a")):
        c = aenv.login("adm")
        _set_state(aenv, model, rid, status="Closed")
        photo_as_photo = up(c, etype, rid, files=(_png(),), category="improvementPhoto")
        photo_as_attachment = up(c, etype, rid, files=(_png("q.png"),), category="attachment")
        assert photo_as_photo.status_code == 409
        assert photo_as_attachment.status_code == 200


# ══ 3. downloads of files that have no attachment row ═══════════════════════════════════════════════════════════════════════════

HEX = "0123456789abcdef0123456789abcdef"
UUID36 = "2a12aacd-ebeb-46cf-836b-4b7ae394ef4e"


def _plant(env, rel, data=b"planted"):
    p = env.root / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


@pytest.mark.parametrize("rel", [f"ncr/{HEX}.png", f"obs/{HEX}.txt", f"osd/{HEX}.png", "ncr/anything.txt", "stray/s.txt", f"itr/{HEX}.png", "km/notkm.png", "km/km_short.png",
                                 f"km/{HEX}.png", "km/km_.png", f"km/km_{HEX}.png/extra", "km/sub/km_" + HEX + ".png"])
@pytest.mark.parametrize("who", ["adm", "viewer"])
def test_an_orphan_file_or_any_non_km_path_is_never_served_even_with_every_view_permission(aenv, rel, who):
    _plant(aenv, rel)
    assert aenv.login(who).get(f"/api/files/download/{rel}").status_code == 404


@pytest.mark.parametrize("rel", [f"km/km_{HEX}.png", f"km/km_{UUID36}_word-import-1775998826647-iec70p.jpeg", f"km/km_{UUID36}_diagram.png"])
def test_a_km_image_needs_the_km_view_permission_and_nothing_else_is_implied(aenv, rel):
    _plant(aenv, rel, b"\x89PNG-km")
    assert aenv.login("viewer").get(f"/api/files/download/{rel}").content == b"\x89PNG-km"          # km:view:all
    assert aenv.login("adm").get(f"/api/files/download/{rel}").status_code == 200
    assert aenv.login("noperm").get(f"/api/files/download/{rel}").status_code == 403
    assert aenv.login("updater").get(f"/api/files/download/{rel}").status_code == 403               # update without view
    assert aenv.anonymous().get(f"/api/files/download/{rel}").status_code == 401


def test_a_km_looking_name_in_another_modules_directory_is_not_a_km_image(aenv):
    _plant(aenv, f"ncr/km_{HEX}.png")
    assert aenv.login("adm").get(f"/api/files/download/ncr/km_{HEX}.png").status_code == 404


def test_scoped_accounts_keep_the_existing_rule_no_row_no_download(aenv):
    _plant(aenv, f"km/km_{HEX}.png")
    assert aenv.login("sV").get(f"/api/files/download/km/km_{HEX}.png").status_code == 404


def test_a_file_that_has_a_row_is_still_served_by_its_row_not_by_its_name(aenv):
    fid, path = _seed_file(aenv, "ncr")
    assert aenv.login("viewer").get(f"/api/files/download/{path}").content == b"seed-bytes"
    db = aenv.Session()
    db.query(models.Attachment).filter_by(id=fid).delete()          # the row disappears: the file is now an orphan
    db.commit()
    db.close()
    assert aenv.login("adm").get(f"/api/files/download/{path}").status_code == 404


# ══ 4. ?token= ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

def _tokens(env, who):
    c = env.login(who)
    return c, c.cookies.get(ACCESS_COOKIE_NAME), c.cookies.get(REFRESH_COOKIE_NAME)


def _via(env, path, how, token):
    """The same request, presenting the token the three ways the download entry point accepts."""
    anon = env.anonymous()
    if how == "query":
        return anon.get(f"/api/files/download/{path}", params={"token": token})
    if how == "bearer":
        return anon.get(f"/api/files/download/{path}", headers={"Authorization": f"Bearer {token}"})
    anon.cookies.set(ACCESS_COOKIE_NAME, token)
    return anon.get(f"/api/files/download/{path}")


HOW = ["query", "bearer", "cookie"]


@pytest.mark.parametrize("how", HOW)
def test_token_valid(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    _, tok, _ = _tokens(aenv, "viewer")
    r = _via(aenv, path, how, tok)
    assert r.status_code == 200 and r.content == b"seed-bytes"


@pytest.mark.parametrize("how", HOW)
def test_token_garbage_expired_and_unknown_user_are_401(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    expired = create_access_token({"sub": "viewer"}, timedelta(seconds=-30))
    ghost = create_access_token({"sub": "no-such-user"})
    wrong_key = jwt.encode({"sub": "viewer", "type": "access", "exp": int(time.time()) + 600}, "not-the-secret", algorithm=settings.ALGORITHM)
    for tok in ("garbage", "", expired, ghost, wrong_key):
        assert _via(aenv, path, how, tok).status_code == 401, (how, tok[:20])


@pytest.mark.parametrize("how", HOW)
def test_token_revoked_by_logout_is_401(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    c, tok, _ = _tokens(aenv, "viewer")
    assert _via(aenv, path, how, tok).status_code == 200
    assert c.post("/api/auth/logout").status_code == 200
    assert _via(aenv, path, how, tok).status_code == 401


@pytest.mark.parametrize("how", HOW)
def test_token_from_before_logout_everywhere_is_401(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    c, tok, _ = _tokens(aenv, "viewer")
    assert _via(aenv, path, how, tok).status_code == 200
    time.sleep(1.1)
    assert c.post("/api/auth/logout-all").status_code == 200
    assert _via(aenv, path, how, tok).status_code == 401


@pytest.mark.parametrize("how", HOW)
def test_a_refresh_token_is_not_an_access_token(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    _, _, refresh = _tokens(aenv, "viewer")
    assert refresh
    assert _via(aenv, path, how, refresh).status_code == 401


@pytest.mark.parametrize("how", HOW)
def test_token_of_a_deactivated_account_is_refused(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    _, tok, _ = _tokens(aenv, "viewer")
    db = aenv.Session()
    db.query(models.User).filter_by(username="viewer").update({"is_active": False})
    db.commit()
    db.close()
    assert _via(aenv, path, how, tok).status_code == 401


@pytest.mark.parametrize("how", HOW)
def test_token_without_the_view_permission_is_403_and_soft_deleted_files_are_404(aenv, how):
    fid, path = _seed_file(aenv, "ncr")
    _, noperm_tok, _ = _tokens(aenv, "noperm")
    assert _via(aenv, path, how, noperm_tok).status_code == 403
    _, tok, _ = _tokens(aenv, "viewer")
    assert aenv.login("adm").delete(f"/api/files/{fid}").status_code == 200
    assert _via(aenv, path, how, tok).status_code == 404


def test_the_token_query_parameter_is_accepted_only_by_the_download_entry_point(aenv):
    fid, path = _seed_file(aenv, "ncr")
    _, tok, _ = _tokens(aenv, "viewer")
    anon = aenv.anonymous()
    assert anon.get(f"/api/files/{fid}", params={"token": tok}).status_code == 401
    assert anon.get("/api/files/by-entity", params={"entity_type": "ncr", "entity_id": "ncr-a", "token": tok}).status_code == 401


def test_scope_applies_to_token_requests_too(aenv):
    fid, path = _seed_file(aenv, "ncr")                              # ncr-a: P-A / C1
    _, tok, _ = _tokens(aenv, "sP")
    assert _via(aenv, path, "query", tok).status_code == 404


# ══ 5. the shared validator behind every normal endpoint (get_current_user) still refuses what it always refused ═════════════════

@pytest.mark.parametrize("how", ["bearer", "cookie"])
def test_get_current_user_still_refuses_revoked_refresh_deactivated_and_logged_out_everywhere_tokens(aenv, how):
    """core.security.authenticate_access_token was extracted from get_current_user (2026-09-21): the ordinary endpoints must behave exactly as before."""
    def call(tok):
        anon = aenv.anonymous()
        if how == "bearer":
            return anon.get("/api/ncr/", headers={"Authorization": f"Bearer {tok}"})
        anon.cookies.set(ACCESS_COOKIE_NAME, tok)
        return anon.get("/api/ncr/")
    c, tok, refresh = _tokens(aenv, "viewer")
    assert call(tok).status_code == 200
    assert call(refresh).status_code == 401                         # a refresh token is not an access token
    assert call("garbage").status_code == 401
    assert call(create_access_token({"sub": "viewer"}, timedelta(seconds=-30))).status_code == 401
    assert call(create_access_token({"sub": "no-such-user"})).status_code == 401
    time.sleep(1.1)
    assert c.post("/api/auth/logout-all").status_code == 200
    assert call(tok).status_code == 401                             # issued before the account-wide cutoff
    c2, tok2, _ = _tokens(aenv, "noperm")
    assert c2.post("/api/auth/logout").status_code == 200
    assert call(tok2).status_code == 401                            # revoked
    _, tok3, _ = _tokens(aenv, "updater")
    db = aenv.Session()
    db.query(models.User).filter_by(username="updater").update({"is_active": False})
    db.commit()
    db.close()
    r = call(tok3)
    assert r.status_code == 401 and "deactivated" in r.json()["detail"]
