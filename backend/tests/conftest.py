"""
Test Configuration and Fixtures

Provides database setup and common fixtures for testing
"""

import hashlib
import os
from pathlib import Path

# OPTIMISTIC-LOCK-2026-001 B5 (DECISIONS 存檔的樂觀鎖 #6): the suites run with the record version optional, as production
# does until the flag is switched on; the dedicated tests in test_optimistic_lock_http.py turn ROW_VERSION_REQUIRED on
# themselves. Set before anything imports core.config, so a developer's backend/.env cannot flip the whole suite.
os.environ["ROW_VERSION_REQUIRED"] = "false"

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from database import Base
import models


def _project_code_from_id(project_id) -> str:
    """A test project's default code: its id's letters and digits, upper case, at most 8 (PA, P1, PROJX...)."""
    code = "".join(ch for ch in str(project_id or "") if ch.isalnum()).upper()[:8]
    return code if len(code) >= 2 else f"T{code or 'P'}"


@event.listens_for(models.Project, "before_insert")
def _test_projects_have_a_code(mapper, connection, target):
    """Every real project has a code (REF-PROJECT-SEQ-2026-001 B3, D14): every document number carries it, and a project
    without one numbers nothing (PROJECT_CODE_MISSING). Test fixtures that build a Project with no code (None) get one
    from its id, as an administrator would have set; a test about a project WITHOUT a code says so with code="".
    Projects created through the API are not touched (the API itself requires the code)."""
    if target.code is None:
        target.code = _project_code_from_id(target.id)


def _uploads_manifest(root: Path) -> dict:
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(root.rglob("*")) if p.is_file()} if root.is_dir() else {}


@pytest.fixture(scope="session", autouse=True)
def _tests_never_write_to_the_projects_uploads(tmp_path_factory):
    """Attachments land in a throw-away directory for the WHOLE suite (QUALITAS_UPLOAD_ROOT), and at the end the developer's own
    backend/uploads must be byte-for-byte what it was at the start — a test that writes there again fails the run instead of
    silently adding files (test_km_upload_security used to). A test that needs its own root can monkeypatch the variable."""
    from core.startup_guard import BACKEND_DIR, ENV_UPLOAD_ROOT
    real = BACKEND_DIR / "uploads"
    before = _uploads_manifest(real)
    previous = os.environ.get(ENV_UPLOAD_ROOT)
    os.environ[ENV_UPLOAD_ROOT] = str(tmp_path_factory.mktemp("uploads"))
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop(ENV_UPLOAD_ROOT, None)
        else:
            os.environ[ENV_UPLOAD_ROOT] = previous
    assert _uploads_manifest(real) == before, "a test wrote to (or removed from) the project's backend/uploads directory"


@pytest.fixture(scope="function")
def db_session():
    """
    Create a test database session

    Creates an in-memory SQLite database for each test function.
    Automatically rolls back transactions after each test.
    """
    # Create in-memory SQLite database
    engine = create_engine("sqlite:///:memory:", echo=False)

    # Create all tables
    Base.metadata.create_all(bind=engine)

    # Create session
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def sample_contractor(db_session):
    """Create a sample contractor for testing"""
    contractor = models.Contractor(
        id="test-contractor-1",
        name="Test Contractor",
        abbreviation="TC"
    )
    db_session.add(contractor)
    db_session.commit()
    db_session.refresh(contractor)
    return contractor
