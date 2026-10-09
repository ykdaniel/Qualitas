import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/chain-walkthrough';
mkdirSync(output, { recursive: true });
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

const log = (...args) => console.log(new Date().toISOString(), ...args);
page.on('request', r => { if (r.url().includes('/api/itp/') || r.url().includes('/api/checklist/')) log('REQ', r.method(), r.url()); });
page.on('response', r => { if (r.url().includes('/api/itp/') && r.request().method() === 'GET') log('RES', r.status(), r.url()); });

// Close whatever detail modal is currently open (a deep-link like ?openId=... opens one
// automatically), trying a few strategies since different modals in this app use slightly
// different footer button labels/markup. Safe to call when no modal is open.
async function closeAnyOpenModal(page) {
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    if (await cancelBtn.count()) {
        await cancelBtn.first().click().catch(() => {});
        await page.waitForTimeout(400);
    }
    // Fallback: an explicit X close button, then Escape, if a modal is still up.
    for (let i = 0; i < 3 && await page.locator('[class*="modalBody"]').count() > 0; i++) {
        await page.locator('[class*="closeButton"]').first().click().catch(() => {});
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(300);
    }
}

// Find the input/select/textarea inside the same container as a <label> whose text matches `text`
// exactly (trimmed). Returns a Playwright Locator.
function fieldByLabel(page, text, { exact = true } = {}) {
    return page.locator('label', exact ? { hasText: new RegExp(`^${text}$`) } : { hasText: text })
        .first()
        .locator('xpath=ancestor::div[1]')
        .locator('input, select, textarea')
        .first();
}

await page.goto(`${BASE}/login`);
await page.fill('#email', 'chain_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
await page.click('text=+ Add ITP');
await page.waitForTimeout(300);

// ── ITP: General Information ──
await fieldByLabel(page, 'Project').selectOption({ label: 'CHAINP1 — ITP Chain Walkthrough' });
await fieldByLabel(page, 'Subject').fill('Chain Walkthrough Steel ITP');
await fieldByLabel(page, 'Contractor').selectOption({ label: 'Chain Walkthrough Contractor Co' });
await page.screenshot({ path: `${output}/03-itp-filled-general.png`, fullPage: true });
log('ITP GENERAL FILLED');

// ── ITP: Inspection Plan tab — add one item ──
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/04-itp-plan-tab-empty.png`, fullPage: true });

await page.getByRole('button', { name: 'Add New Item' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/05-after-add-item-click.png`, fullPage: true });

await page.locator('.fixed input[placeholder="EN"]').first().fill('Check rebar spacing per drawing');
await page.getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/06-after-item-applied.png`, fullPage: true });

// Save the ITP (creates the record).
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/07-after-itp-save.png`, fullPage: true });
log('URL AFTER SAVE:', page.url());
log('ITP STATUS AFTER PLAIN SAVE (expect Pending, not Approved):',
    await page.locator('table tbody tr').first().locator('td').nth(1).textContent());

// Reopen the ITP and generate a Checklist template from it.
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(400);
await page.click('text=Inspection Plan');
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/08-itp-reopened-plan-tab.png`, fullPage: true });

await page.getByRole('button', { name: 'Generate Checklist' }).click();
await page.waitForTimeout(800);
log('URL AFTER GENERATE CHECKLIST:', page.url());
await page.screenshot({ path: `${output}/09-after-generate-checklist.png`, fullPage: true });

// Fill criteria for the auto-generated item and Save Template — this PUTs an EXISTING
// checklist record, so per the corrected walkthrough it needs checklist:update:all (not create).
await page.locator('input[placeholder="Enter criteria..."]').first().fill('Rebar spacing matches structural drawing tolerance');
await page.getByRole('button', { name: 'Save Template' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${output}/10-after-template-save.png`, fullPage: true });
log('URL AFTER TEMPLATE SAVE:', page.url());

