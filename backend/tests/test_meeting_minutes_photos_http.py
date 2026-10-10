"""Photos in the Meeting Minutes discussion register (MEETING-TABS-2026-001 R9, 2026-10-11).

A photo pasted onto a discussion item / update is a normal attachment of the meeting, category "discussionPhoto" (images
only, same size / permission / scope / lock checks as every attachment); the register keeps only its id. "New
Occurrence" carries an open item WITH its photo ids — the next meeting shows the SAME attachment, nothing is copied — so:
  * an account that can open the next occurrence can read the photo (same contractor / project — even a scoped account),
    also after the earlier meeting is voided;
  * the photo cannot be deleted while another meeting still shows it (409), and the meeting it belongs to cannot be
    deleted while another meeting still shows one of its photos (400); once no one else shows it, both work as before.
Real logins, real routes, files under a temporary upload root.
"""
import base64

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from core.startup_guard import ENV_UPLOAD_ROOT
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")   # a real 1x1 PNG


@pytest.fixture
def penv(tmp_path, monkeypatch):
    from database import Base, get_db
    from routers import auth as auth_router, file_router, meeting_minutes as meeting_router
    import database as database_module
    import db_migrations
    import core.security as security_module
    monkeypatch.setenv(ENV_UPLOAD_ROOT, str(tmp_path / "uploads"))
    engine = create_engine(f"sqlite:///{tmp_path / 'photos.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    app = FastAPI()
    for r in (auth_router.router, file_router.router, meeting_router.router):
        app.include_router(r, prefix="/api")

    def _db():
        s = S()
        try:
            yield s
        finally:
            s.close()
    app.dependency_overrides[get_db] = _db
    orig = (database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal)
    database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = engine, S, engine, S
    try:
        db_migrations._loosen_meeting_minutes_documentNumber_unique()
        _seed(S)
        yield Env(app, S)
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _seed(S):
    db = S()
    try:
        role = models.Role(name="MeetingPhotoUser")
        role.permissions_rel = [_get_or_create_perm(db, c) for c in
                                (perms.MEETING_VIEW, perms.MEETING_CREATE, perms.MEETING_UPDATE, perms.MEETING_DELETE)]
        db.add(role)
        db.add(models.Contractor(id="PH-V1", name="Accept Co", abbreviation="ACC"))
        db.add(models.Contractor(id="PH-V2", name="Other Co", abbreviation="OTH"))
        db.flush()
        for name, vendor in (("ph_a", None), ("ph_scoped", "PH-V1"), ("ph_other", "PH-V2")):
            db.add(models.User(username=name, email=f"{name}@example.com", is_active=True, vendor_id=vendor,
                               hashed_password=get_password_hash(PW), role_id=role.id, full_name=name))
        db.commit()
    finally:
        db.close()


def _upload(c, meeting_id, content=PNG, name="p.png", category="discussionPhoto"):
    return c.post("/api/files/upload", data={"entity_type": "meeting", "entity_id": meeting_id, "category": category},
                  files={"files": (name, content, "image/png")})


def _series_with_photo(c):
    """rev 1.0 with an open item showing a photo, then New Occurrence (rev 2.0) carrying it."""
    first = c.post("/api/meeting-minutes/", json={"status": "Draft", "title": "Weekly", "vendor": "Accept Co"}).json()
    photo = _upload(c, first["id"])
    assert photo.status_code == 200, photo.text
    pid = photo.json()[0]["id"]
    log = [{"no": "1", "kind": "category", "level": 0, "content": "Tech"},
           {"no": "1.1", "kind": "item", "level": 1, "content": "crack", "status": "Open", "photos": [{"id": pid}],
            "updates": [{"date": "2026-07-21", "content": "looked", "photos": [{"id": pid}]}]}]
    assert c.put(f"/api/meeting-minutes/{first['id']}", json={"status": "Draft", "discussionLog": log}).status_code == 200
    second = c.post(f"/api/meeting-minutes/{first['id']}/new-occurrence").json()
    return first, second, pid


def test_discussion_photos_are_images_only_and_carried_by_reference(penv):
    c = penv.login("ph_a")
    first, second, pid = _series_with_photo(c)
    item = next(e for e in second["discussionLog"] if e["no"] == "1.1")
    assert item["photos"] == [{"id": pid}]                                   # the same attachment id: referenced, not copied
    assert item["updates"][0]["photos"] == [{"id": pid}]
    db = penv.Session()
    try:
        assert db.query(models.Attachment).filter_by(category="discussionPhoto").count() == 1
    finally:
        db.close()
    refused = _upload(c, first["id"], content=b"%PDF-1.4 not an image", name="x.pdf")
    assert refused.status_code in (400, 415), refused.text
    unknown = _upload(c, first["id"], category="sketch")
    assert unknown.status_code == 400


def test_a_scoped_account_that_sees_the_next_occurrence_reads_the_photo_also_after_void(penv):
    c = penv.login("ph_a")
    first, second, pid = _series_with_photo(c)
    scoped = penv.login("ph_scoped")
    assert scoped.get(f"/api/meeting-minutes/{second['id']}").status_code == 200
    meta = scoped.get(f"/api/files/{pid}")
    assert meta.status_code == 200, meta.text
    path = meta.json()["file_url"].split("/api/files/download/", 1)[1]
    assert scoped.get(f"/api/files/download/{path}").status_code == 200
    assert c.put(f"/api/meeting-minutes/{first['id']}", json={"status": "Void"}).status_code == 200
    assert scoped.get(f"/api/files/{pid}").status_code == 200
    assert scoped.get(f"/api/files/download/{path}").status_code == 200
    other = penv.login("ph_other")                                           # a different contractor sees neither
    assert other.get(f"/api/files/{pid}").status_code == 404


def test_a_photo_another_meeting_still_shows_cannot_be_deleted_nor_its_meeting(penv):
    c = penv.login("ph_a")
    first, second, pid = _series_with_photo(c)
    r = c.delete(f"/api/files/{pid}")
    assert r.status_code == 409 and second["documentNumber"] in r.json()["detail"], r.text
    assert c.put(f"/api/meeting-minutes/{first['id']}", json={"status": "Void"}).status_code == 200
    r = c.delete(f"/api/meeting-minutes/{first['id']}")
    assert r.status_code == 400 and "still shown" in r.json()["detail"], r.text
    # rev 2.0 drops the reference: the (voided) meeting can be deleted as before
    log = [e for e in second["discussionLog"] if e["no"] != "1.1"]
    assert c.put(f"/api/meeting-minutes/{second['id']}", json={"status": "Draft", "discussionLog": log}).status_code == 200
    assert c.delete(f"/api/meeting-minutes/{first['id']}").status_code == 200


def test_once_no_other_meeting_shows_it_the_photo_can_be_deleted(penv):
    c = penv.login("ph_a")
    first, second, pid = _series_with_photo(c)                               # rev 1.0 still Draft: its attachments are not locked
    assert c.delete(f"/api/files/{pid}").status_code == 409
    log = [e for e in second["discussionLog"] if e["no"] != "1.1"]
    assert c.put(f"/api/meeting-minutes/{second['id']}", json={"status": "Draft", "discussionLog": log}).status_code == 200
    assert c.delete(f"/api/files/{pid}").status_code == 200


def test_a_photo_only_its_own_meeting_shows_is_deleted_normally(penv):
    c = penv.login("ph_a")
    _, second, _ = _series_with_photo(c)
    own = _upload(c, second["id"]).json()[0]["id"]
    assert c.delete(f"/api/files/{own}").status_code == 200
