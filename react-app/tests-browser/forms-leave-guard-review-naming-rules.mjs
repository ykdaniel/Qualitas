import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';

// R5/R6: cross-checks state.root against isolated_stack.py's OWN on-disk marker/state files
// (not just the JSON string the caller happened to pass) — see
// forms-leave-guard-review-isolation-guard.mjs for what this actually verifies and
// forms-leave-guard-review-isolation-guard-selftest.mjs for the negative-path proof.
verifyIsolatedTarget(state);

// No hardcoded or defaulted test password anywhere in this repo — must match what the
// seed script was run with (see seed_forms_leave_guard_review.py's own env var requirement).
const PW = process.env.FORMS_TEST_PASSWORD;
if (!PW) throw new Error('FORMS_TEST_PASSWORD not set — export the same value used for seeding before running this script.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
// FORMS-2026-005 (R2): each round must use its OWN output directory — see osd.mjs's comment.
const OUT = process.env.FORMS_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/forms-2026-005-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'forms_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

const osdPrefixField = () => page.locator('table tbody tr').filter({ hasText: 'PQP' }).locator('input[type="text"]');

// ── 1. Load unmodified, navigate away in-app (no Cancel exists — full-page editor) -> no false prompt ──
log('=== NAMING RULES 1. load unmodified, in-app navigate away -> no false prompt ===');
await page.goto(`${BASE}/document-naming-rules`);
await page.waitForTimeout(700);
await osdPrefixField().waitFor({ state: 'visible' });
await page.getByRole('link', { name: 'Dashboard', exact: true }).click().catch(async () => {
    await page.locator('a,button').filter({ hasText: 'Dashboard' }).first().click();
});
await page.waitForTimeout(500);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'NamingRules: no-change in-app navigation does not show unsaved prompt');
check(page.url().includes('/document-naming-rules') === false, 'NamingRules: no-change navigation actually left the page');
await page.screenshot({ path: `${OUT}/naming-01-no-change-navigate.png` });

