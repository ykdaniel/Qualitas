"""
Test Configuration and Fixtures

Provides database setup and common fixtures for testing
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from database import Base
import models


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
