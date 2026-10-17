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

// REFUSAL-DIALOG-2026-003: a failed save no longer shows a sonner toast; it opens the shared refusal
// dialog (react-app/src/components/Shared/RefusalDialog.tsx). Reads its parts; null if it never shows.
async function readRefusalDialog(p, timeout = 5000) {
    const dlg = p.locator('[data-testid="refusal-dialog"]');
    try { await dlg.waitFor({ state: 'visible', timeout }); } catch { return null; }
    return dlg.evaluate((el) => {
        const text = (n) => (n ? (n.textContent || '').trim() : '');
        const msg = el.querySelector('#refusal-dialog-message');
        const body = msg ? msg.parentElement : null;
        const paras = body ? Array.from(body.querySelectorAll(':scope > p')) : [];
        const original = paras.find((n) => n.getAttribute('lang') === 'en');
        const note = paras.find((n) => n !== msg && n !== original && /note/i.test(n.className));
        return {
            title: text(el.querySelector('#refusal-dialog-title')),
            message: text(msg),
            items: body ? Array.from(body.querySelectorAll('li')).map(text) : [],
            original: original ? text(original) : null,
            note: note ? text(note) : null,
            all: text(el),
        };
    });
}
// REFUSAL-DIALOG-2026-003: the dialog only closes on OK / × / Esc — close it so later steps are not blocked.
async function closeRefusalDialog(p) {
    const dlg = p.locator('[data-testid="refusal-dialog"]');
    if (await dlg.count() === 0) return;
    await dlg.getByRole('button', { name: 'OK', exact: true }).click();
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}
// REFUSAL-DIALOG-2026-003: both forms simulate a PUT answered with HTTP 500 {"detail": "Simulated 500"}.
// ContractorModal.tsx / ProjectModal.tsx now call showRefusal(err, 'save', { keepsInput: true }) instead of
// toast.error(t('common.saveFailed')), so the expected dialog is the 5xx "Save failed" one (the body is never
// shown) plus the 5xx kept-input note (English strings from context/LanguageContext.tsx).
const EXPECTED_FAIL_TITLE = 'Save failed';
const EXPECTED_FAIL_MESSAGE = 'The server ran into a problem (HTTP 500). Try again later; if it keeps happening, contact an administrator.';
const EXPECTED_FAIL_NOTE = 'Could not confirm whether it was saved. What you entered is still here; reload the list to check before trying again.';
async function checkSaveFailedDialog(label) {
    const dialogCount = await page.locator('[data-testid="refusal-dialog"]').count();
    check(dialogCount === 1, `${label}: EXACTLY one refusal dialog shown (got ${dialogCount})`);
    const errorToasts = await page.locator('[data-sonner-toast][data-type="error"]').count();
    check(errorToasts === 0, `${label}: no sonner error toast shown (got ${errorToasts})`);
    const d = await readRefusalDialog(page);
    check(d?.title === EXPECTED_FAIL_TITLE, `${label}: the dialog title matches exactly (got "${d?.title}", expected "${EXPECTED_FAIL_TITLE}")`);
    check(d?.message === EXPECTED_FAIL_MESSAGE, `${label}: the dialog message matches the 5xx text (got "${d?.message}")`);
    check(d?.note === EXPECTED_FAIL_NOTE, `${label}: the dialog note is the 5xx kept-input line (got "${d?.note}")`);
    check(!(d?.all ?? '').includes('Simulated 500'), `${label}: the dialog does not echo the 5xx response body`);
    await closeRefusalDialog(page);
}

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

await page.goto(`${BASE}/contractors`);
await page.waitForTimeout(500);

const modal = () => page.locator('[class*="modalForm"]');
const closeIcon = () => page.locator('[class*="closeIconBtn"]');
const scopeField = () => modal().locator('input[type="text"]').nth(3); // package,name,abbreviation,scope

// ═══════════════ CONTRACTOR ═══════════════
log('=== CONTRACTOR 1. open existing, no change, close -> no prompt ===');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
await closeIcon().click();
await page.waitForTimeout(400);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'Contractor: no-change close does not show unsaved prompt');
await page.screenshot({ path: `${OUT}/contractor-01-no-change-close.png` });

