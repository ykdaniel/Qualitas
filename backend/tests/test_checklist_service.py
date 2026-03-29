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
        mock_gen_ref.assert_called_once_with(mock_repo.db, "PKG-01", "CHECKLIST")
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
