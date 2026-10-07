"""Seed + direct-run for the notification/scheduler business review (2026-09-24; isolated stack
only). scheduler.check_and_send_reminders() -> mail_service._send_html_mail() automatically runs
in MOCK MODE (log-only, no real SMTP) whenever SMTP_HOST/PORT/USER/PASSWORD env vars are unset —
true by default for the isolated stack, so this never sends a real email or reads a real key.

Seeds a FollowUp due tomorrow, assigned to an INACTIVE user, to re-verify (on this session's
current code, not cited from memory) whether the scheduler still attempts to notify a deactivated
account — a known, already-logged BACKLOG #21 gap ("scheduler emails them forever with no
escalation"). Also seeds an overdue NCR (vendor-contact path, the other notification recipient
mechanism) for a second, independent trigger check.

Run directly (no Playwright needed — this is backend-only scheduler logic):

    cd backend
    python scripts/verification/isolated_stack.py up --vite-script <...> > stack.json
    python scripts/verification/isolated_stack.py seed --root <root> --script scripts/verification/seed_notification_review.py
    python scripts/verification/isolated_stack.py down --root <root>

The seed script itself calls the scheduler inline and prints what it attempted to send.
"""
import sys, os, json, asyncio
from datetime import datetime, timedelta
BACKEND = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, BACKEND)
import database, models
from core.security import get_password_hash

PW = "Accept-Test-1234"
d = database.SessionLocal()

d.add(models.Contractor(id="NOTIF-V1", name="Notification Review Co", abbreviation="NRC"))
inactive_user = models.User(username="notif_inactive_assignee", email="inactive_assignee@example.com",
                             is_active=False, hashed_password=get_password_hash(PW), full_name="Inactive Assignee")
d.add(inactive_user)
d.commit()
inactive_user_id = inactive_user.id

tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")

d.add(models.FollowUp(
    id="notif-fu-1", issueNo="NOTIF-FU-000001", title="Notification review follow-up",
    description="due tomorrow, assigned to an INACTIVE user", status="Open", priority="Medium",
    assignedTo="Inactive Assignee", assignedToUserId=inactive_user_id, dueDate=tomorrow,
    createdAt=datetime.now().isoformat(), updatedAt=datetime.now().isoformat(), sourceModule="Manual",
))
d.add(models.NCR(
    id="notif-ncr-1", documentNumber="QTS-NRC-NCR-000001",
    vendor_id="NOTIF-V1", description="overdue NCR for notification review", status="Open",
    type="Material", severity="Minor", discipline="Civil", raisedBy="QA", foundBy="QA",
    raiseDate="2025-01-01", dueDate="2025-01-02",  # long overdue
    foundLocation="x", referenceStandards="x", deviation="x",
))
d.commit()
d.close()

# Confirm SMTP env is unset -> mock mode, no real send, no real key read (satisfies the standing
# constraint: mock/local capture only).
from core.config import settings
smtp_configured = bool(settings.SMTP_HOST and settings.SMTP_PORT and settings.SMTP_USER and settings.SMTP_PASSWORD)
print("MOCK_MODE_CONFIRMED " + json.dumps({"smtp_configured": smtp_configured, "mock_mode": not smtp_configured}))

import logging
captured = []
class _Capture(logging.Handler):
    def emit(self, record):
        captured.append(record.getMessage())
logging.getLogger("mail_service").addHandler(_Capture())
logging.getLogger("mail_service").setLevel(logging.INFO)
logging.getLogger("scheduler").addHandler(_Capture())
logging.getLogger("scheduler").setLevel(logging.INFO)

import scheduler
asyncio.run(scheduler.check_and_send_reminders())

relevant = [line for line in captured if "notif" in line.lower() or "Inactive Assignee" in line or "NRC" in line or "inactive_assignee" in line]
print("SEED " + json.dumps({
    "ok": True,
    "captured_log_lines_relevant_to_this_seed": relevant,
    "inactive_user_email": "inactive_assignee@example.com",
}))
