// ITP-INPUT-UX-IMPLEMENT-2026-002: R1 — full multi-line text persistence and rendering
// verification, per the independent review of ITP-INPUT-UX-IMPLEMENT-2026-001. Layout
// geometry (width/compactness/full-row fields/scroll behavior) is already accepted and is
// NOT re-tested here. This script covers:
//   1. Add / Copy / Edit entries, each with long EN+CH text containing an explicit newline
//      and a unique trailing marker (Activity + one Criteria entry).
//   2. Apply -> Save -> fresh browser context reopen -> EXACT full inputValue comparison
//      (not a substring search), for every touched item.
//   3. The copy SOURCE item is unmodified after the copy+modify+Apply of the derived item.
//   4. Cancel (no Apply) does not persist a draft.
//   5. List and print-preview rendering: full text, trailing marker, and whether the
//      newline is actually preserved visually (not collapsed to a space).
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITP_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITP_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITP_INPUT_UX_IMPLEMENT2_EVIDENCE_DIR || '/private/tmp/claude-501/itp-input-ux-implement-2026-002-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let totalChecks = 0, failures = 0;
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

const openSeededItpPlan = async (page) => {
    await page.goto(`${BASE}/itp`);
    await page.waitForTimeout(500);
    await page.locator('table tbody tr').filter({ hasText: 'QTS-IUX1-ITP-000001' }).click();
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Inspection Plan/ }).click();
    await page.waitForTimeout(300);
};

// Closes the item edit/add/copy panel via its own Cancel button (not the outer ITP modal's).
// If the item was dirty, this panel's own leave-guard (useItemDraftGuard) raises the SAME
// shared "Unsaved Changes" ConfirmModal as the rest of the app ("Leave" / "Stay & Save") —
// confirm "Leave" to actually discard, matching what discardDraft means for this check.
const closeItemPanelDiscarding = async (page) => {
    await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
    await page.waitForTimeout(300);
    const leaveBtn = page.getByRole('button', { name: 'Leave' });
    if (await leaveBtn.count() > 0) {
        await leaveBtn.click();
        await page.waitForTimeout(300);
    }
};

// Unique-per-run markers so this script is safely re-runnable without colliding with a
// previous run's leftover data in the same isolated DB.
const RUN_ID = Date.now().toString(36);
const MARK = (label) => `>>>R1-${label}-${RUN_ID}<<<`;

const NEW_ACTIVITY_EN = `Verify post-tensioning tendon profile and duct alignment against the approved shop drawing before grouting, including a check of anchorage bearing plate seating.\nSecond line: confirm all tendons show the correct elongation record sheet signed off by the stressing technician.\n${MARK('NEW-ACT-EN')}`;
const NEW_ACTIVITY_CH = `灌漿前核對預力鋼腱線型與套管對位是否與核准施工圖一致，並檢查錨座承壓板是否正確就位。\n第二行：確認所有鋼腱皆有張拉技術員簽署之伸長量紀錄表。\n${MARK('NEW-ACT-CH')}`;
const NEW_CRITERIA_EN = `Measured tendon elongation within +/-7% of the theoretical calculated value per the approved stressing calculation sheet.\nAnchorage set loss recorded and within tolerance.\n${MARK('NEW-CRIT-EN')}`;
const NEW_CRITERIA_CH = `實測鋼腱伸長量須在核准張拉計算表理論值之正負7%範圍內。\n錨座回縮損失須記錄且在容許範圍內。\n${MARK('NEW-CRIT-CH')}`;

const COPY_ACTIVITY_EN = `COPY-DERIVED ITEM: re-verify rebar spacing, cover thickness, and lap splice length at the adjacent column line after formwork adjustment following the first failed inspection.\nSecond line: re-inspection requires photographic evidence attached to this event.\n${MARK('COPY-ACT-EN')}`;
const COPY_ACTIVITY_CH = `複製衍生項目：因第一次檢驗未通過並調整模板後，重新核對相鄰柱列鋼筋間距、保護層厚度與搭接長度。\n第二行：複驗須附上本事件之照片證據。\n${MARK('COPY-ACT-CH')}`;

