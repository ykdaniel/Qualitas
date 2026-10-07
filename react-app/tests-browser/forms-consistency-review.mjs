// FORMS-CONSISTENCY-2026-003: R1/R2 fixes on top of the FORMS-CONSISTENCY-2026-002
// rewrite, per independent REVIEW.md REQUIRED_FIXES. R1: ITR's save-failure path now
// goes through the same describeSaveError/saveFlow.failedKeep utility NOI/NCR already
// used, so a 5xx never shows the raw backend detail text — tested with an exact string
// comparison, not a loose "looks readable" heuristic. R2: deep-link identity is now
// confirmed by reading the modal's own Subject field value (findFieldWithValue), never
// by searching the whole page's text (which can also match a list row still sitting in
// the DOM behind the modal overlay); save-success waits are pinned to the exact record
// id, not just "any PUT to this module". Every check that matters is a real assertTrue()
// that can fail, not a log line; pass/fail counts are accumulated at runtime (see
// totalChecks/failures), never a static count of assertTrue( call sites.
//
// Row lookups key off a unique marker embedded in each seeded record's subject/package
// text, not the reference number — a real save through the normal update endpoint can
// renumber referenceNo (document-naming-rule regeneration keyed on the contractor
// abbreviation), which breaks reference-number-based lookups. The seed's NOI referenceNo
// now itself matches the auto-generated format, so this no longer actually fires in this
// script, but marker-based lookup stays as the robust default regardless.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.FORMS_CONSISTENCY_PASSWORD;
if (!PW) throw new Error('FORMS_CONSISTENCY_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const KNOWN_SOURCE = `${BASE}/`;
const OUT = process.env.FORMS_CONSISTENCY_EVIDENCE_DIR || '/private/tmp/claude-501/forms-consistency-2026-003-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

// Dynamic, runtime-accumulated counters — the ONLY numbers this script reports as
// "executed". Never summarized as a static count of source-code assertTrue( occurrences.
let totalChecks = 0;
let failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();

async function loginOnPage(page, username) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.goto(`${BASE}/login`);
    await page.fill('#email', username);
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.includes('/login'));
}

const MODULES = [
    { key: 'noi', path: '/noi', openMarker: 'FCMARK-NOI-OPEN', openId: 'fc-noi-open',
      lockedMarker: 'FCMARK-NOI-LOCKED', lockedId: 'fc-noi-closed', lockedLabel: 'Closed',
      editTitleFrag: 'Edit NOI', viewTitleExact: 'View NOI', addTitleExact: 'Add NOI',
      lockedCloseTextExact: 'Cancel', addNewButtonText: 'Add New NOI' },
    { key: 'itr', path: '/itr', openMarker: 'FCMARK-ITR-OPEN', openId: 'fc-itr-open',
      lockedMarker: 'FCMARK-ITR-LOCKED', lockedId: 'fc-itr-approved', lockedLabel: 'Approved',
      editTitleFrag: 'Edit ITR', viewTitleExact: 'View ITR', addTitleExact: 'Add ITR',
      lockedCloseTextExact: 'Close', addNewButtonText: 'Add New ITR' },
    { key: 'ncr', path: '/ncr', openMarker: 'FCMARK-NCR-OPEN', openId: 'fc-ncr-open',
      lockedMarker: 'FCMARK-NCR-LOCKED', lockedId: 'fc-ncr-closed', lockedLabel: 'Closed',
      editTitleFrag: 'Edit NCR', viewTitleExact: 'NCR Details', addTitleExact: 'Add NCR',
      lockedCloseTextExact: 'Cancel', addNewButtonText: 'Add New NCR' },
];

// NOI and ITR put their remark textarea on the single-page form (visible immediately).
// NCR is tabbed and defaults to "Identification", which has no textarea — the long-text
// "Description" field lives under "Description & Traceability".
const getRemarkField = async (p, mod) => {
    if (mod.key === 'ncr') {
        await p.locator('button').filter({ hasText: 'Description & Traceability' }).click();
        await p.waitForTimeout(200);
    }
    return p.locator('textarea').first();
};

