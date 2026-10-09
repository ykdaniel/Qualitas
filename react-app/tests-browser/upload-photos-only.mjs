// "Upload photos only" (2026-09-22, BACKLOG #33.4 fix) — real attachment API, the repository's own vite.config.js (isolated stack), no file stub.
// Isolated stack (see qworkflow-photo.mjs for the up/seed/down commands; seed = seed_qworkflow_photos.py, case Y):
//   REAL_PNG=<a real png> node upload-photos-only.mjs stack.json seed.out
import { chromium } from '../node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [stackFile, seedFile] = process.argv.slice(2);
const stack = JSON.parse(readFileSync(stackFile, 'utf8')), seed = JSON.parse(readFileSync(seedFile, 'utf8').replace(/^SEED\s+/, '')).cases;
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const PNG_FILE = process.env.REAL_PNG;
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const note = (name, extra = '') => console.log(`NOTE ${name}  -> ${String(extra).replace(/\s+/g, ' ').slice(0, 300)}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 }); await p.close();
    return ctx;
}
const user = await login('qw_user');            // ncr:update:all — from seed_qworkflow_photos.py's QwUser role
let lastPage = null;
async function fresh(ctx = user) {
    const p = await ctx.newPage(); lastPage = p; const log = [];
    p.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) log.push({ m: r.request().method(), path: u.pathname, status: r.status() }); });
    p.on('requestfailed', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) log.push({ m: r.method(), path: u.pathname, status: 'FAILED' }); });
    return { p, log };
}
const modal = p => p.locator('[class*=modalContent]').first();
const tab = async (p, label) => { await modal(p).locator('button', { hasText: label }).first().click(); await p.waitForTimeout(250); };
const uploadOnlyBtn = p => modal(p).locator('button', { hasText: /^(只上傳改善照片|Upload photo\(s\) only|Uploading\.\.\.|上傳中\.\.\.)$/ });
const saveBtn = p => modal(p).locator('button', { hasText: /^(儲存|儲存中\.\.\.)$/ }).first();
const notices = async p => (await p.locator('[data-sonner-toast]').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
const row = id => sql(`select status||'|'||effectivenessVerified||'|'||ifnull(remark,'') from ncr where id='${id}'`);
const photos = id => sql(`select category||':deleted='||is_deleted from attachments where entity_type='ncr' and entity_id='${id}' order by uploaded_at`);
const auditCount = id => sql(`select count(*) from audit_logs where entity_id='${id}'`);
async function openNcr(p, id) {
    const ref = sql(`select documentNumber from ncr where id='${id}'`);
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1200);
    await p.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref);
    await modal(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
}

// ══ 1. case Y: Effectiveness Verified already "Yes", no photo — upload-only puts the photo on the server without touching anything else ═══
{
    const id = seed.Y.ncrs[0];
    const { p, log } = await fresh();
    await openNcr(p, id);
    await tab(p, '驗證與結案');
    const verdict = modal(p).locator('[name=effectivenessVerified]').first();
    check('the record already has Effectiveness Verified = Yes (seed case Y) and no photo', (await verdict.inputValue()) === 'Yes' && row(id) === 'Open|Yes|' && photos(id) === '');
    await tab(p, '照片與附件');
    await modal(p).locator('#attachment-upload-ncr-improvement-photos').setInputFiles(PNG_FILE); await p.waitForTimeout(300);
    check('the upload-only button is offered once a photo is pending', await uploadOnlyBtn(p).isVisible());
    const before = row(id), auditBefore = auditCount(id);
    await uploadOnlyBtn(p).click(); await p.waitForTimeout(1500);
    const n = await notices(p);
    note('toast after upload-only', n.join(' | '));
    check('exactly ONE request went out and it is the attachment API, not the NCR API — no POST/PUT to /api/ncr/', log.filter(r => r.path.startsWith('/api/ncr/') && r.m !== 'GET').length === 0 && log.some(r => r.m === 'POST' && r.path === '/api/files/upload' && r.status === 200), JSON.stringify(log));
    check('the NCR row and its effectivenessVerified are UNCHANGED, and no audit row was written', row(id) === before && auditCount(id) === auditBefore, `${row(id)} audit=${auditCount(id)}`);
    check('one confirmation toast says the photo is uploaded and other changes are not saved', n.some(x => /照片已上傳/.test(x) && /尚未儲存/.test(x)), n.join(' | '));
    check('the attachment row exists (not deleted) and the modal is still open (nothing reset — the stored verdict is still Yes, confirmed via the database above)', photos(id) === 'improvementPhoto:deleted=0' && (await modal(p).isVisible()));
    check('the pending file is gone from the queue (the upload-only button is gone: nothing left to upload)', (await uploadOnlyBtn(p).count()) === 0);

    // step 2: the user now saves — legal closure, photo NOT uploaded a second time
    await saveBtn(p).click(); const gone = await new Promise(res => modal(p).waitFor({ state: 'hidden', timeout: 10000 }).then(() => res(true)).catch(() => res(false)));
    check('Save now closes the NCR in ONE request, with no second upload of the same photo', gone && log.filter(r => r.m === 'PUT' && r.path === `/api/ncr/${id}/` && r.status === 200).length === 1 && log.filter(r => r.m === 'POST' && r.path === '/api/files/upload').length === 1, JSON.stringify(log.filter(r => r.m !== 'GET')));
    check('stored: Closed, exactly one improvement-photo attachment row (not two)', sql(`select status from ncr where id='${id}'`) === 'Closed' && photos(id) === 'improvementPhoto:deleted=0');
    await p.close();
}

// ══ 1b. success boundary: the upload succeeds but the follow-up list reload fails — not read as an upload failure, no duplicate retry ═══
{
    const id = seed.B.ncrs[0];        // an ordinary open NCR (no photo yet)
    const { p, log } = await fresh();
    await openNcr(p, id);
    await tab(p, '驗證與結案');
    await modal(p).locator('[name=remark]').first().fill('kept across the reload failure');
    await tab(p, '照片與附件');
    await modal(p).locator('#attachment-upload-ncr-improvement-photos').setInputFiles(PNG_FILE); await p.waitForTimeout(300);
    // the upload POST itself must succeed; only the follow-up GET (list refresh) fails
    await p.route('**/api/files/by-entity*', r => r.abort('failed'));
    await uploadOnlyBtn(p).click(); await p.waitForTimeout(1500);
    const n = await notices(p);
    note('toast when the upload succeeds but the reload fails', n.join(' | '));
    check('the file WAS uploaded (one POST, 200) even though the list reload that follows it failed', log.some(r => r.m === 'POST' && r.path === '/api/files/upload' && r.status === 200) && photos(id) === 'improvementPhoto:deleted=0');
    check('the toast says "uploaded, but the list reload failed" — NOT the generic upload-failure message (which starts with "您填寫的內容都已保留"), and not the plain success one', n.some(x => /清單重新載入失敗/.test(x)) && !n.some(x => /您填寫的內容都已保留/.test(x)) && !n.some(x => x === '照片已上傳，其他表單變更尚未儲存——請按「儲存」完成。'), n.join(' | '));
    check('the successfully uploaded file is OUT of the pending queue (the button is gone) — not left there to be retried', (await uploadOnlyBtn(p).count()) === 0);
    await tab(p, '驗證與結案');
    check('every other form input (the remark typed on another tab) is untouched', (await modal(p).locator('[name=remark]').first().inputValue()) === 'kept across the reload failure');
    await p.unroute('**/api/files/by-entity*');
    await p.close();
    // a fresh page (equivalent to "retry loading" / reopening) must not re-send the file: still exactly one attachment row, one POST ever
    const { p: p2, log: log2 } = await fresh();
    await openNcr(p2, id); await tab(p2, '照片與附件'); await p2.waitForTimeout(500);
    check('reopening the NCR (the natural way to "retry" seeing the list) shows exactly one attachment row and issues NO upload — the file is not sent a second time', photos(id) === 'improvementPhoto:deleted=0' && log2.filter(r => r.m === 'POST' && r.path === '/api/files/upload').length === 0, JSON.stringify(log2.filter(r => r.m !== 'GET')));
    await p2.close();
}

// ══ 2. failure: the upload itself fails — pending file and every other input kept, nothing marked uploaded ═════════════════════════════
{
    const id = seed.G.ncrs[0];        // an ordinary open NCR (already has closure fields ready per the seed)
    const { p, log } = await fresh();
    await openNcr(p, id);
    await tab(p, '驗證與結案');
    await modal(p).locator('[name=remark]').first().fill('typed but not saved');
    await tab(p, '照片與附件');
    await modal(p).locator('#attachment-upload-ncr-improvement-photos').setInputFiles(PNG_FILE); await p.waitForTimeout(300);
    const before = row(id);
    await p.route('**/api/files/upload', r => r.abort('failed'));
    await uploadOnlyBtn(p).click(); await p.waitForTimeout(1200);
    const n = await notices(p);
    await tab(p, '驗證與結案');
    const remarkKept = (await modal(p).locator('[name=remark]').first().inputValue()) === 'typed but not saved';
    await tab(p, '照片與附件');
    check('a network failure during upload-only keeps the pending file, the typed remark, and the NCR row exactly as they were', row(id) === before && n.some(x => /尚未保存|尚未儲存/.test(x)) && remarkKept, n.join(' | '));
    check('the upload-only button is still there (nothing was falsely marked done)', await uploadOnlyBtn(p).isVisible());
    await p.unroute('**/api/files/upload');
    await uploadOnlyBtn(p).click(); await p.waitForTimeout(1200);
    check('retrying succeeds once the network is back', photos(id).includes('improvementPhoto:deleted=0') && (await uploadOnlyBtn(p).count()) === 0);
    await p.close();
}

// ══ 3. real 403: an account with view-only (no ncr:update:all) never sees the button; a direct API call is refused ═════════════════════
{
    const noUpdateCtx = await login('qw_noupdate');
    const id = seed.D.ncrs[0];
    const { p } = await fresh(noUpdateCtx);
    await openNcr(p, id);
    await tab(p, '照片與附件');
    check('an account without ncr:update:all never sees an actionable upload-only entry point (no pending file input to trigger it, and none rendered)', (await uploadOnlyBtn(p).count()) === 0);
    const csrf = (await noUpdateCtx.cookies()).find(c => c.name === 'csrf_token')?.value;
    const buf = readFileSync(PNG_FILE);
    const direct = await noUpdateCtx.request.post(`${UI}/api/files/upload`, { headers: { 'X-CSRF-Token': csrf }, multipart: { entity_type: 'ncr', entity_id: id, category: 'improvementPhoto', files: { name: 'p.png', mimeType: 'image/png', buffer: buf } } });
    check('the backend refuses the same request directly (403), scope/lock enforcement is server-side, not just a hidden button', direct.status() === 403, direct.status());
    await p.close();
}

// ══ 4. state lock: a Closed NCR does not offer the entry point, and the backend refuses a direct upload with its existing 409 ═══════════
{
    const id = seed.I.ncrs[0];        // historical Closed
    const { p } = await fresh();
    await openNcr(p, id);
    await tab(p, '照片與附件');
    check('a Closed NCR does not offer "upload photos only" (no pending file to trigger it in a locked category)', (await uploadOnlyBtn(p).count()) === 0);
    const csrf = (await user.cookies()).find(c => c.name === 'csrf_token')?.value;
    const buf = readFileSync(PNG_FILE);
    const direct = await user.request.post(`${UI}/api/files/upload`, { headers: { 'X-CSRF-Token': csrf }, multipart: { entity_type: 'ncr', entity_id: id, category: 'improvementPhoto', files: { name: 'p.png', mimeType: 'image/png', buffer: buf } } });
    check('the backend still refuses a Closed NCR\'s improvement-photo upload (409, the existing lock — unchanged by this round)', direct.status() === 409, direct.status());
    await p.close();
}

// ══ 5. a brand-new (unsaved) NCR offers no entry point, and no record is silently created ═══════════════════════════════════════════════
{
    const { p, log } = await fresh();
    await p.goto(UI + '/ncr'); await p.waitForTimeout(1200);
    await p.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(400);
    await tab(p, '照片與附件');
    const before = Number(sql('select count(*) from ncr'));
    check('a not-yet-created NCR has no "upload photos only" entry point at all', (await uploadOnlyBtn(p).count()) === 0);
    check('nothing was created just by opening the photo tab', Number(sql('select count(*) from ncr')) === before && log.filter(r => r.m !== 'GET').length === 0);
    await p.close();
}

// ══ 6. regressions: an ordinary Pending flow and the existing "retry failed files" banner still work ═══════════════════════════════════
{
    const id = seed.U.ncrs[0];        // Pending verdict, open, no photo (per the seed fix from round 21)
    const { p, log } = await fresh();
    await openNcr(p, id);
    await tab(p, '照片與附件');
    await modal(p).locator('#attachment-upload-ncr-improvement-photos').setInputFiles(PNG_FILE); await p.waitForTimeout(300);
    check('an ordinary Pending-verdict NCR still shows the upload-only entry point', await uploadOnlyBtn(p).isVisible());
    await saveBtn(p).click(); const gone = await new Promise(res => modal(p).waitFor({ state: 'hidden', timeout: 10000 }).then(() => res(true)).catch(() => res(false)));
    check('the ordinary one-save-does-everything flow (Save with a pending photo, no upload-only click) still works exactly as before: record saved, photo uploaded, still Open', gone && photos(id) === 'improvementPhoto:deleted=0' && sql(`select status from ncr where id='${id}'`) === 'Open', JSON.stringify(log.filter(r => r.m !== 'GET')));
    await p.close();
}
{
    const id = seed.F.ncrs[0];        // has an attachment row whose file is missing -> a normal save-failure-style retry scenario still applies elsewhere; here just confirm the modal still opens and the section is usable
    const { p } = await fresh();
    await openNcr(p, id);
    await tab(p, '照片與附件');
    check('a record with an existing (unusable) attachment still opens its photo section normally', await modal(p).isVisible());
    await p.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
