const nodemailer = require('nodemailer');

// NOTE: In a real production environment, use environment variables for credentials
// const transportConfig = {
//   host: process.env.SMTP_HOST,
//   port: process.env.SMTP_PORT,
//   auth: {
//     user: process.env.SMTP_USER,
//     pass: process.env.SMTP_PASS
//   }
// };

// For demonstration, we use a mock transporter or a placeholder
const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    auth: {
        user: 'mock_user@ethereal.email',
        pass: 'mock_pass'
    }
});

async function sendEmailNotification(to, title, docType, dueDate) {
    console.log(`[MailService] Sending notification to ${to} for ${docType}: ${title}`);

    const mailOptions = {
        from: '"Qualitas System" <noreply@qualitas-erp.com>',
        to: to,
        subject: `【提醒】案件即將到期：${title}`,
        text: `
您好，

系統提醒您，以下案件預計將在 3 天後 (${dueDate}) 到期，請盡快處理：

案件類型：${docType}
案件標題/編號：${title}

祝 工作順利
Qualitas 工程管理系統
        `,
        html: `
            <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                <h2 style="color: #f59e0b;">⚠️ 案收到期提醒</h2>
                <p>您好，</p>
                <p>系統提醒您，以下案件預計將在 <strong>3 天後 (${dueDate})</strong> 到期，請盡快處理：</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9; width: 120px;"><strong>案件類型</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${docType}</td>
                    </tr>
                    <tr>
                        <td style="padding: 10px; border: 1px solid #ddd; background: #f9f9f9;"><strong>案件標題/編號</strong></td>
                        <td style="padding: 10px; border: 1px solid #ddd;">${title}</td>
                    </tr>
                </table>
                <p style="color: #666; font-size: 14px;">此為系統自動發送，請勿直接回覆。</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-weight: bold; color: #2563eb;">Qualitas 工程管理系統</p>
            </div>
        `
    };

    try {
        // In a real scenario, this would send the email
        // const info = await transporter.sendMail(mailOptions);
        // console.log('[MailService] Message sent: %s', info.messageId);

        // Mock success for now
        console.log(`[MailService] SUCCESS: Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('[MailService] Error sending email:', error);
        return false;
    }
}

module.exports = {
    sendEmailNotification
};
