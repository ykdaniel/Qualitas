// MEETING-TABS-2026-001 R9 — photos in the discussion register, isolated stack only (8344/3344, seed_meeting_tabs_review.py).
// Usage: MTG_TABS_REVIEW_PASSWORD=... MTG_PHOTOS_EVIDENCE_DIR=... MTG_PHOTOS_PDF=... node tests-browser/meeting-photos-review.mjs
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PW = process.env.MTG_TABS_REVIEW_PASSWORD;
if (!PW) throw new Error('MTG_TABS_REVIEW_PASSWORD not set — use the value the isolated stack was seeded with.');
const BASE = 'http://127.0.0.1:3344';
const OUT = process.env.MTG_PHOTOS_EVIDENCE_DIR || '/private/tmp/claude-501/meeting-photos-evidence';
const PDF = process.env.MTG_PHOTOS_PDF || `${OUT}/photos-print.pdf`;
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const scriptErrors = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|favicon|DevTools/.test(m.text())) scriptErrors.push(m.text()); });
page.on('dialog', d => d.accept());
await page.addInitScript(() => localStorage.setItem('language', 'en'));
await page.goto(`${BASE}/login`);
await page.fill('#email', 'mtg_reviewer');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'), { waitUntil: 'commit' });
await page.waitForTimeout(1000);

const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1];
    const r = await fetch(path, { method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
}, { method, path, body });
const byDoc = async (doc) => (await api('GET', '/api/meeting-minutes/')).body.filter(m => m.documentNumber === doc);
const photoIdsOf = (m) => (m.discussionLog || []).flatMap(e => [...(e.photos || []), ...(e.updates || []).flatMap(u => u.photos || [])]).map(p => p.id);
const modal = () => page.locator('[class*="modalContent"]').first();
const tab = (name) => modal().getByRole('tab', { name: new RegExp(`^${name}`) });
const saveBtn = () => modal().getByRole('button', { name: /^Save$/ });
const openRow = async (text, extra) => {
    await page.goto(`${BASE}/meeting-minutes`); await page.waitForTimeout(800);
    let row = page.locator('tr', { hasText: text });
    if (extra) row = row.filter({ hasText: extra });
    await row.first().click(); await modal().waitFor(); await page.waitForTimeout(600);
    await tab('Discussions').click();
};
/** Pastes an image (a real clipboard-style paste event carrying a PNG file) into a text box. */
const pasteImage = (locator, name = 'pasted.png') => locator.evaluate(async (el, { b64, name }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type: 'image/png' }));
    el.focus();
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
}, { b64: PNG.toString('base64'), name });
const thumbs = (row) => modal().locator(`[data-row="${row}"] [data-photo]`);
const waitThumbs = async (row, n) => { for (let i = 0; i < 30 && await thumbs(row).count() < n; i++) await page.waitForTimeout(200); };

// ═══ 1. a new (unsaved) meeting cannot take photos yet — says so, uploads nothing ═══
log('=== 1. unsaved meeting ===');
await page.goto(`${BASE}/meeting-minutes`); await page.waitForTimeout(700);
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await modal().waitFor();
await tab('Discussions').click();
await modal().getByRole('button', { name: 'Add Category' }).click();
await modal().locator('[data-row="new"] textarea').fill('Tech');
await modal().getByRole('button', { name: 'Apply' }).click();
await modal().locator('[data-register-toolbar]').getByRole('button', { name: 'Add Item' }).click();
await modal().locator('[data-row="new"] textarea').fill('item');
await modal().getByRole('button', { name: 'Apply' }).click();
let uploads = 0;
page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/files/upload')) uploads++; });
await pasteImage(modal().locator('[data-row="1.1"] [data-this-week] textarea'));
await page.waitForTimeout(600);
check(uploads === 0 && await thumbs('1.1').count() === 0, '1: no upload, no photo on an unsaved meeting');
check(/Save the meeting as a Draft first/.test((await page.locator('[data-sonner-toast]').allTextContents()).join(' ')), '1: says to save as Draft first');
await modal().getByRole('button', { name: /Back/ }).click();
await page.getByRole('button', { name: 'Leave' }).click().catch(() => {});
await page.waitForTimeout(400);

