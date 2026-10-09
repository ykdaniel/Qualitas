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

await page.goto(`${BASE}/iam`);
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Role Management', exact: true }).click();
await page.waitForTimeout(500);

const modal = () => page.locator('[class*="modalForm"]');
const closeIcon = () => page.locator('[class*="closeIconBtn"]');
const reasonField = () => modal().locator('textarea').last(); // description, then reason

// ── Create a throwaway self-created test role first (never touching real roles) ──
log('=== ROLE: create throwaway test role via UI (self-created, isolated env only) ===');
await page.getByRole('button', { name: /Add Role/i }).click();
await page.waitForTimeout(400);
await modal().locator('input[type="text"]').first().fill('FORMS-2026-001 Throwaway Test Role');
await modal().locator('textarea').first().fill('Throwaway role created only for FORMS-2026-001 leave-guard verification.');
await modal().locator('input[type="checkbox"]').first().check();
await reasonField().fill('FORMS-2026-001 verification — initial create');
await page.getByRole('button', { name: /^Add$/ }).click();
await page.waitForTimeout(800);
check(await modal().count() === 0, 'Role: create succeeds and modal closes');
await page.screenshot({ path: `${OUT}/role-00-created.png` });

// ── 1. Open existing (the one we just made), no change, close -> no prompt ──
log('=== ROLE 1. open existing, no change, close -> no prompt ===');
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
await closeIcon().click();
await page.waitForTimeout(400);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'Role: no-change close does not show unsaved prompt');
await page.screenshot({ path: `${OUT}/role-01-no-change-close.png` });

// ── 2. Edit, close -> Stay keeps / Leave discards ──
log('=== ROLE 2. edit, close -> Stay keeps / Leave discards ===');
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
const descField = () => modal().locator('textarea').first();
await descField().fill('EDITED DESCRIPTION — leave guard test');
await closeIcon().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/role-02-dirty-close-prompt.png` });
const stayBtn = page.getByRole('button', { name: /Stay/i });
check(await stayBtn.count() > 0, 'Role: dirty close shows confirm dialog');
await stayBtn.click();
await page.waitForTimeout(300);
check((await descField().inputValue()).includes('EDITED DESCRIPTION'), 'Role: Stay preserves edited field');
await closeIcon().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Leave/i }).click();
await page.waitForTimeout(600);
check(await modal().count() === 0, 'Role: Leave actually closes the modal');
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
const freshDesc = await descField().inputValue();
check(freshDesc === 'Throwaway role created only for FORMS-2026-001 leave-guard verification.', `Role: Leave discarded edit, reopened original (got "${freshDesc}")`);
await closeIcon().click();
await page.waitForTimeout(400);

// ── 3. Normal save ──
// R3 (FORMS-2026-004): FORMS-2026-003's REVIEW found this only ever checked the save REQUEST
// (postData) and the UI reopening the same value — never the actual PUT response status/body,
// and never a raw GET bypassing the SPA store. Add both.
log('=== ROLE 3. normal save: request + response status/body + raw GET reread ===');
const apiCalls = [];
page.on('request', r => { if (r.url().includes('/api/iam/roles/') && r.method() === 'PUT') apiCalls.push({ url: r.url(), postData: r.postData() }); });
let roleSaveResponse = null;
page.on('response', async (r) => { if (r.url().includes('/api/iam/roles/') && r.request().method() === 'PUT') roleSaveResponse = { status: r.status(), body: await r.json().catch(() => null) }; });
const rawGet = async (path) => {
    const res = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'same-origin' });
        return { status: r.status, body: await r.json().catch(() => null) };
    }, path);
    return res;
};
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
await descField().fill('SAVED DESCRIPTION — normal save test');
await reasonField().fill('FORMS-2026-001 verification — normal save');
apiCalls.length = 0;
roleSaveResponse = null;
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(1000);
check(apiCalls.length === 1, `Role: exactly one save request sent (got ${apiCalls.length})`);
check(apiCalls[0].postData?.includes('SAVED DESCRIPTION'), 'Role: save request body contains new value');
check(roleSaveResponse?.status >= 200 && roleSaveResponse?.status < 300, `Role: save response status is 2xx (got ${roleSaveResponse?.status})`);
check(roleSaveResponse?.body?.description === 'SAVED DESCRIPTION — normal save test', `Role: save response BODY reflects the new description (got "${roleSaveResponse?.body?.description}")`);
check(await modal().count() === 0, 'Role: modal closes after successful save');
const rawRoles = await rawGet('/api/iam/roles/');
const persistedRole = (rawRoles.body || []).find(r => r.name === 'FORMS-2026-001 Throwaway Test Role');
check(rawRoles.status === 200, `Role: raw GET /iam/roles/ status 200 (got ${rawRoles.status})`);
check(persistedRole?.description === 'SAVED DESCRIPTION — normal save test', `Role: raw GET (bypassing UI/store entirely) confirms DB persistence (got "${persistedRole?.description}")`);
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
const reopened = await descField().inputValue();
check(reopened === 'SAVED DESCRIPTION — normal save test', `Role: reopened value matches saved value (got "${reopened}")`);
await page.screenshot({ path: `${OUT}/role-03-after-normal-save-reopen.png` });
await closeIcon().click();
await page.waitForTimeout(400);

// ── 4. Simulated save failure + retry ──
log('=== ROLE 4. simulated save failure + retry ===');
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
let failNext = true;
await page.route('**/api/iam/roles/**', async (route) => {
    if (route.request().method() === 'PUT' && failNext) {
        failNext = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated 500' }) });
    } else await route.continue();
});
await descField().fill('SHOULD FAIL — role retry test');
await reasonField().fill('FORMS-2026-001 verification — simulated failure');
const saveBtn = page.getByRole('button', { name: /^Save$/ });
await saveBtn.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/role-04-save-failure-toast.png` });
check(await modal().count() === 1, 'Role: modal stays open after simulated failure');
check((await descField().inputValue()) === 'SHOULD FAIL — role retry test', 'Role: input preserved after failure');
check(await saveBtn.isEnabled(), 'Role: Save button re-enabled after failure');
const roleFailToastCount = await page.locator('[data-sonner-toast]').count();
check(roleFailToastCount === 1, `Role: EXACTLY one error toast shown (got ${roleFailToastCount}, not just >=1)`);
const roleFailToastText = await page.locator('[data-sonner-toast]').first().innerText();
// RoleManagement.tsx/RoleModal.tsx's save catch runs getErrorMessage(err, "An error occurred"),
// which for any 5xx (errorUtils.ts) always returns this one fixed bilingual string regardless
// of the response body — our simulated "Simulated 500" detail never appears in it.
const expectedRoleFailText = '伺服器處理資料時發生錯誤（HTTP 500），請稍後重試或聯絡管理員。 / Server error (HTTP 500), please retry later or contact an administrator.';
check(roleFailToastText === expectedRoleFailText, `Role: the toast's exact text matches getErrorMessage's 5xx line (got "${roleFailToastText}")`);
await descField().fill('RETRY SUCCEEDED — role final');
apiCalls.length = 0;
await saveBtn.click();
await page.waitForTimeout(1000);
await page.unroute('**/api/iam/roles/**');
check(apiCalls.length === 1, `Role retry: exactly one request on retry (got ${apiCalls.length})`);
check(apiCalls[0].postData?.includes('RETRY SUCCEEDED'), 'Role retry: retry carries latest value');
check(await modal().count() === 0, 'Role retry: modal closes after successful retry');
await page.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page.waitForTimeout(500);
const finalDesc = await descField().inputValue();
check(finalDesc === 'RETRY SUCCEEDED — role final', `Role retry: DB reflects retried save (got "${finalDesc}")`);
await page.screenshot({ path: `${OUT}/role-05-after-retry-reopen.png` });
await closeIcon().click();
await page.waitForTimeout(400);

