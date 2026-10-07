"""
Project Repository

Data access layer for Project module
"""

from typing import List, Optional
from sqlalchemy.orm import Session

import models
from core.utils import sanitize_pagination


class ProjectRepository:
    """Repository for Project data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, project_id: str) -> Optional[models.Project]:
        return self.db.query(models.Project).filter(models.Project.id == project_id).first()

    def get_all(self, skip: int = 0, limit: int = 200, scope=None) -> List[models.Project]:
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.Project)
        # P0 data isolation: a scoped user only sees their own projects. The
        # Project's scope key is its own `id` (not a project_id column).
        if scope is not None and scope.project_ids is not None:
            query = query.filter(models.Project.id.in_(scope.project_ids))
        return query.order_by(models.Project.name).offset(skip).limit(limit).all()

    def create(self, project: models.Project, commit: bool = True) -> models.Project:
        self.db.add(project)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(project)
        return project

    def update(self, project: models.Project, update_data: dict, commit: bool = True) -> models.Project:
        for key, value in update_data.items():
            setattr(project, key, value)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(project)
        return project

    def delete(self, project: models.Project, commit: bool = True):
        self.db.delete(project)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
