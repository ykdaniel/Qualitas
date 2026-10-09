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
const API = `http://127.0.0.1:${state.backend_port}`;
// FORMS-2026-005 (R2): each round must use its OWN output directory — reusing FORMS-2026-003's
// path let a later round's screenshots silently overwrite that round's old ones under identical
// filenames, with nothing recorded in the repo to tell them apart afterward. Override with
// FORMS_REVIEW_EVIDENCE_DIR for a specific round; the default below is this round's own.
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
log('LOGIN OK (forms_full)');

// A raw, UI-independent GET — used for the "real persistence" checks (R3): reopening the
// SPA modal only proves the in-memory store looks right, not that the DB actually has it.
// Auth here is cookie-based (not localStorage), so a same-origin fetch through vite's own
// /api proxy carries the session cookie automatically — no token plumbing needed, and it
// avoids a cross-origin CORS failure that a direct call to the backend port would hit.
const rawGet = async (path) => {
    const res = await page.evaluate(async (url) => {
        const r = await fetch(url, { credentials: 'same-origin' });
        return { status: r.status, body: await r.json().catch(() => null) };
    }, path);
    return res;
};

await page.goto(`${BASE}/osd`);
await page.waitForTimeout(500);

// ── 1. Open existing, no change, close -> no prompt ──
log('=== 1. OSD existing, no change, close ===');
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
await page.locator('[aria-label="Close"]').click();
await page.waitForTimeout(400);
check(await page.getByRole('button', { name: /Stay/i }).count() === 0, 'OSD: no-change close does not show unsaved-changes prompt');
await page.screenshot({ path: `${OUT}/osd-01-no-change-close.png` });

// ── 2. Edit, change, close -> prompt; Stay keeps field; Leave discards ──
log('=== 2. OSD existing, change, close -> Stay keeps field ===');
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
await page.locator('[name="damageDescription"]').fill('EDITED — should trigger leave guard');
await page.locator('[aria-label="Close"]').click();
await page.waitForTimeout(400);
const stayBtn = page.getByRole('button', { name: /Stay/i });
check(await stayBtn.count() > 0, 'OSD: dirty close shows confirm dialog with Stay option');
await stayBtn.click();
await page.waitForTimeout(300);
check((await page.locator('[name="damageDescription"]').inputValue()).includes('EDITED'), 'OSD: Stay preserves the edited field value');
await page.locator('[aria-label="Close"]').click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /^Leave/i }).click();
await page.waitForTimeout(500);
check(await page.locator('[name="damageDescription"]').count() === 0, 'OSD: Leave actually closes the modal');
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
check((await page.locator('[name="damageDescription"]').inputValue()) === 'One bundle short on delivery.', 'OSD: Leave discarded the edit, reopened value is original');
await page.locator('[aria-label="Close"]').click();
await page.waitForTimeout(400);

// ── 3. Normal save: response status/body + REAL (fetch-based) persistence, not just SPA reopen ──
log('=== 3. OSD normal save: response status/body + real GET persistence ===');
let lastResponse = null;
page.on('response', async (r) => {
    if (r.url().includes('/api/osd/forms-osd-1') && r.request().method() === 'PUT') {
        lastResponse = { status: r.status(), body: await r.json().catch(() => null) };
    }
});
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
await page.locator('[name="damageDescription"]').fill('SAVED VALUE — normal save test');
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(1000);
check(lastResponse !== null, 'OSD: PUT response was captured');
check(lastResponse.status >= 200 && lastResponse.status < 300, `OSD: save response status is 2xx (got ${lastResponse?.status})`);
check(lastResponse.body?.damageDescription === 'SAVED VALUE — normal save test', `OSD: save response BODY reflects the new value (got "${lastResponse.body?.damageDescription}")`);
check(await page.locator('[name="damageDescription"]').count() === 0, 'OSD: modal closes automatically after successful save');
const rawAfterSave = await rawGet('/api/osd/');
const persistedRow = (rawAfterSave.body || []).find(r => r.documentNumber === 'QTS-FLG-OSD-000001' || r.id === 'forms-osd-1');
check(rawAfterSave.status === 200, `OSD: raw GET /osd/ status 200 (got ${rawAfterSave.status})`);
check(persistedRow?.damageDescription === 'SAVED VALUE — normal save test', `OSD: raw GET (bypassing UI/store entirely) confirms DB persistence (got "${persistedRow?.damageDescription}")`);
await page.screenshot({ path: `${OUT}/osd-04-after-normal-save.png` });

