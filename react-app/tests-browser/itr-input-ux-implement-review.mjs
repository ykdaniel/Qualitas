// ITR-INPUT-UX-IMPLEMENT-2026-001/002: real-browser acceptance for the Checklist Situation field
// redesign in ChecklistSnapshotModal.tsx (ITR-embedded Checklist instance panel only — the
// standalone Checklist.tsx template editor is out of scope and untouched).
//
// 2026-002 update (R1/R2/R3 from round 001's REVISE): the user explicitly rejected a card or
// stacked-list layout for narrow screens (see DECISIONS.md 2026-10-04) and confirmed the existing
// 5-column table stays as-is, accepting its own horizontal scroll at 375px. R1 is therefore a
// VERIFICATION fix only — proving the existing scroll genuinely works via real interaction — not a
// layout change. R2 adds response-body precision (exact id + situation match, not just 2xx) and a
// fresh-context persistence check after the retry; exact string equality (not substring) for the
// locked read-only text; a direct proof the text is selectable; and a direct check that the Result
// buttons carry the real HTML disabled attribute while locked.
//
// Covers the user's 6 acceptance points:
//   1. Long EN/CH multi-line + special-character content fills and saves correctly.
//   2. Saved value survives a fresh-context reopen, EXACT match (not substring); the PUT response
//      body itself is also checked for the exact target id and situation string.
//   3. Cancel discards the draft; an untouched sibling item keeps its original value.
//   4. Locked (ITR Approved) state shows the full text EXACTLY (incl. newlines, matched against the
//      known seed string), is genuinely selectable, is not an editable control, has its Result
//      buttons actually disabled, and exposes no Save path — all confirmed as UI-level protections,
//      not a claim of exhaustive authorization coverage.
//   5. Desktop (1280px): unchanged from round 001. Narrow (375px): the table's own horizontal
//      scroll is the confirmed design (not a defect) — verified by scrolling the table's own
//      container and proving, via real bounding-box geometry and an actual fill+click+Save
//      round trip, that Situation and Result are genuinely reachable and operable after scrolling.
//   6. A failed save keeps the typed value in place and is retryable; the retry's response body is
//      checked precisely, and a fresh-context reopen afterward confirms it actually persisted.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITR_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITR_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITR_INPUT_UX_IMPLEMENT_EVIDENCE_DIR || '/private/tmp/claude-501/itr-input-ux-implement-2026-001-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let totalChecks = 0, failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();

async function loginOnPage(page) {
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.goto(`${BASE}/login`);
    await page.fill('#email', 'itrux_full');
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.includes('/login'));
}

const openItr = async (page, documentNumber) => {
    await page.goto(`${BASE}/itr`);
    await page.waitForTimeout(500);
    await page.locator('table tbody tr').filter({ hasText: documentNumber }).click();
    await page.waitForTimeout(500);
};

const expandChecklist = async (page, recordsNo) => {
    // Target the exact clickable row div (ITRModals.tsx: className includes "cursor-pointer"),
    // not an ambiguous text-containing ancestor — a looser `div` filter can match a huge outer
    // container whose bounding-box center lands outside the actual clickable row.
    const row = page.locator('div.cursor-pointer').filter({ hasText: recordsNo });
    await row.first().click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: /Checklist Items/ }).click();
    await page.waitForTimeout(200);
};

// ═══════════════ Scenario A+B: long multi-line + special chars, save, fresh-context reread ═══════════════
log('=== Scenario A: fill long multi-line + special-char Situation on ITR1 (editable), save ===');
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);
await loginOnPage(page);
await openItr(page, 'QTS-IUX2-ITR-000001');
await expandChecklist(page, 'QTS-IUX2-CHK-000001');

const RUN_ID = Date.now().toString(36);
const NEW_SITUATION = (
    `Re-measured cover thickness at all 8 locations (Grid C4-C7) after the formwork strip-down.\n` +
    `所有讀數均在 40mm ±5mm 容許範圍內，無異常；特殊字元測試 <tag> & "quoted" 'single' 100% OK。\n` +
    `Second paragraph with another newline and a trailing unique marker.\n` +
    `IMPL-MARK-${RUN_ID}`
);

const item1Textarea = page.locator('textarea[data-situation-input="0"]');
await assertTrue(await item1Textarea.count() === 1, 'pre1: item 1 Situation renders as an editable <textarea> (not an <input>) when unlocked');
await item1Textarea.fill(NEW_SITUATION);
const filledValue = await item1Textarea.inputValue();
assertTrue(filledValue === NEW_SITUATION, `fill1: textarea holds the full multi-line + special-char string immediately after typing (len ${filledValue.length} vs ${NEW_SITUATION.length})`);

