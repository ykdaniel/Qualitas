// NOI-EXPORT-DOCX-2026-001: frontend-side check — the "Export Word" button exists only for a
// saved NOI and actually triggers a .docx download. Content-level verification is done
// separately via backend/scripts/verification/verify_noi_export_docx.py.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.NOI_EXPORT_DOCX_PASSWORD;
if (!PW) throw new Error('NOI_EXPORT_DOCX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.NOI_EXPORT_DOCX_EVIDENCE_DIR || '/private/tmp/claude-501/noi-export-docx-2026-001-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

let totalChecks = 0, failures = 0;
const assertTrue = (cond, msg) => {
    totalChecks++;
    if (!cond) { failures++; log(`FAIL: ${msg}`); } else { log(`PASS: ${msg}`); }
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
page.setDefaultTimeout(15000);

await page.addInitScript(() => localStorage.setItem('language', 'en'));
await page.goto(`${BASE}/login`);
await page.fill('#email', 'noidocx_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));

log('=== Saved NOI (QTS-NDX1-NOI-000001): Export Word button exists and downloads ===');
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-NDX1-NOI-000001' }).click();
await page.waitForTimeout(500);

const exportBtn = page.getByRole('button', { name: 'Export Word', exact: true });
assertTrue(await exportBtn.count() === 1, 'export1: "Export Word" button is present on a saved NOI');

const downloadPromise = page.waitForEvent('download');
await exportBtn.click();
const download = await downloadPromise;
assertTrue(download.suggestedFilename().endsWith('.docx'), `export2: the downloaded file has a .docx extension (got "${download.suggestedFilename()}")`);
await download.saveAs(`${OUT}/${download.suggestedFilename()}`);
log(`INFO: saved download to ${OUT}/${download.suggestedFilename()}`);
await page.locator('button[aria-label="Close"], button[title="Close"]').first().click().catch(() => {});
await page.waitForTimeout(300);

log('=== New (unsaved) NOI: Export Word button should not be offered ===');
await page.goto(`${BASE}/noi`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Add New NOI/i }).click();
await page.waitForTimeout(500);
const exportBtnOnNew = await page.getByRole('button', { name: 'Export Word', exact: true }).count();
assertTrue(exportBtnOnNew === 0, `export3: no "Export Word" button on an unsaved new NOI (found ${exportBtnOnNew})`);

await browser.close();
log(`\n=== SUMMARY: ${totalChecks} checks executed, ${totalChecks - failures} PASS, ${failures} FAIL ===`);
if (failures > 0) process.exit(1);
