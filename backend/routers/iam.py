from fastapi import APIRouter, Depends, HTTPException
from passlib.context import CryptContext

import schemas
from core.dependencies import RoleChecker, get_user_service
from core.perms import ROLE_MANAGE, ROLE_VIEW, USER_MANAGE, USER_VIEW
from services.user_service import UserService

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """雜湊密碼"""
    return pwd_context.hash(password)

router = APIRouter(
    prefix="/iam",
    tags=["iam"],
    responses={404: {"description": "Not found"}},
)

def _require_role_manage_permission(current_user: "schemas.User") -> None:
    user_permissions = {p.code for p in current_user.role.permissions_rel}
    if ROLE_MANAGE not in user_permissions:
        raise HTTPException(
            status_code=403,
            detail=f"Operation not permitted. Required: {ROLE_MANAGE}",
        )

# === Users ===
@router.get("/users/", response_model=list[schemas.User])
def read_users(
    skip: int = 0,
    limit: int = 100,
    # BACKLOG #21 gap 1 (2026-10-05): defaults to active-only so every "pick a
    # person" picker (NCR/OBS/OSD/FollowUp/Meeting Minutes assignee pickers)
    # stops offering deactivated users forever. The IAM admin page explicitly
    # passes active_only=false to keep reactivating people possible.
    active_only: bool = True,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_VIEW))
):
    return user_service.get_users(skip=skip, limit=limit, active_only=active_only)

@router.get("/users/{user_id}/", response_model=schemas.User)
def read_user(
    user_id: int,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_VIEW))
):
    db_user = user_service.get_user(user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.post("/users/", response_model=schemas.User)
def create_user(
    user: schemas.UserCreate,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_MANAGE))
):
    # Handing out a role at creation is the same privilege-escalation vector as
    # changing one, so it needs the same permission (plain iam:user:manage must
    # not be able to mint an Admin). Omitting role_id creates a roleless account
    # — the backend assigns NO default role — which holds no permissions.
    if user.role_id is not None:
        _require_role_manage_permission(current_user)

    # Validation and hashing are handled in user_service.create_user
    return user_service.create_user(
        user=user,
        current_user_id=current_user.id,
        current_username=current_user.username
    )

@router.put("/users/{user_id}/", response_model=schemas.User)
def update_user(
    user_id: int,
    user: schemas.UserUpdate,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_MANAGE))
):
    # role_id is a privilege-escalation vector: plain iam:user:manage must not
    # be enough to hand out (or accept) a more powerful role. Only gate this
    # one field — compare against the DB value, not mere key-presence, since
    # the frontend resends the whole record on every save (same reasoning as
    # NCR's _require_approve_permission).
    if user.role_id is not None:
        existing = user_service.get_user(user_id=user_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="User not found")
        if user.role_id != existing.role_id:
            if user_id == current_user.id:
                raise HTTPException(status_code=403, detail="Cannot change your own role")
            _require_role_manage_permission(current_user)

    hashed_password = None
    if user.password:
        from services.user_service import _validate_password_strength
        _validate_password_strength(user.password)
        hashed_password = get_password_hash(user.password)
    db_user = user_service.update_user(
        user_id=user_id,
        user_update=user,
        hashed_password=hashed_password,
        current_user_id=current_user.id,
        current_username=current_user.username
    )
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.delete("/users/{user_id}/")
def delete_user(
    user_id: int,
    current_user: schemas.User = Depends(RoleChecker(USER_MANAGE))
):
    # Accounts are never hard-deleted: users.id is reused by SQLite after the
    # newest row is removed, and audit/ownership rows point at it by number, so
    # a delete lets history be re-attributed to a later account. Explicitly
    # refused (NOT treated as a deactivation) — deactivate via PUT is_active=false.
    raise HTTPException(
        status_code=405,
        detail="Accounts cannot be deleted. Deactivate the account instead (set Status to Inactive).",
        headers={"Allow": "GET, PUT"},
    )

# === User data-isolation scope (P0) ===
@router.get("/users/{user_id}/scope", response_model=schemas.UserScope)
def read_user_scope(
    user_id: int,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_VIEW))
):
    scope = user_service.get_user_scope(user_id)
    if scope is None:
        raise HTTPException(status_code=404, detail="User not found")
    return scope

@router.put("/users/{user_id}/scope", response_model=schemas.UserScope)
def set_user_scope(
    user_id: int,
    body: schemas.UserScope,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_MANAGE))
):
    try:
        scope = user_service.set_user_scope(
            user_id, body.project_ids, body.vendor_id,
            actor_id=current_user.id, actor_name=current_user.username,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if scope is None:
        raise HTTPException(status_code=404, detail="User not found")
    return scope

# === Roles ===
@router.get("/roles/", response_model=list[schemas.Role])
def read_roles(
    skip: int = 0,
    limit: int = 100,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(ROLE_VIEW))
):
    return user_service.get_roles(skip=skip, limit=limit)

@router.get("/roles/{role_id}/", response_model=schemas.Role)
def read_role(
    role_id: int,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(ROLE_VIEW))
):
    db_role = user_service.get_role(role_id=role_id)
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return db_role

@router.post("/roles/", response_model=schemas.Role)
def create_role(
    role: schemas.RoleCreate,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(ROLE_MANAGE))
):
    db_role = user_service.get_role_by_name(name=role.name)
    if db_role:
        raise HTTPException(status_code=400, detail="Role already exists")
    return user_service.create_role(
        role=role, 
        current_user_id=current_user.id, 
        current_username=current_user.username
    )

@router.put("/roles/{role_id}/", response_model=schemas.Role)
def update_role(
    role_id: int,
    role: schemas.RoleUpdate,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(ROLE_MANAGE))
):
    db_role = user_service.update_role(
        role_id=role_id, 
        role_update=role, 
        current_user_id=current_user.id, 
        current_username=current_user.username
    )
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return db_role

@router.delete("/roles/{role_id}/")
def delete_role(
    role_id: int,
    reason: str = None,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(ROLE_MANAGE))
):
    success = user_service.delete_role(
        role_id=role_id, 
        current_user_id=current_user.id, 
        current_username=current_user.username, 
        reason=reason
    )
    if not success:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"ok": True}

@router.get("/permissions/", response_model=list[schemas.Permission])
def read_permissions(
    skip: int = 0,
    limit: int = 100,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(ROLE_VIEW))
):
    """
    獲取系統中定義的所有權限
    """
    return user_service.get_permissions(skip=skip, limit=limit)
