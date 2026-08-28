import pytest
from unittest.mock import MagicMock, patch
from services.meeting_minutes_service import MeetingMinutesService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def meeting_service(mock_repo):
    return MeetingMinutesService(mock_repo)

def test_create_meeting_minutes_success(meeting_service, mock_repo):
    # Arrange
    meeting_data = schemas.MeetingMinutesCreate(
        vendor="TestVendor",
        status="Draft",
        title="Weekly Progress Meeting",
        meetingDate="2026-01-01",
    )

    with patch('services.meeting_minutes_service._resolve_vendor_id') as mock_resolve, \
         patch('services.meeting_minutes_service.generate_reference_no') as mock_gen_ref, \
         patch('services.meeting_minutes_service.log_audit') as mock_log:

        mock_resolve.return_value = "vendor-uuid-123"
        mock_gen_ref.return_value = "QTS-RKS-TEST-MOM-000001"

        mock_created = models.MeetingMinutes(
            id="mtg-123",
            documentNumber="QTS-RKS-TEST-MOM-000001",
            vendor_id="vendor-uuid-123",
            status="Draft",
        )
        mock_repo.create.return_value = mock_created

        # Act
        result = meeting_service.create_meeting_minutes(meeting_data, user_id=1, username="admin")

        # Assert
        assert result.id == "mtg-123"
        assert result.documentNumber == "QTS-RKS-TEST-MOM-000001"
        assert result.vendor_id == "vendor-uuid-123"
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_meeting_minutes_status_transition_fail(meeting_service, mock_repo):
    # Arrange
    # Current status is Published (terminal — nothing else allowed)
    mock_db_meeting = models.MeetingMinutes(id="mtg-123", status="Published", documentNumber="MOM-001")
    mock_repo.get_by_id.return_value = mock_db_meeting

    # Try to change Published -> Draft (forbidden by WorkflowEngine for MeetingMinutes)
    meeting_update = schemas.MeetingMinutesUpdate(status="Draft")

    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        meeting_service.update_meeting_minutes("mtg-123", meeting_update)

    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_meeting_minutes_success(meeting_service, mock_repo):
    # Arrange
    # Draft -> Published is valid for MeetingMinutes
    mock_db_meeting = models.MeetingMinutes(id="mtg-123", status="Draft", documentNumber="MOM-001")
    mock_repo.get_by_id.return_value = mock_db_meeting

    with patch('services.meeting_minutes_service.log_audit') as mock_log:
        meeting_update = schemas.MeetingMinutesUpdate(status="Published", title="Updated Title")

        mock_updated = models.MeetingMinutes(id="mtg-123", status="Published", title="Updated Title")
        mock_repo.update.return_value = mock_updated

        # Act
        result = meeting_service.update_meeting_minutes("mtg-123", meeting_update, user_id=1, username="admin")

        # Assert
        assert result.status == "Published"
        assert result.title == "Updated Title"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_update_published_meeting_minutes_rejects_field_change(meeting_service, mock_repo):
    """A Published meeting minute is a true dead end (WorkflowEngine's
    "Published": [] means no reopen transition exists at all), so any
    field change should be rejected outright — same shape as NOI's
    Closed-state hard lock."""
    mock_db_meeting = models.MeetingMinutes(
        id="mtg-123", status="Published", documentNumber="MOM-001", title="original",
    )
    mock_repo.get_by_id.return_value = mock_db_meeting

    meeting_update = schemas.MeetingMinutesUpdate(title="trying to sneak in a change")

    with pytest.raises(ValueError) as excinfo:
        meeting_service.update_meeting_minutes("mtg-123", meeting_update)

    assert "published" in str(excinfo.value).lower()
    mock_repo.update.assert_not_called()

def test_update_published_meeting_minutes_allows_noop_resave(meeting_service, mock_repo):
    """The frontend resends the whole record on every save, so a field
    being present in the payload with its existing value (no real change)
    must not be treated as an attempted edit."""
    mock_db_meeting = models.MeetingMinutes(
        id="mtg-123", status="Published", documentNumber="MOM-001", title="same value",
    )
    mock_repo.get_by_id.return_value = mock_db_meeting

    with patch('services.meeting_minutes_service.log_audit') as mock_log:
        meeting_update = schemas.MeetingMinutesUpdate(title="same value")
        mock_repo.update.return_value = mock_db_meeting

        result = meeting_service.update_meeting_minutes("mtg-123", meeting_update, user_id=1, username="admin")

        assert result.status == "Published"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_meeting_minutes_success(meeting_service, mock_repo):
    mock_db_meeting = models.MeetingMinutes(id="mtg-123", status="Draft", documentNumber="MOM-001")
    mock_repo.get_by_id.return_value = mock_db_meeting

    with patch('services.meeting_minutes_service.log_audit') as mock_log:
        result = meeting_service.delete_meeting_minutes("mtg-123", user_id=1, username="admin")

        assert result is True
        mock_repo.delete.assert_called_once_with(mock_db_meeting)
        mock_log.assert_called_once()
