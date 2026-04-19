import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

async def send_email_notification(to: str, title: str, doc_type: str, due_date: str) -> bool:
    """
    發送郵件通知
    - 若設定了 SMTP 相關環境變數，則嘗試發送真實郵件
    - 否則僅記錄日誌 (Mock 模式)
    """
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", "noreply@qualitas-erp.com")

    subject = f"【提醒】案件即將到期：{title}"

    # 郵件內容 (HTML)
    html_body = f"""
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #f59e0b;">⚠️ 案件到期提醒</h2>
        <p>您好，</p>
        <p>系統提醒您，以下案件預計將在 <strong>3 天後 ({due_date})</strong> 到期，請盡快處理：</p>
        <table style="border-collapse: collapse; margin: 20px 0;">
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9; width: 120px;"><strong>案件類型</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">{doc_type}</td>
            </tr>
            <tr>
                <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9;"><strong>案件標題/編號</strong></td>
                <td style="padding: 10px; border: 1px solid #ddd;">{title}</td>
            </tr>
        </table>
        <p style="color: #666; font-size: 14px;">此為系統自動發送，請勿直接回覆。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-weight: bold; color: #2563eb;">Qualitas 工程管理系統</p>
      </body>
    </html>
    """

    # Mock Mode
    if not smtp_host or not smtp_port or not smtp_user or not smtp_pass:
        logger.info(f"[MailService] Mock Mode: Would send email to {to} for {doc_type}: {title}")
        return True

    # Real Send Mode
    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_from
        msg['To'] = to
        msg['Subject'] = subject
        msg.attach(MIMEText(html_body, 'html'))

        server = smtplib.SMTP(smtp_host, int(smtp_port))
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()

        logger.info(f"[MailService] SUCCESS: Email sent to {to}")
        return True
    except Exception as e:
        logger.error(f"[MailService] Failed to send email to {to}: {e}")
        return False