// ═══ 2. paste, pick and drop-free paths on a saved Draft; remove; save ═══
log('=== 2. photos on a Draft ===');
await openRow('MOM-DEMO-001');
const draft = (await byDoc('MOM-DEMO-001'))[0];
await pasteImage(modal().locator('[data-row="1.1"] [data-this-week] textarea'), 'crack.png');
await waitThumbs('1.1', 1);
check(await thumbs('1.1').count() === 1, '2: a pasted image shows as a thumbnail under this week\'s update of 1.1');
check(await thumbs('1.1').first().locator('img').evaluate(img => img.complete && img.naturalWidth > 0), '2: the thumbnail loads');
await modal().locator('[data-add-photo="2.1#currentUpdate"] input[type=file]').setInputFiles({ name: 'picked.png', mimeType: 'image/png', buffer: PNG });
await waitThumbs('2.1', 1);
check(await thumbs('2.1').count() === 1, '2: the photo button adds one to 2.1');
const picked = await thumbs('2.1').first().getAttribute('data-photo');
await thumbs('2.1').first().getByRole('button', { name: 'Remove photo' }).click();
await page.waitForTimeout(800);
check(await thumbs('2.1').count() === 0, '2: × takes it off');
check((await api('GET', `/api/files/${picked}`)).status === 404, '2: a photo uploaded in this sitting and removed is deleted at once');
// ✏️ on 1.1: paste into the item text itself
await modal().locator('[data-row="1.1"]').hover();
await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Edit' }).click();
await pasteImage(modal().locator('textarea[aria-label="1.1"]'), 'item.png');
await waitThumbs('1.1', 2);
await modal().getByRole('button', { name: 'Apply' }).click();
check(await thumbs('1.1').count() === 2, '2: a photo pasted into the item text (✏️) hangs on the item');
await page.screenshot({ path: `${OUT}/r9-01-thumbnails.png` });
await saveBtn().click();
await page.waitForTimeout(1500);
let saved = (await byDoc('MOM-DEMO-001'))[0];
const item11 = saved.discussionLog.find(e => e.no === '1.1');
check(item11.photos?.length === 1 && item11.updates.at(-1).photos?.length === 1 && item11.updates.at(-1).content === '', '2: stored: one photo on the item, one on a photo-only update');
check(!JSON.stringify(saved.discussionLog).includes('base64') && photoIdsOf(saved).every(id => /^[0-9a-f-]{16,}$/.test(id)), '2: the JSON holds attachment ids only');
const files = (await api('GET', `/api/files/by-entity?entity_type=meeting&entity_id=${draft.id}&category=discussionPhoto`)).body;
check(files.length === 2 && files.every(f => photoIdsOf(saved).includes(f.id)), '2: two discussionPhoto attachments, both referenced');

// ═══ 3. preview; abandoned upload cleaned up on Back ═══
log('=== 3. preview and abandon ===');
await openRow('MOM-DEMO-001');
await waitThumbs('1.1', 2);
const thumbSrc = await thumbs('1.1').first().locator('img').getAttribute('src');
await thumbs('1.1').first().locator('img').click();
await page.waitForTimeout(400);
check(await page.locator(`img[src="${thumbSrc}"]`).count() >= 2, '3: clicking a thumbnail opens the enlarged preview');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
if (await page.locator(`img[src="${thumbSrc}"]`).count() >= 2) await page.mouse.click(10, 10);
await page.waitForTimeout(300);
await pasteImage(modal().locator('[data-row="2.1"] [data-this-week] textarea'), 'abandoned.png');
await waitThumbs('2.1', 1);
const abandoned = await thumbs('2.1').first().getAttribute('data-photo');
await modal().getByRole('button', { name: /Back/ }).click();
await page.getByRole('button', { name: 'Leave' }).click();
await page.waitForTimeout(1000);
check((await api('GET', `/api/files/${abandoned}`)).status === 404, '3: a photo pasted and then left without saving is deleted');

