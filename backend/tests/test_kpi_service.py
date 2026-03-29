import pytest
from unittest.mock import MagicMock, patch
from services.kpi_service import KPIService
import models
import schemas

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def kpi_service(mock_repo):
    return KPIService(mock_repo)

def test_get_kpi_weight(kpi_service, mock_repo):
    # Arrange
    mock_weight = models.KPIWeight(id="w1", pqp_weight=20, itp_weight=30, obs_weight=25, ncr_weight=25)
    mock_repo.get_kpi_weight.return_value = mock_weight

    # Act
    result = kpi_service.get_kpi_weight()

    # Assert
    assert result.pqp_weight == 20
    assert result.itp_weight == 30
    mock_repo.get_kpi_weight.assert_called_once()

def test_update_kpi_weight(kpi_service, mock_repo):
    # Arrange
    mock_db_weight = models.KPIWeight(id="w1", pqp_weight=25, itp_weight=25, obs_weight=25, ncr_weight=25)
    mock_repo.get_kpi_weight.return_value = mock_db_weight

    update_data = schemas.KPIWeightUpdate(
        pqp_weight=10, itp_weight=40, obs_weight=30, ncr_weight=20
    )

    mock_updated = models.KPIWeight(id="w1", pqp_weight=10, itp_weight=40, obs_weight=30, ncr_weight=20)
    mock_repo.update_kpi_weight.return_value = mock_updated

    with patch('services.kpi_service.log_audit') as mock_log:
        # Act
        result = kpi_service.update_kpi_weight(update_data, user_id=1, username="admin")

        # Assert
        assert result.pqp_weight == 10
        assert result.itp_weight == 40
        mock_repo.update_kpi_weight.assert_called_once()
        mock_log.assert_called_once()
        
def test_create_owner_performance(kpi_service, mock_repo):
    # Arrange
    perf_data = schemas.OwnerPerformanceCreate(
        month="2026-02",
        owner_name="Test Owner",
        score=95
    )
    
    mock_created = models.OwnerPerformance(
        id="perf-123",
        month="2026-02",
        owner_name="Test Owner",
        score=95
    )
    mock_repo.create_owner_performance.return_value = mock_created
    
    with patch('services.kpi_service.log_audit') as mock_log:
        # Act
        result = kpi_service.create_owner_performance(perf_data, user_id=1, username="admin")
        
        # Assert
        assert result.id == "perf-123"
        assert result.score == 95
        mock_repo.create_owner_performance.assert_called_once()
        mock_log.assert_called_once()