// ── 4. Simulated save failure: EXACT toast/request counts, first attempt vs retry distinguished ──
log('=== 4. OSD simulated save failure + retry (exact counts) ===');
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
let putCount = 0;
let failNext = true;
await page.route('**/api/osd/**', async (route) => {
    if (route.request().method() === 'PUT') {
        putCount++;
        if (failNext) {
            failNext = false;
            await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated 500 for FORMS-2026-002 verification' }) });
            return;
        }
    }
    await route.continue();
});
await page.locator('[name="damageDescription"]').fill('SHOULD FAIL FIRST — retry test');
const saveBtn = page.getByRole('button', { name: /^Save$/ });
await saveBtn.click();
await page.waitForTimeout(1000);
check(putCount === 1, `OSD: exactly one PUT sent on the first (failing) attempt (got ${putCount})`);
check(await page.locator('[name="damageDescription"]').count() === 1, 'OSD: modal stays open after simulated save failure');
check((await page.locator('[name="damageDescription"]').inputValue()) === 'SHOULD FAIL FIRST — retry test', 'OSD: input value preserved after failed save');
check(await saveBtn.isEnabled(), 'OSD: Save button re-enabled after failure (not stuck disabled)');
const toastsAfterFailure = await page.locator('[data-sonner-toast]').count();
check(toastsAfterFailure === 1, `OSD: EXACTLY one error toast shown after the first failure (got ${toastsAfterFailure}, not just >=1)`);
const toastText = await page.locator('[data-sonner-toast]').first().innerText();
// Exact text, traced through the real code path: describeSaveError() for a 5xx NEVER echoes the
// response body (saveErrors.ts's own stated rule — a 5xx body can carry a validation dump), so
// "Simulated 500" (our fake body's detail string) never appears; it always resolves to
// saveFlow.server, then presentOutcome's 'failed' case wraps it in saveFlow.failedKeep. Both
// keys are read directly from context/LanguageContext.tsx's English strings, not guessed.
const expectedFailToastText = 'Not saved — everything you entered is kept. Server error (HTTP 500). Try again later or contact an administrator.';
check(toastText === expectedFailToastText, `OSD: the single toast's text matches the exact friendly message (got "${toastText}", expected "${expectedFailToastText}")`);
await page.locator('[name="damageDescription"]').fill('RETRY SUCCEEDED — final value');
putCount = 0;
await saveBtn.click();
await page.waitForTimeout(1000);
await page.unroute('**/api/osd/**');
check(putCount === 1, `OSD retry: exactly one PUT sent on the retry attempt (got ${putCount}) — first (0 success) and retry (1 success) are distinct counts`);
check(await page.locator('[name="damageDescription"]').count() === 0, 'OSD retry: modal closes after the successful retry');
const rawAfterRetry = await rawGet('/api/osd/');
const retryRow = (rawAfterRetry.body || []).find(r => r.id === 'forms-osd-1');
check(retryRow?.damageDescription === 'RETRY SUCCEEDED — final value', `OSD retry: raw GET confirms DB reflects the RETRIED save, not the failed attempt (got "${retryRow?.damageDescription}")`);
await page.screenshot({ path: `${OUT}/osd-06-after-retry.png` });

