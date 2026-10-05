// ITR-INPUT-UX-IMPLEMENT-2026-006: verifies the ITR print preview now actually includes the
// linked Checklist's Item/Criteria/Situation/Result data — completely absent before this round.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITR_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITR_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITR_INPUT_UX_IMPLEMENT6_EVIDENCE_DIR || '/private/tmp/claude-501/itr-input-ux-implement-2026-006-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let totalChecks = 0, failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1200 } });
page.setDefaultTimeout(15000);

await page.addInitScript(() => localStorage.setItem('language', 'en'));
await page.goto(`${BASE}/login`);
await page.fill('#email', 'itrux_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));

// ═══════════════ ITR2: has a Pass-result item with long multi-line Situation ═══════════════
log('=== ITR2 (locked, has a judged Checklist item): print should show full Item/Criteria/Situation/Result ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-IUX2-ITR-000002' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Print', exact: true }).click();
await page.waitForTimeout(400);

const checklistHeading = page.locator('div', { hasText: 'QTS-IUX2-CHK-000002' }).filter({ hasText: 'Rebar Cover' }).first();
assertTrue(await checklistHeading.count() >= 1, 'print1: the linked checklist\'s record number + activity heading is printed');

// Column order: # | Item (matched, "Rebar cover thickness") | Criteria (sibling 1) |
// Situation (sibling 2) | Result (sibling 3).
const itemCell = page.locator('td', { hasText: 'Rebar cover thickness' }).first();
const resultCell = itemCell.locator('xpath=following-sibling::td[3]');
const resultText = (await resultCell.innerText()).trim();
assertTrue(resultText === 'Pass', `print2: the Result column shows the human label "Pass" (got "${resultText}")`);

const situationCell = itemCell.locator('xpath=following-sibling::td[2]');
const situationText = await situationCell.innerText();
assertTrue(situationText.includes('SITU-MARK-TWO-xyz789'), `print3: the full Situation text (incl. trailing marker) is printed (text: "${situationText.slice(0, 60)}...")`);
const situationWhiteSpace = await situationCell.evaluate(el => getComputedStyle(el).whiteSpace);
assertTrue(situationWhiteSpace === 'pre-wrap', `print4: the Situation cell preserves newlines (white-space: ${situationWhiteSpace})`);

await page.screenshot({ path: `${OUT}/print-with-checklist-results.png`, fullPage: true });
await page.getByRole('button', { name: 'Close', exact: true }).first().click();
await page.waitForTimeout(300);

// ═══════════════ ITR1: has an unfilled item ("Not filled") ═══════════════
log('=== ITR1 (unfilled item): Result column should show "Not filled", not blank ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-IUX2-ITR-000001' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Print', exact: true }).click();
await page.waitForTimeout(400);
const unfilledResultCell = page.locator('td', { hasText: 'Rebar cover thickness' }).first().locator('xpath=following-sibling::td[3]');
const unfilledResultText = (await unfilledResultCell.innerText()).trim();
assertTrue(unfilledResultText.length > 0 && unfilledResultText !== '-', `print5: an unfilled item's Result shows a real label like "Not filled", not blank or a bare dash (got "${unfilledResultText}")`);
await page.getByRole('button', { name: 'Close', exact: true }).first().click();
await page.waitForTimeout(300);

// ═══════════════ New unsaved ITR: no linked checklist — the new section must render nothing ═══════════════
log('=== New (unsaved) ITR with no linked checklist: the Checklist print section should not appear at all ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Add New ITR' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Print', exact: true }).click();
await page.waitForTimeout(400);
const anyChecklistTable = await page.locator('th', { hasText: 'Situation' }).count();
assertTrue(anyChecklistTable === 0, `print6: no Checklist items table is printed when nothing is linked (found ${anyChecklistTable} "Situation" column headers)`);

await browser.close();
log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
