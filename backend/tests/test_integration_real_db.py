"""
Integration tests that exercise the real SQLAlchemy ORM against an
in-memory SQLite database.

Unit tests elsewhere in this suite rely heavily on MagicMock, which is fast
but brittle: they pass even when the actual query shapes drift. This file
complements them by running the real code paths end-to-end so regressions
in query wiring, schema, or service ordering get caught.
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import database as database_module
from database import Base
import models
import schemas
from repositories.itp_repository import ITPRepository
from repositories.noi_repository import NOIRepository
from repositories.ncr_repository import NCRRepository
from repositories.itr_repository import ITRRepository
from repositories.contractor_repository import ContractorRepository
from repositories.meeting_minutes_repository import MeetingMinutesRepository
from services.itp_service import ITPService
from services.noi_service import NOIService
from services.ncr_service import NCRService
from services.itr_service import ITRService
from services.meeting_minutes_service import MeetingMinutesService


@pytest.fixture
def db_session(monkeypatch):
    """In-memory SQLite session with all tables created.

    Also redirects database.SessionLocal so any code that pulls a session
    from the global helper gets our test session.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=engine
    )
    session = TestingSessionLocal()

    monkeypatch.setattr(database_module, "engine", engine)
    monkeypatch.setattr(database_module, "SessionLocal", TestingSessionLocal)

    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


@pytest.fixture
def vendor(db_session):
    """A committed contractor row that services can resolve by name."""
    contractor = models.Contractor(
        id="vendor-1",
        name="Acme Co",
        abbreviation="ACM",
    )
    db_session.add(contractor)
    db_session.commit()
    return contractor


def test_create_itp_generates_sequential_reference_numbers(db_session, vendor):
    service = ITPService(ITPRepository(db_session))

    created = []
    for i in range(3):
        itp = service.create_itp(
            schemas.ITPCreate(
                description=f"ITP number {i}",
                vendor="Acme Co",
                rev="0",
                status="Draft",
            ),
            user_id=1,
            username="tester",
        )
        db_session.commit()
        created.append(itp.referenceNo)

    # All three should exist, be unique, and share the same prefix.
    assert len(set(created)) == 3
    assert all(ref.startswith("QTS-ACM-ITP-") for ref in created), created

    # Sequence numbers embedded in the ref should be strictly increasing.
    tails = [int(ref.split("-")[-1]) for ref in created]
    assert tails == sorted(tails)
    assert tails[1] == tails[0] + 1
    assert tails[2] == tails[1] + 1


def test_ncr_create_with_dangling_noi_drops_it_and_keeps_sequence_intact(db_session, vendor):
    """A dangling noiNumber no longer fails the create (see ncr_service.py's
    "drop it instead of failing the whole save" comment, introduced in
    3811912a) — it's silently cleared instead. This test now verifies that
    updated contract, and keeps the original regression coverage: reference
    numbers still allocate one-per-successful-create, with no gaps or
    double-allocation, across consecutive creates.
    """
    ncr_service = NCRService(NCRRepository(db_session))

    # Attempt 1: dangling noiNumber → succeeds, noiNumber cleared, gets seq 1.
    first = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Bad reference",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
            noiNumber="NOI-DOES-NOT-EXIST",
        ),
        user_id=1,
        username="tester",
    )
    db_session.commit()
    assert first.noiNumber == ""
    assert int(first.documentNumber.split("-")[-1]) == 1

    # Attempt 2: valid create should get the next number, not skip one.
    second = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Good reference",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
        ),
        user_id=1,
        username="tester",
    )
    db_session.commit()

    tail = int(second.documentNumber.split("-")[-1])
    assert tail == 2, f"Expected sequence 000002 but got {second.documentNumber}"


def test_noi_create_with_real_itp_reference(db_session, vendor):
    itp_service = ITPService(ITPRepository(db_session))
    noi_service = NOIService(NOIRepository(db_session))

    itp = itp_service.create_itp(
        schemas.ITPCreate(
            description="Parent ITP",
            vendor="Acme Co",
            rev="0",
            status="Draft",
        )
    )
    db_session.commit()

    noi = noi_service.create_noi(
        schemas.NOICreate(
            package="PKG",
            issueDate="2026-01-01",
            inspectionTime="09:00",
            itpNo=itp.referenceNo,
            inspectionDate="2026-01-02",
            type="Initial",
            contractor="Acme Co",
        )
    )
    db_session.commit()

    assert noi.id is not None
    assert noi.itpNo == itp.referenceNo
    assert noi.referenceNo.startswith("QTS-ACM-NOI-")


