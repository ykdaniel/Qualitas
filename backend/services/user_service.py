import unicodedata
from datetime import date, datetime, timezone
from typing import List, Optional
from fastapi import HTTPException
from passlib.context import CryptContext
import models
import schemas
from repositories.user_repository import UserRepository
from crud import log_audit  # Import existing audit logger to maintain legacy compatibility for now
# The role methods need the STRICT audit logger (raises if the entry can't be
# built, instead of swallowing) so a role change is never committed without its
# audit trail. crud.log_audit above has no strict mode and is left as-is for
# every other caller in this module.
from core.utils import log_audit as strict_log_audit
from core import validators

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

_ADMIN_ONLY_MODIFY = "Only an Admin can modify an Admin account"
_ADMIN_ONLY_PASSWORD = "Only an Admin can set a password through IAM"
_ADMIN_ONLY_ASSIGN = "Only an Admin can create an account with, or assign, the Admin role"
_ADMIN_ONLY_ROLE = "Only an Admin can create, rename, modify or delete the Admin role"


def _admin_like_name(name: Optional[str]) -> bool:
    """NAMING guard (broader than identity): a name that a person, or a UI that
    trims/normalises input, would read as "admin" — case, surrounding
    whitespace and Unicode width variants included. Who IS an Admin stays the
    exact, case-insensitive role-name test (UserRepository.is_admin_role_name,
    the same one the seeder and every guard use); this only stops a non-Admin
    from creating or renaming a role into that neighbourhood."""
    return unicodedata.normalize("NFKC", name or "").strip().casefold() == "admin"


