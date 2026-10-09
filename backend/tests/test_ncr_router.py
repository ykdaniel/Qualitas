"""Router-level tests for the NCR endpoints.

This suite otherwise tests at the service layer (mocked or real db_session)
and doesn't use FastAPI's TestClient anywhere, so — consistent with that —
these call the router function directly as a plain Python function with
constructed arguments, bypassing the Depends() injection (which only
resolves at actual HTTP-request time). That's enough to exercise the
permission-gate logic that lives in the router itself, before it ever
reaches the service.
"""
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

import schemas
from routers.ncr import update_ncr


def _user_with_permissions(codes):
    role = SimpleNamespace(permissions_rel=[SimpleNamespace(code=c) for c in codes])
    return SimpleNamespace(id=1, username="tester", role=role)


def test_update_ncr_rejects_owner_approval_without_permission():
    ncr_service = MagicMock()
    user = _user_with_permissions(["ncr:update:all"])  # no ncr:approve:all

    with pytest.raises(HTTPException) as excinfo:
        update_ncr(
            ncr_id="ncr-123",
            ncr=schemas.NCRUpdate(ownerApproval="Approved"),
            ncr_service=ncr_service,
            scope=None,
            current_user=user,
        )
    assert excinfo.value.status_code == 403
    assert "ncr:approve:all" in excinfo.value.detail
    ncr_service.update_ncr.assert_not_called()


def test_update_ncr_allows_owner_approval_with_permission():
    ncr_service = MagicMock()
    ncr_service.update_ncr.return_value = schemas.NCR(
        id="ncr-123", documentNumber="NCR-001", description="x", rev="0",
        submit="v", status="Open",
    )
    user = _user_with_permissions(["ncr:update:all", "ncr:approve:all"])

    result = update_ncr(
        ncr_id="ncr-123",
        ncr=schemas.NCRUpdate(ownerApproval="Approved"),
        ncr_service=ncr_service,
        scope=None,
        current_user=user,
    )
    assert result.id == "ncr-123"
    ncr_service.update_ncr.assert_called_once()


def test_update_ncr_ignores_permission_gate_for_unrelated_fields():
    ncr_service = MagicMock()
    ncr_service.update_ncr.return_value = schemas.NCR(
        id="ncr-123", documentNumber="NCR-001", description="x", rev="0",
        submit="v", status="Open",
    )
    user = _user_with_permissions(["ncr:update:all"])  # no ncr:approve:all

    # Editing an unrelated field shouldn't require ncr:approve:all at all.
    result = update_ncr(
        ncr_id="ncr-123",
        ncr=schemas.NCRUpdate(remark="just a note"),
        ncr_service=ncr_service,
        scope=None,
        current_user=user,
    )
    assert result.id == "ncr-123"
    ncr_service.update_ncr.assert_called_once()
