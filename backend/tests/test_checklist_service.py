import pytest
from unittest.mock import MagicMock, patch
from services.checklist_service import ChecklistService
import models
import schemas
import json

@pytest.fixture
def mock_repo():
    return MagicMock()

@pytest.fixture
def checklist_service(mock_repo):
    return ChecklistService(mock_repo)

def test_create_checklist_auto_records_no(checklist_service, mock_repo):
    chk_data = schemas.ChecklistCreate(
        recordsNo="[AUTO-GENERATE]",
        activity="Test Activity",
        date="2026-01-01",
        status="Ongoing",
        packageName="PKG-01",
        contractor="Vendor A",
        detail_data=json.dumps({"key": "value"})
    )
    
    with patch('services.checklist_service._resolve_vendor_id') as mock_resolve, \
         patch('services.checklist_service.generate_reference_no') as mock_gen_ref, \
         patch('services.checklist_service.log_audit') as mock_log:
        
        mock_resolve.return_value = "vendor-123"
        mock_gen_ref.return_value = "QTS-A-CHK-000001"
        
        mock_created = models.Checklist(
            id="chk-123",
            recordsNo="QTS-A-CHK-000001",
            contractor_id="vendor-123",
            status="Ongoing",
            detail_data=json.dumps({"key": "value"})
        )
        mock_repo.create.return_value = mock_created
        
        result = checklist_service.create_checklist(chk_data, user_id=1, username="admin")
        
        assert result.id == "chk-123"
        assert result.recordsNo == "QTS-A-CHK-000001"
        assert result.contractor_id == "vendor-123"
        assert result.detail_data == json.dumps({"key": "value"})
        mock_gen_ref.assert_called_once_with(mock_repo.db, "Vendor A", "CHECKLIST")
        mock_repo.create.assert_called_once()
        mock_log.assert_called_once()

def test_create_checklist_custom_records_no(checklist_service, mock_repo):
    chk_data = schemas.ChecklistCreate(
        recordsNo="CUSTOM-CHK-01",
        activity="Test Activity",
        date="2026-01-01",
        status="Ongoing"
    )
    
    with patch('services.checklist_service.log_audit') as mock_log, \
         patch('services.checklist_service.generate_reference_no') as mock_gen_ref:
        
        mock_created = models.Checklist(
            id="chk-123",
            recordsNo="CUSTOM-CHK-01",
            status="Ongoing"
        )
        mock_repo.create.return_value = mock_created
        
        result = checklist_service.create_checklist(chk_data)
        
        assert result.recordsNo == "CUSTOM-CHK-01"
        mock_gen_ref.assert_not_called()
        mock_repo.create.assert_called_once()

def test_update_checklist_status_transition_fail(checklist_service, mock_repo):
    # Current status is Pass
    mock_db_chk = models.Checklist(id="chk-123", status="Pass", recordsNo="CHK-01")
    mock_repo.get_by_id.return_value = mock_db_chk
    
    # Try an invalid transition (assuming WorkflowEngine rules for Checklist are defined)
    chk_update = schemas.ChecklistUpdate(status="InvalidStatus")
    
    with patch('services.checklist_service.WorkflowEngine.validate_transition', return_value=False):
        with pytest.raises(ValueError) as excinfo:
            checklist_service.update_checklist("chk-123", chk_update)
        
        assert "Invalid status transition" in str(excinfo.value)
        mock_repo.update.assert_not_called()

def test_update_checklist_success(checklist_service, mock_repo):
    # Must be a real instance (itrId set), not a bare template — a
    # template can never legitimately reach Pass/Fail (§17 isolation
    # hardening, 2026-09-19).
    mock_db_chk = models.Checklist(
        id="chk-123", status="Ongoing", recordsNo="CHK-01", itrId="itr-123",
        detail_data=json.dumps({"items": [{"item": "a", "criteria": "b", "situation": "", "result": ""}]}),
    )
    mock_repo.get_by_id.return_value = mock_db_chk
    
    # Create mock column_attrs for the inspect mock
    class MockColumn:
        def __init__(self, key):
            self.key = key
            
    with patch('services.checklist_service.WorkflowEngine.validate_transition', return_value=True), \
         patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
         
        # Make inspect return a mock object with column_attrs
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper
         
        # A Pass must be backed by real items (2026-09-19 pass-integrity
        # guard): non-empty, every item O, passCount matching. This test
        # previously declared Pass over {"updated": True} — i.e. no items at
        # all — which is exactly the gap that guard closes.
        chk_update = schemas.ChecklistUpdate(
            status="Pass", passCount=1, failCount=0,
            detail_data=json.dumps({"items": [{"item": "a", "criteria": "b", "situation": "", "result": "O"}]}),
        )

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        # 2026-09-19 atomicity fix: no more repo.update() — the service
        # mutates db_checklist directly and commits once itself.
        assert result.status == "Pass"
        mock_repo.update.assert_not_called()
        mock_repo.db.commit.assert_called_once()
        mock_log.assert_called_once()

