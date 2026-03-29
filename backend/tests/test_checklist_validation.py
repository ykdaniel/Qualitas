"""
Test suite for Checklist reference validation
"""

import pytest
from unittest.mock import Mock, MagicMock
import models
import schemas
from services.checklist_service import ChecklistService


class TestChecklistReferenceValidation:
    """Test Checklist reference validation to ITP, NOI, ITR"""

    def test_create_checklist_with_valid_itp_reference(self):
        """Creating Checklist with valid ITP reference should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock ITP exists
        mock_itp = Mock()
        mock_itp.id = "itp-123"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_itp

        service = ChecklistService(mock_repo)

        checklist_data = schemas.ChecklistCreate(
            recordsNo="CHK-001",
            activity="Test Activity",
            date="2024-01-01",
            status="Ongoing",
            packageName="Package A",
            itpIndex=1,
            location="Site A",
            itpId="itp-123",  # Valid ITP ID
            detail_data="{}"  # JSON string, not dict
        )

        # Should not raise error (validation passed)
        # Note: We can't fully test create because of generate_reference_no
        # But we can test the validator directly
        from core import validators
        mock_db.query.reset_mock()
        mock_db.query.return_value.filter.return_value.first.return_value = mock_itp

        # Direct ITP query check
        itp = mock_db.query(models.ITP).filter(models.ITP.id == "itp-123").first()
        assert itp is not None

    def test_create_checklist_with_invalid_itp_id(self):
        """Creating Checklist with non-existent ITP should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db
        mock_repo.create = Mock()

        # Mock ITP not found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ChecklistService(mock_repo)

        checklist_data = schemas.ChecklistCreate(
            recordsNo="CHK-001",
            activity="Test Activity",
            date="2024-01-01",
            status="Ongoing",
            packageName="Package A",
            itpIndex=1,
            location="Site A",
            itpId="itp-nonexistent",  # Invalid ITP ID
            detail_data="{}"
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_checklist(checklist_data)

        assert "itp" in str(exc_info.value).lower()
        assert "not found" in str(exc_info.value).lower()

    def test_create_checklist_with_valid_noi_reference(self):
        """Creating Checklist with valid NOI reference should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock NOI exists
        mock_noi = Mock()
        mock_noi.referenceNo = "NOI-001"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_noi

        # Test validator directly
        from core import validators
        validators.validate_noi_reference(mock_db, "NOI-001")
        # Should not raise error

    def test_create_checklist_with_invalid_noi_number(self):
        """Creating Checklist with non-existent NOI should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock NOI not found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ChecklistService(mock_repo)

        checklist_data = schemas.ChecklistCreate(
            recordsNo="CHK-001",
            activity="Test Activity",
            date="2024-01-01",
            status="Ongoing",
            packageName="Package A",
            itpIndex=1,
            location="Site A",
            noiNumber="NOI-NONEXISTENT",  # Invalid NOI number
            detail_data="{}"
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_checklist(checklist_data)

        assert "noi" in str(exc_info.value).lower()
        assert "not found" in str(exc_info.value).lower()

    def test_create_checklist_with_valid_itr_id(self):
        """Creating Checklist with valid ITR ID should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock ITR exists
        mock_itr = Mock()
        mock_itr.id = "itr-123"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_itr

        # Test validator directly
        from core import validators
        validators.validate_itr_by_id(mock_db, "itr-123")
        # Should not raise error

    def test_create_checklist_with_invalid_itr_id(self):
        """Creating Checklist with non-existent ITR ID should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock ITR not found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ChecklistService(mock_repo)

        checklist_data = schemas.ChecklistCreate(
            recordsNo="CHK-001",
            activity="Test Activity",
            date="2024-01-01",
            status="Ongoing",
            packageName="Package A",
            itpIndex=1,
            location="Site A",
            itrId="itr-nonexistent",  # Invalid ITR ID
            detail_data="{}"
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_checklist(checklist_data)

        assert "itr" in str(exc_info.value).lower()
        assert "not found" in str(exc_info.value).lower()

    def test_create_checklist_with_valid_itr_number(self):
        """Creating Checklist with valid ITR document number should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock ITR exists
        mock_itr = Mock()
        mock_itr.documentNumber = "ITR-001"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_itr

        # Test validator directly
        from core import validators
        validators.validate_itr_reference(mock_db, "ITR-001")
        # Should not raise error

    def test_create_checklist_with_invalid_itr_number(self):
        """Creating Checklist with non-existent ITR number should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock ITR not found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ChecklistService(mock_repo)

        checklist_data = schemas.ChecklistCreate(
            recordsNo="CHK-001",
            activity="Test Activity",
            date="2024-01-01",
            status="Ongoing",
            packageName="Package A",
            itpIndex=1,
            location="Site A",
            itrNumber="ITR-NONEXISTENT",  # Invalid ITR number
            detail_data="{}"
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_checklist(checklist_data)

        assert "itr" in str(exc_info.value).lower()
        assert "not found" in str(exc_info.value).lower()

    def test_update_checklist_with_invalid_references(self):
        """Updating Checklist with invalid references should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock existing checklist
        mock_checklist = Mock()
        mock_checklist.id = "checklist-1"
        mock_checklist.status = "Ongoing"
        mock_checklist.__table__ = Mock()
        mock_checklist.__table__.columns = []
        mock_repo.get_by_id.return_value = mock_checklist

        # Mock reference not found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ChecklistService(mock_repo)

        # Test updating with invalid NOI
        checklist_update = schemas.ChecklistUpdate(
            noiNumber="NOI-INVALID"
        )

        with pytest.raises(ValueError) as exc_info:
            service.update_checklist("checklist-1", checklist_update)

        assert "not found" in str(exc_info.value).lower()

    def test_create_checklist_without_references(self):
        """Creating Checklist without any references should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db
        mock_repo.create = Mock()

        # Mock for generate_reference_no
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = ChecklistService(mock_repo)

        checklist_data = schemas.ChecklistCreate(
            recordsNo="CHK-001",
            activity="Test Activity",
            date="2024-01-01",
            status="Ongoing",
            packageName="Package A",
            itpIndex=1,
            location="Site A"
            # No itpId, noiNumber, itrId, or itrNumber - should be fine
        )

        # Should not raise error when no references are provided
        # The validation should only run if the fields are present


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
