"""DOCX-PATH-GUARD-2026-001: core/docx_builder.resolve_local_upload_path must only resolve to real files INSIDE the upload root.

The containment check used to be `realpath(full).startswith(realpath(root))`, which also accepts a SIBLING directory whose name merely starts
with the root's name (`<root>_evil/...`), reached either with `..` or through a symlink placed inside the root. ITR/NCR exports pass the
result to add_photo_section(), so an accepted path is embedded as image CONTENT in the Word file.

Everything runs in tmp_path with generated 1x1 PNGs; no real upload, database or system file is touched.
"""
import hashlib
import os
import struct
import zipfile
import zlib
from io import BytesIO

import pytest

from core import docx_builder as db


def _png(rgb):
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00" + bytes(rgb))) + chunk(b"IEND", b""))


@pytest.fixture
def tree(tmp_path):
    base = tmp_path.resolve()
    root = base / "uploads"
    sibling = base / "uploads_evil"            # same prefix as the root — the case startswith() let through
    outside = base / "outside"
    for d in (root, sibling, outside, root / "itr", root / "subdir"):
        d.mkdir(parents=True)
    ok = root / "itr" / "ok.png"
    leak = sibling / "secret.png"
    far = outside / "secret.png"
    ok.write_bytes(_png((10, 200, 10)))
    leak.write_bytes(_png((200, 10, 10)))
    far.write_bytes(_png((10, 10, 200)))
    (root / "link_to_sibling.png").symlink_to(leak)
    (root / "link_to_outside.png").symlink_to(far)
    (root / "link_dir_sibling").symlink_to(sibling, target_is_directory=True)
    (root / "itr" / "link_inside.png").symlink_to(ok)
    return {"root": str(root), "ok": str(ok), "leak": str(leak), "far": str(far)}


@pytest.mark.parametrize("value", [
    "itr/ok.png",                                             # plain relative
    "/itr/ok.png",                                            # leading slash is stripped, still relative to the root
    "https://host/api/files/download/itr/ok.png",             # new-style download URL
    "/api/files/download/itr/ok.png?token=abc&v=2",           # query string is ignored
    "/uploads/itr/ok.png",                                    # legacy /uploads/ string
    "http://host/uploads/itr/ok.png?x=1",                     # legacy absolute URL
    "itr/../itr/ok.png",                                      # .. that stays inside the root
    "itr/link_inside.png",                                    # symlink inside the root pointing inside the root
])
def test_files_inside_the_root_still_resolve(tree, value):
    assert db.resolve_local_upload_path(value, tree["root"]) == tree["ok"]


@pytest.mark.parametrize("value", [
    "../uploads_evil/secret.png",
    "/uploads/../uploads_evil/secret.png",
    "https://host/api/files/download/../uploads_evil/secret.png",
    "itr/../../uploads_evil/secret.png",
    "link_to_sibling.png",                                    # symlink inside the root -> same-prefix sibling file
    "link_dir_sibling/secret.png",                            # symlinked directory inside the root -> same-prefix sibling
])
def test_same_prefix_sibling_is_rejected(tree, value):
    assert db.resolve_local_upload_path(value, tree["root"]) is None


@pytest.mark.parametrize("value", [
    "../outside/secret.png",
    "a/b/../../../outside/secret.png",
    "link_to_outside.png",
])
def test_paths_outside_the_root_are_rejected(tree, value):
    assert db.resolve_local_upload_path(value, tree["root"]) is None


def test_absolute_path_is_treated_as_relative_to_the_root(tree):
    # An absolute filesystem path is stripped to a relative one under the root, so it cannot point at the real outside file.
    assert db.resolve_local_upload_path(tree["far"], tree["root"]) is None


@pytest.mark.parametrize("value", [None, "", "?token=abc"])
def test_empty_values_resolve_to_nothing(tree, value):
    assert db.resolve_local_upload_path(value, tree["root"]) is None


@pytest.mark.parametrize("value", ["itr/missing.png", "/uploads/nope.png", "https://host/api/files/download/none.png"])
def test_missing_files_resolve_to_nothing(tree, value):
    assert db.resolve_local_upload_path(value, tree["root"]) is None


@pytest.mark.parametrize("value", ["subdir", "itr", "/uploads/subdir", ".", "/"])
def test_directories_resolve_to_nothing(tree, value):
    assert db.resolve_local_upload_path(value, tree["root"]) is None


def _media_hashes(doc):
    buf = BytesIO()
    doc.save(buf)
    z = zipfile.ZipFile(buf)
    return {hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.startswith("word/media/")}


def _sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def test_legal_image_is_embedded_and_out_of_root_images_are_not(tree):
    """Same chain the ITR/NCR exports use: resolve every stored string, keep the hits, hand them to add_photo_section."""
    stored = ["/api/files/download/itr/ok.png", "/uploads/../uploads_evil/secret.png", "link_to_sibling.png", "../outside/secret.png"]
    resolved = [p for p in (db.resolve_local_upload_path(u, tree["root"]) for u in stored) if p]
    doc = db.new_document()
    db.add_photo_section(doc, "probe", resolved)
    media = _media_hashes(doc)
    assert _sha(tree["ok"]) in media
    assert _sha(tree["leak"]) not in media
    assert _sha(tree["far"]) not in media
