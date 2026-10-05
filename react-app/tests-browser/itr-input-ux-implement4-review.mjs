// ITR-INPUT-UX-IMPLEMENT-2026-004: verifies two ChecklistSnapshotModal.tsx UX tweaks in a locked
// (ITR Approved) context, WITHOUT ever clicking "Revoke Approval" or any other mutating button —
// only read-only navigation (open ITR, click the checklist row, read the panel) is performed.
//   1. The panel opens straight to "Checklist Items" (not "General Information") when readOnly.
//   2. The "viewing a snapshot" note and the "locked because..." note are merged into one banner
//      instead of two stacked boxes.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITR_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITR_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITR_INPUT_UX_IMPLEMENT4_EVIDENCE_DIR || '/private/tmp/claude-501/itr-input-ux-implement-2026-004-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let totalChecks = 0, failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);

await page.addInitScript(() => localStorage.setItem('language', 'en'));
await page.goto(`${BASE}/login`);
await page.fill('#email', 'itrux_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));

await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-IUX2-ITR-000002' }).click();
await page.waitForTimeout(500);

const statusBadges = await page.locator('h2').filter({ hasText: /Edit ITR|View ITR/ }).innerText();
assertTrue(statusBadges.includes('View ITR'), `pre1: QTS-IUX2-ITR-000002 opened as "View ITR" (locked/Approved), not "Edit ITR" (got "${statusBadges}")`);

await page.locator('div.cursor-pointer').filter({ hasText: 'QTS-IUX2-CHK-000002' }).first().click();
await page.waitForTimeout(400);

// Check 1: Checklist Items tab is the active one, not General Information.
const itemsTab = page.getByRole('button', { name: /Checklist Items/ });
const generalTab = page.getByRole('button', { name: /General Information/ });
const itemsTabClasses = await itemsTab.getAttribute('class');
const generalTabClasses = await generalTab.getAttribute('class');
assertTrue(itemsTabClasses?.includes('border-blue-600'), `default-tab1: "Checklist Items" tab is the active one by default when locked (class="${itemsTabClasses}")`);
assertTrue(!generalTabClasses?.includes('border-blue-600'), `default-tab2: "General Information" tab is NOT active by default when locked`);
// Content check: the Situation/Result table should already be visible without clicking anything.
const resultHeader = await page.locator('th', { hasText: 'Result' }).count();
assertTrue(resultHeader === 1, 'default-tab3: the Checklist Items table (with a "Result" column) is already visible without switching tabs');

// Check 2: banners merged into one when locked.
const amberBanner = page.locator('div.bg-amber-50').filter({ hasText: /Approved|snapshot/i });
const blueBanner = page.locator('div.bg-blue-50');
const amberCount = await amberBanner.count();
const blueCount = await blueBanner.count();
assertTrue(blueCount === 0, `banner1: no separate blue "viewing a snapshot" banner is rendered when locked (found ${blueCount})`);
assertTrue(amberCount >= 1, `banner2: a single amber banner is rendered instead (found ${amberCount})`);
if (amberCount >= 1) {
    const bannerText = await amberBanner.first().innerText();
    log(`INFO: merged banner text: "${bannerText}"`);
    assertTrue(bannerText.length > 0, 'banner3: the merged banner has readable content (not empty)');
}

await page.screenshot({ path: `${OUT}/locked-default-items-tab-merged-banner.png` });

await browser.close();
log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
