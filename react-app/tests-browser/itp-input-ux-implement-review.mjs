// ITP-INPUT-UX-IMPLEMENT-2026-001: evidence for the Inspection Plan item panel layout
// overhaul (desktop width/compactness/full-row fields/textarea/scroll behavior), plus a
// full copy -> modify -> Apply -> Save -> reopen round-trip (the gap the independent
// review flagged in the prior pure-review round).
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITP_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITP_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITP_INPUT_UX_IMPLEMENT_EVIDENCE_DIR || '/private/tmp/claude-501/itp-input-ux-implement-2026-001-evidence';
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

// ═══════════════ Desktop: panel width, compact Event No block, full-row fields ═══════════════
log('=== Desktop: panel width / layout ===');
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);
await loginOnPage(page, 'itpux_full');
await openSeededItpPlan(page);

await page.locator('button[title="Copy"]').nth(1).click(); // Copy B1 (the longer realistic item)
await page.waitForTimeout(300);
const modal = page.locator('div.max-w-\\[1100px\\]');
const box = await modal.boundingBox();
assertTrue(!!box && box.width >= 1000 && box.width <= 1100, `desktop1: panel width is within the 1000-1100px design range (actual: ${box?.width}px)`);
await page.screenshot({ path: `${OUT}/after-desktop-top.png` });

// Full-row check: Activity's row should span (approximately) the full content width, not
// share a row with Standard/Criteria — verified by the Activity label's bounding box width
// being close to the content column's width (not half of it, as it was before this batch).
const activityLabel = page.locator('text=ACTIVITY (EN/CH)').first();
const activityBox = await activityLabel.boundingBox();
const standardLabel = page.locator('text=STANDARD (EN/CH)').first();
const standardBox = await standardLabel.boundingBox();
assertTrue(!!activityBox && !!standardBox && Math.abs(activityBox.x - standardBox.x) < 5,
    `desktop2: Activity and Standard labels start at the same x position (stacked full-width rows, not side-by-side columns) — Activity.x=${activityBox?.x}, Standard.x=${standardBox?.x}`);

// Scroll to bottom: header + Apply/Cancel must stay visible, last field (Verification Points)
// must not be covered.
await page.locator('div.max-w-\\[1100px\\] div.overflow-y-auto').first().evaluate(el => { el.scrollTop = el.scrollHeight; });
await page.waitForTimeout(300);
const applyBtn = page.getByRole('button', { name: /Apply/ });
const applyBox = await applyBtn.boundingBox();
const vpLabel = page.locator('text=VERIFICATION POINTS').first();
const vpBox = await vpLabel.boundingBox();
assertTrue(!!applyBox && applyBox.y < 1000 - 5, `desktop3: Apply button still visible on screen after scrolling to the bottom (y=${applyBox?.y})`);
assertTrue(!!vpBox && !!applyBox && (vpBox.y + vpBox.height) <= applyBox.y, `desktop4: Verification Points (last field) is not covered by the Apply/Cancel footer (vp bottom=${vpBox ? vpBox.y + vpBox.height : 'n/a'}, footer top=${applyBox?.y})`);
await page.screenshot({ path: `${OUT}/after-desktop-bottom.png` });

await page.getByRole('button', { name: 'Cancel' }).first().click();
await page.waitForTimeout(300);

// ═══════════════ Full round-trip: Copy -> modify -> Apply -> Save -> reopen ═══════════════
log('=== Full round-trip: copy an existing item, modify, Apply, Save, reopen and verify ===');
await page.locator('button[title="Copy"]').nth(1).click();
await page.waitForTimeout(300);
const textareas = page.locator('textarea');
const MODIFIED_ACTIVITY_EN = 'Inspect rebar spacing, cover thickness, and lap splice length at column and beam junctions before concrete pour — SECOND POUR VERIFICATION PASS with additional camera documentation and third-party witness sign-off required for this specific event';
await textareas.nth(0).fill(MODIFIED_ACTIVITY_EN);
const beforeApplyValue = await textareas.nth(0).inputValue();
assertTrue(beforeApplyValue === MODIFIED_ACTIVITY_EN, 'roundtrip1: modified Activity EN textarea holds the full long text before Apply');
await page.screenshot({ path: `${OUT}/roundtrip1-modified-before-apply.png` });

await page.getByRole('button', { name: /Apply/ }).click();
await page.waitForTimeout(500);
const itemCountAfterApply = await page.locator('table tbody tr').count();
log(`INFO: inspection plan table now has ${itemCountAfterApply} data rows (plus phase header rows) after Apply`);

const saveBtn = page.getByRole('button', { name: /^Save$/ });
assertTrue(await saveBtn.isEnabled(), 'roundtrip2: Save button enabled after Apply');
await saveBtn.click();
await page.waitForTimeout(1500);

// Reopen the SAME record in a fresh page/context, independently re-read the copied+modified
// item's Activity text.
const page2 = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page2.setDefaultTimeout(15000);
await loginOnPage(page2, 'itpux_full');
await openSeededItpPlan(page2);
const rereadActivity = await page2.locator(`text=${MODIFIED_ACTIVITY_EN.slice(0, 60)}`).count();
assertTrue(rereadActivity > 0, `roundtrip3: after Save and independently reopening the same record, the copied+modified Activity text is present (matched on first 60 chars)`);
await page2.screenshot({ path: `${OUT}/roundtrip2-reread-after-save.png` });
await page2.close();

// ═══════════════ Narrow viewport (mobile width) ═══════════════
log('=== Narrow viewport (375px): near-full-width panel, stacked EN/CH ===');
const page3 = await browser.newPage({ viewport: { width: 375, height: 800 } });
page3.setDefaultTimeout(15000);
await loginOnPage(page3, 'itpux_full');
await openSeededItpPlan(page3);
await page3.locator('button[title="Copy"]').nth(1).click();
await page3.waitForTimeout(300);
const modal3 = page3.locator('div.max-w-\\[1100px\\]');
const box3 = await modal3.boundingBox();
assertTrue(!!box3 && box3.width >= 375 - 32 - 5, `narrow1: panel is near-full viewport width on a 375px screen (actual panel width: ${box3?.width}px)`);
await page3.screenshot({ path: `${OUT}/after-narrow-top.png` });

// EN/CH should stack (grid-cols-1) below the sm breakpoint: the two Activity textareas
// should NOT be side by side (their x positions should match, not differ).
const narrowTextareas = page3.locator('textarea');
const enBox = await narrowTextareas.nth(0).boundingBox();
const chBox = await narrowTextareas.nth(1).boundingBox();
assertTrue(!!enBox && !!chBox && Math.abs(enBox.x - chBox.x) < 5 && chBox.y > enBox.y,
    `narrow2: Activity EN/CH textareas are stacked vertically on narrow viewport (en.x=${enBox?.x}, ch.x=${chBox?.x}, ch.y=${chBox?.y} > en.y=${enBox?.y})`);

await page3.locator('div.max-w-\\[1100px\\] div.overflow-y-auto').first().evaluate(el => { el.scrollTop = el.scrollHeight; });
await page3.waitForTimeout(300);
const applyBtn3 = page3.getByRole('button', { name: /Apply/ });
assertTrue(await applyBtn3.isVisible(), 'narrow3: Apply button still visible after scrolling to bottom on narrow viewport');
await page3.screenshot({ path: `${OUT}/after-narrow-bottom.png` });
await page3.getByRole('button', { name: 'Cancel' }).first().click();
await page3.waitForTimeout(300);
await page3.close();

await browser.close();
log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
