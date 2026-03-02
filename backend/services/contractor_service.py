"""
Contractor Service

Business logic layer for Contractor module
"""

import uuid
import logging
from typing import List, Optional

import models
import schemas
from repositories.contractor_repository import ContractorRepository
from core.utils import log_audit

logger = logging.getLogger(__name__)


class ContractorService:
    """Service layer for Contractor business logic"""

    def __init__(self, repo: ContractorRepository):
        self.repo = repo

    def get_contractors(self, skip: int = 0, limit: int = 500) -> List[models.Contractor]:
        """
        Get list of Contractors

        Args:
            skip: Number of records to skip
            limit: Maximum number of records

        Returns:
            List of Contractor objects
        """
        return self.repo.get_all(skip, limit)

    def get_contractor(self, contractor_id: str) -> Optional[models.Contractor]:
        """
        Get a single Contractor by ID

        Args:
            contractor_id: Contractor identifier

        Returns:
            Contractor object if found, None otherwise
        """
        return self.repo.get_by_id(contractor_id)

    def create_contractor(self, contractor_create: schemas.ContractorCreate,
                         user_id: int = None, username: str = None) -> models.Contractor:
        """
        Create a new Contractor with audit logging

        Args:
            contractor_create: Contractor creation schema
            user_id: ID of user creating the Contractor
            username: Username of user creating the Contractor

        Returns:
            Created Contractor object

        Raises:
            Exception: If creation fails
        """
        try:
            # Create Contractor object
            db_contractor = models.Contractor(**contractor_create.dict())
            if not db_contractor.id:
                db_contractor.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_contractor)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "Contractor", created.id, created.name,
                new_value=contractor_create.dict(), user_id=user_id, username=username
            )

            return created
        except Exception as e:
            logger.error(f"Error creating Contractor: {e}", exc_info=True)
            raise e

    def update_contractor(self, contractor_id: str, contractor_update: schemas.ContractorUpdate,
                         user_id: int = None, username: str = None) -> Optional[models.Contractor]:
        """
        Update an existing Contractor with audit logging

        Args:
            contractor_id: Contractor identifier
            contractor_update: Contractor update schema
            user_id: ID of user updating the Contractor
            username: Username of user updating the Contractor

        Returns:
            Updated Contractor object if found, None otherwise

        Raises:
            Exception: If update fails
        """
        try:
            db_contractor = self.repo.get_by_id(contractor_id)
            if not db_contractor:
                return None

            # Capture old values for audit
            old_val = {c.name: getattr(db_contractor, c.name) for c in db_contractor.__table__.columns}

            # Prepare update data
            d = contractor_update.dict(exclude_unset=True)

            # Update the record
            updated = self.repo.update(db_contractor, d)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "Contractor", contractor_id, updated.name,
                old_value=old_val, new_value=contractor_update.dict(exclude_unset=True),
                user_id=user_id, username=username
            )

            return updated
        except Exception as e:
            logger.error(f"Error updating Contractor {contractor_id}: {e}", exc_info=True)
            raise e

    def delete_contractor(self, contractor_id: str, user_id: int = None, username: str = None) -> bool:
        """
        Delete a Contractor with audit logging

        Args:
            contractor_id: Contractor identifier
            user_id: ID of user deleting the Contractor
            username: Username of user deleting the Contractor

        Returns:
            True if deleted successfully, False if not found

        Raises:
            Exception: If deletion fails
        """
        try:
            db_contractor = self.repo.get_by_id(contractor_id)
            if not db_contractor:
                return False

            # Check for references before deletion
            references = []

            # Check ITP references
            itp_count = self.repo.db.query(models.ITP).filter(models.ITP.vendor_id == contractor_id).count()
            if itp_count > 0:
                references.append(f"{itp_count} ITP record(s)")

            # Check NCR references
            ncr_count = self.repo.db.query(models.NCR).filter(models.NCR.vendor_id == contractor_id).count()
            if ncr_count > 0:
                references.append(f"{ncr_count} NCR record(s)")

            # Check NOI references
            noi_count = self.repo.db.query(models.NOI).filter(models.NOI.vendor_id == contractor_id).count()
            if noi_count > 0:
                references.append(f"{noi_count} NOI record(s)")

            # Check ITR references
            itr_count = self.repo.db.query(models.ITR).filter(models.ITR.vendor_id == contractor_id).count()
            if itr_count > 0:
                references.append(f"{itr_count} ITR record(s)")

            # Check PQP references
            pqp_count = self.repo.db.query(models.PQP).filter(models.PQP.vendor_id == contractor_id).count()
            if pqp_count > 0:
                references.append(f"{pqp_count} PQP record(s)")

            # Check OBS references
            obs_count = self.repo.db.query(models.OBS).filter(models.OBS.vendor_id == contractor_id).count()
            if obs_count > 0:
                references.append(f"{obs_count} OBS record(s)")

            # Check FAT references
            fat_count = self.repo.db.query(models.FAT).filter(models.FAT.vendor_id == contractor_id).count()
            if fat_count > 0:
                references.append(f"{fat_count} FAT record(s)")

            # Check FollowUp references
            followup_count = self.repo.db.query(models.FollowUp).filter(models.FollowUp.vendor_id == contractor_id).count()
            if followup_count > 0:
                references.append(f"{followup_count} FollowUp record(s)")

            # Check Audit references
            audit_count = self.repo.db.query(models.Audit).filter(models.Audit.vendor_id == contractor_id).count()
            if audit_count > 0:
                references.append(f"{audit_count} Audit record(s)")

            if references:
                raise ValueError(f"Cannot delete contractor '{db_contractor.name}': referenced by {', '.join(references)}")

            # Capture old values for audit
            old_val = {c.name: getattr(db_contractor, c.name) for c in db_contractor.__table__.columns}

            # Delete the record
            self.repo.delete(db_contractor)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "Contractor", contractor_id, db_contractor.name,
                old_value=old_val, user_id=user_id, username=username
            )

            return True
        except Exception as e:
            logger.error(f"Error deleting Contractor {contractor_id}: {e}", exc_info=True)
            raise e