const EDIT_ACTIVITY_EN = `EDITED EXISTING ITEM: formwork alignment and bracing stability re-confirmed after the contractor's corrective rework was completed on site.\nSecond line noting the rework completion date was verified against the daily site log.\n${MARK('EDIT-ACT-EN')}`;
const EDIT_ACTIVITY_CH = `編輯既有項目：承包商完成現場矯正作業後，重新確認模板對正與支撐穩定性。\n第二行註記矯正完成日期已核對每日工地日誌。\n${MARK('EDIT-ACT-CH')}`;

const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);
await loginOnPage(page, 'itpux_full');
await openSeededItpPlan(page);

// ═══════════════ Entry 1: Add New Item, with newline + marker content ═══════════════
log('=== Entry 1: Add New Item (Activity + Criteria with explicit newline + unique marker) ===');
await page.getByRole('button', { name: /Add New Item/ }).click();
await page.waitForTimeout(300);
let textareas = page.locator('textarea');
await textareas.nth(0).fill(NEW_ACTIVITY_EN);
await textareas.nth(1).fill(NEW_ACTIVITY_CH);
// Standard textareas are index 2/3; leave as-is (not required by R1). Criteria starts empty —
// use "+ Add Criteria" to create one entry, then fill it. DOM order is Activity(0,1),
// Standard(2,3), Criteria(4,5,... one pair per entry), THEN Check Time/Method/Frequency —
// the new criteria pair is INSERTED at index 4, not appended at the end of all textareas
// (Check Time/Method/Frequency, already present and empty, sit after it, not before).
await page.getByRole('button', { name: /Add Criteria/ }).click();
await page.waitForTimeout(200);
textareas = page.locator('textarea');
const criteriaEnIdx = 4; // this item started with 0 criteria entries, so the first (only) one lands right after Standard
await textareas.nth(criteriaEnIdx).fill(NEW_CRITERIA_EN);
await textareas.nth(criteriaEnIdx + 1).fill(NEW_CRITERIA_CH);
log(`DEBUG: total textareas=${await textareas.count()}, criteriaEnIdx=${criteriaEnIdx}, filled EN value len=${(await textareas.nth(criteriaEnIdx).inputValue()).length}, filled CH value len=${(await textareas.nth(criteriaEnIdx + 1).inputValue()).length}`);
const addedEventNo = (await page.locator('.text-sm.font-bold.text-slate-800.bg-slate-100').first().textContent())?.trim();
await page.getByRole('button', { name: /Apply/ }).click();
await page.waitForTimeout(500);
log(`INFO: added new item as Event No. ${addedEventNo}`);

// ═══════════════ Entry 2: Copy an existing item, modify, Apply — record source BEFORE ═══════════════
log('=== Entry 2: Copy existing item B1, modify derived copy, record source value before ===');
// R2: read the SOURCE item's full Activity EN/CH directly from its OWN edit panel (not the
// list cell's innerText) before the copy, via the exact same inputValue() mechanism used for
// every other comparison in this script — so "before" and "after" are read identically.
await page.locator('table tbody tr').filter({ hasText: 'Inspect rebar spacing, cover thickness' }).locator('button[title="Edit"]').click();
await page.waitForTimeout(300);
const sourceActivityEnBefore = await page.locator('textarea').nth(0).inputValue();
const sourceActivityChBefore = await page.locator('textarea').nth(1).inputValue();
assertTrue(sourceActivityEnBefore.length > 0, `copy1: captured copy-source item's pre-copy Activity EN from its own edit panel (len=${sourceActivityEnBefore.length})`);
await closeItemPanelDiscarding(page);
await page.locator('table tbody tr').filter({ hasText: 'Inspect rebar spacing, cover thickness' }).locator('button[title="Copy"]').click();
await page.waitForTimeout(300);
textareas = page.locator('textarea');
await textareas.nth(0).fill(COPY_ACTIVITY_EN);
await textareas.nth(1).fill(COPY_ACTIVITY_CH);
const copyEventNo = (await page.locator('.text-sm.font-bold.text-slate-800.bg-slate-100').first().textContent())?.trim();
await page.getByRole('button', { name: /Apply/ }).click();
await page.waitForTimeout(500);
log(`INFO: copy-derived item applied as Event No. ${copyEventNo}`);