// ── NOI: create ──
// Client-side nav (sidebar click), NOT page.goto — a goto() is a hard reload that wipes every
// Zustand store back to empty, which would starve the ITP-no cross-module dropdown below even
// though a real user staying in the same tab would still have it populated from visiting ITP
// earlier in this session. This mirrors actual SPA navigation.
await page.locator('aside').getByText('NOI', { exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/11-noi-list.png`, fullPage: true });

await page.click('text=Add New NOI');
await page.waitForTimeout(400);
const noiFields = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('label').forEach(lbl => {
        const container = lbl.closest('div');
        const control = container?.querySelector('input, select, textarea');
        out.push({ label: lbl.textContent?.trim(), tag: control?.tagName, type: control?.getAttribute('type') });
    });
    return out;
});
log('NOI FORM FIELDS:', JSON.stringify(noiFields, null, 1));
await page.screenshot({ path: `${output}/12-noi-new-modal.png`, fullPage: true });

// Robust label-based fill/select that mirrors the JS-side label->control pairing used in the
// diagnostic dump above (which was reliable) rather than Playwright's xpath ancestor locator
// (which proved flaky for some fields during script development — a test-script issue, not a
// product issue). Sets the value via the native property setter + a real input/change event so
// React's controlled-component state updates exactly as it would from real typing/selecting.
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
await setFieldByLabel(page, 'Subject', 'Rebar inspection before concrete pour');
await setFieldByLabel(page, 'ITP no.', 'QTS-CWC-ITP-000001', { isSelect: true });
await setFieldByLabel(page, 'Issue Date', '2026-09-29');
await setFieldByLabel(page, 'Inspection Date', '2026-09-30');
await setFieldByLabel(page, 'Inspection Time (24h)', '09:00');
await setFieldByLabel(page, 'Event #', 'EVT-001');
const checkpointOptions = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Checkpoint');
    const sel = lbl.closest('div').querySelector('select');
    return Array.from(sel.options).map(o => o.value);
});
log('CHECKPOINT OPTIONS (values):', JSON.stringify(checkpointOptions));
await setFieldByLabel(page, 'Checkpoint', checkpointOptions[1], { isSelect: true });
await setFieldByLabel(page, 'Contact Person', 'Site QA Lead');
await setFieldByLabel(page, 'Phone', '0900000000');
await setFieldByLabel(page, 'Email', 'qa@chainwalkthrough.test');
await page.waitForTimeout(300);

await page.screenshot({ path: `${output}/13-noi-filled.png`, fullPage: true });

await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/14-after-noi-save.png`, fullPage: true });
log('URL AFTER NOI SAVE:', page.url());

// ── ITR: create, linking to the NOI ──
await page.locator('aside').getByText('ITR', { exact: true }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/15-itr-list.png`, fullPage: true });

const addItrBtnText = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(t => t && /add|new/i.test(t));
});
log('ITR ADD BUTTON CANDIDATES:', JSON.stringify(addItrBtnText));

await page.click('text=Add New ITR');
await page.waitForTimeout(400);
const itrFields = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('label').forEach(lbl => {
        const container = lbl.closest('div');
        const control = container?.querySelector('input, select, textarea');
        out.push({ label: lbl.textContent?.trim(), tag: control?.tagName, type: control?.getAttribute('type') });
    });
    return out;
});
log('ITR FORM FIELDS:', JSON.stringify(itrFields));
await page.screenshot({ path: `${output}/16-itr-new-modal.png`, fullPage: true });

await setFieldByLabel(page, 'NOI no. (Source)', 'QTS-CWC-NOI-000001', { isSelect: true });
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/17-itr-noi-selected.png`, fullPage: true });

await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
log('URL AFTER ITR SAVE:', page.url());
await page.screenshot({ path: `${output}/18-after-itr-save.png`, fullPage: true });

