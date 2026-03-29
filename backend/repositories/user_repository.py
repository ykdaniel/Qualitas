from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func
import models
import schemas
from core.utils import sanitize_pagination

class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    # ---- User Operations ----
    def get_by_id(self, user_id: int) -> Optional[models.User]:
        return self.db.query(models.User).filter(models.User.id == user_id).first()

    def get_by_email(self, email: str) -> Optional[models.User]:
        return self.db.query(models.User).filter(models.User.email == email).first()

    def get_by_username(self, username: str) -> Optional[models.User]:
        return self.db.query(models.User).filter(models.User.username == username).first()

    def get_all(self, skip: int = 0, limit: int = 100) -> List[models.User]:
        skip, limit = sanitize_pagination(skip, limit)
        return self.db.query(models.User).offset(skip).limit(limit).all()

    def count_active_admins(self) -> int:
        return self.db.query(models.Role).filter(
            models.Role.name == "Admin",
            models.User.is_active
        ).count()

    def create(self, user: models.User) -> models.User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update(self, user: models.User, update_data: dict) -> models.User:
        for key, value in update_data.items():
            setattr(user, key, value)
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete(self, user: models.User):
        self.db.delete(user)
        self.db.commit()

    # ---- Role Operations ----
    def get_role_by_id(self, role_id: int) -> Optional[models.Role]:
        return self.db.query(models.Role).filter(models.Role.id == role_id).first()

    def get_role_by_name(self, name: str) -> Optional[models.Role]:
        return self.db.query(models.Role).filter(func.lower(models.Role.name) == func.lower(name)).first()

    def get_all_roles(self, skip: int = 0, limit: int = 100) -> List[models.Role]:
        skip, limit = sanitize_pagination(skip, limit)
        return self.db.query(models.Role).offset(skip).limit(limit).all()

    def create_role(self, role: models.Role) -> models.Role:
        self.db.add(role)
        self.db.commit()
        self.db.refresh(role)
        return role

    def update_role(self, role: models.Role, update_data: dict) -> models.Role:
        for key, value in update_data.items():
            setattr(role, key, value)
        self.db.commit()
        self.db.refresh(role)
        return role

    def delete_role(self, role: models.Role):
        self.db.delete(role)
        self.db.commit()

    # ---- Permission Operations ----
    def get_permissions_by_codes(self, permission_codes: List[str]) -> List[models.Permission]:
        return self.db.query(models.Permission).filter(models.Permission.code.in_(permission_codes)).all()

    def get_all_permissions(self, skip: int = 0, limit: int = 100) -> List[models.Permission]:
        skip, limit = sanitize_pagination(skip, limit)
        return self.db.query(models.Permission).offset(skip).limit(limit).all()
