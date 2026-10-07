"""Where attachments live (2026-09-20).

Default — unchanged: `backend/uploads`. `QUALITAS_UPLOAD_ROOT` (an absolute path) moves it, e.g. onto a mounted volume.

In an isolated test process (QUALITAS_REQUIRE_ISOLATED_DB=1, set by tests/isolation.py for every process it starts) the setting is
REQUIRED and must lie inside the run's own directory: `upload_root()` raises BEFORE anything is created or written otherwise. So a test
or a manual acceptance run cannot store a file in the developer's uploads folder, whatever it forgets to configure.

Read at call time (not import time) so a test can point it somewhere with monkeypatch.setenv.
"""
import os

from core.startup_guard import BACKEND_DIR, ENV_REQUIRE, ENV_ROOT, ENV_UPLOAD_ROOT, check_upload_root

DEFAULT_UPLOAD_ROOT = str(BACKEND_DIR / "uploads")


def upload_root() -> str:
    configured = (os.environ.get(ENV_UPLOAD_ROOT) or "").strip()
    if os.environ.get(ENV_REQUIRE) == "1":
        return str(check_upload_root(configured or None, os.environ.get(ENV_ROOT)))       # refuses before any write
    if not configured:
        return DEFAULT_UPLOAD_ROOT
    if not os.path.isabs(configured):
        raise ValueError(f"{ENV_UPLOAD_ROOT} must be an absolute path (got {configured!r})")
    return os.path.realpath(configured)


def looks_like_image(header: bytes) -> bool:
    """True when the FIRST BYTES of a file are those of a PNG, JPEG, GIF, WEBP or BMP image. Deliberately strict and independent of every
    declared value — the file name, its extension and the MIME type the client (or the upload endpoint's fallback) recorded are not consulted."""
    return (
        header.startswith(b"\x89PNG\r\n\x1a\n")
        or header.startswith(b"\xff\xd8\xff")
        or header.startswith((b"GIF87a", b"GIF89a"))
        or (header[:4] == b"RIFF" and header[8:12] == b"WEBP")
        or (header[:2] == b"BM" and len(header) >= 14)
    )


def stored_image_problem(file_path, root: str | None = None) -> str | None:
    """Why the stored file `file_path` (relative to the upload root, as an attachment row keeps it) cannot count as an image; None when it can.
    Looks at the physical file only: inside the upload root (no traversal, no symlink out of it), a regular file, and image bytes at its start.
    `root` = an already resolved upload root (a batch resolves it once instead of once per file)."""
    if not file_path or not isinstance(file_path, str):
        return "no stored file path"
    root = root or os.path.realpath(upload_root())
    full = os.path.realpath(os.path.join(root, file_path))
    if not full.startswith(root + os.sep):
        return "stored path is outside the upload folder"
    if not os.path.isfile(full):
        return "file is missing on the server"
    try:
        with open(full, "rb") as fh:
            header = fh.read(16)
    except OSError:
        return "file cannot be read"
    return None if looks_like_image(header) else "file content is not an image"
