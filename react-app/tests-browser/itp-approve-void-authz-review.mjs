// ITP Approve/Void authorization gate review (2026-09-28). Real isolated backend throughout.
// Covers POST/PUT via direct API calls (permission-boundary tests don't have a natural UI
// trigger for the denial paths) plus a real-screen Publish check.
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

const basicOnly = await login('itp_basic_only');
const approveOnly = await login('itp_approve_only');
const full = await login('itp_full');
const otherProject = await login('itp_other_project');
const scopedBasic = await login('itp_scoped_basic');

const commonItp = { vendor: 'ITP Authz Review Co', rev: 'Rev1.0', submit: '', submissionDate: '2026-09-28', project_id: 'IAZ-P1' };

// ══ 1. POST create with status=Approved ══════════════════════════════════════════════════════
try {
    const auditBefore = sql(`SELECT COUNT(*) FROM audit_logs WHERE entity_type='ITP';`);
    const r1 = await apiCall(basicOnly, 'POST', '/api/itp/', { ...commonItp, description: 'create-approved-basic-only', status: 'Approved' });
    note('1a. itp_basic_only (create+update, NO approve) POST status=Approved', `HTTP ${r1.status} body=${JSON.stringify(r1.body).slice(0, 150)}`);
    const r2 = await apiCall(approveOnly, 'POST', '/api/itp/', { ...commonItp, description: 'create-approved-approve-only', status: 'Approved' });
    note('1b. itp_approve_only (approve+void, NO create) POST status=Approved', `HTTP ${r2.status} body=${JSON.stringify(r2.body).slice(0, 150)}`);
    const r3 = await apiCall(full, 'POST', '/api/itp/', { ...commonItp, description: 'create-approved-full', status: 'Approved' });
    note('1c. itp_full (all permissions) POST status=Approved', `HTTP ${r3.status} id=${r3.body?.id}`);
    const auditAfter = sql(`SELECT COUNT(*) FROM audit_logs WHERE entity_type='ITP';`);
    note('1d. audit_logs increment (expect exactly +1, only from the successful create)', `${auditBefore} -> ${auditAfter}`);
    note('1e. rows actually created in DB matching the rejected descriptions (expect 0 each)',
        `basic-only=${sql(`SELECT COUNT(*) FROM itp WHERE description='create-approved-basic-only';`)}, approve-only=${sql(`SELECT COUNT(*) FROM itp WHERE description='create-approved-approve-only';`)}`);
} catch (e) { fail('1. POST create status=Approved', e); }

// ══ 2. POST create with status=Void ═══════════════════════════════════════════════════════════
try {
    const r1 = await apiCall(basicOnly, 'POST', '/api/itp/', { ...commonItp, description: 'create-void-basic-only', status: 'Void' });
    note('2a. itp_basic_only (NO void) POST status=Void', `HTTP ${r1.status} body=${JSON.stringify(r1.body).slice(0, 150)}`);
    const r2 = await apiCall(approveOnly, 'POST', '/api/itp/', { ...commonItp, description: 'create-void-approve-only', status: 'Void' });
    note('2b. itp_approve_only (has void, NO create) POST status=Void', `HTTP ${r2.status} body=${JSON.stringify(r2.body).slice(0, 150)}`);
    const r3 = await apiCall(full, 'POST', '/api/itp/', { ...commonItp, description: 'create-void-full', status: 'Void' });
    note('2c. itp_full POST status=Void', `HTTP ${r3.status} id=${r3.body?.id}`);
} catch (e) { fail('2. POST create status=Void', e); }

// Full-row snapshot: EVERY column of the itp table for one id, plus its full audit_logs rows
// (not just a count) — used to prove nothing at all changed on a rejected write, not just the
// three columns spot-checked in the first draft of this review.
const fullRow = id => sql(`SELECT * FROM itp WHERE id='${id}';`);
const auditRows = id => sql(`SELECT id, action, entity_type, entity_id, old_value, new_value, user_id, username FROM audit_logs WHERE entity_type='ITP' AND entity_id='${id}' ORDER BY id;`);

