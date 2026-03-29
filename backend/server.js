const express = require('express');
const cors = require('cors');
const http = require('http');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3002;
const PYTHON_API = 'http://127.0.0.1:8000';

// Security: Rate Limiting - 防止暴力破解和 DoS
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 分鐘
    max: 100, // 放寬限制：每個 IP 最多 100 次登入嘗試
    message: { detail: 'Too many login attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 分鐘
    max: 1000, // 放寬限制：每個 IP 每分鐘 1000 次請求
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

// NOTE: Mock user data 已棄用，改由 Python 後端處理認證
// 保留此處以便開發測試，生產環境應移除
const ENABLE_MOCK_AUTH = process.env.ENABLE_MOCK_AUTH === 'true';

// Token 過期時間（毫秒）
const TOKEN_EXPIRY_MS = 30 * 60 * 1000; // 30 分鐘
const tokenStore = new Map(); // 儲存 token 和過期時間

// Mock Users for development/fallback
const users = [
    { id: '1', name: 'System Administrator', email: 'admin@example.com', role: 'admin' }
];

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
        // Python 後端不可用或登入失敗，回退到 mock auth（僅開發環境）
        if (ENABLE_MOCK_AUTH) {
            console.log('[Backend] Python backend unavailable, using mock auth');
            // Mock 認證邏輯（僅開發用）
            if (username === 'admin@example.com' && password === 'admin') {
                const userId = '1';
                // Generates token format matched by /api/user/profile: mock_access_token_{userId}_{random}
                const tokenId = `mock_access_token_${userId}_${Date.now()}`;
                const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
                tokenStore.set(tokenId, { userId, expiresAt });

                return res.json({
                    access_token: tokenId,
                    refresh_token: `refresh_${tokenId}`,
                    token_type: 'bearer'
                });
            }
        }

        // Python 後端回傳的錯誤
        if (pythonError.response) {
            return res.status(pythonError.response.status).json(pythonError.response.data);
        }

        return res.status(401).json({ detail: 'Authentication service unavailable' });
    }
});

// Verify token endpoint - 帶有過期檢查
app.get('/api/auth/verify', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ detail: 'Not authenticated' });
    }

    const token = authHeader.substring(7);

    // 檢查 token 是否存在且未過期
    const tokenData = tokenStore.get(token);
    if (tokenData) {
        if (Date.now() < tokenData.expiresAt) {
            return res.json({ valid: true });
        } else {
            // Token 已過期，清除
            tokenStore.delete(token);
            return res.status(401).json({ detail: 'Token expired' });
        }
    }

    // 嘗試代理到 Python 後端驗證
    // 注意：app.get 路由中 req.url 是完整路徑，需要直接使用空前綴
    const verifyProxy = createCrudProxy('');
    return verifyProxy(req, res);
});

// User profile endpoint
app.get('/api/user/profile', (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ detail: 'Not authenticated' });
    }

    const token = authHeader.substring(7);
    if (token.startsWith('mock_access_token_')) {
        // Extract user id from token
        const parts = token.split('_');
        const userId = parts[3];
        const user = users.find(u => u.id === userId);

        if (user) {
            return res.json({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            });
        }
    }

    // 真實 JWT token → 轉發到 Python 後端
    const profileProxy = createCrudProxy('');
    return profileProxy(req, res);
});

// Proxy CRUD paths to Python FastAPI backend (port 8000)
function createCrudProxy(pathPrefix) {
    return (req, res) => {
        const targetPath = pathPrefix + (req.url || '');
        _proxyRequest(req, res, targetPath, req.method, req.headers, req.body, pathPrefix);
    };
}

