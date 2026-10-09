// ITR-INPUT-UX-IMPLEMENT-2026-005: verifies the Related ITP print-preview fix in ITRModals.tsx —
// the print preview's "Related ITP" row must now show the same live NOI-derived value as the
// on-screen form field (round 003), instead of the dead `itpNo` field it used to read.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITR_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITR_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITR_INPUT_UX_IMPLEMENT5_EVIDENCE_DIR || '/private/tmp/claude-501/itr-input-ux-implement-2026-005-evidence';
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

// ═══════════════ ITR1: NOI-linked, ITP present — print should show it ═══════════════
log('=== ITR1 (NOI-linked to an ITP): print preview Related ITP should match the on-screen value ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-IUX2-ITR-000001' }).click();
await page.waitForTimeout(500);

const onScreenValue = await page.locator('label', { hasText: 'Related ITP' }).locator('xpath=..').locator('input[readonly]').inputValue();
assertTrue(onScreenValue === 'QTS-IUX2-ITP-000001', `pre1: on-screen Related ITP shows the real linked ITP (got "${onScreenValue}")`);

await page.getByRole('button', { name: 'Print', exact: true }).click();
await page.waitForTimeout(400);
const printTd = page.locator('td', { hasText: 'Related ITP' }).locator('xpath=following-sibling::td[1]').first();
const printValue = await printTd.innerText();
assertTrue(printValue.trim() === onScreenValue, `print1: print preview's Related ITP row EXACTLY matches the on-screen value ("${printValue.trim()}" === "${onScreenValue}")`);
await page.screenshot({ path: `${OUT}/print-preview-related-itp.png` });
await page.getByRole('button', { name: 'Close', exact: true }).first().click();
await page.waitForTimeout(300);

// ═══════════════ ITR without a linked NOI/ITP (create a throwaway unsaved one) — print should show "-" not garbage ═══════════════
log('=== New (unsaved) ITR with no NOI linked: print preview Related ITP should show "-", not blank/undefined/null text ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Add New ITR' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Print', exact: true }).click();
await page.waitForTimeout(400);
const printTdEmpty = page.locator('td', { hasText: 'Related ITP' }).locator('xpath=following-sibling::td[1]').first();
const printValueEmpty = (await printTdEmpty.innerText()).trim();
assertTrue(printValueEmpty === '-', `print2: with no NOI linked, print preview shows the placeholder "-" (got "${printValueEmpty}")`);
assertTrue(!printValueEmpty.toLowerCase().includes('undefined') && !printValueEmpty.toLowerCase().includes('null'), 'print3: no "undefined"/"null" leaked into the print row');

await browser.close();
log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
