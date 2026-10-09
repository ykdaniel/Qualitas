// Q-Workflow "improvement" checkpoint on server-verified photo evidence (2026-09-21) — REAL file API, real UI, no stub. Asserts; exits 1 on any failure.
// Isolated stack ONLY (the repository's own vite.config.js behind port 3099 is fine; nothing here needs the developer's servers):
//   cd backend
//   python scripts/verification/isolated_stack.py up --vite-script <script that serves the repo's vite.config.js on 3099 -> 8099> > stack.json
//   python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_qworkflow_photos.py | grep ^SEED > seed.out
//   REAL_PNG=<a real png> node ../react-app/tests-browser/qworkflow-photo.mjs stack.json seed.out
//   python scripts/verification/isolated_stack.py down --root <root>
import { chromium } from '../node_modules/playwright/index.mjs';
import { readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [stackFile, seedFile] = process.argv.slice(2);
const stack = JSON.parse(readFileSync(stackFile, 'utf8')), seed = JSON.parse(readFileSync(seedFile, 'utf8').replace(/^SEED\s+/, '')).cases;
const PNG_FILE = process.env.REAL_PNG;
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const UI = `http://127.0.0.1:${stack.vite_port}`, API = `http://127.0.0.1:${stack.backend_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };

const browser = await chromium.launch({ headless: true });
const uiContext = async lang => {
    const ctx = await browser.newContext({ viewport: { width: 1700, height: 1100 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(l => localStorage.setItem('language', l), lang);
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', 'qw_user'); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 }); await p.close();
    return ctx;
};
// ---- real API (separate context, direct to the backend) ---------------------------------------------------------------------------------
const actx = await browser.newContext();
await actx.request.post(API + '/api/auth/login', { form: { username: 'qw_user', password: PW } });
const H = { 'X-CSRF-Token': (await actx.cookies()).find(c => c.name === 'csrf_token')?.value };
const PNG = readFileSync(PNG_FILE), TXT = Buffer.from('plain text pretending to be a photo');
const up = async (id, cat, buf = PNG, name = 'p.png') => { const r = await actx.request.post(API + '/api/files/upload', { headers: H, multipart: { entity_type: 'ncr', entity_id: id, category: cat, files: { name, mimeType: 'image/png', buffer: buf } } }); const j = await r.json(); return r.status() === 200 ? { id: j[0].id, path: j[0].file_url.split('/api/files/download/')[1] } : { err: r.status() }; };
const put = (id, data) => actx.request.put(`${API}/api/ncr/${id}/`, { headers: H, data });
const closeTry = async id => { const r = await put(id, { status: 'Closed', closeoutDate: '2025-03-01' }); return r.status(); };
const flows = async () => (await actx.request.get(API + '/api/workflow/?limit=500')).json();
const imp = async caseId => { const w = (await flows()).find(x => x.noi_id === seed[caseId].noi); return { cp: w.checkpoints.find(c => c.key === 'improvement'), w }; };
const ncrIdx = (caseId, id) => seed[caseId].ncrs.indexOf(id);

// ══ A. the matrix through the real API: tracker verdict == the NCR closure's photo condition ═══════════════════════════════════════════
const A = await up(seed.A.ncrs[0], 'improvementPhoto');
await put(seed.B.ncrs[0], { improvementPhotos: ['totally-made-up'] });
await put(seed.C.ncrs[0], { improvementPhotos: [A.path] });
await up(seed.D.ncrs[0], 'defectPhoto');
const E = await up(seed.E.ncrs[0], 'improvementPhoto'); await actx.request.delete(`${API}/api/files/${E.id}`, { headers: H });
const E2 = await up(seed.E2.ncrs[0], 'improvementPhoto'); await actx.request.delete(`${API}/api/files/${E2.id}`, { headers: H }); await put(seed.E2.ncrs[0], { improvementPhotos: [E2.path] });
const F = await up(seed.F.ncrs[0], 'improvementPhoto'); unlinkSync(`${stack.root}/uploads/${F.path}`);
await up(seed.G.ncrs[0], 'improvementPhoto'); await put(seed.G.ncrs[0], { improvementPhotos: ['legacy-string'] });
await up(seed.H.ncrs[0], 'improvementPhoto', TXT, 'fake.png');
await up(seed.M.ncrs[0], 'improvementPhoto'); await put(seed.M.ncrs[1], { improvementPhotos: ['legacy-string'] }); await put(seed.M.ncrs[2], { status: 'Void' });
await up(seed.N.ncrs[0], 'improvementPhoto'); await up(seed.N.ncrs[1], 'improvementPhoto');
const EXPECT = { A: [true, null], B: [false, 'legacy_unverified'], C: [false, 'legacy_unverified'], D: [false, 'missing'], E: [false, 'missing'], E2: [false, 'legacy_unverified'], F: [false, 'invalid'], G: [true, null], H: [false, 'invalid'] };
for (const [k, [passes, reason]] of Object.entries(EXPECT)) {
  const { cp } = await imp(k); const rid = seed[k].ncrs[0];
  const verdictOk = passes ? (cp.state === 'done' && cp.blocking_ncr_id === null && cp.verified_count === 1) : (cp.state === 'current' && cp.blocking_ncr_id === rid && cp.blocking_reason === reason);
  const closure = await closeTry(rid);
  check(`API ${k}: tracker says ${passes ? 'pass' : 'block (' + reason + ')'} and the NCR closure's photo condition agrees (${closure})`, verdictOk && (closure === 200) === passes, JSON.stringify({ state: cp.state, reason: cp.blocking_reason, verified: cp.verified_count, closure }));
}
for (const k of ['I', 'J']) {                      // historical Closed
  const { cp, w } = await imp(k); const reason = k === 'I' ? 'legacy_unverified' : 'missing';
  check(`API ${k}: historical Closed passes on status, counted as UNVERIFIED with its real reason (${reason}), never as verified`, cp.state === 'done' && cp.verified_count === 0 && cp.unverified_count === 1 && cp.unverified_reasons[reason] === 1 && w.unverified_photo_count === 1, JSON.stringify(cp));
}
{ const { cp } = await imp('M'); const m1 = seed.M.ncrs[1];
  check('API M: every NCR must pass — the blocking link is the NCR with only an old string (NOT the one with the valid photo), the Void NCR is ignored', cp.state === 'current' && cp.blocking_ncr_id === m1 && cp.blocking_reason === 'legacy_unverified' && cp.verified_count === 1, JSON.stringify({ blk: ncrIdx('M', cp.blocking_ncr_id), r: cp.blocking_reason })); }
{ const { cp } = await imp('N'); check('API N: both NCRs have valid photos -> done, 2 verified', cp.state === 'done' && cp.verified_count === 2 && cp.blocking_ncr_id === null); }
{ const c0 = await closeTry(seed.M.ncrs[0]), c1 = await closeTry(seed.M.ncrs[1]); check('API M: closing follows the same photo rule (valid 200, old string 400)', c0 === 200 && c1 === 400, `${c0} ${c1}`); }
{ const { cp } = await imp('A'); check('API A: closed on a valid photo -> still done, verified NOW (1), not counted as unverified', cp.state === 'done' && cp.verified_count === 1 && cp.unverified_count === 0); }
{ const r = await put(seed.A.ncrs[0], { status: 'Open' }); const { cp } = await imp('A');
  check('API A reopened: the valid photo is still there -> stays done (not orange) and can be closed again', r.status() === 200 && cp.state === 'done' && cp.verified_count === 1 && (await closeTry(seed.A.ncrs[0])) === 200); }
