"""P0 data isolation — per-user project / contractor scope.

A request's :class:`Scope` is derived from the authenticated user:

* **Admin role** → unscoped (sees everything).
* **Everyone else works in ONE project at a time** (REF-PROJECT-SEQ-2026-001 B1, business decisions D4/D5/D6/D20):
  the project chosen at sign-in, carried in the access token (``project_id`` claim, see routers/auth.py), and only
  while the user is still bound to it (UserProject). A user bound to exactly one project works in it without choosing.
  A user bound to none — or bound to several who has not chosen yet — gets an EMPTY scope: sees nothing, may create
  nothing. (Before: a user with no project rows and no vendor_id was unscoped and saw everything.)
* A ``vendor_id`` additionally confines a contractor account to its own contractor.

`project_ids is None` means "all projects"; `vendor_id is None` means "all
contractors". Enforcement lives at the repository layer via :func:`apply_scope`
(list queries) and :func:`record_in_scope` (single-record get/update/delete).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, FrozenSet

from fastapi import Depends
from sqlalchemy import and_, func, or_
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

import models
from database import get_db
from core.security import get_current_user
from core.refusals import Coded, RefusalHTTPException

# The system administrator role — the only role that is never scoped. Recognised exactly as IAM recognises an Admin
# (UserRepository.is_admin_role_name: the name "admin", any letter case), so a role IAM treats as ordinary can never be
# unscoped here (R1 P1-1, REF-PROJECT-SEQ-2026-001 B1: a non-admin role manager could otherwise create an
# "Administrator" role, hand it out, and the holder would see every project).
ADMIN_ROLE_NAMES = {"admin"}


class ScopeForbidden(Coded, Exception):
    """Raised when a scoped user tries to create/move a record outside their
    allowed projects/contractor. Routers map this to HTTP 403 with `refusal_http(e, 403)`:
    code SCOPE_FORBIDDEN, params {reason} (REFUSAL-DIALOG-2026-002). Not a ValueError on purpose
    (a router's `except ValueError -> 400` must not catch it)."""

    def __init__(self, message: str, reason: str):
        super().__init__("SCOPE_FORBIDDEN", message, reason=reason)


@dataclass(frozen=True)
class Scope:
    project_ids: Optional[FrozenSet[str]]  # None = all projects
    vendor_id: Optional[str]               # None = all contractors

    @property
    def unrestricted(self) -> bool:
        return self.project_ids is None and self.vendor_id is None


# Module-level singleton for the common "sees everything" case.
UNSCOPED = Scope(project_ids=None, vendor_id=None)


def is_admin_user(user) -> bool:
    """System administrator: never scoped, and the only role that may use the project switcher / "All projects"."""
    from repositories.user_repository import UserRepository
    return UserRepository.is_admin_role_name(getattr(getattr(user, "role", None), "name", None))


def bound_project_ids(user: models.User, db: Session) -> FrozenSet[str]:
    """The projects the user is assigned to in IAM (UserProject)."""
    rows = (
        db.query(models.UserProject.project_id)
        .filter(models.UserProject.user_id == user.id)
        .all()
    )
    return frozenset(r[0] for r in rows)


def working_project_id(user: models.User, db: Session) -> Optional[str]:
    """The ONE project a non-admin works in for this session, or None (not chosen yet / not a project member).

    The project chosen at sign-in rides in the access token (``token_project_id``, set by
    core.security.authenticate_access_token); it only counts while the user is still bound to it, so removing the
    binding in IAM takes effect on the next request. Without a choice, a user bound to exactly one project works in it."""
    bound = bound_project_ids(user, db)
    chosen = getattr(user, "token_project_id", None)
    if chosen:
        return chosen if chosen in bound else None
    return next(iter(bound)) if len(bound) == 1 else None


def compute_scope(user: models.User, db: Session) -> Scope:
    if is_admin_user(user):
        return UNSCOPED
    project_id = working_project_id(user, db)
    return Scope(
        project_ids=frozenset({project_id}) if project_id else frozenset(),   # empty: sees nothing (not "everything")
        vendor_id=getattr(user, "vendor_id", None) or None,
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


def is_shared_template(record) -> bool:
    """A shared template (business decisions D9 / D10): an ITP without a project, or a bare Checklist template (no
    project, no ITR, not made from a template). Every project sees and cites it; only a system administrator writes it."""
    if isinstance(record, models.ITP):
        return record.project_id is None
    if isinstance(record, models.Checklist):
        # no .strip(): the same test as shared_template_clause's COALESCE(...) = '' (B2 R1 P3-3)
        return (record.project_id is None and not (record.itrId or "")
                and not (getattr(record, "template_id", None) or ""))
    return False


def shared_template_clause(model):
    """SQL form of is_shared_template for `model`, or None when the model has no shared templates."""
    if model is models.ITP:
        return models.ITP.project_id.is_(None)
    if model is models.Checklist:
        return and_(models.Checklist.project_id.is_(None), func.coalesce(models.Checklist.itrId, "") == "",
                    func.coalesce(models.Checklist.template_id, "") == "")
    return None


def require_shared_template_write(record, scope: Optional[Scope]) -> None:
    """Only a system administrator changes a shared template (D18; Checklist templates: user's decision 2026-10-13)."""
    if scope is not None and not scope.unrestricted and is_shared_template(record):
        raise RefusalHTTPException(403, "Only a system administrator can change a shared template (ITP or Checklist template).",
                                   "SHARED_TEMPLATE_ADMIN_ONLY")


def require_same_project(linked, project_id: Optional[str], doc_type: str, number: str) -> None:
    """A link to another document must stay inside the record's project (G2, REF-PROJECT-SEQ-2026-001 B2). A shared
    template (an ITP without a project) may be cited from any project. Nothing to compare when either side has no
    project (an internal call, or legacy data)."""
    if linked is None or not project_id or is_shared_template(linked):
        return
    linked_project = getattr(linked, "project_id", None)
    if linked_project is not None and linked_project != project_id:
        raise RefusalHTTPException(400, f"{doc_type} '{number}' belongs to another project; a document can only be "
                                        f"linked to documents of its own project.", "LINK_OTHER_PROJECT",
                                   {"docType": doc_type, "number": number})


def apply_scope(query, model, scope: Optional[Scope]):
    """Filter a list query down to the rows the scope may see. Shared templates are visible in every project."""
    if scope is None or scope.unrestricted:
        return query
    if scope.project_ids is not None:
        in_project = model.project_id.in_(scope.project_ids)
        shared = shared_template_clause(model)
        query = query.filter(in_project if shared is None else or_(in_project, shared))
    if scope.vendor_id is not None:
        vattr = vendor_attr(model)
        if vattr is not None:
            shared = shared_template_clause(model)
            own = vattr == scope.vendor_id
            # a shared template that names no contractor is for every contractor (B2: a contractor account must be able
            # to cite a generic template); one that names a contractor stays that contractor's
            query = query.filter(own if shared is None else or_(own, and_(shared, vattr.is_(None))))
    return query


def enforce_create_scope(data: dict, scope: Optional[Scope], vendor_field: str = "vendor_id",
                         allow_shared: bool = False) -> None:
    """Validate/normalise a to-be-created record's project_id / contractor against
    the caller's scope. Mutates ``data`` in place; raises :class:`ScopeForbidden`
    on violation.

    Every record a person creates belongs to a project (REF-PROJECT-SEQ-2026-001 B2, G1 / D3 / D7): a system
    administrator must name it too (working in "All projects" creates nothing — 400 PROJECT_REQUIRED_FOR_CREATE), except
    where ``allow_shared`` says a project-less record is a shared template only an administrator may create (an ITP in
    "All projects", D18). ``scope=None`` (an internal call, e.g. a record derived from another) is left as it was.

    ``vendor_field`` is the dict key under which the contractor FK is written for
    this model (``vendor_id`` for most; ``contractor_id`` for Checklist).
    Call AFTER vendor name → id mapping so the contractor key is already set.
    """
    if scope is None:
        return
    if scope.unrestricted:
        if not data.get("project_id"):
            if not allow_shared:
                raise RefusalHTTPException(400, "Choose a project before creating a record: a system administrator working in "
                                                "All projects cannot create one.", "PROJECT_REQUIRED_FOR_CREATE")
            data["project_id"] = None          # a shared template: "" would be neither shared nor any project's (B2 R1 P3-2)
        return
    if scope.project_ids is not None:
        if not scope.project_ids:
            raise ScopeForbidden("You are not working in any project (not a project member, or no project chosen at sign-in)", "noWorkingProject")
        pid = data.get("project_id")
        if not pid:
            if len(scope.project_ids) == 1:
                data["project_id"] = next(iter(scope.project_ids))
            else:
                raise ScopeForbidden("project_id is required and must be one of your projects", "projectRequired")
        elif pid not in scope.project_ids:
            raise ScopeForbidden("project_id is outside your allowed projects", "projectOutsideScope")
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
            raise ScopeForbidden("cannot move record to a project outside your scope", "moveProjectOutsideScope")
    if scope.vendor_id is not None and vendor_field in data:
        if data[vendor_field] != scope.vendor_id:
            raise ScopeForbidden("cannot reassign record to another contractor", "reassignContractor")


def record_in_scope(record, scope: Optional[Scope]) -> bool:
    """True if a single fetched record is visible to the scope. Used to turn
    out-of-scope get/update/delete into a 404 (don't leak existence)."""
    if record is None:
        return False
    if scope is None or scope.unrestricted:
        return True
    if scope.project_ids is not None and getattr(record, "project_id", None) not in scope.project_ids \
            and not is_shared_template(record):
        return False
    if scope.vendor_id is not None and hasattr(record, "vendor_id") \
            and getattr(record, "vendor_id", None) != scope.vendor_id \
            and not (is_shared_template(record) and getattr(record, "vendor_id", None) is None):
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
