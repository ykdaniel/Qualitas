"""Router-level tests for the IAM /users update endpoint.

Same shape as test_ncr_router.py: call the router function directly as a
plain Python function (bypassing FastAPI's Depends() injection) to exercise
the permission-gate logic that lives in the router itself, before it ever
reaches the service.
"""
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

import schemas
from routers.iam import update_user


def _user_with_permissions(uid, codes):
    role = SimpleNamespace(permissions_rel=[SimpleNamespace(code=c) for c in codes])
    return SimpleNamespace(id=uid, username="tester", role=role)


def _existing_user(uid=2, role_id=1):
    return SimpleNamespace(id=uid, username="target", role_id=role_id)


def test_update_user_rejects_role_change_without_role_manage():
    user_service = MagicMock()
    user_service.get_user.return_value = _existing_user(uid=2, role_id=1)
    actor = _user_with_permissions(1, ["iam:user:manage"])  # no iam:role:manage

    with pytest.raises(HTTPException) as excinfo:
        update_user(
            user_id=2,
            user=schemas.UserUpdate(role_id=99),
            user_service=user_service,
            current_user=actor,
        )
    assert excinfo.value.status_code == 403
    assert "iam:role:manage" in excinfo.value.detail
    user_service.update_user.assert_not_called()


def test_update_user_allows_noop_role_id_without_role_manage():
    user_service = MagicMock()
    user_service.get_user.return_value = _existing_user(uid=2, role_id=1)
    user_service.update_user.return_value = SimpleNamespace(id=2, role_id=1)
    actor = _user_with_permissions(1, ["iam:user:manage"])  # no iam:role:manage

    # role_id sent but identical to the existing value -> not a real change.
    result = update_user(
        user_id=2,
        user=schemas.UserUpdate(role_id=1),
        user_service=user_service,
        current_user=actor,
    )
    assert result.id == 2
    user_service.update_user.assert_called_once()


def test_update_user_allows_role_change_with_role_manage():
    user_service = MagicMock()
    user_service.get_user.return_value = _existing_user(uid=2, role_id=1)
    user_service.update_user.return_value = SimpleNamespace(id=2, role_id=99)
    actor = _user_with_permissions(1, ["iam:user:manage", "iam:role:manage"])

    result = update_user(
        user_id=2,
        user=schemas.UserUpdate(role_id=99),
        user_service=user_service,
        current_user=actor,
    )
    assert result.id == 2
    user_service.update_user.assert_called_once()


def test_update_user_blocks_self_role_change_even_with_role_manage():
    user_service = MagicMock()
    # Actor (id=1) is editing their own record.
    user_service.get_user.return_value = _existing_user(uid=1, role_id=1)
    actor = _user_with_permissions(1, ["iam:user:manage", "iam:role:manage"])

    with pytest.raises(HTTPException) as excinfo:
        update_user(
            user_id=1,
            user=schemas.UserUpdate(role_id=99),
            user_service=user_service,
            current_user=actor,
        )
    assert excinfo.value.status_code == 403
    assert "own role" in excinfo.value.detail
    user_service.update_user.assert_not_called()


def test_update_user_allows_self_edit_of_unrelated_fields():
    user_service = MagicMock()
    user_service.get_user.return_value = _existing_user(uid=1, role_id=1)
    user_service.update_user.return_value = SimpleNamespace(id=1, full_name="New Name")
    actor = _user_with_permissions(1, ["iam:user:manage"])  # no iam:role:manage

    # Editing your own name (not role_id) should never hit the role-change gate.
    result = update_user(
        user_id=1,
        user=schemas.UserUpdate(full_name="New Name"),
        user_service=user_service,
        current_user=actor,
    )
    assert result.full_name == "New Name"
    user_service.update_user.assert_called_once()
