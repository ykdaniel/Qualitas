// MEETING-TABS-2026-001 browser acceptance, isolated stack only (8344/3344 via meeting-fix-vite-launcher.mjs,
// seed_meeting_tabs_review.py). Usage: MTG_TABS_REVIEW_PASSWORD=... MTG_TABS_EVIDENCE_DIR=... node tests-browser/meeting-tabs-review.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PW = process.env.MTG_TABS_REVIEW_PASSWORD;
if (!PW) throw new Error('MTG_TABS_REVIEW_PASSWORD not set — use the value the isolated stack was seeded with.');
const BASE = process.env.MTG_BASE || 'http://127.0.0.1:3344';
const OUT = process.env.MTG_TABS_EVIDENCE_DIR || '/private/tmp/claude-501/meeting-tabs-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('dialog', d => d.accept());
const calls = [];
page.on('request', r => {
    if (['POST', 'PUT'].includes(r.method()) && /\/api\/meeting-minutes/.test(r.url())) calls.push({ method: r.method(), path: new URL(r.url()).pathname, body: r.postData() });
});

const login = async (lang) => {
    await page.context().clearCookies();
    await page.addInitScript((l) => localStorage.setItem('language', l), lang);
    await page.goto(`${BASE}/login`);
    await page.fill('#email', 'mtg_reviewer');
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.includes('/login'), { waitUntil: 'commit' });
    await page.waitForTimeout(1000);
};
const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1];
    const r = await fetch(path, { method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
}, { method, path, body });
const meetings = async () => (await api('GET', '/api/meeting-minutes/')).body;
const byDoc = async (doc) => (await meetings()).filter(m => m.documentNumber === doc);
const modal = () => page.locator('[class*="modalContent"]').first();
const tab = (name) => modal().getByRole('tab', { name: new RegExp(`^${name}`) });
const field = (label) => modal().locator(`xpath=.//label[normalize-space()="${label}"]/following-sibling::*[1]`);
const saveBtn = () => modal().getByRole('button', { name: /^Save$/ });
const openList = async () => { await page.goto(`${BASE}/meeting-minutes`); await page.waitForTimeout(800); };
const openRow = async (text, extra) => {
    // search first: the row may be beyond the first page (number / title search, server side). Once more if the list
    // was still settling (a save just before can race the search's reload).
    for (let attempt = 0; ; attempt++) {
        await openList();
        await page.getByPlaceholder(/Search Meeting Minutes|搜尋/).fill(text);
        await page.waitForTimeout(1200);
        let row = page.locator('tr', { hasText: text });
        if (extra) row = row.filter({ hasText: extra });
        try {
            await row.first().waitFor({ timeout: 5000 });
        } catch (err) {
            if (attempt) throw err;
            log('RETRY', `openRow("${text}"): row not there yet, reloading the list once`);
            continue;
        }
        await row.first().click(); await modal().waitFor(); await page.waitForTimeout(600);
        return;
    }
};
const registerRows = () => modal().locator('[data-register] tbody tr[data-row]');
const rowNos = async () => (await registerRows().evaluateAll(trs => trs.map(tr => tr.getAttribute('data-row'))));

await login('en');

// ═══ 1. full-screen + five tabs; General tab layout; the Meeting Type placeholder is translated ═══
log('=== 1. layout ===');
await openList();
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await modal().waitFor();
const box = await modal().boundingBox();
check(box.width >= 1400, `1: full-screen form (width ${Math.round(box.width)})`);
check((await modal().getByRole('tab').allTextContents()).map(s => s.replace(/\s*\(\d+\)$/, '')).join('|') === 'General Info|Attendees|Discussions|Attachments', '1: four tabs in order (no Action Items)');
check(await modal().getByRole('button', { name: /Back/ }).isVisible(), '1: back button');
const typeFirst = await field('Meeting Type').locator('option').first().textContent();
check(typeFirst.trim() === '-- Please select --', `1: Meeting Type placeholder translated (${typeFirst.trim()})`);
for (const label of ['Subject', 'Start Time', 'End Time', 'Venue', 'Recorded By']) check(await field(label).isVisible(), `1: General tab has "${label}"`);
await page.screenshot({ path: `${OUT}/01-general-tab.png` });

// ═══ 1b. list page: Open Items / Closed Items across meetings (fresh seed) ═══
log('=== 1b. item views ===');
await modal().getByRole('button', { name: /Back/ }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: /^Open Items/ }).click();
await page.waitForTimeout(500);
const itemTable = () => page.locator('table').first();
// "MOM-DEMO-002 (1.0)#1.1.1": meeting number (rev) # item number — columns found by their headers
const itemNos = async () => (await itemTable().evaluate(table => {
    const heads = [...table.querySelectorAll('thead th')].map(th => th.innerText.trim());
    const mi = heads.indexOf('Meeting'), ri = heads.indexOf('Rev');
    return [...table.querySelectorAll('tbody tr')].map(tr => `${tr.cells[mi]?.innerText.split('\n')[0]}${ri >= 0 ? ` (${tr.cells[ri].innerText.trim()})` : ''}#${tr.cells[0]?.innerText.trim()}`);
}));
let rowsNow = await itemNos();
check(rowsNow.length === 9, `1b: nine open items from the four meetings (${rowsNow.join(', ')})`);
check(rowsNow[0].startsWith('MOM-DEMO-002') && rowsNow[1].startsWith('MOM-DEMO-002'), '1b: overdue items first');
check(await itemTable().locator('[data-overdue]').count() === 2, '1b: the two past-target items marked overdue');
check(await itemTable().locator('[data-overdue]').first().evaluate(el => getComputedStyle(el).color) === 'rgb(185, 28, 28)', '1b: overdue shown in red');
await page.getByLabel('Action by').selectOption('TECO');
await page.waitForTimeout(300);
check((await itemNos()).length === 4, '1b: filtered by Action by (TECO: 4)');
await page.getByLabel('Overdue only').check();
await page.waitForTimeout(300);
check((await itemNos()).join(',') === 'MOM-DEMO-002 (1.0)#1.1.1', `1b: overdue only (${(await itemNos()).join(',')})`);
await page.screenshot({ path: `${OUT}/01b-open-items.png` });
await page.getByLabel('Overdue only').uncheck();
await page.getByLabel('Action by').selectOption('');
// the search box searches the items themselves (not only meeting number / title), on every meeting
await page.getByPlaceholder(/Search Meeting Minutes/).fill('lifeline');
await page.waitForTimeout(900);
check((await itemNos()).join(',') === 'MOM-DEMO-002 (1.0)#1.1.1', `1b: searching item text finds it (${(await itemNos()).join(',')})`);
await page.getByPlaceholder(/Search Meeting Minutes/).fill('');
await page.waitForTimeout(900);
await page.getByRole('button', { name: /^Closed Items/ }).click();
await page.waitForTimeout(400);
check((await itemNos()).length === 3, `1b: three closed items (${(await itemNos()).join(', ')})`);
await page.getByRole('button', { name: /^Open Items/ }).click();
await page.waitForTimeout(300);
await itemTable().locator('tbody tr').first().click();
await modal().waitFor();
check((await modal().getByRole('textbox').first().inputValue()) === 'MOM-DEMO-002', '1b: clicking an item opens its meeting');
await modal().getByRole('button', { name: /Back/ }).click();
await page.waitForTimeout(300);
// R14 (user: "版次不要放在reference 要多一欄位顯示版次"): the number alone, the revision in a column of its own (sortable)
const headsOf = (table) => table.locator('thead th').evaluateAll(ths => ths.map(th => th.innerText.trim()));
const colTexts = (table, header) => table.evaluate((t, h) => {
    const i = [...t.querySelectorAll('thead th')].map(th => th.innerText.trim()).indexOf(h);
    return [...t.querySelectorAll('tbody tr')].map(tr => tr.cells[i]?.innerText.trim());
}, header);
const openHeads = await headsOf(itemTable());
check(openHeads.indexOf('Rev') === openHeads.indexOf('Meeting') + 1, `R14: Open Items has a Rev column after Meeting (${openHeads.join(' | ')})`);
check((await colTexts(itemTable(), 'Meeting')).every(x => !/\(\d/.test(x)) && (await colTexts(itemTable(), 'Rev')).every(x => x === '1.0'), 'R14: the Meeting column shows no revision in brackets; Rev shows it');
for (const rev of ['10.0', '2.0']) {
    check((await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: `MTB rev ${rev}`, rev, vendor: 'Hailong Construction' })).status === 200, `R14: a meeting at rev ${rev}`);
}
await openList();
const listTable = () => page.locator('table').first();
const listHeads = await headsOf(listTable());
check(listHeads.indexOf('Rev') === listHeads.indexOf('Reference no.') + 1, `R14: the list has a Rev column next to Reference no. (${listHeads.join(' | ')})`);
check((await colTexts(listTable(), 'Reference no.')).every(x => /^[A-Z0-9-]+$/.test(x)), `R14: Reference no. is the number only (${(await colTexts(listTable(), 'Reference no.')).slice(0, 3).join(', ')})`);
await listTable().locator('thead').getByRole('button', { name: 'Rev', exact: true }).click();
await page.getByRole('button', { name: 'Sort Desc' }).click();
await page.waitForTimeout(300);
const revsDesc = await colTexts(listTable(), 'Rev');
check(revsDesc[0] === '10.0' && revsDesc[1] === '2.0', `R14: Rev sorts as numbers — 10.0 before 2.0 (${revsDesc.slice(0, 3).join(', ')})`);
await page.getByPlaceholder(/Search Meeting Minutes/).fill('MOM-DEMO-001');
await page.waitForTimeout(1200);
const found = await colTexts(listTable(), 'Reference no.');
check(found.length >= 1 && found.every(x => x === 'MOM-DEMO-001'), `R14: searching the number still finds it (${found.join(', ')})`);
await page.getByPlaceholder(/Search Meeting Minutes/).fill('');
await openList();
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await modal().waitFor();