// ═══════════════ Entry 3: Edit an existing item ═══════════════
log('=== Entry 3: Edit an existing item (A1) ===');
await page.locator('table tbody tr').filter({ hasText: 'Verify rebar material certificates' }).locator('button[title="Edit"]').click();
await page.waitForTimeout(300);
textareas = page.locator('textarea');
await textareas.nth(0).fill(EDIT_ACTIVITY_EN);
await textareas.nth(1).fill(EDIT_ACTIVITY_CH);
await page.getByRole('button', { name: /Apply/ }).click();
await page.waitForTimeout(500);

// ═══════════════ Cancel does not persist a draft ═══════════════
log('=== Cancel (no Apply) must not persist a draft ===');
// Target the item added in Entry 1 (found via its unique marker, not a hardcoded seed
// sentence — avoids relying on exact seed text that may have already been modified above).
await page.locator('table tbody tr').filter({ hasText: MARK('NEW-ACT-EN').slice(0, 30) }).locator('button[title="Edit"]').click();
await page.waitForTimeout(300);
const cBox = page.locator('textarea').nth(0);
const originalBeforeCancel = await cBox.inputValue();
await cBox.fill('THIS DRAFT MUST NOT BE SAVED — cancel button is about to discard it.');
await closeItemPanelDiscarding(page);
// Reopen the same item fresh and confirm the draft edit never landed.
await page.locator('table tbody tr').filter({ hasText: MARK('NEW-ACT-EN').slice(0, 30) }).locator('button[title="Edit"]').click();
await page.waitForTimeout(300);
const afterCancelReopen = await page.locator('textarea').nth(0).inputValue();
assertTrue(afterCancelReopen === originalBeforeCancel && !afterCancelReopen.includes('MUST NOT BE SAVED'),
    `cancel1: Cancel discarded the draft — reopening the same item shows the original value unchanged ("${afterCancelReopen.slice(0, 40)}...")`);
await closeItemPanelDiscarding(page);

// ═══════════════ Save the whole ITP ═══════════════
log('=== Save ===');
const saveBtn = page.getByRole('button', { name: /^Save$/ });
assertTrue(await saveBtn.isEnabled(), 'save1: Save button enabled');
await saveBtn.click();
await page.waitForTimeout(1500);

// ═══════════════ Fresh context reopen: EXACT full inputValue comparison for every touched item ═══════════════
log('=== Fresh context reopen: exact full inputValue comparison (not substring search) ===');
const page2 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page2.setDefaultTimeout(15000);
await loginOnPage(page2, 'itpux_full');
await openSeededItpPlan(page2);

const reopenAndReadActivity = async (page, rowMarkerText) => {
    await page.locator('table tbody tr').filter({ hasText: rowMarkerText }).locator('button[title="Edit"]').click();
    await page.waitForTimeout(300);
    const en = await page.locator('textarea').nth(0).inputValue();
    const ch = await page.locator('textarea').nth(1).inputValue();
    await closeItemPanelDiscarding(page);
    return { en, ch };
};

const newItemReread = await reopenAndReadActivity(page2, MARK('NEW-ACT-EN').slice(0, 30));
assertTrue(newItemReread.en === NEW_ACTIVITY_EN, `exact1: new item's Activity EN matches EXACTLY (full string incl. newline + marker), length ${newItemReread.en.length} === ${NEW_ACTIVITY_EN.length}`);
assertTrue(newItemReread.ch === NEW_ACTIVITY_CH, `exact2: new item's Activity CH matches EXACTLY, length ${newItemReread.ch.length} === ${NEW_ACTIVITY_CH.length}`);

const copyItemReread = await reopenAndReadActivity(page2, MARK('COPY-ACT-EN').slice(0, 30));
assertTrue(copyItemReread.en === COPY_ACTIVITY_EN, `exact3: copy-derived item's Activity EN matches EXACTLY`);
assertTrue(copyItemReread.ch === COPY_ACTIVITY_CH, `exact4: copy-derived item's Activity CH matches EXACTLY`);

