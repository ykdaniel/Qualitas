from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, text
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

    def get_all(self, skip: int = 0, limit: int = 100, active_only: bool = False) -> List[models.User]:
        """BACKLOG #21 gap 1 (2026-10-05): every "pick a person" picker used to
        offer deactivated users forever (`active_only` defaulted away). The IAM
        admin page still needs the full list to reactivate someone, so this
        stays opt-in — callers that are pickers pass `active_only=True`."""
        skip, limit = sanitize_pagination(skip, limit)
        query = self.db.query(models.User)
        if active_only:
            query = query.filter(models.User.is_active.is_(True))
        return query.offset(skip).limit(limit).all()

    # "Admin" is recognised the way db_seeder.py recognises it: the role NAME
    # compared case-insensitively (the seeder creates "admin"; some databases
    # also carry "Admin"/"ADMIN"). One definition, used by every guard.
    @staticmethod
    def is_admin_role_name(name: Optional[str]) -> bool:
        return (name or "").lower() == "admin"

    def count_active_admins(self, exclude_user_id: Optional[int] = None,
                            exclude_role_id: Optional[int] = None) -> int:
        """Number of ACTIVE users whose role is an admin role, optionally not
        counting one user (the one about to lose admin standing) or one role
        (the role about to stop being an admin role).

        Joins users to roles on role_id. (The previous version filtered
        Role.name and User.is_active in one query with no join between the
        tables — a cross join that counted every user whenever any admin role
        existed, so the "last admin" check could never fire.)"""
        q = (
            self.db.query(models.User)
            .join(models.Role, models.User.role_id == models.Role.id)
            .filter(func.lower(models.Role.name) == "admin", models.User.is_active.is_(True))
        )
        if exclude_user_id is not None:
            q = q.filter(models.User.id != exclude_user_id)
        if exclude_role_id is not None:
            q = q.filter(models.User.role_id != exclude_role_id)
        return q.count()

    def count_active_users_in_role(self, role_id: int) -> int:
        return self.db.query(models.User).filter(
            models.User.role_id == role_id, models.User.is_active.is_(True)
        ).count()

    def lock_for_admin_change(self) -> None:
        """Serialise concurrent "remove an admin" decisions.

        The last-admin rule is check-then-write, so two requests that each see
        "another admin still exists" could both proceed and leave none. SQLite
        allows one writer at a time but does not hold anything across a plain
        SELECT, so we take the write lock FIRST (an UPDATE that changes nothing
        starts the write transaction) and let the caller re-read afterwards. A
        concurrent request then waits here until the first one commits or rolls
        back, and its own check sees the outcome. On another database the same
        intent is a row lock on the admin users."""
        if self.db.get_bind().dialect.name == "sqlite":
            self.db.execute(text("UPDATE users SET id = id WHERE id = (SELECT MIN(id) FROM users)"))
        else:
            self.db.query(models.User).join(
                models.Role, models.User.role_id == models.Role.id
            ).filter(func.lower(models.Role.name) == "admin").with_for_update().all()

    # `commit=False` = flush only, for a caller (UserService) that must commit
    # the account change TOGETHER WITH its audit entry. Default keeps the
    # historical commit-immediately behaviour for any other caller.
    def create(self, user: models.User, commit: bool = True) -> models.User:
        self.db.add(user)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(user)
        return user

    def update(self, user: models.User, update_data: dict, commit: bool = True) -> models.User:
        for key, value in update_data.items():
            setattr(user, key, value)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(user)
        return user

    # ---- Role Operations ----
    def get_role_by_id(self, role_id: int) -> Optional[models.Role]:
        return self.db.query(models.Role).filter(models.Role.id == role_id).first()

    def get_role_by_name(self, name: str) -> Optional[models.Role]:
        return self.db.query(models.Role).filter(func.lower(models.Role.name) == func.lower(name)).first()

    def get_all_roles(self, skip: int = 0, limit: int = 100) -> List[models.Role]:
        skip, limit = sanitize_pagination(skip, limit)
        return self.db.query(models.Role).offset(skip).limit(limit).all()

    # The three role writers below default to their historical behaviour (commit
    # immediately). `commit=False` is for a caller that must commit the role
    # change TOGETHER WITH something else — UserService uses it so the role
    # row, its permission links and the audit entry land in ONE transaction
    # (2026-09-19: committing here first left the audit row uncommitted and
    # lost). With commit=False the change is flushed (ids assigned, constraint
    # errors raised) but left open for the caller to commit or roll back.
    def create_role(self, role: models.Role, commit: bool = True) -> models.Role:
        self.db.add(role)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(role)
        return role

    def update_role(self, role: models.Role, update_data: dict, commit: bool = True) -> models.Role:
        for key, value in update_data.items():
            setattr(role, key, value)
        if commit:
            self.db.commit()
        else:
            self.db.flush()
        self.db.refresh(role)
        return role

    def delete_role(self, role: models.Role, commit: bool = True):
        self.db.delete(role)
        if commit:
            self.db.commit()
        else:
            self.db.flush()

    # ---- Permission Operations ----
    def get_permissions_by_codes(self, permission_codes: List[str]) -> List[models.Permission]:
        return self.db.query(models.Permission).filter(models.Permission.code.in_(permission_codes)).all()

    def get_all_permissions(self, skip: int = 0, limit: int = 100) -> List[models.Permission]:
        skip, limit = sanitize_pagination(skip, limit)
        return self.db.query(models.Permission).offset(skip).limit(limit).all()