// Finds the form field (input/textarea) whose CURRENT value contains `marker`, scanning
// only real form fields — never raw page text. Used both to confirm "the correct record's
// modal actually opened" (reading an actual modal field beats searching all page text,
// which can also match a list row sitting in the DOM underneath the modal overlay) and to
// check a field's disabled state. CSS `[value=...]` only matches the static `value`
// ATTRIBUTE; NOI/ITR happen to bind inputs via a fully-controlled `value={formData.x}`
// prop (which React reflects as the DOM attribute), but NCR's Subject field is wired
// through react-hook-form's `register()` — an uncontrolled input whose current text lives
// only in the live DOM property, never the attribute. `inputValue()` reads that live
// property correctly on both kinds of input, so every caller goes through this helper
// instead of a CSS attribute selector.
const findFieldWithValue = async (p, marker) => {
    const candidates = p.locator('input[type="text"], textarea');
    const count = await candidates.count();
    for (let i = 0; i < count; i++) {
        const el = candidates.nth(i);
        const val = await el.inputValue().catch(() => '');
        if (val.includes(marker)) return el;
    }
    return null;
};

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);
await loginOnPage(page, 'fc_full');

const openRecord = async (mod, marker) => {
    await page.goto(`${BASE}${mod.path}`);
    await page.waitForTimeout(500);
    await page.locator('table tbody tr').filter({ hasText: marker }).click();
    await page.waitForTimeout(500);
};

// ═══════════════ Part A: fc_full — editable OPEN record per module ═══════════════
log('=== Part A: fc_full on OPEN (editable) records — button position/size/color/naming ===');
const buttonGeometry = {};
for (const mod of MODULES) {
    await openRecord(mod, mod.openMarker);
    const cancelBtn = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    const saveBtn = page.getByRole('button', { name: /^Save$/ });
    assertTrue(await cancelBtn.count() > 0, `[${mod.key}] a Cancel/Close button is present on the editable OPEN record`);
    assertTrue(await saveBtn.count() > 0, `[${mod.key}] a Save button is present on the editable OPEN record`);
    const cancelBox = await cancelBtn.boundingBox();
    const saveBox = await saveBtn.boundingBox();
    const cancelStyle = await cancelBtn.evaluate(el => { const c = getComputedStyle(el); return { height: c.height, fontSize: c.fontSize, borderRadius: c.borderRadius, bg: c.backgroundColor, color: c.color }; });
    const saveStyle = await saveBtn.evaluate(el => { const c = getComputedStyle(el); return { height: c.height, fontSize: c.fontSize, borderRadius: c.borderRadius, bg: c.backgroundColor, color: c.color }; });
    buttonGeometry[mod.key] = { cancelBox, saveBox, cancelStyle, saveStyle, cancelText: (await cancelBtn.innerText()).trim() };
    assertTrue(saveBox.y > cancelBox.y - 5 && Math.abs(saveBox.y - cancelBox.y) < 5, `[${mod.key}] Save and Cancel sit on the same row (y: save=${saveBox.y}, cancel=${cancelBox.y})`);
    assertTrue(saveBox.x > cancelBox.x, `[${mod.key}] Save is positioned to the right of Cancel (save.x=${saveBox.x}, cancel.x=${cancelBox.x})`);
    await cancelBtn.click();
    await page.waitForTimeout(400);
}
await page.screenshot({ path: `${OUT}/a0-overview.png` });

