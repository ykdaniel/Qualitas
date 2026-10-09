import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from services.itp_service import ITPService
from core.perms import ITP_CREATE, ITP_UPDATE, ITP_APPROVE, ITP_VOID, PermissionDenied
import schemas
import models

def test_create_itp_success():
    # Setup
    mock_repo = MagicMock()
    
    # Needs to mock the db session for _resolve_vendor_id and generate_reference_no
    # We will patch the crud functions to isolate testing.
    from unittest.mock import patch
    
    with patch('services.itp_service._resolve_vendor_id') as mock_resolve, \
         patch('services.itp_service.generate_reference_no') as mock_generate_ref, \
         patch('services.itp_service.log_audit') as mock_log:
         
        mock_resolve.return_value = "vendor_uuid_123"
        mock_generate_ref.return_value = "QTS-TEST-ITP-000001"
        
        mock_created_itp = models.ITP(
            id="itp_123", referenceNo="QTS-TEST-ITP-000001",
            description="Test ITP", vendor_id="vendor_uuid_123", status="Draft"
        )
        mock_repo.create.return_value = mock_created_itp
        
        service = ITPService(mock_repo)
        itp_data = schemas.ITPCreate(
            description="Test ITP",
            vendor="TestVendor",
            revision="0",
            status="Draft"
        )
        
        # Execute
        result = service.create_itp(itp_data, user_id=1, username="testadmin")
        
        # Assert
        assert result.id == "itp_123"
        assert result.referenceNo == "QTS-TEST-ITP-000001"
        assert result.vendor_id == "vendor_uuid_123"
        mock_repo.create.assert_called_once()
        
        # Ensure correct dictionary was passed to create model
        args, kwargs = mock_repo.create.call_args
        assert args[0].description == "Test ITP"
        assert args[0].vendor_id == "vendor_uuid_123"
        mock_log.assert_called_once()


def test_update_itp_invalid_transition():
    # Setup
    mock_repo = MagicMock()
    
    # Mock existing status as Approved
    mock_db_itp = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    mock_repo.get_by_id.return_value = mock_db_itp
    
    service = ITPService(mock_repo)
    
    # Try invalid transition from Approved -> Draft
    itp_update = schemas.ITPUpdate(status="Draft")
    
    # Execute & Assert
    with pytest.raises(ValueError) as excinfo:
        service.update_itp("itp_123", itp_update)
    
    assert "Invalid status transition" in str(excinfo.value)
    assert "'Approved'" in str(excinfo.value)
    assert "'Draft'" in str(excinfo.value)

def test_update_itp_valid_transition():
    # Setup
    mock_repo = MagicMock()
    mock_db_itp = models.ITP(id="itp_123", status="Draft", referenceNo="QTS")
    mock_repo.get_by_id.return_value = mock_db_itp
    
    # Provide an updated object 
    mock_updated_itp = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    mock_repo.update.return_value = mock_updated_itp
    
    service = ITPService(mock_repo)
    
    from unittest.mock import patch
    with patch('services.itp_service.log_audit') as mock_log:
        itp_update = schemas.ITPUpdate(status="Pending")
        
        result = service.update_itp("itp_123", itp_update)
        
        assert result.status == "Pending"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()


# ── ITP Approve/Void authorization gate (2026-09-28) ──────────────────────────────────────────
# Reproduces the confirmed bypass (an account with plain itp:create:all/itp:update:all could
# POST/PUT an ITP straight into Approved or Void — see BACKLOG) and then confirms the fix.
# user_permissions is always an explicit set built from the caller's real permission codes; these
# tests never rely on role name.

def test_create_itp_approved_without_approve_permission_is_denied():
    mock_repo = MagicMock()
    service = ITPService(mock_repo)
    itp_data = schemas.ITPCreate(description="x", vendor="V", status="Approved")

    with pytest.raises(PermissionDenied) as excinfo:
        service.create_itp(itp_data, user_id=1, username="u", user_permissions={ITP_CREATE})
    assert excinfo.value.required_permission == ITP_APPROVE
    # Nothing written: no reference number consumed, no row created, no audit entry.
    mock_repo.create.assert_not_called()


def test_create_itp_approved_with_only_create_and_no_permissions_arg_is_denied():
    """An omitted user_permissions must be treated as "no permissions", never "allow"."""
    mock_repo = MagicMock()
    service = ITPService(mock_repo)
    itp_data = schemas.ITPCreate(description="x", vendor="V", status="Approved")

    with pytest.raises(PermissionDenied):
        service.create_itp(itp_data, user_id=1, username="u")  # user_permissions omitted entirely
    mock_repo.create.assert_not_called()


def test_create_itp_void_without_void_permission_is_denied():
    mock_repo = MagicMock()
    service = ITPService(mock_repo)
    itp_data = schemas.ITPCreate(description="x", vendor="V", status="Void")

    with pytest.raises(PermissionDenied) as excinfo:
        service.create_itp(itp_data, user_id=1, username="u", user_permissions={ITP_CREATE, ITP_APPROVE})
    assert excinfo.value.required_permission == ITP_VOID
    mock_repo.create.assert_not_called()


