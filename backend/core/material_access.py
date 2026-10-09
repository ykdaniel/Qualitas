"""Shared access rules for the material submittal module (MATERIAL-SUBMITTAL V1; spec §4.5, §9.2).

* `refuse_vendor_scope` — V1 refuses contractor (vendor-scoped) accounts outright, even if a material permission was
  granted by mistake (the materials table has no vendor_id). Used by every material route and by the attachment API
  for entity type `material_rev`.
* `project_visible` — a project the caller cannot see, or that does not exist, is answered 404 everywhere.
* `lock_material_submittal_for_write` — the single write lock every submittal / revision / result / attachment write
  takes BEFORE reading what it decides on (same pattern as core.utils.lock_ncr_for_write). The caller must
  `db.expire_all()` and re-read afterwards, then commit or roll back to release it.
"""
from fastapi import Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

import models
from core.scope import Scope, get_scope

VENDOR_REFUSAL = "Material submittal is not available to contractor-scoped accounts."


def refuse_vendor_scope(scope: Scope = Depends(get_scope)) -> Scope:
    if scope is not None and getattr(scope, "vendor_id", None) is not None:
        raise HTTPException(status_code=403, detail=VENDOR_REFUSAL)
    return scope


def project_visible(db: Session, project_id: str, scope: Scope) -> bool:
    if not project_id:
        return False
    if scope is not None and not scope.unrestricted and scope.project_ids is not None and project_id not in scope.project_ids:
        return False
    return db.query(models.Project.id).filter(models.Project.id == project_id).first() is not None


def lock_material_submittal_for_write(db: Session, submittal_id: str) -> None:
    if db.get_bind().dialect.name == "sqlite":
        db.execute(text("UPDATE material_submittals SET id = id WHERE id = :i"), {"i": submittal_id})
    else:
        db.query(models.MaterialSubmittal).filter(models.MaterialSubmittal.id == submittal_id).with_for_update().first()
