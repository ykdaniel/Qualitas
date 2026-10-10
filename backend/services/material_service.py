"""Material data (MATERIAL-SUBMITTAL M1): read only since 2026-10-09 (DECISIONS 材料主檔 API 只留查詢). Material rows
are created and edited by the approved-material register (services/material_submittal_service.py); the former create /
update methods were removed with their routes. No delete.

Scope rules (spec §9.2):
* a project the caller cannot see — or that does not exist — is 404 for every request that names it;
* a material outside the caller's projects is 404 (existence is not leaked);
* vendor-scoped accounts are refused before reaching this service (routers/materials.py).
"""
from sqlalchemy.orm import Session

from core.material_access import project_visible
from core.scope import Scope, record_in_scope
from repositories.material_repository import MaterialRepository


class NotVisible(Exception):
    """The named project or material does not exist or is outside the caller's scope (→ 404)."""


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
