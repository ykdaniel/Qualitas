"""
Audit Service

Business logic layer for Audit module
"""

import json
import logging
import uuid
from typing import List, Optional

import models
import schemas
from repositories.audit_repository import AuditRepository
from core.utils import generate_reference_no, WorkflowEngine
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class AuditService:
    """Service layer for Audit business logic"""

    def __init__(self, repo: AuditRepository):
        self.repo = repo

    def get_audits(self, skip: int = 0, limit: int = 100) -> List[models.Audit]:
        """
        Get list of Audits

        Args:
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of Audit objects
        """
        return self.repo.get_all(skip, limit)

    def get_audit(self, audit_id: str) -> Optional[models.Audit]:
        """
        Get a single Audit by ID

        Args:
            audit_id: Audit identifier

        Returns:
            Audit object if found, None otherwise
        """
        return self.repo.get_by_id(audit_id)

    def create_audit(
        self,
        audit: schemas.AuditCreate,
        user_id: Optional[int] = None,
        username: Optional[str] = None
    ) -> models.Audit:
        """
        Create a new Audit

        Args:
            audit: Audit creation schema
            user_id: User ID performing the action
            username: Username performing the action

        Returns:
            Created Audit object
        """
        # Resolve vendor_id from contractor name
        vendor_id = self._resolve_vendor_id(audit.contractor)

        # Always auto-generate auditNo server-side (ignore any value from frontend)
        audit_no = generate_reference_no(
            self.repo.db, audit.contractor or '', 'audit'
        )

        # Start from the full schema dump so that future fields flow through
        # automatically instead of silently being dropped by a hand-maintained
        # field list. Then stamp the server-controlled fields on top.
        audit_data = audit.model_dump()
        audit_data["id"] = audit_data.get("id") or str(uuid.uuid4())
        audit_data["auditNo"] = audit_no
        audit_data["vendor_id"] = vendor_id
        for json_field in ("selected_templates", "custom_check_items"):
            value = audit_data.get(json_field)
            if isinstance(value, list):
                audit_data[json_field] = json.dumps(value)

        # Create audit record
        db_audit = self.repo.create(audit_data)

        # Log the creation
        self._log_audit(
            action="CREATE",
            entity_type="Audit",
            entity_id=db_audit.id,
            entity_no=db_audit.auditNo,
            new_value=audit_data,
            user_id=user_id,
            username=username
        )

        self.repo.db.commit()
        self.repo.db.refresh(db_audit)
        return db_audit

    def update_audit(
        self,
        audit_id: str,
        audit: schemas.AuditUpdate,
        user_id: Optional[int] = None,
        username: Optional[str] = None
    ) -> Optional[models.Audit]:
        """
        Update an existing Audit

        Args:
            audit_id: Audit identifier
            audit: Audit update schema
            user_id: User ID performing the action
            username: Username performing the action

        Returns:
            Updated Audit object if found, None otherwise
        """
        db_audit = self.repo.get_by_id(audit_id)
        if not db_audit:
            return None

        # Validate status transition if status is being changed
        update_data = audit.model_dump(exclude_unset=True)
        if 'status' in update_data and update_data['status'] != db_audit.status:
            if not WorkflowEngine.validate_transition("Audit", db_audit.status, update_data['status']):
                raise ValueError(
                    f"Invalid status transition from '{db_audit.status}' to '{update_data['status']}'"
                )

        # Store old values for audit log
        old_value = {c.name: getattr(db_audit, c.name) for c in db_audit.__table__.columns}
        processed_data = {}

        for key, value in update_data.items():
            if key in ["selected_templates", "custom_check_items"]:
                processed_data[key] = json.dumps(value) if isinstance(value, list) else value
            else:
                processed_data[key] = value

        # Re-resolve vendor_id if contractor changed
        if "contractor" in update_data:
            processed_data["vendor_id"] = self._resolve_vendor_id(update_data["contractor"])

            # Only regenerate auditNo if the record has no auditNo yet
            # (initial assignment when a contractor is first set, not on contractor changes)
            new_contractor = update_data["contractor"]
            if new_contractor and not db_audit.auditNo:
                processed_data["auditNo"] = generate_reference_no(
                    self.repo.db, new_contractor, 'audit'
                )
                logger.info(f"Assigned new auditNo {processed_data['auditNo']} (first contractor assignment)")

        # Update the audit
        updated_audit = self.repo.update(audit_id, processed_data)

        # Log the update
        self._log_audit(
            action="UPDATE",
            entity_type="Audit",
            entity_id=audit_id,
            entity_no=db_audit.auditNo,
            old_value=old_value,
            new_value=update_data,
            user_id=user_id,
            username=username
        )

        self.repo.db.commit()
        self.repo.db.refresh(updated_audit)
        return updated_audit

    def delete_audit(
        self,
        audit_id: str,
        user_id: Optional[int] = None,
        username: Optional[str] = None
    ) -> bool:
        """
        Delete an Audit

        Args:
            audit_id: Audit identifier
            user_id: User ID performing the action
            username: Username performing the action

        Returns:
            True if deleted, False if not found
        """
        db_audit = self.repo.get_by_id(audit_id)
        if not db_audit:
            return False

        # Log the deletion
        self._log_audit(
            action="DELETE",
            entity_type="Audit",
            entity_id=audit_id,
            entity_no=db_audit.auditNo,
            old_value={"id": audit_id, "auditNo": db_audit.auditNo},
            user_id=user_id,
            username=username
        )

        # Delete the audit
        success = self.repo.delete(audit_id)
        self.repo.db.commit()
        return success

    def _resolve_vendor_id(self, vendor_name: Optional[str]) -> Optional[str]:
        """
        Resolve vendor name to vendor ID

        Args:
            vendor_name: Contractor/vendor name

        Returns:
            Vendor ID if found, None otherwise
        """
        if not vendor_name:
            return None

        contractor = (
            self.repo.db.query(models.Contractor)
            .filter(models.Contractor.name == vendor_name)
            .first()
        )
        return contractor.id if contractor else None

    def _log_audit(
        self,
        action: str,
        entity_type: str,
        entity_id: str,
        entity_no: str,
        old_value=None,
        new_value=None,
        user_id: Optional[int] = None,
        username: Optional[str] = None
    ):
        """
        Log audit trail

        Args:
            action: Action type (CREATE, UPDATE, DELETE)
            entity_type: Type of entity (e.g., "Audit")
            entity_id: Entity identifier
            entity_no: Entity number (e.g., audit number)
            old_value: Old value (for UPDATE/DELETE)
            new_value: New value (for CREATE/UPDATE)
            user_id: User ID performing the action
            username: Username performing the action
        """
        from datetime import datetime

        audit_log = models.AuditLog(
            timestamp=datetime.now().isoformat(),
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_no,
            old_value=json.dumps(old_value) if old_value else None,
            new_value=json.dumps(new_value) if new_value else None,
            user_id=user_id,
            username=username
        )
        self.repo.db.add(audit_log)
        self.repo.db.flush()