def test_update_locked_checklist_rejects_result_change(checklist_service, mock_repo):
    """A Pass/Fail Checklist still has a real reopen path (WorkflowEngine
    allows Pass/Fail -> Ongoing, "允許回退修改"), so only the inspection
    results are locked, not the whole record — mirrors OBS's/PQP's
    reopen-aware locked-fields pattern."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01",
        detail_data=json.dumps({"items": ["orig"]}), passCount=5, failCount=0,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    chk_update = schemas.ChecklistUpdate(detail_data=json.dumps({"items": ["tampered"]}))

    with pytest.raises(ValueError) as excinfo:
        checklist_service.update_checklist("chk-123", chk_update)

    assert "Pass/Fail Checklist" in str(excinfo.value)
    mock_repo.update.assert_not_called()

def test_update_locked_checklist_allows_noop_resave(checklist_service, mock_repo):
    """The frontend resends the whole record every save, so a locked field
    present with its existing value (no real change) must not be rejected."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01", itrId="itr-123",
        detail_data=json.dumps({"items": ["same"]}), passCount=5, failCount=0,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(detail_data=json.dumps({"items": ["same"]}), passCount=5)

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        assert result.status == "Pass"
        mock_repo.update.assert_not_called()
        mock_repo.db.commit.assert_called_once()
        mock_log.assert_called_once()

def test_update_locked_checklist_allows_non_locked_field_change(checklist_service, mock_repo):
    """Only the inspection-result fields are locked — administrative fields
    like location stay editable on a Pass/Fail Checklist, matching NCR/OBS/
    PQP's precedent of not locking every field once closed/approved."""
    mock_db_chk = models.Checklist(id="chk-123", status="Pass", recordsNo="CHK-01", location="Old Location")
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(location="New Location")

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        assert result.location == "New Location"
        mock_repo.update.assert_not_called()
        mock_repo.db.commit.assert_called_once()
        mock_log.assert_called_once()

