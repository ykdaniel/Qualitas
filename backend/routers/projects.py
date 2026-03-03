from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from database import get_db
from repositories.project_repository import ProjectRepository
from services.project_service import ProjectService

router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    responses={404: {"description": "Not found"}},
)


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(ProjectRepository(db))


@router.get("/", response_model=list[schemas.Project])
def read_projects(
    skip: int = 0,
    limit: int = 200,
    service: ProjectService = Depends(get_project_service),
):
    return service.get_projects(skip=skip, limit=limit)


@router.get("/{project_id}", response_model=schemas.Project)
def read_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
):
    proj = service.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    service: ProjectService = Depends(get_project_service),
):
    return service.create_project(project)


@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: str,
    project: schemas.ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
):
    updated = service.update_project(project_id, project)
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
):
    deleted = service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}
