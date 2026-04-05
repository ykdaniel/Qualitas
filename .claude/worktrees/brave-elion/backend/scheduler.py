import asyncio
import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from mail_service import send_email_notification

logger = logging.getLogger(__name__)

async def check_and_send_reminders():
    """
    自動提醒邏輯：檢查 3 天後到期的案件
    """
    logger.info("[Scheduler] Checking for upcoming due dates (3 days ahead)...")
    
    db = SessionLocal()
    try:
        # 計算目標日期 (今天 + 3 天)
        target_date = datetime.now() + timedelta(days=3)
        target_date_str = target_date.strftime("%Y-%m-%d")
        
        logger.info(f"[Scheduler] Target date: {target_date_str}")
        
        # 1. 查詢 NCR
        ncrs = db.query(models.NCR).filter(
            models.NCR.status.notin_(["Closed", "結案"]),
            models.NCR.dueDate == target_date_str
        ).all()
        
        # 2. 查詢 FollowUp Issues
        followups = db.query(models.FollowUp).filter(
            models.FollowUp.status.notin_(["Closed", "結案"]),
            models.FollowUp.dueDate == target_date_str
        ).all()

        # PERFORMANCE: Pre-load all contractors once to avoid N+1 queries
        # This reduces 100+ queries to just 3 queries total
        contractors_map = {
            contractor.name: contractor
            for contractor in db.query(models.Contractor).all()
        }
        logger.info(f"[Scheduler] Loaded {len(contractors_map)} contractors for email lookup")

        # 3. 處理 NCR 提醒
        for ncr in ncrs:
            # 查找廠商郵件 (using pre-loaded map - no additional query)
            vendor = contractors_map.get(ncr.vendor)
            email = vendor.email if vendor and vendor.email else "admin@example.com"

            await send_email_notification(email, f"NCR: {ncr.documentNumber}", "NCR", ncr.dueDate)

        # 4. 處理 FollowUp 提醒
        for f in followups:
            # 優先檢查廠商郵件，否則發給管理員 (using pre-loaded map - no additional query)
            email = "admin@example.com"
            if f.vendor:
                vendor = contractors_map.get(f.vendor)
                if vendor and vendor.email:
                    email = vendor.email

            await send_email_notification(email, f"Follow-up Issue: {f.issueNo} - {f.title}", "Follow-up Issue", f.dueDate)
            
        logger.info(f"[Scheduler] Reminders process finished. Found {len(ncrs)} NCRs and {len(followups)} FollowUps.")
        
    except Exception as e:
        logger.error(f"[Scheduler] Error during reminder process: {e}")
    finally:
        db.close()

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
    """啟動排程器（作為背景任務）"""
    loop = asyncio.get_event_loop()
    loop.create_task(scheduler_loop())
