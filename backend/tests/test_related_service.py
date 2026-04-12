"""Tests for services.related_service.RelatedService.

Uses the in-memory SQLite ``db_session`` fixture from conftest so the
real SQLAlchemy relationships are exercised — mocking here would only
hide bugs in the graph definition.

Fixture shape:
    ITP-1 ──► NOI-1 ──► ITR-1, ITR-2, NCR-1
          └─► NOI-2 ──► ITR-3, NCR-2

    (plus an orphan ITP-O with no NOIs, and an orphan NOI-O with no
     upstream ITP, to exercise the "no related docs" path.)
"""

import pytest

import models
from services.related_service import RelatedService


@pytest.fixture
def graph(db_session, sample_contractor):
    """Populate the DB with the two-chapter fixture described above."""
    vendor_id = sample_contractor.id

    itp1 = models.ITP(
        id="itp-1", vendor_id=vendor_id, referenceNo="ITP-TC-001",
        description="Structural welding ITP", status="Approved",
        submissionDate="2025-02-01",
    )
    itp_orphan = models.ITP(
        id="itp-orphan", vendor_id=vendor_id, referenceNo="ITP-TC-999",
        description="Lonely ITP", status="Draft",
    )

    noi1 = models.NOI(
        id="noi-1", package="P01", referenceNo="NOI-TC-001",
        issueDate="2025-04-10", inspectionTime="10:00",
        itpNo="ITP-TC-001", inspectionDate="2025-04-15", type="site",
        vendor_id=vendor_id, status="Scheduled", checkpoint="Weld root",
    )
    noi2 = models.NOI(
        id="noi-2", package="P02", referenceNo="NOI-TC-002",
        issueDate="2025-04-11", inspectionTime="11:00",
        itpNo="ITP-TC-001", inspectionDate="2025-04-16", type="site",
        vendor_id=vendor_id, status="Scheduled", checkpoint="Weld cap",
    )
    noi_orphan = models.NOI(
        id="noi-orphan", package="P99", referenceNo="NOI-TC-999",
        issueDate="2025-04-12", inspectionTime="09:00",
        itpNo=None, inspectionDate="2025-04-20", type="site",
        vendor_id=vendor_id, status="Scheduled",
    )

    itr1 = models.ITR(
        id="itr-1", vendor_id=vendor_id, documentNumber="ITR-TC-001",
        description="Weld test 1", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-TC-001", subject="Root weld", raiseDate="2025-04-15",
    )
    itr2 = models.ITR(
        id="itr-2", vendor_id=vendor_id, documentNumber="ITR-TC-002",
        description="Weld test 2", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-TC-001", subject="Fillet weld", raiseDate="2025-04-15",
    )
    itr3 = models.ITR(
        id="itr-3", vendor_id=vendor_id, documentNumber="ITR-TC-003",
        description="Cap weld test", rev="A", submit="Initial", status="Pass",
        noiNumber="NOI-TC-002", subject="Cap weld", raiseDate="2025-04-16",
    )
    ncr1 = models.NCR(
        id="ncr-1", vendor_id=vendor_id, documentNumber="NCR-TC-001",
        description="Weld porosity", rev="A", submit="Initial", status="Open",
        noiNumber="NOI-TC-001", subject="Porosity in root weld",
        raiseDate="2025-04-15",
    )
    ncr2 = models.NCR(
        id="ncr-2", vendor_id=vendor_id, documentNumber="NCR-TC-002",
        description="Undercut", rev="A", submit="Initial", status="Open",
        noiNumber="NOI-TC-002", subject="Undercut in cap weld",
        raiseDate="2025-04-16",
    )

    db_session.add_all([
        itp1, itp_orphan, noi1, noi2, noi_orphan,
        itr1, itr2, itr3, ncr1, ncr2,
    ])
    db_session.commit()
    return db_session


@pytest.fixture
def service(graph):
    return RelatedService(graph)


def _ids(entries):
    return sorted((e["entityType"], e["id"]) for e in entries)


def test_itp_downstream_walks_two_hops(service):
    result = service.get_related("itp", "itp-1", max_depth=2)

    # upstream: ITP has none in this phase (pqp link arrives in PR3)
    assert result["upstream"] == []

    # downstream at depth 2: 2 NOIs (level 1) + 3 ITRs + 2 NCRs (level 2)
    assert _ids(result["downstream"]) == sorted([
        ("noi", "noi-1"),
        ("noi", "noi-2"),
        ("itr", "itr-1"),
        ("itr", "itr-2"),
        ("itr", "itr-3"),
        ("ncr", "ncr-1"),
        ("ncr", "ncr-2"),
    ])

    # Check level assignment
    by_id = {(e["entityType"], e["id"]): e for e in result["downstream"]}
    assert by_id[("noi", "noi-1")]["level"] == 1
    assert by_id[("itr", "itr-1")]["level"] == 2
    assert by_id[("ncr", "ncr-2")]["level"] == 2


def test_itr_upstream_reaches_itp_in_two_hops(service):
    result = service.get_related("itr", "itr-1", max_depth=2)

    assert result["downstream"] == []
    assert _ids(result["upstream"]) == sorted([
        ("noi", "noi-1"),
        ("itp", "itp-1"),
    ])

    by_id = {(e["entityType"], e["id"]): e for e in result["upstream"]}
    assert by_id[("noi", "noi-1")]["level"] == 1
    assert by_id[("itp", "itp-1")]["level"] == 2
    assert by_id[("itp", "itp-1")]["direction"] == "upstream"


def test_ncr_upstream_reaches_itp(service):
    result = service.get_related("ncr", "ncr-2", max_depth=2)
    assert _ids(result["upstream"]) == sorted([
        ("noi", "noi-2"),
        ("itp", "itp-1"),
    ])


def test_max_depth_1_only_direct_neighbours(service):
    result = service.get_related("itp", "itp-1", max_depth=1)
    # Only the two NOIs — no ITRs or NCRs since those are two hops away.
    assert _ids(result["downstream"]) == sorted([
        ("noi", "noi-1"),
        ("noi", "noi-2"),
    ])


def test_missing_entity_returns_empty(service):
    result = service.get_related("itp", "does-not-exist")
    assert result == {"upstream": [], "downstream": []}


def test_unknown_entity_type_returns_empty(service):
    result = service.get_related("pqp", "whatever")
    assert result == {"upstream": [], "downstream": []}


def test_orphan_itp_has_no_downstream(service):
    result = service.get_related("itp", "itp-orphan")
    assert result == {"upstream": [], "downstream": []}


def test_orphan_noi_has_no_upstream_itp(service):
    result = service.get_related("noi", "noi-orphan")
    assert result["upstream"] == []
    assert result["downstream"] == []


def test_serialized_entry_shape(service):
    result = service.get_related("ncr", "ncr-1", max_depth=2)
    noi_entry = next(e for e in result["upstream"] if e["entityType"] == "noi")

    # Required keys present
    assert set(noi_entry.keys()) == {
        "entityType", "id", "referenceNo", "title", "status",
        "vendorName", "level", "direction", "primaryDate",
    }
    assert noi_entry["referenceNo"] == "NOI-TC-001"
    # NOI has no description — title should fall back to checkpoint
    assert noi_entry["title"] == "Weld root"
    assert noi_entry["primaryDate"] == "2025-04-15"
    assert noi_entry["vendorName"] == "Test Contractor"
    assert noi_entry["direction"] == "upstream"