// ── 2. Edit, navigate away -> prompt; Stay keeps field; Leave discards ──
log('=== NAMING RULES 2. edit, navigate away -> Stay keeps / Leave discards ===');
await page.goto(`${BASE}/document-naming-rules`);
await page.waitForTimeout(700);
await osdPrefixField().waitFor({ state: 'visible' });
const originalPrefix = await osdPrefixField().inputValue();
await osdPrefixField().fill('QTS-RKS-[ABBREV]-OSDEDIT-');
await page.locator('a,button').filter({ hasText: 'Dashboard' }).first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/naming-02-dirty-navigate-prompt.png` });
const stayBtn = page.getByRole('button', { name: /Stay/i });
check(await stayBtn.count() > 0, 'NamingRules: dirty in-app navigation shows confirm dialog');
await stayBtn.click();
await page.waitForTimeout(300);
check(page.url().includes('/document-naming-rules'), 'NamingRules: Stay keeps user on the naming-rules page');
check((await osdPrefixField().inputValue()) === 'QTS-RKS-[ABBREV]-OSDEDIT-', 'NamingRules: Stay preserves the edited field');
await page.locator('a,button').filter({ hasText: 'Dashboard' }).first().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Leave/i }).click();
await page.waitForTimeout(600);
check(!page.url().includes('/document-naming-rules'), 'NamingRules: Leave actually navigates away');
await page.goto(`${BASE}/document-naming-rules`);
await page.waitForTimeout(700);
await osdPrefixField().waitFor({ state: 'visible' });
const freshPrefix = await osdPrefixField().inputValue();
check(freshPrefix === originalPrefix, `NamingRules: Leave discarded edit, reopened value is original (got "${freshPrefix}")`);

// ── 2b. Comparison baseline is established only after successful load ──
log('=== NAMING RULES 2b. baseline only after load ===');
const apiCallsAtLoad = [];
page.on('response', async (r) => { if (r.url().includes('/api/settings/naming-rules') && r.request().method() === 'GET') apiCallsAtLoad.push(r.status()); });

// ── 3. Normal save: request/response status+body + reread ──
log('=== NAMING RULES 3. normal save (request + response status/body + reread) ===');
const apiCalls = [];
page.on('request', r => { if (r.url().includes('/api/settings/naming-rules') && r.method() === 'PUT') apiCalls.push({ url: r.url(), postData: r.postData() }); });
let saveResponse = null;
page.on('response', async (r) => {
    if (r.url().includes('/api/settings/naming-rules') && r.request().method() === 'PUT') saveResponse = { status: r.status(), body: await r.json().catch(() => null) };
});
await osdPrefixField().fill('QTS-RKS-[ABBREV]-OSDSAVED-');
apiCalls.length = 0;
await page.getByRole('button', { name: /^(Save|Saved)$/ }).click();
await page.waitForTimeout(1000);
check(apiCalls.length === 1, `NamingRules: exactly one save request sent (got ${apiCalls.length})`);
check(apiCalls[0].postData?.includes('OSDSAVED'), 'NamingRules: save request body contains new value');
check(saveResponse?.status >= 200 && saveResponse?.status < 300, `NamingRules: save response status is 2xx (got ${saveResponse?.status})`);
const savedPqpRule = Array.isArray(saveResponse?.body) ? saveResponse.body.find(r => r.doc_type === 'pqp') : null;
check(savedPqpRule?.prefix === 'QTS-RKS-[ABBREV]-OSDSAVED-', `NamingRules: save response BODY reflects the new prefix for the pqp rule (got "${savedPqpRule?.prefix}")`);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'NamingRules: no leftover unsaved-changes prompt after save (page stays, existing design)');
await page.screenshot({ path: `${OUT}/naming-03-after-normal-save.png` });
await page.reload();
await page.waitForTimeout(700);
await osdPrefixField().waitFor({ state: 'visible' });
const reopenedPrefix = await osdPrefixField().inputValue();
check(reopenedPrefix === 'QTS-RKS-[ABBREV]-OSDSAVED-', `NamingRules: reread after reload matches saved value (got "${reopenedPrefix}")`);
await page.screenshot({ path: `${OUT}/naming-04-after-reload-reread.png` });

// ── 3b. R3: click REAL in-app navigation WHILE save is pending (not after) ──
// This is the full-page-editor counterpart to OSD's unreachable modal case (see
// forms-leave-guard-review-osd.mjs scenario 6's comment): DocumentNamingRules has no overlay
// in front of the sidebar, so a genuine click on the Dashboard link while the PUT is in flight
// is directly reachable and exercises Shared/LeaveGuard.tsx's real mechanism end to end: the
// navigation must be BLOCKED while busy (a confirm dialog with pending=true / "Saving..." stacks
// on top), then resume ON ITS OWN once the save completes and the guard releases — no second
// click from this script.
log('=== NAMING RULES 3b. click real in-app navigation WHILE save is pending ===');
let delayResolve;
const delayPromise = new Promise(r => { delayResolve = r; });
let pendingPutCount = 0;
await page.route('**/api/settings/naming-rules', async (route) => {
    if (route.request().method() === 'PUT') {
        pendingPutCount++;
        await delayPromise;
        await route.continue();
    } else await route.continue();
});
await osdPrefixField().fill('QTS-RKS-[ABBREV]-PENDINGNAV-');
await page.getByRole('button', { name: /^(Save|Saved)$/ }).click();
await page.waitForTimeout(200); // the PUT is now in flight, held by delayPromise — genuinely pending
const urlBeforePendingNav = page.url();
check(urlBeforePendingNav.includes('/document-naming-rules'), 'NamingRules pending-nav: still on the page right before clicking nav (save genuinely in flight)');
// Click the REAL sidebar link while the save is pending — directly reachable here, no overlay.
await page.locator('a,button').filter({ hasText: 'Dashboard' }).first().click();
await page.waitForTimeout(400);
check(page.url() === urlBeforePendingNav, `NamingRules pending-nav: navigation is BLOCKED while save is pending — URL unchanged (still "${page.url()}")`);
// R4 (FORMS-2026-004): FORMS-2026-003's version located the "Saving..." button anywhere on the
// whole page — which could just as easily match the form's OWN Save button text, proving
// nothing about a real second-layer confirm dialog. Scope strictly to ConfirmModal's own
// rendered container (Shared/ConfirmModal.tsx: an <h2>{title}</h2> inside modalHeader, itself
// inside modalContent — two div-ancestors up from the heading) via LeaveGuard.tsx's
// `<ConfirmModal ... title={t('common.unsavedChanges')} pending={busy}
// confirmText={busy ? t('common.saving') : t('common.leave')} ... />`, anchored on the "Unsaved
// Changes" heading text — this is robust against CSS-module hash churn (Vite's default
// `_<local>_<hash>_<line>` naming is per-file-content, not matchable by a stable class prefix).
const leaveConfirmDialog = () => page.getByRole('heading', { name: 'Unsaved Changes' }).locator('xpath=ancestor::div[2]');
check(await leaveConfirmDialog().count() === 1, 'NamingRules pending-nav: exactly one real leave-confirmation dialog (ConfirmModal) is open');
const pendingDialogVisible = await leaveConfirmDialog().getByRole('button', { name: /^Saving/i }).count();
check(pendingDialogVisible === 1, 'NamingRules pending-nav: the blocked-navigation confirm dialog itself (not the form\'s own Save button) shows the pending "Saving..." state');
await page.screenshot({ path: `${OUT}/naming-04b-nav-blocked-while-pending.png` });
check(pendingPutCount === 1, `NamingRules pending-nav: exactly one PUT is in flight (got ${pendingPutCount})`);
// Let the save complete — the blocked navigation must resume BY ITSELF, no further click.
delayResolve();
await page.waitForTimeout(1200);
await page.unroute('**/api/settings/naming-rules');
// R4: must land exactly on the Dashboard route that was actually clicked — not merely "anywhere
// that isn't document-naming-rules" (an error page or an unrelated route would wrongly pass the
// old, looser check).
check(page.url().endsWith('/dashboard'), `NamingRules pending-nav: once the pending save completes, the blocked navigation resumes BY ITSELF and lands exactly on the clicked Dashboard route (got "${page.url()}")`);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'NamingRules pending-nav: no leftover unsaved-changes prompt after the deferred navigation completes');
await page.screenshot({ path: `${OUT}/naming-04c-nav-resumed-after-save.png` });
// Confirm the pending-nav save genuinely persisted (it was real, not just UI state).
await page.goto(`${BASE}/document-naming-rules`);
await page.waitForTimeout(700);
await osdPrefixField().waitFor({ state: 'visible' });
const afterPendingNavPrefix = await osdPrefixField().inputValue();
check(afterPendingNavPrefix === 'QTS-RKS-[ABBREV]-PENDINGNAV-', `NamingRules pending-nav: the save that was pending during navigation actually persisted (got "${afterPendingNavPrefix}")`);

