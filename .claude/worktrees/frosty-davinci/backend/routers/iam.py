
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from passlib.context import CryptContext
import schemas
import crud
from database import get_db
from middleware.auth import PermissionChecker, Permission

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password: str) -> str:
    """雜湊密碼"""
    return pwd_context.hash(password)

router = APIRouter(
    tags=["iam"],
    responses={404: {"description": "Not found"}},
)

# === Users ===
# 讀取操作 - 無需認證（允許前端在登入前取得必要資料）
@router.get("/users", response_model=List[schemas.User])
def read_users(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.READ, Permission.MANAGE_USERS]))
):
    return crud.get_users(db, skip=skip, limit=limit)

@router.get("/users/{user_id}", response_model=schemas.User)
def read_user(
    user_id: int, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.READ, Permission.MANAGE_USERS]))
):
    db_user = crud.get_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

# 寫入操作 - 需要管理使用者權限
@router.post("/users", response_model=schemas.User)
def create_user(
    user: schemas.UserCreate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE, Permission.MANAGE_USERS]))
):
    db_user = crud.get_user_by_email(db, email=user.email)
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    db_user = crud.get_user_by_username(db, username=user.username)
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    hashed_password = get_password_hash(user.password)
    return crud.create_user(db=db, user=user, hashed_password=hashed_password)

@router.put("/users/{user_id}", response_model=schemas.User)
def update_user(
    user_id: int, 
    user: schemas.UserUpdate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE, Permission.MANAGE_USERS]))
):
    hashed_password = get_password_hash(user.password) if user.password else None
    db_user = crud.update_user(db, user_id=user_id, user=user, hashed_password=hashed_password)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.delete("/users/{user_id}")
def delete_user(
    user_id: int, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.DELETE, Permission.MANAGE_USERS]))
):
    db_user = crud.delete_user(db, user_id=user_id)
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}

# === Roles ===
# 讀取操作 - 無需認證（允許前端在登入前取得必要資料）
@router.get("/roles", response_model=List[schemas.Role])
def read_roles(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.READ, Permission.MANAGE_ROLES]))
):
    return crud.get_roles(db, skip=skip, limit=limit)

@router.get("/roles/{role_id}", response_model=schemas.Role)
def read_role(
    role_id: int, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.READ, Permission.MANAGE_ROLES]))
):
    db_role = crud.get_role(db, role_id=role_id)
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return db_role

# 寫入操作 - 需要管理角色權限
@router.post("/roles", response_model=schemas.Role)
def create_role(
    role: schemas.RoleCreate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE, Permission.MANAGE_ROLES]))
):
    db_role = crud.get_role_by_name(db, name=role.name)
    if db_role:
        raise HTTPException(status_code=400, detail="Role already exists")
    return crud.create_role(db=db, role=role)

@router.put("/roles/{role_id}", response_model=schemas.Role)
def update_role(
    role_id: int, 
    role: schemas.RoleUpdate, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.WRITE, Permission.MANAGE_ROLES]))
):
    db_role = crud.update_role(db, role_id=role_id, role=role)
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return db_role

@router.delete("/roles/{role_id}")
def delete_role(
    role_id: int, 
    db: Session = Depends(get_db),
    _: bool = Depends(PermissionChecker([Permission.DELETE, Permission.MANAGE_ROLES]))
):
    db_role = crud.delete_role(db, role_id=role_id)
    if db_role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return {"ok": True}
