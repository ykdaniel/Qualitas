"""
Integration tests for referential integrity and cascade delete protection
Tests the fixes made for cross-module references and delete protection
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
import models
import schemas
from services.noi_service import NOIService
from services.ncr_service import NCRService
from services.itr_service import ITRService
from services.contractor_service import ContractorService


class TestReferentialIntegrity:
    """Test referential integrity validation"""

    def test_noi_create_with_invalid_itp_no(self):
        """Creating NOI with non-existent ITP should fail"""
        # Mock repository and database
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock query to return None (ITP not found)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = NOIService(mock_repo)

        noi_data = schemas.NOICreate(
            package="PKG-001",
            issueDate="2024-01-01",
            inspectionTime="10:00",
            itpNo="ITP-NONEXISTENT",  # This ITP doesn't exist
            inspectionDate="2024-01-02",
            type="Initial"
        )

        # Should raise ValueError
        with patch('services.noi_service.generate_reference_no', return_value="NOI-TEST-001"):
            with pytest.raises(ValueError) as exc_info:
                service.create_noi(noi_data)

        assert "not found" in str(exc_info.value).lower()
        assert "ITP" in str(exc_info.value)

    def test_ncr_create_with_invalid_noi_number(self):
        """Creating NCR with non-existent NOI should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock query to return None (NOI not found)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = NCRService(mock_repo)

        ncr_data = schemas.NCRCreate(
            description="Test NCR",
            rev="1",
            submit="test",
            status="Open",
            noiNumber="NOI-NONEXISTENT"  # This NOI doesn't exist
        )

        # Should raise ValueError
        with patch('services.ncr_service.generate_reference_no', return_value="NCR-TEST-001"):
            with pytest.raises(ValueError) as exc_info:
                service.create_ncr(ncr_data)

        assert "not found" in str(exc_info.value).lower()
        assert "NOI" in str(exc_info.value)

    def test_itr_create_with_invalid_noi_number(self):
        """Creating ITR with non-existent NOI should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock query to return None (NOI not found)
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ITRService(mock_repo)

        itr_data = schemas.ITRCreate(
            description="Test ITR",
            rev="1",
            submit="test",
            status="Draft",
            noiNumber="NOI-NONEXISTENT"  # This NOI doesn't exist
        )

        # Should raise ValueError
        with patch('services.itr_service.generate_reference_no', return_value="ITR-TEST-001"):
            with pytest.raises(ValueError) as exc_info:
                service.create_itr(itr_data)

        assert "not found" in str(exc_info.value).lower()
        assert "NOI" in str(exc_info.value)


class TestCascadeDeleteProtection:
    """Test cascade delete protection"""

    def test_contractor_delete_with_references(self):
        """Deleting contractor with ITP references should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock contractor exists
        mock_contractor = Mock()
        mock_contractor.id = "contractor-1"
        mock_contractor.name = "Test Contractor"
        mock_contractor.__table__ = Mock()
        mock_contractor.__table__.columns = []
        mock_repo.get_by_id.return_value = mock_contractor

        # Mock ITP count > 0 (has references)
        mock_db.query.return_value.filter.return_value.count.return_value = 5

        service = ContractorService(mock_repo)

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.delete_contractor("contractor-1")

        assert "cannot delete" in str(exc_info.value).lower()
        assert "5 ITP" in str(exc_info.value)

    def test_itp_delete_with_noi_references(self):
        """Deleting ITP with NOI references should fail"""
        from services.itp_service import ITPService

        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock ITP exists
        mock_itp = Mock()
        mock_itp.id = "itp-1"
        mock_itp.referenceNo = "ITP-001"
        mock_itp.__table__ = Mock()
        mock_itp.__table__.columns = []
        mock_repo.get_by_id.return_value = mock_itp

        # Mock NOI count > 0 (has references)
        mock_db.query.return_value.filter.return_value.count.return_value = 3

        service = ITPService(mock_repo)

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.delete_itp("itp-1")

        assert "cannot delete" in str(exc_info.value).lower()
        assert "3 NOI" in str(exc_info.value)


class TestWorkflowValidation:
    """Test workflow state transition validation"""

    def test_workflow_engine_valid_transition(self):
        """Valid state transitions should pass"""
        from core.utils import WorkflowEngine

        # ITP: Draft -> Pending is valid
        assert WorkflowEngine.validate_transition("ITP", "Draft", "Pending") == True

        # NCR: Open -> In Progress is valid
        assert WorkflowEngine.validate_transition("NCR", "Open", "In Progress") == True

    def test_workflow_engine_invalid_transition(self):
        """Invalid state transitions should fail"""
        from core.utils import WorkflowEngine

        # ITP: Approved -> Draft is invalid
        assert WorkflowEngine.validate_transition("ITP", "Approved", "Draft") == False

        # NCR: Closed -> Open is invalid
        assert WorkflowEngine.validate_transition("NCR", "Closed", "Open") == False

    def test_workflow_engine_same_status(self):
        """Same status should always be valid"""
        from core.utils import WorkflowEngine

        assert WorkflowEngine.validate_transition("ITP", "Draft", "Draft") == True
        assert WorkflowEngine.validate_transition("NCR", "Open", "Open") == True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
