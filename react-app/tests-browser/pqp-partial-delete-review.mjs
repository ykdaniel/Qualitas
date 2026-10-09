// Targeted follow-up test (2026-09-28): does a PARTIAL delete failure (one attachment delete
// succeeds for real, one fails) get correctly resolved on retry, or does the already-succeeded
// one get resent and 404, permanently blocking the save? This is NOT a broad re-test of batch-1 —
// it exists only to answer one specific question raised about deletedFileIds not being pruned
// of successes between attempts.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const page = await ctx.newPage();
page.on('dialog', d => d.accept());

await page.goto(UI + '/login');
await page.fill('#email', 'pqp_partial_delete_reviewer'); await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();

const deleteRequests = [];
page.on('request', req => {
    if (req.method() === 'DELETE' && req.url().includes('/api/files/')) {
        deleteRequests.push(req.url());
    }
});

try {
    await page.goto(UI + '/pqp'); await page.waitForTimeout(1200);
    note('rows visible on PQP list', await page.locator('tr').allTextContents().then(a => a.join(' | ').slice(0, 400)));
    await page.locator('tr', { hasText: 'QTS-PDR-PQP-000001' }).first().click({ timeout: 10000 });
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    await page.waitForTimeout(800);

    const thumbCount = await m.locator('img[alt="keep.png"], img[alt="fail.png"]').count();
    note('0. both existing attachments visible before deleting', thumbCount);
    note('0b. all img alt attrs in modal', await m.locator('img').evaluateAll(els => els.map(e => e.alt)).then(a => a.join(',')));

    // Click delete on both thumbnails (marks both pending-delete in the modal's local state).
    const keepDeleteBtn = m.locator('img[alt="keep.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    const failDeleteBtn = m.locator('img[alt="fail.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    await keepDeleteBtn.click();
    await failDeleteBtn.click();
    await page.waitForTimeout(300);

    // Force ONLY pd-att-fail's delete to fail; pd-att-keep's delete goes through for real.
    await page.route('**/api/files/pd-att-fail', route => {
        if (route.request().method() === 'DELETE') route.abort('failed');
        else route.continue();
    });

    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);

    const keepStateAfterFirstSave = sql(`SELECT is_deleted FROM attachments WHERE id='pd-att-keep';`);
    const failStateAfterFirstSave = sql(`SELECT is_deleted FROM attachments WHERE id='pd-att-fail';`);
    note('1a. after first Save attempt: pd-att-keep is_deleted (expect 1, real delete succeeded)', keepStateAfterFirstSave);
    note('1b. after first Save attempt: pd-att-fail is_deleted (expect 0, forced failure)', failStateAfterFirstSave);
    const stillOpenAfterFirstSave = await modal(page).count();
    note('1c. modal still open after the partial failure', stillOpenAfterFirstSave > 0);

    // Now lift the block on pd-att-fail entirely and retry with NO further changes.
    await page.unroute('**/api/files/pd-att-fail');
    deleteRequests.length = 0;
    await saveBtn.click();
    await page.waitForTimeout(1500);

    note('2a. DELETE requests fired on the unmodified retry', JSON.stringify(deleteRequests));
    const keepStateAfterRetry = sql(`SELECT is_deleted FROM attachments WHERE id='pd-att-keep';`);
    const failStateAfterRetry = sql(`SELECT is_deleted FROM attachments WHERE id='pd-att-fail';`);
    note('2b. after retry: pd-att-keep is_deleted', keepStateAfterRetry);
    note('2c. after retry: pd-att-fail is_deleted', failStateAfterRetry);
    const closedAfterRetry = await modal(page).count();
    note('2d. modal closed after the retry (expect FALSE if the already-deleted one 404s again)', closedAfterRetry === 0);
    const errorTextAfterRetry = await m.locator('[class*=saveError]').innerText().catch(() => '(no error element / modal closed)');
    note('2e. error message shown after the retry, if any', errorTextAfterRetry);
} catch (e) { fail('PQP partial-delete retry', e); }

await browser.close();
console.log('DONE');