// Reopen the ITR and link the Checklist template generated earlier.
await page.locator('table tbody tr').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/19-itr-reopened.png`, fullPage: true });

const linkedChecklistSelectOptions = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
    const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    return sel ? Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent })) : null;
});
log('LINK-CHECKLIST DROPDOWN OPTIONS:', JSON.stringify(linkedChecklistSelectOptions));

// Link the FIRST real template (skip the blank + "new" placeholder options).
const realTemplateOption = linkedChecklistSelectOptions.find(o => o.value && o.value !== 'new');
log('LINKING TEMPLATE:', JSON.stringify(realTemplateOption));
await page.evaluate((val) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
    const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, val);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
}, realTemplateOption.value);
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/20-after-link-checklist.png`, fullPage: true });

// Expand the linked instance and fill the item result.
await page.locator('.cursor-pointer.group').first().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/21-instance-expanded.png`, fullPage: true });

await page.click('text=Items').catch(() => log('no separate Items tab, items likely already visible'));
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/22-items-tab.png`, fullPage: true });

const resultButtons = await page.locator('[data-result-option]').count();
log('RESULT OPTION BUTTONS FOUND:', resultButtons);
await page.locator('[data-result-option="pass"]').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/23-item-marked-pass.png`, fullPage: true });

// Save the checklist snapshot panel (the smaller "Save" inside the panel, not the outer ITR Save).
await page.locator('text=Edit Checklist Snapshot').locator('xpath=ancestor::div[3]').getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${output}/24-after-checklist-result-save.png`, fullPage: true });

// ── Set Inspection Result and attempt Publish (approval) ──
await setFieldByLabel(page, 'Inspection Result', 'Pass', { isSelect: true });
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/25-before-publish.png`, fullPage: true });

await page.getByRole('button', { name: 'Publish' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/26-publish-confirm-dialog.png`, fullPage: true });
// Confirm the publish dialog if one appears.
const confirmPublish = page.getByRole('button', { name: /^(Publish|Confirm)$/ }).last();
if (await confirmPublish.count()) await confirmPublish.click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/27-after-publish.png`, fullPage: true });
log('URL AFTER PUBLISH:', page.url());

// Reopen and confirm the ITR is now Approved and locked.
await page.locator('table tbody tr').filter({ hasText: 'QTS-CWC-ITR-000001' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/28-approved-itr-locked.png`, fullPage: true });
const statusAfterApproval = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Status');
    return lbl?.closest('div')?.querySelector('select')?.value;
});
log('ITR STATUS AFTER PUBLISH:', statusAfterApproval);
await page.click('.fixed .text-slate-400, [aria-label="Close"]').catch(async () => {
    await page.keyboard.press('Escape');
});
await page.waitForTimeout(300);

log('===== MAIN FLOW (合格) COMPLETE — now starting the NON-CONFORMING (Fail) branch =====');

// ═══════════════════════════════════════════════════════════════════════
// NON-CONFORMING BRANCH: a second ITR against the same NOI, marked Fail.
// ═══════════════════════════════════════════════════════════════════════

await page.locator('aside').getByText('ITR', { exact: true }).click();
await page.waitForTimeout(400);
await page.click('text=Add New ITR');
await page.waitForTimeout(400);
await setFieldByLabel(page, 'NOI no. (Source)', 'QTS-CWC-NOI-000001', { isSelect: true });
await page.waitForTimeout(400);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/29-fail-itr-created.png`, fullPage: true });

// Reopen the new (2nd) ITR — it will be the last/most recent row.
await page.locator('table tbody tr').last().click();
await page.waitForTimeout(500);
const failItrDocNo = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Reference no.');
    return lbl?.closest('div')?.querySelector('input')?.value;
});
log('FAIL-BRANCH ITR DOC NO:', failItrDocNo);

// Link a fresh checklist instance and mark its item Fail.
const linkOptions2 = await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
    const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    return sel ? Array.from(sel.options).map(o => ({ value: o.value, text: o.textContent })) : null;
});
const templateOpt2 = linkOptions2.find(o => o.value && o.value !== 'new');
log('FAIL-BRANCH LINKING TEMPLATE:', JSON.stringify(templateOpt2));
await page.evaluate((val) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(h => h.textContent?.includes('Linked Checklists'));
    const sel = heading?.closest('div')?.parentElement?.querySelector('select') || document.querySelectorAll('select')[document.querySelectorAll('select').length - 1];
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, val);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
}, templateOpt2.value);
await page.waitForTimeout(800);

await page.locator('.cursor-pointer.group').first().click();
await page.waitForTimeout(500);
await page.click('text=Items').catch(() => log('no separate Items tab, items likely already visible'));
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/30b-fail-branch-instance-expand-attempt.png`, fullPage: true });
const failResultCount = await page.locator('[data-result-option="fail"]').count();
log('FAIL RESULT BUTTONS FOUND (fail branch):', failResultCount);
await page.locator('[data-result-option="fail"]').first().click();
await page.waitForTimeout(300);
await page.screenshot({ path: `${output}/30-fail-item-marked.png`, fullPage: true });
await page.locator('text=Edit Checklist Snapshot').locator('xpath=ancestor::div[3]').getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(600);