// ═══ 2. a new meeting: register with 3 levels, update, attendees, end time; tabs keep input ═══
log('=== 2. build a register on a new meeting ===');
const T2 = 'MTB new register';
await field('Subject').fill(T2);
await field('Contractor').selectOption('Hailong Construction');
await field('Meeting Date').fill('2026-08-11');
await field('Start Time').fill('15:00');
await field('End Time').fill('17:15');
await tab('Attendees').click();
await modal().getByPlaceholder('Company').fill('TECO');
await modal().getByPlaceholder('Name').fill('Toby Tseng');
await modal().getByPlaceholder('Position').fill('QAQC Manager');
await modal().getByRole('button', { name: 'Add' }).first().click();
await tab('Attachments').click();
await page.setInputFiles('#attachment-upload-meeting-attachments', { name: 'agenda.png', mimeType: 'image/png', buffer: PNG });
await tab('Discussions').click();
const newRow = () => modal().locator('[data-row="new"]');
const apply = () => modal().getByRole('button', { name: 'Apply' });
check(await modal().getByRole('tab', { name: 'Weekly Update' }).count() === 0, '2: one screen, no mode switch');
check(await modal().getByLabel('Show closed items').isChecked() === false, '2: "Show closed items" unchecked by default');
const toolbar = () => modal().locator('[data-register-toolbar]');
// two add buttons in the toolbar (user: no sub-categories — category x.0 → item x.y); Add Item needs a category first
check((await toolbar().getByRole('button').allTextContents()).map(x => x.trim()).join('|') === 'Add Category|Add Item', '2: toolbar: Add Category | Add Item (no Add Sub-category)');
check(await toolbar().getByRole('button', { name: 'Add Item' }).getAttribute('aria-disabled') === 'true' && await toolbar().getByRole('button', { name: 'Add Item' }).getAttribute('title') === 'Add a category first', '2: with no category, Add Item is disabled and says why');
// aria-disabled keeps it focusable: from the keyboard it still says why (Playwright refuses to click aria-disabled)
await toolbar().getByRole('button', { name: 'Add Item' }).focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check(await newRow().count() === 0 && /Add a category first/.test(await page.locator('[data-sonner-toast]').allTextContents().then(x => x.join(' '))), '2: pressing it (keyboard) adds nothing and shows the reason');
const addUnder = async (parent, label) => {
    await toolbar().getByRole('button', { name: label }).click();
    await newRow().getByLabel('Under').selectOption(parent);
};
await modal().getByRole('button', { name: 'Add Category' }).click();
const pendingNo = () => newRow().locator('[data-pending-no]').textContent().then(t => t.trim());
check(await pendingNo() === '1.0', '2: a new category shows the number it will get (1.0), not "Add"');
check(await newRow().locator('textarea').evaluate(el => el === document.activeElement), '2: the new row opens focused');
await newRow().locator('textarea').fill('Technical Issues');
await apply().click();
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check(await newRow().getByLabel('Under').inputValue() === '1', '2: after adding category 1.0, the next item goes under it by default');
check(await pendingNo() === '1.1', '2: a new item under 1.0 shows 1.1');
check(await newRow().isVisible() && await newRow().locator('textarea').count() === 1, '2: a new item opens straight in edit');
await newRow().locator('textarea').fill('Safety lifeline lacks certificates');
check(await newRow().locator('input[type=date]').first().inputValue() === '2026-08-11', '2: a new item is raised on the meeting date by default');
await newRow().getByPlaceholder('Action by').fill('TECO');
await newRow().getByLabel('Target Date').fill('2026-08-25');
await apply().click();
await addUnder('1', 'Add Item');
check(await pendingNo() === '1.2', '2: the next item under 1.0 shows 1.2');
await newRow().locator('textarea').fill('Direct item under the category');
await apply().click();
check((await rowNos()).join(',') === '1,1.1,1.2', `2: register numbered 1 / 1.1 / 1.2 — two levels (${(await rowNos()).join(',')})`);
check(await modal().locator('[data-register] tbody').getByRole('button', { name: /^Add / }).count() === 0, '2: no add buttons on the category rows');
// "Under" lists categories only; the default is the category of the row last clicked
await modal().getByRole('button', { name: 'Add Category' }).click();
await newRow().locator('textarea').fill('Safety');
await apply().click();
await modal().locator('[data-row="1.1"] td').first().click();
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check((await newRow().getByLabel('Under').locator('option').evaluateAll(os => os.map(o => o.value))).join(',') === '1,2', '2: "Under" lists the categories only');
check(await newRow().getByLabel('Under').inputValue() === '1' && await pendingNo() === '1.3', '2: Add Item goes under the category of the row last clicked (1.1 → 1.3)');
await newRow().getByLabel('Under').selectOption('2');
check(await pendingNo() === '2.1', '2: changing "Under" renumbers the pending row (2 → 2.1)');
await newRow().getByRole('button', { name: 'Cancel' }).click();
await modal().locator('[data-row="2"]').hover();
await modal().locator('[data-row="2"]').getByRole('button', { name: 'Delete' }).click();
check((await rowNos()).join(',') === '1,1.1,1.2', '2: (category 2.0 removed again)');
check((await modal().locator('[data-row="1"] td').first().textContent()).trim() === '1.0', '2: category shown as 1.0');
// items read as text; raised date above; one this-week field each; ✏️ / 🗑 per row; status dropdown
check(await modal().locator('[data-row="1.1"] [data-raised]').textContent() === '11 Aug 2026', '2: raised date shown above the item (11 Aug 2026)');
check(await modal().locator('[data-row="1.1"] td').nth(1).locator('textarea').count() === 1, '2: only the this-week field is an input in a resting item');
check(await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Edit' }).isVisible(), '2: ✏️ on the item');
check(await modal().locator('[data-row="1.1"] [data-this-week]').textContent() === '' && await modal().locator('[data-row="1.1"] [data-this-week] textarea').getAttribute('placeholder') === 'Add progress…', '2: no "This week" label; the field says "Add progress…"');
// ✏️ edits one row in place; ✕ cancels without changing it; ✓ applies
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Edit' }).click();
check(await modal().locator('[data-register] [data-editing]').count() === 1, '2: only that row is in edit');
check(await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Edit' }).count() === 0, '2: other rows have no ✏️ while one is open');
await modal().locator('[data-row="1.2"] textarea[aria-label="1.2"]').fill('changed then cancelled');
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Cancel' }).click();
check(await modal().locator('[data-row="1.2"] td').nth(1).textContent().then(t => t.includes('Direct item under the category')), '2: ✕ leaves the row unchanged');
// Esc = ✕ (user: "按錯了…一般是按ESC"): in the text, in the "Under" picker, on a ✏️ row; the form itself stays open
await toolbar().getByRole('button', { name: 'Add Item' }).click();
await newRow().locator('textarea').fill('typed by mistake');
await newRow().locator('textarea').press('Escape');
check(await newRow().count() === 0 && await modal().isVisible(), '2: Esc in a new row cancels it; the form stays open');
check(await page.getByRole('button', { name: 'Leave' }).count() === 0, '2: Esc does not bring up the leave prompt');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
await newRow().getByLabel('Under').focus();
await page.keyboard.press('Escape');
check(await newRow().count() === 0, '2: Esc with the "Under" picker focused cancels too');
await modal().locator('[data-row="1.2"]').hover();
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Edit' }).click();
await modal().locator('textarea[aria-label="1.2"]').fill('edited by mistake');
await modal().locator('textarea[aria-label="1.2"]').press('Escape');
check(await modal().locator('[data-register] [data-editing]').count() === 0
    && (await modal().locator('[data-row="1.2"] td').nth(1).textContent()).includes('Direct item under the category'), '2: Esc on a ✏️ row drops the change');
check(await toolbar().getByRole('button', { name: 'Add Item' }).isVisible(), '2: and the toolbar is back');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check(await newRow().getByRole('button', { name: 'Cancel (Esc)' }).getAttribute('title') === 'Cancel (Esc)', '2: ✕ says "Cancel (Esc)"');
await newRow().getByRole('button', { name: 'Cancel (Esc)' }).click();
// R12 (user: "按完一次後就消失了 這樣不能一直編輯下去" / "那應該要提示"): the toolbar stays while a row is open,
// Add chains (blank row replaced / filled row applied first / text-less row refused with the reason), ✓ hands focus to Add Item
const savedNos = async () => (await rowNos()).filter(n => n !== 'new');
const toasts = () => page.locator('[data-sonner-toast]').allTextContents().then(x => x.join(' | '));
const hint = () => modal().locator('[data-editing] [data-edit-hint]');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check(await toolbar().isVisible() && await newRow().count() === 1, 'R12: the toolbar stays while a row is being added');
check(await hint().textContent() === '✓ to apply, Esc to cancel', 'R12: the open row says "✓ to apply, Esc to cancel"');
await toolbar().getByRole('button', { name: 'Add Category' }).click();
check(await newRow().count() === 1 && await pendingNo() === '2.0', 'R12: Add Category on a blank new item replaces it (one new row, 2.0)');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check(await newRow().count() === 1 && await pendingNo() === '1.3' && (await savedNos()).join(',') === '1,1.1,1.2', 'R12: Add Item on a blank new category replaces it; nothing left behind');
await newRow().getByPlaceholder('Action by').fill('TECO');
await toolbar().getByRole('button', { name: 'Add Category' }).click();
await page.waitForTimeout(300);
check(await newRow().count() === 1 && await pendingNo() === '1.3' && await newRow().getByPlaceholder('Action by').inputValue() === 'TECO', 'R12: a row with input but no text is not replaced');
check(/Fill in the text of this row first, or press Esc to cancel it\./.test(await toasts()), 'R12: … and a toast says why and what to do');
check(await hint().getAttribute('role') === 'alert' && /Fill in the text of this row first/.test(await hint().textContent()), 'R12: … and the same reason shows in red under the row');
check(await newRow().locator('textarea').evaluate(el => el === document.activeElement), 'R12: … with focus back in the row text');
await newRow().locator('textarea').fill('Chained item one');
check(await hint().textContent() === '✓ to apply, Esc to cancel', 'R12: typing in the row clears the red reason');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
await page.waitForTimeout(300);
check((await savedNos()).join(',') === '1,1.1,1.2,1.3' && await newRow().count() === 1 && await pendingNo() === '1.4' && await newRow().getByLabel('Under').inputValue() === '1',
    `R12: Add Item on a filled row applies it (1.3) and opens the next one beside it (1.4) — ${(await savedNos()).join(',')}`);
check(await modal().locator('[data-row="1.3"] td').nth(2).textContent() === 'TECO', 'R12: the auto-applied row kept its Action by');
check(/1\.3 applied to the minutes — press Save to keep it\./.test(await toasts()), 'R12: a toast says 1.3 was applied and Save is still needed');
check(await newRow().locator('textarea').evaluate(el => el === document.activeElement), 'R12: the new row opens focused');
await newRow().locator('textarea').fill('Chained item two');
await apply().click();
check(await page.evaluate(() => document.activeElement?.textContent?.trim()) === 'Add Item', 'R12: after ✓ the focus is on "Add Item" (no empty row opened by itself)');
check(await newRow().count() === 0, 'R12: ✓ opens no new row by itself');
await page.keyboard.press('Enter');
check(await newRow().count() === 1 && await pendingNo() === '1.5', 'R12: Enter on it opens the next item (1.5)');
await newRow().locator('textarea').press('Escape');
// a filled new category chains into its first item
await toolbar().getByRole('button', { name: 'Add Category' }).click();
await newRow().locator('textarea').fill('Chained category');
check(await toolbar().getByRole('button', { name: 'Add Item' }).getAttribute('aria-disabled') === null, 'R12: Add Item is enabled while a filled category is open');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check(await newRow().count() === 1 && await newRow().getByLabel('Under').inputValue() === '2' && await pendingNo() === '2.1', 'R12: Add Item on a filled category applies it (2.0) and opens 2.1 under it');
await page.waitForTimeout(300);
const t20 = await toasts();
check(/2\.0 applied to the minutes/.test(t20), `R12: … and the toast names 2.0 (${t20})`);
await newRow().locator('textarea').press('Escape');
// a ✏️ row opened but not changed is just closed: nothing applied, nothing announced
await modal().locator('[data-row="1.4"]').hover();
await modal().locator('[data-row="1.4"]').getByRole('button', { name: 'Edit' }).click();
await toolbar().getByRole('button', { name: 'Add Item' }).click();
await page.waitForTimeout(300);
check(await pendingNo() === '1.5' && !/1\.4 applied/.test(await toasts()), 'R12: Add on an unchanged ✏️ row opens the next item without an "applied" toast');
await newRow().locator('textarea').press('Escape');
// a ✏️ row with its text chains too; with its text cleared it is refused
await modal().locator('[data-row="1.4"]').hover();
await modal().locator('[data-row="1.4"]').getByRole('button', { name: 'Edit' }).click();
check(await toolbar().isVisible(), 'R12: the toolbar stays while a ✏️ row is open');
await modal().locator('textarea[aria-label="1.4"]').fill('');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check(await newRow().count() === 0 && await modal().locator('[data-row="1.4"][data-editing]').count() === 1, 'R12: a ✏️ row with its text cleared is not applied or left');
await modal().locator('textarea[aria-label="1.4"]').fill('Chained item two (edited)');
await toolbar().getByRole('button', { name: 'Add Item' }).click();
check((await modal().locator('[data-row="1.4"] td').nth(1).textContent()).includes('Chained item two (edited)') && await pendingNo() === '1.5', 'R12: a ✏️ row with text is applied, the next item goes beside it');
await newRow().locator('textarea').press('Escape');
for (const no of ['1.4', '1.3', '2']) {
    await modal().locator(`[data-row="${no}"]`).hover();
    await modal().locator(`[data-row="${no}"]`).getByRole('button', { name: 'Delete' }).click();
}
check((await rowNos()).join(',') === '1,1.1,1.2', 'R12: (chained rows removed again)');
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Edit' }).click();
await modal().locator('[data-row="1.2"]').getByLabel('Action by').fill('HL');
await apply().click();
check(await modal().locator('[data-row="1.2"] td').nth(2).textContent() === 'HL', '2: ✓ applies the change');
await modal().locator('[data-row="1.1"] [data-this-week] textarea').fill('Drawing 08119 supplemented');
// a date picked before any text is kept for the update typed afterwards; spaces alone store nothing
await modal().locator('[data-row="1.2"] [data-this-week] input[type=date]').fill('2026-08-12');
check(await modal().locator('[data-row="1.2"] [data-this-week] input[type=date]').inputValue() === '2026-08-12', '2: date picked before typing stays in the field');
await modal().locator('[data-row="1.2"] [data-this-week] textarea').fill('   ');
await page.screenshot({ path: `${OUT}/02-register-inline.png` });
// a row being edited with a change blocks Save from another tab and brings the user back to it
await addUnder('1', 'Add Item');
await newRow().locator('textarea').fill('typed, not applied');
await tab('General Info').click();
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
check(calls.length === 0, '2: Save blocked while a new item is typed but not applied');
check(await tab('Discussions').getAttribute('aria-selected') === 'true', '2: the form switched to the Discussions tab');
check(await pendingNo() === '1.3', '2: the next new item shows 1.3');
await newRow().getByRole('button', { name: 'Cancel' }).click();
check(await newRow().count() === 0 && (await rowNos()).join(',') === '1,1.1,1.2', '2: ✕ on a new row adds nothing');
await addUnder('1', 'Add Item');
check(await pendingNo() === '1.3', '2: after ✕ the same number is offered again (nothing consumed)');
await newRow().getByRole('button', { name: 'Cancel' }).click();
// delete asks first (the dialog handler accepts): remove 1.2, numbering closes up
// a new item closed in the same session stays on screen (it counts as open this meeting)
await modal().locator('[data-row="1.2"] select').selectOption('Closed');
check(await modal().locator('[data-row="1.2"]').isVisible(), '2: an item added and closed this session stays on screen');
const dialogs = [];
page.once('dialog', d => dialogs.push(d.message()));
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Delete' }).click();
check(dialogs[0] === 'Delete 1.2?', `2: deleting an item asks about that item only (${dialogs[0]})`);
check((await rowNos()).join(',') === '1,1.1', '2: 🗑 (confirmed) removes the row');
await modal().getByRole('button', { name: 'Add Category' }).click();
check(await pendingNo() === '2.0', '2: after deleting, the next category is 2.0 (no gap)');
await newRow().getByRole('button', { name: 'Cancel' }).click();
await tab('Attachments').click();
check(await modal().getByText('agenda.png').count() > 0 || await modal().locator('img[src^="blob:"]').count() > 0, '2: queued file kept across tab switches');
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(2500);
let m2 = (await meetings()).find(m => m.title === T2);
check(!!m2, '2: meeting saved');
check(m2.meetingEndTime === '17:15' && m2.meetingTime === '15:00', '2: start and end time stored');
check(m2.attendees[0].company === 'TECO' && m2.attendees[0].role === 'QAQC Manager', '2: attendee by Company / Name / Position');
check(m2.discussionLog.map(e => `${e.no}:${e.kind}`).join(',') === '1:category,1.1:item', '2: stored register shape');
const it = m2.discussionLog.find(e => e.no === '1.1');
check(it.owner === 'TECO' && it.targetDate === '2026-08-25' && it.raisedDate === '2026-08-11' && it.updates.length === 1 && it.updates[0].content === 'Drawing 08119 supplemented' && it.updates[0].date === '2026-08-11', '2: item fields, raised date and this week\'s update dated with the meeting date');
check(!JSON.stringify(m2.discussionLog).includes('typed, not applied'), '2: the cancelled new row was not stored');

// ═══ 2b. an older three-level Draft (sub-category 1.1 → 1.1.1): shown and editable as is, nothing new under the sub-category ═══
log('=== 2b. three-level Draft ===');
const three = await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: 'MTB three-level', vendor: 'Hailong Construction', discussionLog: [
    { no: '1', kind: 'category', level: 0, content: 'Tech' }, { no: '1.1', kind: 'subcategory', level: 1, content: 'Civil OB' },
    { no: '1.1.1', kind: 'item', level: 2, content: 'old item', status: 'Open', owner: 'TECO' }] });
