"""Tests for scheduler.py's daily reminder pass — specifically the
owner/engineering-approval-pending check added alongside NCR owner approval.

check_and_send_reminders() is `async def` but does no real async I/O (the
mail helpers are blocking SMTP calls wrapped in `async def` for call-site
consistency), so a plain sync test can drive it with asyncio.run() — no
pytest-asyncio dependency needed.
"""
import asyncio
from unittest.mock import AsyncMock, patch

import models
from scheduler import check_and_send_reminders


def _run(coro):
    return asyncio.run(coro)


def test_scheduler_reminds_assignee_of_pending_owner_approval(db_session):
    user = models.User(
        username="assignee", email="assignee@example.com",
        hashed_password="x", role_id=None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    ncr = models.NCR(
        id="ncr-1", documentNumber="NCR-1", status="Open",
        productDisposition="Use As Is", ownerApproval=None, assignedTo=user.id,
    )
    db_session.add(ncr)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock) as mock_reminder, \
         patch("scheduler.send_email_notification", new_callable=AsyncMock):
        _run(check_and_send_reminders())

    mock_reminder.assert_called_once_with("assignee@example.com", "NCR-1", "Use As Is")


def test_scheduler_skips_ncr_once_owner_approval_is_decided(db_session):
    user = models.User(
        username="assignee2", email="assignee2@example.com",
        hashed_password="x", role_id=None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    ncr = models.NCR(
        id="ncr-2", documentNumber="NCR-2", status="Open",
        productDisposition="Use As Is", ownerApproval="Approved", assignedTo=user.id,
    )
    db_session.add(ncr)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock) as mock_reminder, \
         patch("scheduler.send_email_notification", new_callable=AsyncMock):
        _run(check_and_send_reminders())

    mock_reminder.assert_not_called()


def test_scheduler_reminds_followup_assignee_directly(db_session):
    # A purely internal FollowUp with no vendor at all — before
    # assignedToUserId existed, this would resolve to an empty email via
    # _get_vendor_email and the reminder would silently go nowhere.
    assignee = models.User(
        username="responsible_person", email="responsible@example.com",
        hashed_password="x", role_id=None,
    )
    db_session.add(assignee)
    db_session.commit()
    db_session.refresh(assignee)

    f = models.FollowUp(
        id="fu-1", issueNo="FU-1", title="Call the supplier", description="",
        status="Open", dueDate="2020-01-01",
        assignedTo="Responsible Person", assignedToUserId=assignee.id,
        vendor_id=None,
    )
    db_session.add(f)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mock_email:
        _run(check_and_send_reminders())

    mock_email.assert_any_call(
        "responsible@example.com", "OVERDUE Follow-up: FU-1 - Call the supplier",
        "Follow-up Issue", "2020-01-01",
    )


def test_scheduler_followup_falls_back_to_vendor_when_unassigned(db_session):
    vendor = models.Contractor(id="v-fu", name="FU Vendor", email="fu-vendor@example.com")
    db_session.add(vendor)
    db_session.commit()

    f = models.FollowUp(
        id="fu-2", issueNo="FU-2", title="Vendor task", description="",
        status="Open", dueDate="2020-01-01",
        assignedTo=None, assignedToUserId=None, vendor_id="v-fu",
    )
    db_session.add(f)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mock_email:
        _run(check_and_send_reminders())

    mock_email.assert_any_call(
        "fu-vendor@example.com", "OVERDUE Follow-up: FU-2 - Vendor task",
        "Follow-up Issue", "2020-01-01",
    )


def test_scheduler_reminds_overdue_obs(db_session):
    # OBS/ITP were previously missing from the scheduler entirely even
    # though Follow Up Issues' aggregated view already shows them as
    # "open" — an overdue OBS never got a reminder email.
    vendor = models.Contractor(id="v-1", name="Vendor 1", email="vendor@example.com")
    db_session.add(vendor)
    db_session.commit()

    obs = models.OBS(
        id="obs-1", documentNumber="OBS-1", status="Open",
        vendor_id="v-1", dueDate="2020-01-01",
    )
    db_session.add(obs)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mock_email:
        _run(check_and_send_reminders())

    mock_email.assert_any_call(
        "vendor@example.com", "OVERDUE OBS: OBS-1", "OBS", "2020-01-01"
    )


def test_scheduler_skips_closed_obs(db_session):
    vendor = models.Contractor(id="v-2", name="Vendor 2", email="vendor2@example.com")
    db_session.add(vendor)
    db_session.commit()

    obs = models.OBS(
        id="obs-2", documentNumber="OBS-2", status="Closed",
        vendor_id="v-2", dueDate="2020-01-01",
    )
    db_session.add(obs)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mock_email:
        _run(check_and_send_reminders())

    for call in mock_email.call_args_list:
        assert "OBS-2" not in call.args[1]


def test_scheduler_reminds_overdue_itp(db_session):
    vendor = models.Contractor(id="v-3", name="Vendor 3", email="itp-vendor@example.com")
    db_session.add(vendor)
    db_session.commit()

    itp = models.ITP(
        id="itp-1", referenceNo="ITP-1", status="Pending",
        vendor_id="v-3", dueDate="2020-01-01",
    )
    db_session.add(itp)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mock_email:
        _run(check_and_send_reminders())

    mock_email.assert_any_call(
        "itp-vendor@example.com", "OVERDUE ITP: ITP-1", "ITP", "2020-01-01"
    )


def test_scheduler_skips_approved_itp(db_session):
    vendor = models.Contractor(id="v-4", name="Vendor 4", email="itp-vendor2@example.com")
    db_session.add(vendor)
    db_session.commit()

    itp = models.ITP(
        id="itp-2", referenceNo="ITP-2", status="Approved",
        vendor_id="v-4", dueDate="2020-01-01",
    )
    db_session.add(itp)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock), \
         patch("scheduler.send_email_notification", new_callable=AsyncMock) as mock_email:
        _run(check_and_send_reminders())

    for call in mock_email.call_args_list:
        assert "ITP-2" not in call.args[1]


def test_scheduler_skips_rework_disposition(db_session):
    # Rework/Reject aren't technical changes — no owner approval concept, so
    # they should never trigger this reminder even if ownerApproval is unset.
    user = models.User(
        username="assignee3", email="assignee3@example.com",
        hashed_password="x", role_id=None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    ncr = models.NCR(
        id="ncr-3", documentNumber="NCR-3", status="Open",
        productDisposition="Rework", ownerApproval=None, assignedTo=user.id,
    )
    db_session.add(ncr)
    db_session.commit()

    with patch("scheduler.SessionLocal", return_value=db_session), \
         patch("scheduler.send_ncr_owner_approval_pending_reminder", new_callable=AsyncMock) as mock_reminder, \
         patch("scheduler.send_email_notification", new_callable=AsyncMock):
        _run(check_and_send_reminders())

    mock_reminder.assert_not_called()
