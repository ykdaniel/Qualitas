// ITP status dropdown vs. backend transition-map review (2026-09-28). Real isolated backend +
// real screens. Batch scope: the status <select> must only offer targets the backend's own
// WorkflowEngine.TRANSITIONS["ITP"] map actually accepts, plus the current value (resend);
// approve/void permission gating (from an earlier batch) is preserved unchanged. Backend
// (WorkflowEngine map itself, permission gate, scope) untouched.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
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
async function apiCall(p, method, path, body) {
    return await p.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await res.json(); } catch (_) {}
        return { status: res.status, body: j };
    }, { method, path, body });
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
const statusSelect = pg => modal(pg).locator('label', { hasText: '狀態' }).locator('xpath=following::select[1]');
const saveBtn = pg => modal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();

const openByRef = async (pg, refSuffix) => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    const searchInput = pg.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(`QTS-ISM-ITP-${refSuffix}`);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: `QTS-ISM-ITP-${refSuffix}` }).first().click();
    await modal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
};
const optionValues = async pg => statusSelect(pg).evaluate(el => Array.from(el.options).map(o => o.value));

const full = await login('itp_status_full');
const basic = await login('itp_status_basic');

// ══ 1. Confirm the reported gap is REAL and CURRENT, not just an old report ══════════════════════
try {
    await openByRef(full, '000001'); // Pending
    const opts = await optionValues(full);
    note('1a. options offered from Pending (current code, current screen)', JSON.stringify(opts));
    note('1b. "Rejected" is NOT offered (backend has no transition into it from any status)', !opts.includes('Rejected'));
    note('1c. "No submit" is NOT offered (same reason)', !opts.includes('No submit'));
} catch (e) { fail('1. Reproduce/confirm the gap is fixed on current code', e); }

// ══ 2. Pending: exactly the backend-legal target set is offered (Approved family, Revise&Resubmit,
// Void — all gated correctly by approve/void permission for the full account) ════════════════════
try {
    const opts = await optionValues(full);
    const expected = ['Pending', 'Approved', 'Approved with comments', 'Revise & Resubmit', 'Void'];
    note('2a. option set from Pending matches the backend TRANSITIONS entry exactly (order-independent)', JSON.stringify([...opts].sort()) === JSON.stringify([...expected].sort()));
} catch (e) { fail('2. Pending offers exactly its legal targets', e); }

// ══ 3. Approved with comments -> Approved is asymmetric in the backend map: must NOT be offered ═
try {
    await openByRef(full, '000002'); // Approved with comments
    const opts = await optionValues(full);
    note('3a. options offered from "Approved with comments"', JSON.stringify(opts));
    note('3b. "Approved" is NOT offered (TRANSITIONS["Approved with comments"] does not include it — asymmetric with the reverse direction)', !opts.includes('Approved'));
    note('3c. "Pending", "Revise & Resubmit", "Void" ARE offered (the actual legal targets)', ['Pending', 'Revise & Resubmit', 'Void'].every(s => opts.includes(s)));
} catch (e) { fail('3. Asymmetric transition (Approved with comments -> Approved) correctly excluded', e); }

// ══ 4. Void is terminal: dropdown offers ONLY the current value ══════════════════════════════════
try {
    await openByRef(full, '000003'); // Void
    const opts = await optionValues(full);
    note('4a. options offered from Void (expect exactly ["Void"])', JSON.stringify(opts));
} catch (e) { fail('4. Void (terminal) offers no other target', e); }

// ══ 5. Historical "Rejected" / "No submit" records: shown as current value, but since neither is
// a recognized SOURCE state in the backend map either, no other target is legal from them ═══════
try {
    await openByRef(full, '000004'); // Rejected
    const optsRejected = await optionValues(full);
    note('5a. options offered from a Rejected record (expect exactly ["Rejected"] — not a recognized source state, backend allows no transition out of it)', JSON.stringify(optsRejected));

    await openByRef(full, '000005'); // No submit
    const optsNoSubmit = await optionValues(full);
    note('5b. options offered from a "No submit" record (expect exactly ["No submit"], same reasoning)', JSON.stringify(optsNoSubmit));
} catch (e) { fail('5. Historical Rejected/No submit records are dead ends, honestly represented', e); }