def test_update_locked_checklist_refuses_reopen_that_also_changes_results(checklist_service, mock_repo):
    """RULE CHANGE (2026-09-20, status-consistency follow-up). This test used to be
    `..._allows_reopen_with_result_change`: a save that reopened (status -> Ongoing) could change the
    results in the same request. A pure Reopen is now only Pass/Fail -> Ongoing with NO substantive
    change of results/counts; a request that also changes them is not a Reopen and is refused like any
    other edit of a closed checklist (reopen first, then save the results). The frontend's Reopen
    sends the status alone, so it is unaffected."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01",
        detail_data=json.dumps({"items": ["orig"]}),
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.WorkflowEngine.validate_transition', return_value=True), \
         patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("status"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(status="Ongoing", detail_data=json.dumps({"items": ["revised"]}))

        with pytest.raises(ValueError) as excinfo:
            checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        assert "Reopen" in str(excinfo.value)
        assert mock_db_chk.status == "Pass"
        mock_repo.update.assert_not_called()
        mock_log.assert_not_called()

def test_delete_checklist(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(id="chk-123", recordsNo="CHK-01")
    mock_repo.get_by_id.return_value = mock_db_chk
    
    class MockColumn:
        def __init__(self, key):
            self.key = key
            
    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
         
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper
        
        result = checklist_service.delete_checklist("chk-123")

        # 2026-09-19 atomicity fix: delete + audit log commit together via
        # self.repo.db directly, not self.repo.delete().
        assert result is True
        mock_repo.delete.assert_not_called()
        mock_repo.db.delete.assert_called_once_with(mock_db_chk)
        mock_repo.db.commit.assert_called_once()
        mock_log.assert_called_once()


# ---------------------------------------------------------------------------
# §17 isolation/traceability hardening (2026-09-19)
# ---------------------------------------------------------------------------

def test_create_checklist_rejects_template_id_directly(checklist_service, mock_repo):
    """template_id, like itrId, is provenance only link_checklist may set."""
    chk_data = schemas.ChecklistCreate(
        recordsNo="CHK-001", activity="Test", date="2026-01-01", status="Ongoing",
        template_id="template-999", detail_data="{}"
    )
    with pytest.raises(ValueError, match="link-checklist"):
        checklist_service.create_checklist(chk_data)
    mock_repo.create.assert_not_called()


def test_create_checklist_rejects_bare_template_with_results(checklist_service, mock_repo):
    """No itrId/template_id at all, but status=Pass — a fabricated
    'already-passed' template, the exact live-production anomaly this
    hardening closes going forward."""
    chk_data = schemas.ChecklistCreate(
        recordsNo="CHK-001", activity="Test", date="2026-01-01", status="Pass",
        passCount=3, detail_data=json.dumps({"items": [{"item": "a", "result": "O"}]})
    )
    with pytest.raises(ValueError, match="template"):
        checklist_service.create_checklist(chk_data)
    mock_repo.create.assert_not_called()


def test_update_checklist_rejects_itrid_change(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(id="chk-123", status="Ongoing", recordsNo="CHK-01", itrId="itr-a")
    mock_repo.get_by_id.return_value = mock_db_chk

    chk_update = schemas.ChecklistUpdate(itrId="itr-b")
    with pytest.raises(ValueError, match="itrId"):
        checklist_service.update_checklist("chk-123", chk_update)
    mock_repo.update.assert_not_called()


def test_update_checklist_rejects_template_id_change(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(
        id="chk-123", status="Ongoing", recordsNo="CHK-01",
        itrId="itr-a", template_id="template-a",
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    chk_update = schemas.ChecklistUpdate(template_id="template-b")
    with pytest.raises(ValueError, match="template_id"):
        checklist_service.update_checklist("chk-123", chk_update)
    mock_repo.update.assert_not_called()


def test_update_checklist_rejects_bare_template_result_write(checklist_service, mock_repo):
    """Same guard as create, exercised via update: a template can't be
    walked into holding results field-by-field either."""
    mock_db_chk = models.Checklist(id="chk-123", status="Ongoing", recordsNo="CHK-01")
    mock_repo.get_by_id.return_value = mock_db_chk

    chk_update = schemas.ChecklistUpdate(status="Pass", passCount=2)
    with pytest.raises(ValueError, match="template"):
        checklist_service.update_checklist("chk-123", chk_update)
    mock_repo.update.assert_not_called()


def test_update_instance_blocked_when_parent_itr_approved(checklist_service, mock_repo):
    """The central finding: once the parent ITR is Approved, its linked
    Checklist instance is fully frozen — including Reopen, which otherwise
    would bypass the ITR-level lock entirely."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Pass", recordsNo="CHK-01", itrId="itr-a",
        detail_data=json.dumps({"items": []}), passCount=1, failCount=0,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    mock_itr = models.ITR(id="itr-a", documentNumber="ITR-001", status="Approved")
    mock_repo.db.query.return_value.populate_existing.return_value.filter.return_value.first.return_value = mock_itr   # parent status is read fresh (populate_existing)

    # Even a Reopen attempt (status -> Ongoing) must be blocked.
    chk_update = schemas.ChecklistUpdate(status="Ongoing")
    with pytest.raises(ValueError, match="Approved"):
        checklist_service.update_checklist("chk-123", chk_update)
    mock_repo.update.assert_not_called()


