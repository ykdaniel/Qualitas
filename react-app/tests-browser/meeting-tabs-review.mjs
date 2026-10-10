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
const adder = () => modal().locator('[data-register-adder]');
await modal().getByRole('button', { name: 'Add Category' }).click();
await adder().locator('input').first().fill('Technical Issues');
await adder().getByRole('button', { name: 'Add' }).click();
await modal().locator('[data-row="1"]').getByRole('button', { name: 'Add Sub-category' }).click();
await adder().locator('input').first().fill('Civil OB');
await adder().getByRole('button', { name: 'Add' }).click();
await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Add Item' }).click();
await adder().locator('textarea').fill('Safety lifeline lacks certificates');
await adder().getByPlaceholder('Action by').fill('TECO');
await adder().locator('input[type=date]').fill('2026-08-25');
await adder().getByRole('button', { name: 'Add' }).click();
await modal().locator('[data-row="1"]').getByRole('button', { name: 'Add Item' }).click();
await adder().locator('textarea').fill('Direct item under the category');
await adder().getByRole('button', { name: 'Add' }).click();
await modal().locator('[data-row="1.1.1"]').getByRole('button', { name: 'Add progress update' }).click();
await modal().locator('[data-row="1.1.1"]').getByPlaceholder('Progress update').fill('Drawing 08119 supplemented');
await modal().locator('[data-row="1.1.1"]').getByRole('button', { name: 'Add' }).click();
check((await rowNos()).join(',') === '1,1.1,1.1.1,1.2', `2: register numbered 1 / 1.1 / 1.1.1 / 1.2 (${(await rowNos()).join(',')})`);
check((await modal().locator('[data-row="1"] td').first().textContent()).trim() === '1.0', '2: category shown as 1.0');
await page.screenshot({ path: `${OUT}/02-register-new.png` });
// unconfirmed input on the Discussions tab blocks Save from another tab and brings the user back to it
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Add progress update' }).click();
await modal().locator('[data-row="1.2"]').getByPlaceholder('Progress update').fill('typed, not added');
await tab('General Info').click();
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(800);
check(calls.length === 0, '2: Save blocked while a progress update is typed but not added');
check(await tab('Discussions').getAttribute('aria-selected') === 'true', '2: the form switched to the Discussions tab');
await modal().locator('[data-row="1.2"]').getByRole('button', { name: 'Cancel' }).click();
await tab('Attachments').click();
check(await modal().getByText('agenda.png').count() > 0 || await modal().locator('img[src^="blob:"]').count() > 0, '2: queued file kept across tab switches');
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(2500);
let m2 = (await meetings()).find(m => m.title === T2);
check(!!m2, '2: meeting saved');
check(m2.meetingEndTime === '17:15' && m2.meetingTime === '15:00', '2: start and end time stored');
check(m2.attendees[0].company === 'TECO' && m2.attendees[0].role === 'QAQC Manager', '2: attendee by Company / Name / Position');
check(m2.discussionLog.map(e => `${e.no}:${e.kind}`).join(',') === '1:category,1.1:subcategory,1.1.1:item,1.2:item', '2: stored register shape');
const it = m2.discussionLog.find(e => e.no === '1.1.1');
check(it.owner === 'TECO' && it.targetDate === '2026-08-25' && it.updates.length === 1 && it.updates[0].content === 'Drawing 08119 supplemented' && it.updates[0].date === '2026-08-11', '2: item fields and dated update (date defaults to the meeting date)');

// ═══ 3. legacy two-level Draft: reads as categories + items; Save writes it back in the new shape ═══
log('=== 3. legacy format Draft ===');
await openRow('MOM-DEMO-001');
await tab('Discussions').click();
check((await rowNos()).join(',') === '1,1.1,2,2.1', `3: legacy open rows (${(await rowNos()).join(',')})`);
await modal().getByRole('button', { name: /^Closed$/ }).click();
check((await rowNos()).join(',') === '1,1.2', '3: legacy Closed sub-item under its topic in the Closed filter');
await page.screenshot({ path: `${OUT}/03-legacy-draft.png` });
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(1500);
const put = calls.find(c => c.method === 'PUT');
check(!!put && JSON.parse(put.body).discussionLog.every(e => e.kind), '3: saving a legacy Draft writes the new shape');
const legacySaved = (await byDoc('MOM-DEMO-001'))[0].discussionLog;
check(legacySaved.map(e => `${e.no}:${e.kind}:${e.status || ''}`).join(',') === '1:category:,1.1:item:Open,1.2:item:Closed,2:category:,2.1:item:Open', '3: content and statuses preserved');

// ═══ 4. legacy Published reads (locked, not rewritten) ═══
log('=== 4. legacy Published ===');
const before3 = JSON.stringify((await byDoc('MOM-DEMO-003'))[0].discussionLog);
await openRow('MOM-DEMO-003');
await tab('Discussions').click();
check((await rowNos()).join(',') === '1,1.1,2,2.1', '4: legacy published register readable');
check(await saveBtn().count() === 0, '4: read-only (no Save)');
check(await modal().locator('[data-register] textarea, [data-register] input').count() === 0, '4: no editable register fields');
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
check(await carriedRow.locator('td').nth(1).locator('textarea').count() === 0, '5: carried item text not editable');
check(await carriedRow.locator('[data-update="1.1.1#0"] textarea').count() === 0, '5: carried update read-only');
check(await modal().locator('[data-row="1.1.1"] [aria-label="Delete"]').count() === 0, '5: carried item cannot be deleted');
await carriedRow.getByRole('button', { name: 'Add progress update' }).click();
await carriedRow.getByPlaceholder('Progress update').fill('Employer accepted the certificates');
await carriedRow.getByRole('button', { name: 'Add' }).click();
await carriedRow.getByLabel('Item status').selectOption('Closed').catch(async () => {
    await carriedRow.locator('select').selectOption('Closed');
});
await page.screenshot({ path: `${OUT}/05b-occurrence-carried.png` });
await saveBtn().click();
await page.waitForTimeout(1500);
const occSaved = (await byDoc('MOM-DEMO-002')).find(m => m.rev === '2.0').discussionLog.find(e => e.no === '1.1.1');
check(occSaved.status === 'Closed' && occSaved.updates.length === 2 && occSaved.updates[0].carried && !occSaved.updates[1].carried, '5: new update added after the carried one, item closed');
const origItem = (await byDoc('MOM-DEMO-002')).find(m => m.rev === '1.0').discussionLog.find(e => e.no === '1.1.1');
check(origItem.status === 'Open' && origItem.updates.length === 1, '5: the earlier meeting keeps its own record (a copy, not a reference)');

// ═══ 6. print layout ═══
log('=== 6. print ===');
await openRow('MOM-DEMO-002', 'Meeting Minutes - 111');
await page.evaluate(() => { window.print = () => {}; });
await modal().getByRole('button', { name: /Print/ }).click();
await page.waitForTimeout(800);
const printText = await page.locator('.mom-print-root').innerText().catch(() => '');
for (const s of ['SUBJECT', 'VENUE & TIME', 'RECORDED BY', 'DISCUSSIONS / ACTIONS', 'Action by', '15:00 ~ 17:15', '1.0', '1.1.1', '2026-07-21']) {
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
