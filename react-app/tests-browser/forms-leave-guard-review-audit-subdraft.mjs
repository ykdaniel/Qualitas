import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

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
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'forms_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

const rawGet = async (path) => {
    const res = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'same-origin' });
        return { status: r.status, body: await r.json().catch(() => null) };
    }, path);
    return res;
};

await page.goto(`${BASE}/audit`);
await page.waitForTimeout(700);

const fillStep1 = async () => {
    await page.locator('input[name="auditTitle"]').fill('FORMS-2026-002 Audit Test', { timeout: 3000 }).catch(() => {});
};

const openWizardFresh = async () => {
    await page.goto(`${BASE}/audit`);
    await page.waitForTimeout(700);
    await page.getByRole('button', { name: /Add Audit/i }).click();
    await page.waitForTimeout(500);
    await fillStep1();
    // Jump straight to step 4 ("Checklist Setup" — Custom Checklist Items form) via the progress-bar step buttons.
    await page.locator('button').filter({ hasText: /^4$/ }).first().click();
    await page.waitForTimeout(400);
};

const apiCalls = [];
page.on('request', r => { if (r.url().includes('/api/audit') && ['POST', 'PUT'].includes(r.method())) apiCalls.push({ method: r.method(), postData: r.postData() }); });

// ═══════════════ 1. REPRODUCE: typed-but-not-Added sub-draft + Save Draft ═══════════════
log('=== AUDIT 1. reproduce: typed custom item, no Add, click Save Draft ===');
await openWizardFresh();
await page.locator('input[name="task"]').fill('UNCONFIRMED TASK — should not be silently dropped');
const saveDraftBtn = page.getByRole('button', { name: /Save Draft/i });
apiCalls.length = 0;
await saveDraftBtn.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/audit-01-blocked-save-draft.png` });
check(apiCalls.length === 0, `AUDIT: Save Draft blocked, exactly zero API calls while unconfirmed item present (got ${apiCalls.length})`);
const toastCount1 = await page.locator('[data-sonner-toast]').count();
check(toastCount1 === 1, `AUDIT: EXACTLY one guidance toast shown (got ${toastCount1})`);
check((await page.locator('input[name="task"]').inputValue()) === 'UNCONFIRMED TASK — should not be silently dropped', 'AUDIT: the unconfirmed draft text is still preserved in the field (not cleared, not lost)');

log('=== AUDIT 1b. same reproduce for final Submit (step 5) ===');
await page.getByRole('button', { name: /^Next/i }).click();
await page.waitForTimeout(400);
apiCalls.length = 0;
const submitBtn = page.getByRole('button', { name: /Complete & Create Plan/i });
await submitBtn.click();
await page.waitForTimeout(800);
check(apiCalls.length === 0, `AUDIT: Submit also blocked while unconfirmed item present (got ${apiCalls.length} calls)`);
await page.getByRole('button', { name: /^Back/i }).click();
await page.waitForTimeout(400);
check((await page.locator('input[name="task"]').inputValue()) === 'UNCONFIRMED TASK — should not be silently dropped', 'AUDIT: draft still preserved after blocked Submit attempt too');

// ═══════════════ 2. REGRESSION: explicit clear then save succeeds — response + real persistence ═══════════════
log('=== AUDIT 2. regression: clear the draft field, then Save Draft succeeds (response + real GET) ===');
await page.locator('input[name="task"]').fill('');
let lastResponse = null;
page.on('response', async (r) => {
    if (r.url().includes('/api/audit') && ['POST', 'PUT'].includes(r.request().method())) {
        lastResponse = { status: r.status(), body: await r.json().catch(() => null) };
    }
});
apiCalls.length = 0;
await saveDraftBtn.click();
await page.waitForTimeout(1000);
check(apiCalls.length === 1, `AUDIT regression: clearing the draft then Save Draft sends exactly one request (got ${apiCalls.length})`);
check(apiCalls[0].method === 'POST', `AUDIT regression: this FIRST save is a POST (create) (got ${apiCalls[0].method})`);
check(lastResponse?.status >= 200 && lastResponse?.status < 300, `AUDIT regression: save response is 2xx (got ${lastResponse?.status})`);
check(lastResponse?.body?.auditNo || lastResponse?.body?.id, 'AUDIT regression: save response body carries an identifiable record (auditNo/id)');
const auditId = lastResponse?.body?.id;
await page.screenshot({ path: `${OUT}/audit-03-cleared-then-saved.png` });

// ═══════════════ 3. REGRESSION: Add first, then Save Draft succeeds — real persistence via GET ═══════════════
// Also proves the duplicate-record fix: a SECOND "Save Draft" click on the SAME still-open
// wizard session must be a PUT to the SAME id, never another POST (before the fix, AuditWizard
// never learned its own record's id after the first save, so this second click created a
// second, separate audit row — reproduced and confirmed via raw GET before applying the fix).
log('=== AUDIT 3. regression: Add the item first, then Save Draft includes it (real GET persistence, no duplicate record) ===');
await page.locator('input[name="task"]').fill('CONFIRMED TASK — added via Add button');
const addBtn = page.locator('xpath=//input[@name="task"]/following-sibling::button[1]');
await addBtn.click();
await page.waitForTimeout(400);
check((await page.locator('input[name="task"]').inputValue()) === '', 'AUDIT regression: Add clears the draft input (item moved into the list)');
apiCalls.length = 0;
await saveDraftBtn.click();
await page.waitForTimeout(1000);
check(apiCalls.length === 1, `AUDIT regression: normal Add-then-Save sends exactly one request (got ${apiCalls.length})`);
check(apiCalls[0].method === 'PUT', `AUDIT (duplicate-record fix): this SECOND Save Draft on the same open wizard is a PUT, not another POST (got ${apiCalls[0].method})`);
check(apiCalls[0].postData?.includes('CONFIRMED TASK'), 'AUDIT regression: the Added item is present in the SENT payload');
const rawAudit = await rawGet('/api/audit/');
const matchingRows = (rawAudit.body || []).filter(a => a.title === 'FORMS-2026-002 Audit Test');
check(matchingRows.length === 1, `AUDIT (duplicate-record fix): exactly ONE record with this title exists — not two (got ${matchingRows.length})`);
const persistedAudit = matchingRows.find(a => a.id === auditId);
check(!!persistedAudit, 'AUDIT regression: raw GET (bypassing UI/store) finds the SAME record by id from scenario 2 (not a different one)');
check((persistedAudit?.custom_check_items || persistedAudit?.customCheckItems || []).some(i => i.task === 'CONFIRMED TASK — added via Add button'), 'AUDIT regression: raw GET confirms the Added item is actually PERSISTED on that record, not just sent');
await page.screenshot({ path: `${OUT}/audit-04-added-then-saved.png` });

// ═══════════════ 4. R5: EXISTING item mid-inline-edit (editFormData), unconfirmed -> main save blocked ═══════════════
// This is the second gap the independent review named explicitly (SCOPE point 5): editing an
// EXISTING custom check item via its inline "Edit" row uses a SEPARATE local draft
// (editFormData) that only folds back into formData.customCheckItems on saveEdit ("Save" in
// that inline row). If the main form is saved while that inline edit is still open, the old
// code never checked for it at all.
log('=== AUDIT 4. R5: existing item mid-inline-edit, unconfirmed -> main Save blocked ===');
// The inline "Edit" pencil icon sits on the just-added item row; scope to the items-list
// container (not a bare `div` filter, which also matches ancestor divs containing the whole
// page — including the sidebar nav, whose buttons then get clicked instead by mistake).
await page.locator('.h-\\[300px\\]').locator('div').filter({ hasText: 'CONFIRMED TASK — added via Add button' }).locator('button').first().click();
await page.waitForTimeout(300);
const inlineTaskField = page.locator('input[name="task"]').last();
const stillEditing = await inlineTaskField.count() > 0;
check(stillEditing, 'AUDIT 4: inline edit row is open (editFormData active) after clicking Edit');
await inlineTaskField.fill('EDITED BUT NOT APPLIED — should block main save');
apiCalls.length = 0;
await saveDraftBtn.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/audit-05-blocked-existing-item-edit.png` });
check(apiCalls.length === 0, `AUDIT 4 (the R5 gap): main Save Draft blocked while an existing item's inline edit is unconfirmed (got ${apiCalls.length} calls)`);
const toastCount4 = await page.locator('[data-sonner-toast]').count();
check(toastCount4 === 1, `AUDIT 4: EXACTLY one guidance toast for the inline-edit case (got ${toastCount4})`);
check((await inlineTaskField.inputValue()) === 'EDITED BUT NOT APPLIED — should block main save', 'AUDIT 4: the unconfirmed inline edit is preserved, not lost');

// Regression: Cancel the inline edit (not Save it) -> main save works normally again, old value kept.
const cancelInlineBtn = page.getByRole('button', { name: /^Cancel$/i }).first();
await cancelInlineBtn.click();
await page.waitForTimeout(300);
apiCalls.length = 0;
await saveDraftBtn.click();
await page.waitForTimeout(1000);
check(apiCalls.length === 1, `AUDIT 4 regression: Cancel-ing the inline edit unblocks Save Draft, exactly one request (got ${apiCalls.length})`);
check(!apiCalls[0].postData?.includes('EDITED BUT NOT APPLIED'), 'AUDIT 4 regression: the cancelled inline edit text is NOT in the saved payload (old value kept)');
await page.screenshot({ path: `${OUT}/audit-06-inline-edit-cancelled-then-saved.png` });

log(`===== AUDIT SUB-DRAFT DONE: ${checks} checks passed =====`);
await browser.close();
