// ITP main-succeeds/detail-fails save-outcome review (2026-09-28). Real isolated backend + real
// screens. Batch scope: on an EXISTING record's update, main PUT succeeding while the follow-up
// detail PUT fails must be reported distinctly ("main saved, plan not saved"), keep the modal/
// inputs/pending-attachment-queue intact, re-enable Save, and a retry (with or without further
// edits) must complete the detail write and save the latest content. Backend transactions,
// permissions, and the WorkflowEngine state machine are untouched.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
const descField = pg => modal(pg).locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
const saveBtn = pg => modal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const toasts = async pg => (await pg.locator('[data-sonner-toast]').allInnerTexts());
function countRequests(pg, method, pathPrefix) {
    const state = { count: 0 };
    pg.on('request', req => { if (req.method() === method && req.url().includes(pathPrefix)) state.count++; });
    return state;
}
const openByRef = async (pg, refSuffix) => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    const searchInput = pg.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(`QTS-IMD-ITP-${refSuffix}`);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: `QTS-IMD-ITP-${refSuffix}` }).first().click();
    await modal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
};

const full = await login('itp_mdp_full');

// ══ 1. Baseline: main PUT succeeds, detail PUT hits a NETWORK-LEVEL failure (aborted — no HTTP
// response at all, so whether the backend actually received/wrote it is genuinely unknown). Must
// show the conservative "unconfirmed" wording, never the raw "Network Error" text, and never say
// "not saved" — that stronger claim is never used by this batch's code at all (see scenario 1f
// below: even a real HTTP error response does not prove rejection-before-write, since the
// endpoint could fail while building its response AFTER already committing; this batch did not
// audit that endpoint's every failure path closely enough to claim otherwise, so every failure
// gets the same conservative wording). Editing ONLY the description (no inspection-plan item
// change) avoids the separate onApplyItems auto-save-per-edit path (existing records auto-save
// detail on every add/edit/delete in the Inspection Plan tab, independent of the main Save
// button) so this reproduces main-succeeds/detail-fails via the Save button's own two-step write
// specifically. ════════════════════════════════════════════════════════════════════════════════
try {
    await openByRef(full, '000001');
    await descField(full).fill('Baseline: main saved, detail should fail', { timeout: 5000 });
    await full.route('**/itp/imd-itp-baseline-fail/detail', route => route.abort('failed'));
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    const toastTexts = (await toasts(full)).join(' | ');
    note('1a. toast text: main saved + UNCONFIRMED result (network-level failure, no HTTP response at all)', toastTexts);
    note('1a2. toast does NOT say the plan was "not saved" (only a CONFIRMED rejection may say that)', !toastTexts.includes('尚未保存') && !/\bnot saved\b/i.test(toastTexts));
    note('1a3. toast does NOT surface the raw underlying error text as a user explanation', !toastTexts.includes('Network Error'));
    note('1b. modal still open', await modal(full).isVisible());
    note('1c. description input still shows the edited value', await descField(full).inputValue());
    note('1d. Save button re-enabled', !(await saveBtn(full).isDisabled()));
    note('1e. DB: main field WAS saved despite the toast reading as unconfirmed, not confirmed-failed', sql(`SELECT description FROM itp WHERE id='imd-itp-baseline-fail';`));
    await full.unroute('**/itp/imd-itp-baseline-fail/detail');
} catch (e) { fail('1. Baseline: main succeeds, detail fails — distinct message + state preserved', e); }

// ══ 2. Retry with NO further edits: main PUT re-sent (harmless resend), detail PUT now completes ═
try {
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    note('2a. retry succeeds: modal closed', !(await modal(full).isVisible().catch(() => false)));
    note('2b. DB description unchanged from the baseline save (retry did not alter it)', sql(`SELECT description FROM itp WHERE id='imd-itp-baseline-fail';`));
} catch (e) { fail('2. Retry with no further edits completes the detail write', e); }

