from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException

from services.km_service import KMService


def test_get_article_found():
    # Setup
    mock_db = MagicMock()
    service = KMService(mock_db)

    # Mock repository behavior
    mock_article = MagicMock()
    mock_article.id = "test-id"
    service.repo.get_by_id = MagicMock(return_value=mock_article)

    # Execute
    result = service.get_article("test-id")

    # Assert
    assert result.id == "test-id"
    service.repo.get_by_id.assert_called_once_with("test-id")

def test_get_article_not_found():
    # Setup
    mock_db = MagicMock()
    service = KMService(mock_db)

    # Mock repository behavior
    service.repo.get_by_id = MagicMock(return_value=None)

    # Execute & Assert
    with pytest.raises(HTTPException) as excinfo:
        service.get_article("non-existent")

    assert excinfo.value.status_code == 404
    assert excinfo.value.detail == "KM Article not found"
