import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/itr-reinspect-fix-verify';
mkdirSync(output, { recursive: true });
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;
const log = (...a) => console.log(new Date().toISOString(), ...a);

function fieldByLabel(page, text, { exact = true } = {}) {
    return page.locator('label', exact ? { hasText: new RegExp(`^${text}$`) } : { hasText: text })
        .first().locator('xpath=ancestor::div[1]').locator('input, select, textarea').first();
}
async function setFieldByLabel(page, labelText, value, { isSelect = false } = {}) {
    return page.evaluate(({ labelText, value, isSelect }) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const lbl = labels.find(l => l.textContent?.trim().replace(/\s*\*$/, '') === labelText);
        if (!lbl) throw new Error(`label not found: ${labelText}`);
        const container = lbl.closest('div');
        const control = container?.querySelector('input, select, textarea');
        if (!control) throw new Error(`control not found for label: ${labelText}`);
        const proto = isSelect ? window.HTMLSelectElement.prototype : (control.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype);
        const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        setter.call(control, value);
        control.dispatchEvent(new Event(isSelect ? 'change' : 'input', { bubbles: true }));
        if (!isSelect) control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }, { labelText, value, isSelect });
}
async function openByIdAndVerify(page, itrId, expectedDocNo) {
    await page.goto(`${BASE}/itr?openId=${itrId}`);
    await page.waitForTimeout(700);
    const docNo = await page.evaluate(() => {
        const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Reference no.');
        return lbl?.closest('div')?.querySelector('input')?.value;
    });
    if (docNo !== expectedDocNo) throw new Error(`ID MISMATCH: expected ${expectedDocNo}, got ${docNo} — stopping.`);
    return docNo;
}
async function closeModal(page) {
    for (let i = 0; i < 5; i++) {
        const stillOpen = await page.locator('[class*="modalBody"]').count();
        if (stillOpen === 0) return;
        await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
        await page.waitForTimeout(400);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
    }
}
async function snapshotChecklistAndItrCounts(page) {
    return page.evaluate(async () => {
        const itr = await (await fetch('/api/itr/', { credentials: 'include' })).json();
        const chk = await (await fetch('/api/checklist/?include_instances=true', { credentials: 'include' })).json();
        return { itrCount: itr.length, checklistCount: chk.length };
    });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'chain_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

// ── Shared setup: ITP+item, Checklist template, NOI. ──
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
await page.click('text=+ Add ITP');
await page.waitForTimeout(300);
await fieldByLabel(page, 'Project').selectOption({ label: 'CHAINP1 — ITP Chain Walkthrough' });
await fieldByLabel(page, 'Subject').fill('Reinspect Fix Verify ITP');
await fieldByLabel(page, 'Contractor').selectOption({ label: 'Chain Walkthrough Contractor Co' });
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Add New Item' }).click();
await page.waitForTimeout(300);
await page.locator('.fixed input[placeholder="EN"]').first().fill('Fix verify check item');
await page.getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('ITP SAVED');

await page.locator('table tbody tr').first().click();
await page.waitForTimeout(400);
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Generate Checklist' }).click();
await page.waitForTimeout(1000);
log('CHECKLIST TEMPLATE GENERATED');

await page.locator('aside').getByText('NOI', { exact: true }).click();
await page.waitForTimeout(400);
await page.click('text=Add New NOI');
await page.waitForTimeout(400);
await setFieldByLabel(page, 'Contractor', 'Chain Walkthrough Contractor Co', { isSelect: true });
await page.waitForTimeout(400);
await setFieldByLabel(page, 'Subject', 'Reinspect Fix Verify NOI');
await setFieldByLabel(page, 'ITP no.', 'QTS-CWC-ITP-000001', { isSelect: true });
await setFieldByLabel(page, 'Issue Date', '2026-09-29');
await setFieldByLabel(page, 'Inspection Date', '2026-09-30');
await setFieldByLabel(page, 'Inspection Time (24h)', '09:00');
await setFieldByLabel(page, 'Event #', 'EVT-001');
const checkpointVal = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Checkpoint');
    return lbl.closest('div').querySelector('select').options[1].value;
});
await setFieldByLabel(page, 'Checkpoint', checkpointVal, { isSelect: true });
await setFieldByLabel(page, 'Contact Person', 'Site QA Lead');
await setFieldByLabel(page, 'Phone', '0900000000');
await setFieldByLabel(page, 'Email', 'qa@fixverify.test');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('NOI SAVED');