// Cross-module comparison — Save AND Cancel (the previous round only compared Save).
const [noiG, itrG, ncrG] = [buttonGeometry.noi, buttonGeometry.itr, buttonGeometry.ncr];
for (const dim of ['height', 'fontSize', 'borderRadius']) {
    assertTrue(noiG.saveStyle[dim] === itrG.saveStyle[dim] && itrG.saveStyle[dim] === ncrG.saveStyle[dim],
        `AC1: Save button ${dim} identical across NOI/ITR/NCR (noi=${noiG.saveStyle[dim]}, itr=${itrG.saveStyle[dim]}, ncr=${ncrG.saveStyle[dim]})`);
    assertTrue(noiG.cancelStyle[dim] === itrG.cancelStyle[dim] && itrG.cancelStyle[dim] === ncrG.cancelStyle[dim],
        `AC1: Cancel button ${dim} identical across NOI/ITR/NCR (noi=${noiG.cancelStyle[dim]}, itr=${itrG.cancelStyle[dim]}, ncr=${ncrG.cancelStyle[dim]})`);
}
assertTrue(noiG.saveStyle.bg === itrG.saveStyle.bg && itrG.saveStyle.bg === ncrG.saveStyle.bg,
    `AC1: Save button background color identical across NOI/ITR/NCR (noi=${noiG.saveStyle.bg}, itr=${itrG.saveStyle.bg}, ncr=${ncrG.saveStyle.bg})`);
assertTrue(noiG.cancelStyle.bg === itrG.cancelStyle.bg && itrG.cancelStyle.bg === ncrG.cancelStyle.bg,
    `AC1: Cancel button background color identical across NOI/ITR/NCR (noi=${noiG.cancelStyle.bg}, itr=${itrG.cancelStyle.bg}, ncr=${ncrG.cancelStyle.bg})`);
assertTrue(noiG.cancelStyle.color === itrG.cancelStyle.color && itrG.cancelStyle.color === ncrG.cancelStyle.color,
    `AC1: Cancel button text color identical across NOI/ITR/NCR (noi=${noiG.cancelStyle.color}, itr=${itrG.cancelStyle.color}, ncr=${ncrG.cancelStyle.color})`);
log(`AC1 Cancel/Close TEXT on an EDITABLE record: noi="${noiG.cancelText}" itr="${itrG.cancelText}" ncr="${ncrG.cancelText}"`);

// ═══════════════ Part A2: new-record open/cancel (minimal, no data created) ═══════════════
log('=== Part A2: new-record open + cancel per module — no data filled, no data saved ===');
for (const mod of MODULES) {
    // Network-level observation, not just "the modal closed" — counts any POST to this
    // module's own create endpoint for the whole open+cancel sequence below.
    let createPostCount = 0;
    const countCreatePosts = (req) => {
        if (req.method() === 'POST' && req.url().includes(`/api/${mod.key}/`)) createPostCount++;
    };
    page.on('request', countCreatePosts);

    await page.goto(`${BASE}${mod.path}`);
    await page.waitForTimeout(500);
    const addBtn = page.locator('button').filter({ hasText: mod.addNewButtonText });
    assertTrue(await addBtn.count() > 0, `[${mod.key}] "${mod.addNewButtonText}" button is present on the list page`);
    await addBtn.click();
    await page.waitForTimeout(500);
    const heading = (await page.locator('h2').first().innerText()).trim();
    assertTrue(heading === mod.addTitleExact, `[${mod.key}] new-record modal heading is exactly "${mod.addTitleExact}" (got "${heading}")`);
    const cancelBtn = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    await cancelBtn.click();
    await page.waitForTimeout(400);
    const unsavedPromptOnBlankNew = await page.getByText('Unsaved Changes', { exact: false }).count();
    assertTrue(unsavedPromptOnBlankNew === 0, `[${mod.key}] cancelling a completely blank new-record form does NOT falsely trigger the unsaved-changes prompt`);
    const modalStillThere = await page.locator('h2').filter({ hasText: mod.addTitleExact }).count();
    assertTrue(modalStillThere === 0, `[${mod.key}] the new-record modal actually closed after Cancel`);

    page.off('request', countCreatePosts);
    // Network-level evidence for "no data created" — not inferred from the modal having
    // closed. Does not itself prove the DB has no new row (that would need a DB read,
    // out of this round's scope); it narrows the claim to "no create request was even
    // sent", which is what "cancel without saving" is actually supposed to guarantee.
    assertTrue(createPostCount === 0, `[${mod.key}] cancelling the blank new-record form sent ZERO POST requests to the create endpoint (observed ${createPostCount})`);
}

