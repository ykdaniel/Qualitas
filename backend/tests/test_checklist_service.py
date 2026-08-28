import pytest
from unittest.mock import MagicMock, patch
from services.checklist_service import ChecklistService
import models
import schemas
import json

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def checklist_service(mock_repo):
    return ChecklistService(mock_repo)

def test_create_checklist_auto_records_no(checklist_service, mock_repo):
    chk_data = schemas.ChecklistCreate(
        recordsNo="[AUTO-GENERATE]",
        activity="Test Activity",
        date="2026-01-01",
        status="Ongoing",
        packageName="PKG-01",
        contractor="Vendor A",
        detail_data=json.dumps({"key": "value"})
    )
    
    with patch('services.checklist_service._resolve_vendor_id') as mock_resolve, \
         patch('services.checklist_service.generate_reference_no') as mock_gen_ref, \
         patch('services.checklist_service.log_audit') as mock_log:
        
        mock_resolve.return_value = "vendor-123"
        mock_gen_ref.return_value = "QTS-A-CHK-000001"
        
        mock_created = models.Checklist(
            id="chk-123",
            recordsNo="QTS-A-CHK-000001",
            contractor_id="vendor-123",
            status="Ongoing",
            detail_data=json.dumps({"key": "value"})
        )
        mock_repo.create.return_value = mock_created
        
        result = checklist_service.create_checklist(chk_data, user_id=1, username="admin")
        
        assert result.id == "chk-123"
        assert result.recordsNo == "QTS-A-CHK-000001"
        assert result.contractor_id == "vendor-123"
        assert result.detail_data == json.dumps({"key": "value"})
        mock_gen_ref.assert_called_once_with(mock_repo.db, "Vendor A", "CHECKLIST")
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_create_checklist_custom_records_no(checklist_service, mock_repo):
    chk_data = schemas.ChecklistCreate(
        recordsNo="CUSTOM-CHK-01",
        activity="Test Activity",
        date="2026-01-01",
        status="Ongoing"
    )
    
    with patch('services.checklist_service.log_audit') as mock_log, \
         patch('services.checklist_service.generate_reference_no') as mock_gen_ref:
        
        mock_created = models.Checklist(
            id="chk-123",
            recordsNo="CUSTOM-CHK-01",
            status="Ongoing"
        )
        mock_repo.create.return_value = mock_created
        
        result = checklist_service.create_checklist(chk_data)
        
        assert result.recordsNo == "CUSTOM-CHK-01"
        mock_gen_ref.assert_not_called()
        mock_repo.create.assert_called_once()

def test_update_checklist_status_transition_fail(checklist_service, mock_repo):
    # Current status is Pass
    mock_db_chk = models.Checklist(id="chk-123", status="Pass", recordsNo="CHK-01")
    mock_repo.get_by_id.return_value = mock_db_chk
    
    # Try an invalid transition (assuming WorkflowEngine rules for Checklist are defined)
    chk_update = schemas.ChecklistUpdate(status="InvalidStatus")
    
    with patch('services.checklist_service.WorkflowEngine.validate_transition', return_value=False):
        with pytest.raises(ValueError) as excinfo:
            checklist_service.update_checklist("chk-123", chk_update)
        
        assert "Invalid status transition" in str(excinfo.value)
        mock_repo.update.assert_not_called()

def test_update_checklist_success(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(id="chk-123", status="Ongoing", recordsNo="CHK-01")
    mock_repo.get_by_id.return_value = mock_db_chk
    
    # Create mock column_attrs for the inspect mock
    class MockColumn:
        def __init__(self, key):
            self.key = key
            
    with patch('services.checklist_service.WorkflowEngine.validate_transition', return_value=True), \
         patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
         
        # Make inspect return a mock object with column_attrs
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper
         
        chk_update = schemas.ChecklistUpdate(status="Pass", detail_data=json.dumps({"updated": True}))
        
        mock_updated = models.Checklist(id="chk-123", status="Pass", detail_data=json.dumps({"updated": True}))
        mock_repo.update.return_value = mock_updated
        
        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")
        
        assert result.status == "Pass"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_update_locked_checklist_rejects_result_change(checklist_service, mock_repo):
    """A Pass/Fail Checklist still has a real reopen path (WorkflowEngine
    allows Pass/Fail -> Ongoing, "允許回退修改"), so only the inspection
    results are locked, not the whole record — mirrors OBS's/PQP's
    reopen-aware locked-fields pattern."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01",
        detail_data=json.dumps({"items": ["orig"]}), passCount=5, failCount=0,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    chk_update = schemas.ChecklistUpdate(detail_data=json.dumps({"items": ["tampered"]}))

    with pytest.raises(ValueError) as excinfo:
        checklist_service.update_checklist("chk-123", chk_update)

    assert "Pass/Fail Checklist" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_locked_checklist_allows_noop_resave(checklist_service, mock_repo):
    """The frontend resends the whole record every save, so a locked field
    present with its existing value (no real change) must not be rejected."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01",
        detail_data=json.dumps({"items": ["same"]}), passCount=5, failCount=0,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(detail_data=json.dumps({"items": ["same"]}), passCount=5)
        mock_repo.update.return_value = mock_db_chk

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        assert result.status == "Pass"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_update_locked_checklist_allows_non_locked_field_change(checklist_service, mock_repo):
    """Only the inspection-result fields are locked — administrative fields
    like location stay editable on a Pass/Fail Checklist, matching NCR/OBS/
    PQP's precedent of not locking every field once closed/approved."""
    mock_db_chk = models.Checklist(id="chk-123", status="Pass", recordsNo="CHK-01", location="Old Location")
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(location="New Location")
        mock_updated = models.Checklist(id="chk-123", status="Pass", location="New Location")
        mock_repo.update.return_value = mock_updated

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        assert result.location == "New Location"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_update_locked_checklist_allows_reopen_with_result_change(checklist_service, mock_repo):
    """Explicitly reopening (status -> Ongoing, via the dedicated Reopen
    action) is the designed escape hatch — inspection results may change
    in the same save that reopens the record."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01",
        detail_data=json.dumps({"items": ["orig"]}),
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.WorkflowEngine.validate_transition', return_value=True), \
         patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(status="Ongoing", detail_data=json.dumps({"items": ["revised"]}))
        mock_updated = models.Checklist(id="chk-123", status="Ongoing", detail_data=json.dumps({"items": ["revised"]}))
        mock_repo.update.return_value = mock_updated

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        assert result.status == "Ongoing"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_checklist(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(id="chk-123", recordsNo="CHK-01")
    mock_repo.get_by_id.return_value = mock_db_chk
    
    class MockColumn:
        def __init__(self, key):
            self.key = key
            
    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
         
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper
        
        result = checklist_service.delete_checklist("chk-123")
        
        assert result is True
        mock_repo.delete.assert_called_once_with(mock_db_chk)
        mock_log.assert_called_once()
