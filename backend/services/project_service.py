"""
Project Service

Business logic layer for Project module
"""

import re
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

import models
import schemas
from repositories.project_repository import ProjectRepository
from core import validators
from core.constants import SHARED_CODE
from core.refusals import Refusal
from core.concurrency import claim_row_version
from core.utils import continue_counters_from_legacy_abbreviation, log_audit

logger = logging.getLogger(__name__)

PROJECT_CODE_RE = re.compile(r"[A-Z0-9]{2,8}")


def normalize_project_code(db, code, project_id: Optional[str] = None) -> str:
    """The project code as stored (REF-PROJECT-SEQ-2026-001 B3, D14): required, 2–8 letters or digits, upper case,
    unique (ignoring case), never the reserved SHARED_CODE ("STD", the number code of shared templates). Every
    document number of the project carries it, so a Refusal (400) names the problem."""
    value = (code or "").strip().upper()
    if not value:
        raise Refusal("PROJECT_CODE_REQUIRED", "A project code is required: every document number of the project carries it.")
    if not PROJECT_CODE_RE.fullmatch(value):
        raise Refusal("PROJECT_CODE_INVALID", f"Project code '{value}' must be 2 to 8 letters or digits.", projectCode=value)
    if value == SHARED_CODE:
        raise Refusal("PROJECT_CODE_RESERVED", f"Project code '{value}' is reserved for shared templates.", projectCode=value)
    clash = db.query(models.Project).filter(func.upper(func.trim(models.Project.code)) == value)   # as the unique index (step 28)
    if project_id is not None:
        clash = clash.filter(models.Project.id != project_id)
    if clash.first():
        raise Refusal("PROJECT_CODE_DUPLICATE", f"Project code '{value}' is already used by another project.", projectCode=value)
    return value


RESERVED_PROJECT_IDS = {SHARED_CODE}


def normalize_project_id(project_id) -> Optional[str]:
    """A client may name a new project's id (rehearsal scripts do). The id of the shared templates' counter
    (SHARED_CODE, "STD") is refused: a project with that id would share the counter key of every shared template
    (REF-PROJECT-SEQ-2026-001 B4, B3 R1 P3-10; decision D-B4-3: only the reserved id is refused, a chosen id stays
    allowed). Blank means "generate one"."""
    value = (project_id or "").strip()
    if value.upper() in RESERVED_PROJECT_IDS:
        raise Refusal("PROJECT_ID_RESERVED", f"Project id '{value}' is reserved for shared templates.", projectId=value)
    return value or None


def _code_clash(exc: Exception, code, name=None) -> Exception:
    """A create/update that lost a race for the same code hits the unique index (migration step 28): the same 400 as the
    check above, not a 500 (B3 R1 P3-4). The same for the project name (projects.name is unique; it used to answer 500 —
    REFUSAL-DIALOG-2026-003: 400 DUPLICATE_NAME). Any other error is returned unchanged."""
    if isinstance(exc, IntegrityError) and "ux_projects_code_upper" in str(exc):
        value = (code or "").strip().upper()
        return Refusal("PROJECT_CODE_DUPLICATE", f"Project code '{value}' is already used by another project.", projectCode=value)
    if isinstance(exc, IntegrityError) and ("UNIQUE constraint failed: projects.name" in str(exc) or "ix_projects_name" in str(exc)):
        return Refusal("DUPLICATE_NAME", f"A project named '{name}' already exists.", docType="project", name=name)
    return exc


