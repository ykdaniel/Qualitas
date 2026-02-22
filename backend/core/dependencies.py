from fastapi import Depends, HTTPException, status
import logging
import models
import schemas
from core.security import get_current_user

logger = logging.getLogger(__name__)

class RoleChecker:
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, user: models.User = Depends(get_current_user)):
        # 1. Check if user is active
        if not user.is_active:
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User is inactive"
            )

        # 2. Check if user has a role
        if not user.role:
             raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User has no assigned role"
            )

        # 3. Check if role has the required permission
        # Using the permissions_rel relationship (List[Permission])
        user_permissions = [p.code for p in user.role.permissions_rel]
        
        if self.required_permission not in user_permissions:
            logger.debug(f"Permission denied. User: {user.username}, Role: {user.role.name}, Required: {self.required_permission}, Has: {user_permissions}")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required: {self.required_permission}"
            )
        
        return user