const editItemReread = await reopenAndReadActivity(page2, MARK('EDIT-ACT-EN').slice(0, 30));
assertTrue(editItemReread.en === EDIT_ACTIVITY_EN, `exact5: edited item's Activity EN matches EXACTLY`);
assertTrue(editItemReread.ch === EDIT_ACTIVITY_CH, `exact6: edited item's Activity CH matches EXACTLY`);

// Criteria exact match (first criteria entry of the new item)
await page2.locator('table tbody tr').filter({ hasText: MARK('NEW-ACT-EN').slice(0, 30) }).locator('button[title="Edit"]').click();
await page2.waitForTimeout(300);
const allTextareas = page2.locator('textarea');
const count = await allTextareas.count();
const allValues = [];
for (let i = 0; i < count; i++) allValues.push((await allTextareas.nth(i).inputValue()).slice(0, 25).replace(/\n/g, '\\n'));
log(`DEBUG: ${count} textareas found, values[0..]: ${JSON.stringify(allValues)}`);
// Layout order: Activity EN/CH(0,1), Standard EN/CH(2,3), Criteria EN/CH(4,5 ... last two before Check Time)
const critEn = await allTextareas.nth(4).inputValue();
const critCh = await allTextareas.nth(5).inputValue();
assertTrue(critEn === NEW_CRITERIA_EN, `exact7: new item's first Criteria EN matches EXACTLY (len ${critEn.length} vs ${NEW_CRITERIA_EN.length})`);
assertTrue(critCh === NEW_CRITERIA_CH, `exact8: new item's first Criteria CH matches EXACTLY (len ${critCh.length} vs ${NEW_CRITERIA_CH.length})`);
await closeItemPanelDiscarding(page2);

// ═══════════════ Copy source unmodified ═══════════════
log('=== Copy source item must be unchanged after copying+modifying the derived item ===');
// R2: strict full-string equality against the EN/CH values read from the source's OWN edit
// panel before the copy (sourceActivityEnBefore/sourceActivityChBefore) — no 30-char-prefix
// substring fallback. A change anywhere in the string, including the tail, now fails this.
const sourceAfter = await reopenAndReadActivity(page2, 'Inspect rebar spacing, cover thickness');
assertTrue(sourceAfter.en === sourceActivityEnBefore,
    `source1: copy source item's Activity EN is EXACTLY unchanged after the copy+modify+Apply of the derived item (len ${sourceAfter.en.length} vs ${sourceActivityEnBefore.length})`);
assertTrue(sourceAfter.ch === sourceActivityChBefore,
    `source2: copy source item's Activity CH is EXACTLY unchanged after the copy+modify+Apply of the derived item (len ${sourceAfter.ch.length} vs ${sourceActivityChBefore.length})`);
await page2.screenshot({ path: `${OUT}/reread-source-unmodified.png` });

// ═══════════════ List rendering: full text, marker, newline preserved? ═══════════════
log('=== List rendering: full text + marker + newline preservation ===');
await page2.goto(`${BASE}/itp`);
await page2.waitForTimeout(500);
await page2.locator('table tbody tr').filter({ hasText: 'QTS-IUX1-ITP-000001' }).click();
await page2.waitForTimeout(500);
await page2.getByRole('button', { name: /Inspection Plan/ }).click();
await page2.waitForTimeout(300);
const activityDiv = page2.locator('table tbody tr').filter({ hasText: MARK('NEW-ACT-EN').slice(0, 30) }).locator('td').nth(2).locator('div').first();
// innerText (not innerHTML) — innerHTML HTML-escapes the marker's `<`/`>` characters into
// entities, which would make a literal substring check against the raw marker fail even
// though the full text is genuinely present and correct.
const listCellText = await activityDiv.innerText();
assertTrue(listCellText.includes(MARK('NEW-ACT-EN')), `list1: the full Activity text including the trailing unique marker is present in the list cell (text: "${listCellText.slice(0, 60)}...")`);
// Whether the newline is actually PRESERVED visually (not just present in the underlying
// data) is a separate question from "the marker exists somewhere in the cell" — a collapsed
// newline still leaves the marker findable as a substring, just glued to the previous
// sentence with a single space. The real signal is the CSS mechanism that controls this:
// `white-space: normal` (the browser default) collapses \n to a space; `pre-line` (or
// `pre-wrap`) preserves it while still allowing normal wrapping for long lines.
const listWhiteSpace = await activityDiv.evaluate(el => getComputedStyle(el).whiteSpace);
log(`INFO: list Activity cell computed white-space = "${listWhiteSpace}"`);
assertTrue(listWhiteSpace === 'pre-line' || listWhiteSpace === 'pre-wrap' || listWhiteSpace === 'pre',
    `list2: list Activity cell's white-space CSS actually preserves user-entered newlines (got "${listWhiteSpace}")`);
