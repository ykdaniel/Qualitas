from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import schemas
from database import get_db
from core.dependencies import RoleChecker
from core.perms import CONTRACTOR_MANAGE
from core.security import get_current_user
from core.scope import Scope, get_scope
from repositories.project_repository import ProjectRepository
from services.project_service import ProjectService

# Every route requires a valid access token. Routes that mutate state (create/update/delete)
# further require contractors:manage:all — the same permission code routers/contractors.py already
# uses for its own create/update/delete (core/dependencies.py::RoleChecker), NOT a role-name check.
# Previously this router had its own `_require_admin` dependency that checked
# role.name in ("admin", "Admin", "ADMIN", "system_admin") — a real bypass: renaming a role away
# from one of those four literal strings silently revoked write access regardless of its actual
# permissions, and conversely a role literally named "Admin" could write here even without
# contractors:manage:all (or without ANY permissions at all). No new permission code introduced —
# CONTRACTOR_MANAGE already existed and is already the exact permission the Projects tab's own
# "Add Project" button checks via hasPermission('contractors:manage:all') in
# react-app/src/components/Contractors/Contractors.tsx; the backend simply did not check the same
# thing.
router = APIRouter(
    prefix="/projects",
    tags=["projects"],
    responses={404: {"description": "Not found"}},
    dependencies=[Depends(get_current_user)],
)


def get_project_service(db: Session = Depends(get_db)) -> ProjectService:
    return ProjectService(ProjectRepository(db))


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
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE)),
):
    return service.create_project(project, user_id=current_user.id, username=current_user.username)


@router.put("/{project_id}", response_model=schemas.Project)
def update_project(
    project_id: str,
    project: schemas.ProjectUpdate,
    service: ProjectService = Depends(get_project_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE)),
):
    updated = service.update_project(project_id, project, user_id=current_user.id, username=current_user.username)
    if updated is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return updated


@router.delete("/{project_id}")
def delete_project(
    project_id: str,
    service: ProjectService = Depends(get_project_service),
    current_user: schemas.User = Depends(RoleChecker(CONTRACTOR_MANAGE)),
):
    deleted = service.delete_project(project_id, user_id=current_user.id, username=current_user.username)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}
