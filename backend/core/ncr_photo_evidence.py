"""Read-only proof that an NCR has improvement photos the SERVER can confirm (2026-09-21).

ONE copy of the photo condition, used by
  - the NCR closure check   (services/ncr_service.py, one NCR)
  - the Q-Workflow "improvement" checkpoint  (services/workflow_service.py, every NCR of a request in one batch)
so the two cannot drift apart. It only READS (the attachments table and the file system): no writes, no permission check, no call into NCRService.
Only the PHOTO condition is shared — what a status means for a checkpoint (e.g. a Closed NCR passes the tracker's checkpoint without proof) stays in
the caller and never loosens the closure check.

A photo counts only when ALL of these hold — read from the attachments table and the disk, never from anything a client sent:
  - an attachment row of entity_type 'ncr' and entity_id = this NCR;
  - category 'improvementPhoto';
  - not soft-deleted;
  - the file exists under the upload root (no traversal, no symlink out of it) and its FIRST BYTES are those of a PNG / JPEG / GIF / WEBP / BMP.
LIMIT (deliberate): only the file header is checked. That shows the file starts like an image; it does NOT show the whole image can be decoded, and it
says nothing about whether the photo was valid when the NCR was closed. The stored mime_type is not consulted (the upload records the client's
declaration when the content cannot be identified). The NCR's own `improvementPhotos` column (legacy path strings) is never evidence.
"""
import json
import os
from dataclasses import dataclass
from typing import Dict, Iterable, List, Tuple

import models
from core.uploads import stored_image_problem, upload_root

IMPROVEMENT_PHOTO_CATEGORY = "improvementPhoto"
_CHUNK = 400                                   # ids per IN (...) — far below every database's bound-parameter limit

# classification of one NCR's improvement-photo situation
VERIFIED = "verified"                          # at least one usable photo
INVALID = "invalid"                            # improvement-photo rows exist (not deleted) but none is usable
LEGACY_UNVERIFIED = "legacy_unverified"        # no attachment proof, but the old JSON column lists something — it cannot be mapped to a file, so it is not guessed at
MISSING = "missing"                            # nothing at all (soft-deleted rows count as nothing)


@dataclass(frozen=True)
class PhotoEvidence:
    usable: int                                # 1 once a usable photo is found (the search stops there), else 0
    problems: Tuple[str, ...] = ()             # "<file name>: <why>" for each row that exists but cannot be used (only filled when nothing is usable)
    rows: int = 0                              # non-deleted improvement-photo rows seen

    @property
    def verified(self) -> bool:
        return self.usable > 0


def photo_list(raw) -> list:
    """The legacy `improvementPhotos` column may hold a JSON string or a list; anything else is 'no claim'."""
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            return []
        return parsed if isinstance(parsed, list) else []
    return raw if isinstance(raw, list) else []


def ncr_photo_evidence(db, ncr_ids: Iterable[str]) -> Dict[str, PhotoEvidence]:
    """Evidence for every id, from ONE query per 400 ids (not one per NCR) and at most one file opened per NCR when its first photo is usable.
    Results are for THIS call only — nothing is cached between requests, so a photo deleted a moment later is never reported as present."""
    ids = list(dict.fromkeys(i for i in ncr_ids if i))
    out: Dict[str, PhotoEvidence] = {i: PhotoEvidence(0) for i in ids}
    if not ids:
        return out
    root = os.path.realpath(upload_root())
    by_ncr: Dict[str, List[models.Attachment]] = {}
    for start in range(0, len(ids), _CHUNK):
        rows = db.query(models.Attachment).filter(
            models.Attachment.entity_type == "ncr",
            models.Attachment.entity_id.in_(ids[start:start + _CHUNK]),
            models.Attachment.category == IMPROVEMENT_PHOTO_CATEGORY,
            models.Attachment.is_deleted == False,  # noqa: E712 — SQLAlchemy needs ==
        ).order_by(models.Attachment.entity_id, models.Attachment.uploaded_at, models.Attachment.id).all()
        for row in rows:
            by_ncr.setdefault(row.entity_id, []).append(row)
    for ncr_id, rows in by_ncr.items():
        problems = []
        for row in rows:
            why = stored_image_problem(row.file_path, root)
            if why is None:
                out[ncr_id] = PhotoEvidence(1, (), len(rows))
                break
            problems.append(f"{row.file_name!r}: {why}")
        else:
            out[ncr_id] = PhotoEvidence(0, tuple(problems), len(rows))
    return out


def classify(evidence: PhotoEvidence, legacy_claim: bool) -> str:
    """verified > invalid > legacy_unverified > missing. Attachment rows are more specific than a legacy string, so they win the reason."""
    if evidence.verified:
        return VERIFIED
    if evidence.rows:
        return INVALID
    return LEGACY_UNVERIFIED if legacy_claim else MISSING