check(three.status === 200, '2b: a three-level Draft');
await openRow('MTB three-level');
await tab('Discussions').click();
check((await rowNos()).join(',') === '1,1.1,1.1.1', '2b: the sub-category and its item are shown');
await modal().locator('[data-row="1.1"]').hover();
await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Edit' }).click();
await modal().locator('textarea[aria-label="1.1"]').fill('Civil OB (renamed)');
await modal().getByRole('button', { name: 'Apply' }).click();
await modal().locator('[data-row="1.1.1"] [data-this-week] textarea').fill('progress on the old item');
await modal().locator('[data-row="1.1.1"] td').first().click();
await modal().locator('[data-register-toolbar]').getByRole('button', { name: 'Add Item' }).click();
check((await modal().locator('[data-row="new"]').getByLabel('Under').locator('option').evaluateAll(os => os.map(o => o.value))).join(',') === '1'
    && (await modal().locator('[data-row="new"] [data-pending-no]').textContent()).trim() === '1.2', '2b: a new item goes under the category (1.2), not under the old sub-category');
await modal().locator('[data-row="new"] textarea').fill('new two-level item');
await modal().getByRole('button', { name: 'Apply' }).click();
await saveBtn().click();
await page.waitForTimeout(1500);
const threeSaved = (await meetings()).find(m => m.title === 'MTB three-level').discussionLog;
check(threeSaved.map(e => `${e.no}:${e.kind}`).join(',') === '1:category,1.1:subcategory,1.1.1:item,1.2:item'
    && threeSaved[1].content === 'Civil OB (renamed)' && threeSaved[2].updates[0].content === 'progress on the old item', '2b: stored as is plus the new item; the old title and item stay editable');