def test_update_instance_blocked_when_parent_itr_void(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(id="chk-123", status="Ongoing", recordsNo="CHK-01", itrId="itr-a")
    mock_repo.get_by_id.return_value = mock_db_chk

    mock_itr = models.ITR(id="itr-a", documentNumber="ITR-001", status="Void")
    mock_repo.db.query.return_value.populate_existing.return_value.filter.return_value.first.return_value = mock_itr   # parent status is read fresh (populate_existing)

    chk_update = schemas.ChecklistUpdate(location="New Location")
    with pytest.raises(ValueError, match="Void"):
        checklist_service.update_checklist("chk-123", chk_update)
    mock_repo.update.assert_not_called()


def test_update_instance_allowed_when_parent_itr_in_progress(checklist_service, mock_repo):
    """Sanity check: the new parent-ITR gate only blocks Approved/Void —
    a normal in-progress instance is unaffected."""
    mock_db_chk = models.Checklist(id="chk-123", status="Ongoing", recordsNo="CHK-01", itrId="itr-a")
    mock_repo.get_by_id.return_value = mock_db_chk

    mock_itr = models.ITR(id="itr-a", documentNumber="ITR-001", status="In Progress")
    mock_repo.db.query.return_value.populate_existing.return_value.filter.return_value.first.return_value = mock_itr   # parent status is read fresh (populate_existing)

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit') as mock_log:
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(location="New Location")

        result = checklist_service.update_checklist("chk-123", chk_update, user_id=1, username="admin")

        mock_repo.update.assert_not_called()
        mock_repo.db.commit.assert_called_once()
        assert result is mock_db_chk


def test_update_template_bumps_version_on_activity_change(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(
        id="chk-123", status="Ongoing", recordsNo="CHK-01", activity="Old Activity", version=1,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit'):
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(activity="New Activity")
        result = checklist_service.update_checklist("chk-123", chk_update)

        assert result.version == 2


def test_update_template_bumps_version_on_items_change(checklist_service, mock_repo):
    mock_db_chk = models.Checklist(
        id="chk-123", status="Ongoing", recordsNo="CHK-01", version=1,
        detail_data=json.dumps({"items": [{"item": "A", "criteria": "x", "situation": "", "result": ""}]}),
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit'):
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        new_detail = json.dumps({"items": [{"item": "B", "criteria": "y", "situation": "", "result": ""}]})
        chk_update = schemas.ChecklistUpdate(detail_data=new_detail)
        result = checklist_service.update_checklist("chk-123", chk_update)

        assert result.version == 2


def test_update_template_does_not_bump_version_on_location_change(checklist_service, mock_repo):
    """location/packageName/contractor are execution context for a specific
    inspection run (the frontend's "Base Information" tab), not template
    content — changing them must never bump `version`."""
    mock_db_chk = models.Checklist(
        id="chk-123", status="Ongoing", recordsNo="CHK-01", location="Old Loc", version=1,
    )
    mock_repo.get_by_id.return_value = mock_db_chk

    class MockColumn:
        def __init__(self, key):
            self.key = key

    with patch('services.checklist_service.inspect') as mock_inspect, \
         patch('services.checklist_service.log_audit'):
        mock_mapper = MagicMock()
        mock_mapper.column_attrs = [MockColumn("id"), MockColumn("recordsNo")]
        mock_inspect.return_value = mock_mapper

        chk_update = schemas.ChecklistUpdate(location="New Loc")
        result = checklist_service.update_checklist("chk-123", chk_update)

        assert result.version == 1  # unchanged


def test_delete_instance_always_rejected(checklist_service, mock_repo):
    """An ITR-owned instance must be removed only via the ITR's Unlink
    action — never a direct delete, no matter its status."""
    mock_db_chk = models.Checklist(id="chk-123", recordsNo="CHK-01", itrId="itr-a", status="Ongoing")
    mock_repo.get_by_id.return_value = mock_db_chk

    with pytest.raises(ValueError, match="Unlink"):
        checklist_service.delete_checklist("chk-123")
    mock_repo.delete.assert_not_called()


def test_delete_pass_fail_template_rejected(checklist_service, mock_repo):
    """Checklist has no Void state to route a closed row through first —
    a Pass/Fail row (even a legacy bare-template one) can never be
    hard-deleted. 2026-09-19: the guard now checks historical evidence
    (_instance_has_historical_evidence), not just current status — this
    row still trips it via its current Pass status either way."""
    mock_db_chk = models.Checklist(id="chk-123", recordsNo="CHK-01", status="Pass")
    mock_repo.get_by_id.return_value = mock_db_chk

    with pytest.raises(ValueError, match="held inspection evidence"):
        checklist_service.delete_checklist("chk-123")
    mock_repo.delete.assert_not_called()
    mock_repo.db.delete.assert_not_called()
