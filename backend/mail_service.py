import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from core.config import settings

logger = logging.getLogger(__name__)


def _send_html_mail(to: str, subject: str, html_body: str, log_label: str) -> bool:
    """Shared SMTP send used by every notification helper below — real send
    if SMTP env vars are configured, otherwise just logs (mock mode)."""
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT
    smtp_user = settings.SMTP_USER
    smtp_pass = settings.SMTP_PASSWORD
    smtp_from = settings.SMTP_FROM

    if not smtp_host or not smtp_port or not smtp_user or not smtp_pass:
        logger.info(f"[MailService] Mock Mode: Would send {log_label} to {to}: {subject}")
        return True

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

        logger.info(f"[MailService] SUCCESS: {log_label} sent to {to}")
        return True
    except Exception as e:
        logger.error(f"[MailService] Failed to send {log_label} to {to}: {e}")
        return False


async def send_ncr_owner_approval_pending_reminder(to: str, ncr_number: str, disposition: str) -> bool:
    """Daily reminder (scheduler.py, 08:00 batch) that an NCR's technical-
    change disposition (Use As Is / Repair) is still waiting on owner/
    engineering authority approval. There's no "Owner" contact record in the
    data model (NCR only links to the Contractor), so this can't reach the
    owner directly — it goes to the internal Assigned To user, whose job is
    to chase the approval down.
    """
    if not to:
        return False
    subject = f"【提醒】NCR 待業主／工程權責核准：{ncr_number}"
    html_body = f"""
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #f59e0b;">NCR 待業主／工程權責核准</h2>
        <p>您好，</p>
        <p>NCR <strong>{ncr_number}</strong>（處置方案：{disposition}）目前尚未取得業主／工程權責核准，請協助跟進。</p>
        <p style="color: #666; font-size: 14px;">此為系統自動發送，請勿直接回覆。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-weight: bold; color: #2563eb;">Qualitas 工程管理系統</p>
      </body>
    </html>
    """
    return _send_html_mail(to, subject, html_body, f"NCR owner-approval pending reminder ({ncr_number})")


def send_ncr_rejection_notification(to: str, ncr_number: str, notes: str = "") -> bool:
    """Notify the contractor that the owner/engineering authority rejected
    their proposed disposition on this NCR — sent synchronously at the point
    of the rejecting save (not the daily due-date batch), since this needs to
    reach the contractor right away, not the next scheduled run.
    """
    if not to:
        logger.info(f"[MailService] Skipped NCR rejection notice for {ncr_number}: no contractor email on file")
        return False

    subject = f"【NCR 退回通知】{ncr_number} 處置方案未獲核准"
    notes_html = f"<p><strong>業主意見：</strong>{notes}</p>" if notes else ""
    html_body = f"""
    <html>
      <body style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #b03a2e;">NCR 處置方案遭退回</h2>
        <p>您好，</p>
        <p>NCR <strong>{ncr_number}</strong> 所提出的處置方案（Use As Is / Repair）未獲業主／工程權責核准，請重新處置。</p>
        {notes_html}
        <p style="color: #666; font-size: 14px;">此為系統自動發送，請勿直接回覆。</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-weight: bold; color: #2563eb;">Qualitas 工程管理系統</p>
      </body>
    </html>
    """
    return _send_html_mail(to, subject, html_body, f"NCR rejection notice ({ncr_number})")

async def send_email_notification(to: str, title: str, doc_type: str, due_date: str) -> bool:
    """
    發送郵件通知
    - 若設定了 SMTP 相關環境變數，則嘗試發送真實郵件
    - 否則僅記錄日誌 (Mock 模式)
    """
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT
    smtp_user = settings.SMTP_USER
    smtp_pass = settings.SMTP_PASSWORD
    smtp_from = settings.SMTP_FROM

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