// ── 5. R2 core: NEW record, partial attachment failure, retry must NOT duplicate the main POST ──
// R2 (FORMS-2026-002 review): also verify the SUCCESSFUL category's response + re-read (not just
// "it was attempted"); the retry sends ONLY the failed category by exact count (not `.includes`
// existence); and a field changed before the retry is actually persisted on the same id.
log('=== 5. OSD new record + partial attachment failure -> retry must not re-POST the record ===');
await page.goto(`${BASE}/osd`);
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Add.*OSD|New OSD|Add New/i }).first().click().catch(async () => {
    // Fallback: some builds label it differently — find any "add" button on the page.
    await page.locator('button').filter({ hasText: /add/i }).first().click();
});
await page.waitForTimeout(500);
await page.locator('[name="itemDescription"]').fill('FORMS-2026-003 partial-upload test item');
// One category (defectPhoto) will succeed, one (attachment) will be made to fail — proves
// per-category classification, not an all-or-nothing retry.
await page.setInputFiles('#attachment-upload-osd-defect-photos', { name: 'defect.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });
await page.setInputFiles('#attachment-upload-osd-attachments', { name: 'evidence.txt', mimeType: 'text/plain', buffer: Buffer.from('evidence') });
await page.waitForTimeout(300);

let postOsdCount = 0;
let uploadCalls = [];
let uploadResponses = [];
await page.route('**/api/osd/', async (route) => {
    if (route.request().method() === 'POST') {
        postOsdCount++;
        await route.continue();
    } else await route.continue();
});
await page.route('**/api/files/upload', async (route) => {
    const body = route.request().postData() || '';
    const m = body.match(/name="category"\r?\n\r?\n(\w+)/);
    const category = m ? m[1] : 'unknown';
    uploadCalls.push(category);
    if (category === 'attachment') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Simulated upload failure for FORMS-2026-003' }) });
        return;
    }
    await route.continue();
});
page.on('response', async (r) => {
    if (r.url().includes('/api/files/upload')) uploadResponses.push({ status: r.status(), body: await r.json().catch(() => null) });
});
const saveBtnNew = page.getByRole('button', { name: /^Save$/ });
await saveBtnNew.click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/osd-07-new-record-partial-failure.png` });
check(postOsdCount === 1, `OSD new+partial: exactly one POST /osd/ on the FIRST attempt (got ${postOsdCount})`);
check(uploadCalls.filter(c => c === 'defectPhoto').length === 1, `OSD new+partial: defectPhoto upload attempted exactly once (got ${uploadCalls.filter(c => c === 'defectPhoto').length})`);
check(uploadCalls.filter(c => c === 'attachment').length === 1, `OSD new+partial: attachment upload attempted exactly once and made to fail (got ${uploadCalls.filter(c => c === 'attachment').length})`);
const defectUploadResp = uploadResponses.find(r => r.status >= 200 && r.status < 300);
check(!!defectUploadResp, 'OSD new+partial: the successful (defectPhoto) upload response was captured, status 2xx');
check(Array.isArray(defectUploadResp?.body) && defectUploadResp.body.length === 1, `OSD new+partial: successful upload response body lists exactly one uploaded file (got ${JSON.stringify(defectUploadResp?.body)})`);
check(await page.locator('[name="itemDescription"]').count() === 1, 'OSD new+partial: modal stays open — the record IS saved, only the attachment failed');
const warnToast = await page.locator('[data-sonner-toast]').count();
check(warnToast === 1, `OSD new+partial: EXACTLY one toast distinguishes "record saved, attachment incomplete" from total failure (got ${warnToast})`);
const warnToastText = await page.locator('[data-sonner-toast]').first().innerText();
// Exact text, traced through OSDModals.tsx's applyOutcome(): the "主資料已保存，但附件處理尚未完成："
// prefix is a hardcoded literal (not routed through t(), so it does not change with the 'en'
// locale this script runs under), followed by outcome.failures[0].message — which for our
// simulated 500 is describeSaveError()'s saveFlow.server text (never the raw response body).
const expectedPartialToastText = '主資料已保存，但附件處理尚未完成：Server error (HTTP 500). Try again later or contact an administrator.';
check(warnToastText === expectedPartialToastText, `OSD new+partial: toast text matches exactly (got "${warnToastText}", expected "${expectedPartialToastText}")`);
// The record now exists — confirm via raw GET there is exactly ONE row with this description
// (not zero — main data lost — and not two — duplicated by a subsequent retry).
const rawAfterPartial = await rawGet('/api/osd/');
const partialRows = (rawAfterPartial.body || []).filter(r => r.itemDescription === 'FORMS-2026-003 partial-upload test item');
check(partialRows.length === 1, `OSD new+partial: exactly ONE record exists after the partial failure (got ${partialRows.length})`);
const partialRecordId = partialRows[0]?.id;
// Re-read via the actual files-by-entity endpoint (not the osd row itself) — confirms the
// successful defectPhoto upload is really retrievable, not merely "a 2xx came back once".
const rawDefectFiles = await rawGet(`/api/files/by-entity?entity_type=osd&entity_id=${partialRecordId}&category=defectPhoto`);
check(rawDefectFiles.status === 200 && Array.isArray(rawDefectFiles.body) && rawDefectFiles.body.length === 1, `OSD new+partial: re-reading defectPhoto files for this record finds exactly the one successful upload (got status ${rawDefectFiles.status}, ${JSON.stringify(rawDefectFiles.body)})`);

// Retry: change a field (poNumber) before retrying — must still update the SAME id, and only
// the FAILED category (attachment) should be re-sent; defectPhoto must NOT be re-uploaded since
// its pending queue was already cleared by the successful first attempt.
await page.locator('[name="poNumber"]').fill('PO-RETRY-CHANGED');
postOsdCount = 0;
uploadCalls = [];
let putOsdCount = 0;
await page.route(`**/api/osd/${partialRecordId}`, async (route) => {
    if (route.request().method() === 'PUT') putOsdCount++;
    await route.continue();
});
await page.unroute('**/api/files/upload');
await page.route('**/api/files/upload', async (route) => {
    const body = route.request().postData() || '';
    const m = body.match(/name="category"\r?\n\r?\n(\w+)/);
    uploadCalls.push(m ? m[1] : 'unknown');
    await route.continue();
});
await saveBtnNew.click();
await page.waitForTimeout(1200);
await page.unroute('**/api/osd/');
await page.unroute(`**/api/osd/${partialRecordId}`);
await page.unroute('**/api/files/upload');
check(postOsdCount === 0, `OSD new+partial retry: the retry sends ZERO additional POST /osd/ — the same record is reused, not re-created (got ${postOsdCount})`);
check(uploadCalls.length === 1 && uploadCalls[0] === 'attachment', `OSD new+partial retry: EXACTLY one upload is retried, and it is the failed category only — defectPhoto is not re-sent (got ${JSON.stringify(uploadCalls)})`);
check(await page.locator('[name="itemDescription"]').count() === 0, 'OSD new+partial retry: modal closes once the retry actually completes everything');
const rawAfterFullRetry = await rawGet('/api/osd/');
const finalRows = (rawAfterFullRetry.body || []).filter(r => r.itemDescription === 'FORMS-2026-003 partial-upload test item');
check(finalRows.length === 1, `OSD new+partial retry: STILL exactly ONE record after the retry — no duplicate was created (got ${finalRows.length})`);
check(finalRows[0]?.id === partialRecordId, 'OSD new+partial retry: the retried record has the SAME id as before the retry');
check(finalRows[0]?.poNumber === 'PO-RETRY-CHANGED', `OSD new+partial retry: the field changed immediately before the retry (poNumber) was actually saved on that same record (got "${finalRows[0]?.poNumber}")`);
await page.screenshot({ path: `${OUT}/osd-08-after-partial-retry.png` });

// ── 5b. R2: delete partial success/failure — one id succeeds, one 404s; 404 is NOT success ──
log('=== 5b. OSD existing record: delete one file success, one 404 — 404 must stay in the failure queue ===');
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
await page.setInputFiles('#attachment-upload-osd-attachments', [
    { name: 'to-delete-ok.txt', mimeType: 'text/plain', buffer: Buffer.from('ok') },
    { name: 'to-delete-404.txt', mimeType: 'text/plain', buffer: Buffer.from('404') },
]);
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(1000);
// Reopen to get the real file ids the server assigned, then mark both for deletion.
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
const osd1 = (await rawGet('/api/osd/')).body.find(r => r.id === 'forms-osd-1');
const rawAttachmentFiles = await rawGet(`/api/files/by-entity?entity_type=osd&entity_id=forms-osd-1&category=attachment`);
const okFile = rawAttachmentFiles.body.find(f => f.file_name === 'to-delete-ok.txt');
const the404File = rawAttachmentFiles.body.find(f => f.file_name === 'to-delete-404.txt');
check(!!okFile && !!the404File, `OSD 5b: both just-uploaded attachment files are found via re-read (got ${JSON.stringify(rawAttachmentFiles.body?.map(f => f.file_name))})`);
const okFileId = okFile.id, the404FileId = the404File.id;
let deleteCalls = [];
await page.route('**/api/files/*', async (route) => {
    if (route.request().method() !== 'DELETE') { await route.continue(); return; }
    const url = route.request().url();
    deleteCalls.push(url);
    if (url.includes(the404FileId)) {
        await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'Not found' }) });
    } else {
        await route.continue();
    }
});
// Mark both existing attachments for deletion via the UI. FileAttachment.tsx renders each
// existing file's name in `<div style={styles.fileName} title={a.file_name}>` — the `title`
// attribute is exactly the filename, a precise unique hook — as a SIBLING of its own
// `<button title="Delete">` within the same preview item (handleRemoveApiFile ->
// onDeleteExistingFile, which only stages the id locally; the real DELETE only fires when the
// main Save below runs it through runSaveFlow).
const deleteOkBtn = page.locator('div[title="to-delete-ok.txt"]').locator('xpath=..').locator('button[aria-label="Delete"]');
const delete404Btn = page.locator('div[title="to-delete-404.txt"]').locator('xpath=..').locator('button[aria-label="Delete"]');
await deleteOkBtn.first().scrollIntoViewIfNeeded();
await deleteOkBtn.first().click({ force: true });
await delete404Btn.first().scrollIntoViewIfNeeded();
await delete404Btn.first().click({ force: true });
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(1200);
check(deleteCalls.length === 2, `OSD 5b: exactly two delete requests were sent on the first attempt (got ${deleteCalls.length})`);
const rawAfterDelete = await rawGet(`/api/files/by-entity?entity_type=osd&entity_id=forms-osd-1&category=attachment`);
const remainingNames = (rawAfterDelete.body || []).map(f => f.file_name);
check(!remainingNames.includes('to-delete-ok.txt'), `OSD 5b: the SUCCESSFULLY deleted file is actually gone on re-read (remaining: ${JSON.stringify(remainingNames)})`);
check(remainingNames.includes('to-delete-404.txt'), `OSD 5b: the 404'd file is NOT treated as deleted — it is still present (404 is not silently accepted as success) (remaining: ${JSON.stringify(remainingNames)})`);
// R2 (FORMS-2026-004): the FORMS-2026-003 version stopped here — it only ever confirmed the
// 404'd file stayed in the failure queue via re-read, but never actually clicked Save again in
// this SAME window to prove the retry itself behaves correctly. A 404 on delete cannot delete
// anything server-side either way, so that earlier check would have passed even if the retry
// logic silently dropped the failed id from the queue. This continues in the same browser
// window/modal session (OSDModals.tsx's applyOutcome keeps `deletedFileIds` seeded with
// `outcome.remainingDeletes`, so the still-open modal already carries the 404'd id forward).
check(await page.locator('[name="itemDescription"]').count() === 1, 'OSD 5b: the modal stays open after the partial delete failure (record IS saved, only the delete is incomplete)');
const partialDeleteToastText = await page.locator('[data-sonner-toast]').first().innerText();
check(partialDeleteToastText.startsWith('主資料已保存，但附件處理尚未完成：'), `OSD 5b: the partial-failure toast is shown after the first attempt (got "${partialDeleteToastText}")`);
await page.unroute('**/api/files/*');
deleteCalls = [];
await page.route('**/api/files/*', async (route) => {
    if (route.request().method() === 'DELETE') deleteCalls.push(route.request().url());
    await route.continue();
});
await page.getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(1200);
check(deleteCalls.length === 1, `OSD 5b retry: EXACTLY one delete is re-sent on the retry (got ${deleteCalls.length}) — not two`);
check(deleteCalls[0].includes(the404FileId), `OSD 5b retry: the re-sent delete is for the previously-404'd id, not the already-succeeded one (got ${JSON.stringify(deleteCalls)})`);
check(await page.locator('[name="itemDescription"]').count() === 0, 'OSD 5b retry: the modal closes once the retried delete actually succeeds');
const rawAfterRetryDelete = await rawGet(`/api/files/by-entity?entity_type=osd&entity_id=forms-osd-1&category=attachment`);
const remainingNamesAfterRetry = (rawAfterRetryDelete.body || []).map(f => f.file_name);
check(!remainingNamesAfterRetry.includes('to-delete-404.txt'), `OSD 5b retry: the previously-404'd file is now actually gone on re-read (remaining: ${JSON.stringify(remainingNamesAfterRetry)})`);
await page.unroute('**/api/files/*');
await page.screenshot({ path: `${OUT}/osd-09-delete-partial-404-then-retried.png` });

// ── 6. R3 pending-navigation: NOT reachable for OSD specifically — documented, not asserted ──
// Investigated two real mechanisms for "trigger real in-app navigation while save is pending":
//   1. Clicking the sidebar Dashboard link: the OSD editor is a fixed full-screen modal overlay
//      sitting visually on top of the sidebar. Confirmed via screenshot that a forced click at
//      the link's coordinates is swallowed by the overlay at the BROWSER's own hit-testing level
//      (not just a Playwright actionability guard) — a real user cannot reach that link at all
//      while the modal is open, regardless of LeaveGuard. This is normal modal UX, not a gap.
//   2. page.goBack(): tried as a substitute real-navigation trigger, but history was built with
//      page.goto() (a hard, full page load) for both /dashboard and /osd, so goBack() here is
//      ALSO a hard browser-level back-navigation, not a client-side router POP the SPA's router
//      ever sees in-session. It went straight through to /dashboard with the save still in
//      flight. This is NOT treated as a confirmed finding about LeaveGuard — the test setup
//      itself cannot distinguish "useBlocker doesn't catch POP navigation" from "there was no
//      SPA router transition for it to catch in the first place" without further isolation this
//      round did not have time to build. Left unverified rather than asserted either way.
// The "real pending navigation" scenario IS reachable and tested where it actually applies: see
// forms-leave-guard-review-naming-rules.mjs (a full-page editor with no overlay blocking the
// sidebar) for the real in-app-Link-while-pending case that fully exercises the blocked ->
// auto-resume behavior.
log('=== 6. OSD: pending-navigation scenario — see naming-rules script; documented limitation here, not asserted ===');

// ── 6b. regression: rapid double-click during a save still sends only one request ──
log('=== 6b. OSD: rapid double-click during save still sends only one request (regression) ===');
await page.goto(`${BASE}/osd`); // start from a clean list view, not whatever scenario 5b left open
await page.waitForTimeout(400);
await page.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000001' }).click();
await page.waitForTimeout(500);
let delayResolve2;
const delayPromise2 = new Promise(r => { delayResolve2 = r; });
let delayedPutCount2 = 0;
await page.route('**/api/osd/**', async (route) => {
    if (route.request().method() === 'PUT') {
        delayedPutCount2++;
        await delayPromise2;
        await route.continue();
    } else await route.continue();
});
await page.locator('[name="damageDescription"]').fill('DOUBLE CLICK TEST');
const saveBtn3 = page.getByRole('button', { name: /^Save$/ });
await saveBtn3.click();
await page.waitForTimeout(200);
await saveBtn3.click({ force: true }).catch(() => {});
await page.waitForTimeout(200);
check(delayedPutCount2 === 1, `OSD double-click: rapid double-click during save sends only one request (got ${delayedPutCount2})`);
delayResolve2();
await page.waitForTimeout(1000);
await page.unroute('**/api/osd/**');
check(await page.locator('[name="damageDescription"]').count() === 0, 'OSD double-click: modal closed once the save actually completed');

// ── 7. R3: OSD readOnly (Closed record, no osd:create:all) does not expose a save entry point ──
log('=== 7. OSD readOnly (Closed record, view-only account) has no save entry point ===');
const browser2 = await chromium.launch();
const page2 = await browser2.newPage({ viewport: { width: 1440, height: 1200 } });
page2.setDefaultTimeout(15000);
await page2.addInitScript(() => localStorage.setItem('language', 'en'));
await page2.goto(`${BASE}/login`);
await page2.fill('#email', 'forms_role_readonly');
await page2.fill('#password', PW);
await page2.click('button[type=submit]');
await page2.waitForURL(u => !u.pathname.includes('/login'));
await page2.goto(`${BASE}/osd`);
await page2.waitForTimeout(500);
await page2.locator('table tbody tr').filter({ hasText: 'QTS-FLG-OSD-000002' }).click();
await page2.waitForTimeout(500);
const readOnlySaveCount = await page2.getByRole('button', { name: /^Save$/ }).count();
check(readOnlySaveCount === 0, `OSD readOnly: no Save button rendered on a Closed record for an account without osd:create:all (found ${readOnlySaveCount})`);
const readOnlyFieldDisabled = await page2.locator('[name="damageDescription"]').isDisabled().catch(() => null);
check(readOnlyFieldDisabled === true, `OSD readOnly: damageDescription field is disabled (got ${readOnlyFieldDisabled})`);
await page2.screenshot({ path: `${OUT}/osd-13-readonly-closed-record.png` });
await browser2.close();

log(`===== OSD DONE: ${checks} checks passed =====`);
await browser.close();
