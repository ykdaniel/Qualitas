"""Real in-memory ORM queries; mail entry points are mocked (no SMTP)."""
import asyncio
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

import models
from database import Base
from scheduler import check_and_send_reminders


def _snapshot(engine):
    with engine.connect() as connection:
        return {
            table.name: connection.execute(select(table).order_by(*table.primary_key.columns)).fetchall()
            for table in Base.metadata.sorted_tables
        }


def _run_and_check_unchanged(db_session):
    engine = db_session.get_bind()
    before = _snapshot(engine)
    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as email, \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock) as approval:
        asyncio.run(check_and_send_reminders())
    assert _snapshot(engine) == before
    return email, approval


@pytest.mark.parametrize("active", [True, False])
@pytest.mark.parametrize("status,offset", [("Open", -1), ("Open", 3), ("Open", 4), ("Closed", -1), ("Void", -1)])
def test_followup_recipient_activity_and_existing_filters(db_session, active, status, offset):
    user = models.User(username="responsible", email="person@example.test", is_active=active)
    vendor = models.Contractor(id="vendor", name="Vendor", email="vendor@example.test")
    db_session.add_all([user, vendor])
    db_session.flush()
    due = (datetime.now() + timedelta(days=offset)).strftime("%Y-%m-%d")
    db_session.add(models.FollowUp(
        id="followup", issueNo="FU-1", title="Task", status=status, dueDate=due,
        assignedToUserId=user.id, vendor_id=vendor.id,
    ))
    db_session.commit()
    email, approval = _run_and_check_unchanged(db_session)
    if active and status == "Open" and offset <= 3:
        label = "OVERDUE Follow-up" if offset < 0 else "Follow-up Due Soon"
        email.assert_awaited_once_with("person@example.test", f"{label}: FU-1 - Task", "Follow-up Issue", due)
    else:
        # Inactive assignees must not cause a fallback email to the vendor.
        email.assert_not_awaited()
    approval.assert_not_awaited()


@pytest.mark.parametrize("active", [True, False])
@pytest.mark.parametrize("disposition,decision,status", [
    ("Use As Is", None, "Open"), ("Repair", "Pending", "Open"),
    ("Repair", "Approved", "Open"), ("Repair", "Rejected", "Open"),
    ("Rework", None, "Open"), ("Repair", None, "Closed"), ("Repair", None, "Void"),
])
def test_ncr_approval_recipient_activity_and_existing_filters(db_session, active, disposition, decision, status):
    user = models.User(username="responsible", email="person@example.test", is_active=active)
    db_session.add(user)
    db_session.flush()
    db_session.add(models.NCR(
        id="ncr", documentNumber="NCR-1", status=status, assignedTo=user.id,
        productDisposition=disposition, ownerApproval=decision,
    ))
    db_session.commit()
    email, approval = _run_and_check_unchanged(db_session)
    if active and status == "Open" and disposition in ("Use As Is", "Repair") and decision not in ("Approved", "Rejected"):
        approval.assert_awaited_once_with("person@example.test", "NCR-1", disposition)
    else:
        approval.assert_not_awaited()
    email.assert_not_awaited()
