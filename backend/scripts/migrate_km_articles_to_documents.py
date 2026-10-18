"""One-time migration of the old KM articles (books + chapters) into the controlled-document register
(KM-DOCS-2026-001 D1, DESIGN §5 simplified: production holds 1 draft book / 26 chapters / 0 attachments).

For every KM book (km_articles.parent_id IS NULL) that is not yet migrated (no documents.source_km_article_id):
  * a company document is created (doc_type from the article's category, status draft, title_zh = the book title,
    tags carried over; its own new QTS-KM number — the old articleNo is kept in the Word's header and in the
    change summary), and
  * version 1 is created with a Word file produced by the existing KM Word export (KMService.export_docx, both
    languages), stored as an attachment (entity_type document_version, category word); extracted_text is the chapters'
    plain text (taken from the HTML directly — more faithful than re-reading the generated Word).
  No PDF is produced (D1 ruling 1): the version stays draft until the issued PDF is uploaded by hand.
km_articles is NOT changed; the old articles stay readable in the KM module.

Usage (from backend/, against an ISOLATED copy first, then the production database with the application STOPPED):
    DATABASE_URL=sqlite:////path/to/qualitas.db python scripts/migrate_km_articles_to_documents.py --dry-run
    DATABASE_URL=sqlite:////path/to/qualitas.db QUALITAS_UPLOAD_ROOT=/path/to/uploads python scripts/migrate_km_articles_to_documents.py --user admin
Idempotent: a book already migrated (source_km_article_id) is skipped; a failure rolls the book back and continues.
Never import main here (it would run start-up, seeding and back-up rotation).
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))      # backend/

from bs4 import BeautifulSoup   # noqa: E402

import models   # noqa: E402

CATEGORY_TO_DOC_TYPE = {"procedure": "procedure", "quality": "procedure", "safety": "procedure", "general": "guideline",
                        "guidelines": "guideline", "guideline": "guideline", "definition": "definition", "standard": "standard"}


def _doc_type(category: str | None) -> str:
    return CATEGORY_TO_DOC_TYPE.get((category or "").strip().lower(), "guideline")


def _plain_text(chapters) -> str:
    parts = []
    for ch in chapters:
        if ch.chapter_no or ch.title:
            parts.append(f"{ch.chapter_no or ''} {ch.title or ''}".strip())
        html = ch.content or ""
        if html.strip():
            parts.append(BeautifulSoup(html, "html.parser").get_text(separator="\n").strip())
    return "\n".join(p for p in parts if p)


def migrate(db, *, dry_run: bool, user_id: int | None, username: str | None) -> list[dict]:
    from core.uploads import upload_root
    from core.utils import begin_write_transaction, generate_company_doc_no, log_audit
    from repositories.document_repository import DocumentRepository
    from repositories.km_repository import KMRepository
    from services.km_service import KMService

    km = KMService(KMRepository(db))
    repo = DocumentRepository(db)
    books = db.query(models.KMArticle).filter(models.KMArticle.parent_id.is_(None)).order_by(models.KMArticle.articleNo).all()
    done = {d.source_km_article_id for d in db.query(models.Document).filter(models.Document.source_km_article_id.isnot(None))}
    report = []
    for book in books:
        row = {"article_id": book.id, "articleNo": book.articleNo, "title": book.title, "chapters": len(km.repo.get_children(book.id))}
        if book.id in done:
            row["result"] = "already migrated"
            report.append(row)
            continue
        if dry_run:
            row["result"] = f"would create {_doc_type(book.category)} document + version 1 (Word only)"
            report.append(row)
            continue
        written = None
        try:
            begin_write_transaction(db)
            chapters = sorted(km.repo.get_children(book.id), key=lambda c: (c.chapter_no or "")) or [book]
            word_bytes = _drain(km.export_docx(book.id))      # the existing KM Word export (a StreamingResponse over a BytesIO)
            doc_no = generate_company_doc_no(db)
            doc = repo.add(doc_no=doc_no, scope="company", doc_type=_doc_type(book.category), title_zh=book.title or book.articleNo,
                           category=book.category, tags=book.tags, status="draft", source_km_article_id=book.id,
                           created_by_user_id=user_id, owner_user_id=book.author_id)
            version = repo.add_version(doc, status="draft", change_summary=f"自 KM 文章遷移（原 {book.articleNo}）",
                                       created_by_user_id=user_id)
            root = upload_root()
            os.makedirs(os.path.join(root, "document_version"), exist_ok=True)
            relative = f"document_version/{uuid.uuid4().hex}.docx"
            written = os.path.join(root, relative)
            with open(written, "wb") as fh:
                fh.write(word_bytes)
            att = repo.add_attachment(version, file_name=f"{book.articleNo}.docx", relative_path=relative, size=len(word_bytes),
                                      mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document", category="word",
                                      uploaded_by=username)
            version.word_attachment_id = att.id
            version.extracted_text = _plain_text(chapters)
            version.extracted_at = version.created_at
            log_audit(db, "CREATE", "Document", doc.id, doc.doc_no, new_value={"migrated_from_km_article": book.id, "articleNo": book.articleNo},
                      user_id=user_id, username=username, strict=True)
            db.commit()
            row["result"] = f"created {doc_no} (version 1, Word {len(word_bytes)} bytes, no PDF)"
        except Exception as e:      # noqa: BLE001 — one failed book must not stop the others
            db.rollback()
            if written:
                try:
                    os.remove(written)
                except OSError:
                    pass
            row["result"] = f"FAILED: {type(e).__name__}: {e}"
        report.append(row)
    return report


def _drain(response) -> bytes:
    import asyncio

    async def _collect():
        chunks = []
        async for chunk in response.body_iterator:
            chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
        return b"".join(chunks)
    return asyncio.run(_collect())


def main(argv) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--dry-run", action="store_true", help="report only; write nothing")
    parser.add_argument("--user", default=None, help="username recorded as the migrating user (must exist)")
    args = parser.parse_args(argv[1:])
    if not os.environ.get("DATABASE_URL"):
        print("set DATABASE_URL to the target database (a copy first); refusing to touch the default development database", file=sys.stderr)
        return 2
    from database import SessionLocal
    db = SessionLocal()
    try:
        user = db.query(models.User).filter(models.User.username == args.user).first() if args.user else None
        if args.user and user is None:
            print(f"no such user: {args.user}", file=sys.stderr)
            return 2
        report = migrate(db, dry_run=args.dry_run, user_id=user.id if user else None, username=user.username if user else None)
    finally:
        db.close()
    for row in report:
        print(f"{row['articleNo']}  {row['title']!r}  chapters={row['chapters']}  -> {row['result']}")
    print(f"{len(report)} book(s); {'dry run, nothing written' if args.dry_run else 'done'}")
    return 1 if any(r["result"].startswith("FAILED") for r in report) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