for (const k of ['I', 'J']) {
  const r = await put(seed[k].ncrs[0], { status: 'Open' }); const { cp } = await imp(k); const reason = k === 'I' ? 'legacy_unverified' : 'missing'; const again = await closeTry(seed[k].ncrs[0]);
  check(`API ${k} reopened: the strict rule applies -> blocked (${reason}), re-closing is refused (${again}) — "Closed passes the tracker" did not loosen it`, r.status() === 200 && cp.state === 'current' && cp.blocking_reason === reason && cp.unverified_count === 0 && again === 400);
}

// ══ B. the tracker page in a real browser, zh and en ═════════════════════════════════════════════════════════════════════════════════════
const ncrRef = id => sql(`select documentNumber from ncr where id='${id}'`);
const rowFor = (p, caseId) => p.locator('tr', { hasText: seed[caseId].noiRef }).first();
const cell = (p, caseId) => rowFor(p, caseId).locator('td[data-checkpoint=improvement]');
async function tracker(ctx) { const p = await ctx.newPage(); await p.goto(UI + '/workflow'); await p.locator('tr td[data-checkpoint=improvement]').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(400); return p; }
const state = async (p, k) => { const cls = await cell(p, k).getAttribute('class'); return /done/.test(cls) ? 'done' : /current/.test(cls) ? 'current' : /pending/.test(cls) ? 'pending' : '?'; };
const title = async (p, k) => (await cell(p, k).getAttribute('title')) || '';
const pct = async (p, k) => (await rowFor(p, k).locator('td').last().innerText()).replace(/\s+/g, ' ').trim();

