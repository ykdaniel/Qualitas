"""Plain text of a Word (.docx) file, for the controlled-document search (KM-DOCS-2026-001 D1, Q4: LIKE over extracted
text; only Word is extracted — a PDF's text layer is not read, so a version that has only a PDF is `searchable=False`).

python-docx is already a dependency (KM Word export). Paragraphs, table cells, and header / footer paragraphs are
taken in document order; runs of whitespace collapse to one space, blocks are separated by newlines. A file python-docx
cannot open (not a docx, corrupt, encrypted) yields None — the version is still stored, just not searchable.
"""
from __future__ import annotations

import io
import logging
import re

logger = logging.getLogger(__name__)

MAX_EXTRACTED_CHARS = 2_000_000      # a guard against pathological files; well above any procedure document


def _clean(text: str) -> str:
    return re.sub(r"[ \t ]+", " ", text or "").strip()


def extract_docx_text(content: bytes) -> str | None:
    """The document's text, or None when it cannot be read as a .docx."""
    if not content:
        return None
    try:
        from docx import Document
        doc = Document(io.BytesIO(content))
    except Exception as e:                       # not a docx / corrupt / encrypted
        logger.info("document text: not extractable (%s: %s)", type(e).__name__, e)
        return None

    parts: list[str] = []

    def body(container):
        for para in container.paragraphs:
            t = _clean(para.text)
            if t:
                parts.append(t)
        for table in container.tables:
            for row in table.rows:
                cells = [_clean(c.text) for c in row.cells]
                line = " | ".join(c for c in cells if c)
                if line:
                    parts.append(line)

    try:
        for section in doc.sections:
            try:
                body(section.header)
            except Exception:
                pass
        body(doc)
        for section in doc.sections:
            try:
                body(section.footer)
            except Exception:
                pass
    except Exception as e:
        logger.info("document text: extraction stopped early (%s: %s)", type(e).__name__, e)
    text = "\n".join(parts)
    return text[:MAX_EXTRACTED_CHARS]


def snippet(text: str | None, needle: str, width: int = 80) -> str | None:
    """The first hit of `needle` in `text` with `width` characters of context on each side (case-insensitive), or None."""
    if not text or not needle:
        return None
    idx = text.lower().find(needle.lower())
    if idx < 0:
        return None
    start = max(0, idx - width)
    end = min(len(text), idx + len(needle) + width)
    out = text[start:end].replace("\n", " ")
    return ("…" if start > 0 else "") + out + ("…" if end < len(text) else "")
