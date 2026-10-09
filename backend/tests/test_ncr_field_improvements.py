"""BACKLOG #13 — NCR field-model improvements.

Covers: severity-driven dueDate SLA auto-fill, the corrective-action
effectiveness closure gate, auto-stamping of closedBy / effectivenessVerifiedBy,
controlled-value (enum) validation, and the Resolved→In Progress transition.
"""

import pytest
from core.perms import NCR_CLOSE
from unittest.mock import MagicMock, patch
from pydantic import ValidationError

from services.ncr_service import NCRService, NCR_SLA_DAYS
from core.utils import WorkflowEngine
import models
import schemas


@pytest.fixture
def mock_repo():
    return MagicMock()


@pytest.fixture(autouse=True)
def _usable_improvement_photo():
    """These unit tests are about the OTHER closure rules, on a mocked repository (no attachments table, no upload folder): the server-side photo
    check is patched to "one usable photo". It is tested for real — files, rows, refusals — in test_ncr_closure_photos_http.py."""
    with patch('services.ncr_service.improvement_photo_evidence', return_value=(1, [])):
        yield


@pytest.fixture
def ncr_service(mock_repo):
    return NCRService(mock_repo)


def _make_create(**overrides):
    base = dict(description="d", rev="A", submit="Initial", status="Open")
    base.update(overrides)
    return schemas.NCRCreate(**base)


def _captured_new_record(mock_repo):
    """The models.NCR passed to repo.create()."""
    return mock_repo.create.call_args[0][0]


# --- SLA auto-fill (gap #1) ---

@pytest.mark.parametrize("severity,expected", [("Major", "2026-01-08"), ("Minor", "2026-01-15")])
def test_create_auto_fills_due_date_from_severity(ncr_service, mock_repo, severity, expected):
    with patch('services.ncr_service.generate_reference_no', return_value="NCR-1"), \
         patch('services.ncr_service.log_audit'):
        mock_repo.create.side_effect = lambda obj, **kw: obj
        ncr_service.create_ncr(_make_create(severity=severity, raiseDate="2026-01-01"),
                               user_id=1, username="qa")
        assert _captured_new_record(mock_repo).dueDate == expected
        assert NCR_SLA_DAYS[severity] in (7, 14)


def test_create_respects_explicit_due_date(ncr_service, mock_repo):
    with patch('services.ncr_service.generate_reference_no', return_value="NCR-1"), \
         patch('services.ncr_service.log_audit'):
        mock_repo.create.side_effect = lambda obj, **kw: obj
        ncr_service.create_ncr(
            _make_create(severity="Major", raiseDate="2026-01-01", dueDate="2026-02-01"),
            user_id=1, username="qa")
        assert _captured_new_record(mock_repo).dueDate == "2026-02-01"


def test_create_without_severity_does_not_autofill(ncr_service, mock_repo):
    with patch('services.ncr_service.generate_reference_no', return_value="NCR-1"), \
         patch('services.ncr_service.log_audit'):
        mock_repo.create.side_effect = lambda obj, **kw: obj
        ncr_service.create_ncr(_make_create(raiseDate="2026-01-01"), user_id=1, username="qa")
        assert not _captured_new_record(mock_repo).dueDate


# --- Effectiveness closure gate + stamping (gaps #2/#3) ---

def _resolved_ncr_ready_to_close(**overrides):
    base = dict(
        id="ncr-1", documentNumber="NCR-1", status="Resolved",
        productDisposition="Rework", repairMethodStatement="fixed",
        reInspectionNumber="ITR-9", improvementPhotos='["after.jpg"]',
        drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
    )
    base.update(overrides)
    return models.NCR(**base)


def test_close_blocked_without_effectiveness_verified(ncr_service, mock_repo):
    mock_repo.get_by_id.return_value = _resolved_ncr_ready_to_close(effectivenessVerified=None)
    with patch('services.ncr_service.log_audit'):
        with pytest.raises(ValueError, match="effectiveness"):
            ncr_service.update_ncr("ncr-1", schemas.NCRUpdate(status="Closed"),
                                   user_id=7, username="qa", permissions={NCR_CLOSE})


