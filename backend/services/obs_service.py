"""
OBS (Observation) Service

Business logic layer for OBS module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.obs_repository import OBSRepository
from core.utils import (
    _json_serialize,
    _resolve_vendor_id,
    generate_reference_no,
    log_audit,
    WorkflowEngine
)

logger = logging.getLogger(__name__)


class OBSService:
    """Service layer for OBS business logic"""

    def __init__(self, repo: OBSRepository):
        self.repo = repo

    def get_obss(self, skip: int = 0, limit: int = 500, **filters) -> List[models.OBS]:
        """Get list of OBS records with optional filters"""
        return self.repo.get_all(skip, limit, **filters)

    def get_obs(self, obs_id: str) -> Optional[models.OBS]:
        """Get a single OBS by ID"""
        return self.repo.get_by_id(obs_id)

    def create_obs(self, obs_create: schemas.OBSCreate,
                   user_id: int = None, username: str = None) -> models.OBS:
        """Create a new OBS with business logic validation"""
        try:
            data = _json_serialize(
                obs_create.dict(),
                ['defectPhotos', 'improvementPhotos', 'attachments']
            )

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            if not data.get('documentNumber'):
                data['documentNumber'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'OBS'
                )

            db_obs = models.OBS(**data)
            if not db_obs.id:
                db_obs.id = str(uuid.uuid4())

            created = self.repo.create(db_obs)

            log_audit(
                self.repo.db, "CREATE", "OBS", created.id, created.documentNumber,
                new_value=obs_create.dict(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating OBS: {e}", exc_info=True)
            raise e

    def update_obs(self, obs_id: str, obs_update: schemas.OBSUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.OBS]:
        """Update an existing OBS with validation"""
        try:
            db_obs = self.repo.get_by_id(obs_id)
            if not db_obs:
                return None

            if obs_update.status and not WorkflowEngine.validate_transition(
                "OBS", db_obs.status, obs_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_obs.status} to {obs_update.status}"
                )

            old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
            d = obs_update.dict(exclude_unset=True)
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            updated = self.repo.update(db_obs, d)

            log_audit(
                self.repo.db, "UPDATE", "OBS", obs_id, updated.documentNumber,
                old_value=old_val, new_value=obs_update.dict(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating OBS {obs_id}: {e}", exc_info=True)
            raise e

    def delete_obs(self, obs_id: str, user_id: int = None, username: str = None) -> bool:
        """Delete an OBS with audit logging"""
        try:
            db_obs = self.repo.get_by_id(obs_id)
            if not db_obs:
                return False

            old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
            self.repo.delete(db_obs)

            log_audit(
                self.repo.db, "DELETE", "OBS", obs_id, db_obs.documentNumber,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting OBS {obs_id}: {e}", exc_info=True)
            raise e
