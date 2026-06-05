from datetime import date
from typing import List, Optional
from fastapi import HTTPException
from passlib.context import CryptContext
import models
import schemas
from repositories.user_repository import UserRepository
from crud import log_audit  # Import existing audit logger to maintain legacy compatibility for now

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _validate_password_strength(password: str) -> None:
    """Reject weak passwords. Minimum baseline; adjust thresholds in policy review."""
    if not password or len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long",
        )
    has_letter = any(c.isalpha() for c in password)
    has_digit = any(c.isdigit() for c in password)
    if not (has_letter and has_digit):
        raise HTTPException(
            status_code=400,
            detail="Password must contain both letters and digits",
        )
    # Block the obvious defaults that get audited as "still using default password"
    if password.lower() in {"admin", "admin123", "password", "12345678", "password1"}:
        raise HTTPException(
            status_code=400,
            detail="Password is too common; choose a different one",
        )

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

    # ── P0 data-isolation scope management ──────────────────────────────────
    def get_user_scope(self, user_id: int) -> Optional[dict]:
        """Return {project_ids, vendor_id} for a user, or None if no such user."""
        user = self.repo.get_by_id(user_id)
        if not user:
            return None
        rows = (
            self.repo.db.query(models.UserProject.project_id)
            .filter(models.UserProject.user_id == user_id)
            .all()
        )
        return {"project_ids": [r[0] for r in rows], "vendor_id": user.vendor_id}

    def set_user_scope(self, user_id: int, project_ids: List[str], vendor_id: Optional[str],
                       actor_id: int = None, actor_name: str = None) -> Optional[dict]:
        """Replace a user's project scope and contractor binding. Validates that
        referenced projects / contractor exist. Returns the new scope, or None if
        the user doesn't exist. Raises ValueError on unknown project/contractor."""
        user = self.repo.get_by_id(user_id)
        if not user:
            return None

        project_ids = list(dict.fromkeys(project_ids or []))  # dedupe, keep order
        if project_ids:
            found = {
                p.id for p in self.repo.db.query(models.Project.id)
                .filter(models.Project.id.in_(project_ids)).all()
            }
            missing = [pid for pid in project_ids if pid not in found]
            if missing:
                raise ValueError(f"Unknown project id(s): {', '.join(missing)}")
        if vendor_id:
            if not self.repo.db.query(models.Contractor.id).filter(
                models.Contractor.id == vendor_id
            ).first():
                raise ValueError(f"Unknown contractor id: {vendor_id}")

        # Replace the mapping rows.
        self.repo.db.query(models.UserProject).filter(
            models.UserProject.user_id == user_id
        ).delete(synchronize_session=False)
        for pid in project_ids:
            self.repo.db.add(models.UserProject(user_id=user_id, project_id=pid))
        user.vendor_id = vendor_id or None
        self.repo.db.commit()

        log_audit(
            self.repo.db, "UPDATE", "UserScope", str(user_id), user.username,
            new_value={"project_ids": project_ids, "vendor_id": user.vendor_id},
            user_id=actor_id, username=actor_name,
        )
        return {"project_ids": project_ids, "vendor_id": user.vendor_id}

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

        _validate_password_strength(user.password)
        hashed_password = pwd_context.hash(user.password)
        new_user = models.User(
            email=user.email,
            username=user.username,
            full_name=user.full_name,
            hashed_password=hashed_password,
            is_active=user.is_active,
            role_id=user.role_id,
            created_at=date.today().isoformat(),  # stored as YYYY-MM-DD
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
