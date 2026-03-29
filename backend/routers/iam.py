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

# === Users ===
@router.get("/users/", response_model=list[schemas.User])
def read_users(
    skip: int = 0,
    limit: int = 100,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_VIEW))
):
    return user_service.get_users(skip=skip, limit=limit)

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
    hashed_password = get_password_hash(user.password) if user.password else None
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
    reason: str = None,
    user_service: UserService = Depends(get_user_service),
    current_user: schemas.User = Depends(RoleChecker(USER_MANAGE))
):
    success = user_service.delete_user(
        user_id=user_id,
        current_user_id=current_user.id,
        current_username=current_user.username,
        reason=reason
    )
    if not success:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

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
