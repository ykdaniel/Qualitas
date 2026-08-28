import pytest
from unittest.mock import MagicMock, patch
from fastapi import HTTPException
from services.user_service import UserService
import schemas
import models

def test_create_user_success():
    # Setup
    mock_repo = MagicMock()
    mock_repo.get_by_email.return_value = None
    mock_repo.get_by_username.return_value = None
    
    mock_created_user = models.User(id=1, username="testuser", email="test@test.com", role_id=1)
    mock_repo.create.return_value = mock_created_user
    
    service = UserService(mock_repo)
    user_data = schemas.UserCreate(
        username="testuser", email="test@test.com", password="password123!", role_id=1, full_name="Test User"
    )
    
    # Execute
    result = service.create_user(user_data)
    
    # Assert
    assert result.username == "testuser"
    assert result.email == "test@test.com"
    mock_repo.create.assert_called_once()
    assert mock_repo.create.call_args[0][0].username == "testuser"

def test_create_user_persists_company_name():
    # Regression: create_user() builds models.User(...) by listing fields
    # explicitly rather than spreading the schema — company_name has to be
    # named there too or it's silently dropped even though the schema and
    # DB column both support it.
    mock_repo = MagicMock()
    mock_repo.get_by_email.return_value = None
    mock_repo.get_by_username.return_value = None
    mock_repo.create.side_effect = lambda u: u

    service = UserService(mock_repo)
    user_data = schemas.UserCreate(
        username="testuser", email="test@test.com", password="password123!",
        role_id=1, full_name="Test User", company_name="Qualitas",
    )

    result = service.create_user(user_data)

    assert result.company_name == "Qualitas"


def test_display_company_prefers_vendor_over_company_name():
    vendor = models.Contractor(id="v-1", name="Real Vendor Co")
    user = models.User(id=1, username="contractor_user", company_name="Stale Label")
    user.vendor_ref = vendor  # transient assignment, no DB session needed

    assert user.display_company == "Real Vendor Co"


def test_display_company_falls_back_to_company_name_for_internal_staff():
    user = models.User(id=2, username="pm_user", company_name="Qualitas")

    assert user.display_company == "Qualitas"


def test_display_company_none_when_neither_set():
    user = models.User(id=3, username="bare_user")

    assert user.display_company is None


def test_create_user_duplicate_email():
    mock_repo = MagicMock()
    mock_repo.get_by_email.return_value = models.User()
    
    service = UserService(mock_repo)
    user_data = schemas.UserCreate(
        username="testuser", email="test@test.com", password="password", role_id=1, full_name="Test"
    )
    
    with pytest.raises(HTTPException) as excinfo:
        service.create_user(user_data)
    
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == "Email already registered"

def test_delete_last_admin_prevented():
    mock_repo = MagicMock()
    admin_role = models.Role(name="Admin")
    admin_user = models.User(id=1, username="admin", role=admin_role, is_active=True)
    
    mock_repo.get_by_id.return_value = admin_user
    mock_repo.count_active_admins.return_value = 1
    
    service = UserService(mock_repo)
    
    with pytest.raises(HTTPException) as excinfo:
        service.delete_user(1)

    assert excinfo.value.status_code == 400
    assert "Cannot delete the last active Admin" in excinfo.value.detail


def test_delete_role_blocked_when_users_assigned():
    """User.role_id declares ondelete='SET NULL' but SQLite never actually
    enforces it (PRAGMA foreign_keys is off) — deleting an in-use Role
    would leave assigned users with a dangling role_id and silently lock
    them out of every permission-gated action. Must be blocked instead."""
    mock_repo = MagicMock()
    mock_role = models.Role(id=5, name="Inspector")
    mock_role.permissions_rel = []
    mock_repo.get_role_by_id.return_value = mock_role

    service = UserService(mock_repo)

    with patch('services.user_service.validators.check_role_references') as mock_check:
        mock_check.side_effect = ValueError(
            "Cannot delete role 'Inspector': referenced by 3 User record(s)"
        )

        with pytest.raises(HTTPException) as excinfo:
            service.delete_role(5)

        assert excinfo.value.status_code == 400
        assert "Cannot delete role" in excinfo.value.detail
        mock_check.assert_called_once_with(mock_repo.db, 5, "Inspector")
        mock_repo.delete_role.assert_not_called()


def test_delete_role_success_when_unassigned():
    mock_repo = MagicMock()
    mock_role = models.Role(id=6, name="Unused Role")
    mock_role.permissions_rel = []
    mock_repo.get_role_by_id.return_value = mock_role

    service = UserService(mock_repo)

    with patch('services.user_service.validators.check_role_references') as mock_check, \
         patch('services.user_service.log_audit') as mock_log:
        mock_check.return_value = None

        result = service.delete_role(6, current_user_id=1, current_username="admin")

        assert result is True
        mock_check.assert_called_once_with(mock_repo.db, 6, "Unused Role")
        mock_repo.delete_role.assert_called_once_with(mock_role)
        mock_log.assert_called_once()
