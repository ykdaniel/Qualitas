"""
FAT Repository

Data access layer for FAT (Factory Acceptance Test) module
"""

from typing import List, Optional
from sqlalchemy.orm import Session, joinedload
from loguru import logger

import models
from core.utils import sanitize_search_term

class FATRepository:
    """Repository for FAT entity"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, fat_id: str) -> Optional[models.FAT]:
        """Fetch a single FAT by ID with vendor relations loaded"""
        return self.db.query(models.FAT).options(
            joinedload(models.FAT.vendor_ref)
        ).filter(models.FAT.id == fat_id).first()

    def get_all(self, skip: int = 0, limit: int = 500, **filters) -> List[models.FAT]:
        """Fetch multiple FATs with optional exact and fuzzy filters"""
        query = self.db.query(models.FAT).options(joinedload(models.FAT.vendor_ref))

        # Dynamic exact filters
        for key, value in filters.items():
            if hasattr(models.FAT, key) and value is not None and key not in ['search', 'start_date', 'end_date']:
                query = query.filter(getattr(models.FAT, key) == value)

        # Fuzzy search across multiple string columns
        search_term = filters.get('search')
        if search_term:
            search_term = sanitize_search_term(search_term)
            if search_term:
                query = query.filter(
                    (models.FAT.equipment.ilike(f"%{search_term}%")) |
                    (models.FAT.supplier.ilike(f"%{search_term}%")) |
                    (models.FAT.procedure.ilike(f"%{search_term}%"))
                )

        # Date range filtering
        start_date = filters.get('start_date')
        if start_date:
            query = query.filter(models.FAT.startDate >= start_date)
            
        end_date = filters.get('end_date')
        if end_date:
            query = query.filter(models.FAT.endDate <= end_date)

        return query.offset(skip).limit(limit).all()

    def create(self, fat: models.FAT) -> models.FAT:
        self.db.add(fat)
        self.db.commit()
        self.db.refresh(fat)
        return fat

    def update(self, fat: models.FAT, update_data: dict) -> models.FAT:
        for key, value in update_data.items():
            setattr(fat, key, value)
        self.db.commit()
        self.db.refresh(fat)
        return fat

    def delete(self, fat: models.FAT):
        self.db.delete(fat)
        self.db.commit()
