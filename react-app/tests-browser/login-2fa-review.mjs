// Login / Logout / Session-renewal / 2FA business review — real browser, isolated stack
// (2026-09-24). ISOLATED TEST ACCOUNT ONLY (login_2fa_reviewer) — never touches any real
// account's security settings. OTP codes are computed locally via pyotp from the secret the
// server itself issued during /setup — no external authenticator app needed for the test.
// Each numbered section uses its OWN fresh browser context so a failure in one (e.g. logout
// invalidating cookies) can't cascade into false failures in the next.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);
const totpNow = secret => execFileSync('/opt/homebrew/bin/python3', ['-c', `import pyotp,sys; print(pyotp.TOTP(sys.argv[1]).now())`, secret], { cwd: '/Users/nook/Documents/Qualitas/backend' }).toString().trim();

const browser = await chromium.launch({ headless: true });
async function newPage() {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    return { ctx, page: p };
}
async function doLogin(page, otp) {
    // The #otp field only renders AFTER a first password-only submit is rejected with
    // "2FA code required" (Login.tsx's otpRequired state) — it doesn't exist up front.
    await page.goto(UI + '/login');
    await page.fill('#email', 'login_2fa_reviewer'); await page.fill('#password', PW);
    await page.click('button[type=submit]');
    if (otp) {
        await page.locator('#otp').waitFor({ timeout: 10000 });
        await page.fill('#otp', otp);
        await page.click('button[type=submit]');
    }
}

// ══ 1. Normal login (real screen) + session verify ═══════════════════════════════════════════════
try {
    const { page } = await newPage();
    await doLogin(page);
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    note('1. logged in, landed on', new URL(page.url()).pathname);
    const verify = await page.evaluate(async () => (await fetch('/api/auth/verify', { credentials: 'include' })).status);
    note('1. GET /api/auth/verify after login', verify);
} catch (e) { fail('1. Normal login', e); }

// ══ 2. Logout: session invalidated, subsequent authenticated call fails ═════════════════════════════
try {
    const { page } = await newPage();
    await doLogin(page);
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    const csrf = await page.evaluate(() => document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '');
    const logoutStatus = await page.evaluate(async (csrf) => (await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } })).status, csrf);
    note('2a. POST /api/auth/logout', logoutStatus);
    const verifyAfter = await page.evaluate(async () => (await fetch('/api/auth/verify', { credentials: 'include' })).status);
    note('2b. GET /api/auth/verify after logout (expect 401)', verifyAfter);
} catch (e) { fail('2. Logout', e); }

