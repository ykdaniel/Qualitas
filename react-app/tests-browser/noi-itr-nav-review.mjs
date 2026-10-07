// NOI-ITR-NAV-2026-001/002: verifies the ACTUAL fix — clicking a related ITR from NOI's
// Related Documents now opens that specific ITR record (not the bare unfiltered /itr list),
// for BOTH the original ITR and the re-inspection ITR, while every OTHER related-document
// type (NCR) keeps its original, unmodified navigation (no ?openId=, lands on the bare list).
// Also verifies the unsaved-changes leave-guard still fires on this navigation, and PROVES
// (not just observes) that a successful Save on the deep-linked ITR actually persisted, via
// the real PUT response plus an independent re-read — then records the real landing point.
// This is a pass/fail acceptance script — every check below is asserted, not just logged.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.NOI_ITR_UX_REVIEW_PASSWORD;
if (!PW) throw new Error('NOI_ITR_UX_REVIEW_PASSWORD not set — export the same value used for seeding before running this script.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.NOI_ITR_NAV_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/noi-itr-nav-2026-001-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let failures = 0;
const assertTrue = (cond, msg) => {
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

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
    await page.waitForTimeout(300);
};
const relatedButtonsFor = (badgeText) => page.getByRole('heading', { name: 'Related Documents' })
    .locator(`xpath=following::button[.//span[contains(text(),"${badgeText}")]]`);

// ═══════════════ AC1a. Click the ORIGINAL ITR from NOI's Related Documents ═══════════════
log('=== AC1a. REINSPECTION-scenario NOI: click the ORIGINAL ITR (QTS-NIUP1-ITR-000003) ===');
await openNoi('QTS-NIUP1-NOI-000003');
const relatedButtons = relatedButtonsFor('ITR');
const count = await relatedButtons.count();
log(`AC1a: found ${count} related ITR button(s) under this NOI.`);
let originalBtnIndex = -1;
let reinspBtnIndex = -1;
for (let i = 0; i < count; i++) {
    const text = await relatedButtons.nth(i).innerText();
    if (text.includes('000003')) originalBtnIndex = i;
    if (text.includes('000004')) reinspBtnIndex = i;
}
assertTrue(originalBtnIndex >= 0 && reinspBtnIndex >= 0, `both the original (000003) and re-inspection (000004) ITR buttons are present and distinguishable (original idx=${originalBtnIndex}, reinsp idx=${reinspBtnIndex})`);

await relatedButtons.nth(originalBtnIndex).click();
await page.waitForURL(u => u.pathname === '/itr');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/ac1a-01-after-click-original-itr.png` });
const urlAfterOriginalClick = page.url();
assertTrue(urlAfterOriginalClick.includes('openId') === false, `URL "${urlAfterOriginalClick}" has had its ?openId= stripped by ITR.tsx's consumption effect (confirms the deep-link path, not a stale URL)`);
const originalModalRefField = await page.locator('input[value="QTS-NIUP1-ITR-000003"]').count();
assertTrue(originalModalRefField > 0, 'the opened modal shows reference no. QTS-NIUP1-ITR-000003 (the ORIGINAL ITR, matching the clicked target) — not just "landed on /itr"');
const wrongRecordOpenAfterOriginalClick = await page.locator('input[value="QTS-NIUP1-ITR-000004"]').count();
assertTrue(wrongRecordOpenAfterOriginalClick === 0, 'the re-inspection ITR (000004) is NOT what opened when the ORIGINAL (000003) was clicked');

// Close via Cancel, should land back via navigate(-1) (existing ITR.tsx deep-link onClose).
const cancelBtn1 = page.getByRole('button', { name: /^Cancel$/ });
await cancelBtn1.click();
await page.waitForTimeout(600);
const urlAfterCloseOriginal = page.url();
await page.screenshot({ path: `${OUT}/ac1a-02-after-close-original-itr.png` });
log(`AC1a: after closing the deep-linked ORIGINAL ITR via Cancel, landed at "${urlAfterCloseOriginal}" (existing navigate(-1) mechanism, not newly built).`);
assertTrue(urlAfterCloseOriginal.includes('/noi'), `closing the deep-linked original ITR returns to /noi (real URL: "${urlAfterCloseOriginal}") via the existing navigate(-1) onClose path`);

// ═══════════════ AC1b. Click the RE-INSPECTION ITR from NOI's Related Documents ═══════════════
log('=== AC1b. Same NOI: click the RE-INSPECTION ITR (QTS-NIUP1-ITR-000004) ===');
await openNoi('QTS-NIUP1-NOI-000003');
const relatedButtons2 = relatedButtonsFor('ITR');
const count2 = await relatedButtons2.count();
let reinspIdx2 = -1;
for (let i = 0; i < count2; i++) {
    const text = await relatedButtons2.nth(i).innerText();
    if (text.includes('000004')) reinspIdx2 = i;
}
assertTrue(reinspIdx2 >= 0, 'the re-inspection ITR button is findable on a fresh open of the same NOI');
await relatedButtons2.nth(reinspIdx2).click();
await page.waitForURL(u => u.pathname === '/itr');
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/ac1b-01-after-click-reinsp-itr.png` });
const reinspModalRefField = await page.locator('input[value="QTS-NIUP1-ITR-000004"]').count();
assertTrue(reinspModalRefField > 0, 'the opened modal shows reference no. QTS-NIUP1-ITR-000004 (the RE-INSPECTION ITR, matching the clicked target)');
const wrongRecordOpenAfterReinspClick = await page.locator('input[value="QTS-NIUP1-ITR-000003"]').count();
assertTrue(wrongRecordOpenAfterReinspClick === 0, 'the original ITR (000003) is NOT what opened when the RE-INSPECTION (000004) was clicked — the two are genuinely distinguished, not always opening the first match');

// Close this one too, so the next step starts from a clean /noi.
const cancelBtn1b = page.getByRole('button', { name: /^Cancel$/ });
await cancelBtn1b.click();
await page.waitForTimeout(600);

// ═══════════════ R1. A NON-ITR related document (NCR) must keep its ORIGINAL navigation ═══════════════
log('=== R1. same NOI: click the related NCR (QTS-NIUP1-NCR-000001) — must behave EXACTLY as before this fix (no openId, bare /ncr list) ===');
await openNoi('QTS-NIUP1-NOI-000003');
const relatedNcrButtons = relatedButtonsFor('NCR');
const ncrCount = await relatedNcrButtons.count();
assertTrue(ncrCount > 0, `the seeded NCR relation (QTS-NIUP1-NCR-000001) is listed under this NOI's Related Documents (found ${ncrCount} NCR button(s)) — this is existing seed data, not newly added for this round`);
await relatedNcrButtons.first().click();
await page.waitForURL(u => u.pathname === '/ncr');
await page.waitForTimeout(600);
const urlAfterNcrClick = page.url();
await page.screenshot({ path: `${OUT}/r1-01-after-click-ncr-unchanged.png` });
assertTrue(urlAfterNcrClick === `${BASE}/ncr`, `clicking the related NCR lands on the bare unfiltered /ncr list with NO query string at all (real URL: "${urlAfterNcrClick}") — unchanged from the pre-fix behavior, confirming R1's entityType==='itr' restriction took effect`);
const ncrModalOpen = await page.getByRole('heading', { name: /NCR/i }).count().catch(() => 0);
log(`R1: after clicking the related NCR, an NCR-titled heading is ${ncrModalOpen > 0 ? 'present (expected IF the list page itself has such a heading, not a deep-linked record modal)' : 'absent'} — the key assertion is the bare URL above, not this.`);

// ═══════════════ AC3. Browser-BACK landing point from a deep-linked ITR (no close click) ═══════════════
log('=== AC3. open the re-inspection ITR again via deep link, then press real browser BACK (no Cancel click) ===');
await openNoi('QTS-NIUP1-NOI-000003');
const relatedButtonsAc3 = relatedButtonsFor('ITR');
const countAc3 = await relatedButtonsAc3.count();
let reinspIdxAc3 = -1;
for (let i = 0; i < countAc3; i++) {
    const text = await relatedButtonsAc3.nth(i).innerText();
    if (text.includes('000004')) reinspIdxAc3 = i;
}
await relatedButtonsAc3.nth(reinspIdxAc3).click();
await page.waitForURL(u => u.pathname === '/itr');
await page.waitForTimeout(600);
await page.goBack();
await page.waitForTimeout(700);
const urlAfterBrowserBack = page.url();
const noiModalAfterBack = await page.getByRole('heading', { name: 'Edit NOI' }).count().catch(() => 0);
await page.screenshot({ path: `${OUT}/ac3-01-after-browser-back-from-reinsp-itr.png` });
log(`AC3 RESULT (real observation): browser back from the deep-linked ITR lands at "${urlAfterBrowserBack}"; "Edit NOI" heading present: ${noiModalAfterBack > 0}.`);
assertTrue(urlAfterBrowserBack.includes('/noi'), `browser back from the deep-linked ITR returns to /noi (real URL: "${urlAfterBrowserBack}")`);

// ═══════════════ AC2. Unsaved-changes leave guard still fires on this new navigation ═══════════════
log('=== AC2. dirty NOI form: clicking a related ITR must trigger the existing unsaved-changes guard ===');
await openNoi('QTS-NIUP1-NOI-000003');
const remarkField = page.locator('textarea').first();
const uniqueMarker = `nav-test-dirty-${Date.now()}`;
await remarkField.fill(uniqueMarker);
await page.waitForTimeout(300);
const relatedButtons3 = relatedButtonsFor('ITR');
await relatedButtons3.first().click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/ac2-01-unsaved-changes-prompt.png` });
const unsavedPromptVisible = await page.getByText('Unsaved Changes', { exact: false }).count();
const stillOnNoiUrl = page.url();
assertTrue(unsavedPromptVisible > 0, `the existing unsaved-changes confirmation appears when clicking a related ITR with a dirty NOI form (URL still "${stillOnNoiUrl}")`);
assertTrue(stillOnNoiUrl.includes('/noi') && !stillOnNoiUrl.includes('/itr'), `navigation is actually BLOCKED pending confirmation — still on NOI, not already redirected to /itr (URL: "${stillOnNoiUrl}")`);

// Cancel the leave (Stay) — must remain on this NOI with the typed remark preserved.
const stayBtn = page.getByRole('button', { name: /Stay/i });
await stayBtn.click();
await page.waitForTimeout(400);
const remarkValueAfterStay = await remarkField.inputValue();
await page.screenshot({ path: `${OUT}/ac2-02-after-stay-input-preserved.png` });
assertTrue(remarkValueAfterStay === uniqueMarker, `after choosing to Stay, the typed remark is preserved (expected "${uniqueMarker}", got "${remarkValueAfterStay}")`);
const urlAfterStay = page.url();
assertTrue(!urlAfterStay.includes('/itr'), `after Stay, still NOT navigated to /itr (URL: "${urlAfterStay}")`);

// Clean up this dirty state without saving (Cancel the NOI form itself), confirming via the guard, so the next step starts clean.
const noiCancelBtn = page.getByRole('button', { name: /^Cancel$/ });
await noiCancelBtn.click();
await page.waitForTimeout(400);
const leavePromptVisible = await page.getByText('Unsaved Changes', { exact: false }).count();
if (leavePromptVisible > 0) {
    const leaveBtn = page.getByRole('button', { name: /^Leave$/ });
    await leaveBtn.click();
    await page.waitForTimeout(400);
}

// ═══════════════ R2. PROVE a successful Save on a deep-linked ITR actually persisted ═══════════════
log('=== R2. open the ONE-ITR scenario\'s ITR via deep link, Save a real value, prove persistence via PUT response + independent re-read ===');
await openNoi('QTS-NIUP1-NOI-000002');
const oneItrButtons = relatedButtonsFor('ITR');
await oneItrButtons.first().click();
await page.waitForURL(u => u.pathname === '/itr');
await page.waitForTimeout(600);
const itrRefBeforeSave = await page.locator('input[value="QTS-NIUP1-ITR-000002"]').count();
assertTrue(itrRefBeforeSave > 0, 'the ONE-ITR scenario (QTS-NIUP1-NOI-000002) deep-links correctly to QTS-NIUP1-ITR-000002, confirming the fix generalizes beyond the re-inspection scenario');

const itrMarker = `nav-save-proof-${Date.now()}`;
const itrRemarkField = page.locator('textarea').first();
await itrRemarkField.fill(itrMarker);
const filledValue = await itrRemarkField.inputValue();
assertTrue(filledValue === itrMarker, `the remark field was actually filled with the test marker before Save (got "${filledValue}") — a fill() failure here would previously be silently swallowed; it is now asserted, not caught`);

const saveBtn = page.getByRole('button', { name: /^Save$/ });
const saveBtnCount = await saveBtn.count();
assertTrue(saveBtnCount > 0, `a Save button is present on this ITR (count=${saveBtnCount}) — if absent (e.g. locked/read-only), the save-proof steps below cannot run and this is a real finding, not something to skip past silently`);

let putResponseBody = null;
let putResponseOk = false;
if (saveBtnCount > 0) {
    const [putResponse] = await Promise.all([
        page.waitForResponse(resp => resp.url().includes('/api/itr/') && resp.request().method() === 'PUT', { timeout: 10000 }),
        saveBtn.click(),
    ]);
    putResponseOk = putResponse.ok();
    assertTrue(putResponseOk, `the PUT request to "${putResponse.url()}" for this ITR save actually succeeded (HTTP ${putResponse.status()}) — not inferred from a fixed wait, read directly from the network response`);
    putResponseBody = await putResponse.json().catch(() => null);
    assertTrue(!!putResponseBody && putResponseBody.id === 'niu-itr-2', `the PUT response body has the expected id "niu-itr-2" (got: ${JSON.stringify(putResponseBody?.id)})`);
    assertTrue(!!putResponseBody && putResponseBody.remark === itrMarker, `the PUT response body's own "remark" field already reflects the saved value (expected "${itrMarker}", got "${JSON.stringify(putResponseBody?.remark)}") — proves the backend echoed back what it actually persisted, not just an optimistic client-side assumption`);
    await page.waitForTimeout(500);
}