def test_close_succeeds_with_effectiveness_and_stamps_actors(ncr_service, mock_repo):
    mock_repo.get_by_id.return_value = _resolved_ncr_ready_to_close()
    mock_repo.update.side_effect = lambda obj, d, **kw: obj
    with patch('services.ncr_service.log_audit'):
        ncr_service.update_ncr(
            "ncr-1", schemas.NCRUpdate(status="Closed", effectivenessVerified="Yes"),
            user_id=7, username="qa", permissions={NCR_CLOSE})
        applied = mock_repo.update.call_args[0][1]
        assert applied["closedBy"] == 7
        assert applied["effectivenessVerifiedBy"] == 7
        assert applied["effectivenessVerifiedDate"]
        assert applied.get("closeoutDate")


# --- repairMethodStatement / TBC-NA status closure-gate consistency (BACKLOG
# item 6). A TBC/NA status must satisfy the "Repair needs a method statement"
# gate the same way the old magic-string text used to (it's an explicit
# answer, not a blank field) — mirrors the frontend's superRefine check in
# ncrFormSchema.ts, which was updated the same way. ---

def _repair_ncr_ready_to_close(**overrides):
    base = dict(
        id="ncr-1", documentNumber="NCR-1", status="Resolved",
        productDisposition="Repair", repairMethodStatement=None,
        repairMethodStatementStatus=None,
        reInspectionNumber="ITR-9", improvementPhotos='["after.jpg"]',
        drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
        effectivenessVerified="Yes", ownerApproval="Approved",
    )
    base.update(overrides)
    return models.NCR(**base)


def test_close_blocked_when_repair_method_statement_and_status_both_blank(ncr_service, mock_repo):
    mock_repo.get_by_id.return_value = _repair_ncr_ready_to_close()
    with patch('services.ncr_service.log_audit'):
        with pytest.raises(ValueError, match="repairMethodStatement"):
            ncr_service.update_ncr("ncr-1", schemas.NCRUpdate(status="Closed"),
                                   user_id=7, username="qa", permissions={NCR_CLOSE})


def test_close_succeeds_when_repair_method_statement_status_is_na(ncr_service, mock_repo):
    mock_repo.get_by_id.return_value = _repair_ncr_ready_to_close(repairMethodStatementStatus="NA")
    mock_repo.update.side_effect = lambda obj, d, **kw: obj
    with patch('services.ncr_service.log_audit'):
        ncr_service.update_ncr("ncr-1", schemas.NCRUpdate(status="Closed"),
                               user_id=7, username="qa", permissions={NCR_CLOSE})  # should not raise


def test_close_succeeds_when_repair_method_statement_text_present(ncr_service, mock_repo):
    mock_repo.get_by_id.return_value = _repair_ncr_ready_to_close(repairMethodStatement="Grind and re-weld.")
    mock_repo.update.side_effect = lambda obj, d, **kw: obj
    with patch('services.ncr_service.log_audit'):
        ncr_service.update_ncr("ncr-1", schemas.NCRUpdate(status="Closed"),
                               user_id=7, username="qa", permissions={NCR_CLOSE})  # should not raise


# --- Locked quality fields on a Closed NCR now also cover the *Status
# companion columns (BACKLOG item 6), same lock as their text fields. ---

def test_closed_ncr_blocks_editing_repair_method_statement_status(ncr_service, mock_repo):
    mock_repo.get_by_id.return_value = _repair_ncr_ready_to_close(status="Closed", repairMethodStatementStatus="NA")
    with patch('services.ncr_service.log_audit'):
        with pytest.raises(ValueError, match="Cannot modify quality fields"):
            ncr_service.update_ncr("ncr-1", schemas.NCRUpdate(repairMethodStatementStatus="TBC"),
                                   user_id=7, username="qa")


# --- Controlled-value (enum) validation ---

@pytest.mark.parametrize("field,bad", [
    ("severity", "Critical"),
    ("discipline", "Plumbing"),
    ("productDisposition", "Scrap"),
    ("effectivenessVerified", "Maybe"),
    ("status", "Pending Verification"),
])
def test_schema_rejects_out_of_list_values(field, bad):
    with pytest.raises(ValidationError):
        _make_create(**{field: bad})


def test_schema_accepts_valid_controlled_values():
    c = _make_create(severity="Major", discipline="Civil",
                     productDisposition="Rework", effectivenessVerified="Pending")
    assert c.severity == "Major" and c.discipline == "Civil"


# --- Workflow transition (gap #6) ---

def test_resolved_can_route_back_to_in_progress():
    assert WorkflowEngine.validate_transition("NCR", "Resolved", "In Progress") is True
    assert WorkflowEngine.validate_transition("NCR", "Resolved", "Closed") is True
