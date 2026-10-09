"""
Test Configuration and Fixtures

Provides database setup and common fixtures for testing
"""

import hashlib
import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
import models


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