// ══ 1f. A real HTTP error response (simulated via route.fulfill(500)) must NOT be read as "the
// backend confirmed rejection before writing" — a response coming back only proves the backend
// REPLIED, not that update_itp_detail's commit never happened (it could fail while building the
// response, AFTER already committing). This must use the SAME conservative "unconfirmed" wording
// as a network-level failure (scenario 1 above), never a "not saved" claim. ══════════════════════
try {
    await openByRef(full, '000005');
    await descField(full).fill('Simulated-500 uses the SAME conservative wording', { timeout: 5000 });
    await full.route('**/itp/imd-itp-confirmed-rejection/detail', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced 500 for this review' }) }));
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    const toastTexts = (await toasts(full)).join(' | ');
    note('1f. toast text for a simulated 500 (a real HTTP response, but that does NOT prove the write was rejected)', toastTexts);
    note('1g. toast uses the conservative "unconfirmed" wording, NOT "not saved" (a response is not proof of rejection — the endpoint could fail after already committing)', !toastTexts.includes('尚未保存') && !/\bnot saved\b/i.test(toastTexts));
    note('1h. toast does not surface the raw 500 body as a user-facing explanation', !toastTexts.includes('forced 500'));
    note('1i. DB: main field saved regardless of the simulated 500', sql(`SELECT description FROM itp WHERE id='imd-itp-confirmed-rejection';`));
    await full.unroute('**/itp/imd-itp-confirmed-rejection/detail');
} catch (e) { fail('1f-i. A real HTTP response (even 500) still uses the conservative "unconfirmed" wording', e); }

// ══ 3. Edit-before-retry: after a detail failure, the user changes the description AGAIN before
// retrying — the retry must save the LATEST content, not the content from the failed attempt. ════
try {
    await openByRef(full, '000002');
    await descField(full).fill('First edit (detail will fail)', { timeout: 5000 });
    await full.route('**/itp/imd-itp-edit-before-retry/detail', route => route.abort('failed'));
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    note('3a. modal still open after the first (forced-fail) attempt', await modal(full).isVisible());
    note('3b. DB already reflects the FIRST edit (main record saved on the first attempt)', sql(`SELECT description FROM itp WHERE id='imd-itp-edit-before-retry';`));

    // Further edit made AFTER the failure, before retrying.
    await descField(full).fill('Second edit (should be what gets saved on retry)', { timeout: 5000 });
    await full.unroute('**/itp/imd-itp-edit-before-retry/detail');
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    note('3c. retry succeeds: modal closed', !(await modal(full).isVisible().catch(() => false)));
    note('3d. DB reflects the SECOND (latest) edit, not the first', sql(`SELECT description FROM itp WHERE id='imd-itp-edit-before-retry';`));
} catch (e) { fail('3. Edit-before-retry saves the latest content, not the failed attempt\'s', e); }

// ══ 4. A pending attachment must NOT be reported as uploaded, nor cleared from the pending queue,
// when the detail write fails and Phase 2 (attachments) is never reached this attempt. ═══════════
const tmpFile = `${process.env.TMPDIR || '/tmp'}/itp-mdp-review-upload.txt`;
writeFileSync(tmpFile, 'itp main/detail partial review upload content');
try {
    const uploadReqs = countRequests(full, 'POST', '/api/files/upload');
    await openByRef(full, '000003');
    await descField(full).fill('Attachment-untouched scenario edit', { timeout: 5000 });
    await modal(full).locator('input[type=file]').first().setInputFiles(tmpFile);
    await full.waitForTimeout(300);
    await full.route('**/itp/imd-itp-attachment-untouched/detail', route => route.abort('failed'));
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    const toastTexts = (await toasts(full)).join(' | ');
    note('4a. toast does not claim the attachment was uploaded (names only the main-record/plan outcome)', toastTexts);
    note('4b. zero POST /api/files/upload calls were made (Phase 2 never reached this attempt)', uploadReqs.count);
    note('4c. attachment count in DB is 0 (nothing uploaded)', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='imd-itp-attachment-untouched';`));

    // Retry: detail now succeeds, and the STILL-PENDING file from the failed attempt should
    // finally be uploaded (proving it was retained, not silently dropped, by the failure above).
    await full.unroute('**/itp/imd-itp-attachment-untouched/detail');
    await saveBtn(full).click();
    await full.waitForTimeout(1500);
    note('4d. retry succeeds: modal closed', !(await modal(full).isVisible().catch(() => false)));
    note('4e. the pending attachment (queued before the detail failure) is NOW uploaded on retry', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='imd-itp-attachment-untouched';`));
} catch (e) { fail('4. Pending attachment is neither falsely reported done nor dropped by a detail failure', e); }

// ══ 5. Clean success regression: no interception, ordinary save completes normally ════════════════
try {
    await openByRef(full, '000004');
    await descField(full).fill('Clean success regression edit', { timeout: 5000 });
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    note('5a. clean save closes the modal', !(await modal(full).isVisible().catch(() => false)));
    note('5b. DB reflects the clean save', sql(`SELECT description FROM itp WHERE id='imd-itp-clean-success';`));
} catch (e) { fail('5. Clean full-success regression', e); }

await browser.close();
console.log('DONE');