def test_create_itp_approved_with_approve_permission_succeeds():
    mock_repo = MagicMock()
    with patch('services.itp_service._resolve_vendor_id') as mock_resolve, \
         patch('services.itp_service.generate_reference_no') as mock_generate_ref, \
         patch('services.itp_service.log_audit'):
        mock_resolve.return_value = "vendor_uuid_123"
        mock_generate_ref.return_value = "QTS-TEST-ITP-000002"
        mock_repo.create.return_value = models.ITP(id="itp_1", referenceNo="QTS-TEST-ITP-000002", status="Approved")

        service = ITPService(mock_repo)
        itp_data = schemas.ITPCreate(description="x", vendor="V", status="Approved")
        result = service.create_itp(itp_data, user_id=1, username="u", user_permissions={ITP_CREATE, ITP_APPROVE})
        assert result.status == "Approved"
        mock_repo.create.assert_called_once()


def test_update_itp_entering_approved_without_approve_permission_is_denied():
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    service = ITPService(mock_repo)

    with pytest.raises(PermissionDenied) as excinfo:
        service.update_itp("itp_123", schemas.ITPUpdate(status="Approved"), user_permissions={ITP_UPDATE})
    assert excinfo.value.required_permission == ITP_APPROVE
    # Rejected before any write: no field changes, no audit entry.
    mock_repo.update.assert_not_called()


def test_update_itp_entering_approved_with_comments_without_approve_permission_is_denied():
    """"Approved with comments" is treated as part of the Approved family for this gate — see
    services/itp_service.py::_ITP_APPROVAL_STATUSES for the reasoning (a judgment call, not a
    stated policy)."""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    service = ITPService(mock_repo)

    with pytest.raises(PermissionDenied) as excinfo:
        service.update_itp("itp_123", schemas.ITPUpdate(status="Approved with comments"), user_permissions={ITP_UPDATE})
    assert excinfo.value.required_permission == ITP_APPROVE
    mock_repo.update.assert_not_called()


def test_update_itp_entering_void_without_void_permission_is_denied():
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    service = ITPService(mock_repo)

    with pytest.raises(PermissionDenied) as excinfo:
        service.update_itp("itp_123", schemas.ITPUpdate(status="Void"), user_permissions={ITP_UPDATE, ITP_APPROVE})
    assert excinfo.value.required_permission == ITP_VOID
    mock_repo.update.assert_not_called()


def test_update_itp_with_approve_permission_and_only_basic_update_missing_is_also_denied():
    """Holding itp:approve:all alone is not enough either — the endpoint itself is still gated by
    RoleChecker(ITP_UPDATE) at the router; this test documents that the SERVICE's own gate is an
    ADDITIONAL requirement on top of, not instead of, the base update permission the router
    already demands to reach this method at all. (The router dependency itself is what actually
    enforces "missing basic update" in production; this test exercises the service function in
    isolation, so it only proves the approve-permission check activates correctly.)"""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    service = ITPService(mock_repo)

    with pytest.raises(PermissionDenied):
        service.update_itp("itp_123", schemas.ITPUpdate(status="Void"), user_permissions={ITP_APPROVE})
    mock_repo.update.assert_not_called()


def test_update_itp_entering_approved_with_approve_permission_succeeds():
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    mock_repo.update.return_value = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    service = ITPService(mock_repo)

    with patch('services.itp_service.log_audit'):
        result = service.update_itp("itp_123", schemas.ITPUpdate(status="Approved"), user_permissions={ITP_UPDATE, ITP_APPROVE})
    assert result.status == "Approved"
    mock_repo.update.assert_called_once()


def test_update_itp_same_status_resend_needs_no_approve_permission():
    """Re-sending the record's own current (already-Approved) status is a no-op transition per
    WorkflowEngine and must not newly require approve permission — unchanged from before this
    batch."""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    mock_repo.update.return_value = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    service = ITPService(mock_repo)

    with patch('services.itp_service.log_audit'):
        result = service.update_itp("itp_123", schemas.ITPUpdate(status="Approved", remark="r"), user_permissions=set())
    assert result.status == "Approved"
    mock_repo.update.assert_called_once()


def test_update_itp_leaving_approved_needs_no_new_permission():
    """Approved -> Pending is an existing legal WorkflowEngine transition that has never required
    a special permission; this batch adds gates for ENTERING Approved/Void only, not leaving."""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    mock_repo.update.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    service = ITPService(mock_repo)

    with patch('services.itp_service.log_audit'):
        result = service.update_itp("itp_123", schemas.ITPUpdate(status="Pending"), user_permissions=set())
    assert result.status == "Pending"
    mock_repo.update.assert_called_once()


