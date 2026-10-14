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
from core.refusals import Refusal
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _resolve_vendor_id,
    _json_serialize,
    log_audit
)

logger = logging.getLogger(__name__)


def _supplier_vendor_id(db, supplier) -> str:
    """The contractor id a submitted supplier name stands for (FAT-SUPPLIER-NULL-2026-001).

    An empty / missing name, or one that is not a contractor, used to be written as vendor_id NULL without a word,
    which then broke every FAT list read. Both are now coded refusals (HTTP 400 via the router).
    """
    if supplier is None or not str(supplier).strip():
        raise Refusal('FAT_SUPPLIER_REQUIRED', "Supplier is required. Choose a contractor from the list.")
    vendor_id = _resolve_vendor_id(db, supplier)
    if vendor_id is None:
        raise Refusal('FAT_SUPPLIER_NOT_FOUND',
                      f"Supplier '{supplier}' is not a contractor in the system (it may have been renamed or deleted). "
                      "Choose a contractor from the list.",
                      name=supplier)
    return vendor_id


class FATService:
    """Service layer for FAT business logic"""

    def __init__(self, repo: FATRepository):
        self.repo = repo

    def get_fats(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.FAT]:
        """Get list of FAT records with optional filters"""
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_fat(self, fat_id: str, scope=None) -> Optional[models.FAT]:
        """Get a single FAT by ID"""
        obj = self.repo.get_by_id(fat_id)
        return obj if record_in_scope(obj, scope) else None

    def create_fat(self, fat_create: schemas.FATCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.FAT:
        """Create a new FAT with business logic validation"""
        # a refused supplier writes nothing, so it is checked before the transaction. A contractor account's records
        # are always its own contractor's (enforce_create_scope below), whatever it submits — as before.
        own_contractor = scope is not None and scope.vendor_id is not None
        vendor_id = None if own_contractor else _supplier_vendor_id(self.repo.db, fat_create.supplier)
        try:
            data = fat_create.model_dump()
            
            # Serialize array fields to string
            data = _json_serialize(data, ['detail_data', 'attachments'])

            data.pop('supplier', None)
            data['vendor_id'] = vendor_id

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            db_fat = models.FAT(**data)
            if not db_fat.id:
                db_fat.id = str(uuid.uuid4())

            now = datetime.now().isoformat()
            db_fat.created_at = now
            db_fat.updated_at = now

            created = self.repo.create(db_fat, commit=False)

            log_audit(
                self.repo.db, "CREATE", "FAT", created.id, created.equipment,
                new_value=fat_create.model_dump(), user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating FAT: {e}", exc_info=True)
            raise e

    def update_fat(self, fat_id: str, fat_update: schemas.FATUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.FAT]:
        """Update an existing FAT"""
        try:
            db_fat = self.repo.get_by_id(fat_id)
            if not db_fat or not record_in_scope(db_fat, scope):
                return None

            old_val = {c.name: getattr(db_fat, c.name) for c in db_fat.__table__.columns}
            
            data = fat_update.model_dump(exclude_unset=True)
            data = _json_serialize(data, ['detail_data', 'attachments'])

            if 'supplier' in data:
                data['vendor_id'] = _supplier_vendor_id(self.repo.db, data.pop('supplier'))

            enforce_update_scope(data, scope)

            data['updated_at'] = datetime.now().isoformat()

            updated = self.repo.update(db_fat, data, commit=False)

            log_audit(
                self.repo.db, "UPDATE", "FAT", fat_id, updated.equipment,
                old_value=old_val, new_value=fat_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return updated
        except Refusal:
            self.repo.db.rollback()
            raise
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating FAT {fat_id}: {e}", exc_info=True)
            raise e

    def update_fat_detail(self, fat_id: str, details: list[dict],
                          user_id: int = None, username: str = None, scope=None) -> Optional[models.FAT]:
        """Update specifically the detail array fields inside FAT"""
        try:
            db_fat = self.repo.get_by_id(fat_id)
            if not db_fat or not record_in_scope(db_fat, scope):
                return None
                
            old_val = {c.name: getattr(db_fat, c.name) for c in db_fat.__table__.columns}

            import json
            data = {
                "detail_data": json.dumps(details),
                "hasDetails": len(details) > 0,
                "updated_at": datetime.now().isoformat()
            }
            
            updated = self.repo.update(db_fat, data, commit=False)
            
            log_audit(
                self.repo.db, "UPDATE_DETAIL", "FAT", fat_id, updated.equipment,
                old_value=old_val, new_value={"detail_data": details},
                user_id=user_id, username=username, strict=True
            )
            
            self.repo.db.commit()
            return updated
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating FAT details for {fat_id}: {e}", exc_info=True)
            raise e

    def delete_fat(self, fat_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete a FAT with audit logging"""
        try:
            db_fat = self.repo.get_by_id(fat_id)
            if not db_fat or not record_in_scope(db_fat, scope):
                return False

            old_val = {c.name: getattr(db_fat, c.name) for c in db_fat.__table__.columns}
            self.repo.delete(db_fat, commit=False)

            log_audit(
                self.repo.db, "DELETE", "FAT", fat_id, db_fat.equipment,
                old_value=old_val, user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting FAT {fat_id}: {e}", exc_info=True)
            raise e