// ══ 3. Session refresh (fresh login, immediately refresh) ════════════════════════════════════════
try {
    const { ctx, page } = await newPage();
    await doLogin(page);
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    const cookiesBefore = await ctx.cookies();
    const accessBefore = cookiesBefore.find(c => c.name === 'access_token')?.value;
    const csrf = await page.evaluate(() => document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '');
    const refreshStatus = await page.evaluate(async (csrf) => (await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': csrf } })).status, csrf);
    note('3a. POST /api/auth/refresh (fresh session)', refreshStatus);
    const cookiesAfter = await ctx.cookies();
    const accessAfter = cookiesAfter.find(c => c.name === 'access_token')?.value;
    note('3b. access_token cookie actually rotated (different value)', accessBefore !== accessAfter && !!accessAfter);
    const verifyAfterRefresh = await page.evaluate(async () => (await fetch('/api/auth/verify', { credentials: 'include' })).status);
    note('3c. GET /api/auth/verify with the refreshed session', verifyAfterRefresh);
} catch (e) { fail('3. Session refresh', e); }

// ══ 4. 2FA setup + enable (real screen, fresh login) ═════════════════════════════════════════════
let totpSecret = null;
try {
    const { page } = await newPage();
    await doLogin(page);
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    await page.goto(UI + '/settings/security'); await page.waitForTimeout(1200);
    const setupBtn = page.locator('button', { hasText: /Enable 2FA/ }).first();
    note('4. setup button found', await setupBtn.count());
    await setupBtn.click();
    await page.waitForTimeout(800);
    note('4. code elements after click', await page.locator('code').count());
    const secretText = await page.locator('code').first().innerText();
    totpSecret = secretText.trim();
    note('4a. 2FA setup: manual-entry secret shown on screen', totpSecret.length > 0 ? `(length ${totpSecret.length})` : '(EMPTY)');
    const code = totpNow(totpSecret);
    note('4b. computed a valid TOTP code from that secret', code);
    await page.locator('input[maxlength="6"]').first().fill(code);
    await page.locator('button', { hasText: /Confirm and enable/ }).first().click();
    await page.waitForTimeout(1000);
    const enabledInDb = sql(`SELECT totp_enabled FROM users WHERE username='login_2fa_reviewer';`);
    note('4c. totp_enabled in DB after real-screen enable', enabledInDb);
} catch (e) { fail('4. 2FA setup + enable', e); }

// ══ 5. Login now requires 2FA: no-otp rejected, wrong-otp rejected, correct-otp succeeds ═══════════
try {
    if (!totpSecret) throw new Error('no totpSecret from step 4 — 2FA was never enabled');
    const { page } = await newPage();
    await doLogin(page); // no otp
    await page.waitForTimeout(1000);
    const otpFieldVisible = await page.locator('#otp').count();
    note('5a. after password-only submit, login form now shows an OTP field (2FA required)', otpFieldVisible);

    await page.fill('#otp', '000000');
    await page.click('button[type=submit]');
    await page.waitForTimeout(1000);
    const stillOnLogin = page.url().includes('/login');
    note('5b. wrong OTP (000000) — still on login page (rejected)', stillOnLogin);

    const correctCode = totpNow(totpSecret);
    await page.fill('#otp', correctCode);
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 }).catch(() => {});
    note('5c. correct OTP — landed on', new URL(page.url()).pathname);
} catch (e) { fail('5. Login with 2FA (reject/accept paths)', e); }

// ══ 6. Disable 2FA (real screen, password + fresh OTP, fresh login WITH otp) ═════════════════════
try {
    if (!totpSecret) throw new Error('no totpSecret from step 4 — 2FA was never enabled');
    const { page } = await newPage();
    await doLogin(page, totpNow(totpSecret));
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    await page.goto(UI + '/settings/security');
    await page.locator('text=/2FA is currently enabled/').waitFor({ timeout: 10000 }).catch(async () => {
        note('6. page body while waiting for enabled-state text', await page.locator('body').innerText().then(t => t.slice(0, 300)));
    });
    const pwInput = page.locator('input[type=password]').first();
    note('6. password input found', await pwInput.count());
    await pwInput.fill(PW);
    const otpInput = page.locator('input[maxlength="6"]').first();
    await otpInput.fill(totpNow(totpSecret));
    await page.locator('button', { hasText: /Disable 2FA/ }).first().click();
    await page.waitForTimeout(1000);
    const disabledInDb = sql(`SELECT totp_enabled, totp_secret FROM users WHERE username='login_2fa_reviewer';`);
    note('6. totp_enabled|totp_secret in DB after real-screen disable (expect 0|)', disabledInDb);
} catch (e) { fail('6. 2FA disable', e); }

// ══ 7. Sign out everywhere (logout-all) invalidates the current session too ═════════════════════
try {
    const { page } = await newPage();
    await doLogin(page); // 2FA disabled by step 6, plain password login again
    await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    await page.goto(UI + '/settings/security'); await page.waitForTimeout(800);
    await page.locator('button', { hasText: /Sign out everywhere/ }).first().click();
    await page.waitForTimeout(1000);
    const verifyAfterLogoutAll = await page.evaluate(async () => (await fetch('/api/auth/verify', { credentials: 'include' })).status);
    note('7. GET /api/auth/verify after "Sign out everywhere" (expect 401)', verifyAfterLogoutAll);
} catch (e) { fail('7. Logout everywhere', e); }

await browser.close();
console.log('DONE');
