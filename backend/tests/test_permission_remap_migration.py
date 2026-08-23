"""Regression test for the legacy permission-code remap migration
(db_migrations._remap_legacy_permission_codes).

Found while wiring NCR owner-approval permission gating: custom roles
(ENGINEER, QA_MANAGER, VIEWER, ...) that were ever granted a permission under
the old UPPER_SNAKE naming scheme (e.g. "NCR_APPROVE") were silently broken —
db_seeder.py only ever inserts missing new-format rows and re-syncs the ADMIN
role, so every other role stayed linked to the dead legacy permission id.
"""
from unittest.mock import patch

from sqlalchemy import text

import db_migrations
import models


def test_remap_moves_role_off_legacy_permission_onto_current_one(db_session):
    # Arrange: a legacy-format row, its current-format counterpart (as if
    # db_seeder already inserted it this boot), and a role linked to the
    # legacy one only — the exact broken state found in production data.
    legacy_perm = models.Permission(code="NCR_APPROVE", description="old")
    new_perm = models.Permission(code="ncr:approve:all", description="new")
    role = models.Role(name="QA_MANAGER_TEST")
    db_session.add_all([legacy_perm, new_perm, role])
    db_session.commit()
    db_session.refresh(legacy_perm)
    db_session.refresh(new_perm)
    db_session.refresh(role)

    db_session.execute(
        text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"),
        {"r": role.id, "p": legacy_perm.id},
    )
    db_session.commit()

    # Act — redirect the migration's module-level `engine` at the same
    # in-memory database db_session is using, since it normally targets the
    # real configured DB via `from database import engine`.
    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._remap_legacy_permission_codes()

    # Assert: the role is now on the current-format permission, and the
    # orphaned legacy row is gone (so it can't happen again).
    db_session.expire_all()
    role_codes = [p.code for p in db_session.get(models.Role, role.id).permissions_rel]
    assert role_codes == ["ncr:approve:all"]
    assert db_session.query(models.Permission).filter_by(code="NCR_APPROVE").first() is None


def test_remap_renames_in_place_when_no_current_format_row_exists(db_session):
    # No "ncr:approve:all" row seeded yet — the migration should rename the
    # legacy row in place rather than fail, so role links stay valid as-is.
    legacy_perm = models.Permission(code="NCR_APPROVE", description="old")
    role = models.Role(name="QA_MANAGER_TEST2")
    db_session.add_all([legacy_perm, role])
    db_session.commit()
    db_session.refresh(legacy_perm)
    db_session.refresh(role)

    db_session.execute(
        text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"),
        {"r": role.id, "p": legacy_perm.id},
    )
    db_session.commit()

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._remap_legacy_permission_codes()

    db_session.expire_all()
    role_codes = [p.code for p in db_session.get(models.Role, role.id).permissions_rel]
    assert role_codes == ["ncr:approve:all"]


def test_remap_is_idempotent(db_session):
    legacy_perm = models.Permission(code="NCR_APPROVE", description="old")
    new_perm = models.Permission(code="ncr:approve:all", description="new")
    role = models.Role(name="QA_MANAGER_TEST3")
    db_session.add_all([legacy_perm, new_perm, role])
    db_session.commit()
    db_session.refresh(legacy_perm)
    db_session.refresh(role)

    db_session.execute(
        text("INSERT INTO role_permissions (role_id, permission_id) VALUES (:r, :p)"),
        {"r": role.id, "p": legacy_perm.id},
    )
    db_session.commit()

    with patch("db_migrations.engine", db_session.get_bind()):
        db_migrations._remap_legacy_permission_codes()
        # Second run should be a clean no-op — nothing left pointing at a
        # legacy code, so nothing to do.
        db_migrations._remap_legacy_permission_codes()

    db_session.expire_all()
    role_codes = [p.code for p in db_session.get(models.Role, role.id).permissions_rel]
    assert role_codes == ["ncr:approve:all"]
