"""
權限驗證中間件模組
提供 API 路由的權限驗證功能
"""
from functools import wraps
from typing import List, Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from database import get_db
import crud
from core.config import settings

# JWT 設定 - 從 settings 讀取（已在 config.py 中驗證）
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM

# OAuth2 scheme for backward compatibility (still supports Authorization header)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login", auto_error=False)

# 權限常數
class Permission:
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    MANAGE_USERS = "manage_users"
    MANAGE_ROLES = "manage_roles"


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """
    從 JWT token 解析當前使用者
    支持從 httpOnly cookie 或 Authorization header 讀取 token（用於向後兼容）
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # SECURITY: Try to get token from httpOnly cookie first (preferred)
    if not token:
        cookie_token = request.cookies.get("access_token")
        if cookie_token:
            # Remove "Bearer " prefix if present
            token = cookie_token.replace("Bearer ", "") if cookie_token.startswith("Bearer ") else cookie_token

    # If no token found in either cookie or header
    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = crud.get_user(db, user_id)
    if user is None:
        raise credentials_exception
    return user


async def get_user_permissions(
    request: Request,
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> List[str]:
    """
    獲取當前使用者的權限列表
    """
    user = await get_current_user(request, token, db)
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
        request: Request,
        token: Optional[str] = Depends(oauth2_scheme),
        db: Session = Depends(get_db)
    ) -> bool:
        user_permissions = await get_user_permissions(request, token, db)
        
        for perm in self.required_permissions:
            if perm not in user_permissions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Permission denied: requires '{perm}' permission"
                )
        
        return True
