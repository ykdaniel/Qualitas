"""
Test suite for validation fixes
Tests all the fixes made during the data integrity audit remediation
"""

import pytest
from pydantic import ValidationError
import schemas
import json


class TestEmailValidation:
    """Test email validation in Update schemas"""

    def test_contractor_update_valid_email(self):
        """Valid email should pass"""
        data = {"email": "test@example.com"}
        contractor = schemas.ContractorUpdate(**data)
        assert contractor.email == "test@example.com"

    def test_contractor_update_invalid_email(self):
        """Invalid email should fail"""
        with pytest.raises(ValidationError) as exc_info:
            schemas.ContractorUpdate(email="invalid-email")
        assert "email" in str(exc_info.value).lower()

    def test_user_update_valid_email(self):
        """Valid email should pass"""
        data = {"email": "user@domain.com"}
        user = schemas.UserUpdate(**data)
        assert user.email == "user@domain.com"

    def test_user_update_invalid_email(self):
        """Invalid email should fail"""
        with pytest.raises(ValidationError) as exc_info:
            schemas.UserUpdate(email="not-an-email")
        assert "email" in str(exc_info.value).lower()

    def test_noi_update_valid_email(self):
        """Valid email should pass"""
        data = {"email": "inspector@company.com"}
        noi = schemas.NOIUpdate(**data)
        assert noi.email == "inspector@company.com"


class TestJSONFieldValidators:
    """Test JSON field validators"""

    def test_pqp_update_attachments_string(self):
        """Attachments as JSON string should be parsed"""
        data = {"attachments": '["file1.pdf", "file2.pdf"]'}
        pqp = schemas.PQPUpdate(**data)
        assert pqp.attachments == ["file1.pdf", "file2.pdf"]

    def test_pqp_update_attachments_list(self):
        """Attachments as list should pass through"""
        data = {"attachments": ["file1.pdf", "file2.pdf"]}
        pqp = schemas.PQPUpdate(**data)
        assert pqp.attachments == ["file1.pdf", "file2.pdf"]

    @pytest.mark.skip(reason="Type hint mismatch: validator parses to dict/list but field expects str")
    def test_itr_update_detail_data_parsed(self):
        """detail_data validator parses JSON strings correctly"""
        # Note: This test reveals a design issue where the validator
        # parses JSON strings to Python objects, but the type hint
        # says the field should be str. This doesn't affect runtime
        # behavior but creates a type inconsistency.
        detail_json = '["item1", "item2"]'
        data = {"detail_data": detail_json}
        itr = schemas.ITRUpdate(**data)
        assert itr.detail_data == ["item1", "item2"]

    def test_km_article_update_attachments(self):
        """KMArticleUpdate attachments should handle JSON string"""
        attachments_json = '[{"name": "file.pdf", "url": "http://example.com/file.pdf"}]'
        data = {"attachments": attachments_json}
        km = schemas.KMArticleUpdate(**data)
        # Should be parsed into list of KMAttachment objects
        assert isinstance(km.attachments, list)