const saveResponsePromise = page.waitForResponse(r => /\/checklist\/.*\/$/.test(r.url()) && r.request().method() === 'PUT');
await page.getByRole('button', { name: 'Save', exact: true }).first().click();
const saveResponse = await saveResponsePromise;
assertTrue(saveResponse.ok(), `save1: PUT /checklist/{id}/ succeeded (status ${saveResponse.status()})`);
// R2: the PUT response itself (response_model=schemas.Checklist, which includes `id` and the full
// `detail_data` JSON string — confirmed by reading backend/routers/checklist.py:86 and
// backend/schemas.py:1222) is checked directly for the EXACT target id and situation string, instead
// of just trusting a 2xx status.
const saveBody = await saveResponse.json();
assertTrue(saveBody.id === 'IUX2-CKT1', `save1b: PUT response body is for the exact target checklist id (got "${saveBody.id}")`);
const savedItems = JSON.parse(saveBody.detail_data).items;
const savedItem1 = savedItems.find(i => i.id === '1');
assertTrue(savedItem1 && savedItem1.situation === NEW_SITUATION, `save1c: PUT response body's item 1 situation EXACTLY matches what was sent (len ${savedItem1?.situation?.length} vs ${NEW_SITUATION.length})`);
await page.waitForTimeout(500);
const panelGoneAfterSave = await page.locator('textarea[data-situation-input="0"]').count();
assertTrue(panelGoneAfterSave === 0, 'save2: the snapshot panel closed after a successful save (handleSave calls onClose())');

log('=== Scenario B: fresh browser context, reopen the same ITR, EXACT reread ===');
const page2 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page2.setDefaultTimeout(15000);
await loginOnPage(page2);
await openItr(page2, 'QTS-IUX2-ITR-000001');
await expandChecklist(page2, 'QTS-IUX2-CHK-000001');
const reread1 = await page2.locator('textarea[data-situation-input="0"]').inputValue();
assertTrue(reread1 === NEW_SITUATION, `exact1: item 1 Situation EXACTLY matches the saved multi-line + special-char string after a fresh-context reopen (len ${reread1.length} vs ${NEW_SITUATION.length})`);
const reread2 = await page2.locator('textarea[data-situation-input="1"]').inputValue();
assertTrue(reread2 === 'UNTOUCHED-ITEM-MARK-keep-me', `exact2: sibling item 2 (never touched) kept its original value unchanged ("${reread2}")`);
await page2.screenshot({ path: `${OUT}/desktop-after-save-reopen.png` });

// ═══════════════ Scenario C: Cancel discards the draft ═══════════════
log('=== Scenario C: edit item 1 again, Cancel, confirm draft discarded ===');
const DISCARD_DRAFT = `This draft must NEVER be saved — CANCEL-MUST-DISCARD-${RUN_ID}`;
await page2.locator('textarea[data-situation-input="0"]').fill(DISCARD_DRAFT);
const cancelBtn = page2.getByRole('button', { name: 'Cancel', exact: true }).first();
await cancelBtn.click();
await page2.waitForTimeout(300);
// The shared "Unsaved Changes" leave-guard modal may appear; if so, confirm Leave.
const leaveBtn = page2.getByRole('button', { name: /Leave/ });
if (await leaveBtn.count() > 0) {
    await leaveBtn.first().click();
    await page2.waitForTimeout(300);
}
await expandChecklist(page2, 'QTS-IUX2-CHK-000001');
const afterCancel = await page2.locator('textarea[data-situation-input="0"]').inputValue();
assertTrue(afterCancel === NEW_SITUATION, `cancel1: Cancel discarded the draft — reopening shows the last SAVED value, not "${DISCARD_DRAFT.slice(0, 20)}..." (got len ${afterCancel.length}, expected len ${NEW_SITUATION.length})`);
assertTrue(afterCancel !== DISCARD_DRAFT, 'cancel2: the discarded draft text is definitely not what is shown');

// ═══════════════ Scenario D: locked (ITR Approved) — full text, not editable, no Save path ═══════════════
log('=== Scenario D: ITR2 is Approved (locked) — read-only full-text rendering ===');
const page3 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page3.setDefaultTimeout(15000);
await loginOnPage(page3);
await openItr(page3, 'QTS-IUX2-ITR-000002');
await page3.locator('div.cursor-pointer').filter({ hasText: 'QTS-IUX2-CHK-000002' }).first().click();
await page3.waitForTimeout(300);
await page3.getByRole('button', { name: /Checklist Items/ }).click();
await page3.waitForTimeout(200);