const zh = await uiContext('zh');
let p = await tracker(zh);
check('UI(zh) U (open NCR, nothing uploaded): the improvement cell is orange with the "no photo" hint', (await state(p, 'U')) === 'current' && /缺少改善照片/.test(await title(p, 'U')), await title(p, 'U'));
await p.close();
// the REAL upload through the UI: a plain save with the photo (verdict untouched), then the closing save
async function openNcr(page, id) { const ref = ncrRef(id); await page.goto(UI + '/dashboard'); await page.waitForTimeout(1200); await page.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref); await page.locator('[class*=modalContent]').first().waitFor({ timeout: 15000 }); await page.waitForTimeout(500); }
const save = page => page.locator('[class*=modalContent] button', { hasText: /^(儲存|儲存中\.\.\.)$/ }).first();
const gone = async page => { try { await page.locator('[class*=modalContent]').first().waitFor({ state: 'hidden', timeout: 10000 }); return true; } catch { return false; } };
const tab = async (page, label) => { await page.locator('[class*=modalContent] button', { hasText: label }).first().click(); await page.waitForTimeout(250); };
p = await zh.newPage(); const uid = seed.U.ncrs[0];
await openNcr(p, uid); await tab(p, '照片與附件'); await p.locator('#attachment-upload-ncr-improvement-photos').setInputFiles(PNG_FILE); await p.waitForTimeout(400);
await save(p).click(); const saved = await gone(p); await p.close();
check('UI U: the photo is uploaded through the real file API (one attachment row, NCR still Open)', saved && sql(`select count(*) from attachments where entity_id='${uid}' and category='improvementPhoto' and is_deleted=0`) === '1' && sql(`select status from ncr where id='${uid}'`) === 'Open');
p = await tracker(zh);
check('UI(zh) U after the upload: green, "目前照片已核對（1 筆）", no unverified mark or note', (await state(p, 'U')) === 'done' && /目前照片已核對（1 筆）/.test(await title(p, 'U')) && (await rowFor(p, 'U').locator('[data-testid=unverified-mark]').count()) === 0 && (await rowFor(p, 'U').locator('[data-testid=unverified-note]').count()) === 0, await title(p, 'U'));
await p.close();
p = await zh.newPage(); await openNcr(p, uid); await tab(p, '驗證與結案'); await p.locator('[class*=modalContent] [name=effectivenessVerified]').first().selectOption('Yes');
await save(p).click(); const closed = await gone(p); await p.close();
check('UI U: the closing save goes through (late closure) after the photo was stored by the earlier save', closed && sql(`select status from ncr where id='${uid}'`) === 'Closed');
p = await tracker(zh);
check('UI(zh) U closed: still green and VERIFIED now (the photo exists), not counted as unverified', (await state(p, 'U')) === 'done' && /目前照片已核對（1 筆）/.test(await title(p, 'U')) && (await rowFor(p, 'U').locator('[data-testid=unverified-mark]').count()) === 0);
// historical Closed rows (K: nothing on record, L: an old string only): pass on status, MARKED, never shown as verified
p = await tracker(zh);
for (const [k, why] of [['K', '無照片紀錄：1'], ['L', '僅舊格式路徑：1']]) {
  const kp = await imp(k);
  const mark = rowFor(p, k).locator('[data-testid=unverified-mark]'), note = rowFor(p, k).locator('[data-testid=unverified-note]');
  check(`UI(zh) ${k} (historical Closed): green, the cell is marked "依已結案狀態通過，照片未核對（1 筆）" with the reason "${why}", NOT "目前照片已核對"`,
    (await state(p, k)) === 'done' && /依已結案狀態通過，照片未核對（1 筆）/.test(await mark.innerText()) && (await title(p, k)).includes(why) && !/目前照片已核對/.test(await title(p, k)), await title(p, k));
  check(`UI(zh) ${k}: the percentage is the server's number (formula unchanged) and carries "含 1 筆未核對" whose tooltip says it does not mean all evidence is verified`,
    (await pct(p, k)).startsWith(`${kp.w.completion_percent}%`) && /含 1 筆未核對/.test(await note.innerText()) && /不代表全部證據都已驗證/.test((await note.getAttribute('title')) || ''), await pct(p, k));
}
// reopen R (historical Closed, old string): the strict rule -> orange with the actionable hint, and the click goes to THAT NCR
{
  const rid = seed.R.ncrs[0];
  check('UI(zh) R before reopening: green + marked unverified', (await state(p, 'R')) === 'done' && (await rowFor(p, 'R').locator('[data-testid=unverified-mark]').count()) === 1);
  check('R reopened through the API (200) and re-closing is refused (400): the old string does not count', (await put(rid, { status: 'Open' })).status() === 200 && (await closeTry(rid)) === 400);
  await p.reload(); await p.locator('tr td[data-checkpoint=improvement]').first().waitFor(); await p.waitForTimeout(400);
  check('UI(zh) R reopened: orange, hint "舊格式的照片路徑，無法對應到已儲存的檔案…重新上傳", the mark and the percentage note are gone', (await state(p, 'R')) === 'current' && /舊格式的照片路徑/.test(await title(p, 'R')) && /重新上傳/.test(await title(p, 'R')) && (await rowFor(p, 'R').locator('[data-testid=unverified-mark]').count()) === 0 && (await rowFor(p, 'R').locator('[data-testid=unverified-note]').count()) === 0, await title(p, 'R'));
  await cell(p, 'R').click(); await p.locator('[class*=modalContent]').first().waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
  const shown = await p.evaluate(r => [...document.querySelectorAll('[class*=modalContent] input')].some(x => x.value === r), ncrRef(rid));
  check('UI R: clicking the orange cell opens exactly the blocking NCR (its form shows its document number)', shown, p.url());
}
await p.close();
// English
const en = await uiContext('en');
p = await tracker(en);
check('UI(en) K: "Passed on Closed status, photos not verified (1)" and the note "1 unverified"', /Passed on Closed status, photos not verified \(1\)/.test(await rowFor(p, 'K').locator('[data-testid=unverified-mark]').innerText()) && /1 unverified/.test(await rowFor(p, 'K').locator('[data-testid=unverified-note]').innerText()));
check('UI(en) U: "Current photos verified (1)"', /Current photos verified \(1\)/.test(await title(p, 'U')), await title(p, 'U'));
check('UI(en) R (reopened): "Old-format photo path only … Upload the improvement photo again"', /Old-format photo path only/.test(await title(p, 'R')) && /Upload the improvement photo again/.test(await title(p, 'R')), await title(p, 'R'));
check('UI(en) D (wrong-category photo only): "No improvement photo"', /No improvement photo/.test(await title(p, 'D')), await title(p, 'D'));
check('UI(en) F (row exists, file missing): "cannot be used"', /cannot be used/.test(await title(p, 'F')), await title(p, 'F'));
await p.close();

