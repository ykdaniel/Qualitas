// Attachment / Print business review — real browser, isolated stack (2026-09-24).
// Basic-acceptance pass on OSD's attachment+print implementation path (shared FileAttachment.tsx
// + routers/file_router.py, same mechanism NCR already has confirmed evidence for). Does NOT
// attempt to reproduce the old unscoped BACKLOG #23 report — that stays marked unreproduced.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent], [class*=modal]').first();

const reviewer = await login('osd_attachment_reviewer');
const IMG = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad/test_attachment.png';

// ══ 1. Upload (real screen, into an existing seeded OSD record) ═════════════════════════════════════
try {
    await reviewer.goto(UI + '/osd'); await reviewer.waitForTimeout(1200);
    note('rows visible on OSD list', await reviewer.locator('tr').allTextContents().then(a => a.join(' | ').slice(0, 400)));
    await reviewer.locator('tr', { hasText: 'QTS-APR-OSD-000001' }).first().click();
    await modal(reviewer).waitFor({ timeout: 10000 });
    await reviewer.waitForTimeout(500);
    // The general "attachment" category picker's real DOM id (FileAttachment.tsx prefixes
    // its `id` prop with "attachment-upload-") — not the defect/improvement photo pickers.
    const fileInput = reviewer.locator('#attachment-upload-osd-attachments');
    note('file input found', await fileInput.count());
    await fileInput.setInputFiles(IMG);
    await reviewer.waitForTimeout(500);
    // Save is a plain onClick button (type=button), not a form submit.
    const saveBtn = reviewer.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    note('Save button found after selecting a file', await saveBtn.count());
    await saveBtn.click();
    await reviewer.waitForTimeout(1500);
    const attRow = sql(`SELECT id, file_name, category FROM attachments WHERE entity_type='osd' AND entity_id='ap-osd-1' AND is_deleted=0;`);
    note('attachment persisted in DB after real-screen upload+save (id|file_name|category)', attRow);
} catch (e) { fail('1. Upload', e); }

// ══ 2. List: reopen the record and confirm the attachment is listed ═════════════════════════════════
try {
    await reviewer.goto(UI + '/osd'); await reviewer.waitForTimeout(1200);
    await reviewer.locator('tr', { hasText: 'QTS-APR-OSD-000001' }).first().click();
    await modal(reviewer).waitFor({ timeout: 10000 });
    await reviewer.waitForTimeout(800);
    const imgCount = await modal(reviewer).locator('img[alt="test_attachment.png"]').count();
    note('2. uploaded attachment appears in the list on reopen (image thumbnail present)', imgCount);
} catch (e) { fail('2. List on reopen', e); }

// ══ 3. Preview (click thumbnail -> ImagePreviewOverlay) ═════════════════════════════════════════════
try {
    const thumb = modal(reviewer).locator('img[alt="test_attachment.png"]').first();
    await thumb.click();
    await reviewer.waitForTimeout(500);
    const overlayImgCount = await reviewer.locator('img[src*="/api/files/download/"]').count();
    note('3. preview overlay shows an authenticated download-URL image', overlayImgCount);
    await reviewer.keyboard.press('Escape').catch(() => {});
    const closeBtn = reviewer.locator('body > div').last().locator('button').first();
    await closeBtn.click({ timeout: 3000 }).catch(() => {});
} catch (e) { fail('3. Preview', e); }

// ══ 4. Download: fetch the same authenticated URL directly and confirm real bytes come back ═════════
try {
    const dl = await reviewer.evaluate(async () => {
        const listRes = await fetch('/api/files/by-entity?entity_type=osd&entity_id=ap-osd-1', { credentials: 'include' });
        const list = await listRes.json();
        const target = list.find(a => a.file_name === 'test_attachment.png');
        if (!target) return { error: 'attachment not found via by-entity API', list };
        // file_url from the API is an ABSOLUTE URL on the backend's own host:port
        // (routers/file_router.py::_build_file_url uses request.base_url) — the frontend always
        // normalizes this to a relative path before fetching (services/api.ts::getAuthenticatedFileUrl)
        // so it resolves through the vite dev proxy instead of being a blocked cross-origin request.
        const relativeUrl = new URL(target.file_url).pathname;
        const res = await fetch(relativeUrl, { credentials: 'include' });
        const buf = await res.arrayBuffer();
        return { status: res.status, bytes: buf.byteLength, contentType: res.headers.get('content-type'), url: target.file_url };
    });
    note('4. direct download of the uploaded file', JSON.stringify(dl));
} catch (e) { fail('4. Download', e); }

// ══ 5. Delete: remove the attachment via the UI, confirm gone from DB ═══════════════════════════════
try {
    await reviewer.goto(UI + '/osd'); await reviewer.waitForTimeout(1000);
    await reviewer.locator('tr', { hasText: 'QTS-APR-OSD-000001' }).first().click();
    await modal(reviewer).waitFor({ timeout: 10000 });
    await reviewer.waitForTimeout(800);
    const deleteBtn = modal(reviewer).locator('img[alt="test_attachment.png"]').locator('xpath=ancestor::*[2]').locator('button').last();
    note('delete button found', await deleteBtn.count());
    await deleteBtn.click();
    await reviewer.waitForTimeout(1000);
    const saveBtn2 = reviewer.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn2.click();
    await reviewer.waitForTimeout(1200);
    const afterDelete = sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='osd' AND entity_id='ap-osd-1' AND is_deleted=0;`);
    note('5. attachments remaining (non-deleted) after real-screen delete+save (expect 0)', afterDelete);
} catch (e) { fail('5. Delete', e); }

// ══ 6. Print: trigger the print portal, confirm the print template mounts with real record data ═════
try {
    await reviewer.goto(UI + '/osd'); await reviewer.waitForTimeout(1000);
    await reviewer.locator('tr', { hasText: 'QTS-APR-OSD-000001' }).first().click();
    await modal(reviewer).waitFor({ timeout: 10000 });
    await reviewer.waitForTimeout(500);
    const printBtn = reviewer.locator('button', { hasText: /列印|Print/ }).first();
    note('print button found', await printBtn.count());
    await printBtn.click();
    await reviewer.waitForTimeout(600);
    const printPortalText = await reviewer.locator('body').innerText();
    note('6. print template mounted with the record\'s document number', printPortalText.includes('QTS-APR-OSD-000001'));
    note('6. print template mounted with the record\'s damage description', printPortalText.includes('8 units bent in transit'));
} catch (e) { fail('6. Print', e); }

await browser.close();
console.log('DONE');
