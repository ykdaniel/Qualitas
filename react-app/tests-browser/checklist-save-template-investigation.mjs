import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/checklist-save-investigation';
mkdirSync(output, { recursive: true });
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;

const log = (...args) => console.log(new Date().toISOString(), ...args);
const apiCalls = [];

async function dumpChecklistTable(page, label) {
    const rows = await page.evaluate(async () => {
        const res = await fetch('/api/checklist/?include_instances=true', { credentials: 'include' });
        return res.json();
    });
    log(`DB STATE [${label}]:`, JSON.stringify(rows.map(r => ({
        id: r.id, recordsNo: r.recordsNo, version: r.version,
        template_id: r.template_id, itrId: r.itrId, itrNumber: r.itrNumber,
        itpId: r.itpId, status: r.status, activity: r.activity,
    })), null, 1));
    return rows;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

page.on('request', r => {
    if (r.url().includes('/api/checklist')) {
        apiCalls.push({ method: r.method(), url: r.url(), postData: r.postData() });
    }
});
page.on('response', async r => {
    if (r.url().includes('/api/checklist') && ['POST', 'PUT'].includes(r.request().method())) {
        let body = null;
        try { body = await r.json(); } catch {}
        log('RESPONSE', r.request().method(), r.status(), r.url(), body ? JSON.stringify({ id: body.id, recordsNo: body.recordsNo, version: body.version }) : '(no json)');
    }
});

await page.goto(`${BASE}/login`);
await page.fill('#email', 'chain_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

// Create a minimal ITP with one item.
await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
await page.click('text=+ Add ITP');
await page.waitForTimeout(300);

function fieldByLabel(page, text, { exact = true } = {}) {
    return page.locator('label', exact ? { hasText: new RegExp(`^${text}$`) } : { hasText: text })
        .first().locator('xpath=ancestor::div[1]').locator('input, select, textarea').first();
}

await fieldByLabel(page, 'Project').selectOption({ label: 'CHAINP1 — ITP Chain Walkthrough' });
await fieldByLabel(page, 'Subject').fill('Investigation ITP');
await fieldByLabel(page, 'Contractor').selectOption({ label: 'Chain Walkthrough Contractor Co' });
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Add New Item' }).click();
await page.waitForTimeout(300);
await page.locator('.fixed input[placeholder="EN"]').first().fill('Investigation check item');
await page.getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('ITP SAVED, URL:', page.url());

await dumpChecklistTable(page, 'before generate checklist');

// Reopen ITP, Generate Checklist.
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(400);
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
apiCalls.length = 0;
log('=== CLICKING Generate Checklist ===');
await page.getByRole('button', { name: 'Generate Checklist' }).click();
await page.waitForTimeout(1000);
log('URL AFTER GENERATE:', page.url());
log('API CALLS DURING GENERATE:', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url })), null, 1));

const afterGenerate = await dumpChecklistTable(page, 'after generate checklist (before any Save Template click)');

await page.screenshot({ path: `${output}/01-after-generate.png`, fullPage: true });

// Now click Save Template ONCE, with nothing changed, to isolate: does merely clicking Save
// (no edits) also duplicate?
apiCalls.length = 0;
log('=== CLICKING Save Template (no edits) ===');
await page.getByRole('button', { name: 'Save Template' }).click();
await page.waitForTimeout(1000);
log('API CALLS DURING FIRST Save Template (no edits):', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url, postData: c.postData })), null, 1));
await page.screenshot({ path: `${output}/02-after-first-save-no-edits.png`, fullPage: true });

const afterFirstSave = await dumpChecklistTable(page, 'after FIRST Save Template click (no edits made)');

