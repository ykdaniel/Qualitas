// ITP existing-attachment loading fix verification (2026-09-28). Confirms the fix: real
// (Attachment-table) files are now sourced live via entityType/entityId in ITPModals.tsx,
// instead of the always-truthy `attachments={formData.attachments || []}` prop that permanently
// blocked FileAttachment's auto-fetch. Legacy string attachments are unaffected (routed through
// the separate `legacyAttachments` prop the whole time). Real isolated backend throughout.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 600) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const SCRATCH = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad';
function makePng(path, r, g, b) {
    execFileSync('/opt/homebrew/bin/python3', ['-c', `
import struct, zlib
def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data))
w,h=2,2
raw=b''.join(bytes([0]) + bytes([${r},${g},${b}])*w for _ in range(h))
open('${path}','wb').write(b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
`]);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.goto(UI + '/login');
await page.fill('#email', 'save_attach_reviewer'); await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
async function openItpRowBySearch(refSuffix) {
    const searchInput = page.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(refSuffix);
    await page.waitForTimeout(700);
    await page.locator('tr', { hasText: refSuffix }).first().click({ timeout: 10000 });
}
function trackRequests(matchUrl) {
    const log = [];
    const handler = req => { if (req.url().includes(matchUrl)) log.push(`${req.method()} ${req.url().replace(UI, '')}`); };
    page.on('request', handler);
    return { log, stop: () => page.off('request', handler) };
}

// ── A. Real upload -> reopen visible -> download bytes match -> delete -> reopen gone ═══════════
try {
    const IMG = `${SCRATCH}/itp_a.png`;
    makePng(IMG, 200, 10, 10);
    const originalBytes = readFileSync(IMG).length;

    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000003');
    await modal(page).waitFor({ timeout: 10000 });
    let m = modal(page);
    await m.locator('#attachment-upload-attachment').setInputFiles(IMG);
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1500);
    note('Aa. modal closed after clean upload', await modal(page).count() === 0);

    // Fresh navigation + reopen — the real test of "reopen visible".
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000003');
    await modal(page).waitFor({ timeout: 10000 });
    m = modal(page);
    await page.waitForTimeout(700); // live entityType/entityId fetch
    const thumbCount = await m.locator('img[alt="itp_a.png"]').count();
    note('Ab. uploaded attachment now shown as an existing thumbnail on reopen (the fix)', thumbCount);

    const dl = await page.evaluate(async () => {
        const listRes = await fetch('/api/files/by-entity?entity_type=itp&entity_id=sat-itp-multidelete', { credentials: 'include' });
        const list = await listRes.json();
        const target = list.find(a => a.file_name === 'itp_a.png');
        if (!target) return { error: 'not found via by-entity API', list };
        const relativeUrl = new URL(target.file_url).pathname;
        const res = await fetch(relativeUrl, { credentials: 'include' });
        const buf = await res.arrayBuffer();
        return { id: target.id, status: res.status, bytes: buf.byteLength };
    });
    note('Ac. direct download of the uploaded file (bytes should match the original)', JSON.stringify(dl));
    note('Ac-check. original file size on disk', originalBytes);

    const delBtn = m.locator('img[alt="itp_a.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    await delBtn.click();
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('Ad. attachment is_deleted after real-screen delete', sql(`SELECT is_deleted FROM attachments WHERE id='${dl.id}';`));

    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000003');
    await modal(page).waitFor({ timeout: 10000 });
    m = modal(page);
    await page.waitForTimeout(700);
    note('Ae. deleted attachment no longer shown on reopen', await m.locator('img[alt="itp_a.png"]').count());
} catch (e) { fail('A. Real upload/reopen/download/delete', e); }

// ── B. Multi-delete: one succeeds, one fails — retry sends ONLY the failed id ═══════════════════
try {
    const IMG1 = `${SCRATCH}/itp_b1.png`, IMG2 = `${SCRATCH}/itp_b2.png`;
    makePng(IMG1, 10, 200, 10); makePng(IMG2, 10, 10, 200);
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000004');
    await modal(page).waitFor({ timeout: 10000 });
    let m = modal(page);
    await m.locator('#attachment-upload-attachment').setInputFiles([IMG1, IMG2]);
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1500);

    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000004');
    await modal(page).waitFor({ timeout: 10000 });
    m = modal(page);
    await page.waitForTimeout(700);
    note('Ba. both uploaded attachments visible on reopen', await m.locator('img[alt="itp_b1.png"], img[alt="itp_b2.png"]').count());
    const ids = sql(`SELECT id, file_name FROM attachments WHERE entity_type='itp' AND entity_id='sat-itp-uploadfail-delete' AND is_deleted=0;`);
    note('Bb. attachment ids in DB', ids);
    const [line1, line2] = ids.split('\n');
    const [keepId, keepName] = line1.split('|');
    const [failId, failName] = line2.split('|');

    const keepBtn = m.locator(`img[alt="${keepName}"]`).locator('xpath=ancestor::*[1]').locator('button').last();
    const failBtn = m.locator(`img[alt="${failName}"]`).locator('xpath=ancestor::*[1]').locator('button').last();
    await keepBtn.click(); await failBtn.click();
    await page.route(`**/api/files/${failId}`, route => route.request().method() === 'DELETE' ? route.abort('failed') : route.continue());
    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1200);
    note('Bc. after first attempt: keep is_deleted (expect 1)', sql(`SELECT is_deleted FROM attachments WHERE id='${keepId}';`));
    note('Bd. after first attempt: fail is_deleted (expect 0)', sql(`SELECT is_deleted FROM attachments WHERE id='${failId}';`));

    await page.unroute(`**/api/files/${failId}`);
    const track = trackRequests('/api/files/');
    await saveBtn.click();
    await page.waitForTimeout(1200);
    const deleteReqs = track.log.filter(l => l.startsWith('DELETE'));
    note('Be. DELETE requests fired on retry (expect ONLY the failed id)', JSON.stringify(deleteReqs));
    note('Bf. after retry: both is_deleted', sql(`SELECT id, is_deleted FROM attachments WHERE id IN ('${keepId}','${failId}');`));
    track.stop();
} catch (e) { fail('B. ITP multi-delete partial failure (real upload first)', e); }

