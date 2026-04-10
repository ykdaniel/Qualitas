"""
FAT Service

Business logic layer for FAT module
"""

import uuid
import logging
from typing import List, Optional
from datetime import datetime

import models
import schemas
from repositories.fat_repository import FATRepository
from core.utils import (
    _resolve_vendor_id,
    _json_serialize,
    log_audit
)

logger = logging.getLogger(__name__)

class FATService:
    """Service layer for FAT business logic"""

    def __init__(self, repo: FATRepository):
        self.repo = repo

    def get_fats(self, skip: int = 0, limit: int = 500, **filters) -> List[models.FAT]:
        """Get list of FAT records with optional filters"""
        return self.repo.get_all(skip, limit, **filters)

    def get_fat(self, fat_id: str) -> Optional[models.FAT]:
        """Get a single FAT by ID"""
        return self.repo.get_by_id(fat_id)

    def create_fat(self, fat_create: schemas.FATCreate,
                   user_id: int = None, username: str = None) -> models.FAT:
        """Create a new FAT with business logic validation"""
        try:
            data = fat_create.model_dump()
            
            # Serialize array fields to string
            data = _json_serialize(data, ['detail_data', 'attachments'])

            vendor_name = data.pop('supplier', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            db_fat = models.FAT(**data)
            if not db_fat.id:
                db_fat.id = str(uuid.uuid4())

            now = datetime.now().isoformat()
            db_fat.created_at = now
            db_fat.updated_at = now

            created = self.repo.create(db_fat)

            log_audit(
                self.repo.db, "CREATE", "FAT", created.id, created.equipment,
                new_value=fat_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating FAT: {e}", exc_info=True)
            raise e

    def update_fat(self, fat_id: str, fat_update: schemas.FATUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.FAT]:
        """Update an existing FAT"""
        try:
            db_fat = self.repo.get_by_id(fat_id)
            if not db_fat:
                return None

            old_val = {c.name: getattr(db_fat, c.name) for c in db_fat.__table__.columns}
            
            data = fat_update.model_dump(exclude_unset=True)
            data = _json_serialize(data, ['detail_data', 'attachments'])

            if 'supplier' in data:
                vendor_name = data.pop('supplier')
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            data['updated_at'] = datetime.now().isoformat()

            updated = self.repo.update(db_fat, data)

            log_audit(
                self.repo.db, "UPDATE", "FAT", fat_id, updated.equipment,
                old_value=old_val, new_value=fat_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error updating FAT {fat_id}: {e}", exc_info=True)
            raise e

    def update_fat_detail(self, fat_id: str, details: list[dict],
                          user_id: int = None, username: str = None) -> Optional[models.FAT]:
        """Update specifically the detail array fields inside FAT"""
        try:
            db_fat = self.repo.get_by_id(fat_id)
            if not db_fat:
                return None
                
            old_val = {c.name: getattr(db_fat, c.name) for c in db_fat.__table__.columns}

            import json
            data = {
                "detail_data": json.dumps(details),
                "hasDetails": len(details) > 0,
                "updated_at": datetime.now().isoformat()
            }
            
            updated = self.repo.update(db_fat, data)
            
            log_audit(
                self.repo.db, "UPDATE_DETAIL", "FAT", fat_id, updated.equipment,
                old_value=old_val, new_value={"detail_data": details},
                user_id=user_id, username=username
            )
            
            return updated
        except Exception as e:
            logger.error(f"Error updating FAT details for {fat_id}: {e}", exc_info=True)
            raise e

    def delete_fat(self, fat_id: str, user_id: int = None, username: str = None) -> bool:
        """Delete a FAT with audit logging"""
        try:
            db_fat = self.repo.get_by_id(fat_id)
            if not db_fat:
                return False

            old_val = {c.name: getattr(db_fat, c.name) for c in db_fat.__table__.columns}
            self.repo.delete(db_fat)

            log_audit(
                self.repo.db, "DELETE", "FAT", fat_id, db_fat.equipment,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting FAT {fat_id}: {e}", exc_info=True)
            raise e