class ProjectService:
    """Service layer for Project business logic"""

    def __init__(self, repo: ProjectRepository):
        self.repo = repo

    def get_projects(self, skip: int = 0, limit: int = 200, scope=None) -> List[models.Project]:
        return self.repo.get_all(skip, limit, scope=scope)

    def get_project(self, project_id: str) -> Optional[models.Project]:
        return self.repo.get_by_id(project_id)

    def create_project(self, project_create: schemas.ProjectCreate, user_id: int = None, username: str = None) -> models.Project:
        # 2026-09-23: this module never called log_audit at all — same class of gap as KM (not "audited but
        # lost", simply never audited). Same shared helper and one-commit shape as the other four modules
        # fixed this round: flush only, add the audit entry, commit once; any failure rolls both back.
        try:
            data = project_create.model_dump()
            data["code"] = normalize_project_code(self.repo.db, data.get("code"))
            data["id"] = normalize_project_id(data.get("id"))
            if not data.get("id"):
                data["id"] = str(uuid.uuid4())
            data["created_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            db_project = models.Project(**data)
            created = self.repo.create(db_project, commit=False)
            # a code equal to an old contractor abbreviation continues that abbreviation's numbering (B4, P3-9)
            continue_counters_from_legacy_abbreviation(self.repo.db, created.id, created.code)
            log_audit(
                self.repo.db, "CREATE", "Project", created.id, created.name,
                new_value=project_create.model_dump(), user_id=user_id, username=username, strict=True,
            )
            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating Project: {e}", exc_info=True)
            raise _code_clash(e, project_create.code, project_create.name)

    def update_project(self, project_id: str, project_update: schemas.ProjectUpdate, user_id: int = None, username: str = None) -> Optional[models.Project]:
        try:
            db_project = self.repo.get_by_id(project_id)
            if not db_project:
                return None
            # Optimistic lock (OPTIMISTIC-LOCK-2026-001): checked and incremented in one step (takes the write lock), re-read.
            claim_row_version(self.repo.db, db_project, project_update.row_version, doc_type="project",
                              number=db_project.name, refresh=True)
            old_val = {c.name: getattr(db_project, c.name) for c in db_project.__table__.columns}
            update_data = project_update.model_dump(exclude_unset=True)
            if "code" in update_data:
                # a code may change (the counter is keyed by project id, so numbering continues), but never to empty
                update_data["code"] = normalize_project_code(self.repo.db, update_data["code"], project_id)
            updated = self.repo.update(db_project, update_data, commit=False)
            if "code" in update_data and update_data["code"] != ((old_val.get("code") or "").strip().upper()):
                continue_counters_from_legacy_abbreviation(self.repo.db, project_id, updated.code)   # recoded (B4, P3-9)
            log_audit(
                self.repo.db, "UPDATE", "Project", project_id, updated.name,
                old_value=old_val, new_value=project_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True,
            )
            self.repo.db.commit()
            return updated
        except Refusal:
            self.repo.db.rollback()             # a refusal (VERSION_CONFLICT, PROJECT_CODE_*), not an error
            raise
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating Project {project_id}: {e}", exc_info=True)
            raise _code_clash(e, project_update.code, project_update.name)

    def delete_project(self, project_id: str, user_id: int = None, username: str = None) -> bool:
        try:
            db_project = self.repo.get_by_id(project_id)
            if not db_project:
                return False
            validators.check_project_references(self.repo.db, project_id, db_project.name)
            old_val = {c.name: getattr(db_project, c.name) for c in db_project.__table__.columns}

            # Clean up per-user access grants. UserProject.project_id
            # declares ondelete="CASCADE", but SQLite's FK enforcement is
            # off (PRAGMA foreign_keys never set) so it never actually
            # fires. Unlike the business records checked above, a grant
            # row is bookkeeping, not user work — deleting it is correct
            # cleanup, not silent data loss.
            self.repo.db.query(models.UserProject).filter(
                models.UserProject.project_id == project_id
            ).delete()

            self.repo.delete(db_project, commit=False)
            log_audit(
                self.repo.db, "DELETE", "Project", project_id, old_val.get("name"),
                old_value=old_val, user_id=user_id, username=username, strict=True,
            )
            self.repo.db.commit()
            return True
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error deleting Project {project_id}: {e}", exc_info=True)
            raise e