await setFieldByLabel(page, 'Inspection Result', 'Fail', { isSelect: true });
await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Save' }).click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${output}/31-fail-itr-saved.png`, fullPage: true });

// Reopen to see the Raise NCR / Re-inspect buttons (they depend on persisted state).
await page.locator('table tbody tr').last().click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/32-fail-itr-reopened-buttons.png`, fullPage: true });

const branchButtons = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent?.trim()).filter(t => t === 'Raise NCR' || t === 'Re-inspect'));
log('BRANCH BUTTONS VISIBLE:', JSON.stringify(branchButtons));

// ── Raise NCR ──
await page.getByRole('button', { name: 'Raise NCR' }).click();
await page.waitForTimeout(1000);
log('URL AFTER RAISE NCR:', page.url());
await page.screenshot({ path: `${output}/33-after-raise-ncr.png`, fullPage: true });

// Close the NCR detail modal that opened via the deep-link before navigating elsewhere.
await closeAnyOpenModal(page);

// ── Back to the SAME Fail ITR, then Re-inspect ──
await page.locator('aside').getByText('ITR', { exact: true }).click();
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: failItrDocNo }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${output}/34-fail-itr-after-ncr-reopened.png`, fullPage: true });

await page.getByRole('button', { name: 'Re-inspect' }).click();
await page.waitForTimeout(1000);
log('URL AFTER RE-INSPECT:', page.url());
await page.screenshot({ path: `${output}/35-after-reinspect.png`, fullPage: true });

// Verify: new re-inspection ITR's linked checklist is reset to Ongoing/Not filled.
const reinspectChecklistState = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('span')).filter(s => /PASS|FAIL|NOT FILLED/i.test(s.textContent || ''));
    return badges.map(b => b.textContent?.trim());
});
log('RE-INSPECTION ITR CHECKLIST BADGES:', JSON.stringify(reinspectChecklistState));

// Close the re-inspection ITR's detail modal before navigating away.
await closeAnyOpenModal(page);

// Verify: the ORIGINAL fail ITR is unchanged (still Fail/In Progress, its own checklist still Fail).
await page.locator('aside').getByText('ITR', { exact: true }).click();
await page.waitForTimeout(500);
await page.locator('table tbody tr').filter({ hasText: failItrDocNo }).click();
await page.waitForTimeout(500);
const originalStillIntact = await page.evaluate(() => {
    const lbl = Array.from(document.querySelectorAll('label')).find(l => l.textContent?.trim() === 'Inspection Result');
    const badges = Array.from(document.querySelectorAll('span')).filter(s => /PASS|FAIL|NOT FILLED/i.test(s.textContent || ''));
    return { inspectionResult: lbl?.closest('div')?.querySelector('select')?.value, checklistBadges: badges.map(b => b.textContent?.trim()) };
});
log('ORIGINAL FAIL ITR STATE AFTER RE-INSPECT (should be unchanged):', JSON.stringify(originalStillIntact));
await page.screenshot({ path: `${output}/36-original-fail-itr-unchanged.png`, fullPage: true });

await browser.close();
