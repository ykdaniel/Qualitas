"""Material data (MATERIAL-SUBMITTAL M1): create / read / update — no delete in V1 (spec r2 §1).

Scope rules (spec §9.2):
* a project the caller cannot see — or that does not exist — is 404 for every request that names it;
* a material outside the caller's projects is 404 (existence is not leaked);
* vendor-scoped accounts are refused before reaching this service (routers/materials.py).
"""
import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

import models
import schemas
from core.material_access import project_visible
from core.scope import Scope, record_in_scope
from core.utils import log_audit
from repositories.material_repository import MaterialRepository

logger = logging.getLogger(__name__)

_AUDIT_FIELDS = ("project_id", "category", "name", "brand", "model", "specification", "manufacturer", "supplier")


class NotVisible(Exception):
    """The named project or material does not exist or is outside the caller's scope (→ 404)."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()




class MaterialService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = MaterialRepository(db)

    def list(self, project_id: str, scope: Scope, q=None, category=None, limit=200, offset=0):
        if not project_visible(self.db, project_id, scope):
            raise NotVisible()
        items, total = self.repo.page(project_id, q, category, limit, offset)
        return {"items": items, "total": total, "limit": limit, "offset": offset}

    def get(self, material_id: str, scope: Scope):
        obj = self.repo.get(material_id)
        if obj is None or not record_in_scope(obj, scope):
            raise NotVisible()
        return obj

    def create(self, body: schemas.MaterialCreate, scope: Scope, user) -> models.Material:
        data = body.model_dump()
        if not project_visible(self.db, data["project_id"], scope):
            raise NotVisible()
        try:
            obj = models.Material(id=str(uuid.uuid4()), created_by=user.username, created_at=_now(), **data)
            self.db.add(obj)
            self.db.flush()
            log_audit(self.db, "CREATE", "Material", obj.id, obj.name,
                      new_value={k: getattr(obj, k) for k in _AUDIT_FIELDS},
                      user_id=user.id, username=user.username, strict=True)
            self.db.commit()
            self.db.refresh(obj)
            return obj
        except Exception:
            self.db.rollback()
            logger.error("Material create failed", exc_info=True)
            raise

    def update(self, material_id: str, body: schemas.MaterialUpdate, scope: Scope, user) -> models.Material:
        obj = self.get(material_id, scope)
        changes = body.model_dump(exclude_unset=True)
        if "name" in changes and changes["name"] is None:
            raise ValueError("name cannot be cleared")
        try:
            old = {k: getattr(obj, k) for k in _AUDIT_FIELDS}
            for k, v in changes.items():
                setattr(obj, k, v)
            obj.updated_by = user.username
            obj.updated_at = _now()
            self.db.flush()
            log_audit(self.db, "UPDATE", "Material", obj.id, obj.name, old_value=old,
                      new_value={k: getattr(obj, k) for k in _AUDIT_FIELDS},
                      user_id=user.id, username=user.username, strict=True)
            self.db.commit()
            self.db.refresh(obj)
            return obj
        except Exception:
            self.db.rollback()
            logger.error("Material update failed for %s", material_id, exc_info=True)
            raise
