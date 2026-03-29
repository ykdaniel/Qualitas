import pytest
from unittest.mock import MagicMock
from fastapi import HTTPException
from services.itp_service import ITPService
import schemas
import models

def test_create_itp_success():
    # Setup
    mock_repo = MagicMock()
    
    # Needs to mock the db session for _resolve_vendor_id and generate_reference_no
    # We will patch the crud functions to isolate testing.
    from unittest.mock import patch
    
    with patch('services.itp_service._resolve_vendor_id') as mock_resolve, \
         patch('services.itp_service.generate_reference_no') as mock_generate_ref, \
         patch('services.itp_service.log_audit') as mock_log:
         
        mock_resolve.return_value = "vendor_uuid_123"
        mock_generate_ref.return_value = "QTS-TEST-ITP-000001"
        
        mock_created_itp = models.ITP(
            id="itp_123", referenceNo="QTS-TEST-ITP-000001",
            description="Test ITP", vendor_id="vendor_uuid_123", status="Draft"
        )
        mock_repo.create.return_value = mock_created_itp
        
        service = ITPService(mock_repo)
        itp_data = schemas.ITPCreate(
            description="Test ITP",
            vendor="TestVendor",
            revision="0",
            status="Draft"
        )
        
        # Execute
        result = service.create_itp(itp_data, user_id=1, username="testadmin")
        
        # Assert
        assert result.id == "itp_123"
        assert result.referenceNo == "QTS-TEST-ITP-000001"
        assert result.vendor_id == "vendor_uuid_123"
        mock_repo.create.assert_called_once()
        
        # Ensure correct dictionary was passed to create model
        args, kwargs = mock_repo.create.call_args
        assert args[0].description == "Test ITP"
        assert args[0].vendor_id == "vendor_uuid_123"
        mock_log.assert_called_once()


def test_update_itp_invalid_transition():
    # Setup
    mock_repo = MagicMock()
    
    # Mock existing status as Approved
    mock_db_itp = models.ITP(id="itp_123", status="Approved", referenceNo="QTS")
    mock_repo.get_by_id.return_value = mock_db_itp
    
    service = ITPService(mock_repo)
    
    # Try invalid transition from Approved -> Draft
    itp_update = schemas.ITPUpdate(status="Draft")
    
    # Execute & Assert
    with pytest.raises(ValueError) as excinfo:
        service.update_itp("itp_123", itp_update)
    
    assert "Invalid status transition" in str(excinfo.value)
    assert "from Approved to Draft" in str(excinfo.value)

def test_update_itp_valid_transition():
    # Setup
    mock_repo = MagicMock()
    mock_db_itp = models.ITP(id="itp_123", status="Draft", referenceNo="QTS")
    mock_repo.get_by_id.return_value = mock_db_itp
    
    # Provide an updated object 
    mock_updated_itp = models.ITP(id="itp_123", status="Pending", referenceNo="QTS")
    mock_repo.update.return_value = mock_updated_itp
    
    service = ITPService(mock_repo)
    
    from unittest.mock import patch
    with patch('services.itp_service.log_audit') as mock_log:
        itp_update = schemas.ITPUpdate(status="Pending")
        
        result = service.update_itp("itp_123", itp_update)
        
        assert result.status == "Pending"
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()
