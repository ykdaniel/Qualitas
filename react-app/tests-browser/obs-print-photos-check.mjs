// OBS-PRINT-PHOTOS-2026-001 — real browser on the isolated stack (seed_obs_print_photos_review.py).
//   node tests-browser/obs-print-photos-check.mjs <run dir> <evidence dir>
// 1. Print: for each seeded OBS, opens the record, presses 列印 (window.print stubbed), measures the photo layout in
//    print media and prints a real A4 PDF (page.pdf): header row Before | After, one row per pair labelled 第 n 組,
//    Before n left / After n right, every cell half width and the same height, a missing partner = 無對應照片.
// 2. Photos tab: the same pairs as the print (cell by cell), pair labels, legacy photos first.
// 3. Lock: Closed / Void show the lock note and no upload / ✕ / ↑↓, photos still open in the preview; the API refuses
//    a changed photoOrder / attachments / photo field on them with 409 ATTACHMENT_LOCKED and accepts the unchanged one.
// 4. Reorder: ↓ on an Open OBS changes the pairs, is saved (photoOrder) and the print follows it.
// 5. Reopen: a Closed OBS reopened and saved shows upload / ✕ / ↑↓ again.
// 6. New photos (not saved yet) are marked NEW, have no ↑↓, and a hint says to save first.
// 7. Close / void while file uploads or deletions are still pending is stopped before anything is written (as NCR);
//    the two-save flow works; Open saves and a close that also changes photoOrder are not affected.
// 8. Saved but a file step failed: a photo deleted in that save does not reappear on the Photos tab.
// 9. A new OBS: a chosen photo shows NEW and the save-first hint.
// The admin password is read from the run directory and never printed.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [root, outDir] = process.argv.slice(2);
const stack = JSON.parse(readFileSync(join(root, 'stack-state.json'), 'utf8'));
const PW = readFileSync(join(root, 'admin-password'), 'utf8').trim();
const UI = `http://127.0.0.1:${stack.vite_port}`;
mkdirSync(outDir, { recursive: true });
const results = [];
const note = (name, value) => { results.push({ name, value }); console.log(`OBSERVED ${name} -> ${JSON.stringify(value)}`); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(() => { localStorage.setItem('language', 'zh'); window.print = () => {}; });
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.goto(UI + '/login');
await page.fill('#email', 'admin'); await page.fill('#password', PW); await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 });

const modal = () => page.locator('[class*=modalContent], [class*=ModalContent]').first();
async function openObs(docNo) {
    await page.goto(UI + '/obs'); await page.waitForTimeout(1200);
    await page.locator('tr', { hasText: docNo }).first().click();
    await modal().waitFor({ timeout: 10000 }); await page.waitForTimeout(600);
}
async function photosTab() {
    await modal().locator('[class*=tabButton]', { hasText: /照片與附件/ }).first().click();
    await page.waitForTimeout(1200);
}
async function api(method, path, body) {
    return page.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await res.json(); } catch { /* no body */ }
        return { status: res.status, body: j };
    }, { method, path, body });
}
const obsByNo = async docNo => (await api('GET', '/api/obs/')).body.find(o => o.documentNumber === docNo);

