// FAT DETAIL-modal (檢驗明細) save-failure review (2026-09-28). Real isolated backend + real
// screens. Scope: ONLY FATDetailModal's save flow (handleAddDetails/handleSaveDetails). Does NOT
// touch the main FATEditModal (fixed in the prior batch) or the multi-project create gap
// (deliberately left unfixed, flagged separately).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const BASELINE = process.argv[3] === '--baseline';

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
const openDetails = async (pg, equipmentText) => {
    await pg.goto(UI + '/fat'); await pg.waitForTimeout(1000);
    const row = pg.locator('tr').filter({ has: pg.locator('td', { hasText: equipmentText }) }).first();
    await row.locator('button[title="新增詳情"]').first().click();
    await modal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(400);
};
const itemNameField = pg => modal(pg).locator('table').locator('tbody tr').first().locator('input').nth(1); // sNo, itemName, spec, qty, unit, criteria, actual...
const saveBtn = pg => modal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const toasts = async pg => (await pg.locator('[data-sonner-toast]').allInnerTexts());
function countRequests(pg, method, pathPrefix) {
    const state = { count: 0 };
    pg.on('request', req => { if (req.method() === method && req.url().includes(pathPrefix)) state.count++; });
    return state;
}

const updater = await login('fat_detail_updater');

