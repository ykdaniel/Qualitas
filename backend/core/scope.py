"""P0 data isolation — per-user project / contractor scope.

A request's :class:`Scope` is derived from the authenticated user:

* **Admin role** → unscoped (sees everything).
* **No project rows and no vendor_id** → unscoped. This keeps every existing
  internal user working unchanged after the migration (rollout safety).
* **Has project rows and/or a vendor_id** → scoped. List queries are filtered
  and single-record access is verified server-side.

`project_ids is None` means "all projects"; `vendor_id is None` means "all
contractors". Enforcement lives at the repository layer via :func:`apply_scope`
(list queries) and :func:`record_in_scope` (single-record get/update/delete).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, FrozenSet

from fastapi import Depends
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

import models
from database import get_db
from core.security import get_current_user

# Role names that are never scoped. Matched case-insensitively.
ADMIN_ROLE_NAMES = {"admin", "administrator"}


class ScopeForbidden(Exception):
    """Raised when a scoped user tries to create/move a record outside their
    allowed projects/contractor. Routers map this to HTTP 403."""


@dataclass(frozen=True)
class Scope:
    project_ids: Optional[FrozenSet[str]]  # None = all projects
    vendor_id: Optional[str]               # None = all contractors

    @property
    def unrestricted(self) -> bool:
        return self.project_ids is None and self.vendor_id is None


# Module-level singleton for the common "sees everything" case.
UNSCOPED = Scope(project_ids=None, vendor_id=None)


def compute_scope(user: models.User, db: Session) -> Scope:
    role_name = (getattr(getattr(user, "role", None), "name", None) or "").lower()
    if role_name in ADMIN_ROLE_NAMES:
        return UNSCOPED

    rows = (
        db.query(models.UserProject.project_id)
        .filter(models.UserProject.user_id == user.id)
        .all()
    )
    project_ids = frozenset(r[0] for r in rows)
    vendor_id = getattr(user, "vendor_id", None)

    # Nothing configured → unscoped (existing internal users keep full access).
    if not project_ids and not vendor_id:
        return UNSCOPED

    return Scope(
        project_ids=project_ids if project_ids else None,
        vendor_id=vendor_id or None,
    )


def get_scope(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Scope:
    """FastAPI dependency: the current request's data-isolation scope."""
    return compute_scope(user, db)


def vendor_attr(model):
    """Return the mapped InstrumentedAttribute for a model's contractor FK
    (DB column name ``vendor_id``), or None. Handles models like Checklist that
    expose that column under a different Python attribute (``contractor_id``,
    with ``vendor_id`` a read-only property — which must NOT be used in queries
    or as a constructor kwarg)."""
    try:
        mapper = sa_inspect(model)
    except Exception:
        return None
    for attr in mapper.column_attrs:
        for col in attr.columns:
            if col.name == "vendor_id":
                return getattr(model, attr.key)
    return None


def apply_scope(query, model, scope: Optional[Scope]):
    """Filter a list query down to the rows the scope may see."""
    if scope is None or scope.unrestricted:
        return query
    if scope.project_ids is not None:
        query = query.filter(model.project_id.in_(scope.project_ids))
    if scope.vendor_id is not None:
        vattr = vendor_attr(model)
        if vattr is not None:
            query = query.filter(vattr == scope.vendor_id)
    return query


def enforce_create_scope(data: dict, scope: Optional[Scope], vendor_field: str = "vendor_id") -> None:
    """Validate/normalise a to-be-created record's project_id / contractor against
    the caller's scope. Mutates ``data`` in place; raises :class:`ScopeForbidden`
    on violation. No-op for unscoped callers.

    ``vendor_field`` is the dict key under which the contractor FK is written for
    this model (``vendor_id`` for most; ``contractor_id`` for Checklist).
    Call AFTER vendor name → id mapping so the contractor key is already set.
    """
    if scope is None or scope.unrestricted:
        return
    if scope.project_ids is not None:
        pid = data.get("project_id")
        if not pid:
            if len(scope.project_ids) == 1:
                data["project_id"] = next(iter(scope.project_ids))
            else:
                raise ScopeForbidden("project_id is required and must be one of your projects")
        elif pid not in scope.project_ids:
            raise ScopeForbidden("project_id is outside your allowed projects")
    if scope.vendor_id is not None:
        # A contractor-scoped user can only ever create records for their own
        # contractor — force it regardless of what was submitted.
        data[vendor_field] = scope.vendor_id


