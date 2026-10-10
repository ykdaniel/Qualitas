// MEETING-TABS-2026-001 browser acceptance, isolated stack only (8344/3344 via meeting-fix-vite-launcher.mjs,
// seed_meeting_tabs_review.py). Usage: MTG_TABS_REVIEW_PASSWORD=... MTG_TABS_EVIDENCE_DIR=... node tests-browser/meeting-tabs-review.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PW = process.env.MTG_TABS_REVIEW_PASSWORD;
if (!PW) throw new Error('MTG_TABS_REVIEW_PASSWORD not set — use the value the isolated stack was seeded with.');
const BASE = 'http://127.0.0.1:3344';
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
    await openList();
    let row = page.locator('tr', { hasText: text });
    if (extra) row = row.filter({ hasText: extra });
    await row.first().click(); await modal().waitFor(); await page.waitForTimeout(600);
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
check((await modal().getByRole('tab').allTextContents()).map(s => s.replace(/\s*\(\d+\)$/, '')).join('|') === 'General Info|Attendees|Discussions|Action Items|Attachments', '1: five tabs in order');
check(await modal().getByRole('button', { name: /Back/ }).isVisible(), '1: back button');
const typeFirst = await field('Meeting Type').locator('option').first().textContent();
check(typeFirst.trim() === '-- Please select --', `1: Meeting Type placeholder translated (${typeFirst.trim()})`);
for (const label of ['Subject', 'Start Time', 'End Time', 'Venue', 'Recorded By']) check(await field(label).isVisible(), `1: General tab has "${label}"`);
await page.screenshot({ path: `${OUT}/01-general-tab.png` });

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
await modal().getByRole('button', { name: 'Add Category' }).click();
await newRow().locator('textarea').fill('Technical Issues');
await apply().click();
await modal().locator('[data-row="1"]').getByRole('button', { name: 'Add Sub-category' }).click();
await newRow().locator('textarea').fill('Civil OB');
await apply().click();
await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Add Item' }).click();
check(await newRow().isVisible() && await newRow().locator('textarea').evaluate(el => el === document.activeElement), '2: a new item opens straight in edit, focused');
await newRow().locator('textarea').fill('Safety lifeline lacks certificates');
check(await newRow().locator('input[type=date]').first().inputValue() === '2026-08-11', '2: a new item is raised on the meeting date by default');
await newRow().getByPlaceholder('Action by').fill('TECO');
await newRow().getByLabel('Target Date').fill('2026-08-25');
await apply().click();
await modal().locator('[data-row="1"]').getByRole('button', { name: 'Add Item' }).click();
await newRow().locator('textarea').fill('Direct item under the category');
await apply().click();
check((await rowNos()).join(',') === '1,1.1,1.1.1,1.2', `2: register numbered 1 / 1.1 / 1.1.1 / 1.2 (${(await rowNos()).join(',')})`);
check((await modal().locator('[data-row="1"] td').first().textContent()).trim() === '1.0', '2: category shown as 1.0');
// items read as text; raised date above; one this-week field each; ✏️ / 🗑 per row; status dropdown
check(await modal().locator('[data-row="1.1.1"] [data-raised]').textContent() === '11 Aug 2026', '2: raised date shown above the item (11 Aug 2026)');
check(await modal().locator('[data-row="1.1.1"] td').nth(1).locator('textarea').count() === 1, '2: only the this-week field is an input in a resting item');
check(await modal().locator('[data-row="1.1.1"]').getByRole('button', { name: 'Edit' }).isVisible(), '2: ✏️ on the item');
check(await modal().locator('[data-row="1.1.1"] [data-this-week]').textContent() === '' && await modal().locator('[data-row="1.1.1"] [data-this-week] textarea').getAttribute('placeholder') === 'Add progress…', '2: no "This week" label; the field says "Add progress…"');
// ✏️ edits one row in place; ✕ cancels without changing it; ✓ applies
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Edit' }).click();
check(await modal().locator('[data-register] [data-editing]').count() === 1, '2: only that row is in edit');
check(await modal().locator('[data-row="1.1.1"]').getByRole('button', { name: 'Edit' }).count() === 0, '2: other rows have no ✏️ while one is open');
await modal().locator('[data-row="1.2"] textarea[aria-label="1.2"]').fill('changed then cancelled');
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Cancel' }).click();
check(await modal().locator('[data-row="1.2"] td').nth(1).textContent().then(t => t.includes('Direct item under the category')), '2: ✕ leaves the row unchanged');
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Edit' }).click();
await modal().locator('[data-row="1.2"]').getByLabel('Action by').fill('HL');
await apply().click();
check(await modal().locator('[data-row="1.2"] td').nth(2).textContent() === 'HL', '2: ✓ applies the change');
await modal().locator('[data-row="1.1.1"] [data-this-week] textarea').fill('Drawing 08119 supplemented');
// a date picked before any text is kept for the update typed afterwards; spaces alone store nothing
await modal().locator('[data-row="1.2"] [data-this-week] input[type=date]').fill('2026-08-12');
check(await modal().locator('[data-row="1.2"] [data-this-week] input[type=date]').inputValue() === '2026-08-12', '2: date picked before typing stays in the field');
await modal().locator('[data-row="1.2"] [data-this-week] textarea').fill('   ');
await page.screenshot({ path: `${OUT}/02-register-inline.png` });
// a row being edited with a change blocks Save from another tab and brings the user back to it
await modal().locator('[data-row="1"]').getByRole('button', { name: 'Add Item' }).click();
await newRow().locator('textarea').fill('typed, not applied');
await tab('General Info').click();
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
check(calls.length === 0, '2: Save blocked while a new item is typed but not applied');
check(await tab('Discussions').getAttribute('aria-selected') === 'true', '2: the form switched to the Discussions tab');
await newRow().getByRole('button', { name: 'Cancel' }).click();
check(await newRow().count() === 0 && (await rowNos()).join(',') === '1,1.1,1.1.1,1.2', '2: ✕ on a new row adds nothing');
// delete asks first (the dialog handler accepts): remove 1.2, numbering closes up
// a new item closed in the same session stays on screen (it counts as open this meeting)
await modal().locator('[data-row="1.2"] select').selectOption('Closed');
check(await modal().locator('[data-row="1.2"]').isVisible(), '2: an item added and closed this session stays on screen');
const dialogs = [];
page.once('dialog', d => dialogs.push(d.message()));
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Delete' }).click();
check(dialogs[0] === 'Delete 1.2?', `2: deleting an item asks about that item only (${dialogs[0]})`);
check((await rowNos()).join(',') === '1,1.1,1.1.1', '2: 🗑 (confirmed) removes the row');
await tab('Attachments').click();
check(await modal().getByText('agenda.png').count() > 0 || await modal().locator('img[src^="blob:"]').count() > 0, '2: queued file kept across tab switches');
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(2500);
let m2 = (await meetings()).find(m => m.title === T2);
check(!!m2, '2: meeting saved');
check(m2.meetingEndTime === '17:15' && m2.meetingTime === '15:00', '2: start and end time stored');
check(m2.attendees[0].company === 'TECO' && m2.attendees[0].role === 'QAQC Manager', '2: attendee by Company / Name / Position');
check(m2.discussionLog.map(e => `${e.no}:${e.kind}`).join(',') === '1:category,1.1:subcategory,1.1.1:item', '2: stored register shape');
const it = m2.discussionLog.find(e => e.no === '1.1.1');
check(it.owner === 'TECO' && it.targetDate === '2026-08-25' && it.raisedDate === '2026-08-11' && it.updates.length === 1 && it.updates[0].content === 'Drawing 08119 supplemented' && it.updates[0].date === '2026-08-11', '2: item fields, raised date and this week\'s update dated with the meeting date');
check(!JSON.stringify(m2.discussionLog).includes('typed, not applied'), '2: the cancelled new row was not stored');

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
check(await carriedRow.getByRole('button', { name: 'Delete' }).count() === 0, '5: carried item has no 🗑');
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
    check(report.buttons >= 6, `5b@${width}: register buttons present (${report.buttons})`);
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
for (const s of ['SUBJECT', 'VENUE & TIME', 'RECORDED BY', 'DISCUSSIONS / ACTIONS', 'Action by', '15:00 ~ 17:15', '1.0', '1.1.1', '21 Jul 2026', '14 Jul 2026', '15 Aug 2026', '4 Aug 2026']) {
    check(printText.includes(s), `6: print contains "${s}"`);
}
await page.emulateMedia({ media: 'print' });
await page.screenshot({ path: `${OUT}/06-print.png`, fullPage: true });
await page.emulateMedia({ media: 'screen' });

// ═══ 7. Chinese labels ═══
log('=== 7. zh labels ===');
await login('zh');
await openRow('MOM-DEMO-002', 'Meeting Minutes - 111');
check((await modal().getByRole('tab').allTextContents()).map(s => s.replace(/\s*\(\d+\)$/, '')).join('|') === '基本資訊|與會人員|討論事項|行動項目|附件', '7: zh tab names');
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
