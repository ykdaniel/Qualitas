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
    if scope.project_ids is not None and data.get("project_id"):
        if data["project_id"] not in scope.project_ids:
            raise ScopeForbidden("cannot move record to a project outside your scope")
    if scope.vendor_id is not None and data.get(vendor_field):
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
    "obs": models.OBS, "pqp": models.PQP, "fat": models.FAT,
    "followup": models.FollowUp, "audit": models.Audit, "checklist": models.Checklist,
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