// Print pairs + layout measures (print media); optionally a real A4 PDF.
async function printPairs(docNo, pdfName) {
    await openObs(docNo);
    await modal().locator('button', { hasText: /列印|Print/ }).first().click();
    await page.locator('.obs-print-root').waitFor({ state: 'attached', timeout: 10000 });
    await page.waitForFunction(() => [...document.querySelectorAll('.obs-print-root img')].every(i => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
    await page.emulateMedia({ media: 'print' });
    const m = await page.evaluate(() => {
        const r = document.querySelector('.obs-print-root');
        const box = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height) }; };
        const head = r.querySelector('.photo-row.photo-head');
        const pairs = [...r.querySelectorAll('.photo-pair')].map(p => {
            const row = p.querySelector('.photo-row');
            return {
                label: p.querySelector('.pair-label')?.textContent, row: box(row),
                cells: [...row.children].map(c => ({ ...box(c), src: c.querySelector('img')?.getAttribute('src') ?? null, text: c.classList.contains('photo-missing') ? c.textContent : null })),
            };
        });
        const img = r.querySelector('.photo-item img');
        return { headers: head ? [...head.children].map(c => c.textContent) : null, pairs, imgHeight: img ? getComputedStyle(img).height : null,
                 objectFit: img ? getComputedStyle(img).objectFit : null, keepBlock: !!r.querySelector('.photo-keep > .sec-head') && !!r.querySelector('.photo-keep > .photo-head') && !!r.querySelector('.photo-keep > .photo-pair') };
    });
    if (pdfName) await page.pdf({ path: join(outDir, pdfName), format: 'A4', preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    return m;
}
const layout = m => {
    const cells = m.pairs.flatMap(p => p.cells);
    const half = m.pairs.length ? m.pairs[0].row.w / 2 : 0;
    return {
        headers: m.headers, labels: m.pairs.map(p => p.label),
        pairs: m.pairs.map(p => p.cells.map(c => (c.src ? 'photo' : '—')).join(' | ')),
        twoCellsEveryRow: m.pairs.every(p => p.cells.length === 2),
        halfWidth: cells.every(c => Math.abs(c.w - (half - 4)) <= 2),
        leftCellAtRowStart: m.pairs.every(p => Math.abs(p.cells[0].x - p.row.x) <= 1),
        cellsSameHeight: new Set(cells.map(c => c.h)).size <= 1,
        missingText: [...new Set(cells.filter(c => c.text).map(c => c.text))],
        imgHeight: m.imgHeight, objectFit: m.objectFit, headingHeaderFirstPairInOneBlock: m.keepBlock,
    };
};
// Photos-tab pairs: per pair the label, each cell's image src (authenticated, like the print) / 'NEW' / null, and names
const tabPairs = () => modal().evaluate(m => [...m.querySelectorAll('[data-photo-pair]')].map(p => ({
    label: p.firstElementChild?.textContent,
    cells: [...p.lastElementChild.children].map(c => (c.hasAttribute('data-photo-missing') ? null : c.hasAttribute('data-photo-pending') ? 'NEW' : c.querySelector('img')?.getAttribute('src'))),
    names: [...p.lastElementChild.children].map(c => c.querySelector('img')?.getAttribute('alt') ?? '—'),
})));
const controls = () => modal().evaluate(m => {
    const btn = re => [...m.querySelectorAll('button')].filter(b => re.test(b.getAttribute('aria-label') || '')).length;
    return {
        lockNote: m.querySelector('[data-obs-files-locked]')?.textContent || null,
        uploadInputs: m.querySelectorAll('input[type=file]').length,
        moveUp: btn(/上移/), moveDown: btn(/下移/), deletePhoto: btn(/刪除 \/ Delete/), removeNew: btn(/移除 \/ Remove/),
        hint: [...m.querySelectorAll('p')].find(p => /存檔後可調整順序/.test(p.textContent))?.textContent || null,
    };
});

// ══ 1. Print layout: 1, 2, 3, 4 pairs + unequal / one-sided / legacy ═════════════════════════════
const cases = [
    ['QTS-OPP-HCE-OBS-000003', 'void-1-1'], ['QTS-OPP-HCE-OBS-000002', 'closed-2-2'], ['QTS-OPP-FSW-OBS-000003', 'open-3-3'],
    ['QTS-OPP-HCE-OBS-000004', 'open-4-3'], ['QTS-OPP-FSW-OBS-000001', 'open-2-0'], ['QTS-OPP-FSW-OBS-000002', 'inprogress-2-1'],
    ['QTS-OPP-FSW-OBS-000005', 'open-0-2'], ['QTS-OPP-FSW-OBS-000004', 'legacy-mixed'], ['QTS-OPP-HCE-OBS-000001', 'resolved-2-2'],
];
for (const [docNo, slug] of cases) note(`${slug} print layout`, layout(await printPairs(docNo, `${slug}.pdf`)));

// ══ 2. Photos tab = print, cell by cell ══════════════════════════════════════════════════════════
for (const [docNo, shot] of [['QTS-OPP-FSW-OBS-000004', 'tab-legacy-mixed.png'], ['QTS-OPP-HCE-OBS-000004', 'tab-4-pairs.png'], ['QTS-OPP-FSW-OBS-000001', 'tab-2-0.png']]) {
    await openObs(docNo); await photosTab();
    const tab = await tabPairs();
    await modal().screenshot({ path: join(outDir, shot) });
    const printed = await printPairs(docNo);
    note(`${docNo} Photos tab pairs (names)`, tab.map(p => `${p.label}: ${p.names.join(' | ')}`));
    note(`${docNo} print pairs equal the Photos tab pairs`, JSON.stringify(printed.pairs.map(p => p.cells.map(c => c.src))) === JSON.stringify(tab.map(p => p.cells)));
}

// ══ 3. Lock ══════════════════════════════════════════════════════════════════════════════════════
await openObs('QTS-OPP-HCE-OBS-000002'); await photosTab();
note('Closed: Photos tab controls', await controls());
await modal().screenshot({ path: join(outDir, 'lock-closed.png') });
const imgsBefore = await page.locator('img').count();
await modal().locator('[data-photo-pair] img').first().click(); await page.waitForTimeout(600);
note('Closed: clicking a photo still opens the preview', await page.locator('img').count() > imgsBefore);
await openObs('QTS-OPP-HCE-OBS-000003'); await photosTab();
note('Void: Photos tab controls', await controls());
await modal().screenshot({ path: join(outDir, 'lock-void.png') });
await openObs('QTS-OPP-HCE-OBS-000001'); await photosTab();
note('Resolved (not locked): Photos tab controls', await controls());

const closedObs = await obsByNo('QTS-OPP-HCE-OBS-000002');
const voidObs = await obsByNo('QTS-OPP-HCE-OBS-000003');
const someOrder = { defectPhoto: ['att:x', 'att:y'] };
note('API: changed photoOrder on Closed', await api('PUT', `/api/obs/${closedObs.id}`, { photoOrder: someOrder }));
note('API: changed photoOrder on Void', await api('PUT', `/api/obs/${voidObs.id}`, { photoOrder: someOrder }));
note('API: attachments / defectPhotos changed on Void', [await api('PUT', `/api/obs/${voidObs.id}`, { attachments: ['x.pdf'] }), (await api('PUT', `/api/obs/${voidObs.id}`, { defectPhotos: [] })).status]);
note('API: unchanged (no) photoOrder re-sent on Closed -> status', (await api('PUT', `/api/obs/${closedObs.id}`, { photoOrder: null })).status);
note('API: Closed + blank status + attachments change -> refused (blank = no status change), still Closed',
    [await api('PUT', `/api/obs/${closedObs.id}`, { status: '', attachments: ['sneaked-in.pdf'] }), (await obsByNo('QTS-OPP-HCE-OBS-000002')).status]);
note('API: Closed + blank status + productDisposition change -> existing Closed rule (400), still Closed',
    [(await api('PUT', `/api/obs/${closedObs.id}`, { status: '', productDisposition: 'Rework' })).status, (await obsByNo('QTS-OPP-HCE-OBS-000002')).status]);
note('API: Closed -> Void together with an attachments change (not a reopen) -> refused, still Closed',
    [await api('PUT', `/api/obs/${closedObs.id}`, { status: 'Void', attachments: ['sneaked-in.pdf'] }), (await obsByNo('QTS-OPP-HCE-OBS-000002')).status]);
note('API: photoOrder after the refusals (Closed, Void)', [(await obsByNo('QTS-OPP-HCE-OBS-000002')).photoOrder, (await obsByNo('QTS-OPP-HCE-OBS-000003')).photoOrder]);

// ══ 4. Reorder on an Open OBS: ↓ on Before 1, save, the pairs and the print follow ══════════════
await openObs('QTS-OPP-FSW-OBS-000003'); await photosTab();
note('Open 3/3 tab before reorder', (await tabPairs()).map(p => p.names.join(' | ')));
await modal().locator('[data-photo-pair="1"] button[aria-label^="下移"]').first().click(); await page.waitForTimeout(400);
note('Open 3/3 tab after ↓ on Before 1 (unsaved)', (await tabPairs()).map(p => p.names.join(' | ')));
await modal().locator('button', { hasText: /^(儲存|Save)$/ }).first().click(); await page.waitForTimeout(2000);
note('Open 3/3 stored photoOrder', (await obsByNo('QTS-OPP-FSW-OBS-000003')).photoOrder);
await openObs('QTS-OPP-FSW-OBS-000003'); await photosTab();
const reordered = await tabPairs();
await modal().screenshot({ path: join(outDir, 'tab-reordered.png') });
note('Open 3/3 tab after save + reopen', reordered.map(p => p.names.join(' | ')));
const reprinted = await printPairs('QTS-OPP-FSW-OBS-000003', 'reordered-3-3.pdf');
note('Open 3/3 print pairs equal the reordered tab', JSON.stringify(reprinted.pairs.map(p => p.cells.map(c => c.src))) === JSON.stringify(reordered.map(p => p.cells)));

// ══ 5. Reopen a Closed OBS ═══════════════════════════════════════════════════════════════════════
await openObs('QTS-OPP-HCE-OBS-000002');
await modal().locator('[class*=tabButton]', { hasText: /驗證與結案/ }).first().click(); await page.waitForTimeout(400);
await modal().locator('[name=constructionEngineerApproval]').selectOption('Pending');
await photosTab();
note('Reopen pending (unsaved): still locked on the stored status', !!(await modal().locator('[data-obs-files-locked]').count()));
await modal().locator('button', { hasText: /^(儲存|Save)$/ }).first().click(); await page.waitForTimeout(2000);
await openObs('QTS-OPP-HCE-OBS-000002'); await photosTab();
note('Reopened after save: Photos tab controls', await controls());

// ══ 6. New photos: NEW, no ↑↓, hint ══════════════════════════════════════════════════════════════
await openObs('QTS-OPP-HCE-OBS-000001'); await photosTab();
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.setInputFiles('#obs-upload-before', { name: 'new-before.png', mimeType: 'image/png', buffer: png });
await page.waitForTimeout(500);
note('Pending NEW: tab pairs', (await tabPairs()).map(p => p.cells.map(c => (c === 'NEW' ? 'NEW' : c ? 'photo' : '—')).join(' | ')));
note('Pending NEW: controls (no ↑↓ on NEW; hint shown)', await controls());
await modal().screenshot({ path: join(outDir, 'tab-pending-new.png') });

// ══ 7. Close / void with file changes still pending: stopped before anything is written (BACKLOG "OBS close+upload 409") ══
const fileCount = async (id, category) => (await api('GET', `/api/files/by-entity?entity_type=obs&entity_id=${id}&category=${category}`)).body.length;
const toasts = () => page.locator('[data-sonner-toast]').allInnerTexts();
const saveAndWait = async () => { await modal().locator('button', { hasText: /^(儲存|Save)$/ }).first().click(); await page.waitForTimeout(2000); };
const closureTab = async () => { await modal().locator('[class*=tabButton]', { hasText: /驗證與結案/ }).first().click(); await page.waitForTimeout(400); };
const writes = [];
page.on('request', r => { if (r.method() !== 'GET' && r.url().includes('/api/')) writes.push(`${r.method()} ${new URL(r.url()).pathname}`); });

// 7a. Resolved (QE approved) + a pending Before photo, then approve CE (-> Closed): refused, nothing written
const resolved = await obsByNo('QTS-OPP-HCE-OBS-000001');
const defectBefore = await fileCount(resolved.id, 'defectPhoto');
await openObs('QTS-OPP-HCE-OBS-000001'); await photosTab();
await page.setInputFiles('#obs-upload-before', { name: 'close-pending.png', mimeType: 'image/png', buffer: png });
await closureTab();
await modal().locator('[name=constructionEngineerApproval]').selectOption('Approved');
writes.length = 0;
await saveAndWait();
note('7a close with a pending photo: toast', (await toasts()).filter(t => /先存檔/.test(t)));
note('7a close with a pending photo: no write request, status / files unchanged, modal still open',
    { writes: [...writes], status: (await obsByNo('QTS-OPP-HCE-OBS-000001')).status, defectFiles: await fileCount(resolved.id, 'defectPhoto'), defectBefore, modalOpen: await modal().isVisible() });
await modal().screenshot({ path: join(outDir, 'close-pending-refused.png') });

// 7b. the flow that works: save the photo first (still Resolved), then close in a second save
await openObs('QTS-OPP-HCE-OBS-000001'); await photosTab();
await page.setInputFiles('#obs-upload-before', { name: 'close-pending.png', mimeType: 'image/png', buffer: png });
await saveAndWait();
note('7b step 1 (no status change): photo uploaded, still Resolved', { status: (await obsByNo('QTS-OPP-HCE-OBS-000001')).status, defectFiles: await fileCount(resolved.id, 'defectPhoto') });
await openObs('QTS-OPP-HCE-OBS-000001'); await closureTab();
await modal().locator('[name=constructionEngineerApproval]').selectOption('Approved');
await saveAndWait();
note('7b step 2: closed', { status: (await obsByNo('QTS-OPP-HCE-OBS-000001')).status, defectFiles: await fileCount(resolved.id, 'defectPhoto') });

// 7c. Void with a pending photo, and with a photo removed (pending delete): refused, nothing written
const inprog = await obsByNo('QTS-OPP-FSW-OBS-000002');
await openObs('QTS-OPP-FSW-OBS-000002'); await photosTab();
await page.setInputFiles('#obs-upload-after', { name: 'void-pending.png', mimeType: 'image/png', buffer: png });
await closureTab();
await modal().getByText('作廢此觀察').click();
writes.length = 0;
await saveAndWait();
note('7c void with a pending photo: refused, nothing written', { toast: (await toasts()).filter(t => /再作廢/.test(t)), writes: [...writes], status: (await obsByNo('QTS-OPP-FSW-OBS-000002')).status });
await openObs('QTS-OPP-FSW-OBS-000002'); await photosTab();
await modal().locator('[data-photo-pair="1"] button[aria-label^="刪除"]').first().click(); await page.waitForTimeout(300);
await closureTab();
await modal().getByText('作廢此觀察').click();
writes.length = 0;
await saveAndWait();
note('7c void with a pending delete: refused, nothing written', { toast: (await toasts()).filter(t => /再作廢/.test(t)), writes: [...writes], status: (await obsByNo('QTS-OPP-FSW-OBS-000002')).status, defectFiles: await fileCount(inprog.id, 'defectPhoto') });

// 7d. Void without pending file changes: saved
await openObs('QTS-OPP-FSW-OBS-000002'); await closureTab();
await modal().getByText('作廢此觀察').click();
await saveAndWait();
note('7d void with no pending files: Void', (await obsByNo('QTS-OPP-FSW-OBS-000002')).status);

// 7e. a save that stays / goes Open with pending photos is not affected (the reopened 000002 from section 5 is Open)
const reopened = await obsByNo('QTS-OPP-HCE-OBS-000002');
const afterBefore = await fileCount(reopened.id, 'improvementPhoto');
await openObs('QTS-OPP-HCE-OBS-000002'); await photosTab();
await page.setInputFiles('#obs-upload-after', { name: 'open-pending.png', mimeType: 'image/png', buffer: png });
await saveAndWait();
note('7e Open save with a pending photo: uploaded, status unchanged', { status: (await obsByNo('QTS-OPP-HCE-OBS-000002')).status, improvementFiles: await fileCount(reopened.id, 'improvementPhoto'), afterBefore });

// 7f. closing in the same save as a photoOrder change is NOT refused (stored status is still open)
await openObs('QTS-OPP-HCE-OBS-000004'); await photosTab();
await modal().locator('[data-photo-pair="1"] button[aria-label^="下移"]').first().click(); await page.waitForTimeout(300);
await closureTab();
await modal().locator('[name=qualityEngineerApproval]').selectOption('Approved');
await modal().locator('[name=constructionEngineerApproval]').selectOption('Approved');
await saveAndWait();
const closedNow = await obsByNo('QTS-OPP-HCE-OBS-000004');
note('7f close + photoOrder change in one save: Closed with the new order', { status: closedNow.status, photoOrder: closedNow.photoOrder });

// ══ 8. Saved, but a file step failed: a photo deleted in that save does not come back on the Photos tab ═════════
// Open 3/3 (000003, reordered in section 4): delete Before 1 (✕) and add an attachment whose upload fails (500) -> "saved, a file step failed".
const four = await obsByNo('QTS-OPP-FSW-OBS-000003');
const defectBefore8 = await fileCount(four.id, 'defectPhoto');
await openObs('QTS-OPP-FSW-OBS-000003'); await photosTab();
const firstName = (await tabPairs())[0].names[0];
await modal().locator('[data-photo-pair="1"] button[aria-label^="刪除"]').first().click(); await page.waitForTimeout(300);
await page.setInputFiles('#attachment-upload-obs-attachments', { name: 'fail.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') });
await page.route('**/api/files/upload', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"detail":"forced failure"}' }));
await saveAndWait();
await page.unroute('**/api/files/upload');
const after8 = await tabPairs();
note('8 saved-incomplete: modal still open with the follow-up, the deleted photo is gone on the server and does NOT reappear on the tab', {
    modalOpen: await modal().isVisible(), defectFiles: await fileCount(four.id, 'defectPhoto'), defectBefore8, deletedName: firstName,
    tabBefore: after8.map(p => p.names[0]), reappeared: after8.some(p => p.names[0] === firstName),
});
await modal().screenshot({ path: join(outDir, 'saved-incomplete-no-reappear.png') });

// ══ 9. A new OBS: photos chosen before the first save show NEW and the hint ═══════════════════════════════════════
await page.goto(UI + '/obs'); await page.waitForTimeout(1200);
await page.locator('button', { hasText: /新增|Add/ }).first().click();
await modal().waitFor({ timeout: 10000 }); await page.waitForTimeout(500);
await photosTab();
await page.setInputFiles('#obs-upload-before', { name: 'new-obs.png', mimeType: 'image/png', buffer: png });
await page.waitForTimeout(400);
note('9 new OBS with a chosen photo: NEW cell, no ↑↓, hint shown', { pairs: (await tabPairs()).map(p => p.cells.map(c => (c === 'NEW' ? 'NEW' : c ? 'photo' : '—')).join(' | ')), controls: await controls() });

writeFileSync(join(outDir, 'browser-check.json'), JSON.stringify(results, null, 2));
await browser.close();