// New Occurrence of the two-level demo carries its open items as two levels
const demo4 = (await meetings()).find(m => m.documentNumber === 'MOM-DEMO-004');
const occ4 = await api('POST', `/api/meeting-minutes/${demo4.id}/new-occurrence`);
check(occ4.status === 200 && occ4.body.discussionLog.map(e => `${e.no}:${e.kind}`).join(',') === '1:category,1.1:item,1.2:item,2:category,2.1:item', '2b: New Occurrence of a two-level meeting carries x.0 / x.y');

// ═══ 2c. R13: several progress notes per item, each on its own day; a missed day filled in later (user: "同一列可以多個日期 如果我忘記補充資料可以補上去") ═══
log('=== 2c. several progress notes ===');
const notes = await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: 'MTB progress notes', meetingDate: '2026-08-11', vendor: 'Hailong Construction', discussionLog: [
    { no: '1', kind: 'category', level: 0, content: 'Tech' },
    { no: '1.1', kind: 'item', level: 1, content: 'Lifeline certificates', status: 'Open', owner: 'TECO', raisedDate: '2026-08-04', carried: true,
        updates: [{ date: '2026-08-06', content: 'earlier meeting note', carried: true }] }] });
check(notes.status === 200, '2c: a Draft with an item raised 4 Aug and a note carried from 6 Aug');
await openRow('MTB progress notes');
await tab('Discussions').click();
const nRow = () => modal().locator('[data-row="1.1"]');
const nField = () => nRow().locator('[data-this-week]');
const keepNote = () => nField().getByRole('button', { name: 'Keep this progress note and write the next' });
const noteTexts = () => nRow().locator('[data-update]').evaluateAll(ds => ds.map(d => d.textContent.trim()));
check(await nField().locator('input[type=date]').inputValue() === '2026-08-11', '2c: a new note is dated with the meeting by default');
check(await nField().locator('input[type=date]').getAttribute('min') === '2026-08-04', '2c: the day picker starts at the raised date');
await keepNote().click();
await page.waitForTimeout(300);
check(/Write the progress first, or press Esc to cancel it\./.test(await toasts()) && /Write the progress first/.test(await nRow().locator('[data-note-problem]').textContent()), '2c: ✓ on an empty note adds nothing and says why (toast + red)');
await nField().locator('textarea').fill('first note');
check(await nRow().locator('[data-note-problem]').count() === 0, '2c: typing clears the red reason');
await keepNote().click();
check(await nField().locator('textarea').inputValue() === '' && (await noteTexts()).some(t => t === '11 Aug 2026first note'), '2c: ✓ files the note and empties the field for the next one');
await nField().locator('textarea').fill('second, same day');
await keepNote().click();
await nField().locator('input[type=date]').fill('2026-08-07');
await nField().locator('textarea').fill('missed day');
await keepNote().click();
check(await nField().locator('input[type=date]').inputValue() === '2026-08-11', '2c: after filing, the next note is back on the meeting date');
check(JSON.stringify(await noteTexts()) === JSON.stringify(['6 Aug 2026earlier meeting note', '7 Aug 2026missed day', '11 Aug 2026first note', '11 Aug 2026second, same day']),
    `2c: notes in date order, the missed day in its place, same day as written (${(await noteTexts()).join(' / ')})`);
