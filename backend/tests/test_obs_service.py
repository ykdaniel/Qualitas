import pytest
from unittest.mock import MagicMock, patch
from services.obs_service import OBSService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def obs_service(mock_repo):
    return OBSService(mock_repo)

def test_create_obs_success(obs_service, mock_repo):
    # Arrange
    obs_data = schemas.OBSCreate(
        vendor="TestVendor",
        description="Test observation",
        rev="A",
        submit="Initial",
        status="Open",
        subject="Test Subject",
        foundLocation="Site A"
    )
    
    with patch('services.obs_service._resolve_vendor_id') as mock_resolve, \
         patch('services.obs_service.generate_reference_no') as mock_gen_ref, \
         patch('services.obs_service.log_audit') as mock_log:
        
        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "OBS-QTS-TEST-001"
        
        mock_created_obs = models.OBS(
            id="obs-123",
            documentNumber="OBS-QTS-TEST-001",
            vendor_id="vendor-uuid-123",
            status="Open"
        )
        mock_repo.create.return_value = mock_created_obs
        
        # Act
        result = obs_service.create_obs(obs_data, user_id=1, username="admin")
        
        # Assert
        assert result.id == "obs-123"
        assert result.documentNumber == "OBS-QTS-TEST-001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_obs_status_transition_fail(obs_service, mock_repo):
    # Arrange
    # Current status is Void (terminal — nothing else allowed)
    mock_db_obs = models.OBS(id="obs-123", status="Void", documentNumber="OBS-001")
    mock_repo.get_by_id.return_value = mock_db_obs

    # Try to change Void -> Open (forbidden by WorkflowEngine for OBS)
    obs_update = schemas.OBSUpdate(status="Open")

    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        obs_service.update_obs("obs-123", obs_update)

    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_obs_success(obs_service, mock_repo):
    # Arrange
    # Open -> In Progress is valid for OBS
    mock_db_obs = models.OBS(id="obs-123", status="Open", documentNumber="OBS-001")
    mock_repo.get_by_id.return_value = mock_db_obs
    
    with patch('services.obs_service.log_audit') as mock_log:
        obs_update = schemas.OBSUpdate(status="In Progress", description="Updated Obs")
        
        mock_updated_obs = models.OBS(id="obs-123", status="In Progress", description="Updated Obs")
        mock_repo.update.return_value = mock_updated_obs
        
        # Act
        result = obs_service.update_obs("obs-123", obs_update, user_id=1, username="admin")
        
        # Assert
        assert result.status == "In Progress"
        assert result.description == "Updated Obs"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()
