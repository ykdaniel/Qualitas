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
from core.scope import ScopeForbidden, record_in_scope, enforce_create_scope, enforce_update_scope
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

    def get_obss(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.OBS]:
        """Get list of OBS records with optional filters"""
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_obs(self, obs_id: str, scope=None) -> Optional[models.OBS]:
        """Get a single OBS by ID"""
        obj = self.repo.get_by_id(obs_id)
        return obj if record_in_scope(obj, scope) else None

    def create_obs(self, obs_create: schemas.OBSCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.OBS:
        """Create a new OBS with business logic validation"""
        try:
            data = _json_serialize(
                obs_create.model_dump(),
                ['defectPhotos', 'improvementPhotos', 'attachments']
            )

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

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
                new_value=obs_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating OBS: {e}", exc_info=True)
            raise e

    def update_obs(self, obs_id: str, obs_update: schemas.OBSUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.OBS]:
        """Update an existing OBS with validation"""
        try:
            db_obs = self.repo.get_by_id(obs_id)
            if not db_obs or not record_in_scope(db_obs, scope):
                return None

            if obs_update.status and not WorkflowEngine.validate_transition(
                "OBS", db_obs.status, obs_update.status
            ):
                raise ValueError(
                    f"Invalid status transition from {db_obs.status} to {obs_update.status}"
                )

            old_val = {c.name: getattr(db_obs, c.name) for c in db_obs.__table__.columns}
            d = obs_update.model_dump(exclude_unset=True)
            d = _json_serialize(d, ['defectPhotos', 'improvementPhotos', 'attachments'])

            # Guard: once Closed, the observation's actual substance — the
            # improvement action taken and its before/after photo evidence —
            # is locked against tampering, mirroring NCR's
            # _LOCKED_QUALITY_FIELDS pattern (ncr_service.py). Unlike NOI,
            # WorkflowEngine's OBS transitions (core/utils.py) define
            # "Closed": ["Open", "Void"] — a real reopen path — so this can't
            # be an unconditional whole-record lock like NOI's. The escape
            # hatch here is simpler than NCR's: OBS already has a real
            # Closed->Open transition, so a save that explicitly reopens the
            # record (changes status away from Closed) is exempted outright,
            # rather than needing NCR's narrow single-field carve-out.
            _LOCKED_OBS_FIELDS = {'productDisposition', 'defectPhotos', 'improvementPhotos'}
            is_already_closed = db_obs.status == 'Closed'
            is_reopening = is_already_closed and d.get('status') not in (None, 'Closed')

            if is_already_closed and not is_reopening:
                changed_locked = {
                    f for f in (_LOCKED_OBS_FIELDS & set(d.keys()))
                    if d[f] != getattr(db_obs, f, None)
                }
                if changed_locked:
                    raise ValueError("Cannot modify improvement/photo evidence on a Closed observation")

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            updated = self.repo.update(db_obs, d)

            log_audit(
                self.repo.db, "UPDATE", "OBS", obs_id, updated.documentNumber,
                old_value=old_val, new_value=obs_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating OBS {obs_id}: {e}", exc_info=True)
            raise e

    def delete_obs(self, obs_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete an OBS with audit logging"""
        try:
            db_obs = self.repo.get_by_id(obs_id)
            if not db_obs or not record_in_scope(db_obs, scope):
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
