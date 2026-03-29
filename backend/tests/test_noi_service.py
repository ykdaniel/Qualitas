import pytest
from unittest.mock import MagicMock, patch
from services.noi_service import NOIService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def noi_service(mock_repo):
    return NOIService(mock_repo)

def test_create_noi_success(noi_service, mock_repo):
    # Arrange
    noi_data = schemas.NOICreate(
        package="TEST_PKG",
        issueDate="2026-01-01",
        inspectionTime="10:00",
        itpNo="ITP-QTS-VEND-001",
        inspectionDate="2026-01-02",
        type="Hold Point",
        checkpoint="FOUNDATION_INSPECTION",
        contractor="TestVendor",
        status="Open"
    )
    
    with patch('services.noi_service._resolve_vendor_id') as mock_resolve, \
         patch('services.noi_service.generate_reference_no') as mock_gen_ref, \
         patch('services.noi_service.log_audit') as mock_log:
        
        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "NOI-QTS-TEST-001"
        
        mock_created_noi = models.NOI(
            id="noi-123",
            referenceNo="NOI-QTS-TEST-001",
            vendor_id="vendor-uuid-123",
            status="Open"
        )
        mock_repo.create.return_value = mock_created_noi
        
        # Act
        result = noi_service.create_noi(noi_data, user_id=1, username="admin")
        
        # Assert
        assert result.id == "noi-123"
        assert result.referenceNo == "NOI-QTS-TEST-001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_noi_status_transition_fail(noi_service, mock_repo):
    # Arrange
    # Current status is Closed
    mock_db_noi = models.NOI(id="noi-123", status="Closed", referenceNo="NOI-001")
    mock_repo.get_by_id.return_value = mock_db_noi
    
    # Try to change back to Open (forbidden by WorkflowEngine)
    noi_update = schemas.NOIUpdate(status="Open")
    
    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        noi_service.update_noi("noi-123", noi_update)
    
    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_noi_success(noi_service, mock_repo):
    # Arrange
    mock_db_noi = models.NOI(id="noi-123", status="Open", referenceNo="NOI-001")
    mock_repo.get_by_id.return_value = mock_db_noi
    
    with patch('services.noi_service.log_audit') as mock_log:
        # Open -> In Progress is a valid transition
        noi_update = schemas.NOIUpdate(checkpoint="NEW_POINT", status="In Progress")
        
        mock_updated_noi = models.NOI(id="noi-123", status="In Progress", checkpoint="NEW_POINT")
        mock_repo.update.return_value = mock_updated_noi
        
        # Act
        result = noi_service.update_noi("noi-123", noi_update, user_id=1, username="admin")
        
        # Assert
        assert result.status == "In Progress"
        assert result.checkpoint == "NEW_POINT"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_noi_success(noi_service, mock_repo):
    # Arrange
    mock_db_noi = models.NOI(id="noi-123", referenceNo="NOI-001")
    mock_repo.get_by_id.return_value = mock_db_noi
    
    with patch('services.noi_service.log_audit') as mock_log:
        # Act
        result = noi_service.delete_noi("noi-123", user_id=1, username="admin")
        
        # Assert
        assert result is True
        mock_repo.delete.assert_called_once()
        mock_log.assert_called_once()
