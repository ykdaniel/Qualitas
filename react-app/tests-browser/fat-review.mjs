// FAT business review — real browser, real screens + API checks, isolated stack (2026-09-24). FAT has
// no WorkflowEngine transitions and no status-based lock anywhere in the backend (confirmed via reading
// services/fat_service.py in full) — the simplest module reviewed this batch. Covers: create, free
// status transition (any -> any, no validation), editing a Completed/Cancelled record (no lock), and
// delete (no protection at all).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
async function apiCall(p, method, path, body) {
    return await p.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await res.json(); } catch (_) {}
        return { status: res.status, body: j };
    }, { method, path, body });
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();

const creator = await login('fat_creator');
const updater = await login('fat_updater');
const deleter = await login('fat_deleter');

let fatId = null;

// ══ 1. Create (real screen) ═══════════════════════════════════════════════════════════════════════
try {
    await creator.goto(UI + '/fat'); await creator.waitForTimeout(1200);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(500);
    const m = modal(creator);
    async function tryField(label, action) {
        try { await action(); note(`field ok: ${label}`); }
        catch (e) { note(`field FAILED: ${label}`, String(e.message).slice(0, 800)); throw e; }
    }
    await tryField('equipment', async () => {
        const equipLabel = m.locator('label', { hasText: '設備名稱' }).first();
        await equipLabel.locator('xpath=following-sibling::input[1]').fill('FAT review equipment', { timeout: 5000 });
    });
    await tryField('supplier', async () => {
        const supplierLabel = m.locator('label', { hasText: '供應商' }).first();
        await supplierLabel.locator('xpath=following-sibling::select[1]').selectOption('FAT Review Co', { timeout: 5000 });
    });
    await tryField('startDate', async () => {
        const startLabel = m.locator('label', { hasText: '開始日期' }).first();
        const startField = startLabel.locator('xpath=following-sibling::input[1]');
        await startField.click({ timeout: 5000 }); await startField.fill('2026-09-24', { timeout: 5000 });
    });
    await tryField('endDate', async () => {
        const endLabel = m.locator('label', { hasText: '結束日期' }).first();
        const endField = endLabel.locator('xpath=following-sibling::input[1]');
        await endField.click({ timeout: 5000 }); await endField.fill('2026-09-25', { timeout: 5000 });
    });
    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click();
    await creator.waitForTimeout(1200);
    const created = sql(`SELECT id, equipment, status FROM fat ORDER BY rowid DESC LIMIT 1;`);
    note('FAT created via real screen (id|equipment|status)', created);
    fatId = created.split('|')[0];
} catch (e) { fail('1. Create', e); }

// ══ 2. Free status transition: no WorkflowEngine table for FAT — jump directly Scheduled -> Completed,
//        THEN backwards Completed -> Scheduled, both via real screen, confirming no validation blocks it ═
try {
    if (!fatId) throw new Error('no FAT from step 1');
    await updater.goto(UI + '/fat'); await updater.waitForTimeout(1200);
    for (const next of ['Completed', 'Scheduled']) {
        await updater.locator('tr').filter({ has: updater.locator('td', { hasText: 'FAT review equipment' }) }).first().click();
        await modal(updater).waitFor({ timeout: 10000 });
        await updater.waitForTimeout(500);
        const statusSelect = modal(updater).locator('select').filter({ has: modal(updater).locator(`option[value="${next}"]`) }).first();
        await statusSelect.selectOption(next);
        await modal(updater).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
        await updater.waitForTimeout(1000);
        const dbStatus = sql(`SELECT status FROM fat WHERE id='${fatId}';`);
        note(`status after direct transition to "${next}" (no intermediate steps required)`, dbStatus);
        await updater.goto(UI + '/fat'); await updater.waitForTimeout(800);
    }
} catch (e) { fail('2. Free status transition', e); }

// ══ 3. Edit a Completed record's core content — confirm no lock (backend + screen) ══════════════════
try {
    if (!fatId) throw new Error('no FAT');
    await apiCall(updater, 'PUT', `/api/fat/${fatId}`, { status: 'Completed' });
    const editAttempt = await apiCall(updater, 'PUT', `/api/fat/${fatId}`, { equipment: 'Edited while Completed' });
    note('3: fat_updater direct PUT editing equipment on a Completed FAT (no status change in payload)', `HTTP ${editAttempt.status}`);
    const afterEdit = sql(`SELECT equipment, status FROM fat WHERE id='${fatId}';`);
    note('3: equipment/status after the edit attempt', afterEdit);

    await updater.goto(UI + '/fat'); await updater.waitForTimeout(1200);
    await updater.locator('tr').filter({ has: updater.locator('td', { hasText: 'Edited while Completed' }) }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const equipField = modal(updater).locator('label', { hasText: '設備名稱' }).first().locator('xpath=following-sibling::input[1]');
    const isDisabled = await equipField.isDisabled().catch(() => null);
    note('3: equipment field disabled on screen for a Completed FAT (fat_updater has fat:update:all)', isDisabled);
} catch (e) { fail('3. Completed-record editability', e); }

// ══ 4. Delete protection (or lack thereof) ═══════════════════════════════════════════════════════════
try {
    if (!fatId) throw new Error('no FAT');
    const statusBeforeDelete = sql(`SELECT status FROM fat WHERE id='${fatId}';`);
    note('4: FAT status right before delete attempt', statusBeforeDelete);
    const delRes = await apiCall(deleter, 'DELETE', `/api/fat/${fatId}`, null);
    note('4: fat_deleter (has fat:delete:all) attempts to delete a Completed FAT', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 200)}`);
    const stillThere = sql(`SELECT COUNT(*) FROM fat WHERE id='${fatId}';`);
    note('4: row count after the delete attempt (0 = no protection blocked it)', stillThere);
} catch (e) { fail('4. Delete protection', e); }

await browser.close();
console.log('DONE');
