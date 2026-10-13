"""Meeting Minutes rev over HTTP (MEETING-FIX-2026-001, 2026-10-11).

`rev` is a user-editable field, and the (documentNumber, rev) pair is unique across the occurrences of one recurring
meeting (BACKLOG #18, unique index created by db_migrations._loosen_meeting_minutes_documentNumber_unique). Editing an
occurrence's rev to one another occurrence of the same series already uses used to surface as a 500 (IntegrityError
from the commit); it is a 400 the user can act on, and nothing is changed. A free rev is still saved.
Throwaway file-backed SQLite with the real unique index, real logins, real HTTP.
"""
import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm
from project_membership import bind


@pytest.fixture
def meeting_env(tmp_path):
    from database import Base, get_db
    from routers import auth as auth_router, meeting_minutes as meeting_router
    import database as database_module
    import db_migrations
    import core.security as security_module   # binds SessionLocal at import: swap it too (token blacklist)
    engine = create_engine(f"sqlite:///{tmp_path / 'meeting.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    app = FastAPI()
    for r in (auth_router.router, meeting_router.router):
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
        db_migrations._loosen_meeting_minutes_documentNumber_unique()   # the production (documentNumber, rev) unique index
        _seed(S)
        yield Env(app, S)
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _seed(S):
    db = S()
    try:
        role = models.Role(name="MeetingUser")
        role.permissions_rel = [_get_or_create_perm(db, c) for c in
                                (perms.MEETING_VIEW, perms.MEETING_CREATE, perms.MEETING_UPDATE)]
        db.add(role)
        db.add(models.Contractor(id="MTG-V1", name="Accept Co", abbreviation="ACC"))
        db.flush()
        u = models.User(username="mtg_a", email="mtg_a@example.com", is_active=True,
                        hashed_password=get_password_hash(PW), role_id=role.id, full_name="Full mtg_a")
        db.add(u)
        db.flush()
        bind(db, u)   # REF-PROJECT-SEQ B1: a non-admin works in one project (unbound = sees nothing); its meetings land there
        db.commit()
    finally:
        db.close()


def _rev(env, meeting_id):
    db = env.Session()
    try:
        return db.get(models.MeetingMinutes, meeting_id).rev
    finally:
        db.close()


def _series(c):
    first = c.post("/api/meeting-minutes/", json={"status": "Draft", "title": "Weekly", "vendor": "Accept Co"})
    assert first.status_code == 200, first.text
    second = c.post(f"/api/meeting-minutes/{first.json()['id']}/new-occurrence")
    assert second.status_code == 200, second.text
    assert first.json()["documentNumber"] == second.json()["documentNumber"]
    return first.json(), second.json()


def test_editing_rev_to_one_the_series_already_uses_is_a_400_and_changes_nothing(meeting_env):
    c = meeting_env.login("mtg_a")
    first, second = _series(c)
    assert (first["rev"], second["rev"]) == ("1.0", "2.0")
    r = c.put(f"/api/meeting-minutes/{second['id']}", json={"status": "Draft", "rev": "1.0", "title": "changed"})
    assert r.status_code == 400, r.text
    assert "Rev '1.0' already exists" in r.json()["detail"]
    assert _rev(meeting_env, second["id"]) == "2.0"
    # the session was rolled back: the same record can still be saved afterwards
    ok = c.put(f"/api/meeting-minutes/{second['id']}", json={"status": "Draft", "title": "changed"})
    assert ok.status_code == 200, ok.text


def test_a_free_rev_is_saved(meeting_env):
    c = meeting_env.login("mtg_a")
    _, second = _series(c)
    r = c.put(f"/api/meeting-minutes/{second['id']}", json={"status": "Draft", "rev": "2.1"})
    assert r.status_code == 200, r.text
    assert r.json()["rev"] == "2.1" and _rev(meeting_env, second["id"]) == "2.1"


def test_voiding_a_published_record_with_the_status_alone_works(meeting_env):
    """The form's Void button now sends only the status (it used to resend the whole record and hit the lock)."""
    c = meeting_env.login("mtg_a")
    first, _ = _series(c)
    assert c.put(f"/api/meeting-minutes/{first['id']}", json={"status": "Published"}).status_code == 200
    r = c.put(f"/api/meeting-minutes/{first['id']}", json={"status": "Void"})
    assert r.status_code == 200 and r.json()["status"] == "Void", r.text