function _proxyRequest(originalReq, res, path, method, headers, body, pathPrefix, redirectCount) {
    redirectCount = redirectCount || 0;
    if (redirectCount > 3) {
        return res.status(502).json({ detail: 'Too many redirects from backend' });
    }
    const opts = {
        hostname: '127.0.0.1',
        port: 8000,
        path: path,
        method: method,
        headers: {
            'Content-Type': headers['content-type'] || 'application/json',
            'Authorization': headers['authorization'] || ''
        }
    };
    const bodyData = (method !== 'GET' && method !== 'HEAD' && body !== undefined)
        ? (typeof body === 'string' ? body : JSON.stringify(body))
        : null;
    if (bodyData) opts.headers['Content-Length'] = Buffer.byteLength(bodyData);
    const proxyReq = http.request(opts, (proxyRes) => {
        // Follow 307/308 redirects internally instead of passing to browser
        if ((proxyRes.statusCode === 307 || proxyRes.statusCode === 308) && proxyRes.headers.location) {
            try {
                const redirectUrl = new URL(proxyRes.headers.location);
                const newPath = redirectUrl.pathname + (redirectUrl.search || '');
                return _proxyRequest(originalReq, res, newPath, method, headers, body, pathPrefix, redirectCount + 1);
            } catch (e) {
                // If Location is a relative path
                return _proxyRequest(originalReq, res, proxyRes.headers.location, method, headers, body, pathPrefix, redirectCount + 1);
            }
        }
        res.status(proxyRes.statusCode);
        // Forward headers but remove location pointing to internal URLs
        Object.keys(proxyRes.headers).forEach(k => {
            if (k.toLowerCase() !== 'location') {
                res.setHeader(k, proxyRes.headers[k]);
            }
        });
        proxyRes.pipe(res);
    });
    proxyReq.on('error', (err) => {
        console.error('[Backend] Proxy error for ' + (pathPrefix || path) + ':', err.message);
        res.status(502).json({ detail: 'Service unavailable. Start Python backend: cd backend && python -m uvicorn main:app --reload --port 8000' });
    });
    if (bodyData) proxyReq.write(bodyData);
    proxyReq.end();
}
const cron = require('node-cron');
const axios = require('axios');
const { sendEmailNotification } = require('./mailService');

// ... (other parts of the file)

// Proxy CRUD paths to Python FastAPI backend (port 8000)
// ...

['/itp', '/ncr', '/noi', '/itr', '/pqp', '/obs', '/contractors', '/settings', '/followup', '/users', '/roles', '/permissions', '/checklist', '/audit', '/fat', '/kpi', '/files'].forEach(p => app.use('/api' + p, createCrudProxy('/api' + p)));

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
        const openNcrs = Array.isArray(ncrsResp.data) ? ncrsResp.data.filter(n =>
            n.status !== 'Closed' && n.status !== '結案' && n.dueDate === targetDateStr
        ) : [];

        // 2. Fetch FollowUp Issues
        const followupsResp = await axios.get(`${PYTHON_API}/api/followup/`);
        const openFollowups = Array.isArray(followupsResp.data) ? followupsResp.data.filter(f =>
            f.status !== 'Closed' && f.status !== '結案' && f.dueDate === targetDateStr
        ) : [];

        // 3. Fetch Contractors (Optimized: Fetch once)
        const contractorsResp = await axios.get(`${PYTHON_API}/api/contractors/`);
        const contractors = Array.isArray(contractorsResp.data) ? contractorsResp.data : [];

        // 4. Process NCR Reminders
        for (const ncr of openNcrs) {
            // Find contractor email
            const contractor = contractors.find(c => c.name === ncr.vendor);
            const email = contractor ? contractor.email : 'admin@example.com';

            await sendEmailNotification(email, `NCR: ${ncr.documentNumber}`, 'NCR', ncr.dueDate);
        }

        // 5. Process FollowUp Reminders
        for (const f of openFollowups) {
            // Priority: Check if vendor email exists, otherwise assignedTo or admin
            let email = 'admin@example.com';
            if (f.vendor) {
                const contractor = contractors.find(c => c.name === f.vendor);
                if (contractor) email = contractor.email;
            }

            await sendEmailNotification(email, `Follow-up Issue: ${f.issueNo} - ${f.title}`, 'Follow-up Issue', f.dueDate);
        }

        console.log(`[Cron] Reminders process finished. Sent ${(openNcrs.length + openFollowups.length) || 0} notifications.`);
    } catch (error) {
        console.error('[Cron] Error during reminder process:', error.message);
    }
}

// 排程任務：每天早上 08:00 執行 (已由 Python Backend 取代，故停用)
// cron.schedule('0 8 * * *', () => {
//     checkAndSendReminders();
// });

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