// ── 4. Simulated save failure + retry ──
log('=== NAMING RULES 4. simulated save failure + retry ===');
let failNext = true;
const simulatedDetail = 'Simulated 500 for FORMS-2026-004 verification';
await page.route('**/api/settings/naming-rules', async (route) => {
    if (route.request().method() === 'PUT' && failNext) {
        failNext = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: simulatedDetail }) });
    } else await route.continue();
});
await osdPrefixField().fill('QTS-RKS-[ABBREV]-OSDFAIL-');
const saveBtn = page.getByRole('button', { name: /^Save$/ });
await saveBtn.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/naming-05-save-failure.png` });
check((await osdPrefixField().inputValue()) === 'QTS-RKS-[ABBREV]-OSDFAIL-', 'NamingRules: input preserved after failed save');
check(await saveBtn.isEnabled(), 'NamingRules: Save button re-enabled after failure');
// R3 (FORMS-2026-004): DocumentNamingRules.tsx's catch (non-403 branch) builds
// `命名規則儲存失敗：${err.response?.data?.detail ?? err.message ?? ...}` — unlike every other
// form in this batch, it does NOT hide a 5xx body, so the exact text below is traceable straight
// to that line, not a loose "any error-looking text" match.
const errorTextEls = page.locator('[class*="errorText"]');
check(await errorTextEls.count() === 1, `NamingRules: EXACTLY one inline error message element is shown (got ${await errorTextEls.count()})`);
const errorText = await errorTextEls.first().innerText();
const expectedErrorText = `命名規則儲存失敗：${simulatedDetail}`;
check(errorText === expectedErrorText, `NamingRules: the inline error message matches exactly (got "${errorText}", expected "${expectedErrorText}")`);
await osdPrefixField().fill('QTS-RKS-[ABBREV]-OSDRETRY-');
apiCalls.length = 0;
await saveBtn.click();
await page.waitForTimeout(1000);
await page.unroute('**/api/settings/naming-rules');
check(apiCalls.length === 1, `NamingRules retry: exactly one request on retry (got ${apiCalls.length})`);
check(apiCalls[0].postData?.includes('OSDRETRY'), 'NamingRules retry: retry carries latest value');
await page.reload();
await page.waitForTimeout(700);
await osdPrefixField().waitFor({ state: 'visible' });
const finalPrefix = await osdPrefixField().inputValue();
check(finalPrefix === 'QTS-RKS-[ABBREV]-OSDRETRY-', `NamingRules retry: DB reflects retried save (got "${finalPrefix}")`);
await page.screenshot({ path: `${OUT}/naming-06-after-retry-reread.png` });

log(`===== NAMING RULES DONE: ${checks} checks passed =====`);
await browser.close();

// ── R3: DocumentNamingRules readOnly (no settings:manage:all) has no save entry point ──
log('=== NAMING RULES readOnly (view-only account) has no save entry point ===');
const browser2 = await chromium.launch();
const page2 = await browser2.newPage({ viewport: { width: 1440, height: 1000 } });
page2.setDefaultTimeout(15000);
await page2.addInitScript(() => localStorage.setItem('language', 'en'));
await page2.goto(`${BASE}/login`);
await page2.fill('#email', 'forms_role_readonly');
await page2.fill('#password', PW);
await page2.click('button[type=submit]');
await page2.waitForURL(u => !u.pathname.includes('/login'));
await page2.goto(`${BASE}/document-naming-rules`);
await page2.waitForTimeout(700);
const readOnlyPrefixField = page2.locator('table tbody tr').filter({ hasText: 'PQP' }).locator('input[type="text"]');
await readOnlyPrefixField.waitFor({ state: 'visible' });
check(await page2.getByRole('button', { name: /^Save$/ }).count() === 0, 'NamingRules readOnly: no Save button rendered for an account without settings:manage:all');
check(await readOnlyPrefixField.isDisabled(), 'NamingRules readOnly: prefix input is disabled (fieldset disabled)');
await page2.screenshot({ path: `${OUT}/naming-07-readonly.png` });
await browser2.close();

log(`===== NAMING RULES (incl. readOnly) TOTAL: ${checks} checks passed =====`);
