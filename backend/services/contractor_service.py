"""
Contractor Service

Business logic layer for Contractor module
"""

import uuid
import logging
from typing import List, Optional

from sqlalchemy.exc import IntegrityError

import models
import schemas
from repositories.contractor_repository import ContractorRepository
from core.utils import log_audit
from core import error_messages
from core import validators

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

    def get_contractor_options(self, scope=None) -> List[models.Contractor]:
        """
        Contractors for every module's pickers, filters and lists (GET /contractors/options), ordered by name.

        The full list (contact details) stays behind contractors:view:all; this one is for any signed-in user — before,
        roles holding only module permissions got an empty contractor picker everywhere. A contractor-scoped caller only
        gets its own contractor (the one enforce_create_scope forces on its records).
        """
        query = self.repo.db.query(models.Contractor)
        if scope is not None and scope.vendor_id is not None:
            query = query.filter(models.Contractor.id == scope.vendor_id)
        return query.order_by(models.Contractor.name).all()

    def get_contractor_contact(self, contractor_id: str, scope=None) -> Optional[models.Contractor]:
        """
        One contractor's contact details for the NOI form's auto-fill. None when it does not exist or is outside a
        contractor-scoped caller's own contractor.
        """
        if scope is not None and scope.vendor_id is not None and contractor_id != scope.vendor_id:
            return None
        return self.repo.db.query(models.Contractor).filter(models.Contractor.id == contractor_id).first()

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
            db_contractor = models.Contractor(**contractor_create.model_dump())
            if not db_contractor.id:
                db_contractor.id = str(uuid.uuid4())

            # Save to database
            created = self.repo.create(db_contractor, commit=False)

            # Log audit trail
            log_audit(
                self.repo.db, "CREATE", "Contractor", created.id, created.name,
                new_value=contractor_create.model_dump(), user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
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
            d = contractor_update.model_dump(exclude_unset=True)

            # Update the record
            updated = self.repo.update(db_contractor, d, commit=False)

            # Log audit trail
            log_audit(
                self.repo.db, "UPDATE", "Contractor", contractor_id, updated.name,
                old_value=old_val, new_value=contractor_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return updated
        except Exception as e:
            self.repo.db.rollback()
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
            validators.check_contractor_references(self.repo.db, contractor_id, db_contractor.name)
            # A company that still has people on its list is not deleted (CONTRACTOR-PERSONNEL-2026-001): meetings refer to
            # them. Set the contractor inactive instead.
            people = self.repo.db.query(models.ContractorPersonnel).filter(
                models.ContractorPersonnel.contractor_id == contractor_id).count()
            if people:
                raise ValueError(f"Contractor '{db_contractor.name}' has {people} people on its personnel list. "
                                 "Set it inactive instead of deleting it.")

            # Capture old values for audit
            old_val = {c.name: getattr(db_contractor, c.name) for c in db_contractor.__table__.columns}

            # Delete the record
            self.repo.delete(db_contractor, commit=False)

            # Log audit trail
            log_audit(
                self.repo.db, "DELETE", "Contractor", contractor_id, db_contractor.name,
                old_value=old_val, user_id=user_id, username=username, strict=True
            )

            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting Contractor {contractor_id}: {e}", exc_info=True)
            raise e

    # ── Personnel (CONTRACTOR-PERSONNEL-2026-001) ──
    # A contractor-scoped caller only ever sees or changes its own company's people; anything else reads as not found.

    def _company_in_scope(self, contractor_id: str, scope=None) -> Optional[models.Contractor]:
        if scope is not None and scope.vendor_id is not None and contractor_id != scope.vendor_id:
            return None
        return self.repo.get_by_id(contractor_id)

    def list_personnel(self, contractor_id: str, include_inactive: bool = False, scope=None):
        """A company's list for the Contractors page; None when the company does not exist or is out of scope."""
        if not self._company_in_scope(contractor_id, scope):
            return None
        query = self.repo.db.query(models.ContractorPersonnel).filter(models.ContractorPersonnel.contractor_id == contractor_id)
        if not include_inactive:
            query = query.filter(models.ContractorPersonnel.is_active == True)  # noqa: E712
        return query.order_by(models.ContractorPersonnel.is_active.desc(), models.ContractorPersonnel.name).all()

    def personnel_options(self, contractor_id: Optional[str] = None, scope=None) -> List[models.ContractorPersonnel]:
        """Active people for the meeting attendee picker (any signed-in user), one company or all within scope."""
        query = self.repo.db.query(models.ContractorPersonnel).filter(models.ContractorPersonnel.is_active == True)  # noqa: E712
        if scope is not None and scope.vendor_id is not None:
            if contractor_id and contractor_id != scope.vendor_id:
                return []
            query = query.filter(models.ContractorPersonnel.contractor_id == scope.vendor_id)
        if contractor_id:
            query = query.filter(models.ContractorPersonnel.contractor_id == contractor_id)
        return query.order_by(models.ContractorPersonnel.name).all()

    def _check_unique_name(self, contractor_id: str, name: str, exclude_id: Optional[str] = None):
        same = self.repo.db.query(models.ContractorPersonnel).filter(
            models.ContractorPersonnel.contractor_id == contractor_id).all()
        if any(p.id != exclude_id and (p.name or '').strip().lower() == name.strip().lower() for p in same):
            raise ValueError(f"'{name}' is already on this company's personnel list.")

    def create_personnel(self, contractor_id: str, data: schemas.ContractorPersonnelCreate, user_id: int = None,
                         username: str = None, scope=None):
        """None when the company does not exist or is out of scope; ValueError for a name already on the list."""
        from datetime import datetime
        company = self._company_in_scope(contractor_id, scope)
        if not company:
            return None
        self._check_unique_name(contractor_id, data.name)
        now = datetime.now().isoformat(timespec="seconds")
        person = models.ContractorPersonnel(
            id=str(uuid.uuid4()), contractor_id=contractor_id, name=data.name.strip(),
            position=(data.position or '').strip() or None, email=(data.email or '').strip() or None,
            phone=(data.phone or '').strip() or None, is_active=True, created_at=now, updated_at=now)
        try:
            self.repo.db.add(person)
            try:
                self.repo.db.flush()
            except IntegrityError:          # the same name added at the same moment by someone else
                raise ValueError(f"'{data.name.strip()}' is already on this company's personnel list.")
            log_audit(self.repo.db, "CREATE", "ContractorPersonnel", person.id, f"{company.name} / {person.name}",
                      new_value={"contractor_id": contractor_id, "name": person.name, "position": person.position},
                      user_id=user_id, username=username, strict=True)
            self.repo.db.commit()
            self.repo.db.refresh(person)
            return person
        except Exception:
            self.repo.db.rollback()
            raise

    def update_personnel(self, personnel_id: str, data: schemas.ContractorPersonnelUpdate, user_id: int = None,
                         username: str = None, scope=None):
        """Name / position / contact, or is_active (deactivate / reactivate — there is no delete). None when not found
        or out of scope."""
        from datetime import datetime
        person = self.repo.db.query(models.ContractorPersonnel).filter(models.ContractorPersonnel.id == personnel_id).first()
        if not person or not self._company_in_scope(person.contractor_id, scope):
            return None
        patch = data.model_dump(exclude_unset=True)
        if patch.get('name') is not None:
            self._check_unique_name(person.contractor_id, patch['name'], exclude_id=person.id)
        old = {k: getattr(person, k) for k in ('name', 'position', 'email', 'phone', 'is_active')}
        for key, value in patch.items():
            if key == 'is_active':
                if value is not None:
                    person.is_active = bool(value)
            elif key == 'name':
                if value is not None:
                    person.name = value.strip()
            else:
                setattr(person, key, (value or '').strip() or None)
        person.updated_at = datetime.now().isoformat(timespec="seconds")
        try:
            try:
                self.repo.db.flush()
            except IntegrityError:
                raise ValueError(f"'{person.name}' is already on this company's personnel list.")
            log_audit(self.repo.db, "UPDATE", "ContractorPersonnel", person.id, person.name, old_value=old,
                      new_value={k: getattr(person, k) for k in old}, user_id=user_id, username=username, strict=True)
            self.repo.db.commit()
            self.repo.db.refresh(person)
            return person
        except Exception:
            self.repo.db.rollback()
            raise
