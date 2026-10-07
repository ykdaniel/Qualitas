"""Regression test for the KM image-upload path-traversal fix.

upload_image previously built the saved filename as
f"km_{uuid}_{client_filename with only spaces stripped}" — a filename
containing "/" (e.g. from a crafted multipart request) carried its path
separators straight through os.path.join, letting a write escape
uploads/km/. The fix discards the client filename for the saved path
entirely, keeping only the already-allowlisted extension.
"""
import io
import os

from services.km_service import KMService
from repositories.km_repository import KMRepository


# Minimal valid PNG: 8-byte magic header is enough for magic-byte sniffing.
_PNG_BYTES = b'\x89PNG\r\n\x1a\n' + b'\x00' * 32


class _FakeUploadFile:
    def __init__(self, filename: str, content: bytes, content_type: str = 'image/png'):
        self.filename = filename
        self.content_type = content_type
        self.file = io.BytesIO(content)


def test_upload_filename_cannot_escape_uploads_dir(db_session, tmp_path, monkeypatch):
    monkeypatch.setenv('QUALITAS_UPLOAD_ROOT', str(tmp_path))      # never the project's backend/uploads
    service = KMService(KMRepository(db_session))
    upload_dir = os.path.join(str(tmp_path), 'km')

    malicious = _FakeUploadFile('../../../../tmp/evil_traversal_test.png', _PNG_BYTES)
    url = service.upload_image(malicious)

    # The URL must reference a plain uuid-based filename inside uploads/km/,
    # never the client-supplied path fragments.
    assert url.startswith('/api/files/download/km/km_')
    assert '..' not in url
    assert 'tmp' not in url
    assert 'evil_traversal_test' not in url

    saved_filename = url.rsplit('/', 1)[-1]
    saved_path = os.path.join(upload_dir, saved_filename)
    assert os.path.commonpath([os.path.realpath(saved_path), os.path.realpath(upload_dir)]) == os.path.realpath(upload_dir)
    assert os.path.isfile(saved_path)

    # No file was written outside uploads/km/ at the traversal target.
    assert not os.path.exists('/tmp/evil_traversal_test.png')

    os.remove(saved_path)


def test_upload_normal_filename_still_works(db_session, tmp_path, monkeypatch):
    monkeypatch.setenv('QUALITAS_UPLOAD_ROOT', str(tmp_path))      # never the project's backend/uploads
    service = KMService(KMRepository(db_session))
    upload_dir = os.path.join(str(tmp_path), 'km')

    normal = _FakeUploadFile('diagram.png', _PNG_BYTES)
    url = service.upload_image(normal)

    assert url.startswith('/api/files/download/km/km_')
    assert url.endswith('.png')

    saved_filename = url.rsplit('/', 1)[-1]
    saved_path = os.path.join(upload_dir, saved_filename)
    assert os.path.isfile(saved_path)
    os.remove(saved_path)
