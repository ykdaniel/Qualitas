// FORMS-CONSISTENCY-2026-004: targeted verification for the SINGLE R1 fix — ITR's own
// save-failure wording must not assert "Not saved" (saveFlow.failedKeep) for failure
// shapes it cannot actually confirm never reached the server (a 5xx, or a network error
// with no response at all). Scoped to exactly what REVIEW.md asked for: ITR simulated
// 500 + no-response, nothing else. Does NOT re-run the full 144-check
// forms-consistency-review.mjs suite — that remains accepted from FORMS-CONSISTENCY-
// 2026-003 and is not reopened here.
// REFUSAL-DIALOG-2026-003: the wording now lives in the shared refusal dialog (title / message / note),
// not in a sonner toast; the intent (never claim "Not saved" for an unconfirmed failure) is unchanged.
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

// REFUSAL-DIALOG-2026-003: a failed save no longer shows a sonner toast; it opens the shared refusal
// dialog (react-app/src/components/Shared/RefusalDialog.tsx). Reads its parts; null if it never shows.
async function readRefusalDialog(p, timeout = 5000) {
    const dlg = p.locator('[data-testid="refusal-dialog"]');
    try { await dlg.waitFor({ state: 'visible', timeout }); } catch { return null; }
    return dlg.evaluate((el) => {
        const text = (n) => (n ? (n.textContent || '').trim() : '');
        const msg = el.querySelector('#refusal-dialog-message');
        const body = msg ? msg.parentElement : null;
        const paras = body ? Array.from(body.querySelectorAll(':scope > p')) : [];
        const original = paras.find((n) => n.getAttribute('lang') === 'en');
        const note = paras.find((n) => n !== msg && n !== original && /note/i.test(n.className));
        return {
            title: text(el.querySelector('#refusal-dialog-title')),
            message: text(msg),
            items: body ? Array.from(body.querySelectorAll('li')).map(text) : [],
            original: original ? text(original) : null,
            note: note ? text(note) : null,
            all: text(el),
        };
    });
}
// REFUSAL-DIALOG-2026-003: the dialog only closes on OK / × / Esc — close it so later steps are not blocked.
async function closeRefusalDialog(p) {
    const dlg = p.locator('[data-testid="refusal-dialog"]');
    if (await dlg.count() === 0) return;
    await dlg.getByRole('button', { name: 'OK', exact: true }).click();
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

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

// REFUSAL-DIALOG-2026-003: the failure now opens the shared refusal dialog (no sonner toast). A 5xx or
// a no-response failure cannot be confirmed as "not saved": the title is "Save failed" and the note
// (the form stays open, keepsInput) is the UNCONFIRMED kept-input line — never "Not saved".
const EXPECTED_TITLE = 'Save failed';
const EXPECTED_NOTE = 'Could not confirm whether it was saved. What you entered is still here; reload the list to check before trying again.';

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

    // REFUSAL-DIALOG-2026-003: refusal dialog instead of the old ITR-specific toast wording
    const EXPECTED_500_TEXT = 'The server ran into a problem (HTTP 500). Try again later; if it keeps happening, contact an administrator.';
    const dialog = await readRefusalDialog(page);
    const dialogText = dialog?.all ?? '';
    await page.screenshot({ path: `${OUT}/a-500-after-failure.png` });

    assertTrue(dialog !== null, 'A: the refusal dialog appears after the simulated 500');
    assertTrue(dialog?.title === EXPECTED_TITLE, `A: dialog title is EXACTLY "${EXPECTED_TITLE}" (got "${dialog?.title}")`);
    assertTrue(dialog?.message === EXPECTED_500_TEXT, `A: dialog message is EXACTLY the 5xx wording (expected "${EXPECTED_500_TEXT}", got "${dialog?.message}")`);
    assertTrue(dialog?.note === EXPECTED_NOTE, `A: dialog note is the unconfirmed kept-input line (expected "${EXPECTED_NOTE}", got "${dialog?.note}")`);
    assertTrue(!dialogText.includes(RAW_DETAIL), 'A: dialog does NOT contain the raw backend detail string');
    assertTrue(!dialogText.toLowerCase().includes('not saved'), 'A: dialog does NOT assert certain non-save ("Not saved")');
    const errorToastsA = await page.locator('[data-sonner-toast][data-type="error"]').count();
    assertTrue(errorToastsA === 0, `A: no sonner error toast is shown (got ${errorToastsA})`);
    await closeRefusalDialog(page);

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

    // REFUSAL-DIALOG-2026-003: refusal dialog instead of the old ITR-specific toast wording
    const EXPECTED_NETWORK_TEXT = 'Could not reach the server. Check the connection and try again.';
    const dialog = await readRefusalDialog(page);
    const dialogText = dialog?.all ?? '';
    await page.screenshot({ path: `${OUT}/b-noresponse-after-failure.png` });

    assertTrue(dialog !== null, 'B: the refusal dialog appears after the simulated network failure');
    assertTrue(dialog?.title === EXPECTED_TITLE, `B: dialog title is EXACTLY "${EXPECTED_TITLE}" (got "${dialog?.title}")`);
    assertTrue(dialog?.message === EXPECTED_NETWORK_TEXT, `B: dialog message is EXACTLY the no-response wording (expected "${EXPECTED_NETWORK_TEXT}", got "${dialog?.message}")`);
    assertTrue(dialog?.note === EXPECTED_NOTE, `B: dialog note is the unconfirmed kept-input line (expected "${EXPECTED_NOTE}", got "${dialog?.note}")`);
    assertTrue(!dialogText.toLowerCase().includes('not saved'), 'B: dialog does NOT assert certain non-save ("Not saved") for a failure it cannot confirm reached the server');
    assertTrue(!/\{.*\}/.test(dialogText) && !dialogText.includes('AxiosError') && !dialogText.includes('Traceback'), `B: dialog does not leak a raw error object/stack (got "${dialogText.slice(0, 160)}")`);
    const errorToastsB = await page.locator('[data-sonner-toast][data-type="error"]').count();
    assertTrue(errorToastsB === 0, `B: no sonner error toast is shown (got ${errorToastsB})`);
    await closeRefusalDialog(page);

    await checkRecoveryAndClose(marker);
}

log(`===== FORMS-CONSISTENCY-2026-004 TARGETED REVIEW DONE — ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL =====`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
