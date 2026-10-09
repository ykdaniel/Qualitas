// Bounded supplement (2026-09-24): does Closed -> Void actually work for an account holding both
// followup:update:all and followup:delete:all? If blocked, delete_followup's "Void it first, then
// delete" instruction on a Closed record is impossible to follow — an operational dead end, not a
// bug to fix here.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const p = await ctx.newPage();
p.on('dialog', d => d.accept());
await p.goto(UI + '/login'); await p.fill('#email', 'followup_deleter'); await p.fill('#password', PW); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

async function apiCall(method, path, body) {
    return await p.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await res.json(); } catch (_) {}
        return { status: res.status, body: j };
    }, { method, path, body });
}

// Confirm followup_deleter's exact permission set from the DB.
const perms = sql(`
  SELECT p.code FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
  JOIN roles r ON r.id = rp.role_id JOIN users u ON u.role_id = r.id WHERE u.username = 'followup_deleter';
`);
note('followup_deleter exact permissions (from DB)', perms.replace(/\n/g, ', '));

// Create + close a FollowUp via API (mirrors the real create flow's defaults).
const created = await apiCall('POST', '/api/followup/', { title: 'Closed-to-Void test', description: 'x', status: 'Open', createdAt: '2026-09-24', updatedAt: '2026-09-24' });
const fuId = created.body?.id;
note('created Open FollowUp', `${created.status} ${fuId}`);
const closeRes = await apiCall('PUT', `/api/followup/${fuId}`, { status: 'Closed' });
note('closed it via API', `${closeRes.status}`);

// API-level attempt: Closed -> Void.
const voidApiAttempt = await apiCall('PUT', `/api/followup/${fuId}`, { status: 'Void' });
note('API: followup_deleter (has update+delete) attempts Closed -> Void', `HTTP ${voidApiAttempt.status} body=${JSON.stringify(voidApiAttempt.body).slice(0, 300)}`);
const statusAfterApi = sql(`SELECT status FROM followup WHERE id='${fuId}';`);
note('status after the API attempt', statusAfterApi);

// Screen-level attempt: does the dropdown even let you pick Void from a Closed record, and if chosen,
// what does the screen show?
const modal = p.locator('[class*=modalContent], [class*=ModalContent]').first();
await p.goto(UI + '/followup'); await p.waitForTimeout(1200);
const docNo = sql(`SELECT issueNo FROM followup WHERE id='${fuId}';`);
await p.locator('tr', { hasText: docNo }).first().click();
await modal.waitFor({ timeout: 10000 });
await p.waitForTimeout(500);
const statusSelect = modal.locator('select').first();
const isSelectDisabled = await statusSelect.isDisabled().catch(() => null);
note('screen: status dropdown disabled state when the record is Closed', isSelectDisabled);
if (isSelectDisabled === false) {
    await statusSelect.selectOption('Void').catch(e => note('screen: selectOption(Void) threw', e.message));
    const saveBtn = modal.locator('button', { hasText: /^(儲存|Save)$/ });
    if (await saveBtn.count() && !(await saveBtn.first().isDisabled().catch(() => true))) {
        await saveBtn.first().click();
        await p.waitForTimeout(1000);
        const toastMsg = (await p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
        note('screen: toast after attempting to save Closed -> Void', toastMsg);
    }
}
const statusAfterScreen = sql(`SELECT status FROM followup WHERE id='${fuId}';`);
note('status after the screen attempt', statusAfterScreen);

// Now try the delete itself, to see the exact message this account gets on a genuinely Closed record.
const delRes = await apiCall('DELETE', `/api/followup/${fuId}`, null);
note('DELETE on the still-Closed record (never-voidable per the above)', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 300)}`);

await browser.close();
console.log('DONE');
