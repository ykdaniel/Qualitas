// FAT save-failure review (2026-09-28). Real isolated backend + real screens.
// Batch scope: FATEditModal's create/update save must keep the modal open, preserve the user's
// input, and re-enable the Save button on ANY failure — network interruption, a simulated server
// error, and a real backend rejection — and must close ONLY on success, with no duplicate create
// on retry and the latest edits saved on an update retry. Backend untouched.
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
const equipField = pg => modal(pg).locator('label', { hasText: '設備名稱' }).first().locator('xpath=following-sibling::input[1]');
const saveBtn = pg => modal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const toasts = async pg => (await pg.locator('[data-sonner-toast]').allInnerTexts());

// Counts real network requests by method+path-prefix for a page, for the duplicate-create /
// retry-count evidence required by this batch.
function countRequests(pg, method, pathPrefix) {
    const state = { count: 0 };
    pg.on('request', req => {
        if (req.method() === method && req.url().includes(pathPrefix)) state.count++;
    });
    return state;
}

const creator = await login('fat_create_only');
const updater = await login('fat_update_only');
const multiscope = await login('fat_create_multiscope');
const deleteHelper = await login('fat_delete_helper');

// ══ 1. CREATE — network interruption (aborted request) ══════════════════════════════════════════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM fat;`);
    const reqs = countRequests(creator, 'POST', '/api/fat/');
    await creator.goto(UI + '/fat'); await creator.waitForTimeout(1000);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(400);
    await equipField(creator).fill('Network-interrupted create', { timeout: 5000 });
    const supplierSelect = modal(creator).locator('label', { hasText: '供應商' }).first().locator('xpath=following-sibling::select[1]');
    await supplierSelect.selectOption('FAT SaveFail Review Co', { timeout: 5000 });

    await creator.route('**/api/fat/', route => { if (route.request().method() === 'POST') route.abort('failed'); else route.continue(); });
    await saveBtn(creator).click();
    await creator.waitForTimeout(1000);
    note('1a. modal still open after aborted (network-interrupted) create request', await modal(creator).isVisible());
    note('1b. equipment input value preserved', await equipField(creator).inputValue());
    note('1c. Save button re-enabled after failure', !(await saveBtn(creator).isDisabled()));
    note('1d. error toast shown (exactly one)', (await toasts(creator)).length);
    note('1e. row count unchanged (no partial create)', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM fat;`)}`);

    await creator.unroute('**/api/fat/');
    await saveBtn(creator).click(); // retry, now unblocked
    await creator.waitForTimeout(1000);
    const countAfter = sql(`SELECT COUNT(*) FROM fat;`);
    note('1f. retry succeeds: modal closed', !(await modal(creator).isVisible().catch(() => false)));
    note('1g. row count after retry (expect exactly +1, no duplicate from the aborted attempt)', `${countBefore} -> ${countAfter}`);
    note('1h. total POST /api/fat/ requests observed (expect 2: the aborted one + the retry)', reqs.count);
    note('1i. created row content', sql(`SELECT equipment FROM fat WHERE equipment='Network-interrupted create';`));
} catch (e) { fail('1. Create — network interruption', e); }

// ══ 2. CREATE — simulated HTTP 500 ═══════════════════════════════════════════════════════════════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM fat;`);
    const reqs = countRequests(creator, 'POST', '/api/fat/');
    await creator.goto(UI + '/fat'); await creator.waitForTimeout(1000);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(400);
    await equipField(creator).fill('Simulated-500 create', { timeout: 5000 });
    const supplierSelect = modal(creator).locator('label', { hasText: '供應商' }).first().locator('xpath=following-sibling::select[1]');
    await supplierSelect.selectOption('FAT SaveFail Review Co', { timeout: 5000 });

    await creator.route('**/api/fat/', route => {
        if (route.request().method() === 'POST') route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced 500 for this review' }) });
        else route.continue();
    });
    await saveBtn(creator).click();
    await creator.waitForTimeout(1000);
    note('2a. modal still open after simulated 500', await modal(creator).isVisible());
    note('2b. equipment input value preserved', await equipField(creator).inputValue());
    note('2c. Save button re-enabled after failure', !(await saveBtn(creator).isDisabled()));
    note('2d. error toast count (expect exactly 1)', (await toasts(creator)).length);
    note('2e. row count unchanged', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM fat;`)}`);

    await creator.unroute('**/api/fat/');
    await saveBtn(creator).click();
    await creator.waitForTimeout(1000);
    const countAfter = sql(`SELECT COUNT(*) FROM fat;`);
    note('2f. retry succeeds: modal closed', !(await modal(creator).isVisible().catch(() => false)));
    note('2g. row count after retry (expect exactly +1)', `${countBefore} -> ${countAfter}`);
    note('2h. total POST /api/fat/ requests observed (expect 2)', reqs.count);
} catch (e) { fail('2. Create — simulated 500', e); }