// "Save Template" navigates back to the list view on success — reopen the record before editing.
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/02b-view-after-first-save.png`, fullPage: true });
const rowCountAfterFirstSave = await page.locator('table tbody tr').count();
log('ROW COUNT IN LIBRARY LIST after first (no-edit) save:', rowCountAfterFirstSave);
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(400);

// Now actually EDIT the criteria (matching the original reproduction) and click Save Template again.
apiCalls.length = 0;
log('=== EDITING criteria, then CLICKING Save Template ===');
await page.locator('input[placeholder="Enter criteria..."]').first().fill('Investigation criteria text');
await page.getByRole('button', { name: 'Save Template' }).click();
await page.waitForTimeout(1000);
log('API CALLS DURING SECOND Save Template (WITH edit):', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url, postData: c.postData })), null, 1));
await page.screenshot({ path: `${output}/03-after-second-save-with-edit.png`, fullPage: true });

const afterEditSave = await dumpChecklistTable(page, 'after SECOND Save Template click (WITH criteria edit)');

// Reopen the template once more (simulates leaving and coming back) and save a third time with
// another edit — confirm it keeps updating the SAME row, not creating a third one.
await page.waitForTimeout(300);
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(400);
apiCalls.length = 0;
await page.locator('input[placeholder="Enter criteria..."]').first().fill('Investigation criteria text v3');
await page.getByRole('button', { name: 'Save Template' }).click();
await page.waitForTimeout(800);
log('API CALLS DURING THIRD Save Template:', JSON.stringify(apiCalls.map(c => ({ method: c.method, url: c.url })), null, 1));
const afterThirdSave = await dumpChecklistTable(page, 'after THIRD Save Template click');

// ── Link this template into an ITR instance, then edit+save the TEMPLATE again — confirm the
// existing ITR-owned instance is completely unaffected (no new row, no content change, its
// captured source_template_version stays as it was at link time). ──
log('=== Creating NOI + ITR, linking the template, then editing the template again ===');
await page.locator('aside').getByText('NOI', { exact: true }).click();
await page.waitForTimeout(400);
await page.click('text=Add New NOI');
await page.waitForTimeout(400);

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

await setFieldByLabel(page, 'Contractor', 'Chain Walkthrough Contractor Co', { isSelect: true });
await page.waitForTimeout(400);
await setFieldByLabel(page, 'Subject', 'Investigation NOI');
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
log('NOI SAVED, URL:', page.url());

await page.locator('aside').getByText('ITR', { exact: true }).click();
await page.waitForTimeout(400);
await page.click('text=Add New ITR');
await page.waitForTimeout(400);
await setFieldByLabel(page, 'NOI no. (Source)', 'QTS-CWC-NOI-000001', { isSelect: true });
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('ITR SAVED, URL:', page.url());

await page.locator('table tbody tr').first().click();
await page.waitForTimeout(500);
const linkOpts = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
    const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    return sel ? Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent })) : null;
});
const templateToLink = linkOpts.find(o => o.value && o.value !== 'new');
log('LINKING:', JSON.stringify(templateToLink));
await page.evaluate((val) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
    const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, val);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
}, templateToLink.value);
await page.waitForTimeout(800);

const afterLink = await dumpChecklistTable(page, 'after linking template to ITR (should have +1 row: the new instance)');
const instanceRow = afterLink.find(r => r.itrId);
log('THE NEW INSTANCE ROW:', JSON.stringify(instanceRow));

// Now go edit the TEMPLATE again (separately) and save — the instance must NOT change.
// Close the ITR modal first (still open from linking above) so the sidebar link isn't blocked.
await page.getByRole('button', { name: 'Cancel' }).click().catch(() => {});
await page.waitForTimeout(400);
await page.locator('aside').getByText('Checklist Template Lib', { exact: false }).click();
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: 'QTS-CWC-CHECKLIST-000001' }).click();
await page.waitForTimeout(400);
await page.locator('input[placeholder="Enter criteria..."]').first().fill('Investigation criteria text v4 — after instance was linked');
await page.getByRole('button', { name: 'Save Template' }).click();
await page.waitForTimeout(800);

const afterTemplateEditPostLink = await dumpChecklistTable(page, 'after editing TEMPLATE again (post-link) — instance row must be byte-identical');
const instanceRowAfter = afterTemplateEditPostLink.find(r => r.id === instanceRow.id);
log('INSTANCE ROW AFTER TEMPLATE RE-EDIT (should match THE NEW INSTANCE ROW above exactly):', JSON.stringify(instanceRowAfter));
log('INSTANCE UNCHANGED?', JSON.stringify(instanceRow) === JSON.stringify(instanceRowAfter));

await browser.close();
log('DONE');
