"""Who may touch an attachment, and when (2026-09-20, plan A).

An attachment belongs to a record. Until now /api/files only asked "is the caller logged in?" (and, for reads/deletes, "is the record in
their data scope?"). Rules, all judged on the RECORD the attachment belongs to:

    read   (list, metadata, download)   the record type's  <module>:view:all
    write  (upload, delete)             the record type's  <module>:update:all      — a create-only account cannot attach files
    lock   (upload, delete)             the record's state lock, where the record's own edit rules already define one (below)

`contractor` uses contractors:view:all / contractors:manage:all (there is no update code); `km` uses km:view:all / km:update:all.
Data scope (project / contractor) and existence are checked elsewhere (core/scope.py); nothing here loosens them.

LOCKS — only where the existing rules of the record are explicit. Each entry names where the rule is defined:
  unconditional (the record is frozen, no permission lifts it)
    NOI      Closed               services/noi_service.py       "no fields can be changed once an NOI is closed"
    Audit    Closed               services/audit_service.py     same
    FollowUp Closed               services/followup_service.py  same
    Meeting  Published / Void     services/meeting_minutes_service.py
    ITR      Approved / Void      services/itr_service.py       only type/status/detail_data may change (Approved); a Void ITR freezes its
                                                            checklists exactly like an Approved one (services/checklist_service.py)
    Checklist  parent ITR Approved or Void   services/checklist_service.py   "fully frozen"
    PQP      Approved             services/pqp_service.py       `attachments` is a locked field
  by category (the record's locked fields are photo fields; the general `attachment` category stays open)
    OBS      Closed   defectPhoto, improvementPhoto     services/obs_service.py   _LOCKED_OBS_FIELDS
    NCR      Closed   improvementPhoto                  services/ncr_service.py   _LOCKED_QUALITY_FIELDS

NOT locked, because the record's own rules do not say anything about attachments there — listed for a decision, see
PENDING_STATE_DECISIONS.
"""
import re
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models
from core import perms

# entity_type -> (permission needed to read, permission needed to upload / delete)
ENTITY_PERMISSIONS = {
    "itp": (perms.ITP_VIEW, perms.ITP_UPDATE),
    "ncr": (perms.NCR_VIEW, perms.NCR_UPDATE),
    "noi": (perms.NOI_VIEW, perms.NOI_UPDATE),
    "itr": (perms.ITR_VIEW, perms.ITR_UPDATE),
    "pqp": (perms.PQP_VIEW, perms.PQP_UPDATE),
    "obs": (perms.OBS_VIEW, perms.OBS_UPDATE),
    "osd": (perms.OSD_VIEW, perms.OSD_UPDATE),
    "fat": (perms.FAT_VIEW, perms.FAT_UPDATE),
    "audit": (perms.AUDIT_VIEW, perms.AUDIT_UPDATE),
    "checklist": (perms.CHECKLIST_VIEW, perms.CHECKLIST_UPDATE),
    "followup": (perms.FOLLOWUP_VIEW, perms.FOLLOWUP_UPDATE),
    "meeting": (perms.MEETING_VIEW, perms.MEETING_UPDATE),
    "km": (perms.KM_VIEW, perms.KM_UPDATE),
    "contractor": (perms.CONTRACTOR_VIEW, perms.CONTRACTOR_MANAGE),
    "material_rev": (perms.MATERIAL_VIEW, perms.MATERIAL_MANAGE),
}

# Per-CATEGORY upload / delete permission — only for the entity types listed here (MATERIAL-SUBMITTAL M2, spec §3.4):
# a material revision's reply document is written by whoever records external results, not by whoever prepares the
# submittal. Every other entity type keeps the single update permission of ENTITY_PERMISSIONS, unchanged.
# Per-category update permissions. Empty since M6: the material register has no separate "record result" permission any more
# (DECISIONS 材料：只作為核准材料登錄簿) — every material_rev category needs material:manage. The mechanism stays for other types.
CATEGORY_UPDATE_PERMISSIONS: dict = {
}

# Entity types that contractor (vendor-scoped) accounts may not touch at all, whatever their permissions (spec §9.2).
VENDOR_REFUSED_ENTITY_TYPES = {"material_rev"}

MATERIAL_SUBMISSION_CATEGORIES = {"catalogue", "technicalData", "certificate", "testReport", "photo", "other"}
# Categories that only accept images (checked on the DETECTED type, after the general allow-list). M6: material photos.
IMAGE_ONLY_CATEGORIES = {("material_rev", "photo")}
# Categories never locked by the record's state (M6, DECISIONS 材料：只作為核准材料登錄簿): registered materials are already
# approved and their photos must stay maintainable; permission and scope checks still apply.
NEVER_LOCKED_CATEGORIES = {("material_rev", "photo")}

_UNCONDITIONAL_LOCKED_STATUSES = {
    "noi": {"Closed"},
    "audit": {"Closed"},
    "followup": {"Closed"},
    "meeting": {"Published", "Void"},
    "itr": {"Approved", "Void"},          # Approved: services/itr_service.py; Void: the same records are frozen for their checklists (checklist_service)
    "material_rev": {"Approved", "ApprovedWithComments", "ReviseAndResubmit", "Rejected"},   # a result is recorded: all frozen
}
_LOCKED_CATEGORIES = {
    ("obs", "Closed"): {"defectPhoto", "improvementPhoto"},
    ("ncr", "Closed"): {"improvementPhoto"},
    ("material_rev", "Draft"): {"replyDocument"},                      # no reply before the revision is submitted
    ("material_rev", "Submitted"): set(MATERIAL_SUBMISSION_CATEGORIES),  # what was submitted is frozen; replies stay open
}