const urlAfterSave = page.url();
const modalStillOpenAfterSave = await page.locator('input[value="QTS-NIUP1-ITR-000002"]').count();
await page.screenshot({ path: `${OUT}/r2-01-after-save-deep-linked-itr.png` });
log(`R2: after the Save click, the modal is ${modalStillOpenAfterSave > 0 ? 'STILL open' : 'closed'}; the exact URL is "${urlAfterSave}" — recorded as a real observation, not assumed.`);
assertTrue(modalStillOpenAfterSave === 0, 'the ITR modal actually closed after a successful save (not left open)');
// Root-caused via a one-off instrumented run (frame-navigation timestamps) before writing this
// assertion: ITRModals.tsx's own handleSave calls onClose() right after onSave() resolves
// (see ITRModals.tsx:478-480) — that onClose is the SAME prop wired to ITR.tsx's existing
// openedViaDeepLinkRef -> navigate(-1) check. So a successful save on a deep-linked ITR goes
// through the EXACT SAME existing return path as a plain Cancel, not a separate mechanism.
assertTrue(urlAfterSave.endsWith('/noi'), `after a successful save, the existing navigate(-1) mechanism (triggered by ITRModals.tsx's handleSave calling onClose() post-save) returns to /noi — real URL: "${urlAfterSave}"`);