def enforce_update_scope(data: dict, scope: Optional[Scope], vendor_field: str = "vendor_id") -> None:
    """On update, block a scoped user from *moving* a record out of their scope
    (reassigning project_id / contractor to a value they don't own). Unlike
    create, this never auto-fills or requires the field — it only rejects an
    explicit out-of-scope change. Mutates nothing; raises :class:`ScopeForbidden`.
    """
    if scope is None or scope.unrestricted:
        return
    # Use key-presence (not truthiness) so an explicit null/'' — which would
    # clear the scoping key entirely and hide the record from every
    # project/vendor-scoped user, including its own owner — is also treated
    # as an out-of-scope move, not silently allowed through.
    if scope.project_ids is not None and "project_id" in data:
        if data["project_id"] not in scope.project_ids:
            raise ScopeForbidden("cannot move record to a project outside your scope")
    if scope.vendor_id is not None and vendor_field in data:
        if data[vendor_field] != scope.vendor_id:
            raise ScopeForbidden("cannot reassign record to another contractor")


def record_in_scope(record, scope: Optional[Scope]) -> bool:
    """True if a single fetched record is visible to the scope. Used to turn
    out-of-scope get/update/delete into a 404 (don't leak existence)."""
    if record is None:
        return False
    if scope is None or scope.unrestricted:
        return True
    if scope.project_ids is not None and getattr(record, "project_id", None) not in scope.project_ids:
        return False
    if scope.vendor_id is not None and hasattr(record, "vendor_id") \
            and getattr(record, "vendor_id", None) != scope.vendor_id:
        return False
    return True


# entity_type string → owning model, for scoping attachments by their parent.
# Types absent here (e.g. "km") are not project-scoped and are left to other
# access controls.
_ENTITY_MODELS = {
    "ncr": models.NCR, "noi": models.NOI, "itr": models.ITR, "itp": models.ITP,
    "obs": models.OBS, "osd": models.OSD, "pqp": models.PQP, "fat": models.FAT,
    "followup": models.FollowUp, "audit": models.Audit, "checklist": models.Checklist,
    "meeting": models.MeetingMinutes,
    "material_rev": models.MaterialSubmittalRevision,   # carries its submittal's project_id / vendor_id (spec §3.2)
}


def entity_in_scope(db: Session, entity_type: str, entity_id: str, scope: Optional[Scope]) -> bool:
    """True if the parent record an attachment belongs to is visible to the
    scope. Unmapped (non-scoped) entity types are allowed; a scoped entity whose
    parent can't be resolved is denied (deny-by-default)."""
    if scope is None or scope.unrestricted:
        return True
    model = _ENTITY_MODELS.get((entity_type or "").lower())
    if model is None:
        return True
    rec = db.query(model).filter(model.id == entity_id).first()
    return record_in_scope(rec, scope)


# Every entity type the attachment API accepts, with the model that owns it. `entity_in_scope` (above) only knows the project-scoped ones;
# `contractor` and `km` have no project/contractor ownership of their own, but a target must still EXIST before a file may be attached.
ATTACHMENT_TARGET_MODELS = {**_ENTITY_MODELS, "contractor": models.Contractor, "km": models.KMArticle}


def find_attachment_record(db: Session, entity_type: str, entity_id: str):
    """The record an attachment row / upload points at, ignoring scope; None when the type is unknown or the record is gone."""
    model = ATTACHMENT_TARGET_MODELS.get((entity_type or "").lower())
    return db.query(model).filter(model.id == entity_id).first() if model is not None else None


def attachment_target(db: Session, entity_type: str, entity_id: str, scope: Optional[Scope]):
    """The record an upload would attach to, or None when it does not exist, is not a known target type, or is outside `scope`
    (deliberately one answer for all three, so a caller cannot probe which ids exist). Scope follows `entity_in_scope`: types
    without project/contractor ownership are not scope-restricted."""
    rec = find_attachment_record(db, entity_type, entity_id)
    if rec is None:
        return None
    if (entity_type or "").lower() in _ENTITY_MODELS and not record_in_scope(rec, scope):
        return None
    return rec
