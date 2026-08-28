import pytest
from unittest.mock import MagicMock, patch
from services.itr_service import ITRService
from core.scope import Scope
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


def test_delete_itr_blocked_by_referencing_ncr(itr_service, mock_repo):
    """Existing guard: an ITR referenced by an NCR's reInspectionNumber
    cannot be deleted until that reference is removed."""
    mock_db_itr = models.ITR(id="itr-123", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr

    referencing_ncr = models.NCR(id="ncr-1", documentNumber="NCR-001", reInspectionNumber="ITR-001")
    mock_repo.db.query.return_value.filter.return_value.all.return_value = [referencing_ncr]

    with pytest.raises(ValueError) as excinfo:
        itr_service.delete_itr("itr-123")

    assert "referenced by NCR" in str(excinfo.value)
    mock_repo.delete.assert_not_called()


def test_delete_itr_cleans_up_checklist_instances_and_reinsp_chain(itr_service, mock_repo):
    """Checklist.itrId (ondelete='CASCADE') and ITR.originalItrId
    (ondelete='SET NULL') never actually fire — SQLite FK enforcement is
    off. delete_itr must clean these up itself: delete owned Checklist
    instances (they have no meaning without the parent ITR — §17), and
    null out any re-inspection ITRs' back-reference instead of leaving it
    dangling."""
    mock_db_itr = models.ITR(id="itr-123", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr

    # No NCR references this ITR, so the existing guard passes through.
    mock_repo.db.query.return_value.filter.return_value.all.return_value = []

    with patch('services.itr_service.log_audit'):
        result = itr_service.delete_itr("itr-123", user_id=1, username="admin")

        assert result is True
        mock_repo.db.query.assert_any_call(models.Checklist)
        mock_repo.db.query.assert_any_call(models.ITR)
        mock_repo.db.query.return_value.filter.return_value.delete.assert_called()
        mock_repo.db.query.return_value.filter.return_value.update.assert_called_once_with(
            {models.ITR.originalItrId: None}
        )
        mock_repo.delete.assert_called_once_with(mock_db_itr)


def test_approve_itr_blocked_by_ongoing_checklist(itr_service, mock_repo):
    """Gap B fix: approval must reject an 'Ongoing' (unfilled/incomplete)
    checklist too, not just an explicit 'Fail' — an ITR must not be
    approvable while its linked inspection was never actually completed."""
    mock_db_itr = models.ITR(id="itr-123", status="In Progress", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr

    ongoing_checklist = models.Checklist(id="cl-1", recordsNo="CL-001", itrId="itr-123", status="Ongoing")
    mock_repo.db.query.return_value.filter.return_value.all.return_value = [ongoing_checklist]

    itr_update = schemas.ITRUpdate(status="Approved")

    with pytest.raises(ValueError) as excinfo:
        itr_service.update_itr("itr-123", itr_update)

    assert "not passed" in str(excinfo.value)
    assert "CL-001" in str(excinfo.value)
    mock_repo.update.assert_not_called()


def test_approve_itr_blocked_by_failed_checklist(itr_service, mock_repo):
    mock_db_itr = models.ITR(id="itr-123", status="In Progress", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr

    failed_checklist = models.Checklist(id="cl-1", recordsNo="CL-001", itrId="itr-123", status="Fail")
    mock_repo.db.query.return_value.filter.return_value.all.return_value = [failed_checklist]

    itr_update = schemas.ITRUpdate(status="Approved")

    with pytest.raises(ValueError) as excinfo:
        itr_service.update_itr("itr-123", itr_update)

    assert "not passed" in str(excinfo.value)
    mock_repo.update.assert_not_called()


def test_approve_itr_succeeds_when_all_checklists_pass(itr_service, mock_repo):
    mock_db_itr = models.ITR(id="itr-123", status="In Progress", documentNumber="ITR-001")
    mock_repo.get_by_id.return_value = mock_db_itr

    passed_checklist = models.Checklist(id="cl-1", recordsNo="CL-001", itrId="itr-123", status="Pass")
    mock_repo.db.query.return_value.filter.return_value.all.return_value = [passed_checklist]

    with patch('services.itr_service.log_audit'):
        itr_update = schemas.ITRUpdate(status="Approved")
        mock_repo.update.return_value = models.ITR(id="itr-123", status="Approved")

        result = itr_service.update_itr("itr-123", itr_update, user_id=1, username="admin")

        assert result.status == "Approved"
        mock_repo.update.assert_called_once()


def test_create_ncr_from_itr_blocked_out_of_scope(itr_service, mock_repo):
    """create-ncr previously took no scope at all — a user could derive an
    NCR from an ITR outside their project/vendor scope by ID."""
    mock_db_itr = models.ITR(
        id="itr-123", documentNumber="ITR-001", status="Reject",
        inspectionResult="Fail", project_id="OTHER-PROJECT",
    )
    mock_repo.get_by_id.return_value = mock_db_itr
    out_of_scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)

    result = itr_service.create_ncr_from_itr("itr-123", scope=out_of_scope)

    assert result is None
    mock_repo.db.add.assert_not_called()


def test_create_ncr_from_itr_inherits_project_id(itr_service, mock_repo):
    """The new NCR must inherit the source ITR's project_id — without it,
    the created record silently falls outside its expected scope."""
    mock_db_itr = models.ITR(
        id="itr-123", documentNumber="ITR-001", status="Reject",
        inspectionResult="Fail", project_id="P1", vendor_id="vendor-1",
    )
    mock_repo.get_by_id.return_value = mock_db_itr
    in_scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)

    with patch('services.itr_service.generate_reference_no', return_value="NCR-001"), \
         patch('services.itr_service.log_audit'):
        itr_service.create_ncr_from_itr("itr-123", scope=in_scope)

    created_ncr = mock_repo.db.add.call_args[0][0]
    assert created_ncr.project_id == "P1"


def test_create_reinspection_blocked_out_of_scope(itr_service, mock_repo):
    """re-inspect previously took no scope at all — same IDOR-style gap as
    create-ncr."""
    mock_db_itr = models.ITR(
        id="itr-123", documentNumber="ITR-001", status="Reject",
        inspectionResult="Fail", project_id="OTHER-PROJECT",
    )
    mock_repo.get_by_id.return_value = mock_db_itr
    out_of_scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)

    result = itr_service.create_reinspection("itr-123", scope=out_of_scope)

    assert result is None
    mock_repo.db.add.assert_not_called()


def test_create_reinspection_inherits_project_id(itr_service, mock_repo):
    mock_db_itr = models.ITR(
        id="itr-123", documentNumber="ITR-001", status="Reject",
        inspectionResult="Fail", project_id="P1", vendor_id="vendor-1",
    )
    mock_repo.get_by_id.return_value = mock_db_itr
    in_scope = Scope(project_ids=frozenset({"P1"}), vendor_id=None)

    with patch('services.itr_service.generate_reference_no', return_value="ITR-002"), \
         patch('services.itr_service.log_audit'):
        itr_service.create_reinspection("itr-123", scope=in_scope)

    created_itr = mock_repo.db.add.call_args[0][0]
    assert created_itr.project_id == "P1"


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