// Independent re-read: reload the ITR list fresh and reopen the SAME record by its reference
// number (not by reusing any in-memory state from the save above) to prove the value was
// actually persisted server-side, not just reflected optimistically in the UI that just saved it.
log('=== R2 (continued): independent re-read — fresh page load, reopen QTS-NIUP1-ITR-000002 by its reference number, confirm the saved remark is still there ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(600);
await page.locator('table tbody tr').filter({ hasText: 'QTS-NIUP1-ITR-000002' }).click();
await page.waitForTimeout(600);
const rereadRemarkValue = await page.locator('textarea').first().inputValue();
await page.screenshot({ path: `${OUT}/r2-02-independent-reread-after-reload.png` });
assertTrue(rereadRemarkValue === itrMarker, `after a fresh page load and manually reopening the SAME record (not reusing the just-saved UI state), the remark field shows the persisted value (expected "${itrMarker}", got "${rereadRemarkValue}") — this is the actual persistence proof, independent of the PUT response`);
const rereadCancelBtn = page.getByRole('button', { name: /^Cancel$/ });
if (await rereadCancelBtn.count() > 0) {
    await rereadCancelBtn.click();
    await page.waitForTimeout(400);
}

log(`===== NOI-ITR-NAV-2026-002 REVIEW SCRIPT DONE — ${failures === 0 ? 'ALL ASSERTIONS PASSED' : `${failures} ASSERTION(S) FAILED`} =====`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
