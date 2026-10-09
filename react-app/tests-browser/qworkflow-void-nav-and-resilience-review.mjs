import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/qworkflow-void-nav-review';
mkdirSync(output, { recursive: true });
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'dw_unscoped');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

await page.goto(`${BASE}/workflow`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/00-workflow-list.png`, fullPage: true });

// Helper: locate the row whose NOI reference matches, then click the given checkpoint cell.
// Always (re)navigates to /workflow first — closing a detail modal does not itself navigate back.
async function clickCheckpointForNoi(noiRef, checkpointKey) {
    await page.goto(`${BASE}/workflow`);
    await page.waitForTimeout(800);
    const row = page.locator('tr', { hasText: noiRef });
    await row.waitFor({ timeout: 10000 });
    const cell = row.locator(`td[data-checkpoint="${checkpointKey}"]`);
    await cell.click();
    await page.waitForTimeout(800);
}

async function readOpenedDocNo(modulePath) {
    // Works for both /itr and /noi detail modals — the first "Reference no." labeled input.
    return page.evaluate(() => {
        const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Reference no.');
        return lbl?.closest('div')?.querySelector('input')?.value ?? null;
    });
}

async function closeModal() {
    for (let i = 0; i < 4; i++) {
        const stillOpen = await page.locator('[class*="modalBody"]').count();
        if (stillOpen === 0) return;
        await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
        await page.getByRole('button', { name: 'Close', exact: true }).click().catch(() => {});
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
    }
}

const results = [];

// ── Case 1: mixed Void + valid ITR (wh_inspection checkpoint) ──
{
    await clickCheckpointForNoi('QTS-DRC-NOI-000003', 'wh_inspection');
    log('Case 1: URL after click =', page.url());
    await page.waitForTimeout(400);
    const docNo = await readOpenedDocNo();
    log('Case 1: opened doc no =', docNo);
    await page.screenshot({ path: `${output}/01-case1-mixed-wh-inspection.png`, fullPage: true });
    results.push({ case: 'mixed_wh_inspection', url: page.url(), openedDocNo: docNo, expectedNotVoid: 'ITR-DW-VOID-3', expectedIsValid: docNo === 'ITR-DW-VALID-3' });
    await closeModal();
}

// ── Case 2: Void-only ITR (wh_inspection falls back to NOI) ──
{
    await clickCheckpointForNoi('QTS-DRC-NOI-000004', 'wh_inspection');
    log('Case 2: URL after click =', page.url());
    await page.waitForTimeout(400);
    const docNo = await readOpenedDocNo();
    log('Case 2: opened doc no =', docNo);
    await page.screenshot({ path: `${output}/02-case2-void-only-wh-inspection.png`, fullPage: true });
    results.push({ case: 'void_only_wh_inspection_fallback', url: page.url(), openedDocNo: docNo, expectedFallbackToNoi: docNo === 'QTS-DRC-NOI-000004' });
    await closeModal();
}

// ── Case 3: mixed Void + valid re-inspection ITR (itr checkpoint) ──
{
    const beforeUrl = page.url();
    await clickCheckpointForNoi('QTS-DRC-NOI-000005', 'itr');
    log('Case 3: URL after click =', page.url());
    await page.waitForTimeout(400);
    const docNo = await readOpenedDocNo();
    log('Case 3: opened doc no =', docNo);
    await page.screenshot({ path: `${output}/03-case3-mixed-itr-reinspect.png`, fullPage: true });
    results.push({ case: 'mixed_itr_reinspection', url: page.url(), openedDocNo: docNo, expectedNotVoid: 'ITR-DW-REINSP-VOID-5', expectedIsValid: docNo === 'ITR-DW-REINSP-VALID-5' });
    await closeModal();
}

log('===== NODE NAVIGATION SUMMARY =====');
log(JSON.stringify(results, null, 1));

await browser.close();
log('DONE');
