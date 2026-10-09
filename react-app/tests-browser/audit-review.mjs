// Internal Audit business review — real browser, real screens + API, isolated stack (2026-09-24).
// Covers: create via the wizard's "Save Draft" shortcut (bypasses the 5-step wizard entirely, per
// AuditWizard.tsx::handleSaveDraft, which saves at whatever step you're on with no validation), status
// walk through the full chain, the unconditional Closed lock, and — modeled directly on the FollowUp
// finding — whether "Please Void the Audit first, then delete" is actually achievable for a Closed
// record (WorkflowEngine.TRANSITIONS["Audit"]["Closed"] = [], same terminal shape as FollowUp).
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

const creator = await login('audit_creator');
const updater = await login('audit_updater');
const deleter = await login('audit_deleter');

let auditId = null, auditNo = null;

// ══ 1. Create via "Save Draft" — bypasses the 5-step wizard entirely, only auditNo/status required ═══
try {
    await creator.goto(UI + '/audit'); await creator.waitForTimeout(1200);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await creator.locator('[name=auditTitle]').waitFor({ timeout: 10000 });
    await creator.waitForTimeout(300);
    await creator.locator('[name=auditTitle]').fill('Audit review title');
    const saveDraftBtn = creator.locator('button', { hasText: /儲存草稿|Save Draft/ });
    note('Save Draft button visible on step 1 (no need to walk all 5 steps)', await saveDraftBtn.count() > 0);
    await saveDraftBtn.first().click();
    await creator.waitForTimeout(1200);
    const created = sql(`SELECT id, auditNo, status, title FROM audits ORDER BY rowid DESC LIMIT 1;`);
    note('Audit created via Save Draft with only the title filled (id|auditNo|status|title)', created);
    [auditId, auditNo] = created.split('|');
} catch (e) { fail('1. Create via Save Draft', e); }

// ══ 2. Walk the full status chain via API: Draft -> Planned -> In Progress -> Completed -> Closed ═══
try {
    if (!auditId) throw new Error('no Audit from step 1');
    for (const next of ['Planned', 'In Progress', 'Completed', 'Closed']) {
        const res = await apiCall(updater, 'PUT', `/api/audit/${auditId}`, { status: next });
        const dbStatus = sql(`SELECT status FROM audits WHERE id='${auditId}';`);
        note(`transition to "${next}"`, `HTTP ${res.status}  DB=${dbStatus}`);
    }
} catch (e) { fail('2. Status chain walk', e); }

// ══ 3. Unconditional Closed lock (real screen + API) ═════════════════════════════════════════════════
try {
    if (!auditId) throw new Error('no Audit');
    await updater.goto(UI + '/audit'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: auditNo }).first().click();
    await updater.locator('[name=auditTitle]').waitFor({ timeout: 10000 });
    await updater.waitForTimeout(300);
    const titleField = updater.locator('[name=auditTitle]');
    const isDisabled = await titleField.isDisabled().catch(() => null);
    note('audit_updater (has audit:update:all) opens a Closed Audit — auditTitle disabled on screen (unconditional lock, no permission escape hatch)', isDisabled);

    const editAttempt = await apiCall(updater, 'PUT', `/api/audit/${auditId}`, { title: 'Edited while Closed' });
    note('audit_updater direct PUT editing title on a Closed Audit (no status change in payload)', `HTTP ${editAttempt.status} body=${JSON.stringify(editAttempt.body).slice(0, 250)}`);
    const afterEdit = sql(`SELECT title FROM audits WHERE id='${auditId}';`);
    note('title after the blocked edit attempt', afterEdit);
} catch (e) { fail('3. Unconditional Closed lock', e); }

// ══ 4. Closed -> Void: is it actually achievable? (modeled on the FollowUp finding) ══════════════════
try {
    if (!auditId) throw new Error('no Audit');
    const voidAttempt = await apiCall(deleter, 'PUT', `/api/audit/${auditId}`, { status: 'Void' });
    note('4: audit_deleter (has update+delete) attempts Closed -> Void', `HTTP ${voidAttempt.status} body=${JSON.stringify(voidAttempt.body).slice(0, 250)}`);
    const statusAfterVoidAttempt = sql(`SELECT status FROM audits WHERE id='${auditId}';`);
    note('4: status after the Void attempt', statusAfterVoidAttempt);

    // The screen's own status dropdown, for good measure.
    await deleter.goto(UI + '/audit'); await deleter.waitForTimeout(1200);
    await deleter.locator('tr', { hasText: auditNo }).first().click();
    await deleter.locator('[name=auditTitle]').waitFor({ timeout: 10000 });
    await deleter.waitForTimeout(300);
    const statusSelect = deleter.locator('[name=status]');
    const selectDisabled = await statusSelect.isDisabled().catch(() => null);
    note('4: screen status dropdown disabled state on a Closed Audit', selectDisabled);
} catch (e) { fail('4. Closed -> Void achievability', e); }

// ══ 5. Delete on the still-Closed record: exact message, then a legitimate Void-record comparison ═══
try {
    if (!auditId) throw new Error('no Audit');
    const delRes = await apiCall(deleter, 'DELETE', `/api/audit/${auditId}`, null);
    note('5a: audit_deleter attempts DELETE on the still-Closed record', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 300)}`);
    const stillThere = sql(`SELECT COUNT(*) FROM audits WHERE id='${auditId}';`);
    note('5a: row still present after the rejection', stillThere);

    // Independent, genuinely-Void record for the legitimate-delete comparison.
    const voidCreate = await apiCall(deleter, 'POST', '/api/audit/', { title: 'Void-then-delete comparison', date: '2026-09-24', status: 'Void' });
    const voidId = voidCreate.body?.id;
    note('5b: created a fresh Void Audit for comparison', `HTTP ${voidCreate.status} id=${voidId}`);
    const delVoidRes = await apiCall(deleter, 'DELETE', `/api/audit/${voidId}`, null);
    note('5b: delete the genuinely Void Audit', `HTTP ${delVoidRes.status}`);
    const stillThereVoid = sql(`SELECT COUNT(*) FROM audits WHERE id='${voidId}';`);
    note('5b: row count after the legitimate delete (0 = removed)', stillThereVoid);
} catch (e) { fail('5. Delete: Closed blocked, Void allowed', e); }

await browser.close();
console.log('DONE');
