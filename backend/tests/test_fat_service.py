import pytest
from unittest.mock import MagicMock, patch
from services.fat_service import FATService
import models
import schemas
import json

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def fat_service(mock_repo):
    return FATService(mock_repo)

def test_create_fat_success(fat_service, mock_repo):
    # Arrange
    fat_data = schemas.FATCreate(
        equipment="Test Equipment",
        supplier="Vendor A",
        startDate="2026-01-01",
        endDate="2026-01-02",
        detail_data=[{"id": "d1", "itemName": "Item 1", "qty": "10"}],
        attachments=["file1.pdf", "file2.jpg"]
    )

    with patch('services.fat_service._resolve_vendor_id') as mock_resolve, \
         patch('services.fat_service.log_audit') as mock_log:

        mock_resolve.return_value = "vendor-123"

        mock_created = models.FAT(
            id="fat-123",
            equipment="Test Equipment",
            vendor_id="vendor-123",
            detail_data=json.dumps([{"id": "d1", "itemName": "Item 1", "qty": "10"}]),
            attachments=json.dumps(["file1.pdf", "file2.jpg"])
        )
        mock_repo.create.return_value = mock_created

        # Act
        result = fat_service.create_fat(fat_data, user_id=1, username="admin")

        # Assert
        assert result.id == "fat-123"
        assert result.vendor_id == "vendor-123"
        mock_resolve.assert_called_once_with(mock_repo.db, "Vendor A")
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_update_fat_success(fat_service, mock_repo):
    # Arrange
    mock_db_fat = models.FAT(id="fat-123", equipment="Old Equipment")
    mock_repo.get_by_id.return_value = mock_db_fat

    fat_update = schemas.FATUpdate(
        equipment="New Equipment",
        supplier="Vendor B",
        attachments=["new_file.pdf"]
    )

    class MockColumn:
        def __init__(self, name):
            self.name = name

    with patch('services.fat_service.log_audit') as mock_log, \
         patch('services.fat_service._resolve_vendor_id') as mock_resolve:

        mock_db_fat.__table__ = MagicMock()
        mock_db_fat.__table__.columns = [MockColumn("id"), MockColumn("equipment")]

        mock_resolve.return_value = "vendor-456"

        mock_updated = models.FAT(
            id="fat-123",
            equipment="New Equipment",
            vendor_id="vendor-456",
            attachments=json.dumps(["new_file.pdf"])
        )
        mock_repo.update.return_value = mock_updated

        # Act
        result = fat_service.update_fat("fat-123", fat_update, user_id=1, username="admin")

        # Assert
        assert result.equipment == "New Equipment"
        assert json.loads(result.attachments) == ["new_file.pdf"]
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_update_fat_detail(fat_service, mock_repo):
    # Arrange
    mock_db_fat = models.FAT(id="fat-123", equipment="Test Equip")
    mock_repo.get_by_id.return_value = mock_db_fat

    details = [{"id": "d1", "itemName": "Updated Item", "qty": "20"}]

    class MockColumn:
        def __init__(self, name):
            self.name = name

    with patch('services.fat_service.log_audit') as mock_log:

        mock_db_fat.__table__ = MagicMock()
        mock_db_fat.__table__.columns = [MockColumn("id"), MockColumn("equipment")]

        mock_updated = models.FAT(
            id="fat-123",
            equipment="Test Equip",
            detail_data=json.dumps(details),
            hasDetails=True
        )
        mock_repo.update.return_value = mock_updated

        # Act
        result = fat_service.update_fat_detail("fat-123", details, user_id=1, username="admin")

        # Assert
        assert result.hasDetails is True
        assert json.loads(result.detail_data) == details
        mock_repo.update.assert_called_once()
        mock_log.assert_called_once()

def test_delete_fat(fat_service, mock_repo):
    # Arrange
    mock_db_fat = models.FAT(id="fat-123", equipment="Test Equip")
    mock_repo.get_by_id.return_value = mock_db_fat

    class MockColumn:
        def __init__(self, name):
            self.name = name

    with patch('services.fat_service.log_audit') as mock_log:

        mock_db_fat.__table__ = MagicMock()
        mock_db_fat.__table__.columns = [MockColumn("id"), MockColumn("equipment")]

        # Act
        result = fat_service.delete_fat("fat-123")

        # Assert
        assert result is True
        mock_repo.delete.assert_called_once_with(mock_db_fat)
        mock_log.assert_called_once()
