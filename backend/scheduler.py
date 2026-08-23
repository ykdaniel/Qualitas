import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import or_

import models
from database import SessionLocal
from mail_service import send_email_notification, send_ncr_owner_approval_pending_reminder

logger = logging.getLogger(__name__)

async def check_and_send_reminders():
    """
    自動提醒邏輯：
    - 即將到期（3 天內）且尚未提醒的案件
    - 已過期但仍未結案的案件
    - 涵蓋 NCR, FollowUp, NOI, ITR, OBS, ITP
    """
    logger.info("[Scheduler] Checking for upcoming & overdue items...")

    db = SessionLocal()
    try:
        today = datetime.now()
        today_str = today.strftime("%Y-%m-%d")
        target_date = today + timedelta(days=3)
        target_date_str = target_date.strftime("%Y-%m-%d")

        logger.info(f"[Scheduler] Today: {today_str}, lookahead: {target_date_str}")

        total_sent = 0

        # ── NCR: upcoming (due within 3 days) OR overdue ──
        ncrs = db.query(models.NCR).filter(
            models.NCR.status.notin_(["Closed", "Void", "結案"]),
            models.NCR.dueDate.isnot(None),
            models.NCR.dueDate <= target_date_str,
        ).all()

        for ncr in ncrs:
            email = _get_vendor_email(ncr)
            overdue = ncr.dueDate < today_str
            label = "OVERDUE NCR" if overdue else "NCR Due Soon"
            await send_email_notification(
                email, f"{label}: {ncr.documentNumber}", "NCR", ncr.dueDate
            )
            total_sent += 1

        # ── FollowUp: upcoming OR overdue ──
        followups = db.query(models.FollowUp).filter(
            models.FollowUp.status.notin_(["Closed", "Void", "結案"]),
            models.FollowUp.dueDate.isnot(None),
            models.FollowUp.dueDate <= target_date_str,
        ).all()

        for f in followups:
            # Prefer the actual assignee's email (assignedToUserId) — many
            # FollowUp rows are purely internal action items with no vendor
            # at all, so falling straight to _get_vendor_email meant the
            # person actually responsible often never got notified.
            email = f.assignee.email if f.assignee and f.assignee.email else _get_vendor_email(f)
            overdue = f.dueDate < today_str
            label = "OVERDUE Follow-up" if overdue else "Follow-up Due Soon"
            await send_email_notification(
                email, f"{label}: {f.issueNo} - {f.title}", "Follow-up Issue", f.dueDate
            )
            total_sent += 1

        # ── NOI: upcoming OR overdue ──
        nois = db.query(models.NOI).filter(
            models.NOI.status.notin_(["Closed", "Void", "Reject", "結案"]),
            models.NOI.dueDate.isnot(None),
            models.NOI.dueDate <= target_date_str,
        ).all()

        for noi in nois:
            email = _get_vendor_email(noi)
            overdue = noi.dueDate is not None and noi.dueDate < today_str
            label = "OVERDUE NOI" if overdue else "NOI Due Soon"
            await send_email_notification(
                email, f"{label}: {noi.referenceNo}", "NOI", noi.dueDate
            )
            total_sent += 1

        # ── ITR: upcoming OR overdue ──
        itrs = db.query(models.ITR).filter(
            models.ITR.status.notin_(["Approved", "Void", "結案"]),
            models.ITR.dueDate.isnot(None),
            models.ITR.dueDate <= target_date_str,
        ).all()

        for itr in itrs:
            email = _get_vendor_email(itr)
            overdue = itr.dueDate is not None and itr.dueDate < today_str
            label = "OVERDUE ITR" if overdue else "ITR Due Soon"
            await send_email_notification(
                email, f"{label}: {itr.documentNumber}", "ITR", itr.dueDate
            )
            total_sent += 1

        # ── OBS: upcoming OR overdue ──
        # Follow Up Issues' aggregated "still open" view already includes
        # OBS alongside NCR/NOI/ITR, but this scheduler previously didn't —
        # an overdue OBS could sit visibly "open" on that dashboard forever
        # without ever triggering a reminder email.
        obss = db.query(models.OBS).filter(
            models.OBS.status.notin_(["Closed", "Void", "結案"]),
            models.OBS.dueDate.isnot(None),
            models.OBS.dueDate <= target_date_str,
        ).all()

        for obs in obss:
            email = _get_vendor_email(obs)
            overdue = obs.dueDate < today_str
            label = "OVERDUE OBS" if overdue else "OBS Due Soon"
            await send_email_notification(
                email, f"{label}: {obs.documentNumber}", "OBS", obs.dueDate
            )
            total_sent += 1

        # ── ITP: upcoming OR overdue ── (same reasoning as OBS above)
        itps = db.query(models.ITP).filter(
            models.ITP.status.notin_(["Approved", "Void", "結案"]),
            models.ITP.dueDate.isnot(None),
            models.ITP.dueDate <= target_date_str,
        ).all()

        for itp in itps:
            email = _get_vendor_email(itp)
            overdue = itp.dueDate < today_str
            label = "OVERDUE ITP" if overdue else "ITP Due Soon"
            await send_email_notification(
                email, f"{label}: {itp.referenceNo}", "ITP", itp.dueDate
            )
            total_sent += 1

        # ── NCR: technical-change disposition (Use As Is / Repair) still
        # waiting on owner/engineering authority approval. No "Owner" contact
        # exists in the data model, so this reaches the internal Assigned To
        # user instead — not date-driven like the reminders above, this fires
        # every day the approval is outstanding regardless of dueDate. ──
        pending_approval_ncrs = db.query(models.NCR).filter(
            models.NCR.status.notin_(["Closed", "Void", "結案"]),
            models.NCR.productDisposition.in_(["Use As Is", "Repair"]),
            or_(
                models.NCR.ownerApproval.is_(None),
                models.NCR.ownerApproval.notin_(["Approved", "Rejected"]),
            ),
            models.NCR.assignedTo.isnot(None),
        ).all()

        assignee_ids = {ncr.assignedTo for ncr in pending_approval_ncrs if ncr.assignedTo}
        assignees_by_id = {
            u.id: u for u in db.query(models.User).filter(models.User.id.in_(assignee_ids)).all()
        } if assignee_ids else {}

        for ncr in pending_approval_ncrs:
            assignee = assignees_by_id.get(ncr.assignedTo)
            if not assignee or not assignee.email:
                continue
            await send_ncr_owner_approval_pending_reminder(
                assignee.email, ncr.documentNumber, ncr.productDisposition
            )
            total_sent += 1

        logger.info(
            f"[Scheduler] Done. Sent {total_sent} reminders "
            f"({len(ncrs)} NCRs, {len(followups)} FollowUps, "
            f"{len(nois)} NOIs, {len(itrs)} ITRs, "
            f"{len(obss)} OBSs, {len(itps)} ITPs, "
            f"{len(pending_approval_ncrs)} NCR owner-approval reminders)."
        )

    except Exception as e:
        logger.error(f"[Scheduler] Error during reminder process: {e}", exc_info=True)
    finally:
        db.close()


def _get_vendor_email(record) -> str:
    """Extract vendor email from a record's vendor_ref, fallback to empty."""
    if hasattr(record, "vendor_ref") and record.vendor_ref and record.vendor_ref.email:
        return record.vendor_ref.email
    return ""

async def scheduler_loop():
    """
    排程任務迴圈：每天早上 08:00 執行
    """
    logger.info("[Scheduler] Starting scheduler loop...")
    while True:
        now = datetime.now()
        # 設定下一個 08:00
        target_time = now.replace(hour=8, minute=0, second=0, microsecond=0)
        if now >= target_time:
            target_time += timedelta(days=1)

        wait_seconds = (target_time - now).total_seconds()
        logger.info(f"[Scheduler] Next run at {target_time} (waiting {wait_seconds:.0f} seconds)")

        await asyncio.sleep(wait_seconds)
        await check_and_send_reminders()

def start_scheduler():
    """啟動排程器（作為背景任務）。

    Called from the FastAPI lifespan handler, which already runs inside
    a running event loop, so ``get_running_loop`` is safe here.
    """
    loop = asyncio.get_running_loop()
    loop.create_task(scheduler_loop())
