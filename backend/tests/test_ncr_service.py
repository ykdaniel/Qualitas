import pytest
from unittest.mock import MagicMock, patch
from services.ncr_service import NCRService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def ncr_service(mock_repo):
    return NCRService(mock_repo)

def test_create_ncr_success(ncr_service, mock_repo):
    # Arrange
    ncr_data = schemas.NCRCreate(
        subject="Test NCR Subject",
        vendor="TestVendor",
        raiseDate="2026-01-01",
        status="Open",
        foundLocation="Building A",
        description="Test Description",
        type="Internal",
        rev="A",
        submit="Initial"
    )

    with patch('services.ncr_service._resolve_vendor_id') as mock_resolve, \
         patch('services.ncr_service.generate_reference_no') as mock_gen_ref, \
         patch('services.ncr_service.log_audit') as mock_log:

        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "NCR-QTS-TEST-001"

        mock_created_ncr = models.NCR(
            id="ncr-123",
            documentNumber="NCR-QTS-TEST-001",
            vendor_id="vendor-uuid-123",
            status="Open"
        )
        mock_repo.create.return_value = mock_created_ncr

        # Act
        result = ncr_service.create_ncr(ncr_data, user_id=1, username="admin")

        # Assert
        assert result.id == "ncr-123"
        assert result.documentNumber == "NCR-QTS-TEST-001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_ncr_status_transition_fail(ncr_service, mock_repo):
    # Arrange
    # Current status is Closed
    mock_db_ncr = models.NCR(id="ncr-123", status="Closed", documentNumber="NCR-001")
    mock_repo.get_by_id.return_value = mock_db_ncr

    # Try to change back to Open (forbidden by WorkflowEngine)
    ncr_update = schemas.NCRUpdate(status="Open")

    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        ncr_service.update_ncr("ncr-123", ncr_update)

    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_ncr_success(ncr_service, mock_repo):
    # Arrange
    mock_db_ncr = models.NCR(id="ncr-123", status="Open", documentNumber="NCR-001")
    mock_repo.get_by_id.return_value = mock_db_ncr

    with patch('services.ncr_service.log_audit') as mock_log:
        ncr_update = schemas.NCRUpdate(status="In Progress", description="Updated Description")

        mock_updated_ncr = models.NCR(id="ncr-123", status="In Progress", description="Updated Description")
        mock_repo.update.return_value = mock_updated_ncr

        # Act
        result = ncr_service.update_ncr("ncr-123", ncr_update, user_id=1, username="admin")

        # Assert
        assert result.status == "In Progress"
        assert result.description == "Updated Description"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_ncr_success(ncr_service, mock_repo):
    # Arrange — only Void NCRs can be deleted
    mock_db_ncr = models.NCR(id="ncr-123", documentNumber="NCR-001", status="Void")
    mock_repo.get_by_id.return_value = mock_db_ncr
    mock_repo.db.query.return_value.filter.return_value.count.return_value = 0

    with patch('services.ncr_service.log_audit') as mock_log:
        # Act
        result = ncr_service.delete_ncr("ncr-123", user_id=1, username="admin")

        # Assert
        assert result is True
        mock_repo.delete.assert_called_once()
        mock_log.assert_called_once()


def test_delete_ncr_blocked_by_non_void_status(ncr_service, mock_repo):
    """Non-Void NCRs cannot be deleted (anti-gaming guard)."""
    mock_db_ncr = models.NCR(id="ncr-123", documentNumber="NCR-001", status="Open")
    mock_repo.get_by_id.return_value = mock_db_ncr

    with pytest.raises(ValueError, match="Void the NCR first"):
        ncr_service.delete_ncr("ncr-123", user_id=1, username="admin")
    mock_repo.delete.assert_not_called()


def test_delete_ncr_blocked_by_itr_references(ncr_service, mock_repo):
    # Arrange — Void NCR but still referenced by ITRs
    mock_db_ncr = models.NCR(id="ncr-123", documentNumber="NCR-001", status="Void")
    mock_repo.get_by_id.return_value = mock_db_ncr
    mock_repo.db.query.return_value.filter.return_value.count.return_value = 2

    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        ncr_service.delete_ncr("ncr-123", user_id=1, username="admin")

    assert "referenced by 2 ITR record(s)" in str(excinfo.value)
    mock_repo.delete.assert_not_called()
