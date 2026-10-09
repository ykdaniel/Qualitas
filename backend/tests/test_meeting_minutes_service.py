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
    """A Void record can always be deleted — see delete_meeting_minutes'
    guard (mirrors ncr_service.py's delete_ncr)."""
    mock_db_meeting = models.MeetingMinutes(id="mtg-123", status="Void", documentNumber="MOM-001")
    mock_repo.get_by_id.return_value = mock_db_meeting

    with patch('services.meeting_minutes_service.log_audit') as mock_log:
        result = meeting_service.delete_meeting_minutes("mtg-123", user_id=1, username="admin")

        assert result is True
        mock_repo.delete.assert_called_once_with(mock_db_meeting)
        mock_log.assert_called_once()

def test_delete_meeting_minutes_draft_allowed_and_reclaims_number(meeting_service, mock_repo):
    """A Draft was never published — nobody could have referenced its
    number externally, so it can be deleted directly (no Void required)
    and its number is best-effort reclaimed."""
    mock_db_meeting = models.MeetingMinutes(id="mtg-123", status="Draft", documentNumber="MOM-001")
    mock_repo.get_by_id.return_value = mock_db_meeting

    with patch('services.meeting_minutes_service.log_audit') as mock_log, \
         patch('services.meeting_minutes_service.reclaim_reference_no') as mock_reclaim:
        result = meeting_service.delete_meeting_minutes("mtg-123", user_id=1, username="admin")

        assert result is True
        mock_reclaim.assert_called_once_with(mock_repo.db, '', 'meeting')
        mock_repo.delete.assert_called_once_with(mock_db_meeting)
        mock_log.assert_called_once()

def test_delete_meeting_minutes_blocked_when_published(meeting_service, mock_repo):
    mock_db_meeting = models.MeetingMinutes(id="mtg-123", status="Published", documentNumber="MOM-001")
    mock_repo.get_by_id.return_value = mock_db_meeting

    with pytest.raises(ValueError) as excinfo:
        meeting_service.delete_meeting_minutes("mtg-123", user_id=1, username="admin")

    assert "void" in str(excinfo.value).lower()
    mock_repo.delete.assert_not_called()

def test_update_published_meeting_minutes_allows_void_transition(meeting_service, mock_repo):
    """The one legal change on an otherwise-locked Published record: voiding it."""
    mock_db_meeting = models.MeetingMinutes(
        id="mtg-123", status="Published", documentNumber="MOM-001", title="original",
    )
    mock_repo.get_by_id.return_value = mock_db_meeting

    with patch('services.meeting_minutes_service.log_audit') as mock_log:
        meeting_update = schemas.MeetingMinutesUpdate(status="Void")
        mock_repo.update.return_value = mock_db_meeting

        result = meeting_service.update_meeting_minutes("mtg-123", meeting_update, user_id=1, username="admin")

        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_update_published_meeting_minutes_rejects_void_plus_other_changes(meeting_service, mock_repo):
    """Voiding a Published record must not smuggle in other field changes
    in the same request."""
    mock_db_meeting = models.MeetingMinutes(
        id="mtg-123", status="Published", documentNumber="MOM-001", title="original",
    )
    mock_repo.get_by_id.return_value = mock_db_meeting

    meeting_update = schemas.MeetingMinutesUpdate(status="Void", title="sneaking in a change too")

    with pytest.raises(ValueError):
        meeting_service.update_meeting_minutes("mtg-123", meeting_update)

    mock_repo.update.assert_not_called()

def test_update_void_meeting_minutes_rejects_any_change(meeting_service, mock_repo):
    """Void is a true one-way sink — WorkflowEngine's "Void": [] means no
    further transitions, and no other field may change either."""
    mock_db_meeting = models.MeetingMinutes(
        id="mtg-123", status="Void", documentNumber="MOM-001", title="original",
    )
    mock_repo.get_by_id.return_value = mock_db_meeting

    meeting_update = schemas.MeetingMinutesUpdate(title="trying to edit a voided record")

    with pytest.raises(ValueError):
        meeting_service.update_meeting_minutes("mtg-123", meeting_update)

    mock_repo.update.assert_not_called()

def test_create_new_occurrence_bumps_rev_and_carries_fields(meeting_service, mock_repo):
    """BACKLOG #18: new occurrence shares the source's documentNumber,
    computes next_rev from the max across all siblings (not just the
    source's own rev), starts as Draft, carries vendor/project/meetingType/
    organizer/location/attendees, and does NOT carry discussionLog or
    meetingDate."""
    source = models.MeetingMinutes(
        id="mtg-src", documentNumber="MOM-001", rev="2.0", status="Published",
        title="Weekly Sync - 2026-08-24", project_id="proj-1", vendor_id="vendor-1",
        meetingType="Weekly", location="Site Office", organizer="Alice",
        attendees='[{"name": "Bob", "company": "Acme"}]',
        discussionLog='[{"no": "1", "level": 0, "content": "old agenda"}]',
        meetingDate="2026-08-24",
    )
    sibling = models.MeetingMinutes(id="mtg-sib", documentNumber="MOM-001", rev="1.0")
    mock_repo.get_by_id.return_value = source
    mock_repo.get_all_by_document_number.return_value = [source, sibling]

    with patch('services.meeting_minutes_service.log_audit') as mock_log:
        result = meeting_service.create_new_occurrence("mtg-src", user_id=1, username="admin")

    mock_repo.get_all_by_document_number.assert_called_once_with("MOM-001")
    new_meeting = mock_repo.db.add.call_args[0][0]
    assert new_meeting.documentNumber == "MOM-001"
    assert new_meeting.rev == "3.0"
    assert new_meeting.status == "Draft"
    assert new_meeting.title.startswith("Weekly Sync - ")  # old date suffix stripped, new one appended
    assert new_meeting.title.count(" - ") == 1
    assert new_meeting.project_id == "proj-1"
    assert new_meeting.vendor_id == "vendor-1"
    assert new_meeting.meetingType == "Weekly"
    assert new_meeting.location == "Site Office"
    assert new_meeting.organizer == "Alice"
    assert new_meeting.attendees == '[{"name": "Bob", "company": "Acme"}]'
    assert new_meeting.discussionLog is None
    assert new_meeting.meetingDate is None
    assert result is new_meeting
    assert mock_log.call_count == 2  # new row + a marker on the source