// ══ C. the three endpoints agree (list / stats / needs-attention) and reading writes nothing ═══════════════════════════════════════════════
const dump = () => ['qworkflow', 'ncr', 'noi', 'itr', 'attachments', 'audit_logs'].map(t => execFileSync('sqlite3', ['-readonly', stack.db, `.dump ${t}`]).toString()).join('\n');
const d0 = dump();
p = await tracker(en); await p.close();                       // the tracker page itself, then the three endpoints
const listed = await flows(); const stats = await (await actx.request.get(API + '/api/workflow/stats')).json(); const attention = await (await actx.request.get(API + '/api/workflow/needs-attention?limit=50')).json();
check('the three endpoints agree: the buckets are the list\'s percentages, needs-attention rows are identical to the list rows (evidence fields included)',
  stats.total === listed.length && [['bucket_0_25', 0, 25], ['bucket_26_50', 26, 50], ['bucket_51_75', 51, 75], ['bucket_76_100', 76, 100]].every(([n, lo, hi]) => stats[n] === listed.filter(w => w.completion_percent >= lo && w.completion_percent <= hi).length)
  && attention.every(a => JSON.stringify(a) === JSON.stringify(listed.find(w => w.noi_id === a.noi_id))), JSON.stringify(stats));
check('reading (the tracker page + the three endpoints) wrote nothing: qworkflow / ncr / noi / itr / attachments / audit_logs are byte-identical', dump() === d0);

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