check(await nRow().locator('[data-update="1.1#0"]').getByRole('button', { name: /Change progress note|Remove progress note/ }).count() === 0, '2c: the carried note has no ✏️ / 🗑 (only ★, R17)');
// days outside raised … today are refused, said in red while typing and on ✓, and stop Save
await nField().locator('input[type=date]').fill('2026-08-01');
await nField().locator('textarea').fill('too early');
check(/cannot be before the item was raised \(4 Aug 2026\)/.test(await nRow().locator('[data-note-problem]').textContent()), '2c: a day before the raised date shows the reason at once');
await keepNote().click();
check(await nField().locator('textarea').inputValue() === 'too early', '2c: … and ✓ keeps it in the field');
await tab('General Info').click();
await saveBtn().click();
await page.waitForTimeout(600);
check(/Progress of 1\.1: The day cannot be before the item was raised/.test(await toasts()) && await tab('Discussions').getAttribute('aria-selected') === 'true', '2c: Save is stopped, says why and goes to the Discussions tab');
await nField().locator('input[type=date]').fill('2099-01-01');
check(/cannot be after/.test(await nRow().locator('[data-note-problem]').textContent()), '2c: a day after today is refused too');
await nField().locator('textarea').press('Escape');
check(await nField().locator('textarea').inputValue() === '' && !(await noteTexts()).some(t => t.includes('too early')), '2c: Esc in the field drops the note being typed');
await nField().locator('input[type=date]').fill('2026-08-05');
await nField().locator('textarea').fill('fifth of August');
await keepNote().click();
// ✏️ on one of this meeting's notes: day and text change in place; Esc puts it back; 🗑 asks first
const noteAt = (text) => nRow().locator('[data-update]', { hasText: text });
await noteAt('first note').hover();
await noteAt('first note').getByRole('button', { name: 'Change progress note' }).click();
await nRow().locator('[data-note-editing] input[type=date]').fill('2026-08-08');
await nRow().locator('[data-note-editing] textarea').fill('first note (moved to the 8th)');
await nRow().locator('[data-note-editing]').getByRole('button', { name: 'Apply' }).click();
check(JSON.stringify((await noteTexts()).map(t => t.match(/^\d+ \w+ \d{4}/)[0])) === JSON.stringify(['5 Aug 2026', '6 Aug 2026', '7 Aug 2026', '8 Aug 2026', '11 Aug 2026']) && (await noteTexts())[3].includes('moved to the 8th'),
    '2c: a ✏️ change of day moves the note to its new place');
await noteAt('missed day').hover();
await noteAt('missed day').getByRole('button', { name: 'Change progress note' }).click();
await nRow().locator('[data-note-editing] textarea').fill('');
await nRow().locator('[data-note-editing]').getByRole('button', { name: 'Apply' }).click();
check(await nRow().locator('[data-note-editing]').count() === 1 && /Write the progress first/.test(await nRow().locator('[data-note-problem]').textContent()), '2c: an emptied note is not applied, and says why');
await nRow().locator('[data-note-editing] textarea').press('Escape');
check(await nRow().locator('[data-note-editing]').count() === 0 && (await noteTexts()).some(t => t === '7 Aug 2026missed day'), '2c: Esc puts the note back as it was');
const noteDialogs = [];
page.once('dialog', d => noteDialogs.push(d.message()));
await noteAt('second, same day').hover();
await noteAt('second, same day').getByRole('button', { name: 'Remove progress note' }).click();
check(noteDialogs[0] === 'Remove the progress note of 11 Aug 2026?' && !(await noteTexts()).some(t => t.includes('second, same day')), `2c: 🗑 asks, then removes the note (${noteDialogs[0]})`);
await saveBtn().click();
await page.waitForTimeout(1500);
const notesSaved = (await meetings()).find(m => m.title === 'MTB progress notes').discussionLog.find(e => e.no === '1.1').updates;
check(JSON.stringify(notesSaved) === JSON.stringify([
    { date: '2026-08-06', content: 'earlier meeting note', carried: true }, { date: '2026-08-08', content: 'first note (moved to the 8th)' },
    { date: '2026-08-07', content: 'missed day' }, { date: '2026-08-05', content: 'fifth of August' }]), `2c: stored as written, carried note untouched (${JSON.stringify(notesSaved)})`);
await openRow('MTB progress notes');
await tab('Discussions').click();
check(JSON.stringify((await noteTexts()).map(t => t.match(/^\d+ \w+ \d{4}/)[0])) === JSON.stringify(['5 Aug 2026', '6 Aug 2026', '7 Aug 2026', '8 Aug 2026']), '2c: reopened, the notes read in date order');
await page.evaluate(() => { window.print = () => {}; });
await modal().getByRole('button', { name: /Print/ }).click();
await page.waitForTimeout(800);
const printedNotes = await page.locator('.mom-print-root .register .update .update-date').allTextContents();
check(JSON.stringify(printedNotes) === JSON.stringify(['5 Aug 2026', '6 Aug 2026', '7 Aug 2026', '8 Aug 2026']), `2c: printed in date order too (${printedNotes.join(' / ')})`);

