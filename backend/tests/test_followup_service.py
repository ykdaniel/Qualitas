import pytest
from unittest.mock import MagicMock, patch
from services.followup_service import FollowUpService
import models
import schemas
import json

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def followup_service(mock_repo):
    return FollowUpService(mock_repo)

def test_create_followup_auto_issue_no(followup_service, mock_repo):
    # Arrange
    fw_data = schemas.FollowUpCreate(
        title="Test Issue",
        description="A testing issue",
        status="Open",
        vendor="Test Vendor",
        createdAt="2026-01-01",
        updatedAt="2026-01-01"
    )

    with patch('services.followup_service._resolve_vendor_id') as mock_resolve, \
         patch('services.followup_service.generate_reference_no') as mock_gen_ref, \
         patch('services.followup_service.log_audit') as mock_log:

        mock_resolve.return_value = "vendor-123"
        mock_gen_ref.return_value = "FW-QTS-001"

        mock_created = models.FollowUp(
            id="fw-123",
            issueNo="FW-QTS-001",
            vendor_id="vendor-123",
            title="Test Issue"
        )
        mock_repo.create.return_value = mock_created

        # Act
        result = followup_service.create_followup(fw_data, user_id=1, username="admin")

        # Assert
        assert result.id == "fw-123"
        assert result.issueNo == "FW-QTS-001"
        assert result.vendor_id == "vendor-123"
        mock_gen_ref.assert_called_once_with(mock_repo.db, "Test Vendor", "followup")
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_create_followup_explicit_issue_no(followup_service, mock_repo):
    # Arrange
    fw_data = schemas.FollowUpCreate(
        issueNo="CUSTOM-FW-01",
        title="Test Issue 2",
        description="A testing issue 2",
        status="Open",
        createdAt="2026-01-01",
        updatedAt="2026-01-01"
    )

    with patch('services.followup_service.generate_reference_no') as mock_gen_ref, \
         patch('services.followup_service.log_audit') as mock_log:

        mock_created = models.FollowUp(
            id="fw-123",
            issueNo="CUSTOM-FW-01",
            title="Test Issue 2"
        )
        mock_repo.create.return_value = mock_created

        # Act
        result = followup_service.create_followup(fw_data, user_id=1, username="admin")

        # Assert
        assert result.issueNo == "CUSTOM-FW-01"
        mock_gen_ref.assert_not_called()
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_followup_success(followup_service, mock_repo):
    # Arrange
    mock_db_fw = models.FollowUp(id="fw-123", issueNo="FW-01", title="Old Title")
    mock_repo.get_by_id.return_value = mock_db_fw

    fw_update = schemas.FollowUpUpdate(title="New Title", vendor="New Vendor")

    # Create mock column_attrs for the inspect mock
    class MockColumn:
        def __init__(self, name):
            self.name = name

    with patch('services.followup_service.log_audit') as mock_log, \
         patch('services.followup_service._resolve_vendor_id') as mock_resolve, \
         patch('services.followup_service.getattr', create=True) as mock_getattr: # Using create=True for builtin mock workaround

        # Manually set up the __table__.columns mock behavior since SQLAlchemy object mocking is tricky
        mock_db_fw.__table__ = MagicMock()
        mock_db_fw.__table__.columns = [MockColumn("id"), MockColumn("issueNo")]

        # We actually don't want to mock getattr entirely since the test environment needs it to function.
        # Instead, we are just happy that log_audit captures something.
        pass

    with patch('services.followup_service.log_audit') as mock_log, \
         patch('services.followup_service._resolve_vendor_id') as mock_resolve:

        mock_db_fw.__table__ = MagicMock()
        mock_db_fw.__table__.columns = [MockColumn("id"), MockColumn("title")]

        mock_resolve.return_value = "new-vendor-123"

        mock_updated = models.FollowUp(id="fw-123", issueNo="FW-01", title="New Title", vendor_id="new-vendor-123")
        mock_repo.update.return_value = mock_updated

        # Act
        result = followup_service.update_followup("fw-123", fw_update, user_id=1, username="admin")

        # Assert
        assert result.title == "New Title"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_followup(followup_service, mock_repo):
    # Arrange
    mock_db_fw = models.FollowUp(id="fw-123", issueNo="FW-01")
    mock_repo.get_by_id.return_value = mock_db_fw

    class MockColumn:
        def __init__(self, name):
            self.name = name

    with patch('services.followup_service.log_audit') as mock_log:

        mock_db_fw.__table__ = MagicMock()
        mock_db_fw.__table__.columns = [MockColumn("id"), MockColumn("issueNo")]

        # Act
        result = followup_service.delete_followup("fw-123")

        # Assert
        assert result is True
        mock_repo.delete.assert_called_once_with(mock_db_fw)
        mock_log.assert_called_once()

