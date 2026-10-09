import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/itr-reinspect-boundary';
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

// ── Shared setup: one ITP+item, one Checklist template, one NOI (reused across all 6 cases). ──
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
await page.click('text=+ Add ITP');
await page.waitForTimeout(300);
await fieldByLabel(page, 'Project').selectOption({ label: 'CHAINP1 — ITP Chain Walkthrough' });
await fieldByLabel(page, 'Subject').fill('Reinspect Boundary ITP');
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
await setFieldByLabel(page, 'Subject', 'Reinspect Boundary NOI');
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

// ── Build one case: create a fresh ITR, link+fill checklist, drive it to (status, inspectionResult). ──
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

    // Capture the id+docNo of the JUST-created record via API (not list position).
    const created = await page.evaluate(async () => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        // The newest one has the highest numeric suffix.
        rows.sort((a, b) => a.documentNumber.localeCompare(b.documentNumber, undefined, { numeric: true }));
        const last = rows[rows.length - 1];
        return { id: last.id, docNo: last.documentNumber };
    });
    log(`${caseLabel}: created ITR = ${created.docNo} (${created.id})`);

    await openByIdAndVerify(page, created.id, created.docNo);

    // Link checklist template, mark Pass, save (needed so Approved status is reachable when required).
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

    // Set Inspection Result, save (status still In Progress at this point).
    await setFieldByLabel(page, 'Inspection Result', targetInspectionResult, { isSelect: true });
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(800);
    log(`${caseLabel}: inspectionResult saved as ${targetInspectionResult}`);

    // Drive status to target.
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
    // else: In Progress — nothing more to do.

    return created;
}

async function checkBoundary(caseLabel, created, expectedStatus, expectedInspectionResult) {
    // 1. Snapshot source BEFORE the API attempt.
    const before = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);

    // 2. Button visibility (reopen, verify id, read DOM).
    await openByIdAndVerify(page, created.id, created.docNo);
    const statusText = await page.evaluate(() => {
        const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Status');
        const sel = lbl?.closest('div')?.querySelector('select');
        return sel?.value;
    });
    const buttonVisible = await page.getByRole('button', { name: 'Re-inspect' }).count() > 0;
    log(`${caseLabel}: persisted status=${before.status}, inspectionResult=${before.inspectionResult}, displayed status select=${statusText}, Re-inspect BUTTON VISIBLE=${buttonVisible}`);
    await page.screenshot({ path: `${output}/${caseLabel}.png`, fullPage: true });
    await closeModal(page);

    // 3. Direct API call (bypasses the button entirely) — the true backend law.
    const apiResult = await page.evaluate(async (id) => {
        const csrf = document.cookie.split('; ').find(x => x.startsWith('csrf_token='))?.split('=').slice(1).join('=');
        const res = await fetch(`/api/itr/${id}/re-inspect`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'X-CSRF-Token': decodeURIComponent(csrf || '') },
        });
        const body = await res.json().catch(() => null);
        return { status: res.status, body };
    }, created.id);
    log(`${caseLabel}: DIRECT API POST /itr/{id}/re-inspect -> HTTP ${apiResult.status}`, JSON.stringify(apiResult.body));

    // 4. Snapshot source AFTER.
    const after = await page.evaluate(async (id) => {
        const res = await fetch('/api/itr/', { credentials: 'include' });
        const rows = await res.json();
        return rows.find(r => r.id === id);
    }, created.id);
    const sourceUnchanged = before.status === after.status && before.inspectionResult === after.inspectionResult && before.type === after.type;
    log(`${caseLabel}: SOURCE UNCHANGED after attempt = ${sourceUnchanged}`, JSON.stringify({ before: { status: before.status, inspectionResult: before.inspectionResult, type: before.type }, after: { status: after.status, inspectionResult: after.inspectionResult, type: after.type } }));

    let newItrInfo = null;
    if (apiResult.status === 200 && apiResult.body?.id) {
        const newId = apiResult.body.id;
        const chkRows = await page.evaluate(async (id) => {
            const res = await fetch('/api/checklist/?include_instances=true', { credentials: 'include' });
            const rows = await res.json();
            return rows.filter(c => c.itrId === id).map(c => ({ recordsNo: c.recordsNo, status: c.status, source_template_version: c.source_template_version }));
        }, newId);
        newItrInfo = { id: newId, docNo: apiResult.body.documentNumber, status: apiResult.body.status, inspectionResult: apiResult.body.inspectionResult, checklistInstances: chkRows };
        log(`${caseLabel}: NEW RE-INSPECTION ITR:`, JSON.stringify(newItrInfo));
    }

    results.push({
        case: caseLabel,
        sourceStatus: before.status,
        sourceInspectionResult: before.inspectionResult,
        buttonVisible,
        apiStatus: apiResult.status,
        apiError: apiResult.status !== 200 ? apiResult.body?.detail : null,
        sourceUnchangedAfter: sourceUnchanged,
        newItr: newItrInfo,
    });
}

const cases = [
    ['A_InProgress_Fail', 'In Progress', 'Fail'],
    ['B_InProgress_Pass', 'In Progress', 'Pass'],
    ['C_Approved_Fail', 'Approved', 'Fail'],
    ['D_Approved_Pass', 'Approved', 'Pass'],
    ['E_Void_Fail', 'Void', 'Fail'],
    ['F_Void_Pass', 'Void', 'Pass'],
];

for (const [label, status, ir] of cases) {
    const created = await buildCase(label, status, ir);
    await checkBoundary(label, created, status, ir);
}

log('===== SUMMARY =====');
log(JSON.stringify(results, null, 1));

await browser.close();
log('DONE');