// ═══ 2d. R17 (user: "最新的是紅色、上週紀錄的藍色、過去重點紀錄…標示為紅色＝重點"): colours, ★ key points ═══
log('=== 2d. R17 colours ===');
const tones = await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: 'MTB colours', meetingDate: '2026-08-11', vendor: 'Hailong Construction', discussionLog: [
    { no: '1', kind: 'category', level: 0, content: 'Tech' },
    { no: '1.1', kind: 'item', level: 1, content: 'carried item', status: 'Open', carried: true, raisedDate: '2026-07-01', updates: [
        { date: '2026-07-01', content: 'older note', carried: true },
        { date: '2026-07-28', content: 'last meeting note', carried: true, lastMeeting: true },
        { date: '2026-07-14', content: 'older key point', carried: true, highlight: true }] },
    { no: '1.2', kind: 'item', level: 1, content: 'item from last meeting', status: 'Open', carried: true, lastMeeting: true, raisedDate: '2026-07-28', updates: [] },
    { no: '1.3', kind: 'item', level: 1, content: 'new item', status: 'Open', raisedDate: '2026-08-11', updates: [{ date: '2026-08-11', content: 'this meeting note' }] }] });
check(tones.status === 200, '2d: a Draft with carried, last-meeting, key-point and new rows');
await openRow('MTB colours');
await tab('Discussions').click();
const RED = 'rgb(192, 0, 0)', BLUE = 'rgb(31, 78, 153)';
const look = (loc) => loc.evaluate(el => [el.dataset.tone, getComputedStyle(el).color, getComputedStyle(el).fontWeight]);
const noteEl = (text) => modal().locator('[data-update]', { hasText: text });
check(JSON.stringify(await look(noteEl('this meeting note'))) === JSON.stringify(['current', RED, '400']), '2d: this meeting\'s note red (not bold, R18)');
check(JSON.stringify(await look(noteEl('older key point'))) === JSON.stringify(['key', RED, '400']), '2d: a marked older note red (not bold, R18)');
check(JSON.stringify(await look(noteEl('last meeting note'))) === JSON.stringify(['last', BLUE, '400']), '2d: last meeting\'s note blue');
check((await look(noteEl('older note')))[0] === 'old' && (await look(noteEl('older note')))[1] === 'rgb(122, 129, 138)', '2d: an older note grey');
check(JSON.stringify(await look(modal().locator('[data-row="1.3"] [data-item-text]'))) === JSON.stringify(['current', RED, '400']), '2d: a new item red (not bold, R18)');
check(JSON.stringify(await look(modal().locator('[data-row="1.2"] [data-item-text]'))) === JSON.stringify(['last', BLUE, '400']), '2d: an item from last meeting blue');
check(JSON.stringify(await look(modal().locator('[data-row="1.1"] [data-item-text]'))) === JSON.stringify(['old', 'rgb(122, 129, 138)', '400']), '2d: an older item grey (R18)');
check((await modal().locator('[data-tone-legend]').textContent()).includes('Blue = last meeting'), '2d: a legend says what the colours mean');
const raisedColour = (no) => modal().locator(`[data-row="${no}"] [data-raised]`).evaluate(el => getComputedStyle(el).color);
check(await raisedColour('1.3') === RED && await raisedColour('1.2') === BLUE && await raisedColour('1.1') === 'rgb(122, 129, 138)', '2d: the raised date takes its item\'s colour (R19)');
// ★ on a carried note and on an item; saved with the meeting
await noteEl('older note').hover();
await noteEl('older note').getByRole('button', { name: 'Mark as key point' }).click();
check((await look(noteEl('older note')))[0] === 'key' && await noteEl('older note').getByRole('button', { name: 'Clear key point' }).getAttribute('aria-pressed') === 'true', '2d: ★ marks a carried (read-only) note as a key point');
check(await noteEl('older note').getByRole('button', { name: 'Change progress note' }).count() === 0, '2d: … which stays read-only otherwise');
await modal().locator('[data-row="1.1"]').hover();
await modal().locator('[data-row="1.1"] [data-row-actions]').getByRole('button', { name: 'Mark as key point' }).click();
check((await look(modal().locator('[data-row="1.1"] [data-item-text]')))[0] === 'key', '2d: ★ marks an item as a key point');
await noteEl('older key point').hover();
await noteEl('older key point').getByRole('button', { name: 'Clear key point' }).click();
check((await look(noteEl('older key point')))[0] === 'old', '2d: … and ★ again clears it');
await saveBtn().click();
await page.waitForTimeout(1500);
const toneSaved = (await meetings()).find(m => m.title === 'MTB colours').discussionLog.find(e => e.no === '1.1');
check(toneSaved.highlight === true && toneSaved.updates.find(u => u.content === 'older note').highlight === true
    && !('highlight' in toneSaved.updates.find(u => u.content === 'older key point')), '2d: key points stored with the meeting (cleared ones without the key)');
// print: the same colours
await openRow('MTB colours');
await page.evaluate(() => { window.print = () => {}; });
await modal().getByRole('button', { name: /Print/ }).click();
await page.waitForTimeout(800);
const printTone = (text) => page.locator('.mom-print-root .register .update', { hasText: text }).locator('.update-text').evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).fontWeight]);
check(JSON.stringify(await printTone('this meeting note')) === JSON.stringify([RED, '400']) && JSON.stringify(await printTone('older note')) === JSON.stringify([RED, '400'])
    && (await printTone('last meeting note'))[0] === BLUE, '2d: print: red (not bold, R18) / blue as on screen');
check(await page.locator('.mom-print-root .tone-legend').count() === 1, '2d: print has the legend');
// the next meeting: what was new here is "last meeting" there; key points stay
const nextOcc = await api('POST', `/api/meeting-minutes/${(await meetings()).find(m => m.title === 'MTB colours').id}/new-occurrence`);
const nextLog = nextOcc.body.discussionLog;
check(nextLog.find(e => e.no === '1.3').lastMeeting === true && nextLog.find(e => e.no === '1.3').updates[0].lastMeeting === true
    && !('lastMeeting' in nextLog.find(e => e.no === '1.1').updates.find(u => u.content === 'last meeting note'))
    && nextLog.find(e => e.no === '1.1').highlight === true, '2d: New Occurrence: this meeting\'s rows become blue, older blue ones grey, key points kept');
// a published meeting: colours, no ★
await api('PUT', `/api/meeting-minutes/${(await meetings()).find(m => m.title === 'MTB colours').id}`, { status: 'Published' });
await openRow('MTB colours');
await tab('Discussions').click();
check(await modal().locator('[data-key-toggle]').count() === 0 && (await look(noteEl('this meeting note')))[1] === RED, '2d: Published: colours shown, no ★');

