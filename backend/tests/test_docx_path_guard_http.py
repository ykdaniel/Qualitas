"""DOCX-PATH-GUARD-2026-001 — the real callers, over HTTP.

An account with normal view + update permission stores photo strings on an ITR / an NCR through the regular update endpoint (these legacy
JSON fields accept any string), then exports the record. The export must embed the photo that lives inside the upload root and must NOT
embed one that lives in a same-prefix sibling directory (`<root>_evil/`), however the stored string reaches it.

Isolated: own SQLite file and QUALITAS_UPLOAD_ROOT under tmp_path, generated 1x1 PNGs, no project uploads/ or development database.
"""
import hashlib
import zipfile
from io import BytesIO

import pytest
from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core import perms
from core.security import get_password_hash
from core.startup_guard import ENV_UPLOAD_ROOT
from test_docx_path_guard import _png
from test_itr_revoke_approval_acceptance import PW, Env, _get_or_create_perm

STORED = [
    "/api/files/download/itr/ok.png",              # legal: inside the root
    "/uploads/../uploads_evil/secret.png",         # same-prefix sibling via ..
    "link_to_sibling.png",                         # same-prefix sibling via a symlink inside the root
]


@pytest.fixture
def henv(tmp_path, monkeypatch):
    from database import Base, get_db
    from routers import auth as auth_router, itr as itr_router, ncr as ncr_router
    import database as database_module
    import db_migrations
    import core.security as security_module

    base = tmp_path.resolve()
    root, sibling = base / "uploads", base / "uploads_evil"
    (root / "itr").mkdir(parents=True)
    sibling.mkdir()
    ok, leak = root / "itr" / "ok.png", sibling / "secret.png"
    ok.write_bytes(_png((10, 200, 10)))
    leak.write_bytes(_png((200, 10, 10)))
    (root / "link_to_sibling.png").symlink_to(leak)
    monkeypatch.setenv(ENV_UPLOAD_ROOT, str(root))

    engine = create_engine(f"sqlite:///{base / 'guard.db'}", connect_args={"check_same_thread": False, "timeout": 20})
    Base.metadata.create_all(engine)
    S = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = S()
    role = models.Role(name="GuardEditor")
    role.permissions_rel = [_get_or_create_perm(db, c) for c in (perms.ITR_VIEW, perms.ITR_UPDATE, perms.NCR_VIEW, perms.NCR_UPDATE)]
    db.add(role)
    db.add(models.Project(id="P-A", name="P-A"))
    db.add(models.Contractor(id="C1", name="C One", abbreviation="C1"))
    db.flush()
    db.add(models.User(username="editor", email="editor@example.com", is_active=True, hashed_password=get_password_hash(PW), role_id=role.id))
    db.add(models.ITR(id="itr-1", documentNumber="ITR-1", project_id="P-A", vendor_id="C1", status="Open", description="d", rev="0", submit=""))
    db.add(models.NCR(id="ncr-1", documentNumber="NCR-1", project_id="P-A", vendor_id="C1", status="Open", description="d", rev="0", submit=""))
    db.commit()
    db.close()

    app = FastAPI()
    for r in (auth_router.router, itr_router.router, ncr_router.router):
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
    env = Env(app, S)
    env.ok_sha = hashlib.sha256(ok.read_bytes()).hexdigest()
    env.leak_sha = hashlib.sha256(leak.read_bytes()).hexdigest()
    try:
        yield env
    finally:
        database_module.engine, database_module.SessionLocal, db_migrations.engine, security_module.SessionLocal = orig
        Base.metadata.drop_all(engine)
        engine.dispose()


def _media(resp):
    z = zipfile.ZipFile(BytesIO(resp.content))
    return {hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith("word/media/")}


def test_itr_update_then_export_embeds_only_the_in_root_photo(henv):
    c = henv.login("editor")
    r = c.put("/api/itr/itr-1", json={"defectPhotos": STORED, "improvementPhotos": STORED})
    assert r.status_code == 200, r.text
    r = c.get("/api/itr/itr-1/export-docx")
    assert r.status_code == 200, r.text
    media = _media(r)
    assert henv.ok_sha in media
    assert henv.leak_sha not in media


def test_ncr_update_then_export_embeds_only_the_in_root_photo(henv):
    c = henv.login("editor")
    r = c.put("/api/ncr/ncr-1/", json={"defectPhotos": STORED, "progressPhotos": STORED, "improvementPhotos": STORED})
    assert r.status_code == 200, r.text
    r = c.get("/api/ncr/ncr-1/export-docx")
    assert r.status_code == 200, r.text
    media = _media(r)
    assert henv.ok_sha in media
    assert henv.leak_sha not in media