// ══ 3. CREATE — REAL backend rejection (no interception): multi-project-scoped account, no
// project_id field in the form -> core/scope.py raises ScopeForbidden for real (403) ══════════════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM fat;`);
    await multiscope.goto(UI + '/fat'); await multiscope.waitForTimeout(1000);
    await multiscope.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(multiscope).waitFor({ timeout: 10000 });
    await multiscope.waitForTimeout(400);
    await equipField(multiscope).fill('Real-rejection create attempt', { timeout: 5000 });
    const supplierSelect = modal(multiscope).locator('label', { hasText: '供應商' }).first().locator('xpath=following-sibling::select[1]');
    await supplierSelect.selectOption('FAT SaveFail Review Co', { timeout: 5000 });
    await saveBtn(multiscope).click();
    await multiscope.waitForTimeout(1000);
    note('3a. modal still open after a REAL backend 403 (ambiguous project scope, no interception)', await modal(multiscope).isVisible());
    note('3b. equipment input value preserved', await equipField(multiscope).inputValue());
    note('3c. Save button re-enabled', !(await saveBtn(multiscope).isDisabled()));
    note('3d. error toast count', (await toasts(multiscope)).length);
    note('3e. row count unchanged (real rejection created nothing)', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM fat;`)}`);
    // Informational only, NOT fixed this batch: this account can never successfully create via
    // this form at all (no project picker exists to resolve the ambiguity) — flagged in the report.
} catch (e) { fail('3. Create — real backend rejection', e); }

