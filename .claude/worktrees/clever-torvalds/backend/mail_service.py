import os
import logging
from datetime import datetime

# NOTE: 生產環境建議使用真正的 SMTP 伺服器，例如 Gmail 或 SendGrid
# 此處實作與 Node.js 版對應的 Mock 邏輯

logger = logging.getLogger(__name__)

async def send_email_notification(to: str, title: str, doc_type: str, due_date: str):
    """
    發送郵件通知
    NOTE: 目前為 Mock 實作，僅記錄日誌。
    """
    logger.info(f"[MailService] Sending notification to {to} for {doc_type}: {title}")
    
    # 建構郵件內容 (與 Node.js 版本的模板一致)
    subject = f"【提醒】案件即將到期：{title}"
    body = f"""
您好，

系統提醒您，以下案件預計將在 3 天後 ({due_date}) 到期，請盡快處理：

案件類型：{doc_type}
案件標題/編號：{title}

祝 工作順利
Qualitas 工程管理系統
"""
    
    # 在此處可以加入 smtplib 的實作
    # try:
    #     import smtplib
    #     from email.mime.text import MIMEText
    #     msg = MIMEText(body)
    #     msg['Subject'] = subject
    #     msg['From'] = "noreply@qualitas-erp.com"
    #     msg['To'] = to
    #     # with smtplib.SMTP(host, port) as server:
    #     #     server.login(user, password)
    #     #     server.send_message(msg)
    # except Exception as e:
    #     logger.error(f"[MailService] Failed to send email: {e}")
    #     return False

    logger.info(f"[MailService] SUCCESS: Mock email sent to {to}")
    return True
