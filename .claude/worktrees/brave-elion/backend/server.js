const express = require('express');
const cors = require('cors');
const http = require('http');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3001;
const PYTHON_API = 'http://localhost:8000';

// Security: Rate Limiting - 防止暴力破解和 DoS
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 10, // 每個 IP 最多 10 次登入嘗試
    message: { detail: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 分鐘
    max: 500, // 每個 IP 每分鐘 500 次請求（放寬限制以適應前端同時載入多個模組）
    message: { detail: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Middleware - CORS 安全設定
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(',');
app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Authorization', 'Content-Type'],
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));

// Apply rate limiting to all API routes
app.use('/api', apiLimiter);

// All authentication is now handled by Python FastAPI backend
// Mock authentication has been removed for security reasons

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Backend server is running' });
});

// Login endpoint - 代理到 Python 後端，帶有 Rate Limiting
app.post('/api/auth/login', authLimiter, async (req, res) => {
    // NOTE: 不記錄密碼等敏感資訊
    console.log('[Backend] Login request received for user:', req.body?.username || 'unknown');

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            detail: 'Username and password are required'
        });
    }

    // 嘗試代理到 Python 後端
    try {
        const axios = require('axios');
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);

        const response = await axios.post(`${PYTHON_API}/api/auth/login`, formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log('[Backend] Login successful via Python backend for:', username);
        return res.json(response.data);
    } catch (pythonError) {
        // SECURITY: No fallback authentication - must use Python backend
        console.error('[Backend] Python backend authentication failed:', pythonError.message);

        // Python 後端回傳的錯誤
        if (pythonError.response) {
            return res.status(pythonError.response.status).json(pythonError.response.data);
        }

        // If Python backend is completely unavailable, return clear error
        return res.status(503).json({
            detail: 'Authentication service unavailable. Please ensure the backend server is running.'
        });
    }
});

// Verify token endpoint - proxy all verification to Python backend
app.get('/api/auth/verify', (req, res) => {
    // SECURITY: All token verification handled by Python backend
    return createCrudProxy('/api/auth')(req, res);
});

// User profile endpoint - proxy to Python backend
app.get('/api/user/profile', (req, res) => {
    // SECURITY: All user profile retrieval handled by Python backend
    return createCrudProxy('/api/user')(req, res);
});

// Proxy CRUD paths to Python FastAPI backend (port 8000)
function createCrudProxy(pathPrefix) {
    return (req, res) => {
        const opts = {
            hostname: '127.0.0.1',
            port: 8000,
            path: pathPrefix + (req.url || ''),
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'Authorization': req.headers['authorization'] || ''
            }
        };
        const body = req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined
            ? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body))
            : null;
        if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
        const proxyReq = http.request(opts, (proxyRes) => {
            res.status(proxyRes.statusCode);
            Object.keys(proxyRes.headers).forEach(k => res.setHeader(k, proxyRes.headers[k]));
            proxyRes.pipe(res);
        });
        proxyReq.on('error', (err) => {
            console.error('[Backend] Proxy error for ' + pathPrefix + ':', err.message);
            res.status(502).json({ detail: 'Service unavailable. Start Python backend: cd backend && python -m uvicorn main:app --reload --port 8000' });
        });
        if (body) proxyReq.write(body);
        proxyReq.end();
    };
}
const cron = require('node-cron');
const axios = require('axios');
const { sendEmailNotification } = require('./mailService');

// ... (other parts of the file)

// Proxy CRUD paths to Python FastAPI backend (port 8000)
// ...

['/itp', '/ncr', '/noi', '/itr', '/pqp', '/obs', '/contractors', '/settings', '/followup', '/users', '/roles', '/permissions', '/checklist', '/audit'].forEach(p => app.use('/api' + p, createCrudProxy('/api' + p)));

/**
 * 自動提醒邏輯：檢查 3 天後到期的案件
 */
async function checkAndSendReminders() {
    console.log('[Cron] Checking for upcoming due dates (3 days ahead)...');
    try {
        // Calculate target date (Today + 3 days)
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + 3);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        console.log(`[Cron] Target date: ${targetDateStr}`);

        // 1. Fetch NCRs
        const ncrsResp = await axios.get(`${PYTHON_API}/api/ncr/`);
        const openNcrs = ncrsResp.data.filter(n =>
            n.status !== 'Closed' && n.status !== '結案' && n.dueDate === targetDateStr
        );

        // 2. Fetch FollowUp Issues
        const followupsResp = await axios.get(`${PYTHON_API}/api/followup/`);
        const openFollowups = followupsResp.data.filter(f =>
            f.status !== 'Closed' && f.status !== '結案' && f.dueDate === targetDateStr
        );

        // 3. Process NCR Reminders
        for (const ncr of openNcrs) {
            // Find contractor email
            const contractorsResp = await axios.get(`${PYTHON_API}/api/contractors/`);
            const contractor = contractorsResp.data.find(c => c.name === ncr.vendor);
            const email = contractor ? contractor.email : 'admin@example.com';

            await sendEmailNotification(email, `NCR: ${ncr.documentNumber}`, 'NCR', ncr.dueDate);
        }

        // 4. Process FollowUp Reminders
        for (const f of openFollowups) {
            // Priority: Check if vendor email exists, otherwise assignedTo or admin
            let email = 'admin@example.com';
            if (f.vendor) {
                const contractorsResp = await axios.get(`${PYTHON_API}/api/contractors/`);
                const contractor = contractorsResp.data.find(c => c.name === f.vendor);
                if (contractor) email = contractor.email;
            }

            await sendEmailNotification(email, `Follow-up Issue: ${f.issueNo} - ${f.title}`, 'Follow-up Issue', f.dueDate);
        }

        console.log(`[Cron] Reminders process finished. Sent ${openNcrs.length + openFollowups.data?.length || 0} notifications.`);
    } catch (error) {
        console.error('[Cron] Error during reminder process:', error.message);
    }
}

// 排程任務：每天早上 08:00 執行
cron.schedule('0 8 * * *', () => {
    checkAndSendReminders();
});

// 手動觸發提醒測試端點
app.post('/api/remind/test', async (req, res) => {
    console.log('[Backend] Manual reminder test triggered');
    await checkAndSendReminders();
    res.json({ message: 'Reminder check triggered. Check server console for logs.' });
});

// Start server
app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Reminder test endpoint: http://localhost:${PORT}/api/remind/test (POST)`);
});
