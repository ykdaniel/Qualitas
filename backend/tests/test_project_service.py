import pytest
from unittest.mock import MagicMock, patch
from services.project_service import ProjectService
import models


@pytest.fixture
def mock_repo():
    return MagicMock()


@pytest.fixture
def project_service(mock_repo):
    return ProjectService(mock_repo)


def test_delete_project_blocked_when_referenced(project_service, mock_repo):
    """Deleting a Project that still has child records must be blocked —
    SQLite's ondelete=SET NULL never actually fires (PRAGMA foreign_keys is
    off), so without this guard the children would be silently orphaned."""
    mock_db_project = models.Project(id="proj-123", name="Test Project")
    mock_repo.get_by_id.return_value = mock_db_project

    with patch('services.project_service.validators.check_project_references') as mock_check:
        mock_check.side_effect = ValueError(
            "Cannot delete project 'Test Project': referenced by 1 ITP record(s)"
        )

        with pytest.raises(ValueError) as excinfo:
            project_service.delete_project("proj-123")

        assert "Cannot delete project" in str(excinfo.value)
        mock_check.assert_called_once_with(mock_repo.db, "proj-123", "Test Project")
        mock_repo.delete.assert_not_called()


def test_delete_project_success_when_unreferenced(project_service, mock_repo):
    # Arrange
    mock_db_project = models.Project(id="proj-456", name="Empty Project")
    mock_repo.get_by_id.return_value = mock_db_project

    with patch('services.project_service.validators.check_project_references') as mock_check:
        mock_check.return_value = None

        # Act
        result = project_service.delete_project("proj-456")

        # Assert
        assert result is True
        mock_check.assert_called_once_with(mock_repo.db, "proj-456", "Empty Project")
        mock_repo.db.query.assert_any_call(models.UserProject)
        mock_repo.db.query.return_value.filter.return_value.delete.assert_called()
        # 2026-09-23: delete_project now flushes only and commits once itself, together with the audit
        # entry (see services/project_service.py) — repo.delete() is called with commit=False.
        mock_repo.delete.assert_called_once_with(mock_db_project, commit=False)


def test_delete_project_not_found(project_service, mock_repo):
    mock_repo.get_by_id.return_value = None

    result = project_service.delete_project("does-not-exist")

    assert result is False
    mock_repo.delete.assert_not_called()