// ═══ 4. print: "(see photo n)" in the text, photo pages numbered register-first ═══
log('=== 4. print ===');
await openRow('MOM-DEMO-001');
await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
await modal().getByRole('button', { name: /Print/ }).click();
await page.waitForFunction(() => window.__printed === true, null, { timeout: 15000 });
const printText = await page.locator('.mom-print-root').innerText();
check(/See photo 1/.test(printText) && /See photo 2/.test(printText), '4: the text says which photos belong to it');
const captions = await page.locator('.mom-print-root .photo-cell figcaption').allTextContents();
check(captions.length === 2 && /^照片 Photo 1｜1\.1/.test(captions[0]) && /^照片 Photo 2｜1\.1｜/.test(captions[1]), `4: photo pages captioned "照片 n｜1.1｜date" (${captions.join(' / ')})`);
check(await page.locator('.mom-print-root .photo-cell img').evaluateAll(imgs => imgs.every(i => i.naturalWidth > 0)), '4: photos loaded for print');
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: PDF, preferCSSPageSize: true, printBackground: true });
await page.emulateMedia({ media: 'screen' });
const boxes = [...readFileSync(PDF).toString('latin1').matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(m => (Number(m[1]) < Number(m[2]) ? 'P' : 'L'));
check(boxes.at(-1) === 'L' && boxes[0] === 'P', `4: minutes portrait, photo page landscape (${boxes.join('')})`);
await page.goto(`${BASE}/meeting-minutes`);                                 // unmount the print portal

// ═══ 5. New Occurrence: same photos referenced; removing a photo in the earlier meeting only unlinks it ═══
log('=== 5. carried photos ===');
const occ = await api('POST', `/api/meeting-minutes/${draft.id}/new-occurrence`);
check(occ.status === 200, '5: next occurrence created');
const carriedIds = photoIdsOf(occ.body);
check(carriedIds.length === 2 && carriedIds.every(id => photoIdsOf(saved).includes(id)), '5: it shows the same attachment ids (referenced, not copied)');
const filesAfter = (await api('GET', `/api/files/by-entity?entity_type=meeting&entity_id=${occ.body.id}&category=discussionPhoto`)).body;
check(filesAfter.length === 0, '5: no files copied onto the next occurrence');
await openRow('MOM-DEMO-001', '2.0');
await waitThumbs('1.1', 2);
check(await thumbs('1.1').count() === 2 && await thumbs('1.1').locator('img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), '5: carried photos display in the next occurrence');
check(await thumbs('1.1').getByRole('button', { name: 'Remove photo' }).count() === 0, '5: carried photos cannot be removed there');
await page.screenshot({ path: `${OUT}/r9-02-carried.png` });
check((await api('DELETE', `/api/meeting-minutes/${draft.id}`)).status === 400, '5: the earlier meeting cannot be deleted while its photos are shown');
// in rev 1.0 (still a Draft) remove the item photo and save: the reference goes, the file stays (rev 2.0 shows it)
await openRow('MOM-DEMO-001', '1.0');
await modal().locator('[data-row="1.1"]').hover();
await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Edit' }).click();
const itemPhoto = item11.photos[0].id;
await modal().locator(`[data-row="1.1"] [data-photo="${itemPhoto}"]`).getByRole('button', { name: 'Remove photo' }).click();
await modal().getByRole('button', { name: 'Apply' }).click();
await saveBtn().click();
await page.waitForTimeout(1800);
saved = (await byDoc('MOM-DEMO-001')).find(m => m.rev === '1.0');
check(!photoIdsOf(saved).includes(itemPhoto), '5: rev 1.0 no longer shows it');
check((await api('GET', `/api/files/${itemPhoto}`)).status === 200, '5: but the file stays — rev 2.0 still shows it');

// ═══ 6. clean-up paths: remove + publish in one save; 🗑 on an item with photos; leaving by a route change ═══
log('=== 6. clean-up paths ===');
const mk = await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: 'MFX photo cleanup', vendor: 'Hailong Construction',
    discussionLog: [{ no: '1', kind: 'category', level: 0, content: 'Tech' }, { no: '1.1', kind: 'item', level: 1, content: 'a', status: 'Open' },
        { no: '1.2', kind: 'item', level: 1, content: 'b', status: 'Open' }] });
check(mk.status === 200, '6: a Draft to work on');
const field = (label) => modal().locator(`xpath=.//label[normalize-space()="${label}"]/following-sibling::*[1]`);
await openRow('MFX photo cleanup');
await pasteImage(modal().locator('[data-row="1.1"] [data-this-week] textarea'), 'one.png');
await pasteImage(modal().locator('[data-row="1.2"] [data-this-week] textarea'), 'two.png');
await waitThumbs('1.1', 1); await waitThumbs('1.2', 1);
const p11 = await thumbs('1.1').first().getAttribute('data-photo');
const p12 = await thumbs('1.2').first().getAttribute('data-photo');
await saveBtn().click(); await page.waitForTimeout(1500);
// remove 1.1's saved photo and publish in the same save: the file is deleted before the meeting locks
await openRow('MFX photo cleanup');
await waitThumbs('1.1', 1);
await thumbs('1.1').first().getByRole('button', { name: 'Remove photo' }).click();
await tab('General Info').click();
await field('Status').selectOption('Published');
await saveBtn().click(); await page.waitForTimeout(2000);
const pub = (await api('GET', '/api/meeting-minutes/')).body.find(m => m.title === 'MFX photo cleanup');
check(pub.status === 'Published' && (await api('GET', `/api/files/${p11}`)).status === 404, '6: removing a photo and publishing in one save deletes the file (before the lock)');
// 🗑 on an item drops its photos' files too (on a fresh Draft)
const mk2 = await api('POST', '/api/meeting-minutes/', { status: 'Draft', title: 'MFX photo cleanup 2', vendor: 'Hailong Construction',
    discussionLog: [{ no: '1', kind: 'category', level: 0, content: 'Tech' }, { no: '1.1', kind: 'item', level: 1, content: 'a', status: 'Open' }] });
await openRow('MFX photo cleanup 2');
await pasteImage(modal().locator('[data-row="1.1"] [data-this-week] textarea'), 'three.png');
await waitThumbs('1.1', 1);
const p3 = await thumbs('1.1').first().getAttribute('data-photo');
await saveBtn().click(); await page.waitForTimeout(1500);
await openRow('MFX photo cleanup 2');
await modal().locator('[data-row="1.1"]').hover();
await modal().locator('[data-row="1.1"]').getByRole('button', { name: 'Delete' }).click();
await saveBtn().click(); await page.waitForTimeout(1800);
check((await api('GET', `/api/files/${p3}`)).status === 404, '6: 🗑 on an item deletes its photos\' files once saved');
// leaving by a route change (sidebar link → leave guard → Leave) drops this sitting's uploads
await openRow('MFX photo cleanup 2');
await modal().getByRole('button', { name: 'Add Item' }).click();
await modal().locator('[data-row="new"] textarea').fill('c');
await modal().getByRole('button', { name: 'Apply' }).click();
await pasteImage(modal().locator('[data-row="1.1"] [data-this-week] textarea'), 'four.png');
await waitThumbs('1.1', 1);
const p4 = await thumbs('1.1').first().getAttribute('data-photo');
await page.evaluate(() => { history.pushState({}, '', '/followup'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Leave' }).click().catch(() => {});
await page.waitForTimeout(1200);
check((await api('GET', `/api/files/${p4}`)).status === 404, '6: leaving by a route change deletes the unsaved upload');
check(mk2.status === 200 && (await api('GET', `/api/files/${p12}`)).status === 200, '6: a saved photo still in use is untouched');

check(scriptErrors.length === 0, `no script errors in the console (${scriptErrors.join(' | ').slice(0, 300)})`);
await browser.close();
log(`ALL ${checks} CHECKS PASSED`);