log('=== CONTRACTOR 2. edit, close -> Stay keeps / Leave discards ===');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
await scopeField().fill('EDITED SCOPE — leave guard test');
await closeIcon().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/contractor-02-dirty-close-prompt.png` });
const stayBtn = page.getByRole('button', { name: /Stay/i });
check(await stayBtn.count() > 0, 'Contractor: dirty close shows confirm dialog');
await stayBtn.click();
await page.waitForTimeout(300);
check((await scopeField().inputValue()).includes('EDITED SCOPE'), 'Contractor: Stay preserves edited field');
await closeIcon().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Leave/i }).click();
await page.waitForTimeout(600);
check(await page.locator('[class*="modalForm"]').count() === 0, 'Contractor: Leave actually closes the modal');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
const freshScope = await scopeField().inputValue();
check(freshScope === 'Rebar & formwork', `Contractor: Leave discarded edit, reopened value is original (got "${freshScope}")`);
await closeIcon().click();
await page.waitForTimeout(400);

log('=== CONTRACTOR 3. normal save: request + response status/body + reread ===');
const apiCalls = [];
page.on('request', r => { if (r.url().includes('/api/contractors/') && r.method() === 'PUT') apiCalls.push({ url: r.url(), postData: r.postData() }); });
let contractorSaveResponse = null;
page.on('response', async (r) => { if (r.url().includes('/api/contractors/') && r.request().method() === 'PUT') contractorSaveResponse = { status: r.status(), body: await r.json().catch(() => null) }; });
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
await scopeField().fill('SAVED SCOPE — normal save test');
apiCalls.length = 0;
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(1000);
check(apiCalls.length === 1, `Contractor: exactly one save request sent (got ${apiCalls.length})`);
check(apiCalls[0].postData?.includes('SAVED SCOPE'), 'Contractor: save request body contains new value');
check(contractorSaveResponse?.status >= 200 && contractorSaveResponse?.status < 300, `Contractor: save response status is 2xx (got ${contractorSaveResponse?.status})`);
check(contractorSaveResponse?.body?.scope === 'SAVED SCOPE — normal save test', `Contractor: save response BODY reflects the new scope (got "${contractorSaveResponse?.body?.scope}")`);
check(await page.locator('[class*="modalForm"]').count() === 0, 'Contractor: modal closes after successful save');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
const reopened = await scopeField().inputValue();
check(reopened === 'SAVED SCOPE — normal save test', `Contractor: reopened value matches saved value (got "${reopened}")`);
await page.screenshot({ path: `${OUT}/contractor-03-after-normal-save-reopen.png` });
await closeIcon().click();
await page.waitForTimeout(400);

log('=== CONTRACTOR 4. simulated save failure + retry ===');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
let failNext = true;
await page.route('**/api/contractors/**', async (route) => {
    if (route.request().method() === 'PUT' && failNext) {
        failNext = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated 500' }) });
    } else await route.continue();
});
await scopeField().fill('SHOULD FAIL — contractor retry test');
const saveBtn = page.getByRole('button', { name: /^Save$/ });
await saveBtn.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/contractor-04-save-failure-dialog.png` });
check(await page.locator('[class*="modalForm"]').count() === 1, 'Contractor: modal stays open after simulated failure');
check((await scopeField().inputValue()) === 'SHOULD FAIL — contractor retry test', 'Contractor: input preserved after failure');
check(await saveBtn.isEnabled(), 'Contractor: Save button re-enabled after failure');
// REFUSAL-DIALOG-2026-003: was one sonner toast 'Save Failed' (common.saveFailed); now the refusal dialog.
await checkSaveFailedDialog('Contractor');
await scopeField().fill('RETRY SUCCEEDED — contractor final');
apiCalls.length = 0;
await saveBtn.click();
await page.waitForTimeout(1000);
await page.unroute('**/api/contractors/**');
check(apiCalls.length === 1, `Contractor retry: exactly one request on retry (got ${apiCalls.length})`);
check(apiCalls[0].postData?.includes('RETRY SUCCEEDED'), 'Contractor retry: retry carries latest value');
check(await page.locator('[class*="modalForm"]').count() === 0, 'Contractor retry: modal closes after successful retry');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Contractor Co' }).click();
await page.waitForTimeout(500);
const finalScope = await scopeField().inputValue();
check(finalScope === 'RETRY SUCCEEDED — contractor final', `Contractor retry: DB reflects retried save (got "${finalScope}")`);
await page.screenshot({ path: `${OUT}/contractor-05-after-retry-reopen.png` });
await closeIcon().click();
await page.waitForTimeout(400);

log(`===== CONTRACTOR DONE: ${checks} checks so far =====`);

// ═══════════════ PROJECT ═══════════════
await page.goto(`${BASE}/contractors`);
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Projects', exact: true }).click();
await page.waitForTimeout(500);

const projectCodeField = () => modal().getByPlaceholder('e.g. HAI, YL, GCH');

log('=== PROJECT 1. open existing, no change, close -> no prompt ===');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
await closeIcon().click();
await page.waitForTimeout(400);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'Project: no-change close does not show unsaved prompt');
await page.screenshot({ path: `${OUT}/project-01-no-change-close.png` });