def test_noi_create_with_nonexistent_itp_raises(db_session, vendor):
    noi_service = NOIService(NOIRepository(db_session))

    with pytest.raises(ValueError, match="ITP"):
        noi_service.create_noi(
            schemas.NOICreate(
                package="PKG",
                issueDate="2026-01-01",
                inspectionTime="09:00",
                itpNo="ITP-GHOST-999",
                inspectionDate="2026-01-02",
                type="Initial",
                contractor="Acme Co",
            )
        )


def test_ncr_status_transition_allows_direct_close(db_session, vendor):
    ncr_service = NCRService(NCRRepository(db_session))

    ncr = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Track me",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
        )
    )
    db_session.commit()

    # deriveNCRStatus() (ncrFormSchema.ts) only ever produces Open / In Progress /
    # Closed — Effectiveness Verified = Yes closes the NCR in a single save from
    # either Open or In Progress, so both must be legal direct transitions.
    # (ncr_service.update_ncr has its own separate closure gate — repairMethodStatement
    # / reInspectionNumber / improvementPhotos / effectivenessVerified=Yes — that's
    # independent of the WorkflowEngine transition graph this test targets, so it
    # must be satisfied here too or this fails for the wrong reason.)
    updated = ncr_service.update_ncr(
        ncr.id,
        schemas.NCRUpdate(
            status="Closed",
            productDisposition="Rework",
            reInspectionNumber="REINSP-001",
            improvementPhotos=["photo1.jpg"],
            effectivenessVerified="Yes",
            drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
        ),
        user_id=1,
        username="tester",
    )
    assert updated.status == "Closed"

    # A closed NCR stays reachable by ncr:close:all holders (NCR.tsx), and
    # switching Effectiveness back to No/Pending must be able to reopen it.
    reopened = ncr_service.update_ncr(
        ncr.id,
        schemas.NCRUpdate(status="Open"),
        user_id=1,
        username="tester",
    )
    assert reopened.status == "Open"

    # Owner-approval and effectiveness are independent derived signals, so a
    # single save can move status backward too — e.g. In Progress -> Open when
    # the owner un-rejects while effectiveness is still Pending. Regression
    # test for a real bug hit during manual verification.
    to_in_progress = ncr_service.update_ncr(
        ncr.id, schemas.NCRUpdate(status="In Progress"), user_id=1, username="tester",
    )
    assert to_in_progress.status == "In Progress"
    back_to_open = ncr_service.update_ncr(
        ncr.id, schemas.NCRUpdate(status="Open"), user_id=1, username="tester",
    )
    assert back_to_open.status == "Open"

    # Void remains terminal — nothing transitions out of it.
    ncr_service.update_ncr(
        ncr.id, schemas.NCRUpdate(status="Void"), user_id=1, username="tester",
    )
    with pytest.raises(ValueError, match="Invalid status transition"):
        ncr_service.update_ncr(
            ncr.id,
            schemas.NCRUpdate(status="Open"),
            user_id=1,
            username="tester",
        )


def test_ncr_use_as_is_requires_owner_approval_to_close(db_session, vendor):
    ncr_service = NCRService(NCRRepository(db_session))

    ncr = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Weld accepted as-is",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
            productDisposition="Use As Is",
        )
    )
    db_session.commit()

    # All the usual closure-gate fields present, effectiveness verified — but
    # ownerApproval is still unset. Use As Is must not close without it.
    with pytest.raises(ValueError, match="owner/engineering authority approval"):
        ncr_service.update_ncr(
            ncr.id,
            schemas.NCRUpdate(
                status="Closed",
                reInspectionNumber="REINSP-002",
                improvementPhotos=["photo1.jpg"],
                effectivenessVerified="Yes",
                drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
            ),
            user_id=1,
            username="tester",
        )

    # Approve it — now closing succeeds, and the date auto-stamps.
    updated = ncr_service.update_ncr(
        ncr.id,
        schemas.NCRUpdate(
            status="Closed",
            reInspectionNumber="REINSP-002",
            improvementPhotos=["photo1.jpg"],
            effectivenessVerified="Yes",
            ownerApproval="Approved",
            ownerApprovalBy="Jane Owner",
            drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
        ),
        user_id=1,
        username="tester",
    )
    assert updated.status == "Closed"
    assert updated.ownerApproval == "Approved"
    assert updated.ownerApprovalBy == "Jane Owner"
    assert updated.ownerApprovalDate  # auto-stamped


