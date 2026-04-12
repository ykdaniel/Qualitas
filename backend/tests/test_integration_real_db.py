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
from services.itp_service import ITPService
from services.noi_service import NOIService
from services.ncr_service import NCRService
from services.itr_service import ITRService


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


def test_failed_ncr_create_does_not_burn_sequence_number(db_session, vendor):
    """Regression test for the FK-validation-order bug.

    Before the fix, a failed create (invalid noiNumber) would still allocate
    a reference number, leaving gaps in the NCR sequence.
    """
    ncr_service = NCRService(NCRRepository(db_session))

    # Attempt 1: deliberately broken noiNumber → should raise, no sequence burned.
    with pytest.raises(ValueError, match="not found"):
        ncr_service.create_ncr(
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
    db_session.rollback()

    # Attempt 2: valid create should still get the first NCR number, not the second.
    ok = ncr_service.create_ncr(
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

    tail = int(ok.documentNumber.split("-")[-1])
    assert tail == 1, f"Expected sequence 000001 but got {ok.documentNumber}"


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


def test_ncr_status_transition_rejects_invalid_jump(db_session, vendor):
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

    # Open → Closed is NOT a direct allowed transition (must go through In Progress, Resolved).
    with pytest.raises(ValueError, match="Invalid status transition"):
        ncr_service.update_ncr(
            ncr.id,
            schemas.NCRUpdate(status="Closed"),
            user_id=1,
            username="tester",
        )


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
