// ITP review round 2 — bounded supplementary verification per user's four corrections (2026-09-23).
// Uses real login (cookie auth) then in-page fetch() for API-level checks (CSRF header read from the
// csrf_token cookie the app itself sets), plus real Playwright clicks for the screen-only checks
// (dirty-flag-after-failed-save, create-only completion flow, Generate Checklist -> ITR link).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return { ctx, p };
}

// in-page fetch helper: reads csrf_token cookie, attaches X-CSRF-Token, returns {status, body}
async function apiCall(page, method, path, body) {
    return await page.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, {
            method, credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
            body: body ? JSON.stringify(body) : undefined,
        });
        let json = null; try { json = await res.json(); } catch (_) {}
        return { status: res.status, body: json };
    }, { method, path, body });
}

const tiers = {
    editor: await login('itp_editor'),       // has update, no approve/void
    approver: await login('itp_approver'),   // has approve+void+update+create
    viewer: await login('itp_viewer'),       // view only — no create/update
    creator: await login('itp_creator'),     // create only — no update
};

const basePayload = (status) => ({
    vendor: 'ITP Review Co', description: 'Round2 direct-status probe', rev: '', submit: '', status,
    remark: '', submissionDate: new Date().toISOString().split('T')[0],
});

console.log('\n=== 1. POST create with status=Approved directly, across permission tiers ===');
for (const [tier, { p }] of Object.entries(tiers)) {
    const r = await apiCall(p, 'POST', '/api/itp/', basePayload('Approved'));
    note(`POST /api/itp/ status=Approved as ${tier}`, `HTTP ${r.status}  id=${r.body?.id || r.body?.detail || ''}`);
}

console.log('\n=== 2. PUT existing Pending ITP directly to Approved, across permission tiers ===');
// Create one fresh Pending ITP as approver (has full rights) to use as the shared target row.
const seedRow = await apiCall(tiers.approver.p, 'POST', '/api/itp/', basePayload('Pending'));
const targetId = seedRow.body.id;
note('seed target ITP created (Pending) for the PUT-tier tests', `id=${targetId} status=${seedRow.body.status}`);
for (const [tier, { p }] of Object.entries(tiers)) {
    // fresh Pending row per tier so one tier's success doesn't block the next tier's transition check
    const row = await apiCall(tiers.approver.p, 'POST', '/api/itp/', basePayload('Pending'));
    const r = await apiCall(p, 'PUT', `/api/itp/${row.body.id}/`, { status: 'Approved' });
    const dbRow = sql(`SELECT status, rev FROM itp WHERE id='${row.body.id}';`);
    note(`PUT /api/itp/{id}/ status=Approved as ${tier}`, `HTTP ${r.status}  DB-after=${dbRow}`);
}

console.log('\n=== 3. Void: entry point + tier check (dropdown option in the same status select, saved via handleSave not Publish) ===');
for (const [tier, { p }] of Object.entries(tiers)) {
    const row = await apiCall(tiers.approver.p, 'POST', '/api/itp/', basePayload('Pending'));
    const r = await apiCall(p, 'PUT', `/api/itp/${row.body.id}/`, { status: 'Void' });
    const dbRow = sql(`SELECT status FROM itp WHERE id='${row.body.id}';`);
    note(`PUT status=Void as ${tier} (Pending -> Void, a transition WorkflowEngine does allow)`, `HTTP ${r.status}  DB-after=${dbRow}`);
}
// Also probe the two dropdown options that are NOT in WorkflowEngine.TRANSITIONS at all, to confirm the UI/backend mismatch
for (const badStatus of ['Rejected', 'No submit']) {
    const row = await apiCall(tiers.approver.p, 'POST', '/api/itp/', basePayload('Pending'));
    const r = await apiCall(tiers.approver.p, 'PUT', `/api/itp/${row.body.id}/`, { status: badStatus });
    note(`PUT status="${badStatus}" (dropdown offers it, WorkflowEngine.TRANSITIONS does not define it) as approver`, `HTTP ${r.status}  body=${JSON.stringify(r.body)}`);
}

console.log('\n=== 4. Audit trail check: did the approve-gap PUT (step 2, editor tier) actually get logged? ===');
const auditRows = sql(`SELECT action, entity_id, old_value, new_value FROM audit_logs WHERE entity_type='ITP' ORDER BY id DESC LIMIT 5;`);
note('last 5 ITP audit_logs rows (newest first)', auditRows);

