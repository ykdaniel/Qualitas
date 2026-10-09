"""
Tests for core/utils.py

Tests utility functions including WorkflowEngine, reference number generation, etc.
"""

import pytest
from core.utils import (
    WorkflowEngine,
    _json_serialize,
    get_contractor_abbreviation,
    _resolve_vendor_id,
    PROJECT_CODE
)


class TestWorkflowEngine:
    """Test WorkflowEngine status transition validation"""

    def test_valid_transition_noi(self):
        """Test valid NOI status transitions"""
        assert WorkflowEngine.validate_transition("NOI", "Open", "In Progress") is True
        assert WorkflowEngine.validate_transition("NOI", "In Progress", "Resolved") is True
        assert WorkflowEngine.validate_transition("NOI", "Resolved", "Closed") is True

    def test_invalid_transition_noi(self):
        """Test invalid NOI status transitions"""
        assert WorkflowEngine.validate_transition("NOI", "Open", "Closed") is False
        assert WorkflowEngine.validate_transition("NOI", "In Progress", "Closed") is False
        assert WorkflowEngine.validate_transition("NOI", "Closed", "Open") is False

    def test_same_status_allowed(self):
        """Test that same status is always allowed"""
        assert WorkflowEngine.validate_transition("NOI", "Open", "Open") is True
        assert WorkflowEngine.validate_transition("NCR", "Resolved", "Resolved") is True

    def test_checklist_bidirectional_transitions(self):
        """Test Checklist allows rollback transitions"""
        assert WorkflowEngine.validate_transition("Checklist", "Ongoing", "Pass") is True
        assert WorkflowEngine.validate_transition("Checklist", "Pass", "Ongoing") is True
        assert WorkflowEngine.validate_transition("Checklist", "Fail", "Ongoing") is True

    def test_void_transition(self):
        """Test void status transitions"""
        assert WorkflowEngine.validate_transition("NCR", "Open", "Void") is True
        assert WorkflowEngine.validate_transition("NCR", "Void", "Open") is False


class TestJsonSerialize:
    """Test JSON serialization utility"""

    def test_serialize_list(self):
        """Test serializing list fields"""
        data = {
            "name": "Test",
            "attachments": ["file1.pdf", "file2.pdf"]
        }
        result = _json_serialize(data, ["attachments"])
        assert result["name"] == "Test"
        assert isinstance(result["attachments"], str)
        assert "file1.pdf" in result["attachments"]

    def test_serialize_dict(self):
        """Test serializing dict fields"""
        data = {
            "name": "Test",
            "metadata": {"key": "value"}
        }
        result = _json_serialize(data, ["metadata"])
        assert isinstance(result["metadata"], str)
        assert "key" in result["metadata"]

    def test_no_modification_if_not_in_list(self):
        """Test fields not in list are not modified"""
        data = {
            "name": "Test",
            "items": ["a", "b"]
        }
        result = _json_serialize(data, ["other_field"])
        assert result["items"] == ["a", "b"]  # Should remain as list


class TestContractorHelpers:
    """Test contractor-related helper functions"""

    def test_get_abbreviation_with_contractor(self, db_session, sample_contractor):
        """Test getting abbreviation from existing contractor"""
        abbrev = get_contractor_abbreviation(db_session, "Test Contractor")
        assert abbrev == "TC"

    def test_get_abbreviation_fallback(self, db_session):
        """Test abbreviation fallback for non-existent contractor"""
        abbrev = get_contractor_abbreviation(db_session, "NonExistent Company Ltd")
        assert abbrev == "NONEXISTEN"  # First 10 alphanumeric chars

    def test_get_abbreviation_empty(self, db_session):
        """Test abbreviation for empty vendor name"""
        abbrev = get_contractor_abbreviation(db_session, "")
        assert abbrev == "NA"

    def test_resolve_vendor_id(self, db_session, sample_contractor):
        """Test resolving vendor name to ID"""
        vendor_id = _resolve_vendor_id(db_session, "Test Contractor")
        assert vendor_id == "test-contractor-1"

    def test_resolve_vendor_id_not_found(self, db_session):
        """Test resolving non-existent vendor"""
        vendor_id = _resolve_vendor_id(db_session, "NonExistent")
        assert vendor_id is None


def test_project_code_constant():
    """Test PROJECT_CODE constant"""
    assert PROJECT_CODE == "QTS"
