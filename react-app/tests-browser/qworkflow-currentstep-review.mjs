// QWORKFLOW-UX-2026-001: verifies the new "current step" line added to the Q-Workflow list's
// sticky NOI cell (Workflow.tsx). The text is built ENTIRELY from checkpoints[].state, which is
// already computed by the backend — this script checks the displayed text against the SAME data
// the page itself renders for the checkpoint strip (data-checkpoint cells' own title attributes),
// not an independently-guessed expectation, so a mismatch here means the display logic itself is
// wrong, not that the test assumed something about business rules.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.QWORKFLOW_UX_REVIEW_PASSWORD;
if (!PW) throw new Error('QWORKFLOW_UX_REVIEW_PASSWORD not set — export the same value used for seeding before running this script.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.QWORKFLOW_UX_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/qworkflow-ux-2026-002-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'qwux_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

await page.goto(`${BASE}/workflow`);
await page.waitForTimeout(700);

// Row locator keyed off the NOI reference number text (unique per fixture).
const rowFor = (noiRef) => page.locator('tr').filter({ hasText: noiRef });
const currentStepLineOf = (noiRef) => rowFor(noiRef).locator('[data-testid="current-step-line"]');
// The checkpoint strip's own 'current' cell for a row, read from its data-checkpoint + title —
// this IS the ground truth the new text is supposed to restate, read independently of the new
// code under test.
const groundTruthCurrentCheckpoint = async (noiRef) => {
    const cells = rowFor(noiRef).locator('[data-checkpoint]');
    const n = await cells.count();
    for (let i = 0; i < n; i++) {
        const title = await cells.nth(i).getAttribute('title');
        if (title && / · current/.test(title)) {
            return title.split(' · ')[0];
        }
    }
    return null; // none current -> expect "all done" shape
};

// ── AC1/AC2: two different completion levels, text matches the row's own ground-truth current checkpoint ──
// QWORKFLOW-UX-2026-002 (record accuracy): row 2's fixture is 2/9 done = 22% completion — it is
// "a different current checkpoint than row 1", NOT a representative sample of a "mid" (e.g.
// 51-75%) completion band. Renamed from "MID" to avoid implying broader coverage than this one
// data point actually gives.
log('=== 1. LOW (QTS-QWUP1-NOI-000001): no ITR, current should be wh_inspection ("Inspected") ===');
check(await currentStepLineOf('QTS-QWUP1-NOI-000001').count() === 1, 'Row 1: the current-step line element exists in the DOM (existence only — see the mobile geometry section below for whether it is actually readable/unclipped)');
const lowText = await currentStepLineOf('QTS-QWUP1-NOI-000001').innerText();
const lowGroundTruth = await groundTruthCurrentCheckpoint('QTS-QWUP1-NOI-000001');
check(lowGroundTruth === 'Inspected', `Row 1 sanity: the checkpoint strip's own ground truth is "Inspected" (got "${lowGroundTruth}")`);
check(lowText === `Current step: ${lowGroundTruth}`, `Row 1: displayed text exactly restates the row's own ground-truth current checkpoint (got "${lowText}")`);

log('=== 2. 22% completion (QTS-QWUP1-NOI-000002): ITR failed, no NCR — current should be ncr ("NCR Review") ===');
const midText = await currentStepLineOf('QTS-QWUP1-NOI-000002').innerText();
const midGroundTruth = await groundTruthCurrentCheckpoint('QTS-QWUP1-NOI-000002');
check(midGroundTruth === 'NCR Review', `Row 2 sanity: ground truth is "NCR Review" (got "${midGroundTruth}")`);
check(midText === `Current step: ${midGroundTruth}`, `Row 2: displayed text matches this row's DIFFERENT current checkpoint, not a copy of row 1's (got "${midText}")`);
check(midText !== lowText, 'Row 1 and Row 2 show genuinely different current-step text (not a static/hardcoded label)');

// ── AC3: fully done -> "Accepted", no "Current step:" prefix, not mislabeled as any checkpoint ──
log('=== 3. DONE (QTS-QWUP1-NOI-000003): fully accepted — should show "Accepted" with NO "Current step:" prefix ===');
const doneText = await currentStepLineOf('QTS-QWUP1-NOI-000003').innerText();
const doneGroundTruth = await groundTruthCurrentCheckpoint('QTS-QWUP1-NOI-000003');
check(doneGroundTruth === null, 'Row 3 sanity: the checkpoint strip has NO cell in the "current" state (every cell is done)');
check(doneText === 'Accepted', `Row 3: shows exactly "Accepted" (the checkpoint's own label), not "Current step: Accepted" and not any other checkpoint name (got "${doneText}")`);
check(!doneText.includes('Current step'), 'Row 3: does not carry the "Current step:" prefix once there is no current step left');
// R1 (QWORKFLOW-UX-2026-002): the previous round's close-up screenshot here used
// locator.screenshot(), which calls Playwright's own scrollIntoViewIfNeeded() and silently
// scrolled the table's checkpoint strip horizontally — exactly the accidental scroll the mobile
// geometry section below must avoid. Dropped; the row-3 overview is already covered by
// qw-02-four-rows-overview.png just below, and its own mobile close-up is taken later without
// triggering any scroll.

// ── AC4: Void-ITR row must compute to the SAME real shape as the no-ITR row, not a new guess ──
log('=== 4. VOID-ITR (QTS-QWUP1-NOI-000004): a Void-only ITR must not change the displayed text vs the no-ITR case ===');
const voidText = await currentStepLineOf('QTS-QWUP1-NOI-000004').innerText();
const voidGroundTruth = await groundTruthCurrentCheckpoint('QTS-QWUP1-NOI-000004');
check(voidGroundTruth === 'Inspected', `Row 4 sanity: a Void-only ITR still leaves wh_inspection as current, same as row 1 (got "${voidGroundTruth}")`);
check(voidText === lowText, `Row 4: displays the SAME text as row 1 (both genuinely "Inspected" per the real rule), not a different guess just because a Void ITR exists (got "${voidText}" vs row 1's "${lowText}")`);
check(!voidText.toLowerCase().includes('void'), 'Row 4: the word "Void" itself is not injected into the displayed text — it restates the real checkpoint state, not the ITR status');

await page.screenshot({ path: `${OUT}/qw-02-four-rows-overview.png` });

// ── AC6: no new page-level horizontal scroll, desktop and mobile ──
log('=== 5. no new page-level horizontal scroll (desktop) ===');
const desktopOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(desktopOverflow <= 1, `Desktop: page-level horizontal overflow is ~0 (got ${desktopOverflow}px) — the table's OWN internal horizontal scroll for the 9 checkpoints is unaffected and not what this checks`);

log('=== 6. no new page-level horizontal scroll (mobile width) ===');
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(400);
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(mobileOverflow <= 1, `Mobile (375px): page-level horizontal overflow is ~0 (got ${mobileOverflow}px)`);
await page.screenshot({ path: `${OUT}/qw-03-mobile-no-page-overflow.png` });

// ── R1 (QWORKFLOW-UX-2026-002): zero page-level overflow does NOT prove the current-step text
// is actually readable — Workflow.module.css's .tableWrapper has its OWN `overflow-x: auto`
// clipping container, independent of the page's own scrollbar, and the sticky NOI cell sits
// next to another sticky column. This section checks REAL geometry: each target row's
// current-step element must have its full bounding box inside the viewport AND inside the
// table's own scroll container, while the table's own horizontal scroll stays at 0 (we are
// testing the cell's resting position, not what becomes reachable only after the user scrolls
// the 9-checkpoint strip sideways) — and elementFromPoint at the text's own center must resolve
// back to that same element (or a descendant of it), proving nothing else is stacked on top of
// it. isVisible()/count() alone cannot catch any of this; all of the checks below can genuinely
// fail if the text is actually clipped. ──
log('=== 6b (R1). mobile: current-step text is actually within the visible, unclipped area — not just present ===');
// Scroll the PAGE vertically to bring the table into view (the layout here is a single column,
// so this cannot introduce horizontal movement) — deliberately NOT page.locator(...).scrollIntoViewIfNeeded()
// on the target cell itself, which could silently scroll the table HORIZONTALLY to bring an
// off-screen cell into view and defeat the entire point of this check.
await page.evaluate(() => { document.querySelector('table')?.scrollIntoView({ block: 'start', inline: 'nearest' }); });
await page.waitForTimeout(300);
const tableWrapperScrollLeft = await page.evaluate(() => {
    const wrapper = document.querySelector('table')?.parentElement;
    return wrapper ? wrapper.scrollLeft : null;
});
check(tableWrapperScrollLeft !== null && tableWrapperScrollLeft <= 5, `R1: the table's own horizontal scroll position is ~0 (resting state, not scrolled sideways) before checking geometry (got ${tableWrapperScrollLeft}; small sub-pixel values from the vertical scrollIntoView itself are tolerated, a real sideways scroll is not)`);

const geometryCheck = async (noiRef, label) => {
    const locator = currentStepLineOf(noiRef);
    check(await locator.count() === 1, `R1 ${label}: the current-step element exists exactly once`);
    const box = await locator.boundingBox();
    check(box !== null, `R1 ${label}: a bounding box was obtained (element is actually rendered, not display:none)`);
    check(box.width > 0 && box.height > 0, `R1 ${label}: the element has non-zero rendered width/height (got ${box.width}x${box.height})`);
    const viewport = page.viewportSize();
    check(box.x >= 0 && box.y >= 0, `R1 ${label}: the element's top-left corner is within the viewport, not scrolled off to the left/above (got x=${box.x}, y=${box.y})`);
    check(box.x + box.width <= viewport.width + 0.5, `R1 ${label}: the element's right edge does not extend past the 375px viewport width (right edge at ${box.x + box.width}, viewport ${viewport.width})`);
    // The decisive check: sample the CENTER point of the element's own bounding box and ask the
    // browser what's actually there. If something else (a neighbouring sticky column, an
    // overlay) is stacked on top, elementFromPoint returns THAT element instead — this is what
    // isVisible()/count() cannot detect, since Playwright's own actionability check uses a
    // similar hit-test but was never actually invoked by the previous round's assertions.
    const hitTestOwnsPoint = await page.evaluate(({ x, y, testId }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return false;
        const target = el.closest(`[data-testid="${testId}"]`);
        return target !== null;
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2, testId: 'current-step-line' });
    check(hitTestOwnsPoint, `R1 ${label}: a hit-test at the text's own center actually resolves back to this element (not covered by a neighbouring sticky column or overlay)`);
    return box;
};

// Screenshots use page.screenshot({clip}) anchored on each row's own bounding box, NEVER
// locator.screenshot() — the latter calls Playwright's scrollIntoViewIfNeeded() internally and
// would silently scroll the table's checkpoint strip horizontally between rows, invalidating the
// "resting scrollLeft=0" premise this whole section depends on (this bit the previous round's
// row-3 close-up screenshot; see the comment near scenario 3 above).
const rowClip = async (noiRef) => {
    const box = await rowFor(noiRef).boundingBox();
    return { x: 0, y: box.y, width: page.viewportSize().width, height: box.height };
};

const lowBox = await geometryCheck('QTS-QWUP1-NOI-000001', 'row 1 (LOW, "Inspected")');
await page.screenshot({ path: `${OUT}/qw-06-mobile-row1-geometry.png`, clip: await rowClip('QTS-QWUP1-NOI-000001') });
const midBox = await geometryCheck('QTS-QWUP1-NOI-000002', 'row 2 (22%, "NCR Review")');
await page.screenshot({ path: `${OUT}/qw-07-mobile-row2-geometry.png`, clip: await rowClip('QTS-QWUP1-NOI-000002') });
const doneBox = await geometryCheck('QTS-QWUP1-NOI-000003', 'row 3 (DONE, "Accepted")');
await page.screenshot({ path: `${OUT}/qw-08-mobile-row3-geometry.png`, clip: await rowClip('QTS-QWUP1-NOI-000003') });
check(lowBox.y !== midBox.y && midBox.y !== doneBox.y, 'R1: the three rows are at genuinely different vertical positions (sanity — not three checks against the same accidental box)');
const postCheckScrollLeft = await page.evaluate(() => document.querySelector('table')?.parentElement?.scrollLeft);
check(postCheckScrollLeft !== null && postCheckScrollLeft <= 5, `R1: the table's horizontal scroll is STILL ~0 after all three geometry checks and screenshots (got ${postCheckScrollLeft}) — confirms none of the measurement/screenshot steps themselves caused a sideways scroll`);
await page.screenshot({ path: `${OUT}/qw-09-mobile-full-table-view.png`, fullPage: false });

await page.setViewportSize({ width: 1440, height: 1000 });
await page.waitForTimeout(300);

// ── AC5: project switch does not leave stale current-step text behind ──
log('=== 7. project switch: no stale current-step text left over ===');
await page.locator('button[title="Select Project"]').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Q-Workflow Current-Step Review P2/ }).click();
await page.waitForTimeout(700);
check(await rowFor('QTS-QWUP1-NOI-000001').count() === 0, 'After switching to P2, P1\'s row (and its old current-step text) is no longer present at all');
const p2Text = await currentStepLineOf('QTS-QWUP2-NOI-000001').innerText();
const p2GroundTruth = await groundTruthCurrentCheckpoint('QTS-QWUP2-NOI-000001');
check(p2Text === `Current step: ${p2GroundTruth}`, `P2's own row shows ITS OWN current-step text, matching its own ground truth (got "${p2Text}")`);
await page.screenshot({ path: `${OUT}/qw-04-after-project-switch-p2.png` });
// Switch back to All Projects and confirm P1's row (and its correct text) is back, not stuck on P2's.
await page.locator('button[title="Select Project"]').click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /All Projects/ }).click();
await page.waitForTimeout(700);
const lowTextAfterSwitchBack = await currentStepLineOf('QTS-QWUP1-NOI-000001').innerText();
check(lowTextAfterSwitchBack === lowText, `After switching back to All Projects, row 1 shows its correct text again, unchanged by the detour through P2 (got "${lowTextAfterSwitchBack}")`);

// ── AC7: checkpoint node click still opens the correct record — ONLY the NOI-deep-link path
// (wh_inspection -> /noi) is actually exercised here. This script does NOT click an ITR- or
// NCR-deep-linking checkpoint (e.g. 'itr', 'ncr', 'moc') — handleCheckpointClick's other
// branches are unmodified by this batch and are not independently tested by this script; do not
// read this one passing check as coverage of those other branches too. ──
log('=== 8. checkpoint node click still opens the correct record (NOI path only — see comment above) ===');
const whInspectionCell = rowFor('QTS-QWUP1-NOI-000001').locator('[data-checkpoint="wh_inspection"]');
await whInspectionCell.click();
await page.waitForURL(u => u.pathname === '/noi');
await page.waitForTimeout(500);
check(await page.locator('input[value="QTS-QWUP1-NOI-000001"]').count() === 1, 'Clicking the wh_inspection checkpoint node still opens the expected NOI record (reference number visible in the opened modal) — NOI deep-link path only');
await page.screenshot({ path: `${OUT}/qw-05-node-click-opens-correct-record.png` });

log(`===== Q-WORKFLOW CURRENT-STEP REVIEW DONE: ${checks} checks passed =====`);
await browser.close();
