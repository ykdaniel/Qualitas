"""
Project Repository

Data access layer for Project module
"""

from typing import List, Optional
from sqlalchemy.orm import Session

import models


class ProjectRepository:
    """Repository for Project data access operations"""

    def __init__(self, db: Session):
        self.db = db

    def get_by_id(self, project_id: str) -> Optional[models.Project]:
        return self.db.query(models.Project).filter(models.Project.id == project_id).first()

    def get_all(self, skip: int = 0, limit: int = 200) -> List[models.Project]:
        return self.db.query(models.Project).order_by(models.Project.name).offset(skip).limit(limit).all()

    def create(self, project: models.Project) -> models.Project:
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def update(self, project: models.Project, update_data: dict) -> models.Project:
        for key, value in update_data.items():
            setattr(project, key, value)
        self.db.commit()
        self.db.refresh(project)
        return project

    def delete(self, project: models.Project):
        self.db.delete(project)
        self.db.commit()
