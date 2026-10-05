// ITR-INPUT-UX-IMPLEMENT-2026-003: real-browser acceptance for three ITR main-form changes:
//   1. Related ITP: dropdown removed, replaced with a value derived live from the linked NOI's
//      itpNo -> ITP.referenceNo, consistent whether read right after picking a NOI or after a
//      fresh reopen (the old dropdown's dead-field inconsistency, confirmed in
//      ITR-INPUT-UX-2026-001/IMPLEMENT-2026-002).
//   2. Quality Assessment (Inspection Result/Status/Close-out Date/Remark) moved to right after
//      Linked Checklists, before the photo/attachment sections; those four sections are now
//      collapsible via the new CollapsibleSection component.
//   3. "From NOI" hints under Subject/Contractor/Inspection Date/Related ITP when NOI-linked.
//
// This round is a product code change (not pure review) — round 001/002's already-verified
// Checklist Situation save/lock/cancel/retry behavior is NOT re-tested here (out of scope per
// TASK.md); only a light sanity pass confirms the Checklist section still opens correctly.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITR_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITR_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITR_INPUT_UX_IMPLEMENT3_EVIDENCE_DIR || '/private/tmp/claude-501/itr-input-ux-implement-2026-003-evidence';
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

// ═══════════════ Part 1: Related ITP — consistent derived value ═══════════════
log('=== Part 1: Related ITP shows the NOI-linked ITP, same before and after reopen ===');
const page = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
page.setDefaultTimeout(15000);
await loginOnPage(page);
await openItr(page, 'QTS-IUX2-ITR-000001');

const relatedItpSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select ITP' }) });
assertTrue(await relatedItpSelect.count() === 0, 'itp1: the old Related ITP <select> dropdown no longer exists');

const relatedItpLabel = page.locator('label', { hasText: 'Related ITP' });
assertTrue(await relatedItpLabel.count() === 1, 'itp2: a "Related ITP" label is still present');
const relatedItpGroup = relatedItpLabel.locator('xpath=..');
const relatedItpInput = relatedItpGroup.locator('input[readonly]');
const relatedItpValueBefore = await relatedItpInput.inputValue();
assertTrue(relatedItpValueBefore === 'QTS-IUX2-ITP-000001', `itp3: Related ITP shows the real NOI-linked ITP reference number (got "${relatedItpValueBefore}")`);
const itpHint = relatedItpGroup.locator('small', { hasText: 'From NOI' });
assertTrue(await itpHint.count() === 1, 'itp4: a "From NOI" hint appears under the Related ITP value');
await page.screenshot({ path: `${OUT}/desktop-related-itp-and-noi-hints.png`, fullPage: true });

log('=== Part 1 (continued): fresh context reopen shows the SAME value (no dead-field inconsistency) ===');
const page2 = await browser.newPage({ viewport: { width: 1280, height: 1100 } });
page2.setDefaultTimeout(15000);
await loginOnPage(page2);
await openItr(page2, 'QTS-IUX2-ITR-000001');
const relatedItpInput2 = page2.locator('label', { hasText: 'Related ITP' }).locator('xpath=..').locator('input[readonly]');
const relatedItpValueAfter = await relatedItpInput2.inputValue();
assertTrue(relatedItpValueAfter === relatedItpValueBefore, `itp5: fresh-context reopen shows EXACTLY the same Related ITP value ("${relatedItpValueAfter}" === "${relatedItpValueBefore}") — no before/after-reload inconsistency`);

// ═══════════════ Part 2: Quality Assessment order + collapsible attachment sections ═══════════════
log('=== Part 2: Quality Assessment appears before photo/attachment sections; sections collapse ===');
const sectionTitles = await page2.locator('h3, button').evaluateAll(els =>
    els.map(el => el.textContent?.trim()).filter(t => t && [
        'Linked Checklists', 'Quality Assessment', 'Inspection Result', 'Latest Drawings',
    ].some(k => t.includes(k)))
);
const idxChecklists = sectionTitles.findIndex(t => t.includes('Linked Checklists'));
const idxQuality = sectionTitles.findIndex(t => t.includes('Quality Assessment') || t.includes('Inspection Result'));
const idxDrawings = sectionTitles.findIndex(t => t.includes('Latest Drawings'));
assertTrue(idxChecklists !== -1 && idxQuality !== -1 && idxDrawings !== -1, `order0: all three landmark sections found in DOM order scan (${JSON.stringify(sectionTitles)})`);
assertTrue(idxChecklists < idxQuality && idxQuality < idxDrawings, `order1: DOM order is Linked Checklists -> Quality Assessment -> Latest Drawings (indices ${idxChecklists}, ${idxQuality}, ${idxDrawings})`);

const drawingsToggle = page2.getByRole('button', { name: /Latest Drawings/ });
assertTrue(await drawingsToggle.count() === 1, 'collapse1: the "Latest Drawings" section header is a clickable toggle button');
const uploadButtonBefore = await page2.getByText('Upload Files').count();
await drawingsToggle.click();
await page2.waitForTimeout(200);
const uploadButtonAfterExpand = await page2.getByText('Upload Files').count();
assertTrue(uploadButtonAfterExpand !== uploadButtonBefore, `collapse2: clicking the Latest Drawings header actually toggled its content (Upload Files count ${uploadButtonBefore} -> ${uploadButtonAfterExpand})`);
await drawingsToggle.click();
await page2.waitForTimeout(200);
const uploadButtonAfterCollapse = await page2.getByText('Upload Files').count();
assertTrue(uploadButtonAfterCollapse === uploadButtonBefore, `collapse3: clicking it again toggled back to the original state (${uploadButtonAfterCollapse} === ${uploadButtonBefore})`);

// ═══════════════ Part 3: "From NOI" hints on Subject/Contractor/Inspection Date ═══════════════
log('=== Part 3: "From NOI" hints on the NOI-locked basic-info fields ===');
const fromNoiHints = await page2.locator('small', { hasText: 'From NOI' }).count();
assertTrue(fromNoiHints >= 4, `hint1: at least 4 "From NOI" hints are shown (Subject/Contractor/Inspection Date/Related ITP) (found ${fromNoiHints})`);

// ═══════════════ Sanity: Checklist section still opens (round 001/002 behavior untouched) ═══════════════
log('=== Sanity: Linked Checklists section still expands correctly (not re-testing round 001/002 in depth) ===');
const checklistRow = page2.locator('div.cursor-pointer').filter({ hasText: 'QTS-IUX2-CHK-000001' });
await checklistRow.first().click();
await page2.waitForTimeout(300);
const checklistItemsTab = page2.getByRole('button', { name: /Checklist Items/ });
assertTrue(await checklistItemsTab.count() === 1, 'sanity1: the Checklist Items tab is still reachable after this round\'s layout changes');
await checklistItemsTab.click();
await page2.waitForTimeout(200);
const situationTextarea = page2.locator('textarea[data-situation-input="0"]');
assertTrue(await situationTextarea.count() === 1, 'sanity2: the Situation textarea (round 001 feature) still renders correctly');

await page.close(); await page2.close();
await browser.close();

log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
