// Batch-1 save-flow fix verification — real browser, isolated stack (2026-09-25).
// Covers: PQP save failure keeps modal+input, no duplicate on retry; ITP save failure keeps
// input+isDirty (close then asks to discard), no duplicate/re-upload on retry.
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
await page.fill('#email', 'save_flow_reviewer'); await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();

// ══ 1. PQP: forced save failure keeps modal + input, retry succeeds without duplicate ═══════════
try {
    await page.goto(UI + '/pqp'); await page.waitForTimeout(1200);
    await page.locator('button', { hasText: /新增品質計劃|Add New Quality Plan/ }).first().click();
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);

    const subjectLabel = m.locator('label', { hasText: '主旨' }).first();
    const subjectInput = subjectLabel.locator('xpath=following-sibling::input[1]');
    await subjectInput.fill('Save-flow review PQP (forced failure)');
    const contractorLabel = m.locator('label', { hasText: '承包商' }).first();
    const contractorSelect = contractorLabel.locator('xpath=following-sibling::select[1]');
    await contractorSelect.selectOption({ label: 'Save Flow Review Co' });

    // Force the create request to fail (simulates a real network/backend failure).
    let blockPost = true;
    await page.route('**/api/pqp/', route => {
        if (route.request().method() === 'POST' && blockPost) {
            route.abort('failed');
        } else {
            route.continue();
        }
    });

    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);

    const stillOpenAfterFailure = await modal(page).count();
    note('1a. modal still open after forced save failure', stillOpenAfterFailure > 0);
    const subjectValueAfterFailure = await subjectInput.inputValue();
    note('1b. subject input still holds the typed text after failure', subjectValueAfterFailure);
    const errorShown = await m.locator('[class*=saveError]').count();
    note('1c. a save-error message is shown inside the modal', errorShown > 0);
    const countAfterFailure = sql(`SELECT COUNT(*) FROM pqp WHERE title='Save-flow review PQP (forced failure)';`);
    note('1d. no record was created in the DB by the failed attempt', countAfterFailure);

    // Allow the retry to go through for real.
    blockPost = false;
    await saveBtn.click();
    await page.waitForTimeout(1500);
    const closedAfterRetry = await modal(page).count();
    note('1e. modal closed after the successful retry', closedAfterRetry === 0);
    const countAfterRetry = sql(`SELECT COUNT(*) FROM pqp WHERE title='Save-flow review PQP (forced failure)';`);
    note('1f. exactly ONE record exists after retry (no duplicate from the failed attempt)', countAfterRetry);

    await page.unroute('**/api/pqp/');
} catch (e) { fail('1. PQP save-failure resilience', e); }

// ══ 2. ITP: forced save failure keeps input + isDirty, close asks to discard, retry succeeds ═════
try {
    await page.goto(UI + '/itp'); await page.waitForTimeout(1200);
    await page.locator('tr', { hasText: 'QTS-SFR-ITP-000001' }).first().click();
    await modal(page).waitFor({ timeout: 10000 });
    const m2 = modal(page);

    const descLabel = m2.locator('label', { hasText: '主旨' }).first();
    const descInput = descLabel.locator('xpath=following-sibling::*[self::input or self::textarea][1]');
    await descInput.fill('Save-flow review ITP edit (forced failure)');

    let blockPut = true;
    await page.route('**/api/itp/sf-itp-1/', route => {
        if (route.request().method() === 'PUT' && blockPut) {
            route.abort('failed');
        } else {
            route.continue();
        }
    });

    const saveBtn2 = m2.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn2.click();
    await page.waitForTimeout(1500);

    const stillOpenAfterFailure2 = await modal(page).count();
    note('2a. modal still open after forced save failure', stillOpenAfterFailure2 > 0);
    const descValueAfterFailure = await descInput.inputValue();
    note('2b. description input still holds the typed text after failure', descValueAfterFailure);
    const dbDescAfterFailure = sql(`SELECT description FROM itp WHERE id='sf-itp-1';`);
    note('2c. DB description unchanged by the failed attempt (still empty)', `"${dbDescAfterFailure}"`);

    // Try closing now — isDirty should still be true, so this must ask to discard rather than
    // closing silently (that silent-close was exactly the confirmed bug).
    const closeBtn = m2.locator('button', { hasText: '×' }).first();
    await closeBtn.click();
    await page.waitForTimeout(500);
    const discardDialogShown = await page.locator('text=/未儲存的變更|Unsaved Changes/').count();
    note('2d. closing after a failed save still shows the unsaved-changes confirmation', discardDialogShown > 0);
    // Stay (cancel the close) so we can retry the save.
    await page.locator('button', { hasText: /留下並儲存|Stay/ }).first().click().catch(() => {});
    await page.waitForTimeout(300);

    // Allow the retry to go through for real.
    blockPut = false;
    await saveBtn2.click();
    await page.waitForTimeout(1500);
    const dbDescAfterRetry = sql(`SELECT description FROM itp WHERE id='sf-itp-1';`);
    note('2e. DB description updated after the successful retry', dbDescAfterRetry);
    const closedAfterRetry2 = await modal(page).count();
    note('2f. modal closed after the successful retry', closedAfterRetry2 === 0);

    await page.unroute('**/api/itp/sf-itp-1/');
} catch (e) { fail('2. ITP save-failure resilience', e); }

await browser.close();
console.log('DONE');
