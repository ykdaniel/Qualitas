import pytest
from unittest.mock import MagicMock, patch
from services.itr_service import ITRService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def itr_service(mock_repo):
    return ITRService(mock_repo)

def test_create_itr_success(itr_service, mock_repo):
    # Arrange
    itr_data = schemas.ITRCreate(
        vendor="TestVendor",
        description="Test description",
        rev="A",
        submit="Initial",
        status="Draft",
        subject="Test Subject",
        type="Type A"
    )
    
    with patch('services.itr_service._resolve_vendor_id') as mock_resolve, \
         patch('services.itr_service.generate_reference_no') as mock_gen_ref, \
         patch('services.itr_service.log_audit') as mock_log:
        
        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "ITR-QTS-TEST-001"
        
        mock_created_itr = models.ITR(
            id="itr-123",
            documentNumber="ITR-QTS-TEST-001",
            vendor_id="vendor-uuid-123",
            status="Draft"
        )
        mock_repo.create.return_value = mock_created_itr
        
        # Act
        result = itr_service.create_itr(itr_data, user_id=1, username="admin")
        
        # Assert
        assert result.id == "itr-123"
        assert result.documentNumber == "ITR-QTS-TEST-001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_itr_status_transition_fail(itr_service, mock_repo):
    # Arrange
    # Current status is Approved
    mock_db_itr = models.ITR(id="itr-123", status="Approved", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr
    
    # Try to change back to Draft (normally forbidden by WorkflowEngine)
    itr_update = schemas.ITRUpdate(status="Draft")
    
    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        itr_service.update_itr("itr-123", itr_update)
    
    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_itr_success(itr_service, mock_repo):
    # Arrange
    mock_db_itr = models.ITR(id="itr-123", status="Draft", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr
    
    with patch('services.itr_service.log_audit') as mock_log:
        # Draft -> Submitted is valid
        itr_update = schemas.ITRUpdate(status="Submitted", subject="NEW SUBJECT")
        
        mock_updated_itr = models.ITR(id="itr-123", status="Submitted", subject="NEW SUBJECT")
        mock_repo.update.return_value = mock_updated_itr
        
        # Act
        result = itr_service.update_itr("itr-123", itr_update, user_id=1, username="admin")
        
        # Assert
        assert result.status == "Submitted"
        assert result.subject == "NEW SUBJECT"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_link_checklist_success(itr_service, mock_repo):
    # Arrange
    mock_db_itr = models.ITR(id="itr-123", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr
    
    with patch('services.itr_service.log_audit') as mock_log:
        mock_repo.link_checklist.return_value = mock_db_itr
        
        # Act
        result = itr_service.link_checklist("itr-123", "checklist-456", user_id=1, username="admin")
        
        # Assert
        assert result.id == "itr-123"
        mock_repo.link_checklist.assert_called_once_with(mock_db_itr, "checklist-456")
        mock_log.assert_called_once()
