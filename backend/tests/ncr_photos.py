"""Real improvement-photo evidence for NCR tests (2026-09-21): an actual image file under the upload root plus its attachments row —
exactly what the upload endpoint leaves behind — so a closure test does not depend on a path string in the NCR's own columns."""
import os
import uuid
from datetime import datetime

import models
from core.uploads import upload_root

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 24 + b"test-image-bytes"
NOT_AN_IMAGE = b"this is plain text pretending to be a photo"


def add_photo(env, ncr_id, *, category="improvementPhoto", content=PNG, ext=".png", deleted=False, write_file=True, entity_type="ncr",
              file_name="after.png", mime="image/png", uploaded_at=None):
    """Returns (attachment_id, relative_path). The physical file is written under the (per-run temporary) upload root unless write_file=False.
    `env` is either a fixture with a `.Session` factory (the HTTP tests) or an open Session (the service-level tests)."""
    rel = f"{entity_type}/{uuid.uuid4().hex}{ext}"
    if write_file:
        full = os.path.join(upload_root(), rel)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as fh:
            fh.write(content)
    aid = uuid.uuid4().hex
    db = env if hasattr(env, "add") else env.Session()
    try:
        db.add(models.Attachment(id=aid, entity_type=entity_type, entity_id=ncr_id, file_name=file_name, file_path=rel, file_size=len(content),
                                 mime_type=mime, category=category, uploaded_by="test", uploaded_at=uploaded_at or datetime.now().isoformat(), is_deleted=deleted))
        db.commit()
    finally:
        if db is not env:
            db.close()
    return aid, rel
