"""Scoped probe of core/docx_builder.resolve_local_upload_path (2026-10-07).

Read-only with respect to the product: imports the real helper, never modifies it.
Everything happens inside a fresh tempfile.mkdtemp() tree with generated 1x1 PNGs;
no real upload, database or system file is read.

Run from backend/:  python3 <this file>
"""
import hashlib
import os
import struct
import sys
import tempfile
import zipfile
import zlib
from io import BytesIO

sys.path.insert(0, os.getcwd())
from core import docx_builder as db  # noqa: E402


def png(rgb):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    raw = b"\x00" + bytes(rgb)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def candidate_fixed(url_or_path, upload_root):
    """Minimal-fix candidate: same parsing, containment via commonpath instead of startswith."""
    if not url_or_path:
        return None
    if "/api/files/download/" in url_or_path:
        rel = url_or_path.split("/api/files/download/", 1)[1]
    elif "/uploads/" in url_or_path:
        rel = url_or_path.split("/uploads/", 1)[1]
    else:
        rel = url_or_path.lstrip("/")
    rel = rel.split("?")[0]
    full = os.path.realpath(os.path.join(upload_root, rel))
    root = os.path.realpath(upload_root)
    if os.path.commonpath([root, full]) != root:
        return None
    return full if os.path.isfile(full) else None


t = os.path.realpath(tempfile.mkdtemp(prefix="docx-guard-probe-"))
root = os.path.join(t, "uploads")
sibling = os.path.join(t, "uploads_evil")
outside = os.path.join(t, "outside")
for d in (root, sibling, outside):
    os.makedirs(d)
files = {
    "ok": (os.path.join(root, "ok.png"), png((10, 200, 10))),
    "sibling": (os.path.join(sibling, "secret.png"), png((200, 10, 10))),
    "outside": (os.path.join(outside, "secret.png"), png((10, 10, 200))),
}
for p, b in files.values():
    open(p, "wb").write(b)
os.symlink(files["outside"][0], os.path.join(root, "link_outside.png"))
os.symlink(files["sibling"][0], os.path.join(root, "link_sibling.png"))

cases = [
    ("normal relative", "ok.png", "ALLOW"),
    ("normal download URL", "https://host/api/files/download/ok.png?token=x", "ALLOW"),
    ("normal legacy /uploads/", "/uploads/ok.png", "ALLOW"),
    ("sibling via ..", "../uploads_evil/secret.png", "DENY"),
    ("sibling via /uploads/..", "/uploads/../uploads_evil/secret.png", "DENY"),
    (".. to outside", "../outside/secret.png", "DENY"),
    ("deep .. to outside", "a/b/../../../outside/secret.png", "DENY"),
    ("absolute path stripped", files["outside"][0], "DENY"),
    ("symlink -> outside", "link_outside.png", "DENY"),
    ("symlink -> same-prefix sibling", "link_sibling.png", "DENY"),
]

print(f"temp tree: {t}")
print(f"{'case':34} {'expected':8} {'current':8} {'candidate':9}")
bad_current, bad_candidate = [], []
for name, inp, exp in cases:
    cur = "ALLOW" if db.resolve_local_upload_path(inp, root) else "DENY"
    cand = "ALLOW" if candidate_fixed(inp, root) else "DENY"
    print(f"{name:34} {exp:8} {cur:8} {cand:9}")
    if cur != exp:
        bad_current.append(name)
    if cand != exp:
        bad_candidate.append(name)

# End-to-end: does an accepted sibling path get its CONTENT embedded by add_photo_section?
leaked = db.resolve_local_upload_path("../uploads_evil/secret.png", root)
doc = db.new_document()
db.add_photo_section(doc, "probe", [leaked] if leaked else [])
buf = BytesIO()
doc.save(buf)
media = [n for n in zipfile.ZipFile(buf).namelist() if n.startswith("word/media/")]
want = hashlib.sha256(files["sibling"][1]).hexdigest()
embedded = any(hashlib.sha256(zipfile.ZipFile(buf).read(n)).hexdigest() == want for n in media)
print()
print(f"add_photo_section with sibling path: media parts={media} sibling bytes embedded={embedded}")
print()
print("current helper mismatches:", bad_current or "none")
print("candidate fix mismatches:", bad_candidate or "none")
