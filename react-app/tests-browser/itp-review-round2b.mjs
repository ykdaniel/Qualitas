// Continuation of itp-review-round2.mjs (steps 7-8 only) — the first run crashed on a readonly field.
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
async function apiCall(page, method, path, body) {
    return await page.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let json = null; try { json = await res.json(); } catch (_) {}
        return { status: res.status, body: json };
    }, { method, path, body });
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();

const creator = await login('itp_creator');

console.log('=== 7. itp_creator (create-only): full populated-ITP completion + cancel-leaves-orphan check ===');
await creator.p.goto(UI + '/itp'); await creator.p.waitForTimeout(1500);
const addBtn = creator.p.locator('button', { hasText: /新增|Add/ });
const beforeCount = sql(`SELECT COUNT(*) FROM itp;`);
await addBtn.first().click();
await modal(creator.p).waitFor({ timeout: 10000 }).catch(() => {});
await creator.p.waitForTimeout(800);
const afterAddCount = sql(`SELECT COUNT(*) FROM itp;`);
const newRow = sql(`SELECT id, status, description FROM itp ORDER BY rowid DESC LIMIT 1;`);
note('ITP row count before/after clicking Add', `${beforeCount} -> ${afterAddCount}`);
note('the row created by the click', newRow);

const m3 = modal(creator.p);
const descField = m3.locator('textarea').first();
if (await descField.count()) { await descField.fill('round2 creator full-flow attempt'); }
const saveBtn3 = m3.locator('button', { hasText: /^(儲存|Save)$/ });
await saveBtn3.first().click().catch(() => {});
await creator.p.waitForTimeout(1200);
const afterSaveAttempt = sql(`SELECT id, status, description FROM itp ORDER BY rowid DESC LIMIT 1;`);
note('creator attempts to Save the ITP they just auto-created', afterSaveAttempt);
const toastsCreatorSave = (await creator.p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
note('toast after creator tries to save their own newly-created ITP', toastsCreatorSave);

const closeBtn3 = m3.locator('button[aria-label="Close"], button:has-text("×")').first();
if (await closeBtn3.count()) { await closeBtn3.click().catch(() => {}); }
await creator.p.waitForTimeout(500);
const confirmBtn = creator.p.locator('button', { hasText: /確認|Confirm|Yes|Discard|捨棄/i });
const discardPromptShown = await confirmBtn.count() > 0;
note('a discard-confirmation appeared when closing (even though nothing actually saved yet)', discardPromptShown);
if (discardPromptShown) { await confirmBtn.first().click().catch(() => {}); await creator.p.waitForTimeout(500); }
const afterCancelCount = sql(`SELECT COUNT(*) FROM itp;`);
const orphanRow = sql(`SELECT id, status, description FROM itp ORDER BY rowid DESC LIMIT 1;`);
note('ITP row count after cancelling out', `${afterAddCount} -> ${afterCancelCount}`);
note('the most recent row after cancel', orphanRow);

console.log('\n=== 8. Generate Checklist full real click, then link into an ITR as a template ===');
const linker = await login('itp_itr_linker');
await linker.p.goto(UI + '/itp'); await linker.p.waitForTimeout(1500);
const addBtnL = linker.p.locator('button', { hasText: /新增|Add/ });
await addBtnL.first().click();
await modal(linker.p).waitFor({ timeout: 10000 });
await linker.p.waitForTimeout(500);
const addItemBtn = modal(linker.p).locator('button', { hasText: 'Add New Item' });
await addItemBtn.first().click();
await linker.p.waitForTimeout(400);
// The item editor panel: target Activity(EN) input specifically by proximity to a label containing "Activity"
const panel = linker.p.locator('body');
const activityLabel = panel.locator('text=/Activity/i').first();
let filled = false;
if (await activityLabel.count()) {
    const nearInput = activityLabel.locator('xpath=following::input[1]');
    if (await nearInput.count()) { await nearInput.fill('Round2 review inspection item'); filled = true; }
}
if (!filled) {
    // fallback: any editable (non-readonly) text input currently empty
    const inputs = linker.p.locator('input[type=text]:not([readonly]), input:not([type]):not([readonly])');
    const cnt = await inputs.count();
    for (let i = 0; i < cnt; i++) {
        const val = await inputs.nth(i).inputValue().catch(() => 'x');
        const ro = await inputs.nth(i).getAttribute('readonly').catch(() => null);
        if (val === '' && ro === null) { await inputs.nth(i).fill('Round2 review inspection item'); filled = true; break; }
    }
}
note('filled the item editor Activity field', filled);
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
    note('the row Generate Checklist actually created', newChecklistRow);

    const newRecordsNo = newChecklistRow.split('|')[0];
    const checklistId = sql(`SELECT id FROM checklist WHERE recordsNo='${newRecordsNo}';`);
    const itrPayload = { vendor: 'ITP Review Co', description: 'Round2 ITR for link test', rev: '', submit: '', status: 'In Progress' };
    const itrRes = await apiCall(linker.p, 'POST', '/api/itr/', itrPayload);
    note('created a fresh ITR to test linking against', `HTTP ${itrRes.status} id=${itrRes.body?.id} status=${itrRes.body?.status}`);
    if (itrRes.status < 300 && itrRes.body?.id) {
        const linkRes = await apiCall(linker.p, 'POST', `/api/itr/${itrRes.body.id}/link-checklist?checklist_id=${checklistId}`, null);
        note('POST link-checklist with the ITP-generated row as the template source', `HTTP ${linkRes.status} body=${JSON.stringify(linkRes.body).slice(0, 300)}`);
        const instanceRow = sql(`SELECT recordsNo, itrId, template_id, itpId, itpVersion FROM checklist WHERE itrId='${itrRes.body.id}';`);
        note('the resulting ITR-bound INSTANCE row, if link succeeded', instanceRow);
    }
} else {
    note('Generate Checklist still disabled after Apply — could not reach the real-click path this round either', '');
}

await browser.close();
console.log('\nDONE');
