import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/itr-publish-investigation';
mkdirSync(output, { recursive: true });
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;

const log = (...args) => console.log(new Date().toISOString(), ...args);

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

const apiCalls = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

page.on('request', r => {
    if (r.url().includes('/api/itr')) apiCalls.push({ method: r.method(), url: r.url(), postData: r.postData() });
});
page.on('response', async r => {
    if (r.url().includes('/api/itr') && ['POST', 'PUT'].includes(r.request().method())) {
        let body = null;
        try { body = await r.json(); } catch {}
        log('RESPONSE', r.request().method(), r.status(), r.url(), body ? JSON.stringify({ id: body.id, status: body.status, inspectionResult: body.inspectionResult, type: body.type }) : '(no json)');
    }
});

await page.goto(`${BASE}/login`);
await page.fill('#email', 'chain_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

// Build ITP + item + checklist template.
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
await page.click('text=+ Add ITP');
await page.waitForTimeout(300);
await fieldByLabel(page, 'Project').selectOption({ label: 'CHAINP1 — ITP Chain Walkthrough' });
await fieldByLabel(page, 'Subject').fill('Publish Investigation ITP');
await fieldByLabel(page, 'Contractor').selectOption({ label: 'Chain Walkthrough Contractor Co' });
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Add New Item' }).click();
await page.waitForTimeout(300);
await page.locator('.fixed input[placeholder="EN"]').first().fill('Publish investigation check item');
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
log('CHECKLIST GENERATED');

// NOI
await page.locator('aside').getByText('NOI', { exact: true }).click();
await page.waitForTimeout(400);
await page.click('text=Add New NOI');
await page.waitForTimeout(400);
await setFieldByLabel(page, 'Contractor', 'Chain Walkthrough Contractor Co', { isSelect: true });
await page.waitForTimeout(400);
await setFieldByLabel(page, 'Subject', 'Publish Investigation NOI');
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
await setFieldByLabel(page, 'Email', 'qa@investigation.test');
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('NOI SAVED');

async function createLinkFillItrToPass(label) {
    await page.locator('aside').getByText('ITR', { exact: true }).click();
    await page.waitForTimeout(400);
    await page.click('text=Add New ITR');
    await page.waitForTimeout(400);
    await setFieldByLabel(page, 'NOI no. (Source)', 'QTS-CWC-NOI-000001', { isSelect: true });
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(800);
    log(`${label}: ITR CREATED, url=`, page.url());

    await page.locator('table tbody tr').last().click();
    await page.waitForTimeout(500);
    const docNo = await page.evaluate(() => {
        const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Reference no.');
        return lbl?.closest('div')?.querySelector('input')?.value;
    });
    log(`${label}: doc no =`, docNo);

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
    log(`${label}: CHECKLIST SAVED AS PASS`);
    return docNo;
}

// ── Case A: reproduce the reported bug — select Inspection Result, DO NOT click Save, click Publish directly. ──
const docA = await createLinkFillItrToPass('CASE-A');
apiCalls.length = 0;
log('=== CASE A: select Inspection Result=Pass, click Publish WITHOUT a prior Save ===');
await setFieldByLabel(page, 'Inspection Result', 'Pass', { isSelect: true });
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/caseA-before-publish.png`, fullPage: true });
await page.getByRole('button', { name: 'Publish', exact: true }).click();
await page.waitForTimeout(500);
const confirmA = page.getByRole('button', { name: /^(Publish|Confirm)$/ }).last();
if (await confirmA.count()) await confirmA.click();
await page.waitForTimeout(1000);
log('CASE A API CALLS:', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url, postData: c.postData })), null, 1));
await page.screenshot({ path: `${output}/caseA-after-publish.png`, fullPage: true });

// Reopen and check displayed value + raw DB value.
await page.locator('table tbody tr').filter({ hasText: docA }).click();
await page.waitForTimeout(500);
const caseA_displayed = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Inspection Result');
    const sel = lbl?.closest('div')?.querySelector('select');
    return { value: sel?.value, selectedText: sel?.options[sel.selectedIndex]?.text };
});
log('CASE A REOPENED — DISPLAYED Inspection Result:', JSON.stringify(caseA_displayed));
await page.screenshot({ path: `${output}/caseA-reopened.png`, fullPage: true });
const caseA_db = await page.evaluate(async (docNo) => {
    const res = await fetch('/api/itr/', { credentials: 'include' });
    const rows = await res.json();
    const row = rows.find(r => r.documentNumber === docNo);
    return row ? { id: row.id, status: row.status, inspectionResult: row.inspectionResult, type: row.type } : null;
}, docA);
log('CASE A RAW DB VALUE:', JSON.stringify(caseA_db));

// Close the reopened Case A modal before navigating away.
await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
await page.waitForTimeout(400);

// ── Case B (control): select Fail, click Save FIRST, then Publish is not applicable (Fail can't
// approve) — instead just verify Save-then-reopen preserves the value, matching the user's own
// control case (ITR-000002 selected Fail + Save, reopened correctly as Fail). ──
const docB = await createLinkFillItrToPass('CASE-B');
apiCalls.length = 0;
log('=== CASE B: select Inspection Result=Fail, click Save (control case) ===');
await setFieldByLabel(page, 'Inspection Result', 'Fail', { isSelect: true });
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('CASE B API CALLS (Save):', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url, postData: c.postData })), null, 1));

await page.locator('table tbody tr').filter({ hasText: docB }).click();
await page.waitForTimeout(500);
const caseB_displayed = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Inspection Result');
    const sel = lbl?.closest('div')?.querySelector('select');
    return { value: sel?.value, selectedText: sel?.options[sel.selectedIndex]?.text };
});
log('CASE B REOPENED — DISPLAYED Inspection Result:', JSON.stringify(caseB_displayed));

await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
await page.waitForTimeout(400);

// ── Case C: re-Publish an ALREADY-Approved ITR (revision bump) — must still only send
// type/status, exactly as before this fix, and must NOT be rejected by the backend's
// "locked (Approved) ITR" guard. Reuse Case A's now-Approved ITR. ──
log('=== CASE C: re-Publish an ALREADY-Approved ITR (revision bump) ===');
await page.locator('table tbody tr').filter({ hasText: docA }).click();
await page.waitForTimeout(500);
apiCalls.length = 0;
await page.getByRole('button', { name: 'Publish', exact: true }).click();
await page.waitForTimeout(500);
const confirmC = page.getByRole('button', { name: /^(Publish|Confirm)$/ }).last();
if (await confirmC.count()) await confirmC.click();
await page.waitForTimeout(1000);
log('CASE C API CALLS (re-Publish on already-Approved):', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url, postData: c.postData })), null, 1));
await page.screenshot({ path: `${output}/caseC-after-republish.png`, fullPage: true });

await page.locator('table tbody tr').filter({ hasText: docA }).click();
await page.waitForTimeout(500);
const caseC_state = await page.evaluate(() => {
    const findSel = (label) => {
        const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === label);
        return lbl?.closest('div')?.querySelector('select')?.value;
    };
    const findInput = (label) => {
        const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === label);
        return lbl?.closest('div')?.querySelector('input,select')?.value;
    };
    return { status: findSel('Status'), inspectionResult: findSel('Inspection Result'), version: findInput('Version') };
});
log('CASE C REOPENED STATE (status/inspectionResult must both still be intact, version bumped):', JSON.stringify(caseC_state));

await browser.close();
log('DONE');