// R2: exact equality against the known seed string (backend/scripts/verification/
// seed_itr_input_ux_review.py's LONG_SITUATION_2 constant, reproduced here verbatim — the two must
// be kept in sync by hand, this is not independently derived) instead of a loose `.includes(marker)`
// substring check.
const LONG_SITUATION_2 = (
    'Re-checked rebar cover and lap splice after the C5-C6 soffit patch repair referenced in ' +
    'the prior inspection cycle; patched area now shows uniform finish with no exposed ' +
    'aggregate or voids.\n' +
    'All 8 cover readings re-verified within tolerance (43mm-46mm). Formwork release agent ' +
    "residue on the patched section was cleaned prior to re-inspection per the contractor's " +
    'method statement MS-C-014 Rev.1.\n' +
    'SITU-MARK-TWO-xyz789'
);

const lockedTextarea = await page3.locator('textarea[data-situation-input="0"]').count();
assertTrue(lockedTextarea === 0, 'locked1: no editable <textarea> is rendered for Situation when the ITR is Approved/locked');
const lockedDiv = page3.locator('div[data-situation-readonly="0"]');
assertTrue(await lockedDiv.count() === 1, 'locked2: a plain read-only <div> renders the Situation text instead');
const lockedText = await lockedDiv.innerText();
assertTrue(lockedText === LONG_SITUATION_2, `locked3: the read-only div's text EXACTLY matches the known seeded multi-line string (len ${lockedText.length} vs ${LONG_SITUATION_2.length})`);
const lockedWhiteSpace = await lockedDiv.evaluate(el => getComputedStyle(el).whiteSpace);
assertTrue(lockedWhiteSpace === 'pre-wrap' || lockedWhiteSpace === 'pre-line' || lockedWhiteSpace === 'pre', `locked4: the read-only div's white-space CSS preserves the seeded newlines (got "${lockedWhiteSpace}")`);
const tagName = await lockedDiv.evaluate(el => el.tagName);
assertTrue(tagName === 'DIV', `locked5: the read-only rendering is a plain <div>, not a disabled form control (tagName=${tagName})`);

// R2: direct proof the text is actually selectable (not just "it's a DIV so it probably is") — build
// a real Range over the element's content and ask the browser's own Selection API what it selected.
const selectedText = await lockedDiv.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return sel.toString();
});
assertTrue(selectedText.length > 0 && selectedText.includes('SITU-MARK-TWO-xyz789'), `locked_selectable: the Situation text can genuinely be selected via the browser's Selection API (selected length ${selectedText.length})`);

// R2: the Result controls themselves are disabled, not just "no Save button exists" — checked
// directly against ChecklistResultControls.tsx's ResultSelect, which already sets a real HTML
// `disabled` attribute on each of its 4 buttons when locked (no product code change, just asserting
// an existing attribute). This is explicitly scoped as the UI-level protection actually exercised
// here — it does not claim to cover every possible bypass path or backend authorization, which this
// round does not test.
const lockedRow = page3.locator('tr[data-item-row="0"]');
const resultButtons = lockedRow.locator('button[data-result-option]');
const resultButtonCount = await resultButtons.count();
assertTrue(resultButtonCount === 4, `locked_result1: the locked row's Result control renders all 4 options (found ${resultButtonCount})`);
let allDisabled = true;
for (let i = 0; i < resultButtonCount; i++) {
    if (!(await resultButtons.nth(i).isDisabled())) allDisabled = false;
}
assertTrue(allDisabled, 'locked_result2: every Result option button has the real HTML disabled attribute while locked');

// UI-level protection actually exercised this round: no Save button is rendered, and (just
// confirmed above) the Result controls are disabled — this is NOT a claim that every possible
// bypass path or backend authorization has been tested.
const saveButtonWhenLocked = await page3.getByRole('button', { name: 'Save', exact: true }).count();
assertTrue(saveButtonWhenLocked === 0, 'locked6: no Save button is rendered while locked (one of the two UI-level protections confirmed this round, alongside disabled Result controls)');
await page3.screenshot({ path: `${OUT}/desktop-locked-readonly.png` });