async function buildCase(caseLabel, targetStatus, targetInspectionResult) {
    log(`--- BUILDING CASE ${caseLabel}: status=${targetStatus}, inspectionResult=${targetInspectionResult} ---`);
    await page.locator('aside').getByText('ITR', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.click('text=Add New ITR');
    await page.waitForTimeout(400);
    await setFieldByLabel(page, 'NOI no. (Source)', 'QTS-CWC-NOI-000001', { isSelect: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(800);

    const created = await page.evaluate(async () => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        rows.sort((a, b) => a.documentNumber.localeCompare(b.documentNumber, undefined, { numeric: true }));
        const last = rows[rows.length - 1];
        return { id: last.id, docNo: last.documentNumber };
    });
    log(`${caseLabel}: created ITR = ${created.docNo} (${created.id})`);
    await openByIdAndVerify(page, created.id, created.docNo);

    const linkOpts = await page.evaluate(() => {
        const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
        const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
        return sel ? Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent })) : null;
    });
    const templateOpt = linkOpts.find(o => o.value && o.value !== 'new');
    await page.evaluate((val) => {
        const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
        const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
        const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, val);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }, templateOpt.value);
    await page.waitForTimeout(800);

    await page.locator('.cursor-pointer.group').first().click();
    await page.waitForTimeout(500);
    await page.click('text=Items').catch(() => {});
    await page.waitForTimeout(300);
    await page.locator('[data-result-option="pass"]').first().click();
    await page.waitForTimeout(300);
    await page.locator('text=Edit Checklist Snapshot').locator('xpath=ancestor::div[3]').getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(800);
    log(`${caseLabel}: checklist instance saved as Pass`);

    await setFieldByLabel(page, 'Inspection Result', targetInspectionResult, { isSelect: true });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(800);
    log(`${caseLabel}: inspectionResult saved as ${targetInspectionResult}`);

    if (targetStatus === 'Approved') {
        await openByIdAndVerify(page, created.id, created.docNo);
        await page.getByRole('button', { name: 'Publish', exact: true }).click();
        await page.waitForTimeout(500);
        const confirmBtn = page.getByRole('button', { name: /^(Publish|Confirm)$/ }).last();
        if (await confirmBtn.count()) await confirmBtn.click();
        await page.waitForTimeout(1000);
        log(`${caseLabel}: published to Approved`);
    } else if (targetStatus === 'Void') {
        await openByIdAndVerify(page, created.id, created.docNo);
        await setFieldByLabel(page, 'Status', 'Void', { isSelect: true });
        await page.waitForTimeout(300);
        await page.getByRole('button', { name: 'Save' }).click();
        await page.waitForTimeout(800);
        log(`${caseLabel}: status set to Void`);
    }
    return created;
}

const results = [];

// ── Case A: In Progress + Fail — must remain fully allowed (regression). ──
{
    const created = await buildCase('A_InProgress_Fail', 'In Progress', 'Fail');
    const before = await snapshotChecklistAndItrCounts(page);
    await openByIdAndVerify(page, created.id, created.docNo);
    const btn = page.getByRole('button', { name: 'Re-inspect' });
    const enabled = await btn.isEnabled().catch(() => false);
    const visible = await btn.count() > 0;
    log('A: button visible=', visible, 'enabled=', enabled);
    await page.screenshot({ path: `${output}/A-in-progress-fail.png`, fullPage: true });
    await btn.click();
    await page.waitForTimeout(1000);
    const toastText = await page.locator('[data-sonner-toast]').first().textContent().catch(() => null);
    log('A: toast after click:', toastText);
    const after = await snapshotChecklistAndItrCounts(page);
    results.push({ case: 'A_InProgress_Fail', buttonVisible: visible, buttonEnabled: enabled, itrCountDelta: after.itrCount - before.itrCount, checklistCountDelta: after.checklistCount - before.checklistCount });
    await closeModal(page);
}