class UserService:
    def __init__(self, repo: UserRepository):
        self.repo = repo

    def get_user(self, user_id: int) -> Optional[models.User]:
        return self.repo.get_by_id(user_id)

    def get_user_by_email(self, email: str) -> Optional[models.User]:
        return self.repo.get_by_email(email)

    def get_user_by_username(self, username: str) -> Optional[models.User]:
        return self.repo.get_by_username(username)

    def get_users(self, skip: int = 0, limit: int = 100, active_only: bool = True) -> List[models.User]:
        return self.repo.get_all(skip=skip, limit=limit, active_only=active_only)

    # ── Admin-account protection ────────────────────────────────────────────
    # Conservative rule (2026-09-20): through IAM, only an Admin may (a) set a
    # password, or (b) change anything on an Admin account. "Admin" is decided
    # the one way the whole system decides it — the role NAME, case-insensitive
    # — read from the database for the ACTING user (never from the request, never
    # from a username). Holding iam:role:manage / iam:user:manage does not make
    # anyone an Admin, and no role hierarchy is introduced.
    def _is_admin_user(self, user: Optional[models.User]) -> bool:
        return bool(user and user.is_active and user.role
                    and self.repo.is_admin_role_name(user.role.name))

    def _actor_is_admin(self, actor_id: Optional[int]) -> bool:
        if actor_id is None:
            return False                                   # unknown actor: fail closed
        actor = self.repo.get_by_id(actor_id)
        if actor is None:
            return False
        self.repo.db.refresh(actor)                        # never trust a stale identity-map copy
        return self._is_admin_user(actor)

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

        # Changing an Admin account's data scope is modifying that account.
        if (user.role and self.repo.is_admin_role_name(user.role.name)
                and not self._actor_is_admin(actor_id)):
            current = self.get_user_scope(user_id)
            if set(project_ids) != set(current["project_ids"]) or (vendor_id or None) != current["vendor_id"]:
                raise HTTPException(status_code=403, detail=_ADMIN_ONLY_MODIFY)
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

    @staticmethod
    def _user_audit_snapshot(user: models.User) -> dict:
        """What a User audit entry records: identity, display name, company,
        role and active status. Deliberately NO password material of any kind
        (neither plaintext nor hash) — a password change is recorded only as a
        `password_changed` flag added by the caller."""
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "company_name": user.company_name,
            "role_id": user.role_id,
            "role_name": user.role.name if user.role else None,
            "is_active": user.is_active,
        }

    def _require_existing_role(self, role_id: int) -> models.Role:
        # SQLite does not enforce the role_id foreign key, so a made-up id
        # would otherwise be stored and leave the account roleless.
        role = self.repo.get_role_by_id(role_id)
        if role is None:
            raise HTTPException(status_code=400, detail="Role not found")
        return role

    def create_user(
        self,
        user: schemas.UserCreate,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.User:
        if self.repo.get_by_email(user.email):
            raise HTTPException(status_code=400, detail="Email already registered")
        if self.repo.get_by_username(user.username):
            raise HTTPException(status_code=400, detail="Username already registered")
        if user.role_id is not None:
            self._require_existing_role(user.role_id)

        _validate_password_strength(user.password)
        hashed_password = pwd_context.hash(user.password)

        # ONE transaction: the account row and its audit entry commit together
        # or not at all (the repository is told not to commit).
        try:
            # Naming the Admin role at creation is how an Admin identity is minted:
            # only an active Admin may. Lock first, then read the ACTING user and the
            # role fresh inside this transaction.
            self.repo.lock_for_admin_change()
            if user.role_id is not None:
                role = self.repo.get_role_by_id(user.role_id)
                if role is not None:
                    self.repo.db.refresh(role)
                if role is not None and self.repo.is_admin_role_name(role.name) and not self._actor_is_admin(current_user_id):
                    raise HTTPException(status_code=403, detail=_ADMIN_ONLY_ASSIGN)

            new_user = models.User(
                email=user.email,
                username=user.username,
                full_name=user.full_name,
                hashed_password=hashed_password,
                is_active=True if user.is_active is None else user.is_active,
                role_id=user.role_id,
                company_name=user.company_name,
                created_at=date.today().isoformat(),  # stored as YYYY-MM-DD
            )
            created_user = self.repo.create(new_user, commit=False)   # flushed: id assigned

            strict_log_audit(
                self.repo.db, "CREATE", "User", str(created_user.id), created_user.username,
                new_value={**self._user_audit_snapshot(created_user), "password_changed": True},
                user_id=current_user_id, username=current_username, reason=user.reason, strict=True,
            )
            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(created_user)
            return created_user
        except Exception:
            self.repo.db.rollback()
            raise

    def update_user(
        self,
        user_id: int,
        user_update: schemas.UserUpdate,
        hashed_password: str = None,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.User:
        if not self.repo.get_by_id(user_id):
            return None

        # ONE transaction: the account change, the "last admin" decision that
        # guards it, and the audit entry. The write lock is taken FIRST and
        # everything is re-read after it, so a concurrent request cannot slip
        # a second admin removal between our check and our write.
        try:
            self.repo.lock_for_admin_change()
            db_user = self.repo.get_by_id(user_id)
            self.repo.db.refresh(db_user)
            before = self._user_audit_snapshot(db_user)

            requested = {k: v for k, v in user_update.model_dump(exclude_unset=True).items()
                         if v is not None and k not in ("password", "reason")}
            # Only real changes are applied and audited (the UI resends the whole record on every save).
            update_dict = {k: v for k, v in requested.items() if getattr(db_user, k, None) != v}

            new_role = self._require_existing_role(update_dict["role_id"]) if "role_id" in update_dict else db_user.role
            if new_role is not None:
                self.repo.db.refresh(new_role)

            # Authorization on the ACTUAL before/after values (a form that resends
            # unchanged fields is not a modification), decided inside the same
            # locked, re-read transaction as the write. The role is judged both
            # BEFORE (target already an Admin) and AFTER (target becoming one).
            if not self._actor_is_admin(current_user_id):
                if "role_id" in update_dict and self.repo.is_admin_role_name(new_role.name):
                    raise HTTPException(status_code=403, detail=_ADMIN_ONLY_ASSIGN)
                if hashed_password:
                    raise HTTPException(status_code=403, detail=_ADMIN_ONLY_PASSWORD)
                if update_dict and self.repo.is_admin_role_name(db_user.role.name if db_user.role else None):
                    raise HTTPException(status_code=403, detail=_ADMIN_ONLY_MODIFY)

            if "username" in update_dict:
                other = self.repo.get_by_username(update_dict["username"])
                if other and other.id != user_id:
                    raise HTTPException(status_code=400, detail="Username already registered")
            if "email" in update_dict:
                other = self.repo.get_by_email(update_dict["email"])
                if other and other.id != user_id:
                    raise HTTPException(status_code=400, detail="Email already registered")

            # Never let the LAST active admin stop being one (deactivated, or
            # moved to a non-admin role), whatever the path or the letter case
            # of the role name.
            if db_user.is_active and self.repo.is_admin_role_name(db_user.role.name if db_user.role else None):
                still_active = update_dict.get("is_active", db_user.is_active)
                still_admin = self.repo.is_admin_role_name(new_role.name if new_role else None)
                if not (still_active and still_admin) and self.repo.count_active_admins(exclude_user_id=user_id) == 0:
                    detail = ("Cannot deactivate the last active Admin user" if not still_active
                              else "Cannot change the role of the last active Admin user")
                    raise HTTPException(status_code=400, detail=detail)

            was_active = bool(db_user.is_active)
            if hashed_password:
                update_dict["hashed_password"] = hashed_password
            if not update_dict:
                return db_user                   # nothing changed: no write, no audit row

            if hashed_password or (update_dict.get("is_active") is False and was_active):
                # Reuse the existing session-invalidation mechanism: after a
                # password reset, or a deactivation, every access/refresh token
                # issued before now is dead (get_current_user and /auth/refresh
                # compare the token's iat with this cutoff) — even if the account
                # is re-activated later. Written in the SAME transaction as the
                # new password hash and the audit entry.
                update_dict["tokens_valid_after"] = datetime.now(timezone.utc).replace(tzinfo=None)

            updated_user = self.repo.update(db_user, update_dict, commit=False)

            after = self._user_audit_snapshot(updated_user)
            if hashed_password:
                # A flag only — never the password or its hash — and present in
                # the new value only, so a password-only change is not recorded
                # as an unchanged snapshot.
                after["password_changed"] = True
            if before["is_active"] and not after["is_active"]:
                action = "DEACTIVATE"
            elif not before["is_active"] and after["is_active"]:
                action = "ACTIVATE"
            else:
                action = "UPDATE"

            strict_log_audit(
                self.repo.db, action, "User", str(updated_user.id), updated_user.username,
                old_value=before, new_value=after,
                user_id=current_user_id, username=current_username, reason=user_update.reason, strict=True,
            )
            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(updated_user)
            return updated_user
        except Exception:
            self.repo.db.rollback()
            raise

    # ---- Role Core Operations ----
    def get_role(self, role_id: int) -> Optional[models.Role]:
        return self.repo.get_role_by_id(role_id)

    def get_role_by_name(self, name: str) -> Optional[models.Role]:
        return self.repo.get_role_by_name(name)

    def get_roles(self, skip: int = 0, limit: int = 100) -> List[models.Role]:
        return self.repo.get_all_roles(skip, limit)

    def get_permissions(self, skip: int = 0, limit: int = 100) -> List[models.Permission]:
        return self.repo.get_all_permissions(skip, limit)

    @staticmethod
    def _role_audit_snapshot(role: models.Role) -> dict:
        """What a Role audit entry records: identity, description and the
        permission codes in a STABLE (sorted) order, so two reorderings of the
        same set never look like a change. Nothing credential-like is included."""
        return {
            "id": role.id,
            "name": role.name,
            "description": role.description,
            "permissions": sorted(p.code for p in role.permissions_rel),
        }

    def create_role(
        self,
        role: schemas.RoleCreate,
        current_user_id: int = None,
        current_username: str = None
    ) -> models.Role:
        # ONE transaction: role row + permission links + audit entry. The
        # repository is told not to commit; this method commits once at the
        # end, and any failure (including building/flushing the audit entry)
        # rolls the whole thing back.
        try:
            self.repo.lock_for_admin_change()
            if _admin_like_name(role.name) and not self._actor_is_admin(current_user_id):
                raise HTTPException(status_code=403, detail=_ADMIN_ONLY_ROLE)
            new_role = models.Role(name=role.name, description=role.description)
            if role.permissions:
                perms = self.repo.get_permissions_by_codes(role.permissions)
                new_role.permissions_rel = perms

            created_role = self.repo.create_role(new_role, commit=False)   # flushed: id assigned

            strict_log_audit(
                self.repo.db, "CREATE", "Role", str(created_role.id), created_role.name,
                new_value=self._role_audit_snapshot(created_role),
                user_id=current_user_id, username=current_username, reason=role.reason, strict=True,
            )
            self.repo.db.flush()          # surface an audit insert failure before committing
            self.repo.db.commit()
            self.repo.db.refresh(created_role)
            return created_role
        except Exception:
            self.repo.db.rollback()
            raise

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

        try:
            # Lock first, re-read the role and the ACTING user inside this transaction.
            self.repo.lock_for_admin_change()
            self.repo.db.refresh(db_role)

            # Only an Admin may touch the Admin role or mint one. Judged on the role's
            # identity BEFORE (an Admin role being changed) and AFTER (an ordinary role
            # being renamed into one) — and on real changes, so a form that resends the
            # Admin role unchanged is not refused.
            if not self._actor_is_admin(current_user_id):
                if role_update.name is not None and role_update.name != db_role.name and _admin_like_name(role_update.name):
                    raise HTTPException(status_code=403, detail=_ADMIN_ONLY_ROLE)
                if _admin_like_name(db_role.name):
                    current_codes = {p.code for p in db_role.permissions_rel}
                    changes = (
                        (role_update.name is not None and role_update.name != db_role.name)
                        or (role_update.description is not None and role_update.description != db_role.description)
                        or (role_update.permissions is not None and set(role_update.permissions) != current_codes)
                    )
                    if changes:
                        raise HTTPException(status_code=403, detail=_ADMIN_ONLY_ROLE)

            # Renaming the admin role away from "admin" would silently turn every
            # admin into an ordinary account — another way to remove the last admin.
            if role_update.name is not None and self.repo.is_admin_role_name(db_role.name) \
                    and not self.repo.is_admin_role_name(role_update.name):
                if self.repo.is_admin_role_name(db_role.name) \
                        and self.repo.count_active_users_in_role(role_id) > 0 \
                        and self.repo.count_active_admins(exclude_role_id=role_id) == 0:
                    raise HTTPException(
                        status_code=400,
                        detail="Cannot rename the Admin role: it would leave no active Admin user",
                    )

            old_val = self._role_audit_snapshot(db_role)      # captured BEFORE any change

            update_dict = {}
            if role_update.name is not None:
                update_dict["name"] = role_update.name
            if role_update.description is not None:
                update_dict["description"] = role_update.description

            if role_update.permissions is not None:
                perms = self.repo.get_permissions_by_codes(role_update.permissions)
                db_role.permissions_rel = perms

            updated_role = self.repo.update_role(db_role, update_dict, commit=False)

            strict_log_audit(
                self.repo.db, "UPDATE", "Role", str(updated_role.id), updated_role.name,
                old_value=old_val, new_value=self._role_audit_snapshot(updated_role),
                user_id=current_user_id, username=current_username, reason=role_update.reason, strict=True,
            )
            self.repo.db.flush()
            self.repo.db.commit()
            self.repo.db.refresh(updated_role)
            return updated_role
        except Exception:
            self.repo.db.rollback()
            raise

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

        # Only an Admin may delete the Admin role (checked on fresh state, before anything is written).
        if _admin_like_name(db_role.name):
            self.repo.lock_for_admin_change()
            self.repo.db.refresh(db_role)
            if _admin_like_name(db_role.name) and not self._actor_is_admin(current_user_id):
                self.repo.db.rollback()
                raise HTTPException(status_code=403, detail=_ADMIN_ONLY_ROLE)

        # Existing restriction kept exactly as it was: a role still assigned to
        # users cannot be deleted. Raised before anything is written.
        try:
            validators.check_role_references(self.repo.db, role_id, db_role.name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

        try:
            old_val = self._role_audit_snapshot(db_role)
            role_name = db_role.name
            self.repo.delete_role(db_role, commit=False)

            strict_log_audit(
                self.repo.db, "DELETE", "Role", str(role_id), role_name,
                old_value=old_val, user_id=current_user_id, username=current_username,
                reason=reason, strict=True,
            )
            self.repo.db.flush()
            self.repo.db.commit()
            return True
        except Exception:
            self.repo.db.rollback()
            raise
