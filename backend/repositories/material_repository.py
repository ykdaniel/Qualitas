"""Material queries (MATERIAL-SUBMITTAL M1). Every query is confined to ONE project — materials are never
listed or picked across projects (DECISIONS: 材料基本資料限定所屬專案)."""
from sqlalchemy import or_
from sqlalchemy.orm import Session

import models


class MaterialRepository:
    def __init__(self, db: Session):
        self.db = db

    def get(self, material_id: str):
        return self.db.query(models.Material).filter(models.Material.id == material_id).first()

    def page(self, project_id: str, q: str | None, category: str | None, limit: int, offset: int):
        query = self.db.query(models.Material).filter(models.Material.project_id == project_id)
        if category:
            query = query.filter(models.Material.category == category)
        if q:
            like = f"%{q.strip()}%"
            query = query.filter(or_(*(getattr(models.Material, c).ilike(like) for c in
                                       ("name", "brand", "model", "specification", "manufacturer", "supplier", "category"))))
        total = query.count()
        items = (query.order_by(models.Material.name, models.Material.id).offset(offset).limit(limit).all())
        return items, total