// ═══════════════ Scenario E: narrow viewport (375px) — real horizontal-scroll interaction ═══════════════
// R1, per the 2026-10-04 DECISIONS.md entry: the user explicitly rejected both a card layout and a
// stacked-list layout for narrow screens and confirmed the existing 5-column table (#/Item/Criteria/
// Situation/Result) stays as-is, accepting the table's own horizontal scroll at 375px. R1 is therefore
// NOT a layout change — it is a verification fix: prove the existing scroll genuinely lets a user
// reach, read, fill, and operate Situation/Result, instead of the old `isVisible()` / page-wide
// `scrollWidth` checks (which only prove an element is not display:none — not that it is reachable
// without scrolling, or that scrolling actually works).
log('=== Scenario E: narrow viewport (375px) — real interaction through the table\'s own horizontal scroll ===');
const page4 = await browser.newPage({ viewport: { width: 375, height: 800 } });
page4.setDefaultTimeout(15000);
await loginOnPage(page4);
await openItr(page4, 'QTS-IUX2-ITR-000001');
await expandChecklist(page4, 'QTS-IUX2-CHK-000001');

const overflow = await page4.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
}));
assertTrue(overflow.scrollWidth <= overflow.clientWidth + 2, `narrow1: no PAGE-wide horizontal overflow at 375px (scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}) — the scroll is contained to the table's own box, confirmed below`);

const tableScroller = page4.locator('div.overflow-x-auto').filter({ has: page4.locator('textarea[data-situation-input="0"]') });
assertTrue(await tableScroller.count() === 1, 'narrow2: the Items table has its own horizontally-scrollable container');

// Before scrolling: the Situation textarea's bounding box must start AT OR PAST the scroller's own
// right edge (i.e. genuinely clipped out of view), not just "isVisible" — isVisible() is true for an
// element sitting off-screen inside a scroll container, which is exactly the gap R1 flagged.
const scrollerBoxBefore = await tableScroller.boundingBox();
const textareaBoxBefore = await page4.locator('textarea[data-situation-input="0"]').boundingBox();
const clippedBefore = textareaBoxBefore.x >= scrollerBoxBefore.x + scrollerBoxBefore.width - 5;
assertTrue(clippedBefore, `narrow3: before scrolling, the Situation textarea is genuinely outside the table's visible box (textarea x=${textareaBoxBefore.x}, scroller right edge=${scrollerBoxBefore.x + scrollerBoxBefore.width})`);
await page4.screenshot({ path: `${OUT}/narrow-375-before-scroll.png` });

// Scroll the TABLE's own container (not the page) — this is the real user gesture (a horizontal
// swipe/drag inside the table box). Using the element's own scrollIntoViewIfNeeded() (not a manual
// `scrollLeft = scrollWidth`, which overshoots past Situation straight to the Result column, as a
// first attempt here proved) reproduces exactly what a real swipe stopping on the target field would
// leave as the scroll position.
await page4.locator('textarea[data-situation-input="0"]').scrollIntoViewIfNeeded();
await page4.waitForTimeout(200);

const scrollerBoxAfter = await tableScroller.boundingBox();
const textareaBoxAfter = await page4.locator('textarea[data-situation-input="0"]').boundingBox();
const reachableAfter = textareaBoxAfter.x >= scrollerBoxAfter.x - 2 && textareaBoxAfter.x < scrollerBoxAfter.x + scrollerBoxAfter.width;
assertTrue(reachableAfter, `narrow4: after scrolling the table's own container, the Situation textarea's bounding box is genuinely within the visible viewport (textarea x=${textareaBoxAfter.x}, scroller box=[${scrollerBoxAfter.x}, ${scrollerBoxAfter.x + scrollerBoxAfter.width}])`);
await page4.screenshot({ path: `${OUT}/narrow-375-after-scroll.png` });

// Real interaction, not just geometry: actually fill Situation, click a Result button, Save — proves
// a user can complete the whole flow at 375px through the table's own scroll, not merely that the
// element's box happens to overlap the viewport.
const NARROW_SITUATION = `Filled entirely at 375px through the table's own horizontal scroll.\nNARROW-MARK-${RUN_ID}`;
await page4.locator('textarea[data-situation-input="0"]').fill(NARROW_SITUATION);
const narrowFilledValue = await page4.locator('textarea[data-situation-input="0"]').inputValue();
assertTrue(narrowFilledValue === NARROW_SITUATION, `narrow5: the full multi-line string was actually typeable at 375px (len ${narrowFilledValue.length} vs ${NARROW_SITUATION.length})`);

const narrowResultButtons = page4.locator('tr[data-item-row="0"] button[data-result-option]');
const narrowPassButton = narrowResultButtons.filter({ hasText: /Pass/i });
assertTrue(await narrowPassButton.count() === 1, 'narrow6: the Pass Result button is locatable in the scrolled view at 375px');
await narrowPassButton.click();
await page4.waitForTimeout(200);
const narrowResultSelected = await narrowPassButton.getAttribute('aria-checked');
assertTrue(narrowResultSelected === 'true', 'narrow7: clicking the Pass Result button at 375px actually selected it (aria-checked=true)');