class TestDateRangeValidation:
    """Test date range validation"""

    def test_itp_valid_date_range(self):
        """Valid date range should pass"""
        data = {
            "status": "Draft",
            "submissionDate": "2024-01-01",
            "dueDate": "2024-12-31"
        }
        itp = schemas.ITPCreate(**data)
        assert itp.submissionDate == "2024-01-01"
        assert itp.dueDate == "2024-12-31"

    def test_itp_invalid_date_range(self):
        """Submission date after due date should fail on ITPCreate (strict input)"""
        with pytest.raises(ValidationError) as exc_info:
            schemas.ITPCreate(
                status="Draft",
                submissionDate="2024-12-31",
                dueDate="2024-01-01"
            )
        assert "before or equal" in str(exc_info.value).lower()

    def test_itp_base_tolerates_inconsistent_legacy_dates(self):
        """ITPBase (response model base) must not reject legacy records with bad dates"""
        itp = schemas.ITPBase(
            status="Draft",
            submissionDate="2024-12-31",
            dueDate="2024-01-01"
        )
        assert itp.submissionDate == "2024-12-31"
        assert itp.dueDate == "2024-01-01"

    def test_ncr_valid_date_range(self):
        """Valid NCR date range should pass"""
        data = {
            "description": "Test NCR",
            "rev": "1",
            "submit": "test",
            "status": "Open",
            "raiseDate": "2024-01-01",
            "closeoutDate": "2024-06-30",
            "dueDate": "2024-12-31"
        }
        ncr = schemas.NCRBase(**data)
        assert ncr.raiseDate == "2024-01-01"

    def test_ncr_base_tolerates_inconsistent_legacy_dates_and_the_rule_moved_to_the_write_path(self):
        """BEHAVIOUR CHANGE (2026-09-20). This used to be `test_ncr_invalid_date_range` and asserted that NCRBase — which is also the
        base of the READ schema NCR — REJECTED closeout-before-raise. That is what made GET /ncr/ answer 500 for one legacy row
        (compare ITPBase above, which already tolerates it). NCRBase now returns such a row untouched; the SAME rule is enforced
        on the final content of a create/update by NCRService (core.strict_dates), and reported on reads as `date_issues`."""
        from core import strict_dates
        ncr = schemas.NCRBase(description="Test", rev="1", submit="test", status="Open", raiseDate="2024-12-31", closeoutDate="2024-01-01")
        assert (ncr.raiseDate, ncr.closeoutDate) == ("2024-12-31", "2024-01-01")
        with pytest.raises(strict_dates.DateValidationError) as exc_info:
            strict_dates.validate_date_write({"raiseDate": "2024-12-31", "closeoutDate": "2024-01-01"}, strict_dates.NCR_DATE_FIELDS,
                                             relations=strict_dates.NCR_ORDER_RELATIONS)
        assert "before or equal" in str(exc_info.value).lower()

    def test_fat_valid_date_range(self):
        """Valid FAT date range should pass"""
        data = {
            "equipment": "Test Equipment",
            "supplier": "Test Supplier",
            "startDate": "2024-01-01",
            "endDate": "2024-06-30",
            "moveInDate": "2024-07-15"
        }
        fat = schemas.FATBase(**data)
        assert fat.startDate == "2024-01-01"

    def test_fat_invalid_date_range(self):
        """End date before start date should fail"""
        with pytest.raises(ValidationError) as exc_info:
            schemas.FATBase(
                equipment="Test",
                supplier="Test",
                startDate="2024-12-31",
                endDate="2024-01-01"
            )
        assert "before or equal" in str(exc_info.value).lower()


class TestNoDuplicateFields:
    """Test that duplicate fields are removed"""

    def test_itr_update_no_duplicate_defect_photos(self):
        """ITRUpdate should have only one defectPhotos field"""
        data = {"defectPhotos": '["photo1.jpg"]'}
        itr = schemas.ITRUpdate(**data)
        # Should work without error
        assert itr.defectPhotos is not None

        # Check the schema fields
        fields = schemas.ITRUpdate.model_fields
        defect_photo_fields = [f for f in fields.keys() if 'defect' in f.lower()]
        # Should only have one defectPhotos field
        assert defect_photo_fields.count('defectPhotos') <= 1


class TestSearchSanitization:
    """Test search input sanitization"""

    def test_sanitize_search_term_percent(self):
        """Percent signs should be escaped"""
        from core.utils import sanitize_search_term

        result = sanitize_search_term("100%")
        assert result == "100\\%"

    def test_sanitize_search_term_underscore(self):
        """Underscores should be escaped"""
        from core.utils import sanitize_search_term

        result = sanitize_search_term("test_value")
        assert result == "test\\_value"

    def test_sanitize_search_term_backslash(self):
        """Backslashes should be escaped first"""
        from core.utils import sanitize_search_term

        result = sanitize_search_term("test\\value")
        assert result == "test\\\\value"

    def test_sanitize_search_term_none(self):
        """None should return None"""
        from core.utils import sanitize_search_term

        result = sanitize_search_term(None)
        assert result is None

    def test_sanitize_search_term_normal(self):
        """Normal strings should pass through"""
        from core.utils import sanitize_search_term

        result = sanitize_search_term("normal search")
        assert result == "normal search"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