def test_ncr_rework_disposition_does_not_need_owner_approval(db_session, vendor):
    ncr_service = NCRService(NCRRepository(db_session))

    ncr = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Rework instead of accept",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
            productDisposition="Rework",
        )
    )
    db_session.commit()

    # Rework isn't a technical-change disposition — no owner approval, and no
    # repairMethodStatement (that's only required for "Repair"), needed.
    updated = ncr_service.update_ncr(
        ncr.id,
        schemas.NCRUpdate(
            status="Closed",
            reInspectionNumber="REINSP-003",
            improvementPhotos=["photo1.jpg"],
            effectivenessVerified="Yes",
            drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
        ),
        user_id=1,
        username="tester",
    )
    assert updated.status == "Closed"


def test_ncr_repair_disposition_requires_repair_method_statement(db_session, vendor):
    """Regression test: the backend closure gate used to require
    repairMethodStatement unconditionally (disagreeing with the frontend,
    which only requires it for "Repair") — confirm it's still enforced for
    Repair specifically, now that the unconditional check was removed."""
    ncr_service = NCRService(NCRRepository(db_session))

    ncr = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Weld repaired",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
            productDisposition="Repair",
        )
    )
    db_session.commit()

    with pytest.raises(ValueError, match="repairMethodStatement"):
        ncr_service.update_ncr(
            ncr.id,
            schemas.NCRUpdate(
                status="Closed",
                reInspectionNumber="REINSP-004",
                improvementPhotos=["photo1.jpg"],
                effectivenessVerified="Yes",
                ownerApproval="Approved",
                drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
            ),
            user_id=1,
            username="tester",
        )

    updated = ncr_service.update_ncr(
        ncr.id,
        schemas.NCRUpdate(
            status="Closed",
            repairMethodStatement="Reweld and re-inspect.",
            reInspectionNumber="REINSP-004",
            improvementPhotos=["photo1.jpg"],
            effectivenessVerified="Yes",
            ownerApproval="Approved",
            drawingNo="DWG-1", specNo="SPEC-1", qtyAffected="1", extent="Isolated",
        ),
        user_id=1,
        username="tester",
    )
    assert updated.status == "Closed"


def test_ncr_delete_blocked_by_itr_reference(db_session, vendor):
    ncr_service = NCRService(NCRRepository(db_session))
    itr_service = ITRService(ITRRepository(db_session))

    ncr = ncr_service.create_ncr(
        schemas.NCRCreate(
            description="Parent NCR",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="Open",
        )
    )
    db_session.commit()

    itr = itr_service.create_itr(
        schemas.ITRCreate(
            description="Child ITR",
            vendor="Acme Co",
            rev="0",
            submit="initial",
            status="In Progress",
            ncrNumber=ncr.documentNumber,
        )
    )
    db_session.commit()
    assert itr.ncrNumber == ncr.documentNumber

    # Non-Void NCRs cannot be deleted at all (anti-gaming guard)
    with pytest.raises(ValueError, match="Void the NCR first"):
        ncr_service.delete_ncr(ncr.id, user_id=1, username="tester")

    # Transition to Void so we can test the ITR reference guard
    ncr_service.update_ncr(ncr.id, schemas.NCRUpdate(status="Void"), user_id=1, username="tester")
    db_session.commit()

    with pytest.raises(ValueError, match="referenced by"):
        ncr_service.delete_ncr(ncr.id, user_id=1, username="tester")


def test_contractor_abbreviation_drives_reference_prefix(db_session):
    """Different contractors should get different reference prefixes."""
    db_session.add(models.Contractor(id="v-a", name="Alpha", abbreviation="ALP"))
    db_session.add(models.Contractor(id="v-b", name="Beta", abbreviation="BET"))
    db_session.commit()

    itp_service = ITPService(ITPRepository(db_session))

    alpha = itp_service.create_itp(
        schemas.ITPCreate(description="x", vendor="Alpha", rev="0", status="Draft")
    )
    beta = itp_service.create_itp(
        schemas.ITPCreate(description="y", vendor="Beta", rev="0", status="Draft")
    )
    db_session.commit()

    assert "-ALP-" in alpha.referenceNo
    assert "-BET-" in beta.referenceNo
    # Each vendor has its own sequence, so both should start at 000001.
    assert alpha.referenceNo.endswith("000001")
    assert beta.referenceNo.endswith("000001")


