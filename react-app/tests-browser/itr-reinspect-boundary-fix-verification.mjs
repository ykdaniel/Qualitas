import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/itr-reinspect-boundary-fix';
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
    if (docNo !== expectedDocNo) {
        throw new Error(`ID MISMATCH: expected ${expectedDocNo}, got ${docNo} — stopping, not writing.`);
    }
    return docNo;
}
async function closeModal(page) {
    await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
    await page.waitForTimeout(300);
}
async function countRows(page, url) {
    return page.evaluate(async (u) => {
        const res = await fetch(u, { credentials: 'include' });
        const rows = await res.json();
        return rows.length;
    }, url);
}

const results = [];
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

// ── Shared setup ──
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
await page.locator('.fixed input[placeholder="EN"]').first().fill('Boundary check item');
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
await setFieldByLabel(page, 'Email', 'qa@boundary.test');
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

async function checkCase(caseLabel, created, expectRejected) {
    const itrCountBefore = await countRows(page, '/api/itr/');
    const chkCountBefore = await countRows(page, '/api/checklist/?include_instances=true');

    const before = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);

    // Button check
    await openByIdAndVerify(page, created.id, created.docNo);
    const buttonInfo = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Re-inspect');
        if (btns.length === 0) return { present: false };
        const btn = btns[0];
        return { present: true, disabled: btn.disabled, title: btn.title };
    });
    // Also grab the friendly caption text if present.
    const captionText = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Re-inspect');
        if (btns.length === 0) return null;
        const wrapper = btns[0].closest('div');
        const span = wrapper?.querySelector('span');
        return span?.textContent || null;
    });
    log(`${caseLabel}: BUTTON =`, JSON.stringify(buttonInfo), 'CAPTION =', captionText);
    await page.screenshot({ path: `${output}/${caseLabel}.png`, fullPage: true });
    await closeModal(page);

    // Direct API call
    const apiResult = await page.evaluate(async (id) => {
        const csrf = document.cookie.split('; ').find(x => x.startsWith('csrf_token='))?.split('=').slice(1).join('=');
        const res = await fetch(`/api/itr/${id}/re-inspect`, {
            method: 'POST', credentials: 'include',
            headers: { 'X-CSRF-Token': decodeURIComponent(csrf || '') },
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, created.id);
    log(`${caseLabel}: DIRECT API -> HTTP ${apiResult.status}`, JSON.stringify(apiResult.body));

    const itrCountAfter = await countRows(page, '/api/itr/');
    const chkCountAfter = await countRows(page, '/api/checklist/?include_instances=true');

    const after = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    const sourceUnchanged = before.status === after.status && before.inspectionResult === after.inspectionResult && before.type === after.type;

    const noNewRecords = (itrCountAfter === itrCountBefore) && (chkCountAfter === chkCountBefore);
    log(`${caseLabel}: itrCount ${itrCountBefore}->${itrCountAfter}, chkCount ${chkCountBefore}->${chkCountAfter}, sourceUnchanged=${sourceUnchanged}`);

    results.push({
        case: caseLabel,
        sourceStatus: before.status,
        sourceInspectionResult: before.inspectionResult,
        buttonPresent: buttonInfo.present,
        buttonDisabled: buttonInfo.disabled,
        apiStatus: apiResult.status,
        apiError: apiResult.status !== 200 ? apiResult.body?.detail : null,
        sourceUnchangedAfter: sourceUnchanged,
        noNewRecordsOnReject: expectRejected ? noNewRecords : null,
        newItrId: apiResult.status === 200 ? apiResult.body?.id : null,
        newItrDocNo: apiResult.status === 200 ? apiResult.body?.documentNumber : null,
    });
    return { itrCountBefore, chkCountBefore };
}

const cases = [
    ['A_InProgress_Fail_allow', 'In Progress', 'Fail', false],
    ['C_Approved_Fail_reject', 'Approved', 'Fail', true],
    ['E_Void_Fail_reject', 'Void', 'Fail', true],
];

let approvedCase = null;
for (const [label, status, ir, expectRejected] of cases) {
    const created = await buildCase(label, status, ir);
    await checkCase(label, created, expectRejected);
    if (label.startsWith('C_')) approvedCase = created;
}

// ── Legitimate revoke-then-reinspect still works ──
log('--- G: Revoke Approval on the Approved case, then confirm re-inspect works again ---');
await openByIdAndVerify(page, approvedCase.id, approvedCase.docNo);
const revokeBtn = page.getByRole('button', { name: 'Revoke Approval' });
await revokeBtn.click();
await page.waitForTimeout(500);
// Fill reason field in the revoke dialog if present.
const reasonInput = page.locator('textarea, input[type=text]').last();
await reasonInput.fill('Reinspect boundary fix verification — legitimate revoke').catch(() => {});
await page.waitForTimeout(200);
const confirmRevoke = page.getByRole('button', { name: /Revoke|Confirm/i }).last();
await confirmRevoke.click();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${output}/G_after_revoke.png`, fullPage: true });

const afterRevoke = await page.evaluate(async (id) => {
    const res = await fetch('/api/itr/', { credentials: 'include' });
    const rows = await res.json();
    return rows.find(r => r.id === id);
}, approvedCase.id);
log('AFTER REVOKE: status=', afterRevoke.status, 'inspectionResult=', afterRevoke.inspectionResult);

await openByIdAndVerify(page, approvedCase.id, approvedCase.docNo);
const buttonAfterRevoke = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button')).filter(b => b.textContent?.trim() === 'Re-inspect');
    if (btns.length === 0) return { present: false };
    return { present: true, disabled: btns[0].disabled };
});
log('BUTTON AFTER REVOKE:', JSON.stringify(buttonAfterRevoke));
await closeModal(page);

const apiAfterRevoke = await page.evaluate(async (id) => {
    const csrf = document.cookie.split('; ').find(x => x.startsWith('csrf_token='))?.split('=').slice(1).join('=');
    const res = await fetch(`/api/itr/${id}/re-inspect`, {
        method: 'POST', credentials: 'include',
        headers: { 'X-CSRF-Token': decodeURIComponent(csrf || '') },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
}, approvedCase.id);
log('API AFTER REVOKE:', apiAfterRevoke.status, JSON.stringify(apiAfterRevoke.body));

results.push({
    case: 'G_after_revoke_reinspect_allowed',
    sourceStatusAfterRevoke: afterRevoke.status,
    buttonPresent: buttonAfterRevoke.present,
    buttonDisabled: buttonAfterRevoke.disabled,
    apiStatus: apiAfterRevoke.status,
    newItrId: apiAfterRevoke.status === 200 ? apiAfterRevoke.body?.id : null,
    newItrDocNo: apiAfterRevoke.status === 200 ? apiAfterRevoke.body?.documentNumber : null,
});

log('===== SUMMARY =====');
log(JSON.stringify(results, null, 1));

await browser.close();
log('DONE');