// ═══ 3. legacy two-level Draft: reads as categories + items; Save writes it back in the new shape ═══
log('=== 3. legacy format Draft ===');
await openRow('MOM-DEMO-001');
await tab('Discussions').click();
check((await rowNos()).join(',') === '1,1.1,2,2.1', `3: legacy open rows (${(await rowNos()).join(',')})`);
await modal().locator('[data-row="2.1"] [data-this-week] input[type=date]').fill('2026-07-30');
await modal().locator('[data-row="2.1"] [data-this-week] textarea').fill('Checklist completed');
await modal().getByLabel('Show closed items').check();
check((await rowNos()).join(',') === '1,1.1,1.2,2,2.1', '3: "Show closed items" adds the legacy Closed sub-item under its topic');
check(await modal().locator('[data-row="1.2"] [data-this-week]').count() === 0, '3: a closed item has no this-week field');
await page.screenshot({ path: `${OUT}/03-legacy-draft.png` });
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(1500);
const put = calls.find(c => c.method === 'PUT');
check(!!put && JSON.parse(put.body).discussionLog.every(e => e.kind), '3: saving a legacy Draft writes the new shape');
const legacySaved = (await byDoc('MOM-DEMO-001'))[0].discussionLog;
check(legacySaved.map(e => `${e.no}:${e.kind}:${e.status || ''}`).join(',') === '1:category:,1.1:item:Open,1.2:item:Closed,2:category:,2.1:item:Open', '3: content and statuses preserved');
check(JSON.stringify(legacySaved.find(e => e.no === '2.1').updates) === JSON.stringify([{ date: '2026-07-30', content: 'Checklist completed' }]), '3: this week\'s update stored with the date picked before typing');

// ═══ 4. legacy Published reads (locked, not rewritten) ═══
log('=== 4. legacy Published ===');
const before3 = JSON.stringify((await byDoc('MOM-DEMO-003'))[0].discussionLog);
await openRow('MOM-DEMO-003');
await tab('Discussions').click();
check((await rowNos()).join(',') === '1,1.1,2,2.1', '4: legacy published register readable');
check(await saveBtn().count() === 0, '4: read-only (no Save)');
check(await modal().locator('[data-register] textarea, [data-register] input').count() === 0, '4: no editable register fields');
check(await modal().getByRole('button', { name: /^(Edit|Delete|Add Category|Add Item|Add Sub-category)$/ }).count() === 0, '4: no ✏️ / 🗑 / add buttons on a published record');
check(await modal().locator('[data-this-week]').count() === 0, '4: no this-week field on a published record');
check(JSON.stringify((await byDoc('MOM-DEMO-003'))[0].discussionLog) === before3, '4: stored log untouched');

// ═══ 5. New Occurrence carries unfinished items ═══
log('=== 5. new occurrence carry-forward ===');
await openRow('MOM-DEMO-002');
await tab('Discussions').click();
check((await rowNos()).join(',') === '1,1.1,1.1.1,2,2.1', '5: published register (Open filter hides the Closed 1.1.2)');
await page.screenshot({ path: `${OUT}/05a-published-register.png` });
await modal().getByRole('button', { name: /New Occurrence/ }).click();
await page.waitForTimeout(2000);
await modal().waitFor(); await page.waitForTimeout(600);
const occ = (await byDoc('MOM-DEMO-002')).find(m => m.rev === '2.0');
check(!!occ, '5: rev 2.0 created');
check(occ.discussionLog.map(e => e.no).join(',') === '1,1.1,1.1.1,2,2.1' && occ.discussionLog.every(e => e.carried), '5: unfinished items + headings carried, numbers kept, Closed 1.1.2 left behind');
await tab('Discussions').click();
const carriedRow = modal().locator('[data-row="1.1.1"]');
check(await carriedRow.getByText('Carried').isVisible(), '5: carried item marked');
check(await carriedRow.locator('[data-raised]').textContent() === '14 Jul 2026', '5: raised date kept on the carried item');
const indent = async (sel) => carriedRow.locator(sel).first().evaluate(el => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft));   // where the text starts
check(Math.abs(await indent('[data-item-text]') - await indent('[data-update] div:nth-child(2)')) < 1
    && await indent('[data-item-text]') > await indent('[data-raised]') + 8, '5: item text indented under its raised date, like the progress updates');
check(await carriedRow.getByRole('button', { name: 'Delete' }).count() === 0, '5: carried item has no 🗑');
// with carried rows the numbers never move: a deleted new row leaves a gap, the next number is max + 1
const addUnder2 = async (text) => {
    await addUnder('2', 'Add Item');
    const no = await modal().locator('[data-row="new"] [data-pending-no]').textContent();
    await modal().locator('[data-row="new"] textarea').fill(text);
    await modal().getByRole('button', { name: 'Apply' }).click();
    return no.trim();
};
check(await addUnder2('temp A') === '2.2' && await addUnder2('temp B') === '2.3', '5: new items under carried 2.0 get 2.2, 2.3');
await modal().locator('[data-row="2.2"]').hover();
await modal().locator('[data-row="2.2"]').getByRole('button', { name: 'Delete' }).click();
check((await rowNos()).includes('2.3') && !(await rowNos()).includes('2.2'), '5: deleting 2.2 keeps 2.3 (no renumbering while carried rows exist)');
await addUnder('2', 'Add Item');
check((await modal().locator('[data-row="new"] [data-pending-no]').textContent()).trim() === '2.4', '5: the next one is 2.4 (the gap 2.2 is not reused)');
await modal().locator('[data-row="new"]').getByRole('button', { name: 'Cancel' }).click();
await modal().locator('[data-row="2.3"]').hover();
await modal().locator('[data-row="2.3"]').getByRole('button', { name: 'Delete' }).click();
await carriedRow.getByRole('button', { name: 'Edit' }).click();
check(await modal().locator('textarea[aria-label="1.1.1"]').count() === 0 && await carriedRow.getByLabel('Action by').isVisible(), '5: ✏️ on a carried item: text stays read-only, Action by editable');
await carriedRow.getByRole('button', { name: 'Cancel' }).click();
check(await carriedRow.locator('[data-update="1.1.1#0"] textarea').count() === 0, '5: carried update read-only');
check(await modal().locator('[data-row="1.1.1"] [aria-label="Delete"]').count() === 0, '5: carried item cannot be deleted');
check(await carriedRow.locator('[data-update="1.1.1#0"]').textContent().then(t => t.startsWith('21 Jul 2026')), '5: earlier update shown as "21 Jul 2026" + text');
await carriedRow.locator('[data-this-week] textarea').fill('Employer accepted the certificates');
await carriedRow.locator('select').selectOption('Closed');
check(await carriedRow.isVisible() && await carriedRow.locator('[data-this-week]').count() === 1, '5: an item closed this week stays, with its this-week field, until the form closes');
await page.screenshot({ path: `${OUT}/05b-occurrence-inline.png` });
await saveBtn().click();
await page.waitForTimeout(1500);
const occSaved = (await byDoc('MOM-DEMO-002')).find(m => m.rev === '2.0').discussionLog.find(e => e.no === '1.1.1');
check(occSaved.status === 'Closed' && occSaved.updates.length === 2 && occSaved.updates[0].carried && !occSaved.updates[1].carried, '5: new update added after the carried one, item closed');
const origItem = (await byDoc('MOM-DEMO-002')).find(m => m.rev === '1.0').discussionLog.find(e => e.no === '1.1.1');
check(origItem.status === 'Open' && origItem.updates.length === 1, '5: the earlier meeting keeps its own record (a copy, not a reference)');