def test_delete_draft_meeting_minutes_reclaims_tail_number(db_session, vendor):
    """A deleted Draft (never published — see BACKLOG discussion
    2026-08-31) gives its number back if it was the most recently issued
    one, so the very next created record reuses it instead of leaving an
    unexplained gap."""
    service = MeetingMinutesService(MeetingMinutesRepository(db_session))

    first = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="mistake")
    )
    db_session.commit()

    service.delete_meeting_minutes(first.id)
    db_session.commit()

    second = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="redo")
    )
    db_session.commit()

    assert second.documentNumber == first.documentNumber


def test_delete_draft_meeting_minutes_does_not_reclaim_non_tail_number(db_session, vendor):
    """If a newer record already exists past the deleted one, the number
    is NOT reclaimed — decrementing the counter would let a future create
    collide with that newer record."""
    service = MeetingMinutesService(MeetingMinutesRepository(db_session))

    first = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="first")
    )
    second = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="second")
    )
    db_session.commit()

    service.delete_meeting_minutes(first.id)  # not the tail (second exists) — not reclaimed
    db_session.commit()

    third = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="third")
    )
    db_session.commit()

    assert third.documentNumber != first.documentNumber
    tail_third = int(third.documentNumber.split("-")[-1])
    tail_second = int(second.documentNumber.split("-")[-1])
    assert tail_third == tail_second + 1


def test_deleting_every_draft_resets_the_sequence_to_zero(db_session, vendor):
    """Regression test for the exact bug reported 2026-08-31: deleting
    every Draft down to an empty table must let the next create start
    fresh at 1, not stay stuck wherever the historical peak was. This is
    what distinguishes the current resync-to-actual-max design from the
    earlier naive "decrement by one" version (which only fixed the
    single-tail-delete case)."""
    service = MeetingMinutesService(MeetingMinutesRepository(db_session))

    created = []
    for i in range(3):
        item = service.create_meeting_minutes(
            schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title=f"item {i}")
        )
        db_session.commit()
        created.append(item)

    # Delete from the tail backwards — the realistic "clean up my test
    # records" order — each delete should resync the counter down by one.
    for item in reversed(created):
        service.delete_meeting_minutes(item.id)
        db_session.commit()

    fresh = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="fresh start")
    )
    db_session.commit()

    assert fresh.documentNumber == created[0].documentNumber
    assert fresh.documentNumber.endswith("000001")


def test_new_occurrence_shares_document_number_across_composite_unique(db_session, vendor):
    """BACKLOG #18, end-to-end against the real schema. `Base.metadata.
    create_all` (this fixture) only creates tables/columns from the model
    definitions, not db_migrations.py's manually-managed indexes — so this
    test recreates the exact composite unique index the migration creates,
    directly on this in-memory DB, to verify against a real constraint
    rather than an accidentally-unconstrained table. Confirms: (a) rows
    sharing one documentNumber genuinely coexist without an
    IntegrityError, and (b) the composite constraint is real — a literal
    duplicate (same documentNumber AND rev) is still rejected."""
    from sqlalchemy import text as sql_text
    db_session.execute(sql_text(
        "CREATE UNIQUE INDEX ix_meeting_minutes_documentNumber_rev_unique "
        "ON meeting_minutes (documentNumber, rev)"
    ))
    db_session.commit()

    service = MeetingMinutesService(MeetingMinutesRepository(db_session))

    first = service.create_meeting_minutes(
        schemas.MeetingMinutesCreate(vendor="Acme Co", status="Draft", title="Weekly Sync")
    )
    db_session.commit()
    assert first.rev == "1.0"

    second = service.create_new_occurrence(first.id, user_id=1, username="tester")
    assert second.documentNumber == first.documentNumber
    assert second.rev == "2.0"
    assert second.status == "Draft"
    assert second.meetingDate is None

    third = service.create_new_occurrence(second.id, user_id=1, username="tester")
    assert third.documentNumber == first.documentNumber
    assert third.rev == "3.0"

    # All three genuinely coexist as separate rows sharing one documentNumber.
    siblings = MeetingMinutesRepository(db_session).get_all_by_document_number(first.documentNumber)
    assert {s.rev for s in siblings} == {"1.0", "2.0", "3.0"}

    # The composite constraint is real: an exact duplicate (same number
    # AND rev) must still be rejected.
    with pytest.raises(Exception):
        db_session.execute(sql_text(
            'INSERT INTO meeting_minutes (id, "documentNumber", rev, status) VALUES (:id, :doc, :rev, :status)'
        ), {"id": "dup-1", "doc": first.documentNumber, "rev": "1.0", "status": "Draft"})
        db_session.commit()
    db_session.rollback()
