// FORMS-CONSISTENCY-2026-004: targeted verification for the SINGLE R1 fix — ITR's own
// save-failure wording must not assert "Not saved" (saveFlow.failedKeep) for failure
// shapes it cannot actually confirm never reached the server (a 5xx, or a network error
// with no response at all). Scoped to exactly what REVIEW.md asked for: ITR simulated
// 500 + no-response, nothing else. Does NOT re-run the full 144-check
// forms-consistency-review.mjs suite — that remains accepted from FORMS-CONSISTENCY-
// 2026-003 and is not reopened here.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.FORMS_CONSISTENCY_PASSWORD;
if (!PW) throw new Error('FORMS_CONSISTENCY_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.FORMS_CONSISTENCY_EVIDENCE_DIR || '/private/tmp/claude-501/forms-consistency-2026-004-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let totalChecks = 0;
let failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'fc_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

const EXPECTED_PREFIX = 'Could not confirm the save completed — what you entered is still kept here.';

async function openItrOpenRecord() {
    await page.goto(`${BASE}/itr`);
    await page.waitForTimeout(500);
    await page.locator('table tbody tr').filter({ hasText: 'FCMARK-ITR-OPEN' }).click();
    await page.waitForTimeout(500);
}

async function checkRecoveryAndClose(marker) {
    const modalStillOpen = await page.locator('h2').filter({ hasText: 'Edit ITR' }).count();
    assertTrue(modalStillOpen > 0, 'modal stays open after the failed save (not silently closed)');
    const remarkValue = await page.locator('textarea').first().inputValue();
    assertTrue(remarkValue === marker, `typed input is preserved after the failed save (expected "${marker}", got "${remarkValue}")`);

    const saveBtn = page.locator('button[class*="_primary_"]').first();
    const saveDisabled = await saveBtn.isDisabled();
    const saveText = (await saveBtn.innerText()).trim();
    assertTrue(saveDisabled === false, 'Save button is re-enabled (recovered), not stuck disabled');
    assertTrue(saveText === 'Save', `Save button text reverts to "Save" (got "${saveText}")`);
    const cancelBtn = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    assertTrue(await cancelBtn.isDisabled() === false, 'Cancel/Close button is re-enabled (recovered)');

    await cancelBtn.click();
    await page.waitForTimeout(400);
    const leaveVisible = await page.getByText('Unsaved Changes', { exact: false }).count();
    if (leaveVisible > 0) {
        await page.getByRole('button', { name: /^Leave$/ }).click();
        await page.waitForTimeout(400);
    }
}

// ═══════════════ Scenario A: simulated HTTP 500 ═══════════════
log('=== Scenario A: ITR save, simulated HTTP 500 (route.fulfill) ===');
await openItrOpenRecord();
{
    const marker = `itr-save-wording-500-${Date.now()}`;
    await page.locator('textarea').first().fill(marker);
    const RAW_DETAIL = 'Simulated 500 for FORMS-CONSISTENCY-2026-004 — this exact sentence must NEVER reach the toast';
    await page.route('**/api/itr/**', async (route) => {
        if (route.request().method() !== 'PUT') { await route.continue(); return; }
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: RAW_DETAIL }) });
    });
    const saveBtn = page.getByRole('button', { name: /^Save$/ });
    await saveBtn.click();
    await page.waitForTimeout(900);
    await page.unroute('**/api/itr/**');

    const EXPECTED_500_TEXT = `${EXPECTED_PREFIX} Server error (HTTP 500). Try again later or contact an administrator.`;
    const toastLocator = page.locator('[data-sonner-toast]').first();
    const toastCount = await toastLocator.count();
    const toastText = toastCount > 0 ? (await toastLocator.innerText()).trim() : '';
    await page.screenshot({ path: `${OUT}/a-500-after-failure.png` });

    assertTrue(toastCount > 0, 'A: a visible toast appears after the simulated 500');
    assertTrue(toastText === EXPECTED_500_TEXT, `A: toast text is EXACTLY the new ITR-specific wording (expected "${EXPECTED_500_TEXT}", got "${toastText}")`);
    assertTrue(!toastText.includes(RAW_DETAIL), 'A: toast does NOT contain the raw backend detail string');
    assertTrue(!toastText.toLowerCase().includes('not saved'), 'A: toast does NOT assert certain non-save ("Not saved")');

    await checkRecoveryAndClose(marker);
}

// ═══════════════ Scenario B: no response at all (network error) ═══════════════
log('=== Scenario B: ITR save, no response at all (route.abort — network error, error.response is undefined) ===');
await openItrOpenRecord();
{
    const marker = `itr-save-wording-noresp-${Date.now()}`;
    await page.locator('textarea').first().fill(marker);
    await page.route('**/api/itr/**', async (route) => {
        if (route.request().method() !== 'PUT') { await route.continue(); return; }
        await route.abort('failed');
    });
    const saveBtn = page.getByRole('button', { name: /^Save$/ });
    await saveBtn.click();
    await page.waitForTimeout(900);
    await page.unroute('**/api/itr/**');

    const EXPECTED_NETWORK_TEXT = `${EXPECTED_PREFIX} Network error. Check the connection and try again.`;
    const toastLocator = page.locator('[data-sonner-toast]').first();
    const toastCount = await toastLocator.count();
    const toastText = toastCount > 0 ? (await toastLocator.innerText()).trim() : '';
    await page.screenshot({ path: `${OUT}/b-noresponse-after-failure.png` });

    assertTrue(toastCount > 0, 'B: a visible toast appears after the simulated network failure');
    assertTrue(toastText === EXPECTED_NETWORK_TEXT, `B: toast text is EXACTLY the new ITR-specific wording for a no-response failure (expected "${EXPECTED_NETWORK_TEXT}", got "${toastText}")`);
    assertTrue(!toastText.toLowerCase().includes('not saved'), 'B: toast does NOT assert certain non-save ("Not saved") for a failure it cannot confirm reached the server');
    assertTrue(!/\{.*\}/.test(toastText) && !toastText.includes('AxiosError') && !toastText.includes('Traceback'), `B: toast does not leak a raw error object/stack (got "${toastText.slice(0, 160)}")`);

    await checkRecoveryAndClose(marker);
}

log(`===== FORMS-CONSISTENCY-2026-004 TARGETED REVIEW DONE — ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL =====`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
