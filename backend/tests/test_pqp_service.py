import pytest
from unittest.mock import MagicMock, patch
from services.pqp_service import PQPService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def pqp_service(mock_repo):
    return PQPService(mock_repo)

def test_create_pqp_success(pqp_service, mock_repo):
    # Arrange
    pqp_data = schemas.PQPCreate(
        title="Test PQP",
        description="Test PQP Description",
        vendor="TestVendor",
        status="Approved",
        version="Rev 1.0",
        createdAt="2026-01-01",
        updatedAt="2026-01-01"
    )
    
    with patch('services.pqp_service._resolve_vendor_id') as mock_resolve, \
         patch('services.pqp_service.generate_reference_no') as mock_gen_ref, \
         patch('services.pqp_service.log_audit') as mock_log:
        
        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "PQP-QTS-TEST-001"
        
        mock_created_pqp = models.PQP(
            id="pqp-123",
            pqpNo="PQP-QTS-TEST-001",
            vendor_id="vendor-uuid-123",
            status="Approved"
        )
        mock_repo.create.return_value = mock_created_pqp
        
        # Act
        result = pqp_service.create_pqp(pqp_data, user_id=1, username="admin")
        
        # Assert
        assert result.id == "pqp-123"
        assert result.pqpNo == "PQP-QTS-TEST-001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_pqp_status_transition_fail(pqp_service, mock_repo):
    # Arrange
    # Current status is Approved
    mock_db_pqp = models.PQP(id="pqp-123", status="Approved", pqpNo="PQP-001")
    mock_repo.get_by_id.return_value = mock_db_pqp
    
    # Try to change back to Draft (forbidden by WorkflowEngine for PQP)
    pqp_update = schemas.PQPUpdate(status="Draft")
    
    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        pqp_service.update_pqp("pqp-123", pqp_update)
    
    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_pqp_success(pqp_service, mock_repo):
    # Arrange
    # Draft -> Pending is valid for PQP
    mock_db_pqp = models.PQP(id="pqp-123", status="Draft", pqpNo="PQP-001")
    mock_repo.get_by_id.return_value = mock_db_pqp
    
    with patch('services.pqp_service.log_audit') as mock_log:
        pqp_update = schemas.PQPUpdate(status="Pending", title="Updated Title")
        
        mock_updated_pqp = models.PQP(id="pqp-123", status="Pending", title="Updated Title")
        mock_repo.update.return_value = mock_updated_pqp
        
        # Act
        result = pqp_service.update_pqp("pqp-123", pqp_update, user_id=1, username="admin")
        
        # Assert
        assert result.status == "Pending"
        assert result.title == "Updated Title"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()