// ── C. Upload succeeds, delete fails — retry does NOT re-upload; mid-retry field edit kept ══════
try {
    const IMG = `${SCRATCH}/itp_c1.png`, IMG2 = `${SCRATCH}/itp_c2.png`;
    makePng(IMG, 200, 200, 10);
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000005');
    await modal(page).waitFor({ timeout: 10000 });
    let m = modal(page);
    await m.locator('#attachment-upload-attachment').setInputFiles(IMG);
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1500);

    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000005');
    await modal(page).waitFor({ timeout: 10000 });
    m = modal(page);
    await page.waitForTimeout(700);
    const existingId = sql(`SELECT id FROM attachments WHERE entity_type='itp' AND entity_id='sat-itp-publish' AND is_deleted=0;`);
    const existingDeleteBtn = m.locator('img[alt="itp_c1.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    await existingDeleteBtn.click();
    makePng(IMG2, 10, 200, 200);
    await m.locator('#attachment-upload-attachment').setInputFiles(IMG2);
    await page.route(`**/api/files/${existingId}`, route => route.request().method() === 'DELETE' ? route.abort('failed') : route.continue());
    const uploadTrack = trackRequests('/api/files/upload');
    const descInput = m.locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::*[self::input or self::textarea][1]');
    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    note('Ca. upload fired once on first attempt', JSON.stringify(uploadTrack.log));
    note('Cb. old attachment still present (delete blocked)', sql(`SELECT is_deleted FROM attachments WHERE id='${existingId}';`));
    note('Cc. new attachment persisted', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='sat-itp-publish' AND file_name='itp_c2.png' AND is_deleted=0;`));

    // Mid-retry field edit: change description before retrying — must be saved, not skipped.
    await descInput.fill('C edited mid-retry');
    await page.unroute(`**/api/files/${existingId}`);
    uploadTrack.log.length = 0;
    await saveBtn.click();
    await page.waitForTimeout(1500);
    note('Cd. upload requests on retry (expect NONE — already-uploaded file must not resend)', JSON.stringify(uploadTrack.log));
    note('Ce. old attachment now deleted after retry', sql(`SELECT is_deleted FROM attachments WHERE id='${existingId}';`));
    note('Cf. mid-retry description edit actually saved', sql(`SELECT description FROM itp WHERE id='sat-itp-publish';`));
} catch (e) { fail('C. ITP upload-success/delete-fail retry with mid-retry edit', e); }

await browser.close();
console.log('DONE');
