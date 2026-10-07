// PQP/ITP partial-save + attachment-retry follow-up verification (2026-09-28). Real isolated
// backend throughout; "forced failure" is explicitly labeled per case as either a REAL backend
// business-rule rejection or a Playwright network-level interception (never a stubbed response).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 600) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

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

function trackRequests(matchUrl) {
    const log = [];
    const handler = req => {
        if (req.url().includes(matchUrl)) log.push(`${req.method()} ${req.url().replace(UI, '')}`);
    };
    page.on('request', handler);
    return { log, stop: () => page.off('request', handler) };
}

// ITP's list defaults to a small page size (server-side search is the reliable way to bring a
// specific record into view regardless of how many other rows exist ahead of it).
async function openItpRowBySearch(refSuffix) {
    const searchInput = page.locator('input[placeholder="搜尋 ITP..."]').first();
    const found = await searchInput.count();
    if (found === 0) {
        console.log('OBSERVED openItpRowBySearch: search input NOT found, all placeholders on page ->',
            await page.locator('input').evaluateAll(els => els.map(e => e.placeholder)).then(a => a.join(',')));
    }
    await searchInput.fill(refSuffix);
    await page.waitForTimeout(700); // debounced search (500ms) + refetch
    const rowCount = await page.locator('tr', { hasText: refSuffix }).count();
    console.log(`OBSERVED openItpRowBySearch: rows matching "${refSuffix}" after search ->`, rowCount);
    await page.locator('tr', { hasText: refSuffix }).first().click({ timeout: 10000 });
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// PQP
// ════════════════════════════════════════════════════════════════════════════════════════════

// ── P1. Real backend rejection (Approved-locked title) — input retained ═══════════════════════
try {
    const track = trackRequests('/api/pqp/sat-pqp-locked');
    await page.goto(UI + '/pqp'); await page.waitForTimeout(1000);
    await page.locator('tr', { hasText: 'QTS-SAR-PQP-000001' }).first().click({ timeout: 10000 });
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    note('P1-diag. modal body snippet', await m.locator('body, div').first().innerText().catch(() => '(n/a)').then(t => String(t).slice(0, 300)));
    note('P1-diag. labels in modal', await m.locator('label').allTextContents().then(a => a.join(' || ').slice(0, 400)));
    const titleInput = m.locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
    note('P1-diag. title input found', await titleInput.count());
    await titleInput.fill('Attempted edit (real rejection)');
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('P1a. request/response sequence', JSON.stringify(track.log));
    note('P1b. modal still open after REAL backend rejection', await modal(page).count() > 0);
    note('P1c. title input still holds the typed text', await titleInput.inputValue());
    note('P1d. error message shown mentions the real backend reason (Approved lock)', await m.locator('[class*=saveError]').innerText());
    note('P1e. DB title unchanged', sql(`SELECT title FROM pqp WHERE id='sat-pqp-locked';`));
    track.stop();
} catch (e) { fail('P1. PQP real backend rejection', e); }

// ── P2. Simulated network failure — input retained ═════════════════════════════════════════════
try {
    await page.goto(UI + '/pqp'); await page.waitForTimeout(1000);
    await page.locator('tr', { hasText: 'QTS-SAR-PQP-000002' }).first().click();
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    const titleInput = m.locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
    await titleInput.fill('Attempted edit (network failure)');
    let block = true;
    await page.route('**/api/pqp/sat-pqp-network', route => { if (block && route.request().method() === 'PUT') route.abort('failed'); else route.continue(); });
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('P2a. modal still open after NETWORK-LEVEL interception (not a backend rejection)', await modal(page).count() > 0);
    note('P2b. title input still holds the typed text', await titleInput.inputValue());
    note('P2c. DB title unchanged', sql(`SELECT title FROM pqp WHERE id='sat-pqp-network';`));
    block = false;
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('P2d. after unblocking, DB title updated by the retry', sql(`SELECT title FROM pqp WHERE id='sat-pqp-network';`));
    await page.unroute('**/api/pqp/sat-pqp-network');
} catch (e) { fail('P2. PQP simulated network failure', e); }

// ── P3. Multi-delete: one succeeds, one fails — retry sends ONLY the failed id ═════════════════
try {
    await page.goto(UI + '/pqp'); await page.waitForTimeout(1000);
    await page.locator('tr', { hasText: 'QTS-SAR-PQP-000003' }).first().click();
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    await page.waitForTimeout(500);
    const keepBtn = m.locator('img[alt="keep.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    const failBtn = m.locator('img[alt="fail.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    await keepBtn.click(); await failBtn.click();
    await page.route('**/api/files/sat-pqp-md-fail', route => route.request().method() === 'DELETE' ? route.abort('failed') : route.continue());
    const recordTrack = trackRequests('/api/pqp/sat-pqp-multidelete');
    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1200);
    note('P3a. after first attempt: keep is_deleted (expect 1)', sql(`SELECT is_deleted FROM attachments WHERE id='sat-pqp-md-keep';`));
    note('P3b. after first attempt: fail is_deleted (expect 0)', sql(`SELECT is_deleted FROM attachments WHERE id='sat-pqp-md-fail';`));
    note('P3c. partial-save message shown', await m.locator('[class*=saveError]').innerText());

    await page.unroute('**/api/files/sat-pqp-md-fail');
    const track = trackRequests('/api/files/sat-pqp-md-');
    recordTrack.log.length = 0; // only care about the retry's own requests for this check
    await saveBtn.click();
    await page.waitForTimeout(1200);
    note('P3d. DELETE requests fired on retry (expect ONLY sat-pqp-md-fail, NOT sat-pqp-md-keep again)', JSON.stringify(track.log));
    note('P3d2. PUT to the record itself fired on this UNEDITED retry (expect NONE — boundary: unchanged payload must not re-write the record)', JSON.stringify(recordTrack.log));
    note('P3e. after retry: both is_deleted', sql(`SELECT id, is_deleted FROM attachments WHERE id IN ('sat-pqp-md-keep','sat-pqp-md-fail');`));
    note('P3f. modal closed after full success', await modal(page).count() === 0);
    track.stop(); recordTrack.stop();
} catch (e) { fail('P3. PQP multi-delete partial failure', e); }

// ── P4. Upload succeeds, delete fails — retry does NOT re-upload ══════════════════════════════
try {
    const IMG = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad/pqp_test_img.png';
    execFileSync('/opt/homebrew/bin/python3', ['-c', `
import struct, zlib
def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data))
w,h=2,2
raw=b''.join(b'\\x00'+b'\\xff\\x00\\x00'*w for _ in range(h))
open('${IMG}','wb').write(b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
`]);

    await page.goto(UI + '/pqp'); await page.waitForTimeout(1000);
    await page.locator('tr', { hasText: 'QTS-SAR-PQP-000004' }).first().click();
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    await page.waitForTimeout(500);
    const existingDeleteBtn = m.locator('img[alt="existing.png"]').locator('xpath=ancestor::*[1]').locator('button').last();
    await existingDeleteBtn.click();
    const fileInput = m.locator('input[type=file]').first();
    await fileInput.setInputFiles(IMG);
    await page.route('**/api/files/sat-pqp-ud-existing', route => route.request().method() === 'DELETE' ? route.abort('failed') : route.continue());
    const uploadTrack = trackRequests('/api/files/upload');
    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    note('P4a. upload request fired once on first attempt', JSON.stringify(uploadTrack.log));
    note('P4b. new attachment persisted despite the delete failure', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='pqp' AND entity_id='sat-pqp-uploadfail-delete' AND file_name LIKE 'pqp_test_img%' AND is_deleted=0;`));
    note('P4c. old attachment still present (delete blocked)', sql(`SELECT is_deleted FROM attachments WHERE id='sat-pqp-ud-existing';`));
    note('P4d. partial-save message shown', await m.locator('[class*=saveError]').innerText());

    await page.unroute('**/api/files/sat-pqp-ud-existing');
    uploadTrack.log.length = 0;
    await saveBtn.click();
    await page.waitForTimeout(1200);
    note('P4e. upload requests fired on RETRY (expect NONE — already-uploaded file must not resend)', JSON.stringify(uploadTrack.log));
    note('P4f. old attachment now deleted after retry', sql(`SELECT is_deleted FROM attachments WHERE id='sat-pqp-ud-existing';`));
    uploadTrack.stop();
} catch (e) { fail('P4. PQP upload-succeeds/delete-fails retry', e); }

// ── P5. Record succeeds, upload fails — partial message, retry reuses same record, mid-retry edit kept ═
try {
    const IMG = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad/pqp_test_img.png';
    await page.goto(UI + '/pqp'); await page.waitForTimeout(1000);
    await page.locator('button', { hasText: /新增品質計劃|Add New Quality Plan/ }).first().click();
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    const titleInput = m.locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
    await titleInput.fill('P5 create then upload-fail');
    const contractorSelect = m.locator('label', { hasText: '承包商' }).first().locator('xpath=following-sibling::select[1]');
    await contractorSelect.selectOption({ label: 'Save Attach Review Co' });
    const fileInput = m.locator('input[type=file]').first();
    await fileInput.setInputFiles(IMG);
    let blockUpload = true;
    await page.route('**/api/files/upload', route => (blockUpload && route.request().method() === 'POST') ? route.abort('failed') : route.continue());
    const postTrack = trackRequests('/api/pqp/');
    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    note('P5a. POST/PUT to /api/pqp/ during first attempt (expect exactly one POST, no PUT)', JSON.stringify(postTrack.log));
    note('P5b. record created in DB', sql(`SELECT COUNT(*) FROM pqp WHERE title='P5 create then upload-fail';`));
    note('P5c. partial-save message distinguishes from "not saved"', await m.locator('[class*=saveError]').innerText());
    note('P5d. modal still open', await modal(page).count() > 0);

    // Mid-retry edit: change the title again before retrying — this new edit must be saved, not
    // dropped just to make the retry simpler.
    await titleInput.fill('P5 edited again before retry');
    blockUpload = false;
    postTrack.log.length = 0;
    await saveBtn.click();
    await page.waitForTimeout(1500);
    note('P5e. POST/PUT to /api/pqp/ during retry (expect exactly one PUT, NOT another POST)', JSON.stringify(postTrack.log));
    note('P5f. exactly one record with this title-family exists (no duplicate create)', sql(`SELECT COUNT(*) FROM pqp WHERE title LIKE 'P5 %';`));
    note('P5g. the mid-retry edit was actually saved', sql(`SELECT title FROM pqp WHERE title LIKE 'P5 %';`));
    note('P5h. modal closed after full success', await modal(page).count() === 0);
    postTrack.stop();
} catch (e) { fail('P5. PQP record-saved/upload-fails, mid-retry edit', e); }

// ════════════════════════════════════════════════════════════════════════════════════════════
// ITP
// ════════════════════════════════════════════════════════════════════════════════════════════

// ── I1. Real backend rejection ("Rejected" status has no WorkflowEngine transition) ═══════════
try {
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000001');
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    // .filter({has:...}) on option value is unreliable when multiple <select> elements exist in
    // the same modal (established pitfall this session) — scan every select's option-value list
    // and pick the one that actually offers "Rejected" instead.
    const allSelects = m.locator('select');
    const optionValueLists = await allSelects.evaluateAll(nodes => nodes.map(n => Array.from(n.options).map(o => o.value)));
    const statusIdx = optionValueLists.findIndex(vals => vals.includes('Rejected'));
    note('I1-diag. selects found, status select index', `${optionValueLists.length} selects, status at index ${statusIdx}`);
    await allSelects.nth(statusIdx).selectOption('Rejected');
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('I1a. modal still open after REAL backend rejection (invalid status transition)', await modal(page).count() > 0);
    note('I1b. DB status unchanged', sql(`SELECT status FROM itp WHERE id='sat-itp-reject';`));
} catch (e) { fail('I1. ITP real backend rejection', e); }

// ── I2. Simulated network failure — input + isDirty retained ═══════════════════════════════════
try {
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000002');
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    const descInput = m.locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::*[self::input or self::textarea][1]');
    await descInput.fill('Attempted edit (network failure)');
    let block = true;
    await page.route('**/api/itp/sat-itp-network/', route => (block && route.request().method() === 'PUT') ? route.abort('failed') : route.continue());
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('I2a. modal still open', await modal(page).count() > 0);
    note('I2b. description input retained', await descInput.inputValue());
    note('I2c. DB description unchanged', sql(`SELECT description FROM itp WHERE id='sat-itp-network';`));
    const closeBtn = m.locator('button', { hasText: '×' }).first();
    await closeBtn.click();
    await page.waitForTimeout(500);
    note('I2d. closing after failure still asks to discard (isDirty preserved)', await page.locator('text=/未儲存的變更|Unsaved Changes/').count() > 0);
    await page.locator('button', { hasText: /留下並儲存|Stay/ }).first().click().catch(() => {});
    block = false;
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('I2e. after unblocking, DB description updated by the retry', sql(`SELECT description FROM itp WHERE id='sat-itp-network';`));
    await page.unroute('**/api/itp/sat-itp-network/');
} catch (e) { fail('I2. ITP simulated network failure', e); }

// ── I2b. Boundary: main record succeeds, DETAIL write fails — retry must NOT skip the detail ════
// lastWrittenPayloadKey is only set from onSave()'s return value, which is never reached if
// updateITPDetail() throws — so a retry after a detail-only failure must recompute a key that
// does not match anything recorded, and therefore must NOT set skipRecordWrite, and must
// re-attempt the detail write. Real screen + real backend, not just the pure-function unit test.
try {
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000006');
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    const descInput = m.locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::*[self::input or self::textarea][1]');
    await descInput.fill('I2b main ok, detail blocked');
    let blockDetail = true;
    await page.route('**/api/itp/sat-itp-detailfail/detail', route => (blockDetail && route.request().method() === 'PUT') ? route.abort('failed') : route.continue());
    const mainTrack = trackRequests('/api/itp/sat-itp-detailfail/');
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('I2b-a. requests fired on the first attempt (expect the main PUT to have gone through, detail blocked)', JSON.stringify(mainTrack.log));
    note('I2b-b. DB description after first attempt (expect the main write DID succeed)', sql(`SELECT description FROM itp WHERE id='sat-itp-detailfail';`));
    note('I2b-c. modal still open (Phase 1 throwing on the detail step keeps the form open, same as any other Phase-1 failure)', await modal(page).count() > 0);

    // Retry, still blocked — if the boundary held, this must fire BOTH the main PUT and the
    // detail PUT again (the combined key never got recorded, since onSave never returned last
    // time), not silently skip either one.
    mainTrack.log.length = 0;
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('I2b-d. requests fired on the SECOND attempt, still blocked (expect main PUT sent again, not skipped)', JSON.stringify(mainTrack.log));

    // Now unblock and retry once more — the detail write should finally go through.
    blockDetail = false;
    mainTrack.log.length = 0;
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1200);
    note('I2b-e. requests fired once unblocked (expect both main and detail PUT)', JSON.stringify(mainTrack.log));
    note('I2b-f. modal closed after full success', await modal(page).count() === 0);
    await page.unroute('**/api/itp/sat-itp-detailfail/detail');
} catch (e) { fail('I2b. ITP main-succeeds/detail-fails boundary', e); }

// ── I3. Light confirmation that the ITP existing-attachment display fix still holds ═════════════
// Originally a diagnostic proving the display gap (ITPModals.tsx passed an always-truthy
// `attachments={formData.attachments || []}`, permanently blocking FileAttachment's
// entityType/entityId auto-fetch — the real fix lives in ITPModals.tsx now, using
// `legacyAttachments` for the string-only legacy data and letting the live fetch source real
// attachments). Kept here as a one-shot regression check on top of this batch's other fixes; the
// full lifecycle (upload/reopen/download-bytes/delete, multi-delete partial retry,
// upload-success+delete-fail retry, mid-retry edit) is covered separately and in more depth by
// tests-browser/itp-attachment-loading-review.mjs.
try {
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    const IMG = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad/pqp_test_img.png';
    await openItpRowBySearch('QTS-SAR-ITP-000003');
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    const fileInput = m.locator('#attachment-upload-attachment');
    await fileInput.setInputFiles(IMG);
    await m.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await page.waitForTimeout(1500);
    const uploadedId = sql(`SELECT id FROM attachments WHERE entity_type='itp' AND entity_id='sat-itp-multidelete' ORDER BY rowid DESC LIMIT 1;`);
    note('I3-diag(a). real upload succeeded via the screen, attachment id', uploadedId);
    // Re-open the SAME record fresh (full navigation, not just closing the modal) and look for it.
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000003');
    await modal(page).waitFor({ timeout: 10000 });
    const m2 = modal(page);
    await page.waitForTimeout(500);
    const thumbCount = await m2.locator('img[alt="pqp_test_img.png"]').count();
    note('I3. just-uploaded attachment shown as an existing thumbnail on reopen (expect 1 — fix holds)', thumbCount);
} catch (e) { fail('I3. ITP existing-attachment display (regression check)', e); }

// ── I5. Publish: record saved (rev bumped), attachment fails — retry does not double-bump ═════
// Uses an UPLOAD failure (a fresh pending file, not an "existing" attachment) rather than a
// delete failure — per the I3-diag finding above, ITP's edit modal has no reachable path to
// display/delete an existing real attachment at all, but uploading a NEW pending file is
// unaffected by that gap (it's local File-object state, never round-tripped through
// formData.attachments).
try {
    const IMG = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad/pqp_test_img.png';
    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000005');
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    await page.waitForTimeout(500);
    const fileInput = m.locator('#attachment-upload-attachment');
    await fileInput.setInputFiles(IMG);
    let blockUpload = true;
    await page.route('**/api/files/upload', route => (blockUpload && route.request().method() === 'POST') ? route.abort('failed') : route.continue());
    const putTrack = trackRequests('/api/itp/sat-itp-publish/');
    await m.locator('button', { hasText: 'Publish' }).first().click();
    await page.waitForTimeout(1500);
    note('I5a. PUT requests during first Publish attempt', JSON.stringify(putTrack.log));
    note('I5b. rev/status after first Publish (expect Rev2.0/Approved — Phase 1 succeeded)', sql(`SELECT rev, status FROM itp WHERE id='sat-itp-publish';`));
    note('I5c. no attachment persisted yet (upload blocked)', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='sat-itp-publish';`));

    blockUpload = false;
    putTrack.log.length = 0;
    await m.locator('button', { hasText: 'Publish' }).first().click();
    await page.waitForTimeout(1500);
    note('I5d. PUT requests during retry Publish', JSON.stringify(putTrack.log));
    note('I5e. rev/status after retry (expect STILL Rev2.0/Approved — no double bump to Rev3.0)', sql(`SELECT rev, status FROM itp WHERE id='sat-itp-publish';`));
    note('I5f. exactly one attachment now persisted (no duplicate upload)', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='sat-itp-publish';`));
    await page.unroute('**/api/files/upload');
} catch (e) { fail('I5. ITP Publish partial-failure retry (upload)', e); }

await browser.close();
console.log('DONE');