// ═══════════════ Part B: fc_full — LOCKED record per module (readonly even for a "full" account) ═══════════════
log('=== Part B: fc_full on LOCKED records — EXACT heading and Cancel/Close text assertions ===');
for (const mod of MODULES) {
    await openRecord(mod, mod.lockedMarker);
    await page.screenshot({ path: `${OUT}/b-${mod.key}-locked.png` });

    const saveBtnCount = await page.getByRole('button', { name: /^Save$/ }).count();
    assertTrue(saveBtnCount === 0, `[${mod.key}] LOCKED record (${mod.lockedLabel}): no Save button rendered at all — count=${saveBtnCount}`);

    const heading = (await page.locator('h2').first().innerText()).trim();
    assertTrue(heading === mod.viewTitleExact, `[${mod.key}] LOCKED record heading is EXACTLY "${mod.viewTitleExact}" (got "${heading}")`);

    const cancelCloseBtn = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    const cancelCloseText = (await cancelCloseBtn.innerText()).trim();
    assertTrue(cancelCloseText === mod.lockedCloseTextExact, `[${mod.key}] LOCKED record's close button text is EXACTLY "${mod.lockedCloseTextExact}" (got "${cancelCloseText}")`);

    await cancelCloseBtn.click();
    await page.waitForTimeout(400);
}

// ═══════════════ Part C: fc_full — pending state (explicit asserts) + real save-success proof ═══════════════
log('=== Part C: fc_full — pending state explicit assertions, then real PUT success + independent re-read ===');
for (const mod of MODULES) {
    await openRecord(mod, mod.openMarker);
    const remarkField = await getRemarkField(page, mod);
    const pendingMarker = `forms-consistency-pending-${mod.key}-${Date.now()}`;
    await remarkField.fill(pendingMarker);

    let releaseDelay;
    const delayPromise = new Promise(r => { releaseDelay = r; });
    await page.route(`**/api/${mod.key}/**`, async (route) => {
        if (route.request().method() !== 'PUT') { await route.continue(); return; }
        await delayPromise;
        await route.continue();
    });
    // Pinned to this exact record's id, not just "any PUT to this module" — avoids ever
    // resolving on a different record's save that happens to be in flight.
    const responsePromise = page.waitForResponse(r => r.url().includes(`/api/${mod.key}/${mod.openId}`) && r.request().method() === 'PUT');

    const saveBtnByName = page.getByRole('button', { name: /^Save$/ });
    await saveBtnByName.click();
    await page.waitForTimeout(500); // request now genuinely pending

    // Text-independent selector: a role/name lookup for "Save" would report "0 matches"
    // the instant the label actually changes to "Saving..." — that is the behaviour under
    // test, not an absence of the button.
    const saveBtn = page.locator('button[class*="_primary_"]').first();
    const saveTextWhilePending = (await saveBtn.innerText()).trim();
    const saveDisabledWhilePending = await saveBtn.isDisabled();
    const cancelBtnPending = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    const cancelDisabledWhilePending = await cancelBtnPending.isDisabled();
    await page.screenshot({ path: `${OUT}/c-${mod.key}-pending.png` });

    assertTrue(saveTextWhilePending === 'Saving...', `[${mod.key}] Save button text is EXACTLY "Saving..." while pending (got "${saveTextWhilePending}")`);
    assertTrue(saveDisabledWhilePending === true, `[${mod.key}] Save button is disabled while pending`);
    assertTrue(cancelDisabledWhilePending === true, `[${mod.key}] Cancel/Close button is disabled while pending`);

    releaseDelay();
    const putResp = await responsePromise;
    await page.unroute(`**/api/${mod.key}/**`);
    assertTrue(putResp.ok(), `[${mod.key}] the pending save's PUT actually resolved successfully (HTTP ${putResp.status()})`);
    const putBody = await putResp.json().catch(() => null);
    if (putBody && typeof putBody.id !== 'undefined') {
        assertTrue(putBody.id === mod.openId, `[${mod.key}] the PUT response body's id matches the record actually being edited (expected "${mod.openId}", got "${putBody.id}")`);
    }
    await page.waitForTimeout(600);

    // Independent re-read: fresh navigation, reopen the SAME record by its marker (not by
    // reusing any in-memory state from the save above), confirm the value persisted.
    await page.goto(`${BASE}${mod.path}`);
    await page.waitForTimeout(500);
    await page.locator('table tbody tr').filter({ hasText: mod.openMarker }).click();
    await page.waitForTimeout(500);
    const rereadField = await getRemarkField(page, mod);
    const rereadValue = await rereadField.inputValue();
    assertTrue(rereadValue === pendingMarker, `[${mod.key}] independent re-read after a fresh page load confirms the saved value persisted (expected "${pendingMarker}", got "${rereadValue}")`);
    const closeBtnAfterReread = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    await closeBtnAfterReread.click();
    await page.waitForTimeout(400);
}

