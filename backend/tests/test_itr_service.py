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
        status="In Progress",
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
            status="In Progress"
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
    
    # Try to change to Reject (Approved → Reject is not allowed in new workflow — only via In Progress)
    # Actually Approved → In Progress → Reject. Let's test Void → Approved which is always forbidden.
    mock_db_itr.status = "Void"
    itr_update = schemas.ITRUpdate(status="Approved")
    
    # Act & Assert
    with pytest.raises(ValueError) as excinfo:
        itr_service.update_itr("itr-123", itr_update)
    
    assert "Invalid status transition" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_itr_success(itr_service, mock_repo):
    # Arrange
    mock_db_itr = models.ITR(id="itr-123", status="In Progress", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr

    with patch('services.itr_service.log_audit') as mock_log:
        # In Progress -> Approved is valid
        itr_update = schemas.ITRUpdate(status="Approved", subject="NEW SUBJECT")

        mock_updated_itr = models.ITR(id="itr-123", status="Approved", subject="NEW SUBJECT")
        mock_repo.update.return_value = mock_updated_itr

        # Act
        result = itr_service.update_itr("itr-123", itr_update, user_id=1, username="admin")

        # Assert
        assert result.status == "Approved"
        assert result.subject == "NEW SUBJECT"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_link_checklist_creates_instance_without_polluting_template(itr_service, mock_repo):
    """§17: linking copies the template into a new ITR-owned instance; the
    shared template row is never mutated."""
    # Arrange
    mock_db_itr = models.ITR(id="itr-123", documentNumber="ITR-001", project_id="proj-1")
    mock_repo.get_by_id.return_value = mock_db_itr
    template = models.Checklist(
        id="tpl-1", recordsNo="CL-TPL", status="Ongoing",
        detail_data='{"items": []}', template_id=None, itrId=None,
    )
    mock_repo.db.query.return_value.filter.return_value.first.return_value = template

    with patch('services.itr_service.log_audit') as mock_log, \
         patch('services.itr_service.generate_reference_no', return_value="CL-NEW-001"):
        # Act
        result = itr_service.link_checklist("itr-123", "tpl-1", user_id=1, username="admin")

        # Assert — the ITR is returned, and a NEW instance row was added
        assert result.id == "itr-123"
        mock_repo.db.add.assert_called_once()
        instance = mock_repo.db.add.call_args[0][0]
        assert isinstance(instance, models.Checklist)
        assert instance.id != "tpl-1"               # a fresh row, not the template
        assert instance.itrId == "itr-123"
        assert instance.itrNumber == "ITR-001"
        assert instance.template_id == "tpl-1"      # points back to the template
        assert instance.project_id == "proj-1"      # inherits the ITR's project
        assert instance.recordsNo == "CL-NEW-001"
        # template must be untouched
        assert template.itrId is None
        mock_repo.db.commit.assert_called_once()
        mock_log.assert_called_once()


def test_unlink_checklist_deletes_instance(itr_service, mock_repo):
    """§17: unlinking removes the ITR-owned instance row (not a template)."""
    mock_db_itr = models.ITR(id="itr-123", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr
    instance = models.Checklist(id="inst-9", itrId="itr-123")
    mock_repo.db.query.return_value.filter.return_value.first.return_value = instance

    with patch('services.itr_service.log_audit') as mock_log:
        result = itr_service.unlink_checklist("itr-123", "inst-9", user_id=1, username="admin")

        assert result.id == "itr-123"
        mock_repo.db.delete.assert_called_once_with(instance)
        mock_repo.db.commit.assert_called_once()
        mock_log.assert_called_once()
