"""scripts/migrate_km_articles_to_documents.py — old KM books become company documents (KM-DOCS-2026-001 D1, DESIGN §5).

Dry run writes nothing; a real run creates one document + version 1 (Word from the KM export, no PDF, status draft)
per book, keeps km_articles untouched, and a second run skips the migrated books. Throwaway SQLite file; the Word
export runs for real (python-docx / htmldocx); uploads go to the suite's throw-away root.
"""
import importlib.util
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import models
from core.startup_guard import ENV_UPLOAD_ROOT
from database import Base

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "migrate_km_articles_to_documents.py"


def _load_script():
    spec = importlib.util.spec_from_file_location("migrate_km_articles_to_documents", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _article(**kw):
    base = dict(content="", category="Procedure", status="Draft", author_id=1, created_at="2026-01-01", updated_at="2026-01-01", version_no=1)
    base.update(kw)
    return models.KMArticle(**base)


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setenv(ENV_UPLOAD_ROOT, str(tmp_path / "uploads"))
    engine = create_engine(f"sqlite:///{tmp_path / 'km.db'}")
    Base.metadata.create_all(engine)
    S = sessionmaker(bind=engine, autoflush=False)
    session = S()
    session.add(models.User(id=1, username="admin", email="a@example.com", is_active=True, hashed_password="x"))
    session.add_all([
        _article(id="book", articleNo="QTS-KM-000001", title="Welding Manual", tags="welding"),
        _article(id="c1", articleNo="QTS-KM-000001-1", title="Scope", parent_id="book", chapter_no="1.0", content="<p>範圍<br>Scope text</p>"),
        _article(id="c2", articleNo="QTS-KM-000001-2", title="Method", parent_id="book", chapter_no="2.0", content="<ol><li>步驟一</li></ol>"),
        _article(id="single", articleNo="QTS-KM-000002", title="Definitions", category="Definition", content="<p>Only one body</p>"),
        models.ReferenceSequence(project="QTS", vendor="SYS", doc="km", last_seq=2),
    ])
    session.commit()
    yield session
    session.close()
    engine.dispose()


def test_dry_run_reports_and_writes_nothing(db):
    script = _load_script()
    report = script.migrate(db, dry_run=True, user_id=1, username="admin")
    assert [(r["articleNo"], r["chapters"]) for r in report] == [("QTS-KM-000001", 2), ("QTS-KM-000002", 0)]
    assert all(r["result"].startswith("would create") for r in report)
    assert db.query(models.Document).count() == 0


def test_real_run_creates_documents_with_word_only_versions_and_is_idempotent(db, tmp_path):
    script = _load_script()
    report = script.migrate(db, dry_run=False, user_id=1, username="admin")
    assert [r["result"][:18] for r in report] == ["created QTS-KM-000", "created QTS-KM-000"], report
    docs = {d.source_km_article_id: d for d in db.query(models.Document).all()}
    book, single = docs["book"], docs["single"]
    assert (book.scope, book.doc_type, book.status, book.title_zh, book.tags) == ("company", "procedure", "draft", "Welding Manual", "welding")
    assert single.doc_type == "definition"
    assert {book.doc_no, single.doc_no} == {"QTS-KM-000003", "QTS-KM-000004"}      # new numbers after the old counter (2)
    v = db.query(models.DocumentVersion).filter_by(document_id=book.id).one()
    assert (v.version_no, v.status, v.pdf_attachment_id) == (1, "draft", None)
    assert v.change_summary == "自 KM 文章遷移（原 QTS-KM-000001）"
    assert "Scope text" in v.extracted_text and "步驟一" in v.extracted_text and "1.0 Scope" in v.extracted_text
    att = db.get(models.Attachment, v.word_attachment_id)
    assert att.entity_type == "document_version" and att.category == "word" and att.file_name == "QTS-KM-000001.docx"
    path = tmp_path / "uploads" / att.file_path
    assert path.is_file() and path.read_bytes()[:2] == b"PK" and att.file_size == path.stat().st_size
    # km_articles untouched
    assert db.query(models.KMArticle).count() == 4
    assert db.get(models.KMArticle, "book").title == "Welding Manual"
    # second run: nothing new
    again = script.migrate(db, dry_run=False, user_id=1, username="admin")
    assert all(r["result"] == "already migrated" for r in again)
    assert db.query(models.Document).count() == 2 and db.query(models.DocumentVersion).count() == 2
    assert db.query(models.AuditLog).filter_by(entity_type="Document", action="CREATE").count() == 2


def test_main_refuses_to_run_without_database_url(monkeypatch, capsys):
    script = _load_script()
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert script.main(["prog", "--dry-run"]) == 2
    assert "DATABASE_URL" in capsys.readouterr().err