await browser.close();

// ── 5. Read-only mode (dedicated iam:role:view-only account) does not expose a save entry point ──
log('=== ROLE 5. read-only mode has no save entry point (separate view-only account) ===');
const browser2 = await chromium.launch();
const page2 = await browser2.newPage({ viewport: { width: 1440, height: 1000 } });
page2.setDefaultTimeout(15000);
await page2.addInitScript(() => localStorage.setItem('language', 'en'));
await page2.goto(`${BASE}/login`);
await page2.fill('#email', 'forms_role_readonly');
await page2.fill('#password', PW);
await page2.click('button[type=submit]');
await page2.waitForURL(u => !u.pathname.includes('/login'));
await page2.goto(`${BASE}/iam`);
await page2.waitForTimeout(500);
await page2.getByRole('button', { name: 'Role Management', exact: true }).click();
await page2.waitForTimeout(500);
const addRoleBtnCount = await page2.getByRole('button', { name: /Add Role/i }).count();
check(addRoleBtnCount === 0, 'Role read-only account: no "Add Role" entry point rendered at all');
await page2.locator('table tbody tr').filter({ hasText: 'FORMS-2026-001 Throwaway Test Role' }).click();
await page2.waitForTimeout(500);
const modal2 = page2.locator('[class*="modalForm"]');
check(await modal2.count() === 1, 'Role read-only: clicking the row still opens the modal (view mode)');
const saveBtnInReadOnly = await page2.getByRole('button', { name: /^(Save|Add)$/ }).count();
check(saveBtnInReadOnly === 0, `Role read-only: no Save/Add button rendered in the modal (found ${saveBtnInReadOnly})`);
const nameInputDisabled = await modal2.locator('input[type="text"]').first().isDisabled();
check(nameInputDisabled, 'Role read-only: form fields are disabled (fieldset disabled)');
await page2.screenshot({ path: `${OUT}/role-06-readonly-check.png` });
await browser2.close();

log(`===== ROLE DONE: ${checks} checks passed =====`);