await page2.screenshot({ path: `${OUT}/list-rendering.png` });

// ═══════════════ Print preview rendering ═══════════════
// R1: scope strictly to the ITPPrintTemplate portal root. That component mounts directly onto
// document.body (ReactDOM.createPortal, gated by isPrinting) and is the ONLY place on this page
// that renders the "Inspection & Test Plan" print heading — the list view never contains that
// heading, so anchoring on it (instead of on the marker text, which DOES also exist in the list
// behind the print overlay) proves we are actually inside the print component, not just finding
// matching text anywhere on the page. No body-wide or "skip if not found" fallback: a missing or
// non-unique root is a hard failure, not a quietly-skipped check. This is print-DOM evidence
// (the portal's rendered markup, and its computed white-space style) — not a native
// system print-preview dialog screenshot, which this script does not attempt to capture.
log('=== Print preview rendering (scoped to ITPPrintTemplate portal root) ===');
const printBtn = page2.getByRole('button', { name: /Print/ });
assertTrue(await printBtn.count() > 0, 'print0: a "Print" button is present in this view');
await printBtn.first().click();

const printRoot = page2.locator('body > div').filter({ has: page2.getByRole('heading', { name: 'Inspection & Test Plan' }) });
await printRoot.first().waitFor({ state: 'attached', timeout: 10000 });
const printRootCount = await printRoot.count();
assertTrue(printRootCount === 1, `print1: exactly one ITPPrintTemplate portal root is mounted, anchored on its unique "Inspection & Test Plan" heading (found ${printRootCount})`);

const printRow = printRoot.locator('tr').filter({ hasText: MARK('NEW-ACT-EN') });
const printRowCount = await printRow.count();
assertTrue(printRowCount === 1, `print2: exactly one row for the test item is found inside the print root (found ${printRowCount})`);

// PRECHECK-confirmed column order for the print table: Event No./Activity/Standard+Criteria/...
// — no drag-handle column (unlike the list), so Activity is td index 1. The td itself holds
// two stacked divs (EN then CH); target the first (EN) div specifically — same pattern as the
// list check — rather than the td's combined innerText, which would also fold in the second
// (here-empty) CH div's contribution.
const printActivityCell = printRow.locator('td').nth(1).locator('div').first();
const printCellText = await printActivityCell.innerText();
assertTrue(printCellText === NEW_ACTIVITY_EN, `print3: the print root's Activity cell text matches the full entered Activity EN EXACTLY, including the trailing marker and embedded newlines (len ${printCellText.length} vs ${NEW_ACTIVITY_EN.length})`);

const printWhiteSpace = await printActivityCell.evaluate(el => getComputedStyle(el).whiteSpace);
log(`INFO: print root Activity cell computed white-space = "${printWhiteSpace}"`);
assertTrue(printWhiteSpace === 'pre-line' || printWhiteSpace === 'pre-wrap' || printWhiteSpace === 'pre',
    `print4: the print root's Activity cell white-space CSS actually preserves user-entered newlines (got "${printWhiteSpace}")`);

await page2.screenshot({ path: `${OUT}/print-preview-rendering.png`, fullPage: true });

await page2.close();
await browser.close();

log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
