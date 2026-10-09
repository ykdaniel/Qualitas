"""Router-level tests for the PQP update/publish endpoints.

Same shape as test_ncr_router.py / test_iam_router.py: call the router
function directly as a plain Python function (bypassing FastAPI's Depends()
injection) to exercise the permission-gate logic that lives in the router
itself, before it ever reaches the service.
"""
import pytest
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi import HTTPException

import schemas
from routers.pqp import update_pqp, publish_pqp


def _user_with_permissions(codes):
    role = SimpleNamespace(permissions_rel=[SimpleNamespace(code=c) for c in codes])
    return SimpleNamespace(id=1, username="tester", role=role)


def _existing_pqp(status="Under Review"):
    return SimpleNamespace(id="pqp-1", status=status)


def test_update_pqp_rejects_approval_without_pqp_approve():
    pqp_service = MagicMock()
    pqp_service.get_pqp.return_value = _existing_pqp(status="Under Review")
    user = _user_with_permissions(["pqp:update:all"])  # no pqp:approve:all

    with pytest.raises(HTTPException) as excinfo:
        update_pqp(
            pqp_id="pqp-1",
            pqp=schemas.PQPUpdate(status="Approved"),
            pqp_service=pqp_service,
            scope=None,
            current_user=user,
        )
    assert excinfo.value.status_code == 403
    assert "pqp:approve:all" in excinfo.value.detail
    pqp_service.update_pqp.assert_not_called()


def test_update_pqp_allows_unrelated_field_change_without_pqp_approve():
    pqp_service = MagicMock()
    pqp_service.get_pqp.return_value = _existing_pqp(status="Under Review")
    pqp_service.update_pqp.return_value = schemas.PQP(
        id="pqp-1", title="x", description="d", status="Under Review",
        version="Rev1.0", createdAt="2026-01-01", updatedAt="2026-01-01",
    )
    user = _user_with_permissions(["pqp:update:all"])  # no pqp:approve:all

    result = update_pqp(
        pqp_id="pqp-1",
        pqp=schemas.PQPUpdate(title="new title"),  # status unchanged
        pqp_service=pqp_service,
        scope=None,
        current_user=user,
    )
    assert result.id == "pqp-1"
    pqp_service.update_pqp.assert_called_once()


def test_update_pqp_allows_approval_with_pqp_approve():
    pqp_service = MagicMock()
    pqp_service.get_pqp.return_value = _existing_pqp(status="Under Review")
    pqp_service.update_pqp.return_value = schemas.PQP(
        id="pqp-1", title="x", description="d", status="Approved",
        version="Rev1.0", createdAt="2026-01-01", updatedAt="2026-01-01",
    )
    user = _user_with_permissions(["pqp:update:all", "pqp:approve:all"])

    result = update_pqp(
        pqp_id="pqp-1",
        pqp=schemas.PQPUpdate(status="Approved"),
        pqp_service=pqp_service,
        scope=None,
        current_user=user,
    )
    assert result.status == "Approved"
    pqp_service.update_pqp.assert_called_once()


def test_publish_pqp_out_of_scope_returns_404():
    pqp_service = MagicMock()
    pqp_service.publish_pqp.return_value = None  # scope check inside service filtered it out
    user = _user_with_permissions(["pqp:approve:all"])

    with pytest.raises(HTTPException) as excinfo:
        publish_pqp(
            pqp_id="pqp-1",
            body=schemas.PQPPublish(),
            pqp_service=pqp_service,
            scope="some-scope",
            current_user=user,
        )
    assert excinfo.value.status_code == 404
    pqp_service.publish_pqp.assert_called_once()
    _, kwargs = pqp_service.publish_pqp.call_args
    assert kwargs["scope"] == "some-scope"