def test_update_itp_lateral_move_within_approved_family_requires_approve_permission():
    """Approved -> Approved with comments is a REAL status change (not a same-value resend), so
    it requires itp:approve:all like any other entry into the approval family — this is a
    correction, not the original design: an earlier version of this gate exempted moves between
    the two approval-family statuses, which was flagged and reversed after review (2026-09-28)
    because it was an unrequested narrowing beyond the stated rule ("更新進入 Approved 需要
    update+approve" has no stated carve-out for "already Approved with comments"). Whether
    "Approved with comments" itself belongs in the approval family at all remains a SEPARATE,
    still-unconfirmed judgment call (see _ITP_APPROVAL_STATUSES) — this test only pins down that,
    GIVEN that family membership, entry into either member from the other is gated the same as
    entry from outside the family. Do not read this test as confirming the family membership
    question itself is settled policy."""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    service = ITPService(mock_repo)

    with pytest.raises(PermissionDenied) as excinfo:
        service.update_itp("itp_123", schemas.ITPUpdate(status="Approved with comments"), user_permissions=set())
    assert excinfo.value.required_permission == ITP_APPROVE
    mock_repo.update.assert_not_called()


def test_update_itp_lateral_move_within_approved_family_succeeds_with_approve_permission():
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    mock_repo.update.return_value = models.ITP(id="itp_123", status="Approved with comments", referenceNo="QTS")
    service = ITPService(mock_repo)

    with patch('services.itp_service.log_audit'):
        result = service.update_itp("itp_123", schemas.ITPUpdate(status="Approved with comments"), user_permissions={ITP_APPROVE})
    assert result.status == "Approved with comments"
    mock_repo.update.assert_called_once()


def test_update_itp_ordinary_field_edit_needs_no_new_permission():
    """A plain field edit with no status change at all must not be affected by this gate."""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    mock_repo.update.return_value = models.ITP(id="itp_123", status="Pending", referenceNo="QTS", remark="updated")
    service = ITPService(mock_repo)

    with patch('services.itp_service.log_audit'):
        result = service.update_itp("itp_123", schemas.ITPUpdate(remark="updated"), user_permissions=set())
    assert result.remark == "updated"
    mock_repo.update.assert_called_once()


def test_update_itp_rejected_for_permission_still_enforces_illegal_transition_afterwards():
    """Entering Void from Void (a no-op) needs no permission; but entering Void from a status with
    NO legal path to Void must still be rejected as an invalid transition once permission is
    granted — the permission gate does not loosen WorkflowEngine's own rules."""
    mock_repo = MagicMock()
    # WorkflowEngine.TRANSITIONS["ITP"]["Void"] = [] — nothing may leave Void, including back to
    # Void itself is a no-op (handled separately), but a transition INTO a state Void cannot
    # reach is still illegal regardless of permission.
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Void", referenceNo="QTS")
    service = ITPService(mock_repo)

    with pytest.raises(ValueError) as excinfo:
        service.update_itp("itp_123", schemas.ITPUpdate(status="Pending"), user_permissions={ITP_UPDATE, ITP_APPROVE, ITP_VOID})
    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()


# ── Scope-check ordering: does a missing approve/void permission ever leak whether an
# out-of-scope (vs. simply nonexistent) record exists? ──────────────────────────────────────────
# update_itp's code order is: get_by_id -> record_in_scope check (return None if either fails) ->
# ONLY THEN the permission check. These two tests confirm that ordering with an account that
# lacks itp:approve:all: record_in_scope failing (out-of-scope record) must produce the exact same
# outcome — a bare None, before PermissionDenied is ever raised — as record_in_scope never being
# reached at all (nonexistent record). Both must short-circuit identically so the router turns
# both into an identical 404, never a 403 that would (by responding differently) confirm the
# out-of-scope record exists. This does not by itself prove the real HTTP layer behaves
# identically — see the isolated-browser run for that live evidence.
def test_update_itp_nonexistent_id_returns_none_without_reaching_permission_check():
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = None
    service = ITPService(mock_repo)

    result = service.update_itp("does-not-exist", schemas.ITPUpdate(status="Approved"), user_permissions=set())
    assert result is None
    mock_repo.update.assert_not_called()


def test_update_itp_out_of_scope_id_returns_none_without_reaching_permission_check():
    """Same missing-permission caller, but the record DOES exist — just outside the caller's
    scope. Must return the identical bare None as the nonexistent-id case above (record_in_scope
    is checked, and short-circuits, before the permission check ever runs — so a caller missing
    itp:approve:all can never distinguish "doesn't exist" from "exists but out of my scope" via
    this permission gate)."""
    mock_repo = MagicMock()
    mock_repo.get_by_id.return_value = models.ITP(id="itp_123", status="Pending", project_id="OTHER-PROJECT", referenceNo="QTS")
    service = ITPService(mock_repo)

    from core.scope import Scope
    out_of_scope = Scope(project_ids=frozenset({"MY-PROJECT"}), vendor_id=None)
    result = service.update_itp("itp_123", schemas.ITPUpdate(status="Approved"), scope=out_of_scope, user_permissions=set())
    assert result is None
    mock_repo.update.assert_not_called()
