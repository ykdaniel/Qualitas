// ITR-STATUS-2026-001/002: verifies the fix for ITRModals.tsx's handleFieldChange, which used to
// judge a Status transition against formData.status (the picked-but-not-yet-saved value) instead
// of existingItem?.status (the actually persisted value). Reproduced in isolation 2026-10-03:
// pick Approved on an In Progress ITR with no linked checklist -> save rejected by the backend
// ("Cannot approve ITR without any linked checklists") -> the NEXT attempt to change Status back
// to In Progress hit the "Approved ITR can only change via Revoke Approval" guard, even though
// the backend was never actually touched (confirmed via a raw GET). The form was stuck: Approve
// blocked by the checklist rule, revert blocked by a guard believing a save that never happened.
//
// ITR-STATUS-2026-002 (R1-R3): the 001 version of this script had two always-true assertions
// (`count >= 0`, `... || true`) that verified nothing, filled the Remark AFTER the rejected save
// rather than before it (so it never actually proved "failed-save input preservation" for
// anything typed before the failure), used a weak `description === ''` check for "no stray row
// created" instead of counting actual POST requests, and never reopened a genuinely-approved
// record to confirm the lock/Revoke-Approval basis update this fix is supposed to produce. All
// fixed below; see docs/workflow/ITR-STATUS-2026-002-handoff.md for the full before/after.
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));

import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
verifyIsolatedTarget(state);

const PW = process.env.ITR_STATUS_REVIEW_PASSWORD;
if (!PW) throw new Error('ITR_STATUS_REVIEW_PASSWORD not set — export the same value used for seeding before running this script.');
const BASE = `http://127.0.0.1:${state.vite_port}`;
const OUT = process.env.ITR_STATUS_REVIEW_EVIDENCE_DIR || '/private/tmp/claude-501/itr-status-2026-002-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'itrstatus_full');
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

const statusSelect = () => page.locator('xpath=//label[text()="Status"]/following::select[1]');
const inspectionResultSelect = () => page.locator('xpath=//label[text()="Inspection Result"]/following-sibling::select');
const remarkField = () => page.locator('xpath=//label[text()="Remark"]/following::textarea[1]');
const saveBtn = () => page.getByRole('button', { name: /^Save$/ });
// R1: a precise way to tell "the ITR edit modal for THIS record is open" apart from "it is
// closed" — anchored on the Remark field, which only exists inside this modal, not on the list
// page behind it. Used both ways: must be visible while the modal is genuinely still open, and
// must be gone (count === 0) once it has actually closed — neither direction is ever assumed.
const modalOpenFor = async () => (await remarkField().count()) > 0 && await remarkField().isVisible();

await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);

// ── Scenario A: repro + fix verification on an In Progress ITR with no linked checklist ──
log('=== A. open ISR-ITR-000001 (In Progress, no checklist) ===');
await page.locator('table tbody tr').filter({ hasText: 'QTS-ISRP1-ITR-000001' }).click();
await page.waitForTimeout(500);
check(await modalOpenFor(), 'A: the edit modal is open right after clicking the row');

// R2: the Remark must be filled BEFORE the rejected save, not after — only that order actually
// proves "a save failure preserves what the user had already typed", which is the real claim
// under test. Filling it afterward (the 001 version) only proved a later status-change doesn't
// clear it, a strictly weaker claim.
const REMARK_TEXT = 'ITR-STATUS-2026-002 verification remark (typed before the rejected save)';
await remarkField().fill(REMARK_TEXT);
await inspectionResultSelect().selectOption('Pass');
await statusSelect().selectOption('Approved');
await page.screenshot({ path: `${OUT}/itr-01-picked-approved-unsaved-with-remark.png` });

let lastPutResponse = null;
page.on('response', async (r) => { if (r.request().method() === 'PUT' && /\/api\/itr\/[^/]+$/.test(new URL(r.url()).pathname)) lastPutResponse = { status: r.status(), body: await r.json().catch(() => null) }; });