// ══ 4. UPDATE — network interruption ══════════════════════════════════════════════════════════════
try {
    const reqs = countRequests(updater, 'PUT', '/api/fat/fsf-fat-update-network');
    await updater.goto(UI + '/fat'); await updater.waitForTimeout(1000);
    await updater.locator('tr').filter({ has: updater.locator('td', { hasText: 'Update-network-test FAT' }) }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(400);
    await equipField(updater).fill('Edited-then-network-fail', { timeout: 5000 });

    await updater.route('**/api/fat/fsf-fat-update-network', route => { if (route.request().method() === 'PUT') route.abort('failed'); else route.continue(); });
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('4a. modal still open after aborted update', await modal(updater).isVisible());
    note('4b. edited value preserved in the field', await equipField(updater).inputValue());
    note('4c. Save button re-enabled', !(await saveBtn(updater).isDisabled()));
    note('4d. DB unchanged after the aborted attempt', sql(`SELECT equipment FROM fat WHERE id='fsf-fat-update-network';`));

    await updater.unroute('**/api/fat/fsf-fat-update-network');
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('4e. retry succeeds: modal closed', !(await modal(updater).isVisible().catch(() => false)));
    note('4f. DB reflects the latest edit after retry', sql(`SELECT equipment FROM fat WHERE id='fsf-fat-update-network';`));
    note('4g. total PUT requests observed (expect 2)', reqs.count);
} catch (e) { fail('4. Update — network interruption', e); }

// ══ 5. UPDATE — simulated HTTP 500 ════════════════════════════════════════════════════════════════
try {
    const reqs = countRequests(updater, 'PUT', '/api/fat/fsf-fat-update-500');
    await updater.goto(UI + '/fat'); await updater.waitForTimeout(1000);
    await updater.locator('tr').filter({ has: updater.locator('td', { hasText: 'Update-500-test FAT' }) }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(400);
    await equipField(updater).fill('Edited-then-500', { timeout: 5000 });

    await updater.route('**/api/fat/fsf-fat-update-500', route => {
        if (route.request().method() === 'PUT') route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced 500 for this review' }) });
        else route.continue();
    });
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('5a. modal still open after simulated 500', await modal(updater).isVisible());
    note('5b. edited value preserved', await equipField(updater).inputValue());
    note('5c. Save button re-enabled', !(await saveBtn(updater).isDisabled()));
    note('5d. DB unchanged', sql(`SELECT equipment FROM fat WHERE id='fsf-fat-update-500';`));

    await updater.unroute('**/api/fat/fsf-fat-update-500');
    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('5e. retry succeeds: modal closed', !(await modal(updater).isVisible().catch(() => false)));
    note('5f. DB reflects the latest edit after retry', sql(`SELECT equipment FROM fat WHERE id='fsf-fat-update-500';`));
    note('5g. total PUT requests observed (expect 2)', reqs.count);
} catch (e) { fail('5. Update — simulated 500', e); }

// ══ 6. UPDATE — REAL backend rejection (no interception): record deleted concurrently -> real 404
try {
    await updater.goto(UI + '/fat'); await updater.waitForTimeout(1000);
    await updater.locator('tr').filter({ has: updater.locator('td', { hasText: 'Update-404-test FAT' }) }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(400);
    await equipField(updater).fill('Edited-then-deleted-elsewhere', { timeout: 5000 });

    // Simulate a genuinely concurrent delete by a different actor while this modal is open.
    const delRes = await apiCall(deleteHelper, 'DELETE', '/api/fat/fsf-fat-update-404', null);
    note('6a. concurrent delete by another session (setup, not the assertion)', `HTTP ${delRes.status}`);

    await saveBtn(updater).click();
    await updater.waitForTimeout(1000);
    note('6b. modal still open after a REAL 404 (record deleted elsewhere, no interception)', await modal(updater).isVisible());
    note('6c. edited value still present in the field (input not discarded)', await equipField(updater).inputValue());
    note('6d. Save button re-enabled', !(await saveBtn(updater).isDisabled()));
    note('6e. error toast count', (await toasts(updater)).length);
    // No retry-success check here: the record is genuinely gone, so there is nothing to retry
    // into — this scenario only demonstrates uniform failure handling, not recovery.
} catch (e) { fail('6. Update — real 404 (concurrent delete)', e); }

// ══ 7. Cancel still must not send a create request (regression from the prior batch) ═════════════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM fat;`);
    await creator.goto(UI + '/fat'); await creator.waitForTimeout(1000);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(400);
    await equipField(creator).fill('Should never be saved (cancel)', { timeout: 5000 });
    await modal(creator).locator('button', { hasText: /^(取消|Cancel)$/ }).first().click();
    await creator.waitForTimeout(600);
    note('7. row count unchanged after Cancel', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM fat;`)}`);
} catch (e) { fail('7. Cancel regression', e); }

// ══ 8. Permission regression (from the prior batch, must still hold) ═════════════════════════════
try {
    await creator.goto(UI + '/fat'); await creator.waitForTimeout(1000);
    note('8a. Add New button visible to fat_create_only', await creator.locator('button', { hasText: /新增|Add/ }).count());
    await creator.locator('tr').filter({ has: creator.locator('td', { hasText: 'Network-interrupted create' }) }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(400);
    note('8b. equipment field disabled for fat_create_only reopening an existing record (expect true)', await equipField(creator).isDisabled());
    await creator.keyboard.press('Escape').catch(() => {});

    await updater.goto(UI + '/fat'); await updater.waitForTimeout(1000);
    note('8c. Add New button visible to fat_update_only (expect 0)', await updater.locator('button', { hasText: /新增|Add/ }).count());
    const postRes = await apiCall(updater, 'POST', '/api/fat/', { equipment: 'should be rejected', vendor_id: 'FSF-V1', project_id: 'FSF-P1' });
    note('8d. fat_update_only direct POST create (expect 403)', `HTTP ${postRes.status}`);
} catch (e) { fail('8. Permission regression', e); }

await browser.close();
console.log('DONE');
