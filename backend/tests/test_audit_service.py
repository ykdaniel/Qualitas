"""
Tests for Audit Service Layer
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from datetime import datetime
import uuid

import models
import schemas
from services.audit_service import AuditService
from repositories.audit_repository import AuditRepository


@pytest.fixture
def mock_db():
    """Mock database session"""
    return Mock()


@pytest.fixture
def mock_repo(mock_db):
    """Mock audit repository"""
    return AuditRepository(mock_db)


@pytest.fixture
def audit_service(mock_repo):
    """Audit service with mocked repository"""
    return AuditService(mock_repo)


@pytest.fixture
def sample_audit():
    """Sample audit model"""
    return models.Audit(
        id="audit-001",
        auditNo="QTS-RKS-ABC-AUD-000001",
        title="Test Audit",
        date="2026-03-15",
        end_date="2026-03-16",
        auditor="John Doe",
        status="Planned",
        location="Site Office",
        findings="",
        contractor="ABC Company",
        vendor_id="vendor-001",
        project_name="Test Project",
        project_director="Jane Smith",
        support_auditors="Mike Johnson",
        tech_lead="Sarah Connor",
        scope_description="Test scope",
        audit_criteria="ISO 9001:2015",
        selected_templates='["ISO 9001:2015"]',
        custom_check_items="[]"
    )


def test_get_audits(audit_service, mock_repo, sample_audit):
    """Test retrieving list of audits"""
    mock_repo.get_all = Mock(return_value=[sample_audit])

    result = audit_service.get_audits(skip=0, limit=100)

    assert len(result) == 1
    assert result[0].id == "audit-001"
    mock_repo.get_all.assert_called_once_with(0, 100)


def test_get_audit_by_id(audit_service, mock_repo, sample_audit):
    """Test retrieving single audit by ID"""
    mock_repo.get_by_id = Mock(return_value=sample_audit)

    result = audit_service.get_audit("audit-001")

    assert result is not None
    assert result.id == "audit-001"
    assert result.auditNo == "QTS-RKS-ABC-AUD-000001"
    mock_repo.get_by_id.assert_called_once_with("audit-001")


def test_get_audit_not_found(audit_service, mock_repo):
    """Test retrieving non-existent audit"""
    mock_repo.get_by_id = Mock(return_value=None)

    result = audit_service.get_audit("non-existent")

    assert result is None


def test_create_audit_with_vendor_resolution(audit_service, mock_repo, mock_db, sample_audit):
    """Test creating audit with vendor name resolution to vendor_id"""
    # Setup mock contractor
    mock_contractor = Mock()
    mock_contractor.id = "vendor-001"
    mock_contractor.name = "ABC Company"

    # Mock query chain for vendor resolution
    mock_query = Mock()
    mock_filter = Mock()
    mock_filter.first.return_value = mock_contractor
    mock_query.filter.return_value = mock_filter
    mock_db.query.return_value = mock_query
    mock_repo.db = mock_db

    # Mock create method
    mock_repo.create = Mock(return_value=sample_audit)
    mock_db.commit = Mock()
    mock_db.refresh = Mock()
    mock_db.add = Mock()
    mock_db.flush = Mock()

    # Create audit schema
    audit_create = schemas.AuditCreate(
        auditNo="QTS-RKS-ABC-AUD-000001",
        title="Test Audit",
        date="2026-03-15",
        status="Planned",
        contractor="ABC Company"
    )

    with patch('services.audit_service.generate_reference_no', return_value="QTS-RKS-ABC-AUD-000001"):
        result = audit_service.create_audit(audit_create, user_id=1, username="testuser")

    # Verify vendor_id was resolved
    assert result is not None
    assert result.vendor_id == "vendor-001"
    mock_repo.create.assert_called_once()
    call_args = mock_repo.create.call_args[0][0]
    assert call_args["vendor_id"] == "vendor-001"
    assert call_args["contractor"] == "ABC Company"


def test_create_audit_without_vendor(audit_service, mock_repo, mock_db):
    """Test creating audit without contractor"""
    mock_audit = models.Audit(
        id="audit-002",
        auditNo="QTS-RKS-XXX-AUD-000002",
        status="Draft",
        contractor=None,
        vendor_id=None
    )

    mock_db.query.return_value.filter.return_value.first.return_value = None
    mock_repo.db = mock_db
    mock_repo.create = Mock(return_value=mock_audit)
    mock_db.commit = Mock()
    mock_db.refresh = Mock()
    mock_db.add = Mock()
    mock_db.flush = Mock()

    audit_create = schemas.AuditCreate(
        auditNo="QTS-RKS-XXX-AUD-000002",
        status="Draft"
    )

    with patch('services.audit_service.generate_reference_no', return_value="QTS-RKS-XXX-AUD-000002"):
        result = audit_service.create_audit(audit_create, user_id=1, username="testuser")

    # Verify vendor_id is None when no contractor provided
    call_args = mock_repo.create.call_args[0][0]
    assert call_args["vendor_id"] is None


def test_update_audit(audit_service, mock_repo, sample_audit, mock_db):
    """Test updating audit"""
    updated_audit = sample_audit
    updated_audit.status = "Completed"

    mock_repo.get_by_id = Mock(return_value=sample_audit)
    mock_repo.update = Mock(return_value=updated_audit)
    mock_repo.db = mock_db
    mock_db.commit = Mock()
    mock_db.refresh = Mock()
    mock_db.add = Mock()
    mock_db.flush = Mock()

    audit_update = schemas.AuditUpdate(status="Completed")

    result = audit_service.update_audit("audit-001", audit_update, user_id=1, username="testuser")

    assert result is not None
    assert result.status == "Completed"
    mock_repo.update.assert_called_once()


def test_update_audit_with_vendor_change(audit_service, mock_repo, sample_audit, mock_db):
    """Test updating audit with contractor change (vendor_id should update)"""
    # Mock new contractor
    mock_new_contractor = Mock()
    mock_new_contractor.id = "vendor-002"
    mock_new_contractor.name = "XYZ Company"

    mock_query = Mock()
    mock_filter = Mock()
    mock_filter.first.return_value = mock_new_contractor
    mock_query.filter.return_value = mock_filter
    mock_db.query.return_value = mock_query

    mock_repo.get_by_id = Mock(return_value=sample_audit)
    mock_repo.update = Mock(return_value=sample_audit)
    mock_repo.db = mock_db
    mock_db.commit = Mock()
    mock_db.refresh = Mock()
    mock_db.add = Mock()
    mock_db.flush = Mock()

    audit_update = schemas.AuditUpdate(contractor="XYZ Company")

    result = audit_service.update_audit("audit-001", audit_update, user_id=1, username="testuser")

    # Verify vendor_id was updated
    call_args = mock_repo.update.call_args[0][1]
    assert call_args["vendor_id"] == "vendor-002"


def test_update_audit_not_found(audit_service, mock_repo):
    """Test updating non-existent audit"""
    mock_repo.get_by_id = Mock(return_value=None)

    audit_update = schemas.AuditUpdate(status="Completed")
    result = audit_service.update_audit("non-existent", audit_update, user_id=1, username="testuser")

    assert result is None


def test_delete_audit(audit_service, mock_repo, sample_audit, mock_db):
    """Test deleting audit"""
    mock_repo.get_by_id = Mock(return_value=sample_audit)
    mock_repo.delete = Mock(return_value=True)
    mock_repo.db = mock_db
    mock_db.commit = Mock()
    mock_db.add = Mock()
    mock_db.flush = Mock()

    result = audit_service.delete_audit("audit-001", user_id=1, username="testuser")

    assert result is True
    mock_repo.delete.assert_called_once_with("audit-001")


def test_delete_audit_not_found(audit_service, mock_repo):
    """Test deleting non-existent audit"""
    mock_repo.get_by_id = Mock(return_value=None)
    mock_repo.delete = Mock()

    result = audit_service.delete_audit("non-existent", user_id=1, username="testuser")

    assert result is False
    mock_repo.delete.assert_not_called()


def test_resolve_vendor_id(audit_service, mock_db):
    """Test vendor name to ID resolution"""
    mock_contractor = Mock()
    mock_contractor.id = "vendor-123"

    mock_query = Mock()
    mock_filter = Mock()
    mock_filter.first.return_value = mock_contractor
    mock_query.filter.return_value = mock_filter
    mock_db.query.return_value = mock_query
    audit_service.repo.db = mock_db

    result = audit_service._resolve_vendor_id("Test Vendor")

    assert result == "vendor-123"


def test_resolve_vendor_id_not_found(audit_service, mock_db):
    """Test vendor resolution when vendor not found"""
    mock_query = Mock()
    mock_filter = Mock()
    mock_filter.first.return_value = None
    mock_query.filter.return_value = mock_filter
    mock_db.query.return_value = mock_query
    audit_service.repo.db = mock_db

    result = audit_service._resolve_vendor_id("Non-existent Vendor")

    assert result is None


def test_resolve_vendor_id_empty_name(audit_service):
    """Test vendor resolution with empty name"""
    result = audit_service._resolve_vendor_id(None)
    assert result is None

    result = audit_service._resolve_vendor_id("")
    assert result is None
