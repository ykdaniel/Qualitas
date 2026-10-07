"""
PQP (Pre-Qualification Package) Service

Business logic layer for PQP module
"""

import uuid
import logging
from datetime import datetime
from typing import List, Optional

import models
import schemas
from repositories.pqp_repository import PQPRepository
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


class PQPService:
    """Service layer for PQP business logic"""

    def __init__(self, repo: PQPRepository):
        self.repo = repo

    @staticmethod
    def _normalize_pqp_status(status: str | None) -> str | None:
        """Normalize legacy/new PQP statuses into canonical values."""
        if status is None:
            return None
        normalized = str(status).strip().lower()
        mapping = {
            "draft": "Not Submit",
            "not submit": "Not Submit",
            "not submitted": "Not Submit",
            "pending": "Under Review",
            "under review": "Under Review",
            "revise & resubmit": "Revise & Resubmit",
            "rejected": "Reject",
            "reject": "Reject",
            "approved": "Approved",
            "void": "Void",
        }
        return mapping.get(normalized, status)

    def get_pqps(self, skip: int = 0, limit: int = 500, scope=None, **filters) -> List[models.PQP]:
        """Get list of PQPs with optional filters"""
        if filters.get("status") is not None:
            filters["status"] = self._normalize_pqp_status(filters.get("status"))
        return self.repo.get_all(skip, limit, scope=scope, **filters)

    def get_pqp(self, pqp_id: str, scope=None) -> Optional[models.PQP]:
        """Get a single PQP by ID"""
        obj = self.repo.get_by_id(pqp_id)
        return obj if record_in_scope(obj, scope) else None

    def create_pqp(self, pqp_create: schemas.PQPCreate,
                   user_id: int = None, username: str = None, scope=None) -> models.PQP:
        """Create a new PQP with business logic validation"""
        try:
            data = _json_serialize(pqp_create.model_dump(), ['attachments'])
            data['status'] = self._normalize_pqp_status(data.get('status')) or "Not Submit"

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            # P0 data isolation: confine the new record to the caller's scope
            # (forces vendor_id for contractor users; validates project_id).
            enforce_create_scope(data, scope)

            begin_write_transaction(self.repo.db)

            if not data.get('pqpNo'):
                data['pqpNo'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'PQP'
                )

            db_pqp = models.PQP(**data)
            if not db_pqp.id:
                db_pqp.id = str(uuid.uuid4())

            created = self.repo.create(db_pqp, commit=False)

            log_audit(
                self.repo.db, "CREATE", "PQP", created.id, created.pqpNo,
                new_value=pqp_create.model_dump(), user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating PQP: {e}", exc_info=True)
            raise e

    def update_pqp(self, pqp_id: str, pqp_update: schemas.PQPUpdate,
                   user_id: int = None, username: str = None, scope=None) -> Optional[models.PQP]:
        """Update an existing PQP with validation"""
        try:
            db_pqp = self.repo.get_by_id(pqp_id)
            if not db_pqp or not record_in_scope(db_pqp, scope):
                return None

            if pqp_update.status and not WorkflowEngine.validate_transition(
                "PQP",
                self._normalize_pqp_status(db_pqp.status) or db_pqp.status,
                self._normalize_pqp_status(pqp_update.status) or pqp_update.status,
            ):
                raise ValueError(
                    f"Invalid status transition from {db_pqp.status} to {pqp_update.status}"
                )

            old_val = {c.name: getattr(db_pqp, c.name) for c in db_pqp.__table__.columns}
            d = _json_serialize(pqp_update.model_dump(exclude_unset=True), ['attachments'])
            if 'status' in d:
                d['status'] = self._normalize_pqp_status(d.get('status'))

            # Guard: once Approved, the document itself is locked — revisions
            # must go through publish_pqp (which snapshots history), not a
            # silent swap via plain update. Mirrors OBS's reopen-aware
            # _LOCKED_OBS_FIELDS pattern (obs_service.py): WorkflowEngine's
            # "Approved": ["Under Review", "Void"] is a real reopen path, so
            # this can't be an unconditional lock like NOI's — a save that
            # explicitly sends the PQP back to Under Review is exempted.
            _LOCKED_PQP_FIELDS = {'title', 'description', 'version', 'attachments'}
            is_already_approved = self._normalize_pqp_status(db_pqp.status) == 'Approved'
            is_reopening = is_already_approved and d.get('status') not in (None, 'Approved')

            if is_already_approved and not is_reopening:
                changed_locked = {
                    f for f in (_LOCKED_PQP_FIELDS & set(d.keys()))
                    if d[f] != getattr(db_pqp, f, None)
                }
                if changed_locked:
                    raise ValueError(
                        "Cannot modify document content on an Approved PQP — "
                        "use Publish to create a new revision instead."
                    )

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            enforce_update_scope(d, scope)

            updated = self.repo.update(db_pqp, d, commit=False)

            log_audit(
                self.repo.db, "UPDATE", "PQP", pqp_id, updated.pqpNo,
                old_value=old_val, new_value=pqp_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return updated
        except ValueError as e:
            self.repo.db.rollback()
            raise e
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating PQP {pqp_id}: {e}", exc_info=True)
            raise e

    def publish_pqp(self, pqp_id: str, change_summary: str = None,
                    user_id: int = None, username: str = None, scope=None) -> Optional[models.PQP]:
        """Publish a new revision: snapshot current version to history, then bump version"""
        try:
            db_pqp = self.repo.get_by_id(pqp_id)
            if not db_pqp or not record_in_scope(db_pqp, scope):
                return None

            # Determine next version_no
            existing_history = (self.repo.db.query(models.PQPHistory)
                                .filter(models.PQPHistory.pqp_id == pqp_id)
                                .count())
            next_version_no = existing_history + 1

            # Snapshot current state into history
            snapshot = models.PQPHistory(
                id=str(uuid.uuid4()),
                pqp_id=pqp_id,
                version=db_pqp.version or "Rev1.0",
                version_no=next_version_no,
                title=db_pqp.title,
                description=db_pqp.description,
                status=db_pqp.status,
                vendor_id=db_pqp.vendor_id,
                change_summary=change_summary,
                created_at=datetime.now().isoformat(),
            )
            self.repo.db.add(snapshot)

            # Bump version on the PQP record
            previous_status = db_pqp.status
            current_version = db_pqp.version or "Rev1.0"
            import re
            rev_match = re.match(r'^Rev(\d+)\.(\d+)$', current_version)
            if rev_match:
                major = int(rev_match.group(1))
                new_version = f"Rev{major + 1}.0"
            else:
                new_version = f"{current_version} (Rev)"

            update_data = {
                'version': new_version,
                'status': 'Approved',
                'updatedAt': datetime.now().strftime('%Y-%m-%d'),
            }
            updated = self.repo.update(db_pqp, update_data, commit=False)

            log_audit(
                self.repo.db, "PUBLISH", "PQP", pqp_id, updated.pqpNo,
                old_value={"version": current_version, "status": previous_status},
                new_value={"version": new_version, "status": "Approved"},
                user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return updated
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error publishing PQP {pqp_id}: {e}", exc_info=True)
            raise e

    def get_history(self, pqp_id: str) -> List[models.PQPHistory]:
        """Get version history for a PQP"""
        return (self.repo.db.query(models.PQPHistory)
                .filter(models.PQPHistory.pqp_id == pqp_id)
                .order_by(models.PQPHistory.version_no.desc())
                .all())

    def delete_pqp(self, pqp_id: str, user_id: int = None, username: str = None, scope=None) -> bool:
        """Delete a PQP with audit logging"""
        try:
            db_pqp = self.repo.get_by_id(pqp_id)
            if not db_pqp or not record_in_scope(db_pqp, scope):
                return False

            old_val = {c.name: getattr(db_pqp, c.name) for c in db_pqp.__table__.columns}

            # Clean up owned history snapshots. PQPHistory.pqp_id declares
            # ondelete="CASCADE" and the ORM relationship declares
            # cascade="all, delete-orphan", but SQLite's FK enforcement is
            # off (PRAGMA foreign_keys never set) so neither actually
            # fires — without this, every history row would be left
            # orphaned, pqp_id pointing at a deleted PQP.
            self.repo.db.query(models.PQPHistory).filter(
                models.PQPHistory.pqp_id == pqp_id
            ).delete()

            self.repo.delete(db_pqp, commit=False)

            log_audit(
                self.repo.db, "DELETE", "PQP", pqp_id, db_pqp.pqpNo,
                old_value=old_val, user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting PQP {pqp_id}: {e}", exc_info=True)
            raise e
