// MEETING-FIX-2026-001 browser acceptance, isolated stack only (8344/3344, seed_meeting_fix_review.py).
// Usage: MTG_FIX_REVIEW_PASSWORD=... MTG_FIX_EVIDENCE_DIR=... node tests-browser/meeting-fix-review.mjs
//   1. Void from inside the form of a Published meeting (with a contractor + an attachment) works and sends the status alone;
//      the old full-form payload is shown to be refused by the backend (that was the bug).
//   2. A new meeting saved as Published with an attachment, whose upload fails once: ONE meeting is created (as Draft),
//      the modal stays open; Save again uploads, publishes, closes — still one meeting.
//   (3. was "an action item that fails once" — Action Items were removed from the form, MEETING-TABS-2026-001 R7.)
//   4. Rev: an edited rev is saved; a rev another occurrence of the series already uses is a friendly 400, the modal stays open.
//   5. A create-only account (no meeting update) saving a new Published meeting: one create carrying Published (no
//      deferred status it could not set), the modal closed.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PW = process.env.MTG_FIX_REVIEW_PASSWORD;
if (!PW) throw new Error('MTG_FIX_REVIEW_PASSWORD not set — use the value the isolated stack was seeded with.');
const BASE = 'http://127.0.0.1:3344';
const OUT = process.env.MTG_FIX_EVIDENCE_DIR || '/private/tmp/claude-501/meeting-fix-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));
page.on('dialog', d => d.accept());

const calls = [];
page.on('request', r => {
    const u = r.url();
    if (['POST', 'PUT'].includes(r.method()) && /\/api\/(meeting-minutes|followup|files\/upload)/.test(u)) {
        calls.push({ method: r.method(), path: new URL(u).pathname, body: r.postData() });
    }
});
const callsTo = (method, re) => calls.filter(c => c.method === method && re.test(c.path));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'mtg_reviewer');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'), { waitUntil: 'commit' });
await page.waitForTimeout(1000);
log('LOGIN OK');

const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1];
    const r = await fetch(path, { method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
}, { method, path, body });
const meetings = async () => (await api('GET', '/api/meeting-minutes/')).body;
const byTitle = async (title) => (await meetings()).filter(m => m.title === title);
const files = async (id) => (await api('GET', `/api/files/by-entity?entity_type=meeting&entity_id=${id}&category=attachment`)).body;

const modal = () => page.locator('[class*="modalContent"]').first();
const field = (label) => modal().locator(`xpath=.//label[normalize-space()="${label}"]/following-sibling::*[1]`);
const saveBtn = () => modal().getByRole('button', { name: /^Save$/ });
const openList = async () => { await page.goto(`${BASE}/meeting-minutes`); await page.waitForTimeout(700); };
const openNew = async () => { await openList(); await page.getByRole('button', { name: /Add New Meeting/i }).click(); await modal().waitFor(); };
const openRow = async (text) => { await openList(); await page.locator('tr', { hasText: text }).first().click(); await modal().waitFor(); await page.waitForTimeout(500); };
const toastText = async () => (await page.locator('[data-sonner-toast]').allTextContents()).join(' | ');

// ═══ 2. upload fails once on a new meeting saved as Published ═══
log('=== 2. new Published meeting with an attachment, first upload fails ===');
const T2 = 'MFX upload-fails-once';
await openNew();
await field('Subject').fill(T2);
await field('Status').selectOption('Published');
await field('Contractor').selectOption('Hailong Construction');
await page.setInputFiles('#attachment-upload-meeting-attachments', { name: 'evidence.png', mimeType: 'image/png', buffer: PNG });
let failUploads = 1;
await page.route('**/api/files/upload**', async (route) => {
    if (failUploads > 0) { failUploads--; return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Injected upload failure' }) }); }
    return route.continue();
});
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/02a-upload-failed-modal-open.png` });
let rows = await byTitle(T2);
check(rows.length === 1, `2a: exactly one meeting created (got ${rows.length})`);
check(rows[0].status === 'Draft', `2a: written as Draft while its attachment is unfinished (got ${rows[0].status})`);
check(callsTo('POST', /\/api\/meeting-minutes\/?$/).length === 1, '2a: one create request');
check(JSON.parse(callsTo('POST', /\/api\/meeting-minutes\/?$/)[0].body).status === 'Draft', '2a: create request carried status Draft');
check(await modal().isVisible(), '2a: modal stays open');
check((await modal().locator('[role=alert]').innerText()).includes(rows[0].documentNumber), '2a: notice names the saved meeting number');
check(await saveBtn().isVisible(), '2a: Save is still available to finish');
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02b-retry-done.png` });
rows = await byTitle(T2);
check(rows.length === 1, `2b: still exactly one meeting (got ${rows.length})`);
check(callsTo('POST', /\/api\/meeting-minutes\/?$/).length === 0, '2b: retry sent no create request');
check(callsTo('POST', /\/api\/followup/).length === 0, '2b: no Follow-up is created from a meeting any more');
check(rows[0].status === 'Published', `2b: published after the upload went through (got ${rows[0].status})`);
check((await files(rows[0].id)).length === 1, '2b: exactly one attachment stored');
check(!(await modal().isVisible().catch(() => false)), '2b: modal closed');
await page.unroute('**/api/files/upload**');