// ═══════════════ Part D: fc_full — simulated 500: friendly message, input preserved, button recovery ═══════════════
log('=== Part D: fc_full — simulated 500 — error message visible, modal open, input preserved, buttons recover ===');
for (const mod of MODULES) {
    await openRecord(mod, mod.openMarker);
    const marker = `forms-consistency-failtest-${mod.key}-${Date.now()}`;
    const remarkField = await getRemarkField(page, mod);
    await remarkField.fill(marker);
    const RAW_DETAIL = `Simulated 500 for FORMS-CONSISTENCY-2026-003 (${mod.key}) — NOT a real backend failure, this exact sentence must NEVER reach the toast`;
    await page.route(`**/api/${mod.key}/**`, async (route) => {
        if (route.request().method() !== 'PUT') { await route.continue(); return; }
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: RAW_DETAIL }) });
    });
    const saveBtn = page.getByRole('button', { name: /^Save$/ });
    await saveBtn.click();
    await page.waitForTimeout(900);
    await page.unroute(`**/api/${mod.key}/**`);

    // Exact expected text: describeSaveError() never shows the raw response body for a
    // 5xx (regardless of what the backend's `detail` field actually contains — the whole
    // point is that it must NOT leak through), wrapped in the same saveFlow.failedKeep
    // template NOI/NCR already used. All three modules must now produce this identical
    // string for the identical failure shape (localStorage forces English, so this is a
    // plain string comparison, not a loose "looks readable" heuristic).
    const EXPECTED_500_TEXT = 'Not saved — everything you entered is kept. Server error (HTTP 500). Try again later or contact an administrator.';
    const toastLocator = page.locator('[data-sonner-toast]').first();
    const toastCount = await toastLocator.count();
    const toastText = toastCount > 0 ? (await toastLocator.innerText()).trim() : '';
    assertTrue(toastCount > 0, `[${mod.key}] a visible toast/error notification appears after the simulated failure`);
    assertTrue(toastText === EXPECTED_500_TEXT, `[${mod.key}] the error notification shows the EXACT expected friendly text (expected "${EXPECTED_500_TEXT}", got "${toastText}")`);
    assertTrue(!toastText.includes(RAW_DETAIL), `[${mod.key}] the error notification does NOT contain the raw backend detail string`);

    const modalStillOpen = await page.locator('h2').filter({ hasText: /Edit/ }).count();
    const remarkValueAfterFailure = await remarkField.inputValue();
    await page.screenshot({ path: `${OUT}/d-${mod.key}-save-failure.png` });
    assertTrue(modalStillOpen > 0, `[${mod.key}] modal stays open after a simulated save failure (not silently closed)`);
    assertTrue(remarkValueAfterFailure === marker, `[${mod.key}] the typed input is preserved after a simulated save failure (expected "${marker}", got "${remarkValueAfterFailure}")`);

    // Button recovery: Save/Cancel must not be permanently stuck disabled after a failure.
    const saveBtnAfterFailure = page.locator('button[class*="_primary_"]').first();
    const saveDisabledAfterFailure = await saveBtnAfterFailure.isDisabled();
    const saveTextAfterFailure = (await saveBtnAfterFailure.innerText()).trim();
    const cancelBtnAfterFailure = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    const cancelDisabledAfterFailure = await cancelBtnAfterFailure.isDisabled();
    assertTrue(saveDisabledAfterFailure === false, `[${mod.key}] Save button is re-enabled (recovered) after a failed save, not stuck disabled`);
    assertTrue(saveTextAfterFailure === 'Save', `[${mod.key}] Save button text reverts to "Save" (not stuck on "Saving...") after a failed save (got "${saveTextAfterFailure}")`);
    assertTrue(cancelDisabledAfterFailure === false, `[${mod.key}] Cancel/Close button is re-enabled (recovered) after a failed save`);

    const cancelBtn = page.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    await cancelBtn.click();
    await page.waitForTimeout(400);
    const leaveVisible = await page.getByText('Unsaved Changes', { exact: false }).count();
    if (leaveVisible > 0) {
        const leaveBtn = page.getByRole('button', { name: /^Leave$/ });
        await leaveBtn.click();
        await page.waitForTimeout(400);
    }
}

