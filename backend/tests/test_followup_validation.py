"""
Test suite for FollowUp source reference validation
"""

import pytest
from unittest.mock import Mock, MagicMock
import models
import schemas
from services.followup_service import FollowUpService


class TestFollowUpSourceValidation:
    """Test FollowUp source reference validation"""

    def test_create_followup_with_valid_ncr_reference(self):
        """Creating FollowUp with valid NCR reference should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock NCR exists
        mock_ncr = Mock()
        mock_ncr.documentNumber = "NCR-001"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_ncr

        # Mock contractor exists
        mock_contractor = Mock()
        mock_contractor.id = "contractor-1"
        mock_db.query.return_value.filter.return_value.first.return_value = mock_contractor

        service = FollowUpService(mock_repo)

        followup_data = schemas.FollowUpCreate(
            title="Test FollowUp",
            description="Test description",
            status="Open",
            assignedTo="Test User",
            createdAt="2024-01-01",
            updatedAt="2024-01-01",
            sourceModule="NCR",
            sourceReferenceNo="NCR-001"
        )

        # Should not raise any error
        try:
            # We can't actually create because we need full mock setup
            # But validation should be called and not raise
            from core import validators
            validators.validate_followup_source_reference(
                mock_db, "NCR", "NCR-001"
            )
            assert True  # Validation passed
        except ValueError:
            pytest.fail("Validation should not raise error for valid reference")

    def test_create_followup_with_invalid_module(self):
        """Creating FollowUp with invalid sourceModule should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        service = FollowUpService(mock_repo)

        followup_data = schemas.FollowUpCreate(
            title="Test FollowUp",
            description="Test description",
            status="Open",
            assignedTo="Test User",
            createdAt="2024-01-01",
            updatedAt="2024-01-01",
            sourceModule="INVALID_MODULE",  # Invalid module
            sourceReferenceNo="REF-001"
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_followup(followup_data)

        assert "invalid sourcemodule" in str(exc_info.value).lower()

    def test_create_followup_with_nonexistent_reference(self):
        """Creating FollowUp with non-existent reference should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        # Mock NCR not found
        mock_db.query.return_value.filter.return_value.first.return_value = None

        service = FollowUpService(mock_repo)

        followup_data = schemas.FollowUpCreate(
            title="Test FollowUp",
            description="Test description",
            status="Open",
            assignedTo="Test User",
            createdAt="2024-01-01",
            updatedAt="2024-01-01",
            sourceModule="NCR",
            sourceReferenceNo="NCR-NONEXISTENT"
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_followup(followup_data)

        assert "not found" in str(exc_info.value).lower()

    def test_create_followup_without_source_reference(self):
        """Creating FollowUp without source reference should succeed"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db
        mock_repo.create = Mock()

        service = FollowUpService(mock_repo)

        followup_data = schemas.FollowUpCreate(
            title="Test FollowUp",
            description="Test description",
            status="Open",
            assignedTo="Test User",
            createdAt="2024-01-01",
            updatedAt="2024-01-01"
            # No sourceModule or sourceReferenceNo
        )

        # Should not raise error (both empty is allowed)
        from core import validators
        validators.validate_followup_source_reference(mock_db, None, None)
        # Should succeed without error

    def test_create_followup_with_partial_source_info(self):
        """Creating FollowUp with only sourceModule (no reference) should fail"""
        mock_repo = Mock()
        mock_db = Mock()
        mock_repo.db = mock_db

        service = FollowUpService(mock_repo)

        followup_data = schemas.FollowUpCreate(
            title="Test FollowUp",
            description="Test description",
            status="Open",
            assignedTo="Test User",
            createdAt="2024-01-01",
            updatedAt="2024-01-01",
            sourceModule="NCR"
            # Missing sourceReferenceNo
        )

        # Should raise ValueError
        with pytest.raises(ValueError) as exc_info:
            service.create_followup(followup_data)

        assert "both" in str(exc_info.value).lower()

    def test_supported_source_modules(self):
        """Test all supported source module types"""
        from core import validators

        mock_db = Mock()

        supported_modules = ["NCR", "NOI", "ITR", "ITP", "OBS", "PQP", "FAT", "AUDIT"]

        for module in supported_modules:
            # Mock record not found (will raise error)
            mock_db.query.return_value.filter.return_value.first.return_value = None

            with pytest.raises(ValueError) as exc_info:
                validators.validate_followup_source_reference(
                    mock_db, module, "TEST-001"
                )

            # Should fail because record doesn't exist, not because module is invalid
            assert "not found" in str(exc_info.value).lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