// ═══ 5a. ✏️ / 🗑 small and faint, shown on row hover / focus; text boxes grow with their content ═══
log('=== 5a. hover icons, auto-height text ===');
await openRow('MOM-DEMO-001');
await tab('Discussions').click();
await page.mouse.move(5, 5);
const actions = modal().locator('[data-row="2.1"] [data-row-actions]');
check(await actions.evaluate(el => getComputedStyle(el).opacity) === '0', '5a: row icons hidden until hover');
await modal().locator('[data-row="2.1"]').hover();
await page.waitForTimeout(250);
check(await actions.evaluate(el => getComputedStyle(el).opacity) === '1', '5a: row icons shown on hover');
const pencil = await actions.getByRole('button', { name: 'Edit' }).boundingBox();
check(pencil.width <= 22 && pencil.height <= 22, `5a: ✏️ is a small icon (${Math.round(pencil.width)}x${Math.round(pencil.height)})`);
await page.mouse.move(5, 5);
await actions.getByRole('button', { name: 'Edit' }).focus();
check(await actions.evaluate(el => getComputedStyle(el).opacity) === '1', '5a: row icons shown on keyboard focus');
const upd = modal().locator('[data-row="2.1"] [data-this-week] textarea');
const h1 = (await upd.boundingBox()).height;
check(h1 <= 40, `5a: empty update box is one line high (${Math.round(h1)}px)`);
await upd.fill('line one\nline two\nline three\nline four');
const h4 = (await upd.boundingBox()).height;
check(h4 > h1 + 40 && await upd.evaluate(el => el.scrollHeight <= el.clientHeight + 1), `5a: the box grows with its text, no scrollbar (${Math.round(h1)} -> ${Math.round(h4)}px)`);
await upd.fill('');
check(Math.abs((await upd.boundingBox()).height - h1) <= 1, '5a: and shrinks back to one line when emptied');
await modal().locator('[data-row="2.1"]').getByRole('button', { name: 'Edit' }).click();
const ed = modal().locator('textarea[aria-label="2.1"]');
check(await ed.evaluate(el => el.scrollHeight <= el.clientHeight + 1 && el.clientHeight < 60), '5a: edit box sized to its one-line content');
await modal().locator('[data-row="2.1"]').getByRole('button', { name: 'Cancel' }).click();

// ═══ 5b. compact controls stay inside their cells at 800 and 1400 px (user: "太大 要符合欄寬") ═══
log('=== 5b. control sizes ===');
await openRow('MOM-DEMO-002', '2.0');
await tab('Discussions').click();
await modal().getByLabel('Show closed items').check();
for (const width of [800, 1400]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForTimeout(400);
    const report = await modal().locator('[data-register]').evaluate(table => {
        const bad = [];
        let buttons = 0, tallest = 0;
        for (const td of table.querySelectorAll('tbody td')) {
            if (td.scrollWidth > td.clientWidth + 1) bad.push(`cell overflow ${td.closest('tr').dataset.row}`);
            const r = td.getBoundingClientRect();
            for (const b of td.querySelectorAll('button')) {
                buttons++;
                const br = b.getBoundingClientRect();
                tallest = Math.max(tallest, br.height);
                if (br.left < r.left - 0.5 || br.right > r.right + 0.5) bad.push(`button outside cell: ${b.textContent || b.getAttribute('aria-label')} (${td.closest('tr').dataset.row})`);
            }
        }
        return { bad, buttons, tallest: Math.round(tallest) };
    });
    check(report.buttons >= 2, `5b@${width}: register buttons present (${report.buttons})`);
    check(report.bad.length === 0, `5b@${width}: every button inside its cell, no cell overflow (${report.bad.join('; ')})`);
    check(report.tallest <= 26, `5b@${width}: buttons stay one compact line (tallest ${report.tallest}px)`);
    await page.screenshot({ path: `${OUT}/05c-controls-${width}.png` });
}
await page.setViewportSize({ width: 1440, height: 1000 });

// ═══ 6. print layout ═══
log('=== 6. print ===');
await openRow('MOM-DEMO-002', 'Meeting Minutes - 111');
await page.evaluate(() => { window.print = () => {}; });
await modal().getByRole('button', { name: /Print/ }).click();
await page.waitForTimeout(800);
const printText = await page.locator('.mom-print-root').innerText().catch(() => '');
check(await page.locator('.mom-print-root .register .raised-date + .update-text').count() >= 2, '6: print: item text indented under its raised date');
for (const s of ['SUBJECT', 'VENUE & TIME', 'RECORDED BY', 'DISCUSSIONS / ACTIONS', 'Action by', '15:00 ~ 17:15', '1.0', '1.1.1', '21 Jul 2026', '14 Jul 2026', '15 Aug 2026', '4 Aug 2026']) {
    check(printText.includes(s), `6: print contains "${s}"`);
}
// R16 (user: "大項目 不要灰底"): main headings bold, no grey band; the register's category rows keep theirs
const secBg = await page.locator('.mom-print-root .sec-head').first().evaluate(el => getComputedStyle(el).backgroundColor);
check(secBg === 'rgba(0, 0, 0, 0)' || secBg === 'transparent', `R16: print main heading has no grey band (${secBg})`);
check(await page.locator('.mom-print-root .register tr.cat-row td').first().evaluate(el => getComputedStyle(el).backgroundColor) !== 'rgba(0, 0, 0, 0)', 'R16: the register category row keeps its grey');
await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: `${OUT}/06-print.png`, fullPage: true });
await page.emulateMedia({ media: 'screen' });
// R15 (user: "要補word匯出"): Export Word beside Print downloads the minutes as .docx, same content as the print
const [download] = await Promise.all([page.waitForEvent('download'), modal().getByRole('button', { name: 'Export Word' }).click()]);
check(download.suggestedFilename() === 'MOM-DEMO-002_Rev1.0.docx', `R15: Export Word downloads MOM-DEMO-002_Rev1.0.docx (${download.suggestedFilename()})`);
const docxPath = `${OUT}/r15-export.docx`;
await download.saveAs(docxPath);
const docXml = execFileSync('unzip', ['-p', docxPath, 'word/document.xml']).toString('utf8');
const docText = docXml.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
for (const s of ['MEETING MINUTES', 'MOM-DEMO-002', 'PUBLISHED', 'DISCUSSIONS / ACTIONS', '1.0', '1.1.1', '21 Jul 2026', '14 Jul 2026', 'Action by']) {
    check(docText.includes(s), `R15: the .docx contains "${s}"`);
}
check(/<w:pgSz[^>]*w:w="11906"[^>]*w:h="16838"/.test(docXml), 'R15: the minutes are portrait A4 (21 × 29.7 cm)');
check(!/<w:shd [^>]*w:fill="D9D9D9"[^>]*\/>(?:(?!<\/w:tc>).)*?1\. 基本資料/s.test(docXml) && docText.includes('1. 基本資料  Basic Information'), 'R16: the Word main headings have no grey band');
const btnBox = await modal().getByRole('button', { name: 'Export Word' }).boundingBox();
const printBox = await modal().getByRole('button', { name: /^Print$/ }).boundingBox();
check(Math.abs(btnBox.y - printBox.y) < 4 && btnBox.x > printBox.x, 'R15: Export Word sits next to Print in the footer');

// ═══ 7. Chinese labels ═══
log('=== 7. zh labels ===');
await login('zh');
await openRow('MOM-DEMO-002', 'Meeting Minutes - 111');
check((await modal().getByRole('tab').allTextContents()).map(s => s.replace(/\s*\(\d+\)$/, '')).join('|') === '基本資訊|與會人員|討論事項|附件', '7: zh tab names');
const zhType = await field('會議類型').locator('option').first().textContent();
check(zhType.trim() === '-- 請選擇 --', `7: zh placeholder (${zhType.trim()})`);
check(await field('記錄人').isVisible() && await field('結束時間').isVisible(), '7: zh 記錄人 / 結束時間');
await tab('討論事項').click();
await page.screenshot({ path: `${OUT}/07-zh-register.png` });

// HTTP refusals are logged by the browser as "Failed to load resource" (the reviewer account has no permission for the
// dashboard's other modules; /auth/verify is 401 before login) — only script errors count here.
const scriptErrors = consoleErrors.filter(e => !/favicon|DevTools|Failed to load resource/.test(e));
check(scriptErrors.length === 0, `no script errors in the console (${scriptErrors.join(' | ').slice(0, 300)})`);
await browser.close();
log(`ALL ${checks} CHECKS PASSED`);