// ── Case B: Approved + Fail — must now be BLOCKED (button disabled + hint; API 400; no new rows; source unchanged). ──
{
    const created = await buildCase('B_Approved_Fail', 'Approved', 'Fail');
    const beforeSource = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    const before = await snapshotChecklistAndItrCounts(page);

    await openByIdAndVerify(page, created.id, created.docNo);
    const btn = page.getByRole('button', { name: 'Re-inspect' });
    const visible = await btn.count() > 0;
    const enabled = visible ? await btn.isEnabled() : null;
    const hintText = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Re-inspect');
        if (!btns.length) return null;
        const container = btns[0].closest('div');
        const hint = container?.querySelector('span');
        return hint?.textContent || btns[0].getAttribute('title');
    });
    log('B: button visible=', visible, 'enabled=', enabled, 'hint=', hintText);
    await page.screenshot({ path: `${output}/B-approved-fail.png`, fullPage: true });

    // Direct API call too (bypass the disabled button, confirm backend itself refuses).
    const apiResult = await page.evaluate(async (id) => {
        const csrf = document.cookie.split('; ').find(x => x.startsWith('csrf_token='))?.split('=').slice(1).join('=');
        const res = await fetch(`/api/itr/${id}/re-inspect`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': decodeURIComponent(csrf || '') } });
        return { status: res.status, body: await res.json().catch(() => null) };
    }, created.id);
    log('B: direct API result:', JSON.stringify(apiResult));

    const afterSource = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    const after = await snapshotChecklistAndItrCounts(page);
    const sourceUnchanged = beforeSource.status === afterSource.status && beforeSource.inspectionResult === afterSource.inspectionResult && beforeSource.type === afterSource.type;
    results.push({
        case: 'B_Approved_Fail', buttonVisible: visible, buttonEnabled: enabled, hintText,
        apiStatus: apiResult.status, apiDetail: apiResult.body?.detail,
        itrCountDelta: after.itrCount - before.itrCount, checklistCountDelta: after.checklistCount - before.checklistCount,
        sourceUnchanged,
    });
    await closeModal(page);

    // ── Now revoke approval and confirm re-inspect becomes allowed again. ──
    await openByIdAndVerify(page, created.id, created.docNo);
    await page.getByRole('button', { name: 'Revoke Approval' }).click();
    await page.waitForTimeout(400);
    const reasonInput = page.locator('textarea, input[type=text]').last();
    await reasonInput.fill('Boundary fix verification: reassess').catch(() => {});
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: /Confirm|Revoke/i }).last().click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${output}/B-after-revoke.png`, fullPage: true });

    await openByIdAndVerify(page, created.id, created.docNo);
    const btnAfterRevoke = page.getByRole('button', { name: 'Re-inspect' });
    const visibleAfterRevoke = await btnAfterRevoke.count() > 0;
    const enabledAfterRevoke = visibleAfterRevoke ? await btnAfterRevoke.isEnabled() : null;
    log('B (after revoke): button visible=', visibleAfterRevoke, 'enabled=', enabledAfterRevoke);
    const beforeReinspectCounts = await snapshotChecklistAndItrCounts(page);
    if (enabledAfterRevoke) {
        await btnAfterRevoke.click();
        await page.waitForTimeout(1000);
    }
    const afterReinspectCounts = await snapshotChecklistAndItrCounts(page);
    const afterRevokeState = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    log('B (after revoke) source state:', JSON.stringify({ status: afterRevokeState.status, inspectionResult: afterRevokeState.inspectionResult }));
    results.push({
        case: 'B_Approved_Fail_AFTER_REVOKE', buttonVisible: visibleAfterRevoke, buttonEnabled: enabledAfterRevoke,
        reinspectSucceeded: enabledAfterRevoke, itrCountDelta: afterReinspectCounts.itrCount - beforeReinspectCounts.itrCount,
    });
    await closeModal(page);
}

// ── Case C: Void + Fail — must be BLOCKED (button disabled + hint; API 400; no new rows; source unchanged). ──
{
    const created = await buildCase('C_Void_Fail', 'Void', 'Fail');
    const beforeSource = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    const before = await snapshotChecklistAndItrCounts(page);

    await openByIdAndVerify(page, created.id, created.docNo);
    const btn = page.getByRole('button', { name: 'Re-inspect' });
    const visible = await btn.count() > 0;
    const enabled = visible ? await btn.isEnabled() : null;
    const hintText = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Re-inspect');
        if (!btns.length) return null;
        const container = btns[0].closest('div');
        const hint = container?.querySelector('span');
        return hint?.textContent || btns[0].getAttribute('title');
    });
    log('C: button visible=', visible, 'enabled=', enabled, 'hint=', hintText);
    await page.screenshot({ path: `${output}/C-void-fail.png`, fullPage: true });

    const apiResult = await page.evaluate(async (id) => {
        const csrf = document.cookie.split('; ').find(x => x.startsWith('csrf_token='))?.split('=').slice(1).join('=');
        const res = await fetch(`/api/itr/${id}/re-inspect`, { method: 'POST', credentials: 'include', headers: { 'X-CSRF-Token': decodeURIComponent(csrf || '') } });
        return { status: res.status, body: await res.json().catch(() => null) };
    }, created.id);
    log('C: direct API result:', JSON.stringify(apiResult));

    const afterSource = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    const after = await snapshotChecklistAndItrCounts(page);
    const sourceUnchanged = beforeSource.status === afterSource.status && beforeSource.inspectionResult === afterSource.inspectionResult;
    results.push({
        case: 'C_Void_Fail', buttonVisible: visible, buttonEnabled: enabled, hintText,
        apiStatus: apiResult.status, apiDetail: apiResult.body?.detail,
        itrCountDelta: after.itrCount - before.itrCount, checklistCountDelta: after.checklistCount - before.checklistCount,
        sourceUnchanged,
    });
}

log('===== SUMMARY =====');
log(JSON.stringify(results, null, 1));

await browser.close();
log('DONE');
