import pytest
from unittest.mock import MagicMock, patch
from services.osd_service import OSDService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def osd_service(mock_repo):
    return OSDService(mock_repo)

def test_create_osd_success(osd_service, mock_repo):
    # Arrange
    osd_data = schemas.OSDCreate(
        vendor="TestVendor",
        status="Open",
        itemDescription="Rebar cage",
        deliveryNoteNo="DN-001",
        expectedQty="10",
        receivedQty="8",
    )

    with patch('services.osd_service._resolve_vendor_id') as mock_resolve, \
         patch('services.osd_service.generate_reference_no') as mock_gen_ref, \
         patch('services.osd_service.log_audit') as mock_log:

        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "OSD-QTS-TEST-001"

        mock_created_osd = models.OSD(
            id="osd-123",
            documentNumber="OSD-QTS-TEST-001",
            vendor_id="vendor-uuid-123",
            status="Open"
        )
        mock_repo.create.return_value = mock_created_osd

        # Act
        result = osd_service.create_osd(osd_data, user_id=1, username="admin")

        # Assert
        assert result.id == "osd-123"
        assert result.documentNumber == "OSD-QTS-TEST-001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_osd_status_transition_fail(osd_service, mock_repo):
    # Arrange
    # Current status is Void (terminal — nothing else allowed)
    mock_db_osd = models.OSD(id="osd-123", status="Void", documentNumber="OSD-001")
    mock_repo.get_by_id.return_value = mock_db_osd

    # Try to change Void -> Open (forbidden by WorkflowEngine for OSD)
    osd_update = schemas.OSDUpdate(status="Open")

    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        osd_service.update_osd("osd-123", osd_update)

    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_osd_success(osd_service, mock_repo):
    # Arrange
    # Open -> Resolved is valid for OSD
    mock_db_osd = models.OSD(id="osd-123", status="Open", documentNumber="OSD-001")
    mock_repo.get_by_id.return_value = mock_db_osd

    with patch('services.osd_service.log_audit') as mock_log:
        osd_update = schemas.OSDUpdate(status="Resolved", disposition="Accept")

        mock_updated_osd = models.OSD(id="osd-123", status="Resolved", disposition="Accept")
        mock_repo.update.return_value = mock_updated_osd

        # Act
        result = osd_service.update_osd("osd-123", osd_update, user_id=1, username="admin")

        # Assert
        assert result.status == "Resolved"
        assert result.disposition == "Accept"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_osd_success(osd_service, mock_repo):
    mock_db_osd = models.OSD(id="osd-123", status="Open", documentNumber="OSD-001")
    mock_repo.get_by_id.return_value = mock_db_osd

    with patch('services.osd_service.log_audit') as mock_log:
        result = osd_service.delete_osd("osd-123", user_id=1, username="admin")

        assert result is True
        mock_repo.delete.assert_called_once_with(mock_db_osd, commit=False)
        mock_log.assert_called_once()
