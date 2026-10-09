// NOI-ITR-UX-2026-002: R1 (loading/error/empty real operation) + R2 (actual browser-back
// operation after the already-confirmed navigation defect). This is a REVIEW script, not a
// pass/fail assertion suite for a product fix — it records what actually happens, with
// screenshots, rather than asserting an expected outcome. `log()` lines ARE the evidence.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.NOI_ITR_UX_REVIEW_PASSWORD;
if (!PW) throw new Error('NOI_ITR_UX_REVIEW_PASSWORD not set — export the same value used for seeding before running this script.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.NOI_ITR_UX_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/noi-itr-ux-2026-002-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'noiitrux_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

const openNoi = async (ref) => {
    await page.goto(`${BASE}/noi`);
    await page.waitForTimeout(500);
    await page.locator('table tbody tr').filter({ hasText: ref }).click();
    await page.waitForTimeout(400);
    await page.getByRole('heading', { name: 'Related Documents' }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
};

// ═══════════════ R1a. LOADING — a real delayed /related response, captured mid-flight ═══════════════
log('=== R1a. SIMULATED loading state: delaying the real GET /api/noi/{id}/related response ===');
let releaseDelay;
const delayPromise = new Promise(r => { releaseDelay = r; });
await page.route('**/api/noi/*/related*', async (route) => {
    await delayPromise;
    await route.continue();
});
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-NIUP1-NOI-000003' }).click();
await page.waitForTimeout(300);
await page.getByRole('heading', { name: 'Related Documents' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(400); // the request is now genuinely pending, held by delayPromise
const loadingText = await page.getByRole('heading', { name: 'Related Documents' }).locator('xpath=following::*[1]').innerText().catch(() => '(could not read)');
await page.screenshot({ path: `${OUT}/r1a-loading-SIMULATED-delay.png` });
log(`R1a RESULT: while the request is held pending (SIMULATED delay, not a real slow network), the text immediately after the "Related Documents" heading reads: "${loadingText}"`);
releaseDelay();
await page.waitForTimeout(600);
await page.unroute('**/api/noi/*/related*');
const recoveredText = await page.locator('[data-testid]').count().catch(() => 0); // sanity touch, not asserted
await page.screenshot({ path: `${OUT}/r1a-after-delay-released-recovered.png` });
log('R1a RECOVERY: after releasing the delayed response (no interception active anymore), screenshot taken — see r1a-after-delay-released-recovered.png to confirm the real relation data is showing again, not stuck on the loading text.');

// ═══════════════ R1b. ERROR — a real simulated 500 on the /related request ═══════════════
log('=== R1b. SIMULATED error state: the real GET /api/noi/{id}/related fails with a 500 ===');
await page.route('**/api/noi/*/related*', async (route) => {
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated 500 for NOI-ITR-UX-2026-002 verification — NOT a real backend failure' }) });
});
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-NIUP1-NOI-000003' }).click();
await page.waitForTimeout(400);
await page.getByRole('heading', { name: 'Related Documents' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
const errorText = await page.getByRole('heading', { name: 'Related Documents' }).locator('xpath=following::*[1]').innerText().catch(() => '(could not read)');
await page.screenshot({ path: `${OUT}/r1b-error-SIMULATED-500.png` });
log(`R1b RESULT: with the request SIMULATED to fail (500, not a real backend rejection), the text immediately after "Related Documents" reads: "${errorText}"`);
await page.unroute('**/api/noi/*/related*');
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-NIUP1-NOI-000003' }).click();
await page.waitForTimeout(400);
await page.getByRole('heading', { name: 'Related Documents' }).scrollIntoViewIfNeeded();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/r1b-after-unroute-reopened-recovered.png` });
log('R1b RECOVERY: unrouted, then closed and reopened the same NOI (a real reload, not a code-level retry mechanism) — see r1b-after-unroute-reopened-recovered.png to confirm the real relation data shows correctly again.');

// ═══════════════ R1c. EMPTY — the genuinely no-ITR NOI, for direct visual comparison ═══════════════
log('=== R1c. REAL empty state (not simulated): QTS-NIUP1-NOI-000001 genuinely has no related ITR ===');
await openNoi('QTS-NIUP1-NOI-000001');
const emptyText = await page.getByRole('heading', { name: 'Related Documents' }).locator('xpath=following::*[1]').innerText().catch(() => '(could not read)');
await page.screenshot({ path: `${OUT}/r1c-empty-REAL-no-data.png` });
log(`R1c RESULT: with genuinely no related ITR (real data, not simulated), the text immediately after "Related Documents" reads: "${emptyText}"`);
log(`R1 COMPARISON: loading="${loadingText}" | error="${errorText}" | empty="${emptyText}" — recorded verbatim for the reviewer to judge distinguishability, not auto-asserted.`);

// ═══════════════ R2a. Browser-BACK after the already-confirmed navigation defect ═══════════════
log('=== R2a. click the related ITR (known defect: lands on the unfiltered /itr list), then press browser BACK ===');
await openNoi('QTS-NIUP1-NOI-000003');
await page.screenshot({ path: `${OUT}/r2a-01-noi-open-before-click.png` });
const relatedItrButtons = page.getByRole('heading', { name: 'Related Documents' }).locator('xpath=following::button[.//span[contains(text(),"ITR")]]');
const firstItrButtonText = await relatedItrButtons.first().innerText().catch(() => '(n/a)');
log(`R2a: clicking the first related ITR button (text: "${firstItrButtonText.replace(/\n/g, ' / ')}")`);
await relatedItrButtons.first().click();
await page.waitForURL(u => u.pathname === '/itr');
await page.waitForTimeout(500);
log(`R2a: landed on ${page.url()} (the known defect — unfiltered /itr list, not the specific record) — screenshot: r2a-02-after-click-on-itr-list.png`);
await page.screenshot({ path: `${OUT}/r2a-02-after-click-on-itr-list.png` });

log('=== R2a continued: press the REAL browser back button ===');
await page.goBack();
await page.waitForTimeout(700);
const urlAfterBack = page.url();
const modalOpenAfterBack = await page.locator('text=Edit NOI').count();
await page.screenshot({ path: `${OUT}/r2a-03-after-browser-back.png` });
log(`R2a RESULT (real observation, not inferred): after pressing browser back, the URL is "${urlAfterBack}"; an "Edit NOI" modal heading is ${modalOpenAfterBack > 0 ? 'PRESENT (' + modalOpenAfterBack + ' match(es)) — the modal DID reopen automatically' : 'ABSENT — the modal did NOT reopen automatically, only the underlying NOI list page is showing'}.`);
if (modalOpenAfterBack > 0) {
    const refNoVisible = await page.locator('input[value="QTS-NIUP1-NOI-000003"]').count();
    log(`R2a: the reopened modal's own Reference no. field ${refNoVisible > 0 ? 'DOES show QTS-NIUP1-NOI-000003 — it is genuinely the SAME record, not a blank/different one' : 'does NOT show QTS-NIUP1-NOI-000003 in the expected field — needs manual screenshot inspection, not assumed'}.`);
}

// ═══════════════ R2b. Manual round trip: find the target ITR in the list, open it, close it ═══════════════
log('=== R2b. manual path: from the /itr list, find QTS-NIUP1-ITR-000004 by hand, open it, close it — where do we land? ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-NIUP1-ITR-000004' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/r2b-01-manually-opened-target-itr.png` });
log('R2b: manually opened QTS-NIUP1-ITR-000004 directly from the ITR list.');
const itrCancelBtn = page.getByRole('button', { name: /^Cancel$/ });
if (await itrCancelBtn.count() > 0) {
    await itrCancelBtn.click();
    await page.waitForTimeout(500);
}
const urlAfterItrClose = page.url();
await page.screenshot({ path: `${OUT}/r2b-02-after-closing-manually-opened-itr.png` });
log(`R2b RESULT: after manually closing the ITR modal, the URL is "${urlAfterItrClose}" — this is the "user does the whole round trip by hand" baseline, for contrast against R2a's automatic-click path.`);

log('===== NOI-ITR-UX-2026-002 REVIEW SCRIPT DONE — see log lines above for every recorded observation =====');
await browser.close();
