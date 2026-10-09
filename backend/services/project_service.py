"""
Project Service

Business logic layer for Project module
"""

import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

import models
import schemas
from repositories.project_repository import ProjectRepository
from core import validators
from core.utils import log_audit

logger = logging.getLogger(__name__)


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
            if not data.get("id"):
                data["id"] = str(uuid.uuid4())
            data["created_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            db_project = models.Project(**data)
            created = self.repo.create(db_project, commit=False)
            log_audit(
                self.repo.db, "CREATE", "Project", created.id, created.name,
                new_value=project_create.model_dump(), user_id=user_id, username=username, strict=True,
            )
            self.repo.db.commit()
            return created
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error creating Project: {e}", exc_info=True)
            raise e

    def update_project(self, project_id: str, project_update: schemas.ProjectUpdate, user_id: int = None, username: str = None) -> Optional[models.Project]:
        try:
            db_project = self.repo.get_by_id(project_id)
            if not db_project:
                return None
            old_val = {c.name: getattr(db_project, c.name) for c in db_project.__table__.columns}
            update_data = project_update.model_dump(exclude_unset=True)
            updated = self.repo.update(db_project, update_data, commit=False)
            log_audit(
                self.repo.db, "UPDATE", "Project", project_id, updated.name,
                old_value=old_val, new_value=project_update.model_dump(exclude_unset=True),
                user_id=user_id, username=username, strict=True,
            )
            self.repo.db.commit()
            return updated
        except Exception as e:
            self.repo.db.rollback()
            logger.error(f"Error updating Project {project_id}: {e}", exc_info=True)
            raise e

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
