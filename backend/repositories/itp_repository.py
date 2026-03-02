from typing import Optional, List
from sqlalchemy.orm import Session, joinedload
import models
from core.utils import sanitize_pagination

class ITPRepository:
    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, itp_id: str) -> Optional[models.ITP]:
        return self.db.query(models.ITP).options(joinedload(models.ITP.vendor_ref)).filter(models.ITP.id == itp_id).first()

    def get_all(self, skip: int = 0, limit: int = 100, search: str = None, status: str = None, start_date: str = None, end_date: str = None) -> List[models.ITP]:
        # 驗證分頁參數
        skip, limit = sanitize_pagination(skip, limit)

        query = self.db.query(models.ITP).options(joinedload(models.ITP.vendor_ref))
        if search:
            query = query.filter(
                (models.ITP.referenceNo.ilike(f"%{search}%")) |
                (models.ITP.description.ilike(f"%{search}%"))
            )
        if status:
            query = query.filter(models.ITP.status == status)
        if start_date:
            query = query.filter(models.ITP.submissionDate >= start_date)
        if end_date:
            query = query.filter(models.ITP.submissionDate <= end_date)
        return query.offset(skip).limit(limit).all()

    def create(self, itp: models.ITP) -> models.ITP:
        self.db.add(itp)
        self.db.commit()
        self.db.refresh(itp)
        return itp

    def update(self, itp: models.ITP, update_data: dict) -> models.ITP:
        for key, value in update_data.items():
            setattr(itp, key, value)
        self.db.commit()
        self.db.refresh(itp)
        return itp

    def delete(self, itp: models.ITP):
        self.db.delete(itp)
        self.db.commit()