// ═══════════════ Part E: fc_readonly — no permission at all, per module ═══════════════
log('=== Part E: fc_readonly (no create/update/approve) on OPEN records — field disabled + exact title ===');
const page2 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page2.setDefaultTimeout(15000);
await loginOnPage(page2, 'fc_readonly');
for (const mod of MODULES) {
    await page2.goto(`${BASE}${mod.path}`);
    await page2.waitForTimeout(500);
    await page2.locator('table tbody tr').filter({ hasText: mod.openMarker }).click();
    await page2.waitForTimeout(500);

    const saveBtnCount = await page2.getByRole('button', { name: /^Save$/ }).count();
    assertTrue(saveBtnCount === 0, `[${mod.key}] fc_readonly on an otherwise-open record: no Save button rendered`);

    const heading = (await page2.locator('h2').first().innerText()).trim();
    assertTrue(heading === mod.viewTitleExact, `[${mod.key}] fc_readonly sees the EXACT view-mode title "${mod.viewTitleExact}" (got "${heading}")`);

    // Representative main field (Subject/package carries the marker) must be disabled.
    const subjectField = await findFieldWithValue(page2, mod.openMarker);
    assertTrue(subjectField !== null, `[${mod.key}] the Subject field carrying the record's marker is found for a disabled-state check`);
    if (subjectField !== null) {
        const subjectDisabled = await subjectField.isDisabled();
        assertTrue(subjectDisabled === true, `[${mod.key}] fc_readonly's Subject field is actually disabled, not just visually greyed`);
    }

    await page2.screenshot({ path: `${OUT}/e-${mod.key}-readonly-user.png` });
    const closeBtn = page2.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
    await closeBtn.click();
    await page2.waitForTimeout(400);
}
await page2.close();

// ═══════════════ Part F: deep-link (?openId=) return paths — fresh context, known source, exact URLs ═══════════════
log('=== Part F: ?openId= deep-link — fresh browser context per scenario, known fixed source page, EXACT destination URLs ===');

async function freshDeepLinkPage(mod) {
    const context = await browser.newContext();
    const p = await context.newPage();
    p.setDefaultTimeout(15000);
    await loginOnPage(p, 'fc_full');
    await p.goto(KNOWN_SOURCE);
    await p.waitForTimeout(400);
    assertTrue(p.url() === KNOWN_SOURCE, `[${mod.key}] fresh context established the known source page EXACTLY ("${KNOWN_SOURCE}", got "${p.url()}")`);
    await p.goto(`${BASE}${mod.path}?openId=${mod.openId}`);
    await p.waitForTimeout(800);
    const urlAfterDeepLink = p.url();
    assertTrue(!urlAfterDeepLink.includes('openId'), `[${mod.key}] ?openId= is stripped from the URL after the deep-link consumption effect runs (url: "${urlAfterDeepLink}")`);
    // Read the actual modal field, not page text — a page-wide text search can also
    // match a list row still sitting in the DOM underneath the modal overlay, which
    // would pass even if the WRONG record's modal had opened on top of the right row.
    const identityField = await findFieldWithValue(p, mod.openMarker);
    assertTrue(identityField !== null, `[${mod.key}] the deep-linked modal's own Subject field (not page text) shows the ${mod.openMarker} record`);
    return { context, page: p };
}

