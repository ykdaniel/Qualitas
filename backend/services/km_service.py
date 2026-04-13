import io
import os
import re
import shutil
import subprocess
import tempfile
import uuid

from fastapi import HTTPException, UploadFile
from fastapi.responses import StreamingResponse

import schemas
from repositories.km_repository import KMRepository


class KMService:
    def __init__(self, repo: KMRepository):
        self.repo = repo

    def get_articles(self, skip: int = 0, limit: int = 100, category: str | None = None, search: str | None = None):
        return self.repo.get_all(skip=skip, limit=limit, category=category, search=search)

    def get_article(self, article_id: str):
        article = self.repo.get_by_id(article_id)
        if not article:
            raise HTTPException(status_code=404, detail="KM Article not found")
        return article

    def create_article(self, article_create: schemas.KMArticleCreate, author_id: int):
        return self.repo.create(article=article_create, author_id=author_id)

    def update_article(self, article_id: str, article_update: schemas.KMArticleUpdate):
        db_article = self.repo.get_by_id(article_id)
        if not db_article:
            raise HTTPException(status_code=404, detail="KM Article not found")

        update_data = article_update.model_dump(exclude_unset=True)
        try:
            return self.repo.update(db_article, update_data)
        except ValueError as e:
            raise HTTPException(status_code=409, detail=str(e))

    def delete_article(self, article_id: str):
        db_article = self.repo.get_by_id(article_id)
        if not db_article:
            raise HTTPException(status_code=404, detail="KM Article not found")
        self.repo.delete(db_article)
        return {"ok": True}

    def get_article_history(self, article_id: str):
        db_article = self.repo.get_by_id(article_id)
        if not db_article:
            raise HTTPException(status_code=404, detail="KM Article not found")
        return self.repo.get_history(article_id)

    # ──────────────────────────────────────────────
    # Word Export / Import
    # ──────────────────────────────────────────────

    def _chapter_depth(self, chapter_no: str | None) -> int:
        """Return heading level: '1' → 1, '1.1' → 2, '1.1.1' → 3 (capped at 3)."""
        if not chapter_no:
            return 2
        clean = chapter_no.strip().rstrip('.0')
        dots = clean.count('.')
        return min(dots + 2, 4)  # book title uses h1; chapters start at h2

    def export_docx(self, article_id: str) -> StreamingResponse:
        """Generate a .docx of the KM book and all its chapters."""
        book = self.repo.get_by_id(article_id)
        if not book:
            raise HTTPException(status_code=404, detail="KM Article not found")

        # Resolve to book root
        root_id = book.parent_id or book.id
        root = self.repo.get_by_id(root_id)
        if not root:
            raise HTTPException(status_code=404, detail="KM root article not found")

        children = self.repo.get_children(root_id)

        # Sort chapters by chapter_no
        def sort_key(ch):
            parts = []
            for seg in (ch.chapter_no or '0').split('.'):
                try:
                    parts.append(int(seg))
                except ValueError:
                    parts.append(0)
            return parts

        chapters = sorted(children, key=sort_key) if children else [root]

        # Build a combined HTML document
        safe_title = root.title.replace('<', '&lt;').replace('>', '&gt;')
        html_parts = [
            '<!DOCTYPE html><html><head><meta charset="utf-8"/>',
            f'<title>{safe_title}</title></head><body>',
            f'<h1>{safe_title}</h1>',
        ]

        for ch in chapters:
            level = self._chapter_depth(ch.chapter_no)
            chapter_label = f"{ch.chapter_no + ' ' if ch.chapter_no else ''}{ch.title}"
            safe_label = chapter_label.replace('<', '&lt;').replace('>', '&gt;')
            html_parts.append(f'<h{level} data-chapter-no="{ch.chapter_no or ""}">{safe_label}</h{level}>')
            html_parts.append(ch.content or '')

        html_parts.append('</body></html>')
        combined_html = '\n'.join(html_parts)

        # Convert HTML → docx with pandoc
        with tempfile.TemporaryDirectory() as tmpdir:
            html_path = os.path.join(tmpdir, 'km.html')
            docx_path = os.path.join(tmpdir, 'km.docx')

            with open(html_path, 'w', encoding='utf-8') as f:
                f.write(combined_html)

            result = subprocess.run(
                ['pandoc', html_path, '-o', docx_path, '--from=html', '--to=docx'],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                raise HTTPException(status_code=500, detail=f"Export failed: {result.stderr}")

            with open(docx_path, 'rb') as f:
                content = f.read()

        safe_filename = re.sub(r'[^\w\-]', '_', root.title)[:50]
        return StreamingResponse(
            io.BytesIO(content),
            media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            headers={'Content-Disposition': f'attachment; filename="{safe_filename}.docx"'}
        )

    def import_docx(self, article_id: str, file: UploadFile, author_id: int) -> dict:
        """
        Parse an uploaded .docx and update matching chapters by chapter_no.
        Matching strategy: heading text starts with the chapter_no prefix.
        Returns a summary of updated chapters.
        """
        book = self.repo.get_by_id(article_id)
        if not book:
            raise HTTPException(status_code=404, detail="KM Article not found")

        root_id = book.parent_id or book.id
        root = self.repo.get_by_id(root_id)
        children = self.repo.get_children(root_id)
        all_chapters = children if children else [root]

        # Build a map: chapter_no → db article
        chapter_map = {
            (ch.chapter_no or '').strip(): ch
            for ch in all_chapters
            if ch.chapter_no
        }
        # Also include root (no chapter_no) for single-chapter books
        if not children:
            chapter_map['__root__'] = root

        # Save upload to temp file
        contents = file.file.read()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")

        with tempfile.TemporaryDirectory() as tmpdir:
            docx_path = os.path.join(tmpdir, 'upload.docx')
            html_path = os.path.join(tmpdir, 'output.html')

            with open(docx_path, 'wb') as f:
                f.write(contents)

            # Convert docx → HTML with pandoc
            result = subprocess.run(
                ['pandoc', docx_path, '-o', html_path,
                 '--from=docx', '--to=html', '--wrap=none'],
                capture_output=True, text=True
            )
            if result.returncode != 0:
                raise HTTPException(status_code=400, detail=f"Could not parse Word file: {result.stderr}")

            with open(html_path, 'r', encoding='utf-8') as f:
                html = f.read()

        # Parse HTML and split by headings
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, 'html.parser')

        # Walk top-level elements, split at h2/h3/h4 headings
        sections: list[dict] = []
        current: dict | None = None

        for el in soup.body.children if soup.body else []:
            tag = getattr(el, 'name', None)
            if tag in ('h2', 'h3', 'h4'):
                if current is not None:
                    sections.append(current)
                current = {'heading': el.get_text(strip=True), 'html_parts': []}
            elif current is not None and tag:
                current['html_parts'].append(str(el))

        if current is not None:
            sections.append(current)

        # Match sections to chapters
        updated = []
        skipped = []

        for sec in sections:
            heading = sec['heading']
            content_html = '\n'.join(sec['html_parts'])

            # Try to find matching chapter: heading starts with chapter_no
            matched_ch = None
            matched_no = None
            for ch_no, ch in chapter_map.items():
                if ch_no and heading.startswith(ch_no):
                    # Prefer longer (more specific) match
                    if matched_no is None or len(ch_no) > len(matched_no):
                        matched_ch = ch
                        matched_no = ch_no

            if matched_ch is None:
                skipped.append(heading)
                continue

            update_data = schemas.KMArticleUpdate(content=content_html)
            self.update_article(matched_ch.id, update_data)
            updated.append({'chapter_no': matched_no, 'title': matched_ch.title})

        return {
            'updated': updated,
            'skipped': skipped,
            'total_sections': len(sections),
        }

    ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.pptx', '.txt', '.csv', '.zip'}
    MAX_FILE_SIZE_MB = 10

    def upload_image(self, file: UploadFile) -> str:
        # Validate file extension
        ext = os.path.splitext(file.filename or '')[1].lower()
        if ext not in self.ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"File type '{ext}' is not allowed. Allowed: {', '.join(self.ALLOWED_EXTENSIONS)}")

        # Validate file size (read content first)
        contents = file.file.read()
        if len(contents) > self.MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File size exceeds {self.MAX_FILE_SIZE_MB}MB limit.")
        file.file.seek(0)  # Reset for writing

        # Resolve the base directory of the backend
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        upload_dir = os.path.join(base_dir, "uploads", "km")
        os.makedirs(upload_dir, exist_ok=True)

        file_uuid = str(uuid.uuid4())
        safe_filename = (file.filename or "file").replace(" ", "_")
        filename = f"km_{file_uuid}_{safe_filename}"
        file_path = os.path.join(upload_dir, filename)

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return f"/api/files/download/km/{filename}"
