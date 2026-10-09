// NOI business review — real browser, real screens, permission tiers, isolated stack (2026-09-23).
// Covers: create (real screen, all required fields), status-transition chain Open->In Progress->Resolved->
// Closed, the Reject-lock frontend/backend mismatch (noi:approve:all is frontend-only per code read —
// confirmed here), and whether Closed truly blocks non-status-field edits on the backend.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);

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

const creator = await login('noi_creator');           // noi:view:all, noi:create:all ONLY — no contractors:view:all
const creatorCV = await login('noi_creator_cv');       // same + contractors:view:all — workaround, same pattern as pqp_creator_cv
const editor = await login('noi_editor');

// ══ 0. Confirm noi_creator's Contractor dropdown is genuinely empty (same cross-module gap found for PQP) ═
await creator.goto(UI + '/noi'); await creator.waitForTimeout(1200);
const netlogContractors = [];
creator.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/contractors')) netlogContractors.push(`${r.status()}`); });
await creator.locator('button', { hasText: /新增|Add/ }).first().click();
await modal(creator).waitFor({ timeout: 10000 });
await creator.waitForTimeout(800);
const contractorOptCount = await modal(creator).locator('select').first().locator('option').count();
note('noi_creator (no contractors:view:all): GET /api/contractors/ response status(es)', JSON.stringify(netlogContractors));
note('noi_creator: Contractor dropdown option count (1 = only the blank placeholder, dropdown is effectively empty)', contractorOptCount);
await creator.close();

// ══ 1. Real-screen create by noi_creator_cv (workaround account): fill every required field ═══════════
await creatorCV.goto(UI + '/noi'); await creatorCV.waitForTimeout(1200);
await creatorCV.locator('button', { hasText: /新增|Add/ }).first().click();
await modal(creatorCV).waitFor({ timeout: 10000 });
await creatorCV.waitForTimeout(600);

const m = modal(creatorCV);
async function fillByLabel(labelText, value, tag = 'input') {
    const label = m.locator('label', { hasText: labelText }).first();
    const field = label.locator(`xpath=following-sibling::${tag}[1]`);
    if (await field.count()) {
        // Issue/Inspection Date inputs start as type="text" and flip to type="date" only on focus
        // (NOIDetailModal.tsx) — fill() alone without a real click first can race that flip and lose
        // the typed value (confirmed via a dedicated debug run); clicking first is the reliable fix.
        await field.click();
        await field.fill(value);
        return true;
    }
    return false;
}
async function selectByLabel(labelText, value) {
    const label = m.locator('label', { hasText: labelText }).first();
    const field = label.locator('xpath=following-sibling::select[1]');
    if (await field.count()) { await field.selectOption(value); return true; }
    return false;
}

// Contractor (select) — required, also unlocks the ITP dropdown. Labels are t() translation keys,
// rendered in zh (this session's locale) — matching by English text would find nothing.
const contractorOk = await selectByLabel('承包商', 'NOI Review Co').catch(() => false);
note('filled Contractor (承包商)', contractorOk);
await creatorCV.waitForTimeout(300);
const itpOk = await selectByLabel('ITP 編號', 'QTS-NRC-ITP-000001').catch(() => false);
note('filled ITP No (ITP 編號)', itpOk);
const packageOk = await fillByLabel('主旨', 'NOI review subject').catch(() => false);
note('filled Subject (主旨)', packageOk);
const issueDateOk = await fillByLabel('發佈日期', '2026-09-23').catch(() => false);
note('filled Issue Date (發佈日期)', issueDateOk);
const inspDateOk = await fillByLabel('檢驗日期', '2026-09-23').catch(() => false);
note('filled Inspection Date (檢驗日期)', inspDateOk);
const inspTimeOk = await fillByLabel('檢驗時間', '1000').catch(() => false);
note('filled Inspection Time (檢驗時間)', inspTimeOk);
const eventOk = await fillByLabel('事件編號', 'EVT-001').catch(() => false);
note('filled Event No (事件編號)', eventOk);
const checkpointOk = await selectByLabel('檢查點', 'H').catch(() => false);
note('filled Checkpoint (檢查點)', checkpointOk);
const contactOk = await fillByLabel('聯絡人', 'Review Contact').catch(() => false);
note('filled Contact (聯絡人)', contactOk);
const phoneOk = await fillByLabel('電話', '0912345678').catch(() => false);
note('filled Phone (電話)', phoneOk);
const emailOk = await fillByLabel('電子郵件', 'review@example.com').catch(() => false);
note('filled Email (電子郵件)', emailOk);

