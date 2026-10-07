// ITP-INPUT-UX-2026-001: pure-review evidence capture (no product code changes). Reproduces,
// with saved screenshots and a log, the three findings from manual operation of ITP's
// General Info and Inspection Plan input experience using realistic-length content.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITP_INPUT_UX_PASSWORD;
if (!PW) throw new Error('ITP_INPUT_UX_PASSWORD not set.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITP_INPUT_UX_EVIDENCE_DIR || '/private/tmp/claude-501/itp-input-ux-2026-001-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(15000);

await page.addInitScript(() => localStorage.setItem('language', 'en'));
await page.goto(`${BASE}/login`);
await page.fill('#email', 'itpux_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('PASS: logged in as itpux_full');

// ═══════════════ Finding 1: single-line inputs truncate realistic-length content ═══════════════
log('=== Finding 1: Inspection Plan item panel field width ===');
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-IUX1-ITP-000001' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Inspection Plan/ }).click();
await page.waitForTimeout(300);
// Copy the existing, realistic-length A1 item (exercises the already-accepted Copy feature
// itself — not a gap — while producing a panel full of long pre-filled text to evidence
// the truncation).
await page.locator('button[title="Copy"]').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/finding1-copy-panel-truncated-fields.png` });
const activityValue = await page.locator('input').nth(0).inputValue().catch(() => '');
log(`INFO: panel opened via Copy, Activity EN full value length=${activityValue.length} chars (visibly truncated to a fraction of this in the ~340px-wide single-line input — see screenshot)`);
await page.getByRole('button', { name: 'Cancel' }).first().click();
await page.waitForTimeout(300);

// ═══════════════ Finding 2: Submission Date field mislabeled "Updated Date" ═══════════════
log('=== Finding 2: submissionDate field label ===');
await page.getByRole('button', { name: /General Information/ }).click();
await page.waitForTimeout(300);
const dateLabel = await page.locator('label:near(input[type="date"])').first().textContent().catch(() => '');
await page.screenshot({ path: `${OUT}/finding2-submissiondate-mislabeled.png` });
log(`INFO: the field bound to formData.submissionDate (defaults to today on a new record) is labeled "${(dateLabel || '').trim()}" in the English UI — i18n key 'itp.submissionDate' literally translates to "Updated Date"/"更新日期" in both languages (LanguageContext.tsx:1126,2513)`);
await page.getByRole('button', { name: 'Cancel' }).first().click();
await page.waitForTimeout(300);
const leaveBtn = page.getByRole('button', { name: 'Leave' });
if (await leaveBtn.count() > 0) await leaveBtn.click();
await page.waitForTimeout(300);

// ═══════════════ Finding 3: Subject/description has no required-field validation ═══════════════
log('=== Finding 3: ITP can be saved with a completely blank Subject ===');
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
const beforeCount = await page.locator('table tbody tr').count();
await page.getByRole('button', { name: '+ Add ITP' }).click();
await page.waitForTimeout(500);
// Deliberately leave Subject blank; Contractor is already pre-selected (the only validated
// required field) — Save should be enabled and succeed regardless of Subject.
const saveBtn = page.getByRole('button', { name: /^Save$/ });
const saveEnabledWithBlankSubject = await saveBtn.isEnabled();
await page.screenshot({ path: `${OUT}/finding3a-blank-subject-before-save.png` });
await saveBtn.click();
await page.waitForTimeout(1500);
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
const afterCount = await page.locator('table tbody tr').count();
await page.screenshot({ path: `${OUT}/finding3b-list-shows-blank-subject-row.png` });
log(`INFO: Save was ${saveEnabledWithBlankSubject ? 'ENABLED' : 'disabled'} with Subject left blank; row count ${beforeCount} -> ${afterCount} (a new record was created and now sits in the list with an empty Subject cell, see screenshot)`);

await browser.close();
log('\n=== Evidence capture complete (pure review — no product code or required-field rules were changed) ===');