log('=== PROJECT 2. edit, close -> Stay keeps / Leave discards ===');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
await projectCodeField().fill('EDITEDCODE');
await closeIcon().click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/project-02-dirty-close-prompt.png` });
const stayBtn2 = page.getByRole('button', { name: /Stay/i });
check(await stayBtn2.count() > 0, 'Project: dirty close shows confirm dialog');
await stayBtn2.click();
await page.waitForTimeout(300);
check((await projectCodeField().inputValue()) === 'EDITEDCODE', 'Project: Stay preserves edited field');
await closeIcon().click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Leave/i }).click();
await page.waitForTimeout(600);
check(await page.locator('[class*="modalForm"]').count() === 0, 'Project: Leave actually closes the modal');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
const freshCode = await projectCodeField().inputValue();
check(freshCode === 'FORMSP1', `Project: Leave discarded edit, reopened value is original (got "${freshCode}")`);
await closeIcon().click();
await page.waitForTimeout(400);

log('=== PROJECT 3. normal save: request + response status/body + reread ===');
const projApiCalls = [];
page.on('request', r => { if (r.url().includes('/api/projects/') && r.method() === 'PUT') projApiCalls.push({ url: r.url(), postData: r.postData() }); });
let projectSaveResponse = null;
page.on('response', async (r) => { if (r.url().includes('/api/projects/') && r.request().method() === 'PUT') projectSaveResponse = { status: r.status(), body: await r.json().catch(() => null) }; });
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
await projectCodeField().fill('SAVEDCODE');
projApiCalls.length = 0;
await page.getByRole('button', { name: /Save Changes/i }).click();
await page.waitForTimeout(1000);
check(projApiCalls.length === 1, `Project: exactly one save request sent (got ${projApiCalls.length})`);
check(projApiCalls[0].postData?.includes('SAVEDCODE'), 'Project: save request body contains new value');
check(projectSaveResponse?.status >= 200 && projectSaveResponse?.status < 300, `Project: save response status is 2xx (got ${projectSaveResponse?.status})`);
check(projectSaveResponse?.body?.code === 'SAVEDCODE', `Project: save response BODY reflects the new code (got "${projectSaveResponse?.body?.code}")`);
check(await page.locator('[class*="modalForm"]').count() === 0, 'Project: modal closes after successful save');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
const reopenedCode = await projectCodeField().inputValue();
check(reopenedCode === 'SAVEDCODE', `Project: reopened value matches saved value (got "${reopenedCode}")`);
await page.screenshot({ path: `${OUT}/project-03-after-normal-save-reopen.png` });
await closeIcon().click();
await page.waitForTimeout(400);

log('=== PROJECT 4. simulated save failure + retry ===');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
let projFailNext = true;
await page.route('**/api/projects/**', async (route) => {
    if (route.request().method() === 'PUT' && projFailNext) {
        projFailNext = false;
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated 500' }) });
    } else await route.continue();
});
await projectCodeField().fill('FAILCODE');
const projSaveBtn = page.getByRole('button', { name: /Save Changes/i });
await projSaveBtn.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/project-04-save-failure-dialog.png` });
check(await page.locator('[class*="modalForm"]').count() === 1, 'Project: modal stays open after simulated failure');
check((await projectCodeField().inputValue()) === 'FAILCODE', 'Project: input preserved after failure');
check(await projSaveBtn.isEnabled(), 'Project: Save button re-enabled after failure');
// REFUSAL-DIALOG-2026-003: was one sonner toast 'Save Failed' (common.saveFailed); now the refusal dialog.
await checkSaveFailedDialog('Project');
await projectCodeField().fill('RETRYCODE');
projApiCalls.length = 0;
await projSaveBtn.click();
await page.waitForTimeout(1000);
await page.unroute('**/api/projects/**');
check(projApiCalls.length === 1, `Project retry: exactly one request on retry (got ${projApiCalls.length})`);
check(projApiCalls[0].postData?.includes('RETRYCODE'), 'Project retry: retry carries latest value');
check(await page.locator('[class*="modalForm"]').count() === 0, 'Project retry: modal closes after successful retry');
await page.locator('table tbody tr').filter({ hasText: 'Forms Leave Guard Review' }).click();
await page.waitForTimeout(500);
const finalCode = await projectCodeField().inputValue();
check(finalCode === 'RETRYCODE', `Project retry: DB reflects retried save (got "${finalCode}")`);
await page.screenshot({ path: `${OUT}/project-05-after-retry-reopen.png` });
await closeIcon().click();
await page.waitForTimeout(400);

log(`===== CONTRACTOR + PROJECT DONE: ${checks} checks passed =====`);
await browser.close();