const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ });
const saveDisabled = await saveBtn.first().isDisabled().catch(() => 'n/a');
note('Save button disabled state after filling all fields', saveDisabled);
let noiId = null;
if (saveDisabled === false) {
    await saveBtn.first().click();
    await creatorCV.waitForTimeout(1200);
    const created = sql(`SELECT id, referenceNo, status FROM noi ORDER BY rowid DESC LIMIT 1;`);
    note('NOI created via real screen fill (id|referenceNo|status)', created);
    noiId = created.split('|')[0];
} else {
    const toasts = (await creatorCV.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
    note('could not save — Save stayed disabled; visible toasts', toasts);
}

// ══ 2. Status-transition chain (real screen, noi_editor): Open -> In Progress -> Resolved -> Closed ═══
if (noiId) {
    await editor.goto(UI + '/noi'); await editor.waitForTimeout(1200);
    const refNo = sql(`SELECT referenceNo FROM noi WHERE id='${noiId}';`);
    for (const nextStatus of ['In Progress', 'Resolved', 'Closed']) {
        await editor.locator('tr', { hasText: refNo }).first().click();
        await modal(editor).waitFor({ timeout: 10000 });
        await editor.waitForTimeout(500);
        // .filter({has:...}) proved unreliable for dropdown discovery in earlier rounds (ITR's link-checklist
        // select) — scan each select's actual option values directly instead of trusting the filter chain.
        const allSelects = modal(editor).locator('select');
        const selCount = await allSelects.count();
        let statusSelectIdx = -1;
        for (let i = 0; i < selCount; i++) {
            const vals = await allSelects.nth(i).locator('option').evaluateAll(els => els.map(e => e.value));
            if (vals.includes(nextStatus)) { statusSelectIdx = i; break; }
        }
        const found = statusSelectIdx !== -1;
        note(`status dropdown offers "${nextStatus}" as a next step (should match NOIStatusTransitions exactly)`, found);
        if (found) {
            await allSelects.nth(statusSelectIdx).selectOption(nextStatus);
            const editSaveBtn = modal(editor).locator('button', { hasText: /^(儲存|Save)$/ });
            await editSaveBtn.first().click();
            await editor.waitForTimeout(1000);
        } else {
            const closeBtn = modal(editor).locator('button[aria-label="Close"], button:has-text("×")').first();
            if (await closeBtn.count()) { await closeBtn.click().catch(() => {}); await editor.waitForTimeout(500); }
        }
        const dbStatus = sql(`SELECT status FROM noi WHERE id='${noiId}';`);
        note(`DB status after attempting transition to "${nextStatus}"`, dbStatus);
    }
}

// ══ 3. Reject-lock: noi:approve:all is frontend-only — confirm via direct backend bypass ══════════════
if (noiId) {
    // Build a second, independent NOI directly via API (same shape the real create form sends) and push
    // it to Reject, so this test doesn't depend on step 2's Closed NOI (which is a dead end).
    const seedRes = await apiCall(editor, 'POST', '/api/noi/', {
        package: 'Reject-lock retest', contractor: 'NOI Review Co', itpNo: 'QTS-NRC-ITP-000001',
        issueDate: '2026-09-23', inspectionDate: '2026-09-23', inspectionTime: '10:00',
        eventNumber: 'EVT-002', checkpoint: 'H', contacts: 'x', phone: '0912345678', email: 'x@example.com',
        status: 'Open', type: 'H',
    });
    const rejectTargetId = seedRes.body?.id;
    note('seeded a fresh Open NOI for the Reject-lock retest', `HTTP ${seedRes.status} id=${rejectTargetId} body=${JSON.stringify(seedRes.body).slice(0, 200)}`);
    if (rejectTargetId) {
        const toReject = await apiCall(editor, 'PUT', `/api/noi/${rejectTargetId}/`, { status: 'Reject' });
        note('moved it to Reject (editor, via direct API)', `HTTP ${toReject.status}`);
        // Frontend gate check: with noi:update:all but WITHOUT noi:approve:all, editing a Rejected NOI
        // should render readOnly (NOI.tsx: locked ? hasPermission('noi:approve:all') : ...).
        await editor.goto(UI + '/noi'); await editor.waitForTimeout(1200);
        const rejRefNo = sql(`SELECT referenceNo FROM noi WHERE id='${rejectTargetId}';`);
        await editor.locator('tr', { hasText: rejRefNo }).first().click();
        await modal(editor).waitFor({ timeout: 10000 });
        await editor.waitForTimeout(500);
        const remarkField = modal(editor).locator('textarea').first();
        const isReadOnly = await remarkField.getAttribute('readonly').catch(() => null);
        const isDisabled = await remarkField.isDisabled().catch(() => null);
        note('noi_editor (no noi:approve:all) opens the Rejected NOI — remark field readOnly/disabled on screen', `readonly=${isReadOnly} disabled=${isDisabled}`);

        // Now bypass the frontend entirely: direct PUT as noi_editor (has ONLY noi:update:all, confirmed via seed).
        const bypass = await apiCall(editor, 'PUT', `/api/noi/${rejectTargetId}/`, { remark: 'edited via direct API bypass, no noi:approve:all' });
        note('noi_editor direct PUT on the Rejected NOI, bypassing the frontend readOnly gate', `HTTP ${bypass.status}`);
        const afterBypass = sql(`SELECT remark FROM noi WHERE id='${rejectTargetId}';`);
        note('DB remark after the bypass attempt', afterBypass);
    }
}

// ══ 4. Closed-lock: does the backend actually reject non-status field edits, or only status changes? ═══
if (noiId) {
    const closedStatus = sql(`SELECT status FROM noi WHERE id='${noiId}';`);
    note('the step-2 NOI status (expected Closed if the transition chain completed)', closedStatus);
    if (closedStatus === 'Closed') {
        // Frontend: NOI.tsx sets canEdit=false unconditionally for status==='closed' — confirm the modal
        // truly renders read-only on screen (not just that a permission check happens to fail).
        await editor.goto(UI + '/noi'); await editor.waitForTimeout(1200);
        const closedRefNo = sql(`SELECT referenceNo FROM noi WHERE id='${noiId}';`);
        await editor.locator('tr', { hasText: closedRefNo }).first().click();
        await modal(editor).waitFor({ timeout: 10000 });
        await editor.waitForTimeout(500);
        const closedRemarkField = modal(editor).locator('textarea').first();
        const closedReadOnly = await closedRemarkField.getAttribute('readonly').catch(() => null);
        note('Closed NOI remark field readonly attribute on screen (frontend should ALWAYS lock this, any permission)', closedReadOnly);

        // Backend bypass attempt: PUT a non-status field (remark) with no status in the payload at all.
        // update_noi's transition check only fires `if noi_update.status` — omitting status entirely
        // means that check never runs; testing whether some OTHER guard still blocks the write.
        const closedBypass = await apiCall(editor, 'PUT', `/api/noi/${noiId}/`, { remark: 'edited via direct API on a Closed NOI, status field omitted' });
        note('noi_editor direct PUT on a Closed NOI, omitting the status field entirely', `HTTP ${closedBypass.status} body=${JSON.stringify(closedBypass.body).slice(0, 200)}`);
        const afterClosedBypass = sql(`SELECT remark FROM noi WHERE id='${noiId}';`);
        note('DB remark after the Closed-bypass attempt', afterClosedBypass);
    } else {
        note('skipping the Closed-lock bypass check — step 2 did not reach Closed', '');
    }
}

await browser.close();
console.log('DONE');