log('=== A1. save the rejected Approve (no linked checklist) — check the real HTTP response, not just the toast ===');
lastPutResponse = null;
await saveBtn().click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/itr-02-approve-rejected-toast.png` });
const rejectToast = await page.locator('[data-sonner-toast]').first().innerText().catch(() => '');
check(rejectToast.includes('Cannot approve ITR without any linked checklists'), `A1: the rejection toast states the real backend reason (got "${rejectToast}")`);
// R2: the actual HTTP response, not just the toast text the frontend chose to show.
check(lastPutResponse !== null, 'A1: a PUT response was actually captured for the rejected save');
check(lastPutResponse?.status === 400, `A1: the rejected save's real HTTP status is 400 (got ${lastPutResponse?.status})`);
const rejectDetail = typeof lastPutResponse?.body?.detail === 'string' ? lastPutResponse.body.detail : JSON.stringify(lastPutResponse?.body?.detail);
check((rejectDetail || '').includes('Cannot approve ITR without any linked checklists'), `A1: the rejected save's response body.detail carries the same real reason (got "${rejectDetail}")`);
// R1: precise modal-still-open check, not a `count() >= 0` tautology.
check(await modalOpenFor(), 'A1: the edit modal is still open after the rejected save (not force-closed)');
check((await remarkField().inputValue()) === REMARK_TEXT, 'A1: the Remark typed BEFORE the rejected save is still there right after it fails');
const rawAfterReject = await rawGet('/api/itr/');
const afterReject = (rawAfterReject.body || []).find(r => r.documentNumber === 'QTS-ISRP1-ITR-000001');
check(afterReject?.status === 'In Progress', `A1: raw GET confirms the backend was NEVER actually touched — still In Progress (got "${afterReject?.status}")`);
check(afterReject?.inspectionResult === null || afterReject?.inspectionResult === undefined, `A1: raw GET confirms inspectionResult was not persisted either (got "${afterReject?.inspectionResult}")`);
check(afterReject?.remark === null || afterReject?.remark === undefined, `A1: raw GET confirms the Remark was NOT persisted by the rejected save either (got "${afterReject?.remark}") — it only survives in the still-open form, not on the server yet`);

