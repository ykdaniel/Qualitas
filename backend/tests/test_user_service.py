import pytest
from unittest.mock import MagicMock
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
