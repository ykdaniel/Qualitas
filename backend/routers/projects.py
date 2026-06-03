from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from database import get_db
from core.security import get_current_user
from core.scope import Scope, get_scope
from repositories.project_repository import ProjectRepository
from services.project_service import ProjectService

# Every route requires a valid access token. Routes that mutate state
# (create/update/delete) further require admin role.
router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    responses={404: {"description": "Not found"}},
    dependencies=[Depends(get_current_user)],
)


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(ProjectRepository(db))


def _require_admin(current_user=Depends(get_current_user)):
    role_name = getattr(getattr(current_user, "role", None), "name", None) or getattr(current_user, "role_name", None)
    if role_name not in ("admin", "Admin", "ADMIN", "system_admin"):
        raise HTTPException(status_code=403, detail="Admin role required")
    return current_user


@router.get("/", response_model=list[schemas.Project])
def read_projects(
    skip: int = 0,
    limit: int = 200,
    service: ProjectService = Depends(get_project_service),
    scope: Scope = Depends(get_scope),
):
    return service.get_projects(skip=skip, limit=limit, scope=scope)


@router.get("/{project_id}", response_model=schemas.Project)
def read_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
    scope: Scope = Depends(get_scope),
):
    proj = service.get_project(project_id)
    if proj is None:
        raise HTTPException(status_code=404, detail="Project not found")
    # Scoped users may only see their own projects.
    if scope.project_ids is not None and proj.id not in scope.project_ids:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


@router.post("/", response_model=schemas.Project)
def create_project(
    project: schemas.ProjectCreate,
    service: ProjectService = Depends(get_project_service),
    _admin=Depends(_require_admin),
):
    return service.create_project(project)


@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: str,
    project: schemas.ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
    _admin=Depends(_require_admin),
):
    updated = service.update_project(project_id, project)
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
    _admin=Depends(_require_admin),
):
    deleted = service.delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}
