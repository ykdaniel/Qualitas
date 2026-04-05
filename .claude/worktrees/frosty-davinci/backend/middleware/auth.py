"""
權限驗證中間件模組
提供 API 路由的權限驗證功能
"""
import os
from functools import wraps
from typing import List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from database import get_db
import crud

# JWT 設定 - 使用 core.config.settings
# SECRET_KEY and ALGORITHM are now accessed via settings.SECRET_KEY and settings.ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

# 權限常數
class Permission:
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    MANAGE_USERS = "manage_users"
    MANAGE_ROLES = "manage_roles"
    MANAGE_SETTINGS = "manage_settings"


from core.config import settings

# ...

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    從 JWT token 解析當前使用者
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    user = None

    # 1. Mock Token Logic (Development Environment Only)
    if settings.ENVIRONMENT != 'production' and token.startswith("mock_"):
        # Handle mock token: mock_access_token_{user_id}_{random}
        parts = token.split("_")
        if len(parts) >= 4:
            try:
                user_id = int(parts[3])
                user = crud.get_user(db, user_id)
            except (ValueError, IndexError):
                pass
        else:
             # Fallback for legacy mock tokens if needed, or just fail
             pass
    
    # 2. Real JWT Logic
    elif not token.startswith("mock_"):
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            # 統一使用 sub (username) 來識別使用者，與 core/security.py 保持一致
            username: str = payload.get("sub")
            if username:
                user = crud.get_user_by_username(db, username=username)
        except JWTError:
            # log to stdout instead of file
            print(f"JWT Verification Failed")
            pass
        except Exception as e:
            print(f"Auth Error: {e}")
            pass

    if user is None:
        raise credentials_exception
    
    return user


async def get_user_permissions(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    獲取當前使用者的權限列表
    """
    user = await get_current_user(token, db)
    if not user.role_id:
        return []
    
    role = crud.get_role(db, user.role_id)
    if not role:
        return []
    
    # 解析權限（可能是 JSON 字串或列表）
    permissions = role.permissions
    if isinstance(permissions, str):
        import json
        try:
            permissions = json.loads(permissions)
        except json.JSONDecodeError:
            permissions = []
    
    return permissions or []


def require_permissions(required_permissions: List[str]):
    """
    權限驗證裝飾器 - 用於路由函式
    
    使用方式:
        @router.get("/users")
        @require_permissions([Permission.READ, Permission.MANAGE_USERS])
        async def get_users(...):
            ...
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 從 kwargs 中獲取 db 和權限
            db = kwargs.get('db')
            token = kwargs.get('token')
            
            if not token or not db:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            user_permissions = await get_user_permissions(token, db)
            
            # 檢查是否擁有所需權限
            for perm in required_permissions:
                if perm not in user_permissions:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permission denied: requires '{perm}' permission"
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


class PermissionChecker:
    """
    權限檢查器類別 - 用於 FastAPI Depends
    
    使用方式:
        @router.delete("/users/{user_id}")
        async def delete_user(
            user_id: int,
            db: Session = Depends(get_db),
            _: bool = Depends(PermissionChecker([Permission.DELETE, Permission.MANAGE_USERS]))
        ):
            ...
    """
    def __init__(self, required_permissions: List[str]):
        self.required_permissions = required_permissions

    async def __call__(
        self,
        token: str = Depends(oauth2_scheme),
        db: Session = Depends(get_db)
    ) -> bool:
        user_permissions = await get_user_permissions(token, db)
        
        for perm in self.required_permissions:
            if perm not in user_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: requires '{perm}' permission"
                )
        
        return True