for (const mod of MODULES) {
    // F1: Cancel/Close -> exact known source
    {
        const { context, page: p } = await freshDeepLinkPage(mod);
        const cancelBtn = p.locator('button').filter({ hasText: /^(Cancel|Close)$/ });
        await cancelBtn.click();
        await p.waitForTimeout(600);
        const urlAfterCancel = p.url();
        await p.screenshot({ path: `${OUT}/f-${mod.key}-01-after-cancel.png` });
        assertTrue(urlAfterCancel === KNOWN_SOURCE, `[${mod.key}] F1 Cancel/Close returns to the EXACT known source page (expected "${KNOWN_SOURCE}", got "${urlAfterCancel}")`);
        await context.close();
    }
    // F2: browser back (no click) -> exact known source
    {
        const { context, page: p } = await freshDeepLinkPage(mod);
        await p.goBack();
        await p.waitForTimeout(600);
        const urlAfterBack = p.url();
        await p.screenshot({ path: `${OUT}/f-${mod.key}-02-after-back.png` });
        assertTrue(urlAfterBack === KNOWN_SOURCE, `[${mod.key}] F2 browser back returns to the EXACT known source page (expected "${KNOWN_SOURCE}", got "${urlAfterBack}")`);
        await context.close();
    }
    // F3: successful save -> exact known source, with real PUT success + independent re-read
    {
        const { context, page: p } = await freshDeepLinkPage(mod);
        const marker2 = `forms-consistency-deeplink-save-${mod.key}-${Date.now()}`;
        const field = await getRemarkField(p, mod);
        await field.fill(marker2);
        const saveBtn2 = p.getByRole('button', { name: /^Save$/ });
        const [putResp] = await Promise.all([
            // Pinned to this exact record's id — not just "any PUT to this module".
            p.waitForResponse(r => r.url().includes(`/api/${mod.key}/${mod.openId}`) && r.request().method() === 'PUT'),
            saveBtn2.click(),
        ]);
        assertTrue(putResp.ok(), `[${mod.key}] F3 deep-linked record's save PUT succeeded (HTTP ${putResp.status()})`);
        const putBody2 = await putResp.json().catch(() => null);
        if (putBody2 && typeof putBody2.id !== 'undefined') {
            assertTrue(putBody2.id === mod.openId, `[${mod.key}] F3 PUT response body's id matches the record actually being edited (expected "${mod.openId}", got "${putBody2.id}")`);
        }
        await p.waitForTimeout(600);
        const urlAfterSave = p.url();
        await p.screenshot({ path: `${OUT}/f-${mod.key}-03-after-save.png` });
        assertTrue(urlAfterSave === KNOWN_SOURCE, `[${mod.key}] F3 successful save returns to the EXACT known source page (expected "${KNOWN_SOURCE}", got "${urlAfterSave}")`);

        // Independent re-read in a brand-new tab within the SAME context (separate from
        // the tab that just saved), confirming the value actually persisted server-side.
        const rereadPage = await context.newPage();
        rereadPage.setDefaultTimeout(15000);
        await rereadPage.goto(`${BASE}${mod.path}`);
        await rereadPage.waitForTimeout(500);
        await rereadPage.locator('table tbody tr').filter({ hasText: mod.openMarker }).click();
        await rereadPage.waitForTimeout(500);
        const rereadField = await getRemarkField(rereadPage, mod);
        const rereadValue = await rereadField.inputValue();
        assertTrue(rereadValue === marker2, `[${mod.key}] F3 independent re-read (new tab) confirms the deep-linked save persisted (expected "${marker2}", got "${rereadValue}")`);
        await context.close();
    }
}

log(`===== FORMS-CONSISTENCY-2026-003 REVIEW SCRIPT DONE — ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL =====`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
