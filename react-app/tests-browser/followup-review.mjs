// FollowUp Issue business review — real browser, real screens + API checks, isolated stack (2026-09-24).
// This module was hardened in the commit immediately before this review session (closed-state lock +
// delete restriction + audit-commit fix) — never verified on a real screen until now. Covers: create,
// status transition (note: the screen's dropdown offers only Open/Closed/Void, NOT "In Progress" even
// though WorkflowEngine allows it), the unconditional Closed lock (no permission escape hatch, unlike
// NOI/OBS), and delete restricted to Void-only records.
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

const creator = await login('followup_creator');
const updater = await login('followup_updater');
const deleter = await login('followup_deleter');

let fuId = null, fuIssueNo = null;

// ══ 1. Create (real screen) — no explicit required-field star seen in the JSX; confirm what actually
//        happens with a fully blank form (backend defaults title/status/description if omitted) ══════
try {
    await creator.goto(UI + '/followup'); await creator.waitForTimeout(1200);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(500);
    await modal(creator).locator('textarea').first().fill('FollowUp review description');
    const saveBtn = modal(creator).locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click();
    await creator.waitForTimeout(1200);
    const created = sql(`SELECT id, issueNo, status, title FROM followup ORDER BY rowid DESC LIMIT 1;`);
    note('FollowUp created via real screen (id|issueNo|status|title)', created);
    [fuId, fuIssueNo] = created.split('|');
} catch (e) { fail('1. Create', e); }

// ══ 2. Status dropdown: confirm exactly which options the screen offers (Open/Closed/Void — no
//        "In Progress" observed in the JSX; verify live) ══════════════════════════════════════════════
try {
    if (!fuId) throw new Error('no FollowUp from step 1');
    await updater.goto(UI + '/followup'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: fuIssueNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const statusSelect = modal(updater).locator('select').first();
    const opts = await statusSelect.locator('option').allInnerTexts();
    note('status dropdown options actually offered on screen', JSON.stringify(opts));
    await statusSelect.selectOption('Closed');
    await modal(updater).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await updater.waitForTimeout(1000);
    const afterClose = sql(`SELECT status FROM followup WHERE id='${fuId}';`);
    note('status after direct Open -> Closed via screen (skipping In Progress, which the dropdown never offered)', afterClose);
} catch (e) { fail('2. Status dropdown + transition', e); }

// ══ 3. Unconditional Closed lock — no permission escape hatch (unlike NOI/OBS) ═══════════════════════
try {
    if (!fuId) throw new Error('no FollowUp');
    await updater.goto(UI + '/followup'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: fuIssueNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const descField = modal(updater).locator('textarea').first();
    const isDisabled = await descField.isDisabled().catch(() => null);
    note('description field disabled on screen for a Closed FollowUp (frontend: readOnly = status === "Closed", unconditional)', isDisabled);

    // Backend: attempt a direct API edit while genuinely Closed.
    const editAttempt = await apiCall(updater, 'PUT', `/api/followup/${fuId}`, { description: 'Edited while Closed' });
    note('followup_updater direct PUT editing description on a Closed FollowUp (no status change in payload)', `HTTP ${editAttempt.status} body=${JSON.stringify(editAttempt.body).slice(0, 250)}`);
    const afterEditAttempt = sql(`SELECT description FROM followup WHERE id='${fuId}';`);
    note('description after the blocked edit attempt', afterEditAttempt);
} catch (e) { fail('3. Unconditional Closed lock', e); }

// ══ 4. Delete restriction: Closed record cannot be deleted; only Void can ══════════════════════════
try {
    if (!fuId) throw new Error('no FollowUp');
    const delClosedAttempt = await apiCall(deleter, 'DELETE', `/api/followup/${fuId}`, null);
    note('4a: followup_deleter attempts to delete a Closed FollowUp', `HTTP ${delClosedAttempt.status} body=${JSON.stringify(delClosedAttempt.body).slice(0, 250)}`);
    const stillThereClosed = sql(`SELECT COUNT(*) FROM followup WHERE id='${fuId}';`);
    note('4a: row still present after the rejection', stillThereClosed);

    // A genuinely Void record, independent of the Closed one above, should delete cleanly.
    const voidRes = await apiCall(deleter, 'POST', '/api/followup/', {
        title: 'Void-then-delete comparison', description: 'x', status: 'Void',
        createdAt: '2026-09-24', updatedAt: '2026-09-24',
    });
    const voidId = voidRes.body?.id;
    note('4b: created a fresh Void FollowUp for the legitimate-delete comparison', `HTTP ${voidRes.status} id=${voidId}`);
    const delVoidAttempt = await apiCall(deleter, 'DELETE', `/api/followup/${voidId}`, null);
    note('4b: followup_deleter deletes the Void FollowUp', `HTTP ${delVoidAttempt.status}`);
    const stillThereVoid = sql(`SELECT COUNT(*) FROM followup WHERE id='${voidId}';`);
    note('4b: row count after the legitimate delete (0 = removed)', stillThereVoid);
} catch (e) { fail('4. Delete restriction (Closed blocked, Void allowed)', e); }

await browser.close();
console.log('DONE');
