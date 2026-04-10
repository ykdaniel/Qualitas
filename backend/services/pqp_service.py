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
from core.utils import (
    _resolve_vendor_id,
    generate_reference_no,
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

    def get_pqps(self, skip: int = 0, limit: int = 500, **filters) -> List[models.PQP]:
        """Get list of PQPs with optional filters"""
        if filters.get("status") is not None:
            filters["status"] = self._normalize_pqp_status(filters.get("status"))
        return self.repo.get_all(skip, limit, **filters)

    def get_pqp(self, pqp_id: str) -> Optional[models.PQP]:
        """Get a single PQP by ID"""
        return self.repo.get_by_id(pqp_id)

    def create_pqp(self, pqp_create: schemas.PQPCreate,
                   user_id: int = None, username: str = None) -> models.PQP:
        """Create a new PQP with business logic validation"""
        try:
            data = pqp_create.model_dump()
            # Attachments are managed via the centralized attachments table;
            # don't store them redundantly in the PQP row.
            data.pop('attachments', None)
            data['status'] = self._normalize_pqp_status(data.get('status')) or "Not Submit"

            vendor_name = data.pop('vendor', None)
            if vendor_name:
                data['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            if not data.get('pqpNo'):
                data['pqpNo'] = generate_reference_no(
                    self.repo.db, vendor_name or '', 'PQP'
                )

            db_pqp = models.PQP(**data)
            if not db_pqp.id:
                db_pqp.id = str(uuid.uuid4())

            created = self.repo.create(db_pqp)

            log_audit(
                self.repo.db, "CREATE", "PQP", created.id, created.pqpNo,
                new_value=pqp_create.model_dump(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating PQP: {e}", exc_info=True)
            raise e

    def update_pqp(self, pqp_id: str, pqp_update: schemas.PQPUpdate,
                   user_id: int = None, username: str = None) -> Optional[models.PQP]:
        """Update an existing PQP with validation"""
        try:
            db_pqp = self.repo.get_by_id(pqp_id)
            if not db_pqp:
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
            d = pqp_update.model_dump(exclude_unset=True)
            # Attachments are managed via the centralized attachments table
            d.pop('attachments', None)
            if 'status' in d:
                d['status'] = self._normalize_pqp_status(d.get('status'))

            if 'vendor' in d:
                vendor_name = d.pop('vendor')
                d['vendor_id'] = _resolve_vendor_id(self.repo.db, vendor_name)

            updated = self.repo.update(db_pqp, d)

            log_audit(
                self.repo.db, "UPDATE", "PQP", pqp_id, updated.pqpNo,
                old_value=old_val, new_value=pqp_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except ValueError as e:
            raise e
        except Exception as e:
            logger.error(f"Error updating PQP {pqp_id}: {e}", exc_info=True)
            raise e

    def publish_pqp(self, pqp_id: str, change_summary: str = None,
                    user_id: int = None, username: str = None) -> Optional[models.PQP]:
        """Publish a new revision: snapshot current version to history, then bump version"""
        try:
            db_pqp = self.repo.get_by_id(pqp_id)
            if not db_pqp:
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
            updated = self.repo.update(db_pqp, update_data)

            log_audit(
                self.repo.db, "PUBLISH", "PQP", pqp_id, updated.pqpNo,
                old_value={"version": current_version, "status": db_pqp.status},
                new_value={"version": new_version, "status": "Approved"},
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error publishing PQP {pqp_id}: {e}", exc_info=True)
            raise e

    def get_history(self, pqp_id: str) -> List[models.PQPHistory]:
        """Get version history for a PQP"""
        return (self.repo.db.query(models.PQPHistory)
                .filter(models.PQPHistory.pqp_id == pqp_id)
                .order_by(models.PQPHistory.version_no.desc())
                .all())

    def delete_pqp(self, pqp_id: str, user_id: int = None, username: str = None) -> bool:
        """Delete a PQP with audit logging"""
        try:
            db_pqp = self.repo.get_by_id(pqp_id)
            if not db_pqp:
                return False

            old_val = {c.name: getattr(db_pqp, c.name) for c in db_pqp.__table__.columns}
            self.repo.delete(db_pqp)

            log_audit(
                self.repo.db, "DELETE", "PQP", pqp_id, db_pqp.pqpNo,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting PQP {pqp_id}: {e}", exc_info=True)
            raise e