// ══ 6. Entirely unrecognized historical status: shown as-is with an explicit note, not coerced ═══
try {
    await openByRef(full, '000006'); // LegacyUnknownStatus123
    const opts = await optionValues(full);
    note('6a. the unrecognized value itself IS the selected option (not silently replaced by Pending)', await statusSelect(full).inputValue());
    note('6b. options list contains ONLY that value (no other target considered legal from an unknown source)', JSON.stringify(opts));
    const hintVisible = await modal(full).locator('text=無法辨識的狀態').count();
    note('6c. an explicit "unrecognized status" hint is shown', hintVisible > 0);
} catch (e) { fail('6. Entirely unrecognized status is shown as-is with an explicit note', e); }

// ══ 6d/6e. Unknown-status record: does an ORDINARY field edit + resending the SAME (unrecognized)
// status actually save successfully? (Not previously tested — testing it now rather than leaving
// it unverified, since the fixture and stack are already in place.) ═══════════════════════════════
try {
    const descField = modal(full).locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
    await descField.fill('Unknown-status record, ordinary field edit');
    await saveBtn(full).click();
    await full.waitForTimeout(1000);
    note('6d. ordinary field edit on an unknown-status record, same status resent unchanged (expect the new description saved, status still the unrecognized value)',
        sql(`SELECT description, status FROM itp WHERE id='ism-itp-legacy-unknown';`));
} catch (e) { fail('6d/e. Ordinary edit + same-status resend on an unrecognized status', e); }

// ══ 6f-6i. Baseline guard: selecting a legal target WITHOUT saving must not "unlock" a further
// option that the real (last-saved) status does not actually allow — options must be computed
// from existingItem.status, never from the live (possibly unsaved) formData.status. ═════════════
try {
    await openByRef(full, '000002'); // Approved with comments (baseline) — legal targets: Pending, Revise & Resubmit, Void (NOT Approved)
    const optsBefore = await optionValues(full);
    note('6f. baseline options from "Approved with comments" before touching anything', JSON.stringify(optsBefore));
    note('6g. "Approved" correctly absent from the baseline set', !optsBefore.includes('Approved'));

    // Select "Pending" — a LEGAL target from the baseline — but do NOT save.
    await statusSelect(full).selectOption('Pending');
    const optsAfterUnsavedSelection = await optionValues(full);
    note('6h. options AFTER selecting Pending but WITHOUT saving (must be UNCHANGED from 6f — computed from existingItem.status, not the live unsaved selection)',
        JSON.stringify(optsAfterUnsavedSelection) === JSON.stringify(optsBefore) ? 'unchanged' : JSON.stringify(optsAfterUnsavedSelection));
    note('6i. "Approved" is STILL absent after the unsaved selection (not unlocked by picking Pending first)', !optsAfterUnsavedSelection.includes('Approved'));
    // Confirm nothing was actually saved by this probing.
    note('6j. DB unaffected by this unsaved probing', sql(`SELECT status FROM itp WHERE id='ism-itp-approved-w-comments';`));
} catch (e) { fail('6f-j. Options are computed from the saved baseline, not a live unsaved selection', e); }

// ══ 7. Legal transition still succeeds end-to-end (Pending -> Revise & Resubmit, no permission
// needed) and the record is genuinely updated in the DB ══════════════════════════════════════════
try {
    await openByRef(full, '000001'); // Pending
    await statusSelect(full).selectOption('Revise & Resubmit');
    await saveBtn(full).click();
    await full.waitForTimeout(1000);
    note('7a. DB status after a legal on-screen transition', sql(`SELECT status FROM itp WHERE id='ism-itp-pending';`));
} catch (e) { fail('7. A legal transition still succeeds via the real screen', e); }