if (BASELINE) {
    // ══ 0. BASELINE REPRO (before any fix) ══════════════════════════════════════════════════════
    // Read-code concern: FATDetailModal.handleSave awaits onSave (handleSaveDetails), which itself
    // swallows its own try/catch without rethrowing — the same pattern already found and fixed in
    // the MAIN form's modal. This section checks whether that concern is a REAL, reproducible
    // defect in the details modal specifically, not just an inference from reading the code.
    try {
        await openDetails(updater, 'Baseline repro FAT');
        await itemNameField(updater).fill('Edited before forced failure', { timeout: 5000 });
        await updater.route('**/api/fat/fds-fat-baseline/details', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced failure for baseline repro' }) }));
        await saveBtn(updater).click();
        await updater.waitForTimeout(1000);
        const stillOpen = await modal(updater).isVisible().catch(() => false);
        note('0a. BASELINE: details modal still open after a forced backend failure (expect false = bug reproduced, matching the main-form finding)', stillOpen);
        note('0b. BASELINE: DB detail_data unchanged (the forced failure never reached the real backend write path)', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-baseline';`).includes('Seed item'));
    } catch (e) { fail('0. Baseline repro', e); }
    await browser.close();
    console.log('DONE');
    process.exit(0);
}

// ══ 1. Details save — network interruption (aborted request) ════════════════════════════════════
try {
    const reqs = countRequests(updater, 'PUT', '/api/fat/fds-fat-network/details');
    await openDetails(updater, 'Details-network-test FAT');
    const before = sql(`SELECT detail_data FROM fat WHERE id='fds-fat-network';`);
    await itemNameField(updater).fill('Edited-then-network-fail', { timeout: 5000 });

    await updater.route('**/api/fat/fds-fat-network/details', route => route.abort('failed'));
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('1a. details modal still open after aborted request', await modal(updater).isVisible());
    note('1b. edited item name still present in the field', await itemNameField(updater).inputValue());
    note('1c. Save button re-enabled', !(await saveBtn(updater).isDisabled()));
    note('1d. error toast count (expect exactly 1)', (await toasts(updater)).length);
    note('1e. DB detail_data unchanged after the aborted attempt', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-network';`) === before);

    await updater.unroute('**/api/fat/fds-fat-network/details');
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('1f. retry succeeds: modal closed', !(await modal(updater).isVisible().catch(() => false)));
    note('1g. DB reflects the latest edit after retry', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-network';`).includes('Edited-then-network-fail'));
    note('1h. total PUT requests observed (the aborted attempt + the retry; NOTE: this only shows the CLIENT sent exactly this many requests, not that the server received/committed exactly this many — an aborted request can still have reached and been processed by the server before the client gave up, which this count alone cannot rule out)', reqs.count);
} catch (e) { fail('1. Details — network interruption', e); }

// ══ 2. Details save — simulated HTTP 500 ═════════════════════════════════════════════════════════
try {
    const reqs = countRequests(updater, 'PUT', '/api/fat/fds-fat-500/details');
    await openDetails(updater, 'Details-500-test FAT');
    const before = sql(`SELECT detail_data FROM fat WHERE id='fds-fat-500';`);
    await itemNameField(updater).fill('Edited-then-500', { timeout: 5000 });

    await updater.route('**/api/fat/fds-fat-500/details', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced 500 for this review' }) }));
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('2a. details modal still open after simulated 500', await modal(updater).isVisible());
    note('2b. edited item name preserved', await itemNameField(updater).inputValue());
    note('2c. Save button re-enabled', !(await saveBtn(updater).isDisabled()));
    note('2d. error toast count', (await toasts(updater)).length);
    note('2e. DB unchanged', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-500';`) === before);

    await updater.unroute('**/api/fat/fds-fat-500/details');
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('2f. retry succeeds: modal closed', !(await modal(updater).isVisible().catch(() => false)));
    note('2g. DB reflects the latest edit after retry', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-500';`).includes('Edited-then-500'));
    note('2h. total PUT requests observed (same server-receipt caveat as 1h)', reqs.count);
} catch (e) { fail('2. Details — simulated 500', e); }

// ══ 3. Details save — REAL backend rejection (no interception): underlying FAT deleted
// concurrently by a different actor while the details modal is open -> real 404 ══════════════════
const deleter = await login('fat_detail_deleter');
try {
    await openDetails(updater, 'Details-404-test FAT');
    await itemNameField(updater).fill('Edited-then-deleted-elsewhere', { timeout: 5000 });

    const delRes = await apiCall(deleter, 'DELETE', '/api/fat/fds-fat-404', null);
    note('3a. concurrent delete by a different session (setup, not the assertion)', `HTTP ${delRes.status}`);

    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('3b. details modal still open after a REAL 404 (no interception)', await modal(updater).isVisible());
    note('3c. edited item name still present (input not discarded)', await itemNameField(updater).inputValue());
    note('3d. Save button re-enabled', !(await saveBtn(updater).isDisabled()));
    note('3e. error toast count', (await toasts(updater)).length);
    // No retry-success check: the parent record is genuinely gone.
} catch (e) { fail('3. Details — real 404 (concurrent delete)', e); }

// ══ 4. Failed save, THEN further edit before retry: retry must save the LATEST content, not the
// content that was on screen at the moment of the first (failed) attempt ═════════════════════════
try {
    const reqs = countRequests(updater, 'PUT', '/api/fat/fds-fat-success/details');
    await openDetails(updater, 'Details-success-path FAT');
    await itemNameField(updater).fill('First edit (will fail)', { timeout: 5000 });
    await updater.route('**/api/fat/fds-fat-success/details', route => route.abort('failed'));
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('4a. modal still open after the first (forced-fail) attempt', await modal(updater).isVisible());

    // Further edit made AFTER the failure, before retrying.
    await itemNameField(updater).fill('Second edit (should be what gets saved)', { timeout: 5000 });
    await updater.unroute('**/api/fat/fds-fat-success/details');
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('4b. retry succeeds: modal closed', !(await modal(updater).isVisible().catch(() => false)));
    const dbVal = sql(`SELECT detail_data FROM fat WHERE id='fds-fat-success';`);
    note('4c. DB reflects the SECOND (latest) edit, not the first failed one', dbVal.includes('Second edit (should be what gets saved)') && !dbVal.includes('First edit (will fail)'));
    note('4d. total PUT requests observed (1 aborted + 1 successful retry; expect 2, i.e. no duplicate submission of the same content)', reqs.count);
} catch (e) { fail('4. Failed-then-edited-then-retry saves the latest content', e); }

// ══ 5. Permission regression: no fat:update:all -> details save still rejected ═══════════════════
const viewer = await login('fat_detail_viewer');
try {
    await openDetails(viewer, 'Details-permission-test FAT');
    const disabled = await itemNameField(viewer).isDisabled();
    note('5a. item name field disabled for fat_detail_viewer (no fat:update:all, expect true)', disabled);
    const saveCount = await modal(viewer).locator('button', { hasText: /^(儲存|Save)$/ }).count();
    note('5b. Save button present for a read-only viewer (expect 0)', saveCount);
    await viewer.keyboard.press('Escape').catch(() => {});

    const putRes = await apiCall(viewer, 'PUT', '/api/fat/fds-fat-permission/details', [{ id: '1', sNo: '1', itemName: 'should be rejected', specification: '', qty: '', unit: '', acceptanceCriteria: '', fatActualValue: '', fatJudgment: '', remarks: '' }]);
    note('5c. fat_detail_viewer direct PUT details (expect 403)', `HTTP ${putRes.status} body=${JSON.stringify(putRes.body).slice(0, 150)}`);
    note('5d. DB unchanged after rejected PUT', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-permission';`).includes('Seed item'));
} catch (e) { fail('5. Permission regression (details PUT)', e); }

// ══ 6. Normal success path and Cancel still work (no regression) ═════════════════════════════════
try {
    await openDetails(updater, 'Details-success-path FAT');
    await itemNameField(updater).fill('Should never be saved (cancel)', { timeout: 5000 });
    await modal(updater).locator('button', { hasText: /^(取消|Cancel)$/ }).first().click();
    await updater.waitForTimeout(600);
    const dbVal = sql(`SELECT detail_data FROM fat WHERE id='fds-fat-success';`);
    note('6a. Cancel does not persist the unsaved edit', !dbVal.includes('Should never be saved'));

    await openDetails(updater, 'Details-success-path FAT');
    await itemNameField(updater).fill('Clean successful save', { timeout: 5000 });
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('6b. clean success closes the modal', !(await modal(updater).isVisible().catch(() => false)));
    note('6c. DB reflects the clean save', sql(`SELECT detail_data FROM fat WHERE id='fds-fat-success';`).includes('Clean successful save'));
} catch (e) { fail('6. Normal success and Cancel (no regression)', e); }

await browser.close();
console.log('DONE');