console.log('\n=== 5. Publish screen click for editor tier (rev bump check, re-confirm round 1) ===');
await tiers.editor.p.goto(UI + '/itp'); await tiers.editor.p.waitForTimeout(1500);
await tiers.editor.p.locator('table tbody tr').first().click().catch(() => {});
await tiers.editor.p.waitForTimeout(800);
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
tiers.editor.p.on('dialog', d => d.accept());
const pubBtn = modal(tiers.editor.p).locator('button', { hasText: 'Publish' });
if (await pubBtn.count()) {
    const before = sql(`SELECT id, status, rev FROM itp ORDER BY rowid DESC LIMIT 1;`);
    await pubBtn.first().click(); await tiers.editor.p.waitForTimeout(1200);
    note('row targeted by Publish click, before', before);
} else {
    note('Publish button not found (modal did not open as expected)', '');
}

console.log('\n=== 6. Dirty-flag-after-failed-save: real field edit -> failed save -> attempt close ===');
// itp_creator has itp:view:all + itp:create:all but NOT itp:update:all -> any save on an existing row must fail.
await tiers.creator.p.goto(UI + '/itp'); await tiers.creator.p.waitForTimeout(1500);
await tiers.creator.p.locator('table tbody tr').first().click().catch(() => {});
await tiers.creator.p.waitForTimeout(800);
const m2 = modal(tiers.creator.p);
const remarkField = m2.locator('textarea').first();
let editedSomething = false;
if (await remarkField.count()) {
    await remarkField.fill('round2-dirty-flag-probe-' + Date.now());
    editedSomething = true;
}
note('creator: edited a field before attempting save', editedSomething);
const saveBtn = m2.locator('button', { hasText: /^(儲存|Save)$/ });
await saveBtn.first().click().catch(() => {});
await tiers.creator.p.waitForTimeout(1200);
const toastsAfterFail = (await tiers.creator.p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
note('toast shown after the failed save', toastsAfterFail);
const stillOpenAfterFail = await m2.count() > 0;
note('modal still open after the failed save (input not silently discarded from the DOM)', stillOpenAfterFail);
if (stillOpenAfterFail && editedSomething) {
    const fieldValueStillThere = await remarkField.inputValue().catch(() => null);
    note('the edited field still shows the typed value in the DOM', fieldValueStillThere);
}
// Now try to close: does a discard-changes confirmation appear?
const closeBtn = m2.locator('button[aria-label="Close"], button:has-text("×")').first();
let closeAttempted = false;
if (await closeBtn.count()) { await closeBtn.click().catch(() => {}); closeAttempted = true; }
await tiers.creator.p.waitForTimeout(500);
const confirmDialogVisible = await tiers.creator.p.locator('text=/discard|捨棄|unsaved|未儲存/i').count();
note('close attempted via visible close button', closeAttempted);
note('a discard-changes confirmation appeared on close attempt', confirmDialogVisible > 0);
note('modal still present after close attempt (i.e. it did NOT just close silently)', await m2.count() > 0);

console.log('\n=== 7. itp_creator (create-only): can they complete a full, populated ITP through the whole flow (not just the empty POST)? ===');
await tiers.creator.p.goto(UI + '/itp'); await tiers.creator.p.waitForTimeout(1500);
const addBtn = tiers.creator.p.locator('button', { hasText: /新增|Add/ });
const beforeCount = sql(`SELECT COUNT(*) FROM itp;`);
await addBtn.first().click();
await modal(tiers.creator.p).waitFor({ timeout: 10000 }).catch(() => {});
await tiers.creator.p.waitForTimeout(800);
const afterAddCount = sql(`SELECT COUNT(*) FROM itp;`);
note('ITP row count before/after clicking Add (does an empty row get created even for create-only account before any field is filled)', `${beforeCount} -> ${afterAddCount}`);
const newRow = sql(`SELECT id, status, description FROM itp ORDER BY rowid DESC LIMIT 1;`);
note('the row created by the click', newRow);
const m3 = modal(tiers.creator.p);
const descField = m3.locator('textarea').first();
if (await descField.count()) { await descField.fill('round2 creator full-flow attempt'); }
const saveBtn3 = m3.locator('button', { hasText: /^(儲存|Save)$/ });
await saveBtn3.first().click().catch(() => {});
await tiers.creator.p.waitForTimeout(1200);
const afterSaveAttempt = sql(`SELECT id, status, description FROM itp ORDER BY rowid DESC LIMIT 1;`);
note('creator attempts to Save the ITP they just auto-created (does saving their OWN new record work, since it is still theirs / no update yet applied?)', afterSaveAttempt);
const toastsCreatorSave = (await tiers.creator.p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
note('toast after creator tries to save their own newly-created ITP', toastsCreatorSave);
// Now: what if the creator navigates away / cancels without saving? Does the empty auto-created row persist?
const closeBtn3 = m3.locator('button[aria-label="Close"], button:has-text("×")').first();
if (await closeBtn3.count()) { await closeBtn3.click().catch(() => {}); }
await tiers.creator.p.waitForTimeout(500);
// accept any discard-confirmation if it appears
const confirmBtn = tiers.creator.p.locator('button', { hasText: /確認|Confirm|Yes|Discard|捨棄/i });
if (await confirmBtn.count()) { await confirmBtn.first().click().catch(() => {}); await tiers.creator.p.waitForTimeout(500); }
const afterCancelCount = sql(`SELECT COUNT(*) FROM itp;`);
const orphanRow = sql(`SELECT id, status, description FROM itp ORDER BY rowid DESC LIMIT 1;`);
note('ITP row count after cancelling out of the just-created record (does the auto-created empty/partial row remain in the DB)', `${afterAddCount} -> ${afterCancelCount}`);
note('the most recent row after cancel (is it the orphaned auto-created one, still there?)', orphanRow);

console.log('\n=== 8. Generate Checklist full real click, then attempt to link it into an ITR as a template ===');
const linker = await login('itp_itr_linker');
await linker.p.goto(UI + '/itp'); await linker.p.waitForTimeout(1500);
await addBtn.first().click().catch(() => {}); // reuse locator style on a new page instance below instead
const addBtnL = linker.p.locator('button', { hasText: /新增|Add/ });
await addBtnL.first().click();
await modal(linker.p).waitFor({ timeout: 10000 });
await linker.p.waitForTimeout(500);
const addItemBtn = modal(linker.p).locator('button', { hasText: 'Add New Item' });
await addItemBtn.first().click();
await linker.p.waitForTimeout(400);
// fill the item editor's Activity(EN) field, then click Apply
const activityInput = linker.p.locator('input').filter({ hasText: '' }).nth(0);
// more targeted: the item editor panel has a labeled "Activity" area; fall back to first empty text input in the panel
const panelInputs = linker.p.locator('input[type=text], input:not([type])');
const cnt = await panelInputs.count();
let filled = false;
for (let i = 0; i < cnt; i++) {
    const val = await panelInputs.nth(i).inputValue().catch(() => '');
    if (val === '') { await panelInputs.nth(i).fill('Round2 review inspection item'); filled = true; break; }
}
note('filled an empty text input in the item editor panel', filled);
const applyBtn = linker.p.locator('button', { hasText: 'Apply' });
if (await applyBtn.count()) { await applyBtn.first().click(); await linker.p.waitForTimeout(500); }
const genBtn = modal(linker.p).locator('button', { hasText: 'Generate Checklist' });
const genDisabled = await genBtn.first().isDisabled().catch(() => 'n/a');
note('Generate Checklist button disabled-state after Apply', genDisabled);
if (genDisabled === false) {
    const beforeChecklistCount = sql(`SELECT COUNT(*) FROM checklist;`);
    await genBtn.first().click();
    await linker.p.waitForTimeout(1500);
    const afterChecklistCount = sql(`SELECT COUNT(*) FROM checklist;`);
    const newChecklistRow = sql(`SELECT recordsNo, status, itpId, itpVersion, itrId, template_id FROM checklist ORDER BY rowid DESC LIMIT 1;`);
    note('checklist count before/after real Generate Checklist click', `${beforeChecklistCount} -> ${afterChecklistCount}`);
    note('the row Generate Checklist actually created (recordsNo|status|itpId|itpVersion|itrId|template_id)', newChecklistRow);

    // Now try to link this exact row into a fresh ITR as a template, via the real API the ITR link button calls.
    const newRecordsNo = newChecklistRow.split('|')[0];
    const checklistId = sql(`SELECT id FROM checklist WHERE recordsNo='${newRecordsNo}';`);
    const itrPayload = { vendor: 'ITP Review Co', description: 'Round2 ITR for link test', rev: '', submit: '', status: 'In Progress' };
    const itrRes = await apiCall(linker.p, 'POST', '/api/itr/', itrPayload);
    note('created a fresh ITR to test linking against', `HTTP ${itrRes.status} id=${itrRes.body?.id}`);
    if (itrRes.status < 300 && itrRes.body?.id) {
        const linkRes = await apiCall(linker.p, 'POST', `/api/itr/${itrRes.body.id}/link-checklist`, null);
        // link-checklist takes checklist_id as a QUERY param per earlier finding — redo with query string
        const linkRes2 = await apiCall(linker.p, 'POST', `/api/itr/${itrRes.body.id}/link-checklist?checklist_id=${checklistId}`, null);
        note('POST link-checklist with the ITP-generated row as the template source', `HTTP ${linkRes2.status} body=${JSON.stringify(linkRes2.body).slice(0, 300)}`);
        const instanceRow = sql(`SELECT recordsNo, itrId, template_id, itpId, itpVersion FROM checklist WHERE itrId='${itrRes.body.id}';`);
        note('the resulting ITR-bound INSTANCE row, if link succeeded (recordsNo|itrId|template_id|itpId|itpVersion)', instanceRow);
    }
} else {
    note('Generate Checklist still disabled after filling one item via Apply — could not reach the real-click path this round either', '');
}

await browser.close();
console.log('\nDONE');