// ══ 8. No approve/void permission: those options are not offered on screen, AND a direct API
// call attempting the same illegal-for-this-screen transition is still rejected by the backend ═══
try {
    await openByRef(basic, '000007'); // a fresh Approved record for this scenario
    const opts = await optionValues(basic);
    note('8a. options offered to itp_status_basic (NO approve/void) from Approved', JSON.stringify(opts));
    note('8b. "Approved with comments" NOT offered (no itp:approve:all)', !opts.includes('Approved with comments'));
    note('8c. "Void" NOT offered (no itp:void:all)', !opts.includes('Void'));
    note('8d. "Pending" IS offered (legal target, no special permission required)', opts.includes('Pending'));

    const res = await apiCall(basic, 'PUT', '/api/itp/ism-itp-approved/', { status: 'Void' });
    note('8e. direct API attempt to enter Void without itp:void:all (expect 403)', `HTTP ${res.status} body=${JSON.stringify(res.body).slice(0, 150)}`);
    note('8f. DB status unchanged after the rejected attempt', sql(`SELECT status FROM itp WHERE id='ism-itp-approved';`));
} catch (e) { fail('8. No approve/void permission: hidden on screen, still rejected by API', e); }

// ══ 9. Regression: ordinary field edit, same-status resend, and Publish all still work ══════════
try {
    await openByRef(full, '000001'); // now "Revise & Resubmit" after step 7
    const currentOpts = await optionValues(full);
    note('9a. current options for a record now in Revise & Resubmit', JSON.stringify(currentOpts));
    await statusSelect(full).selectOption('Revise & Resubmit'); // same-status resend
    await saveBtn(full).click();
    await full.waitForTimeout(1000);
    note('9b. same-status resend still succeeds (expect 200, DB unchanged)', sql(`SELECT status FROM itp WHERE id='ism-itp-pending';`));

    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await full.locator('input[placeholder="搜尋 ITP..."]').first().fill('QTS-ISM-ITP-000001');
    await full.waitForTimeout(700);
    await full.locator('tr', { hasText: 'QTS-ISM-ITP-000001' }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    const descField = modal(full).locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
    await descField.fill('Ordinary field edit regression check');
    await saveBtn(full).click();
    await full.waitForTimeout(1000);
    note('9c. ordinary field edit still saves correctly', sql(`SELECT description FROM itp WHERE id='ism-itp-pending';`));

    // Publish: move ism-itp-pending back to Pending first (Revise & Resubmit -> Pending is legal),
    // then Publish (Pending -> Approved with rev bump), full account has approve permission.
    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await full.locator('input[placeholder="搜尋 ITP..."]').first().fill('QTS-ISM-ITP-000001');
    await full.waitForTimeout(700);
    await full.locator('tr', { hasText: 'QTS-ISM-ITP-000001' }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    await statusSelect(full).selectOption('Pending');
    await saveBtn(full).click();
    await full.waitForTimeout(1000);

    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await full.locator('input[placeholder="搜尋 ITP..."]').first().fill('QTS-ISM-ITP-000001');
    await full.waitForTimeout(700);
    await full.locator('tr', { hasText: 'QTS-ISM-ITP-000001' }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    await modal(full).locator('button', { hasText: '檢驗計畫' }).click();
    const publishBtn = modal(full).locator('button', { hasText: 'Publish' });
    note('9d. Publish button visible (full account has itp:approve:all)', await publishBtn.count());
    await publishBtn.first().click();
    await full.waitForTimeout(1200);
    note('9e. Publish succeeds, status now Approved', sql(`SELECT status, rev FROM itp WHERE id='ism-itp-pending';`));
} catch (e) { fail('9. Ordinary edit / same-status resend / Publish regression', e); }

await browser.close();
console.log('DONE');