PENDING_STATE_DECISIONS = [
    "NCR Void / OBS Void / PQP Void: the records' own rules do not say what may happen to attachments",
    "NCR Closed: only improvementPhoto is locked by the record's rules; defectPhoto / progressPhoto / attachment stay open",
    "OBS Closed: only defectPhoto / improvementPhoto are locked; the general `attachment` category stays open",
    "NOI Reject: the record can be reopened by NOI approvers; nothing says whether attachments follow",
    "Checklist Pass / Fail: the lock is about results, not evidence files",
    "ITP, FAT, OSD, KM, Contractor: the records have no state lock at all",
    "the category lock limits the LABEL only: `attachment` stays open on a closed NCR / OBS, and an image uploaded as `attachment` is accepted — the lock "
    "does NOT guarantee that a closed record's evidence is unchanged",
]


# Categories a record type really uses — taken from every uploadFiles / FileAttachment call of the front end (2026-09-21). Matching is EXACT:
# an empty value, an unknown value or a case / whitespace variant is refused on upload, so a label can never be used to step around a lock.
# Existing rows with any other value stay readable and are never rewritten; under a category lock they count as locked (deny by default).
_PHOTO_AND_FILES = {"defectPhoto", "improvementPhoto", "attachment"}
ALLOWED_CATEGORIES = {
    "ncr": _PHOTO_AND_FILES | {"progressPhoto"},
    "obs": set(_PHOTO_AND_FILES),
    "osd": set(_PHOTO_AND_FILES),
    "itr": _PHOTO_AND_FILES | {"drawing", "certificate"},
    "noi": {"attachment"}, "pqp": {"attachment"}, "itp": {"attachment"}, "meeting": {"attachment"},
    # no front end sends a category for these; the API default is the only value accepted
    "audit": {"attachment"}, "fat": {"attachment"}, "followup": {"attachment"}, "checklist": {"attachment"}, "km": {"attachment"}, "contractor": {"attachment"},
    "material_rev": MATERIAL_SUBMISSION_CATEGORIES | {"replyDocument"},
}


def validate_category(entity_type: str, category) -> None:
    allowed = ALLOWED_CATEGORIES.get((entity_type or "").lower(), set())
    if category not in allowed:
        raise HTTPException(status_code=400, detail=f"Unknown category {category!r} for {entity_type}. Allowed: {', '.join(sorted(allowed))}")


# KM images are stored WITHOUT an attachment row. Two naming schemes exist in the wild (observed in the developer's uploads/km, names only):
#   km_<32 hex>.<ext>                                   what services/km_service.upload_image writes today
#   km_<uuid with dashes>_<original file name>          what it wrote before the file name was discarded (Word-import images, etc.)
_KM_IMAGE_PATH = re.compile(r"^km/km_(?:[0-9a-f]{32}\.[A-Za-z0-9]{1,5}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}_[^/\\]+)$")


def is_km_image_path(file_path: str) -> bool:
    return bool(_KM_IMAGE_PATH.match((file_path or "").replace("\\", "/")))


def permission_codes(user) -> set:
    if user is None or not getattr(user, "is_active", True):
        return set()
    role = getattr(user, "role", None)
    return {p.code for p in (role.permissions_rel if role is not None else [])}


def require_attachment_permission(user, entity_type: str, action: str, category: Optional[str] = None) -> None:
    """403 unless the user holds the record type's view (action='view') or update (action='update') permission.

    For entity types in CATEGORY_UPDATE_PERMISSIONS the update permission depends on the category (pass `category`);
    for every other type `category` is ignored and behaviour is unchanged. Entity types in VENDOR_REFUSED_ENTITY_TYPES
    are refused to vendor-scoped accounts before any permission is looked at."""
    etype = (entity_type or "").lower()
    pair = ENTITY_PERMISSIONS.get(etype)
    if pair is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    if etype in VENDOR_REFUSED_ENTITY_TYPES and getattr(user, "vendor_id", None):
        raise HTTPException(status_code=403, detail="Not available to contractor-scoped accounts.")
    needed = pair[0] if action == "view" else CATEGORY_UPDATE_PERMISSIONS.get(etype, {}).get(category, pair[1])
    if needed not in permission_codes(user):
        raise HTTPException(status_code=403, detail=f"Operation not permitted. Required: {needed}")


def lock_reason(db: Session, entity_type: str, record, category: Optional[str]) -> Optional[str]:
    """Why an upload / delete on this record's attachments is refused because of the record's STATE; None when it is allowed."""
    etype = (entity_type or "").lower()
    status = getattr(record, "status", None)
    if (etype, category) in NEVER_LOCKED_CATEGORIES:
        return None
    if etype in _UNCONDITIONAL_LOCKED_STATUSES and status in _UNCONDITIONAL_LOCKED_STATUSES[etype]:
        return f"Cannot change attachments of a {status} {etype.upper()}: the record is locked."
    if etype == "pqp":
        from services.pqp_service import PQPService
        if PQPService._normalize_pqp_status(status) == "Approved":
            return "Cannot change attachments of an Approved PQP: the document content is locked (use Publish to create a new revision)."
    if etype == "checklist" and getattr(record, "itrId", None):
        parent = db.query(models.ITR).filter(models.ITR.id == record.itrId).first()
        if parent is not None and parent.status in ("Approved", "Void"):
            return f"Cannot change attachments of this Checklist: its parent ITR is {parent.status}."
    locked = _LOCKED_CATEGORIES.get((etype, status))
    if locked is not None:
        effective = category or "attachment"
        open_categories = ALLOWED_CATEGORIES.get(etype, set()) - locked
        if effective not in open_categories:                  # locked, OR not a recognised category at all: deny by default
            return f"Cannot change {effective} files of a {status} {etype.upper()}: that evidence is locked."
    return None