log('=== A2. THE BUG: revert Status to In Progress in the same still-open modal ===');
await statusSelect().selectOption('In Progress');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/itr-03-reverted-to-in-progress-no-false-warning.png` });
const toastsAfterRevert = await page.locator('[data-sonner-toast]').allInnerTexts();
check(!toastsAfterRevert.some(t => t.includes('Revoke Approval') || t.includes('撤回核准')), `A2 (the fix): reverting Status does NOT trigger the false "already approved, need Revoke Approval" warning (toasts: ${JSON.stringify(toastsAfterRevert)})`);
check((await statusSelect().inputValue()) === 'In Progress', 'A2: Status select actually shows In Progress after reverting (not stuck on Approved)');
check((await remarkField().inputValue()) === REMARK_TEXT, 'A2: the Remark typed before the rejected save is STILL there after reverting Status (R2 — preserved across both the failure and the revert, not just one or the other)');

log('=== A3. the reverted ITR now saves successfully, with the Remark (typed before the original failure) intact ===');
lastPutResponse = null;
await saveBtn().click();
await page.waitForTimeout(1000);
check(lastPutResponse?.status >= 200 && lastPutResponse?.status < 300, `A3: the save after reverting succeeds (got status ${lastPutResponse?.status})`);
check(lastPutResponse?.body?.status === 'In Progress', `A3: save response body confirms status is In Progress (got "${lastPutResponse?.body?.status}")`);
check(lastPutResponse?.body?.remark === REMARK_TEXT, `A3: save response body carries the Remark that was typed before the ORIGINAL rejected save, not re-typed afterward (got "${lastPutResponse?.body?.remark}")`);
// R1: precise modal-closed check — the Remark field (the modal's own content) must actually be
// gone, not a tautological `count() === 0 || true`.
check(!(await modalOpenFor()), 'A3: the edit modal has actually closed after the successful save (Remark field no longer present)');
await page.waitForTimeout(500);
const rawAfterFix = await rawGet('/api/itr/');
const afterFix = (rawAfterFix.body || []).find(r => r.documentNumber === 'QTS-ISRP1-ITR-000001');
check(afterFix?.status === 'In Progress', `A3: raw GET confirms persisted status is In Progress (got "${afterFix?.status}")`);
check(afterFix?.remark === REMARK_TEXT, `A3: raw GET (same id, "isr-itr-1") confirms the Remark — typed before the very first, rejected save — was actually persisted end to end (got "${afterFix?.remark}")`);
check(afterFix?.id === 'isr-itr-1', `A3: this is genuinely the same record throughout (id still "isr-itr-1", got "${afterFix?.id}")`);
await page.screenshot({ path: `${OUT}/itr-04-after-successful-revert-save.png` });

// ── Scenario B: new-item mode must not self-lock on an unsaved Approved pick either ──
log('=== B. new ITR (unsaved): pick Approved, revert — must not self-lock ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
// R1: precise "no stray row created" evidence — count real POST /api/itr/ requests made during
// this scenario (must stay exactly 0, since nothing here is ever meant to save), not an indirect
// `description === ''` guess at list contents afterward.
let newItrPostCount = 0;
await page.route('**/api/itr/', async (route) => {
    if (route.request().method() === 'POST') newItrPostCount++;
    await route.continue();
});
const rawBeforeNew = await rawGet('/api/itr/');
const idsBeforeNew = new Set((rawBeforeNew.body || []).map(r => r.id));
await page.getByRole('button', { name: /Add New ITR/i }).click();
await page.waitForTimeout(500);
check((await statusSelect().inputValue()) === 'In Progress', 'B: a brand-new ITR defaults to In Progress');
check(await statusSelect().isEnabled(), 'B: the Status select is not disabled in new-item mode');
await statusSelect().selectOption('Approved');
await page.waitForTimeout(300);
const toastsAfterNewApproved = await page.locator('[data-sonner-toast]').allInnerTexts();
check(!toastsAfterNewApproved.some(t => t.includes('Revoke Approval') || t.includes('撤回核准')), `B: picking Approved on a never-saved new ITR does not itself warn about Revoke Approval (toasts: ${JSON.stringify(toastsAfterNewApproved)})`);
await statusSelect().selectOption('In Progress');
await page.waitForTimeout(300);
const toastsAfterNewRevert = await page.locator('[data-sonner-toast]').allInnerTexts();
check(!toastsAfterNewRevert.some(t => t.includes('Revoke Approval') || t.includes('撤回核准')), `B (the fix): reverting a new, never-saved ITR's Status away from Approved does not false-trigger Revoke Approval either (toasts: ${JSON.stringify(toastsAfterNewRevert)})`);
check((await statusSelect().inputValue()) === 'In Progress', 'B: Status select actually shows In Progress (new-item mode is not stuck either)');
await page.screenshot({ path: `${OUT}/itr-05-new-item-not-self-locked.png` });
// Leave without saving — this scenario only tests the dropdown interaction itself, no backend write intended.
const cancelBtn = page.getByRole('button', { name: /^Cancel$/ });
await cancelBtn.click();
await page.waitForTimeout(300);
const leaveBtn = page.getByRole('button', { name: /^Leave$/i });
if (await leaveBtn.count() > 0) { await leaveBtn.click(); await page.waitForTimeout(300); }
await page.unroute('**/api/itr/');
check(newItrPostCount === 0, `B: cancelling the new-item draft sent exactly zero POST /api/itr/ requests (got ${newItrPostCount}), not an indirect field-value guess`);
const rawAfterNewCancelled = await rawGet('/api/itr/');
const idsAfterNewCancelled = new Set((rawAfterNewCancelled.body || []).map(r => r.id));
check(idsBeforeNew.size === idsAfterNewCancelled.size && [...idsBeforeNew].every(id => idsAfterNewCancelled.has(id)), `B: the full id set before and after cancelling is identical (before ${idsBeforeNew.size}, after ${idsAfterNewCancelled.size}) — no stray row was created`);