const narrowSaveResponsePromise = page4.waitForResponse(r => /\/checklist\/.*\/$/.test(r.url()) && r.request().method() === 'PUT');
const narrowSaveButton = page4.getByRole('button', { name: 'Save', exact: true }).first();
assertTrue(await narrowSaveButton.isVisible(), 'narrow8: the Save button itself is reachable at 375px (within the fixed footer, not inside the scrolled table)');
await narrowSaveButton.click();
const narrowSaveResponse = await narrowSaveResponsePromise;
assertTrue(narrowSaveResponse.ok(), `narrow9: Save triggered from the 375px scrolled view succeeds end-to-end (status ${narrowSaveResponse.status()})`);

// ═══════════════ Scenario F: a failed save keeps the typed value, is retryable ═══════════════
log('=== Scenario F: simulate a save failure (500), confirm the value is kept and retry succeeds ===');
const page5 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page5.setDefaultTimeout(15000);
await loginOnPage(page5);
await openItr(page5, 'QTS-IUX2-ITR-000001');
await expandChecklist(page5, 'QTS-IUX2-CHK-000001');

const RETRY_SITUATION = `Save-failure retry test content.\nSecond line.\nRETRY-MARK-${RUN_ID}`;
await page5.locator('textarea[data-situation-input="0"]').fill(RETRY_SITUATION);

let intercepted = false;
await page5.route('**/checklist/*/', async (route) => {
    if (route.request().method() === 'PUT' && !intercepted) {
        intercepted = true;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated failure for retry test' }) });
    } else {
        await route.continue();
    }
});

await page5.getByRole('button', { name: 'Save', exact: true }).first().click();
await page5.waitForTimeout(800);
const errorShown = await page5.locator('[data-save-error]').count();
assertTrue(errorShown === 1, 'fail1: a save-error message is shown after the simulated 500');
const valueAfterFailure = await page5.locator('textarea[data-situation-input="0"]').inputValue();
assertTrue(valueAfterFailure === RETRY_SITUATION, `fail2: the typed value is still in the textarea after a failed save — nothing was cleared (len ${valueAfterFailure.length} vs ${RETRY_SITUATION.length})`);

const retryResponsePromise = page5.waitForResponse(r => /\/checklist\/.*\/$/.test(r.url()) && r.request().method() === 'PUT');
await page5.getByRole('button', { name: 'Save', exact: true }).first().click();
const retryResponse = await retryResponsePromise;
assertTrue(retryResponse.ok(), `fail3: retrying Save (route no longer intercepted) succeeds (status ${retryResponse.status()})`);
// R2: same response-body precision as save1 — not just the status code.
const retryBody = await retryResponse.json();
assertTrue(retryBody.id === 'IUX2-CKT1', `fail3b: retry PUT response body is for the exact target checklist id (got "${retryBody.id}")`);
const retryItem1 = JSON.parse(retryBody.detail_data).items.find(i => i.id === '1');
assertTrue(retryItem1 && retryItem1.situation === RETRY_SITUATION, `fail3c: retry PUT response body's item 1 situation EXACTLY matches what was sent (len ${retryItem1?.situation?.length} vs ${RETRY_SITUATION.length})`);
await page5.waitForTimeout(500);
const panelGoneAfterRetry = await page5.locator('textarea[data-situation-input="0"]').count();
assertTrue(panelGoneAfterRetry === 0, 'fail4: the panel closes normally after the successful retry');

// R2: round 001 only checked the retry's response — not whether it actually PERSISTED. A fresh
// browser context reopen here closes that gap.
log('=== Scenario F (continued): fresh-context reopen confirms the retried save actually persisted ===');
const page6 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page6.setDefaultTimeout(15000);
await loginOnPage(page6);
await openItr(page6, 'QTS-IUX2-ITR-000001');
await expandChecklist(page6, 'QTS-IUX2-CHK-000001');
const retryReread = await page6.locator('textarea[data-situation-input="0"]').inputValue();
assertTrue(retryReread === RETRY_SITUATION, `fail5: fresh-context reopen EXACTLY matches the retried save's content — it genuinely persisted, not just a successful response (len ${retryReread.length} vs ${RETRY_SITUATION.length})`);

await page.close(); await page2.close(); await page3.close(); await page4.close(); await page5.close(); await page6.close();
await browser.close();

log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
