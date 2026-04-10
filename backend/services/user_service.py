from typing import List, Optional
from fastapi import HTTPException
from passlib.context import CryptContext
import models
import schemas
from repositories.user_repository import UserRepository
from crud import log_audit  # Import existing audit logger to maintain legacy compatibility for now

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class UserService:
    def __init__(self, repo: UserRepository):
        self.repo = repo

    def get_user(self, user_id: int) -> Optional[models.User]:
        return self.repo.get_by_id(user_id)

    def get_user_by_email(self, email: str) -> Optional[models.User]:
        return self.repo.get_by_email(email)

    def get_user_by_username(self, username: str) -> Optional[models.User]:
        return self.repo.get_by_username(username)

    def get_users(self, skip: int = 0, limit: int = 100) -> List[models.User]:
        return self.repo.get_all(skip=skip, limit=limit)

    def create_user(
        self,
        user: schemas.UserCreate,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.User:
        db_user = self.repo.get_by_email(user.email)
        if db_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        db_user_username = self.repo.get_by_username(user.username)
        if db_user_username:
            raise HTTPException(status_code=400, detail="Username already registered")

        hashed_password = pwd_context.hash(user.password)
        new_user = models.User(
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            hashed_password=hashed_password,
            is_active=user.is_active,
            role_id=user.role_id,
        )
        
        created_user = self.repo.create(new_user)
        
        # Log Audit
        log_audit(
            self.repo.db, "CREATE", "User", str(created_user.id), created_user.username, 
            new_value={"username": created_user.username, "email": created_user.email, "role_id": created_user.role_id}, 
            user_id=current_user_id, username=current_username
        )
        return created_user

    def update_user(
        self,
        user_id: int,
        user_update: schemas.UserUpdate,
        hashed_password: str = None,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.User:
        db_user = self.repo.get_by_id(user_id)
        if not db_user:
            return None

        # Logic to prevent deactivating the last admin
        if user_update.is_active is False and db_user.role and db_user.role.name == "Admin":
            admin_count = self.repo.count_active_admins()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot deactivate the last active Admin user")

        old_data = {
            "username": db_user.username,
            "email": db_user.email,
            "role_id": db_user.role_id,
            "is_active": db_user.is_active
        }

        update_dict = {k: v for k, v in user_update.model_dump(exclude_unset=True).items() if v is not None}
        if hashed_password:
            update_dict["hashed_password"] = hashed_password
            
        updated_user = self.repo.update(db_user, update_dict)

        new_data = {
            "username": updated_user.username,
            "email": updated_user.email,
            "role_id": updated_user.role_id,
            "is_active": updated_user.is_active
        }
        
        log_audit(
            self.repo.db, "UPDATE", "User", str(updated_user.id), updated_user.username,
            old_value=old_data, new_value=new_data, user_id=current_user_id, username=current_username
        )
        return updated_user

    def delete_user(
        self,
        user_id: int,
        current_user_id: int = None,
        current_username: str = None,
        reason: str = None
    ) -> bool:
        db_user = self.repo.get_by_id(user_id)
        if not db_user:
            return False

        if db_user.role and db_user.role.name == "Admin" and db_user.is_active:
            admin_count = self.repo.count_active_admins()
            if admin_count <= 1:
                raise HTTPException(status_code=400, detail="Cannot delete the last active Admin user")

        old_data = {
            "username": db_user.username,
            "email": db_user.email,
            "role_id": db_user.role_id
        }

        self.repo.delete(db_user)
        log_audit(
            self.repo.db, "DELETE", "User", str(user_id), db_user.username,
            old_value=old_data, user_id=current_user_id, username=current_username, reason=reason
        )
        return True

    # ---- Role Core Operations ----
    def get_role(self, role_id: int) -> Optional[models.Role]:
        return self.repo.get_role_by_id(role_id)

    def get_role_by_name(self, name: str) -> Optional[models.Role]:
        return self.repo.get_role_by_name(name)

    def get_roles(self, skip: int = 0, limit: int = 100) -> List[models.Role]:
        return self.repo.get_all_roles(skip, limit)

    def get_permissions(self, skip: int = 0, limit: int = 100) -> List[models.Permission]:
        return self.repo.get_all_permissions(skip, limit)

    def create_role(
        self,
        role: schemas.RoleCreate,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.Role:
        new_role = models.Role(name=role.name, description=role.description)
        if role.permissions:
            perms = self.repo.get_permissions_by_codes(role.permissions)
            new_role.permissions_rel = perms

        created_role = self.repo.create_role(new_role)

        new_val = {
            "name": created_role.name,
            "permissions": [p.code for p in created_role.permissions_rel]
        }
        log_audit(
            self.repo.db, "CREATE", "Role", str(created_role.id), created_role.name,
            new_value=new_val, user_id=current_user_id, username=current_username
        )
        return created_role

    def update_role(
        self,
        role_id: int,
        role_update: schemas.RoleUpdate,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.Role:
        db_role = self.repo.get_role_by_id(role_id)
        if not db_role:
            return None

        old_val = {"name": db_role.name, "permissions": [p.code for p in db_role.permissions_rel]}

        update_dict = {}
        if role_update.name is not None:
            update_dict["name"] = role_update.name
        if role_update.description is not None:
            update_dict["description"] = role_update.description

        if role_update.permissions is not None:
            perms = self.repo.get_permissions_by_codes(role_update.permissions)
            db_role.permissions_rel = perms

        updated_role = self.repo.update_role(db_role, update_dict)

        new_val = {"name": updated_role.name, "permissions": [p.code for p in updated_role.permissions_rel]}
        log_audit(
            self.repo.db, "UPDATE", "Role", str(updated_role.id), updated_role.name,
            old_value=old_val, new_value=new_val, user_id=current_user_id, username=current_username
        )
        return updated_role

    def delete_role(
        self,
        role_id: int,
        current_user_id: int = None,
        current_username: str = None,
        reason: str = None
    ) -> bool:
        db_role = self.repo.get_role_by_id(role_id)
        if not db_role:
            return False

        old_val = {"name": db_role.name, "permissions": [p.code for p in db_role.permissions_rel]}
        self.repo.delete_role(db_role)

        log_audit(
            self.repo.db, "DELETE", "Role", str(role_id), db_role.name,
            old_value=old_val, user_id=current_user_id, username=current_username, reason=reason
        )
        return True