// ── Scenario C: an ALREADY-persisted-Approved ITR (seeded directly, never went through a real
// In Progress -> Approved transition in this session) must stay locked, and Publish still works ──
log('=== C. ISR-ITR-000003 (seeded already Approved): still locked; Publish still works ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-ISRP1-ITR-000003' }).click();
await page.waitForTimeout(500);
check(!(await statusSelect().isEnabled()), 'C: Status select is disabled (isLocked) on an already-persisted-Approved ITR — the fix did not weaken this protection');
check(!(await inspectionResultSelect().isEnabled()), 'C: Inspection Result select is also disabled while locked');
check(await page.getByRole('button', { name: /^Revoke Approval$/ }).count() === 1, 'C: the Revoke Approval entry point is present on a seeded-Approved record');
await page.screenshot({ path: `${OUT}/itr-06-already-approved-still-locked.png` });
let publishPutResponse = null;
page.on('response', async (r) => { if (r.request().method() === 'PUT' && /\/api\/itr\/[^/]+$/.test(new URL(r.url()).pathname)) publishPutResponse = { status: r.status(), body: await r.json().catch(() => null) }; });
const publishBtn = page.getByRole('button', { name: /^Publish$/ });
await publishBtn.click();
await page.waitForTimeout(400);
const confirmPublishBtn = page.getByRole('button', { name: /^(Publish|Confirm)/i }).last();
if (await confirmPublishBtn.count() > 0) { await confirmPublishBtn.click(); }
await page.waitForTimeout(1000);
check(publishPutResponse?.status >= 200 && publishPutResponse?.status < 300, `C: Publish (next revision) on an already-Approved ITR still succeeds (got status ${publishPutResponse?.status}) — unrelated to this batch's fix, confirming nothing broke`);
const rawAfterPublish = await rawGet('/api/itr/');
const afterPublish = (rawAfterPublish.body || []).find(r => r.documentNumber === 'QTS-ISRP1-ITR-000003');
check(afterPublish?.status === 'Approved', `C: the published record is still Approved (got "${afterPublish?.status}")`);
// Publish writes the next revision into the `type` column (a separate field from the seeded
// `rev` column — confirmed by reading schemas.ITRUpdate, which declares both independently);
// this fixture seeds no initial `type`, so any non-empty value here is evidence Publish wrote one.
check(!!afterPublish?.type, `C: Publish actually wrote a revision into the record's type field (got "${afterPublish?.type}")`);
await page.screenshot({ path: `${OUT}/itr-07-publish-still-works.png` });

// ── Scenario D: a checklist that IS already Pass still lets Approve succeed (checklist rule
// unchanged) — THEN reopen the SAME record to confirm the lock/Revoke basis actually updated
// after a genuine In-Progress -> Approved transition, not just on a record seeded Approved from
// the start (scenario C's fixture never ran through this transition at all). ──
log('=== D. ISR-ITR-000002 (In Progress, checklist already Pass): Approve succeeds, then reopen to confirm the new lock basis ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-ISRP1-ITR-000002' }).click();
await page.waitForTimeout(500);
check(await statusSelect().isEnabled(), 'D: before approving, Status select starts enabled (genuinely In Progress, not pre-locked)');
await statusSelect().selectOption('Approved');
await page.waitForTimeout(300);
let approvePutResponse = null;
page.on('response', async (r) => { if (r.request().method() === 'PUT' && /\/api\/itr\/[^/]+$/.test(new URL(r.url()).pathname)) approvePutResponse = { status: r.status(), body: await r.json().catch(() => null) }; });
await saveBtn().click();
await page.waitForTimeout(1000);
check(approvePutResponse?.status >= 200 && approvePutResponse?.status < 300, `D: Approve succeeds when its real precondition (a Pass checklist) IS met (got status ${approvePutResponse?.status}) — the checklist rule itself is untouched by this batch`);
check(approvePutResponse?.body?.status === 'Approved', `D: save response confirms status is now Approved (got "${approvePutResponse?.body?.status}")`);
check(!(await modalOpenFor()), 'D: the edit modal actually closed after the successful Approve');
const rawAfterApprove = await rawGet('/api/itr/');
const afterApprove = (rawAfterApprove.body || []).find(r => r.documentNumber === 'QTS-ISRP1-ITR-000002');
check(afterApprove?.status === 'Approved', `D: raw GET confirms the approval actually persisted (got "${afterApprove?.status}")`);
await page.screenshot({ path: `${OUT}/itr-08-checklist-already-pass-approve-succeeds.png` });

log('=== D2 (R3). reopen the SAME record (QTS-ISRP1-ITR-000002) after its real In Progress -> Approved transition ===');
await page.goto(`${BASE}/itr`);
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-ISRP1-ITR-000002' }).click();
await page.waitForTimeout(500);
check(await modalOpenFor(), 'D2: the reopened modal is genuinely open');
check(!(await statusSelect().isEnabled()), 'D2: Status select is now disabled — isLocked correctly picked up the freshly-persisted Approved status on reopen, not just on records seeded Approved from the start');
check(!(await inspectionResultSelect().isEnabled()), 'D2: Inspection Result select is also disabled on reopen');
check(await page.getByRole('button', { name: /^Revoke Approval$/ }).count() === 1, 'D2: the Revoke Approval entry point is present after a genuine In Progress -> Approved transition (not only on a record that was always Approved)');
await page.screenshot({ path: `${OUT}/itr-09-reopened-after-real-approval-locked.png` });

log(`===== ITR STATUS REVERT REVIEW DONE: ${checks} checks passed =====`);
await browser.close();