// ══ 3. PUT update entering Approved (Pending -> Approved) ════════════════════════════════════
try {
    const before = fullRow('iaz-itp-pending');
    const auditBefore = auditRows('iaz-itp-pending');
    const r1 = await apiCall(basicOnly, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Approved' });
    note('3a. itp_basic_only PUT Pending->Approved', `HTTP ${r1.status} body=${JSON.stringify(r1.body).slice(0, 150)}`);
    const afterReject = fullRow('iaz-itp-pending');
    note('3b. FULL ROW (every column, incl. referenceNo/id/version-bearing fields) unchanged after rejection', afterReject === before);
    const auditAfterReject = auditRows('iaz-itp-pending');
    note('3c. audit_logs rows (full content, not just count) unchanged after rejection', auditAfterReject === auditBefore);

    const r2 = await apiCall(approveOnly, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Approved' });
    note('3d. itp_approve_only (no basic update) PUT Pending->Approved', `HTTP ${r2.status} body=${JSON.stringify(r2.body).slice(0, 150)}`);

    const r3 = await apiCall(full, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Approved' });
    note('3e. itp_full PUT Pending->Approved (legitimate)', `HTTP ${r3.status} status=${r3.body?.status}`);
    note('3f. DB status after legitimate approval', sql(`SELECT status FROM itp WHERE id='iaz-itp-pending';`));
} catch (e) { fail('3. PUT entering Approved', e); }

// ══ 3g. Lateral move within the approval family (Approved -> Approved with comments) ═════════
// Corrected 2026-09-28: this is now gated the same as any other entry into the approval family
// (see services/itp_service.py) — the earlier exemption was an unrequested narrowing, reversed
// after review. NOT a claim that "Approved with comments" belongs in the family at all — that
// remains a separate, unconfirmed policy question, flagged in the report.
try {
    const r1 = await apiCall(scopedBasic, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Approved with comments' });
    note('3g. itp_scoped_basic (no approve) PUT Approved->Approved with comments (lateral, expect 403)', `HTTP ${r1.status} body=${JSON.stringify(r1.body).slice(0, 150)}`);
    const r2 = await apiCall(full, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Approved with comments' });
    note('3h. itp_full PUT Approved->Approved with comments (lateral, has approve, expect 200)', `HTTP ${r2.status} status=${r2.body?.status}`);
} catch (e) { fail('3g/h. Lateral move within approval family', e); }

// ══ 4. PUT update entering Void (using the now-Approved iaz-itp-pending) ═════════════════════
try {
    const r1 = await apiCall(basicOnly, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Void' });
    note('4a. itp_basic_only PUT ->Void', `HTTP ${r1.status} body=${JSON.stringify(r1.body).slice(0, 150)}`);
    const r2 = await apiCall(full, 'PUT', '/api/itp/iaz-itp-pending/', { status: 'Void' });
    note('4b. itp_full PUT ->Void (legitimate)', `HTTP ${r2.status} status=${r2.body?.status}`);
} catch (e) { fail('4. PUT entering Void', e); }

// ══ 4b. Scope-check ordering: does missing approve/void ever leak record existence? ══════════
// itp_scoped_basic holds itp:create:all/itp:update:all but NOT itp:approve:all/itp:void:all, and
// is scoped (via UserProject) to IAZ-P1 only — unlike itp_basic_only, which holds no UserProject
// row and is therefore UNRESTRICTED (compute_scope's "nothing configured -> unscoped" rule), so
// it could never demonstrate this. Compare its response to a nonexistent id against its response
// to iaz-itp-p2-pending (a REAL record, but in IAZ-P2, outside its scope) — both must come back
// byte-identical (same status, same body), proving record_in_scope short-circuits to None before
// the permission check ever runs, so this permission gate cannot be used to probe for a record's
// existence outside the caller's scope.
try {
    const rNonexistent = await apiCall(scopedBasic, 'PUT', '/api/itp/does-not-exist-at-all/', { status: 'Approved' });
    note('4b-1. itp_scoped_basic (no approve) PUT nonexistent id, status=Approved', `HTTP ${rNonexistent.status} body=${JSON.stringify(rNonexistent.body)}`);
    const rOutOfScope = await apiCall(scopedBasic, 'PUT', '/api/itp/iaz-itp-p2-pending/', { status: 'Approved' });
    note('4b-2. itp_scoped_basic (no approve) PUT REAL but out-of-scope id, status=Approved', `HTTP ${rOutOfScope.status} body=${JSON.stringify(rOutOfScope.body)}`);
    note('4b-3. identical status code and body for nonexistent vs out-of-scope (expect true — no leak)',
        rNonexistent.status === rOutOfScope.status && JSON.stringify(rNonexistent.body) === JSON.stringify(rOutOfScope.body));
    // Confirm the out-of-scope record was untouched.
    note('4b-4. out-of-scope record status unchanged in DB', sql(`SELECT status FROM itp WHERE id='iaz-itp-p2-pending';`));

    // Same pair, but GET (read path) — confirms the same non-leaking 404 on the read side too.
    const gNonexistent = await apiCall(scopedBasic, 'GET', '/api/itp/does-not-exist-at-all/');
    const gOutOfScope = await apiCall(scopedBasic, 'GET', '/api/itp/iaz-itp-p2-pending/');
    note('4b-5. GET nonexistent vs out-of-scope also identical', `${gNonexistent.status}=${gOutOfScope.status} ` +
        (gNonexistent.status === gOutOfScope.status && JSON.stringify(gNonexistent.body) === JSON.stringify(gOutOfScope.body)));
} catch (e) { fail('4b. Scope-check ordering / no-leak', e); }

// ══ 5. Scope: fully-permissioned but wrong-project account is still blocked ══════════════════
try {
    const r = await apiCall(otherProject, 'PUT', '/api/itp/iaz-itp-approved/', { status: 'Void' });
    note('5. itp_other_project (all permissions, WRONG project scope) PUT ->Void (expect 404, scope hides existence — unrelated to this batch)', `HTTP ${r.status} body=${JSON.stringify(r.body).slice(0, 150)}`);
} catch (e) { fail('5. Scope still enforced', e); }

// ══ 6. Illegal transition still rejected even WITH full permission (Void is terminal) ════════
try {
    const r = await apiCall(full, 'PUT', '/api/itp/iaz-itp-void/', { status: 'Pending' });
    note('6. itp_full (all permissions) PUT Void->Pending (illegal transition, expect 400 not 200)', `HTTP ${r.status} body=${JSON.stringify(r.body).slice(0, 150)}`);
} catch (e) { fail('6. Illegal transition still rejected', e); }

// ══ 7. Same-status resend needs no approve permission (no-op per WorkflowEngine) ═════════════
try {
    const r = await apiCall(basicOnly, 'PUT', '/api/itp/iaz-itp-approved/', { status: 'Approved', remark: 'resend, no change' });
    note('7. itp_basic_only (NO approve) PUT Approved->Approved (same status, expect 200)', `HTTP ${r.status} status=${r.body?.status}`);
} catch (e) { fail('7. Same-status resend', e); }

// ══ 8. Real screen: Publish button hidden without approve permission; visible + working with it ═
try {
    await basicOnly.goto(UI + '/itp'); await basicOnly.waitForTimeout(1200);
    const searchInput = basicOnly.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill('QTS-IAZ-ITP-000001');
    await basicOnly.waitForTimeout(700);
    await basicOnly.locator('tr', { hasText: 'QTS-IAZ-ITP-000001' }).first().click({ timeout: 10000 });
    await modal(basicOnly).waitFor({ timeout: 10000 });
    const m1 = modal(basicOnly);
    await m1.locator('button', { hasText: /^(一般|General|Plan)$/ }).first().click().catch(() => {});
    const publishBtnBasic = basicOnly.locator('button', { hasText: 'Publish' });
    note('8a. Publish button visible to itp_basic_only (no approve permission, expect NOT visible)', await publishBtnBasic.count());
    // Also confirm the Approved/Void options are not offered in the status dropdown for this account.
    const optionValues = await m1.locator('select').evaluateAll(nodes => nodes.map(n => Array.from(n.options).map(o => o.value)));
    note('8b. status dropdown option sets available to itp_basic_only', JSON.stringify(optionValues));

    await full.goto(UI + '/itp'); await full.waitForTimeout(1200);
    const searchInput2 = full.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput2.fill('QTS-IAZ-ITP-000002');
    await full.waitForTimeout(700);
    await full.locator('tr', { hasText: 'QTS-IAZ-ITP-000002' }).first().click({ timeout: 10000 });
    await modal(full).waitFor({ timeout: 10000 });
    const m2 = modal(full);
    await m2.locator('button', { hasText: /^(一般|General|Plan)$/ }).first().click().catch(() => {});
    const publishBtnFull = full.locator('button', { hasText: 'Publish' });
    note('8c. Publish button visible to itp_full (has approve permission, expect visible)', await publishBtnFull.count());
} catch (e) { fail('8. Real-screen Publish gating', e); }

await browser.close();
console.log('DONE');
