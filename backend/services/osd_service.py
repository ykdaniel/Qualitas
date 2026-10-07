"""
OSD (Over/Short/Damage Report) Service

Business logic layer for OSD module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.osd_repository import OSDRepository
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    begin_write_transaction,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class OSDService:
    """Service layer for OSD business logic"""

    def __init__(self, repo: OSDRepository):
        self.repo = repo

    def get_osds(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.OSD]:
        """Get list of OSD records with optional filters"""
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_osd(self, osd_id: str, scope=None) -> Optional[models.OSD]:
        """Get a single OSD by ID"""
        obj = self.repo.get_by_id(osd_id)
        return obj if record_in_scope(obj, scope) else None

    def create_osd(self, osd_create: schemas.OSDCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.OSD:
        """Create a new OSD with business logic validation"""
        try:
            data = _json_serialize(
                osd_create.model_dump(),
                ['defectPhotos', 'improvementPhotos', 'attachments']
            )

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            begin_write_transaction(self.repo.db)

            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'OSD'
                )

            db_osd = models.OSD(**data)
            if not db_osd.id:
                db_osd.id = str(uuid.uuid4())

            created = self.repo.create(db_osd, commit=False)

            log_audit(
                self.repo.db, "CREATE", "OSD", created.id, created.documentNumber,
                new_value=osd_create.model_dump(), user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating OSD: {e}", exc_info=True)
            raise e

    def update_osd(self, osd_id: str, osd_update: schemas.OSDUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.OSD]:
        """Update an existing OSD with validation"""
        try:
            db_osd = self.repo.get_by_id(osd_id)
            if not db_osd or not record_in_scope(db_osd, scope):
                return None

            if osd_update.status and not WorkflowEngine.validate_transition(
                "OSD", db_osd.status, osd_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_osd.status} to {osd_update.status}"
                )

            old_val = {c.name: getattr(db_osd, c.name) for c in db_osd.__table__.columns}
            d = osd_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            updated = self.repo.update(db_osd, d, commit=False)

            log_audit(
                self.repo.db, "UPDATE", "OSD", osd_id, updated.documentNumber,
                old_value=old_val, new_value=osd_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return updated
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating OSD {osd_id}: {e}", exc_info=True)
            raise e

    def delete_osd(self, osd_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete an OSD with audit logging"""
        try:
            db_osd = self.repo.get_by_id(osd_id)
            if not db_osd or not record_in_scope(db_osd, scope):
                return False

            old_val = {c.name: getattr(db_osd, c.name) for c in db_osd.__table__.columns}
            self.repo.delete(db_osd, commit=False)

            log_audit(
                self.repo.db, "DELETE", "OSD", osd_id, db_osd.documentNumber,
                old_value=old_val, user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting OSD {osd_id}: {e}", exc_info=True)
            raise e