// ═══ 1. Void from inside the form ═══
log('=== 1. Void a Published meeting (contractor + attachment) from inside the form ===');
const published = rows[0];
const oldShape = await api('PUT', `/api/meeting-minutes/${published.id}`, {
    vendor: 'Hailong Construction', status: 'Void', title: T2, attendees: [], discussionLog: [], attachments: [],
});
check(oldShape.status === 400, `1a: the OLD full-form void payload is refused by the backend lock (got ${oldShape.status}) — the bug`);
await openRow(published.documentNumber);
calls.length = 0;
await modal().getByRole('button', { name: /^Void$/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/01-voided.png` });
const voidPuts = callsTo('PUT', /\/api\/meeting-minutes\//);
check(voidPuts.length === 1 && JSON.stringify(JSON.parse(voidPuts[0].body)) === '{"status":"Void"}', `1b: the form sends the status alone (${voidPuts.map(c => c.body).join(',')})`);
check((await byTitle(T2))[0].status === 'Void', '1b: meeting is Void');
check(!(await modal().isVisible().catch(() => false)), '1b: modal closed');

// ═══ 4. rev ═══
log('=== 4. rev is saved; a rev the series already uses is a friendly 400 ===');
const T3 = 'MFX rev draft';
check((await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: T3, vendor: 'Hailong Construction' })).status === 200, '4: a Draft meeting to edit');
rows = await byTitle(T3);
const draft = rows[0];
await openRow(draft.documentNumber);
await field('Rev').fill('1.1');
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(1500);
check(JSON.parse(callsTo('PUT', /\/api\/meeting-minutes\//)[0].body).rev === '1.1', '4a: rev is in the update request');
check((await byTitle(T3))[0].rev === '1.1', '4a: rev 1.1 stored');
const occ = await api('POST', `/api/meeting-minutes/${draft.id}/new-occurrence`);
check(occ.status === 200, `4b: next occurrence created (rev ${occ.body?.rev})`);
await openList();
await page.locator('tr', { hasText: draft.documentNumber }).filter({ hasText: occ.body.rev }).first().click();
await modal().waitFor(); await page.waitForTimeout(500);
await field('Rev').fill('1.1');
await saveBtn().click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/04-rev-conflict.png` });
const tx = await toastText();
check(/already exists/.test(tx), `4b: friendly conflict message shown (${tx.slice(0, 160)})`);
check(await modal().isVisible(), '4b: modal stays open');
check((await meetings()).find(m => m.id === occ.body.id).rev === occ.body.rev, '4b: the occurrence keeps its rev');

// ═══ 5. create-only account ═══
log('=== 5. create-only account: new Published meeting ===');
await page.context().clearCookies();
await page.goto(`${BASE}/login`);
await page.fill('#email', 'mtg_creator');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'), { waitUntil: 'commit' });
await page.waitForTimeout(1000);
const T5 = 'MFX create-only publish';
await openNew();
await field('Subject').fill(T5);
await field('Status').selectOption('Published');
calls.length = 0;
await saveBtn().click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/05-create-only.png` });
rows = await byTitle(T5);
check(rows.length === 1 && rows[0].status === 'Published', `5: one meeting, Published (got ${rows.map(r => r.status).join(',')})`);
check(callsTo('POST', /\/api\/meeting-minutes\/?$/).length === 1 && JSON.parse(callsTo('POST', /\/api\/meeting-minutes\/?$/)[0].body).status === 'Published', '5: one create request carrying Published');
check(callsTo('PUT', /\/api\/meeting-minutes\//).length === 0, '5: no update request (it would be refused without update permission)');
check(!(await modal().isVisible().catch(() => false)), '5: modal closed');

await browser.close();
log(`ALL ${checks} CHECKS PASSED`);
