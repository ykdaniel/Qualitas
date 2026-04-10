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

logger = logging.getLogger(__name__)


class ProjectService:
    """Service layer for Project business logic"""

    def __init__(self, repo: ProjectRepository):
        self.repo = repo

    def get_projects(self, skip: int = 0, limit: int = 200) -> List[models.Project]:
        return self.repo.get_all(skip, limit)

    def get_project(self, project_id: str) -> Optional[models.Project]:
        return self.repo.get_by_id(project_id)

    def create_project(self, project_create: schemas.ProjectCreate) -> models.Project:
        try:
            data = project_create.model_dump()
            if not data.get("id"):
                data["id"] = str(uuid.uuid4())
            data["created_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            db_project = models.Project(**data)
            return self.repo.create(db_project)
        except Exception as e:
            logger.error(f"Error creating Project: {e}", exc_info=True)
            raise e

    def update_project(self, project_id: str, project_update: schemas.ProjectUpdate) -> Optional[models.Project]:
        try:
            db_project = self.repo.get_by_id(project_id)
            if not db_project:
                return None
            update_data = project_update.model_dump(exclude_unset=True)
            return self.repo.update(db_project, update_data)
        except Exception as e:
            logger.error(f"Error updating Project {project_id}: {e}", exc_info=True)
            raise e

    def delete_project(self, project_id: str) -> bool:
        try:
            db_project = self.repo.get_by_id(project_id)
            if not db_project:
                return False
            self.repo.delete(db_project)
            return True
        except Exception as e:
            logger.error(f"Error deleting Project {project_id}: {e}", exc_info=True)
            raise e
