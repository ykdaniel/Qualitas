// Browser regression for the NCR / OBS / NOI save chain (2026-09-20): a refused or half-finished save must not look like a success.
//
// Not part of `npm test` (needs a running stack and Playwright, which is NOT a declared dependency — install it separately).
// Run ONLY against an isolated stack — never against a development or production server:
//
//   cd backend
//   python scripts/verification/isolated_stack.py up --vite-script <a script that starts Vite on 3099 proxying /api to 8099> > stack.json
//   python scripts/verification/isolated_stack.py seed --root <root from stack.json> --script scripts/verification/seed_save_flow.py | grep ^SEED > seed.out
//   node ../react-app/tests-browser/save-failure.mjs stack.json seed.out
//   python scripts/verification/isolated_stack.py down --root <root>
//
// Records are written through the real backend (isolated database). Most scenarios replace the FILE endpoints (/api/files/**) with an
// in-memory stub, because they need to make uploads and deletes FAIL on demand. Scenarios 11 and 16 use contexts WITHOUT the stub: the
// real file API runs and stores into the isolated stack's own upload root (QUALITAS_UPLOAD_ROOT = <run dir>/uploads, set by
// tests/isolation.py). So the stubbed scenarios prove the CLIENT's file handling; 11 and 16 prove real storage, permissions and locks.
import { chromium } from '../node_modules/playwright/index.mjs';
import { readFileSync, existsSync, readFileSync as readBytes } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [stackFile, seedFile] = process.argv.slice(2);
if (!stackFile || !seedFile) { console.error('usage: node save-failure.mjs stack.json seed.out'); process.exit(2); }
const stack = JSON.parse(readFileSync(stackFile, 'utf8'));
const seed = JSON.parse(readFileSync(seedFile, 'utf8').replace(/^SEED\s+/, ''));
const BASE = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', '-cmd', '.timeout 15000', stack.db, q]).toString().trim();
// The only write path to the database: refuses anything that is not the isolated stack's own database.
const sqlWrite = q => { if (!/qualitas-manual-/.test(stack.db)) throw new Error('refusing to write to a database outside an isolated stack'); return execFileSync('sqlite3', ['-cmd', '.timeout 15000', stack.db, q]).toString().trim(); };

let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const note = (name, extra = '') => console.log(`NOTE ${name}  -> ${String(extra).replace(/\s+/g, ' ').slice(0, 400)}`);

// ---- module adapters -------------------------------------------------------------------------------------------------------------
const named = key => (p) => p.locator(`[class*=modalContent] [name=${key}]`).first();
const labelled = lab => (p) => p.locator('[class*=modalContent] label', { hasText: lab }).first().locator('..').locator('input, textarea, select').first();
const MODS = {
    ncr: {
        label: 'NCR', path: '/ncr', ref: 'documentNumber', col: 'subject', table: 'ncr', subj: i => `NCR SUBJ ${i}`, listGet: '/api/ncr/', hasReload: true,
        put: id => `/api/ncr/${id}/`, post: '/api/ncr/', del: id => `/api/ncr/${id}/`, apiGlob: '**/api/ncr/**',
        f: { subject: named('subject'), date: named('raiseDate'), a: named('raisedBy'), b: named('foundBy'), c: named('foundLocation') },
        snap: ['subject', 'date', 'a', 'b', 'c'], attachTab: '照片與附件', file: '#attachment-upload-ncr-attachments', fileDefect: '#attachment-upload-ncr-defect-photos', basicTab: '基本資訊',
    },
    obs: {
        label: 'OBS', path: '/obs', ref: 'documentNumber', col: 'subject', table: 'obs', subj: i => `OBS SUBJ ${i}`, listGet: '/api/obs/', hasReload: false,
        put: id => `/api/obs/${id}`, post: '/api/obs/', del: id => `/api/obs/${id}`, apiGlob: '**/api/obs/**',
        f: { subject: named('subject'), date: named('raiseDate'), a: named('raisedBy'), b: named('foundBy'), c: named('foundLocation') },
        snap: ['subject', 'date', 'a', 'b', 'c'], attachTab: '照片與附件', file: '#attachment-upload-obs-attachments', fileDefect: '#attachment-upload-obs-defect-photos', basicTab: '基本資訊',
    },
    noi: {
        label: 'NOI', path: '/noi', ref: 'referenceNo', col: 'package', table: 'noi', subj: i => `NOI SUBJ ${i}`, listGet: '/api/noi/', hasReload: true,
        put: id => `/api/noi/${id}/`, post: '/api/noi/', del: id => `/api/noi/${id}/`, apiGlob: '**/api/noi/**',
        f: { subject: labelled('主旨'), date: labelled('發佈日期'), a: labelled('聯絡人'), b: labelled('電話'), c: labelled('事件編號') },
        snap: ['subject', 'date', 'a', 'b', 'c'], attachTab: null, file: '#attachment-upload-attachment', basicTab: null,
    },
};
const idOf = (mod, i) => seed[mod][i];          // 0-based
const rowSubject = (mod, i) => MODS[mod].subj(i + 1);
const modalOf = p => p.locator('[class*=modalContent]').first();
const saveBtn = p => p.locator('[class*=modalContent] button', { hasText: /^(儲存|儲存中\.\.\.)$/ }).first();
const cancelBtn = p => p.locator('[class*=modalContent] button', { hasText: /^取消$/ }).first();
const tab = async (p, label) => { if (label) { await p.locator('[class*=modalContent] button', { hasText: label }).first().click(); await p.waitForTimeout(150); } };
// every toast of any level (see UNRELATED_TOASTS below for the one set aside); newest first
const notices = p => toastsAll(p);
const setField = async (p, mod, key, value) => {
    const el = MODS[mod].f[key](p); await el.waitFor({ timeout: 8000 });
    if ((await el.evaluate(e => e.tagName)) === 'SELECT') await el.selectOption(value); else { await el.focus(); await el.fill(value); }
};
const snapshot = async (p, mod) => { const out = {}; for (const k of MODS[mod].snap) out[k] = await MODS[mod].f[k](p).inputValue(); return out; };
const count = (log, m, path, status) => log.filter(r => r.m === m && (path instanceof RegExp ? path.test(r.path) : r.path === path) && (status === undefined || r.status === status)).length;

// ---- in-memory file service ------------------------------------------------------------------------------------------------------
const stub = { files: [], up: 0, del: 0, failUpload: false, failDelete: false, failCategories: new Set(), attempts: [], deleted: [], seq: 0 };
const stubReset = () => Object.assign(stub, { files: [], up: 0, del: 0, failUpload: false, failDelete: false, failCategories: new Set(), attempts: [], deleted: [] });
async function installStub(ctx) {
    await ctx.route('**/api/files/**', async route => {
        const req = route.request(), u = new URL(req.url()), m = req.method();
        const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (m === 'POST' && u.pathname.endsWith('/upload')) {
            stub.up++;
            const body = (req.postDataBuffer() ?? Buffer.alloc(0)).toString('latin1');
            const g = n => (body.match(new RegExp(`name="${n}"\\r\\n\\r\\n([^\\r]*)`)) || [])[1];
            stub.attempts.push(g('category'));
            if (stub.failUpload || stub.failCategories.has(g('category'))) return route.abort('failed');
            const made = [...body.matchAll(/filename="([^"]*)"/g)].map(x => ({ id: `stub-${++stub.seq}`, entity_type: g('entity_type'), entity_id: g('entity_id'), file_name: x[1], file_url: `/api/files/download/stub-${stub.seq}`, category: g('category'), uploaded_at: new Date().toISOString(), mime_type: 'text/plain' }));
            stub.files.push(...made);
            return json(made);
        }
        if (m === 'GET' && u.pathname.includes('/by-entity')) {
            const q = u.searchParams;
            return json(stub.files.filter(f => f.entity_type === q.get('entity_type') && f.entity_id === q.get('entity_id') && (!q.get('category') || f.category === q.get('category'))));
        }
        if (m === 'DELETE') {
            stub.del++;
            if (stub.failDelete) return route.abort('failed');
            const id = u.pathname.split('/').pop(); stub.files = stub.files.filter(f => f.id !== id); stub.deleted.push(id);
            return json({});
        }
        return route.fulfill({ status: 200, contentType: 'text/plain', body: 'x' });
    });
}

// ---- browser plumbing ------------------------------------------------------------------------------------------------------------
const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1200 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(BASE + '/login'); await p.fill('#email', user); await p.fill('#password', PW);
    await p.click('button[type=submit]'); await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    await p.close();
    return ctx;
}
const user = await login('sf_user'); await installStub(user);
const admin = await login('sf_admin');
const creatorReal = await login('sf_create');                                 // same account, NO file stub: the real file API answers
const noclose = await login('sf_noclose');                                   // ncr:update:all but NOT ncr:close:all
const userReal = await login('sf_user');                                     // same as sf_user, NO file stub
const user2 = await login('sf_user2'); await installStub(user2);            // same rights as sf_user; its update permission is revoked in scenario 13
let lastPage = null;
async function fresh(ctx = user) {                                // a new page (new SPA state, no leftover toasts) + its request log
    stubReset();
    const p = await ctx.newPage(); lastPage = p; const log = [];
    const push = (r, status) => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) log.push({ m: r.method(), path: u.pathname, status }); };
    p.on('response', r => push(r.request(), r.status())); p.on('requestfailed', r => push(r, 'FAILED'));
    return { p, log };
}
const adminDelete = async (path) => {
    const csrf = (await admin.cookies()).find(c => c.name === 'csrf_token')?.value;
    const r = await admin.request.fetch(BASE + path, { method: 'DELETE', headers: { 'X-CSRF-Token': csrf } });
    return r.status();
};
const onlySteps = (process.argv[5] || '').split(',').filter(Boolean);       // optional 4th argument: scenario numbers to run, e.g. 5,6
const step = async (name, fn) => { if (onlySteps.length && !onlySteps.some(n => { const seg = name.split('-')[1]; return seg === n || new RegExp('^' + n + '[a-z]$').test(seg); })) return; try { await fn(); } catch (e) { check(`${name} — script error`, false, String(e.message).split('\n')[0]); if (process.env.SHOTS && lastPage) await lastPage.screenshot({ path: `${process.env.SHOTS}/${name}-error.png` }).catch(() => { }); } };
async function openRow(p, mod, text) {
    await p.goto(BASE + MODS[mod].path); const row = p.locator('tr', { hasText: text }).first();
    await row.waitFor({ timeout: 15000 }); await row.click(); await modalOf(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(500);
}
async function openNew(p, mod) {
    await p.goto(BASE + MODS[mod].path); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: /新增/ }).first().click(); await modalOf(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(400);
}
async function fillCreate(p, mod, subject) {
    if (mod === 'ncr') {
        const n = k => p.locator(`[class*=modalContent] [name=${k}]`).first();
        await n('type').selectOption('Design'); await n('severity').selectOption('Minor'); await n('discipline').selectOption('Civil'); await n('contractor').selectOption('Accept Co');
        await n('assignedTo').selectOption(String(seed.uid)); await n('raisedBy').fill('QA'); await n('foundBy').fill('QA'); await n('raiseDate').focus(); await n('raiseDate').fill('2026-09-05');
        await n('foundLocation').fill('Grid A'); await n('subject').fill(subject);
        await tab(p, '不符合描述與追溯'); await n('referenceStandards').fill('SPEC'); await n('deviation').fill('dev'); await tab(p, '基本資訊');
    } else if (mod === 'obs') {
        const n = k => p.locator(`[class*=modalContent] [name=${k}]`).first();
        await n('subject').fill(subject); await n('contractor').selectOption('Accept Co'); await n('raiseDate').fill('2026-09-05');
        await tab(p, '觀察描述'); await n('detailsDescription').fill('desc'); await tab(p, '基本資訊');
    } else {
        await setField(p, 'noi', 'subject', subject);
        const sel = async (lab, v) => labelled(lab)(p).selectOption(v);
        await sel('承包商', 'Accept Co'); await sel('ITP 編號', 'QTS-ACC-ITP-000001'); await sel('檢查點', 'H');
        for (const [lab, v] of [['發佈日期', '2026-09-05'], ['檢驗日期', '2026-09-15'], ['檢驗時間', '09:00'], ['事件編號', 'EV9'], ['聯絡人', 'Bob'], ['電話', '123'], ['電子郵件', 'b@example.com']]) { const el = labelled(lab)(p); await el.focus(); await el.fill(v); }
    }
}
const attach = async (p, mod, name = 't1.txt', sel = MODS[mod].file, mimeType = 'text/plain') => {
    await tab(p, MODS[mod].attachTab);
    await p.locator(sel).setInputFiles({ name, mimeType, buffer: Buffer.from('hello') });
    await p.waitForTimeout(300);
};
async function openById(p, mod, i) {                                       // deep link: the list has more rows than one page by now
    const ref = sql(`select ${MODS[mod].ref} from ${MODS[mod].table} where id='${idOf(mod, i)}'`);
    await p.goto(BASE + MODS[mod].path); await p.waitForTimeout(800);
    await p.goto(`${BASE}${MODS[mod].path}?openId=${encodeURIComponent(ref)}`); await modalOf(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
}
const followBanner = p => p.locator('[data-save-followup]');
const retryBtn = p => p.getByRole('button', { name: /重試剩餘檔案/ });
// "Saved, but a file step failed" is reported by ONE persistent banner and by NO toast about that event — whatever the toast level
// (error, warning, info, success). Every toast is counted; the only ones set aside are listed here, each with the reason it is unrelated:
//   - the NCR "not linked to any ITR" hint: emitted by every NCR save that has no ITR link, before the outcome is known, and says nothing
//     about the save result.
// (NCR also emits an info toast "NCR closed. You may now update NOI ..." — only when the status being saved is Closed; no scenario here closes an NCR.)
const UNRELATED_TOASTS = [/此 NCR 未連結任何 ITR。/];
const allToasts = async p => (await p.locator('[data-sonner-toast]').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
const toastsAll = async p => (await allToasts(p)).filter(x => !UNRELATED_TOASTS.some(re => re.test(x)));      // toasts that could concern the save outcome
const ignoredToasts = async p => (await allToasts(p)).filter(x => UNRELATED_TOASTS.some(re => re.test(x)));
const fu = async p => { const banners = await followBanner(p).count(); return { toasts: await toastsAll(p), ignored: await ignoredToasts(p), banners, text: banners ? (await followBanner(p).first().innerText()).replace(/\s+/g, ' ') : '', retry: await retryBtn(p).isVisible() }; };
const oneBanner = (st, { created, reason, notReason }) => st.toasts.length === 0 && st.banners === 1 && (created ? /資料已建立/ : /資料已保存/).test(st.text) && reason.test(st.text) && (!notReason || !notReason.test(st.text)) && !/尚未保存/.test(st.text) && st.retry;
const fuNote = st => `toasts=${JSON.stringify(st.toasts)} unrelatedToastsSetAside=${JSON.stringify(st.ignored)} banners=${st.banners} retry=${st.retry} text=${st.text}`;
const modalGone = async (p, ms = 6000) => { try { await modalOf(p).waitFor({ state: 'hidden', timeout: ms }); return true; } catch { return false; } };
const dbSubject = (mod, i) => sql(`select ${MODS[mod].col} from ${MODS[mod].table} where id='${idOf(mod, i)}'`);
const dbCount = (mod, subject) => Number(sql(`select count(*) from ${MODS[mod].table} where ${MODS[mod].col}='${subject}'`));

// ================================ scenarios ==================================================================================
// optional 3rd argument: comma-separated modules to run (default all three)
for (const mod of (process.argv[4] || 'ncr,obs,noi').split(',')) {
    const M = MODS[mod], L = M.label;

    // ── 1. the backend really refuses the save ──────────────────────────────────────────────────────────────────────────────
    await step(`${L}-1`, async () => {
        const { p, log } = await fresh(); await openRow(p, mod, rowSubject(mod, 0));
        await setField(p, mod, 'subject', `${M.subj(1)} EDITED`);
        if (mod === 'ncr') await setField(p, mod, 'date', '2026-09-20');            // valid date, but after the stored close-out date 2026-09-10 -> real 422
        else check(`${L}-1 setup: the record is deleted by someone else while the modal is open (real 404)`, (await adminDelete(M.del(idOf(mod, 0)))) === 200);
        const before = await snapshot(p, mod);
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        const put = log.filter(r => r.m === 'PUT');
        const n = await notices(p);
        note(`${L}-1 backend answer / toast`, `${put.map(r => r.status)} / ${n.join(' | ')}`);
        check(`${L}-1 the backend refused (real response, not mocked)`, put.length === 1 && put[0].status >= 400 && put[0].status < 500, JSON.stringify(put));
        check(`${L}-1 the modal is still open`, await modalOf(p).isVisible());
        check(`${L}-1 exactly one notice, worded as "not saved, entries kept", no raw validation text`, n.length === 1 && /尚未保存/.test(n[0]) && !/loc|Traceback|ValidationError|\[object/.test(n[0]), n.join(' | '));
        check(`${L}-1 no second (page-level) error banner`, (await p.locator('[class*=errorBanner]').count()) === 0);
        check(`${L}-1 every entered field is exactly as typed`, JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before), JSON.stringify(before));
        check(`${L}-1 the save button is usable again (not stuck on "saving")`, (await saveBtn(p).isEnabled()) && (await saveBtn(p).innerText()).trim() === '儲存');
        if (mod === 'ncr') {
            check(`${L}-1 the message names the field in plain words`, /日期/.test(n[0]), n[0]);
            check(`${L}-1 nothing was stored`, dbSubject(mod, 0) === M.subj(1) && sql(`select raiseDate from ncr where id='${idOf(mod, 0)}'`) === '2026-09-02');
            await setField(p, mod, 'date', '2026-09-05');                             // correct it in place …
            await saveBtn(p).click(); const gone = await modalGone(p);
            check(`${L}-1 corrected and saved again: the modal closes, the value is stored`, gone && dbSubject(mod, 0) === `${M.subj(1)} EDITED` && sql(`select raiseDate from ncr where id='${idOf(mod, 0)}'`) === '2026-09-05', `${gone} ${dbSubject(mod, 0)}`);
            await openRow(p, mod, `${M.subj(1)} EDITED`);
            check(`${L}-1 reopened: the saved values are shown`, (await M.f.subject(p).inputValue()) === `${M.subj(1)} EDITED` && (await M.f.date(p).inputValue()) === '2026-09-05');
        } else {
            await cancelBtn(p).click(); check(`${L}-1 the user can still close the modal`, await modalGone(p));
        }
        await p.close();
    });

    // ── 2. network failure; typed fields and a pending attachment survive; retry succeeds ──────────────────────────────────
    await step(`${L}-2`, async () => {
        const { p, log } = await fresh(); await openRow(p, mod, rowSubject(mod, 1));
        await setField(p, mod, 'subject', `${M.subj(2)} NET`); await setField(p, mod, 'a', 'Someone'); await setField(p, mod, 'b', '9');
        await setField(p, mod, 'date', '2026-09-07');
        const before = await snapshot(p, mod);
        await attach(p, mod);
        check(`${L}-2 the pending file is listed`, await p.getByText('t1.txt').first().isVisible());
        await p.route(M.apiGlob, r => ['PUT', 'POST'].includes(r.request().method()) ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); await p.waitForTimeout(1200);
        const n = await notices(p);
        note(`${L}-2 toast`, n.join(' | '));
        check(`${L}-2 the modal stays open`, await modalOf(p).isVisible());
        check(`${L}-2 one notice: network failure, nothing saved`, n.length === 1 && /網路連線失敗/.test(n[0]) && /尚未保存/.test(n[0]), n.join(' | '));
        check(`${L}-2 the pending file is still listed and was not uploaded`, (await p.getByText('t1.txt').first().isVisible()) && stub.up === 0);
        await tab(p, M.basicTab);
        check(`${L}-2 every entered field, including the date, is unchanged`, JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before), JSON.stringify(before));
        check(`${L}-2 the save button is usable again`, await saveBtn(p).isEnabled());
        check(`${L}-2 nothing changed in the database`, dbSubject(mod, 1) === M.subj(2));
        await p.unroute(M.apiGlob);
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-2 retry: saved once, modal closes, the file is uploaded exactly once`, gone && count(log, 'PUT', M.put(idOf(mod, 1)), 200) === 1 && stub.up === 1 && stub.files.length === 1 && stub.files[0].entity_id === idOf(mod, 1), `${gone} put200=${count(log, 'PUT', M.put(idOf(mod, 1)), 200)} up=${stub.up} files=${stub.files.length}`);
        check(`${L}-2 the database holds the retried values`, dbSubject(mod, 1) === `${M.subj(2)} NET`);
        await openRow(p, mod, `${M.subj(2)} NET`);
        check(`${L}-2 reopened: the saved value is shown`, (await M.f.subject(p).inputValue()) === `${M.subj(2)} NET` && (await M.f.a(p).inputValue()) === 'Someone');
        await p.close();
    });

    // ── 3. 403 / 409 / 500 from the server ──────────────────────────────────────────────────────────────────────────────────
    await step(`${L}-3`, async () => {
        const { p } = await fresh(); await openRow(p, mod, rowSubject(mod, 2));
        await setField(p, mod, 'subject', `${M.subj(3)} X`);
        const before = await snapshot(p, mod);
        let answer = null;
        await p.route(M.apiGlob, r => ['PUT', 'POST'].includes(r.request().method()) ? r.fulfill({ status: answer.status, contentType: 'application/json', body: JSON.stringify(answer.body) }) : r.continue());
        const cases = [
            { status: 403, body: { detail: 'You are not allowed to edit this record' }, want: /You are not allowed to edit this record/ },
            { status: 409, body: { detail: 'Record was modified by someone else' }, want: /Record was modified by someone else/ },
            { status: 500, body: { detail: "ResponseValidationError: 1 validation error for NCR\n  {'loc': ('response', 0, 'raiseDate')}" }, want: /伺服器發生錯誤（HTTP 500）/, not: /ResponseValidationError|loc/ },
        ];
        let seen = 0;
        for (const c of cases) {
            answer = c; await saveBtn(p).click(); await p.waitForTimeout(1000);
            const n = await notices(p); seen++;
            // the newest toast comes first in the DOM
            check(`${L}-3 HTTP ${c.status}: one new notice with the right text`, n.length === seen && c.want.test(n[0]) && (!c.not || !c.not.test(n[0])), n[0]);
            check(`${L}-3 HTTP ${c.status}: modal open, fields kept, button usable`, (await modalOf(p).isVisible()) && JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before) && (await saveBtn(p).isEnabled()));
        }
        check(`${L}-3 nothing was stored`, dbSubject(mod, 2) === M.subj(3));
        await p.unroute(M.apiGlob); await p.close();
    });

    // ── 4. creating: a failed create leaves nothing and the retry creates exactly one ─────────────────────────────────────
    await step(`${L}-4`, async () => {
        const { p, log } = await fresh(); const S = `CREATE-${mod}-A`;
        await openNew(p, mod); await fillCreate(p, mod, S);
        const before = await snapshot(p, mod);
        await p.route(M.apiGlob, r => r.request().method() === 'POST' ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); await p.waitForTimeout(1200);
        const n = await notices(p);
        check(`${L}-4 create failed: modal open, one network notice, nothing in the DB`, (await modalOf(p).isVisible()) && n.length === 1 && /網路連線失敗/.test(n[0]) && dbCount(mod, S) === 0, n.join(' | '));
        check(`${L}-4 the form still holds what was typed`, JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before) && (await saveBtn(p).isEnabled()));
        await p.unroute(M.apiGlob);
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-4 retry: exactly one record is created and the modal closes`, gone && dbCount(mod, S) === 1 && count(log, 'POST', M.post, 200) === 1, `${gone} rows=${dbCount(mod, S)}`);
        await p.close();
    });

    // ── 5. saved, but the attachment upload failed (update) ─────────────────────────────────────────────────────────────────
    await step(`${L}-5`, async () => {
        const { p, log } = await fresh(); await openRow(p, mod, rowSubject(mod, 3));
        await setField(p, mod, 'subject', `${M.subj(4)} SAVED`);
        await attach(p, mod); stub.failUpload = true;
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        const st = await fu(p);
        note(`${L}-5 banner`, fuNote(st));
        check(`${L}-5 the record IS saved: ONE persistent banner (with the reason and the retry button), NO toast for the same event, never "not saved"`, dbSubject(mod, 3) === `${M.subj(4)} SAVED` && oneBanner(st, { created: false, reason: /上傳附件失敗（網路連線失敗/ }), fuNote(st));
        check(`${L}-5 the modal stays open with the file still pending; button usable`, (await modalOf(p).isVisible()) && (await p.getByText('t1.txt').first().isVisible()) && (await saveBtn(p).isEnabled()));
        stub.failUpload = false;
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-5 retry: the record is NOT written again, the file is uploaded once, the modal closes`, gone && count(log, 'PUT', M.put(idOf(mod, 3)), 200) === 1 && stub.up === 2 && stub.files.length === 1, `${gone} put200=${count(log, 'PUT', M.put(idOf(mod, 3)), 200)} attempts=${stub.up} stored=${stub.files.length}`);
        await p.close();
    });

    // ── 6. created, but the attachment upload failed: the new id is kept, a retry cannot create a duplicate ───────────────
    await step(`${L}-6`, async () => {
        const { p, log } = await fresh(); const S = `CREATE-${mod}-B`;
        await openNew(p, mod); await fillCreate(p, mod, S);
        await attach(p, mod); stub.failUpload = true;
        await saveBtn(p).click(); await p.waitForTimeout(1800);
        const st = await fu(p);
        note(`${L}-6 banner`, fuNote(st));
        check(`${L}-6 the record exists exactly once; ONE persistent "created" banner with reason and retry button, NO toast`, dbCount(mod, S) === 1 && oneBanner(st, { created: true, reason: /上傳附件失敗（網路連線失敗/ }), `${dbCount(mod, S)} ${fuNote(st)}`);
        check(`${L}-6 the modal stays open, the file is still pending`, (await modalOf(p).isVisible()) && (await p.getByText('t1.txt').first().isVisible()));
        stub.failUpload = false;
        await saveBtn(p).click(); const gone = await modalGone(p);
        const id = sql(`select id from ${M.table} where ${M.col}='${S}'`);
        check(`${L}-6 retry: no second create, no second write, one file uploaded to the new record, modal closes`,
            gone && dbCount(mod, S) === 1 && count(log, 'POST', M.post, 200) === 1 && count(log, 'PUT', M.put(id)) === 0 && stub.files.length === 1 && stub.files[0].entity_id === id,
            `${gone} rows=${dbCount(mod, S)} posts=${count(log, 'POST', M.post, 200)} puts=${count(log, 'PUT', M.put(id))} stored=${stub.files.length}`);
        await p.close();
    });

    // ── 7. saved, but removing a stored file failed ─────────────────────────────────────────────────────────────────────────
    if (mod !== 'noi') await step(`${L}-7`, async () => {
        const { p, log } = await fresh(); const id = idOf(mod, 4);
        stub.files.push({ id: 'pre-1', entity_type: mod, entity_id: id, file_name: 'old.txt', file_url: '/api/files/download/pre-1', category: 'attachment', uploaded_at: new Date().toISOString(), mime_type: 'text/plain' });
        await openRow(p, mod, rowSubject(mod, 4));
        await tab(p, M.attachTab);
        await p.getByText('old.txt').first().waitFor({ timeout: 8000 });
        await p.locator('[class*=modalContent] button[title], [class*=modalContent] button', { hasText: '×' }).last().click().catch(() => { });
        await p.waitForTimeout(300);
        await tab(p, M.basicTab); await setField(p, mod, 'subject', `${M.subj(5)} DEL`);
        stub.failDelete = true;
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        const st = await fu(p);
        note(`${L}-7 banner`, fuNote(st));
        check(`${L}-7 the record is saved; ONE persistent banner names the failed removal with a retry button, NO toast; the modal stays`, dbSubject(mod, 4) === `${M.subj(5)} DEL` && oneBanner(st, { created: false, reason: /移除檔案失敗（網路連線失敗/ }) && (await modalOf(p).isVisible()), fuNote(st));
        stub.failDelete = false;
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-7 retry: only the delete is repeated (no second record write), the file is gone, the modal closes`, gone && count(log, 'PUT', M.put(id), 200) === 1 && stub.del === 2 && stub.files.length === 0, `${gone} put200=${count(log, 'PUT', M.put(id), 200)} del=${stub.del} left=${stub.files.length}`);
        await p.close();
    });
    else note(`${L}-7`, 'NOI: its stored-file list comes from the record itself, so the delete-failure case is scenario 14');

    // ── 8. saved, but reloading the list failed ─────────────────────────────────────────────────────────────────────────────
    if (M.hasReload) await step(`${L}-8`, async () => {
        const { p, log } = await fresh(); await openRow(p, mod, rowSubject(mod, 5));
        await setField(p, mod, 'subject', `${M.subj(6)} RELOAD`);
        await p.route(M.apiGlob, r => r.request().method() === 'GET' && new URL(r.request().url()).pathname === M.listGet ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); const gone = await modalGone(p); await p.waitForTimeout(600);
        const n = await notices(p);
        note(`${L}-8 toast`, n.join(' | '));
        check(`${L}-8 saved and everything else done: the modal closes, ONE warning says only the reload failed, never "not saved"`, gone && dbSubject(mod, 5) === `${M.subj(6)} RELOAD` && n.length === 1 && /資料已保存/.test(n[0]) && /重新載入/.test(n[0]) && !/尚未保存/.test(n[0]), `${gone} ${n.join(' | ')}`);
        await p.unroute(M.apiGlob);
        // create with a failing reload, then "retry" by editing the created record: still exactly one
        const S = `CREATE-${mod}-C`;
        await openNew(p, mod); await fillCreate(p, mod, S);
        await p.route(M.apiGlob, r => r.request().method() === 'GET' && new URL(r.request().url()).pathname === M.listGet ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); const gone2 = await modalGone(p);
        check(`${L}-8 create + failing reload: exactly one record, modal closes`, gone2 && dbCount(mod, S) === 1 && count(log, 'POST', M.post, 200) === 1);
        await p.unroute(M.apiGlob);
        // (opened through the deep link: by now the list has more rows than one page shows)
        await p.goto(`${BASE}${M.path}?openId=${encodeURIComponent(sql(`select ${M.ref} from ${M.table} where ${M.col}='${S}'`))}`); await modalOf(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
        await setField(p, mod, 'subject', `${S} 2`); await saveBtn(p).click(); const gone3 = await modalGone(p);
        check(`${L}-8 reopening and saving again updates the same record (still one row, no duplicate)`, gone3 && dbCount(mod, `${S} 2`) === 1 && dbCount(mod, S) === 0 && count(log, 'POST', M.post, 200) === 1, `${dbCount(mod, `${S} 2`)}/${dbCount(mod, S)}`);
        await p.close();
    });
    else note(`${L}-8`, 'not applicable: the OBS page never re-fetches the list after a save (the store merges the saved record), so there is no reload step to fail');

    // ── 9. normal success closes once ───────────────────────────────────────────────────────────────────────────────────────
    await step(`${L}-9`, async () => {
        const { p, log } = await fresh(); await openRow(p, mod, rowSubject(mod, 6));
        await setField(p, mod, 'subject', `${M.subj(7)} OK`);
        await saveBtn(p).click(); const gone = await modalGone(p); await p.waitForTimeout(1200);
        const n = await notices(p);
        check(`${L}-9 success: one PUT (200), modal closed, no error/warning notice, DB updated`, gone && count(log, 'PUT', M.put(idOf(mod, 6)), 200) === 1 && n.length === 0 && dbSubject(mod, 6) === `${M.subj(7)} OK`, `${gone} ${n.join(' | ')}`);
        await openRow(p, mod, `${M.subj(7)} OK`);
        check(`${L}-9 reopened: the saved value is shown`, (await M.f.subject(p).inputValue()) === `${M.subj(7)} OK`);
        await p.close();
        // opened through a deep link: leaving goes back exactly once
        const q = await user.newPage(); stubReset();
        await q.addInitScript(() => { const g = history.go.bind(history); history.go = (...a) => { sessionStorage.setItem('goCalls', String(Number(sessionStorage.getItem('goCalls') || 0) + 1)); return g(...a); }; });
        const ref = sql(`select ${M.ref} from ${M.table} where id='${idOf(mod, 7)}'`);
        await q.goto(BASE + '/dashboard'); await q.waitForTimeout(800);
        await q.goto(`${BASE}${M.path}?openId=${encodeURIComponent(ref)}`); await modalOf(q).waitFor({ timeout: 15000 });
        await setField(q, mod, 'subject', `${M.subj(8)} DEEP`);
        await saveBtn(q).click(); const gone2 = await modalGone(q, 8000); await q.waitForTimeout(1200);
        const calls = Number(await q.evaluate(() => sessionStorage.getItem('goCalls') || 0));
        check(`${L}-9 deep link: saving leaves the modal exactly once (history.go called once) and lands where the user came from`, gone2 && calls === 1 && new URL(q.url()).pathname === '/dashboard' && dbSubject(mod, 7) === `${M.subj(8)} DEEP`, `gone=${gone2} goCalls=${calls} url=${q.url()}`);
        await q.close();
    });

    // ── 10. a record with a stored invalid date: a failed save keeps it as it was, the retry does not touch it ───────────
    await step(`${L}-10`, async () => {
        const { p, log } = await fresh(); await openRow(p, mod, rowSubject(mod, 8));
        const dateCol = { ncr: 'raiseDate', obs: 'raiseDate', noi: 'issueDate' }[mod], stored = sql(`select ${dateCol} from ${M.table} where id='${idOf(mod, 8)}'`);
        const banner = await p.locator('[data-date-issue-banner], [class*=dateIssue]').count();
        await setField(p, mod, 'subject', `${M.subj(9)} HIST`);
        const before = await snapshot(p, mod);
        await p.route(M.apiGlob, r => ['PUT', 'POST'].includes(r.request().method()) ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); await p.waitForTimeout(1200);
        const n = await notices(p);
        check(`${L}-10 the failed save keeps the modal, the typed subject and the (unchanged) date field`, (await modalOf(p).isVisible()) && n.length === 1 && JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before), `${n.join(' | ')} banner=${banner}`);
        await p.unroute(M.apiGlob);
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-10 the retry saves the subject and leaves the stored invalid date byte-for-byte as it was`, gone && dbSubject(mod, 8) === `${M.subj(9)} HIST` && sql(`select ${dateCol} from ${M.table} where id='${idOf(mod, 8)}'`) === stored, `stored=${stored} now=${sql(`select ${dateCol} from ${M.table} where id='${idOf(mod, 8)}'`)}`);
        await p.close();
    });

    // ── 11. create-only account (plan A): told BEFORE creating that attachments are not possible; creates the record once; the server refuses uploads for real ──
    await step(`${L}-11`, async () => {
        const { p, log } = await fresh(creatorReal); const S = `CREATE-${mod}-D`;
        await openNew(p, mod);
        const notice = p.locator('[data-attachments-blocked]');
        check(`${L}-11 BEFORE creating, a notice says: create is allowed, attachments are not (they need update permission)`, (await notice.count()) === 1 && /只有建立權限/.test(await notice.innerText()) && /附件/.test(await notice.innerText()) && /更新權限/.test(await notice.innerText()), await notice.innerText().catch(() => 'no notice'));
        await fillCreate(p, mod, S);
        await tab(p, M.attachTab);
        check(`${L}-11 there is no file control to pick files with`, (await p.locator(M.file).count()) === 0 && (await p.locator('[class*=modalContent] input[type=file]').count()) === 0);
        await tab(p, M.basicTab);
        await saveBtn(p).click(); const gone = await modalGone(p);
        const id = sql(`select id from ${M.table} where ${M.col}='${S}'`);
        check(`${L}-11 the record is created once, the modal closes, no upload request was even attempted, no toast about attachments`, gone && dbCount(mod, S) === 1 && count(log, 'POST', M.post, 200) === 1 && log.filter(r => /\/files\//.test(r.path) && r.m !== 'GET').length === 0, `${gone} rows=${dbCount(mod, S)} posts=${count(log, 'POST', M.post, 200)}`);
        // the SERVER refuses the same account for real (no stub on this context): 403, no attachment row, no file
        const csrf = (await creatorReal.cookies()).find(c => c.name === 'csrf_token')?.value;
        const rows0 = Number(sql('select count(*) from attachments'));
        const r = await creatorReal.request.fetch(`${BASE}/api/files/upload`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, multipart: { entity_type: mod, entity_id: id, category: 'attachment', files: { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') } } });
        check(`${L}-11 the real backend answers 403 for the same account's upload; no attachment row was added`, r.status() === 403 && Number(sql('select count(*) from attachments')) === rows0, `${r.status()} ${(await r.text()).slice(0, 120)}`);
        await p.close();
    });

    // ── 12. after a partial save: unchanged retry writes nothing; an edit IS written; finished categories are not uploaded again ────────
    await step(`${L}-12`, async () => {
        const { p, log } = await fresh(); const id = idOf(mod, 9);
        await openById(p, mod, 9);
        await setField(p, mod, 'subject', `${M.subj(10)} X1`);
        const split = mod !== 'noi';
        if (split) { await attach(p, mod, 'd1.png', M.fileDefect, 'image/png'); stub.failCategories.add('attachment'); }
        else stub.failUpload = true;
        await attach(p, mod, 'a1.txt');
        await saveBtn(p).click(); await p.waitForTimeout(1600);
        const st1 = await fu(p);
        check(`${L}-12 (i) saved with X1; ONE banner naming only the failed file group, NO toast`, dbSubject(mod, 9) === `${M.subj(10)} X1` && oneBanner(st1, { created: false, reason: /上傳附件失敗/, notReason: /缺失照片/ }), fuNote(st1));
        if (split) check(`${L}-12 (i) the finished category is stored, the failed one is not`, stub.files.map(f => f.category).join() === 'defectPhoto' && stub.attempts.join() === 'defectPhoto,attachment', `${stub.files.map(f => f.category)} / ${stub.attempts}`);
        const put1 = count(log, 'PUT', M.put(id), 200);
        await saveBtn(p).click(); await p.waitForTimeout(1500);         // unchanged retry, still failing
        check(`${L}-12 (ii) unchanged retry: NO record write, only the failed group is tried again, modal stays`, count(log, 'PUT', M.put(id), 200) === put1 && put1 === 1 && (await modalOf(p).isVisible()) && (!split || stub.attempts.join() === 'defectPhoto,attachment,attachment') && oneBanner(await fu(p), { created: false, reason: /上傳附件失敗/ }), `put=${count(log, 'PUT', M.put(id), 200)} attempts=${stub.attempts}`);
        await tab(p, M.basicTab); await setField(p, mod, 'subject', `${M.subj(10)} X2`);
        stub.failCategories.clear(); stub.failUpload = false;
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-12 (iii) after editing: the NEW content is written (2nd PUT), the failed group finally uploads, the modal closes`, gone && count(log, 'PUT', M.put(id), 200) === 2 && dbSubject(mod, 9) === `${M.subj(10)} X2`, `${gone} puts=${count(log, 'PUT', M.put(id), 200)} db=${dbSubject(mod, 9)}`);
        if (split) check(`${L}-12 (iii) the finished category was uploaded exactly once overall, the failed one once successfully`, stub.attempts.filter(c => c === 'defectPhoto').length === 1 && stub.files.map(f => f.category).sort().join() === 'attachment,defectPhoto', `${stub.attempts} / ${stub.files.map(f => f.category)}`);
        else check(`${L}-12 (iii) the file is stored once`, stub.files.length === 1, stub.files.length);
        await p.close();
    });

    // ── 13. after a partial save the backend refuses the next write (permission revoked / record closed): input kept, reason shown, no lock loosened ─
    await step(`${L}-13`, async () => {
        const { p, log } = await fresh(user2); const id = idOf(mod, 10);
        await openById(p, mod, 10);
        await setField(p, mod, 'subject', `${M.subj(11)} L1`); await attach(p, mod); stub.failUpload = true;
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        check(`${L}-13 setup: partial save (L1 stored, file pending)`, dbSubject(mod, 10) === `${M.subj(11)} L1` && (await modalOf(p).isVisible()));
        sqlWrite(`delete from role_permissions where role_id=(select id from roles where name='SaveFlow2') and permission_id=(select id from permissions where code='${mod}:update:all')`);
        await tab(p, M.basicTab); await setField(p, mod, 'subject', `${M.subj(11)} L2`); stub.failUpload = false;
        const before = await snapshot(p, mod); const upBefore = stub.up;
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        const put = log.filter(r => r.m === 'PUT');
        const n = await notices(p);
        note(`${L}-13 backend answer / newest toast`, `${put.map(r => r.status)} / ${n[0]}`);
        check(`${L}-13 the backend refused the changed content (real 403 after the revoke)`, put.length === 2 && put[1].status === 403, JSON.stringify(put.map(r => r.status)));
        check(`${L}-13 the modal stays open, the edit (L2) is kept, the notice gives the reason and says nothing was saved for this edit`, (await modalOf(p).isVisible()) && JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before) && /尚未保存/.test(n[0]) && /permitted|Required|權限/i.test(n[0]), n[0]);
        check(`${L}-13 the earlier follow-up banner (with its retry button) is still there next to the ONE refusal toast`, (await followBanner(p).count()) === 1 && (await retryBtn(p).isVisible()) && (await toastsAll(p)).length === 1);
        check(`${L}-13 the database keeps L1 and the pending file was not pushed through a refused write`, dbSubject(mod, 10) === `${M.subj(11)} L1` && stub.up === upBefore);
        await tab(p, M.attachTab);
        check(`${L}-13 the pending file is still listed`, await p.getByText('t1.txt').first().isVisible());
        await p.close();
    });
    if (mod === 'noi') await step(`${L}-13b`, async () => {
        const { p, log } = await fresh(); const id = idOf(mod, 11);
        await openById(p, mod, 11);
        await setField(p, mod, 'subject', `${M.subj(12)} C1`); await attach(p, mod); stub.failUpload = true;
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        sqlWrite(`update noi set status='Closed' where id='${id}'`);                    // the record gets closed elsewhere
        await setField(p, mod, 'subject', `${M.subj(12)} C2`); stub.failUpload = false;
        const before = await snapshot(p, mod);
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        const put = log.filter(r => r.m === 'PUT'); const n = await notices(p);
        note(`${L}-13b backend answer / newest toast`, `${put.map(r => r.status)} / ${n[0]}`);
        check(`${L}-13b closed record: the backend refuses (4xx), the lock is not loosened, the edit and the pending file stay, the reason is shown`, put.length === 2 && put[1].status >= 400 && put[1].status < 500 && dbSubject(mod, 11) === `${M.subj(12)} C1` && sql(`select status from noi where id='${id}'`) === 'Closed' && (await modalOf(p).isVisible()) && JSON.stringify(await snapshot(p, mod)) === JSON.stringify(before) && /尚未保存/.test(n[0]) && stub.files.length === 0, `${put.map(r => r.status)} ${n[0]}`);
        await p.close();
    });

    // ── 14. NOI: a stored file that cannot be removed ───────────────────────────────────────────────────────────────────────────────────
    if (mod === 'noi') await step(`${L}-14`, async () => {
        const { p, log } = await fresh(); const id = idOf(mod, 13);
        await openById(p, mod, 13);
        await p.getByText('old.txt').first().waitFor({ timeout: 8000 });
        await p.locator('[class*=modalContent] button', { hasText: '×' }).last().click(); await p.waitForTimeout(300);
        check(`${L}-14 the removed file disappears from the modal`, (await p.getByText('old.txt').count()) === 0);
        await setField(p, mod, 'subject', `${M.subj(14)} DEL`);
        stub.failDelete = true;
        await saveBtn(p).click(); await p.waitForTimeout(1600);
        const st = await fu(p);
        note(`${L}-14 banner`, fuNote(st));
        check(`${L}-14 failure is visible: the record is saved; ONE persistent banner names the failed removal with a retry button, NO toast; the modal stays`, dbSubject(mod, 13) === `${M.subj(14)} DEL` && oneBanner(st, { created: false, reason: /移除檔案失敗（網路連線失敗/ }) && (await modalOf(p).isVisible()), fuNote(st));
        stub.failDelete = false;
        await saveBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-14 retry: only the delete is repeated (no second record write), it succeeds, the modal closes`, gone && count(log, 'PUT', M.put(id), 200) === 1 && stub.del === 2 && stub.deleted.join() === 'pre-noi', `${gone} put200=${count(log, 'PUT', M.put(id), 200)} del=${stub.del} deleted=${stub.deleted}`);
        await p.close();
    });

    // ── 15. file step failed AND the list reload failed: still ONE banner (both facts in it), no toast; the files-only retry finishes it ──
    if (M.hasReload) await step(`${L}-15`, async () => {
        const { p, log } = await fresh(); const id = idOf(mod, 12);
        await openById(p, mod, 12);
        await setField(p, mod, 'subject', `${M.subj(13)} BOTH`); await attach(p, mod); stub.failUpload = true;
        await p.route(M.apiGlob, r => r.request().method() === 'GET' && new URL(r.request().url()).pathname === M.listGet ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); await p.waitForTimeout(1800);
        const st = await fu(p);
        note(`${L}-15 banner`, fuNote(st));
        check(`${L}-15 ONE banner holds both facts (upload failure and reload failure) with the retry button, NO toast`, dbSubject(mod, 12) === `${M.subj(13)} BOTH` && oneBanner(st, { created: false, reason: /上傳附件失敗/ }) && /重新載入清單失敗/.test(st.text), fuNote(st));
        stub.failUpload = false; await p.unroute(M.apiGlob);
        await retryBtn(p).click(); const gone = await modalGone(p);
        check(`${L}-15 the files-only retry finishes it: no second record write, one file stored, the modal closes`, gone && count(log, 'PUT', M.put(id), 200) === 1 && stub.files.length === 1 && stub.files[0].entity_id === id, `${gone} put200=${count(log, 'PUT', M.put(id), 200)} stored=${stub.files.length}`);
        await p.close();
    });

    // ── 16. REAL files (no stub): the isolated stack stores uploads in its own run directory ─────────────────────────────────────────────
    await step(`${L}-16`, async () => {
        const { p } = await fresh(userReal); const id = idOf(mod, 14);
        await openById(p, mod, 14);
        await setField(p, mod, 'subject', `${M.subj(15)} REAL`);
        await attach(p, mod, 'real.txt');
        // every photo slot the UI offers, with its real category (the server now accepts exactly these per module)
        const slots = { ncr: [['defectPhoto', 'ncr-defect-photos'], ['progressPhoto', 'ncr-progress-photos'], ['improvementPhoto', 'ncr-improvement-photos']], obs: [['defectPhoto', 'obs-defect-photos'], ['improvementPhoto', 'obs-improvement-photos']], noi: [] }[mod];
        for (const [cat, id] of slots) await attach(p, mod, `${cat}.png`, `#attachment-upload-${id}`, 'image/png');
        await saveBtn(p).click(); const gone = await modalGone(p);
        const cats = sql(`select group_concat(category) from (select category from attachments where entity_type='${mod}' and entity_id='${idOf(mod, 14)}' and is_deleted=0 order by category)`);
        check(`${L}-16 every slot's files were stored under exactly its own category`, gone && cats === ['attachment', ...slots.map(x => x[0])].sort().join(','), cats);
        const rowCount = () => Number(sql(`select count(*) from attachments where entity_type='${mod}' and entity_id='${id}' and is_deleted=0`));
        check(`${L}-16 a real upload through the UI: the modal closes, the rows are stored`, gone && rowCount() === 1 + slots.length && dbSubject(mod, 14) === `${M.subj(15)} REAL`, `${gone} rows=${rowCount()}`);
        const csrf = (await userReal.cookies()).find(c => c.name === 'csrf_token')?.value;
        const list = await (await userReal.request.fetch(`${BASE}/api/files/by-entity?entity_type=${mod}&entity_id=${id}`)).json();
        const realTxt = list.find(x => x.file_name === 'real.txt');
        const dl = realTxt ? await userReal.request.fetch(realTxt.file_url.replace(/^https?:\/\/[^/]+/, BASE)) : null;
        check(`${L}-16 the real API lists it and the real download returns the bytes`, list.length === 1 + slots.length && list.some(x => x.file_name === 'real.txt') && dl && dl.status() === 200 && (await dl.text()) === 'hello', JSON.stringify(list.map(x => x.file_name)));
        const up2 = (eid, etype = mod) => userReal.request.fetch(`${BASE}/api/files/upload`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, multipart: { entity_type: etype, entity_id: eid, category: 'attachment', files: { name: 'y.txt', mimeType: 'text/plain', buffer: Buffer.from('y') } } });
        const before = Number(sql('select count(*) from attachments'));
        const missing = await up2('does-not-exist');
        check(`${L}-16 a target that does not exist: real 404, nothing stored`, missing.status() === 404 && Number(sql('select count(*) from attachments')) === before, `${missing.status()}`);
        if (mod === 'noi') {
            const nid = idOf(mod, 15);
            sqlWrite(`update noi set status='Closed' where id='${nid}'`);
            const locked = await up2(nid);
            check(`${L}-16 a Closed NOI: real 409 "locked", nothing stored (no permission lifts it)`, locked.status() === 409 && Number(sql('select count(*) from attachments')) === before, `${locked.status()} ${(await locked.text()).slice(0, 100)}`);
        }
        await p.close();
    });
}

// ══ NCR only: closing AFTER the due date (2026-09-21) ═══════════════════════════════════════════════════════════════════════════════
if ((process.argv[4] || 'ncr,obs,noi').split(',').includes('ncr') && (!onlySteps.length || onlySteps.includes('17'))) {
    const readyId = i => seed.ncr_ready[i];
    const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
    const closedHint = p => p.locator('[data-sonner-toast]', { hasText: 'NCR closed. You may now update NOI' });
    const row = id => sql(`select status||'|'||raiseDate||'|'||ifnull(dueDate,'')||'|'||ifnull(closeoutDate,'')||'|'||ifnull(closedBy,'') from ncr where id='${id}'`);
    async function openReady(p, i) {
        const ref = sql(`select documentNumber from ncr where id='${readyId(i)}'`);
        await p.goto(BASE + '/dashboard'); await p.waitForTimeout(1500);
        // arrive the way a user does from another screen (Follow Up, ...): an IN-PAGE navigation to the deep link. Closing then goes "back" to
        // that screen inside the same document, so the toasts survive; a full page.goto would make history.go(-1) reload the page and wipe them.
        await p.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref);
        await modalOf(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
    }
    const verdictYes = async p => { await tab(p, '驗證與結案'); await p.locator('[class*=modalContent] [name=effectivenessVerified]').first().selectOption('Yes'); await p.waitForTimeout(200); };
    const chipCounts = async p => { await p.goto(BASE + '/ncr'); await p.waitForTimeout(1500); return (await p.locator('[class*=chip]').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim()); };

    await step('NCR-17a', async () => {                       // a late closure: saved, due date untouched, hint only AFTER the answer, statistics as for any closure
        const { p, log } = await fresh(userReal); const id = readyId(0);
        const chipsBefore = await chipCounts(p);
        await openReady(p, 0); await verdictYes(p);
        check('NCR-17a the form says nothing about "late" before there is a close-out date', (await p.locator('[data-late-closure]').count()) === 0);
        let sent = null;
        await p.route('**/api/ncr/**', async r => { if (r.request().method() === 'PUT') { sent = r.request().postDataJSON(); await new Promise(res => setTimeout(res, 1500)); } await r.continue(); });
        await saveBtn(p).click(); await p.waitForTimeout(700);
        check('NCR-17a while the request is still in flight there is NO "NCR closed" hint and the modal is still open', (await closedHint(p).count()) === 0 && (await modalOf(p).isVisible()));
        const gone = await modalGone(p, 8000); await p.waitForTimeout(600);
                check('NCR-17a the save is confirmed (PUT 200), the request carried the ORIGINAL due date', gone && count(log, 'PUT', `/api/ncr/${id}/`, 200) === 1 && sent && sent.dueDate === '2025-01-16' && sent.status === 'Closed', JSON.stringify(sent && { s: sent.status, d: sent.dueDate, c: sent.closeoutDate }));
        check('NCR-17a stored: Closed, raise 2025-01-02, due 2025-01-16 UNCHANGED, close-out = today (after the due date), closedBy set', new RegExp(`^Closed\\|2025-01-02\\|2025-01-16\\|${todayStr}\\|\\d+$`).test(row(id)), row(id));
        check('NCR-17a now — and only now — the "NCR closed" hint appears, exactly once', (await closedHint(p).count()) === 1, await closedHint(p).allInnerTexts().catch(() => ''));
        await p.unroute('**/api/ncr/**');
        const chipsAfter = await chipCounts(p);
        note('NCR-17a list chips before / after', `${JSON.stringify(chipsBefore)} / ${JSON.stringify(chipsAfter)}`);
        const num = (chips, label) => Number((chips.map(c => new RegExp('^' + label + ' (\\d+)$').exec(c)).find(Boolean) || [])[1]);
        check('NCR-17a the list statistics moved like any closure: one fewer open, one more closed, same total, no separate "overdue" figure invented', num(chipsAfter, '已關閉') === num(chipsBefore, '已關閉') + 1 && num(chipsAfter, '開啟') === num(chipsBefore, '開啟') - 1 && num(chipsAfter, '全部') === num(chipsBefore, '全部') && num(chipsAfter, '進行中') === num(chipsBefore, '進行中'), JSON.stringify(chipsAfter));
        await openReady(p, 0); await tab(p, '驗證與結案');
        check('NCR-17a reopening it shows the fact: closed late, due date as it was', (await p.locator('[data-late-closure]').count()) === 1 && /2025-01-16/.test(await p.locator('[data-late-closure]').innerText()) && /逾期結案/.test(await p.locator('[data-late-closure]').innerText()), await p.locator('[data-late-closure]').innerText().catch(() => 'none'));
        await p.close();
    });

    await step('NCR-17b', async () => {                       // a REAL backend refusal (valid dates, close-out before the raise date): nothing shown as closed, nothing changed, input kept
        const { p, log } = await fresh(userReal); const id = readyId(1);
        await openReady(p, 1); await verdictYes(p);
        const co = p.locator('[class*=modalContent] [name=closeoutDate]').first();
        await co.fill('2024-12-01');
        const before = row(id);
        await saveBtn(p).click(); await p.waitForTimeout(1800);
        const n = await notices(p);
        const put = log.filter(r => r.m === 'PUT');
        note('NCR-17b answer / toast', `${put.map(r => r.status)} / ${n.join(' | ')}`);
        check('NCR-17b the real backend refused (422)', put.length === 1 && put[0].status === 422, JSON.stringify(put));
        check('NCR-17b one friendly notice names the field, no "NCR closed" hint at any point', n.length === 1 && /結案日期：早於提出日期/.test(n[0]) && (await closedHint(p).count()) === 0, n.join(' | '));
        check('NCR-17b the modal is open and the typed close-out date and the verdict are still there', (await modalOf(p).isVisible()) && (await co.inputValue()) === '2024-12-01' && (await p.locator('[class*=modalContent] [name=effectivenessVerified]').first().inputValue()) === 'Yes');
        check('NCR-17b nothing changed in the database and the button works again', row(id) === before && row(id).startsWith('Open|') && (await saveBtn(p).isEnabled()), row(id));
        await co.fill('2025-03-01');
        await saveBtn(p).click(); const gone = await modalGone(p, 8000); await p.waitForTimeout(600);
        check('NCR-17b corrected to a late date: saved, due date unchanged, the hint appears once', gone && new RegExp('^Closed\\|2025-01-02\\|2025-01-16\\|2025-03-01\\|\\d+$').test(row(id)) && (await closedHint(p).count()) === 1, row(id));
        await p.close();
    });

    await step('NCR-17c', async () => {                       // network failure while closing: no hint, input kept, the retry closes it
        const { p, log } = await fresh(userReal); const id = readyId(2);
        await openReady(p, 2); await verdictYes(p);
        const co = p.locator('[class*=modalContent] [name=closeoutDate]').first();
        await co.fill('2025-02-10');
        await p.route('**/api/ncr/**', r => r.request().method() === 'PUT' ? r.abort('failed') : r.continue());
        await saveBtn(p).click(); await p.waitForTimeout(1500);
        const n = await notices(p);
        check('NCR-17c network failure: one network notice, no "NCR closed" hint, modal open, close-out date kept, DB unchanged', n.length === 1 && /網路連線失敗/.test(n[0]) && (await closedHint(p).count()) === 0 && (await modalOf(p).isVisible()) && (await co.inputValue()) === '2025-02-10' && row(id).startsWith('Open|'), `${n.join(' | ')} ${row(id)}`);
        await p.unroute('**/api/ncr/**');
        await saveBtn(p).click(); const gone = await modalGone(p, 8000); await p.waitForTimeout(600);
        check('NCR-17c retry: closed late (2025-02-10 > due 2025-01-16), due date unchanged, the hint appears once', gone && new RegExp('^Closed\\|2025-01-02\\|2025-01-16\\|2025-02-10\\|\\d+$').test(row(id)) && (await closedHint(p).count()) === 1 && count(log, 'PUT', `/api/ncr/${id}/`, 200) === 1, row(id));
        await p.close();
    });
}

// ══ NCR only: closing needs improvement photos the SERVER holds — from a real upload to a real closure, NO file stub (2026-09-21) ════════
if ((process.argv[4] || 'ncr,obs,noi').split(',').includes('ncr') && (!onlySteps.length || onlySteps.includes('19'))) {
    const photoRows = id => sql(`select category||':'||file_name||':deleted='||is_deleted||':'||file_path from attachments where entity_type='ncr' and entity_id='${id}' order by uploaded_at`);
    const ncrRow = id => sql(`select status||'|'||ifnull(dueDate,'')||'|'||ifnull(closeoutDate,'')||'|'||ifnull(closedBy,'')||'|'||ifnull(improvementPhotos,'') from ncr where id='${id}'`);
    const auditRows = id => sql(`select group_concat(action) from (select action from audit_logs where entity_id='${id}' order by id)`);
    const closedHint = p => p.locator('[data-sonner-toast]', { hasText: 'NCR closed. You may now update NOI' });
    async function openNo(p, i) {
        const ref = sql(`select documentNumber from ncr where id='${seed.ncr_nophoto[i]}'`);
        await p.goto(BASE + '/dashboard'); await p.waitForTimeout(1500);
        await p.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref);
        await modalOf(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
    }
    const verdict = (p, v) => p.locator('[class*=modalContent] [name=effectivenessVerified]').first().selectOption(v);
    const openTab = async (p, label) => { await p.locator('[class*=modalContent] button', { hasText: label }).first().click(); await p.waitForTimeout(200); };
    const improvementInput = '#attachment-upload-ncr-improvement-photos';
    const PNG_FILE = process.env.REAL_PNG;                                    // a real PNG on disk (created by the caller); uploaded as it is, nothing stubbed

    await step('NCR-19a', async () => {                       // no photo stored: refused BEFORE anything is written, with the actionable message; a photo still pending does not count
        const { p, log } = await fresh(userReal); const id = seed.ncr_nophoto[0];
        await openNo(p, 0); await openTab(p, '驗證與結案'); await verdict(p, 'Yes');
        const before = ncrRow(id), auditBefore = auditRows(id);
        await saveBtn(p).click(); await p.waitForTimeout(1200);
        let n = await notices(p);
        note('NCR-19a no photo — toast', n.join(' | '));
        check('NCR-19a no photo anywhere: ONE notice that says what to do, no request was sent, modal open, DB and audit untouched', n.length === 1 && /尚無法結案/.test(n[0]) && /先儲存並上傳改善照片/.test(n[0]) && log.filter(r => r.m !== 'GET').length === 0 && (await modalOf(p).isVisible()) && ncrRow(id) === before && auditRows(id) === auditBefore, `${n.join(' | ')} ${JSON.stringify(log.filter(r => r.m !== 'GET'))}`);
        await openTab(p, '照片與附件'); await p.locator(improvementInput).setInputFiles(PNG_FILE); await p.waitForTimeout(400);
        await saveBtn(p).click(); await p.waitForTimeout(1200);
        n = await notices(p);
        check('NCR-19a a photo that is only PENDING in the form does not count either: nothing written, nothing uploaded, the pending file is still listed, verdict still Yes', log.filter(r => r.m !== 'GET').length === 0 && photoRows(id) === '' && (await modalOf(p).innerText()).includes('real.png') && (await modalOf(p).isVisible()) && ncrRow(id) === before, `${n.join(' | ')} ${JSON.stringify(log.filter(r => r.m !== 'GET'))} rows=${photoRows(id)}`);
        await p.close();
    });

    await step('NCR-19b', async () => {                       // step 1 of the flow: a normal (non-closing) save uploads the photo through the REAL file API; step 2: the close
        const { p, log } = await fresh(userReal); const id = seed.ncr_nophoto[1];
        await openNo(p, 1);
        await openTab(p, '照片與附件'); await p.locator(improvementInput).setInputFiles(PNG_FILE); await p.waitForTimeout(400);
        await saveBtn(p).click(); const gone = await modalGone(p, 10000); await p.waitForTimeout(600);
        const rows = photoRows(id);
        note('NCR-19b attachment rows after step 1', rows);
        check('NCR-19b step 1 (verdict untouched): the record is saved, the photo is uploaded once through the real API, the modal closes', gone && count(log, 'PUT', `/api/ncr/${id}/`, 200) === 1 && count(log, 'POST', '/api/files/upload', 200) === 1, `${gone} ${JSON.stringify(log.filter(r => r.m !== 'GET'))}`);
        const m = /^improvementPhoto:real\.png:deleted=0:(ncr\/[0-9a-f]{32}\.png)$/.exec(rows);
        check('NCR-19b one attachment row (improvementPhoto, not deleted, ncr/<hex>.png) and the physical file exists with the PNG bytes; the NCR is still Open and its own improvementPhotos column stays empty',
            !!m && existsSync(`${stack.root}/uploads/${m[1]}`) && readBytes(`${stack.root}/uploads/${m[1]}`).subarray(1, 4).toString() === 'PNG' && ncrRow(id).startsWith('Open|') && /\|(\[\])?$/.test(ncrRow(id)), `${rows} ${ncrRow(id)}`);
        // step 2: reopen, verdict Yes, save → closed (late: the due date is in 2025)
        const { p: p2, log: log2 } = await fresh(userReal);
        await openNo(p2, 1); await openTab(p2, '驗證與結案'); await verdict(p2, 'Yes');
        await saveBtn(p2).click(); const gone2 = await modalGone(p2, 10000); await p2.waitForTimeout(800);
        const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
        check('NCR-19b step 2: ONE save request (no upload), 200, the modal closes, and it is Closed LATE — due date 2025-01-16 unchanged, close-out today, closedBy set',
            gone2 && count(log2, 'PUT', `/api/ncr/${id}/`, 200) === 1 && log2.filter(r => r.m === 'POST' && /files/.test(r.path)).length === 0 && new RegExp(`^Closed\\|2025-01-16\\|${today}\\|\\d+\\|`).test(ncrRow(id)), `${gone2} ${ncrRow(id)}`);
        check('NCR-19b the "NCR closed" hint appears once (after the answer), the audit trail has the UPDATE and STATUS_CHANGE rows of the closure, and the attachment row is unchanged', (await closedHint(p2).count()) === 1 && /UPDATE,UPDATE,STATUS_CHANGE|^UPDATE,STATUS_CHANGE$/.test(auditRows(id) || '') && photoRows(id) === rows, `${await closedHint(p2).count()} ${auditRows(id)}`);
        const dl = m ? await userReal.request.get(`${BASE}/api/files/download/${m[1]}`) : null;
        check('NCR-19b the photo is downloadable through the authenticated endpoint after the closure and is the uploaded file', !!dl && dl.status() === 200 && (await dl.body()).equals(readBytes(PNG_FILE)), dl ? dl.status() : 'no row');
        await p2.close(); await p.close().catch(() => { });
    });

    await step('NCR-19c', async () => {                       // the row exists but the server cannot use it (file gone): the server's reason is shown, nothing is closed, input kept
        const { p, log } = await fresh(userReal); const id = seed.ncr_nophoto[2];
        sqlWrite(`insert into attachments (id, entity_type, entity_id, file_name, file_path, file_size, mime_type, category, uploaded_by, uploaded_at, is_deleted) values ('ghost-${id.slice(0, 8)}', 'ncr', '${id}', 'ghost.png', 'ncr/00000000000000000000000000000000.png', 10, 'image/png', 'improvementPhoto', 'accept', '2026-09-21T00:00:00', 0)`);
        await openNo(p, 2); await openTab(p, '驗證與結案'); await verdict(p, 'Yes');
        const before = ncrRow(id), auditBefore = auditRows(id);
        await saveBtn(p).click(); await p.waitForTimeout(1800);
        const n = await notices(p); const put = log.filter(r => r.m === 'PUT');
        note('NCR-19c answer / toast', `${put.map(r => r.status)} / ${n.join(' | ')}`);
        check('NCR-19c the real backend refused (400) and the notice names the unusable file and why; no "NCR closed" hint', put.length === 1 && put[0].status === 400 && n.length === 1 && /ghost\.png/.test(n[0]) && /missing on the server/.test(n[0]) && (await closedHint(p).count()) === 0, `${put.map(r => r.status)} ${n.join(' | ')}`);
        check('NCR-19c the modal stays open with the verdict still Yes, the record and the audit trail are unchanged, and the save button works again', (await modalOf(p).isVisible()) && (await p.locator('[class*=modalContent] [name=effectivenessVerified]').first().inputValue()) === 'Yes' && ncrRow(id) === before && auditRows(id) === auditBefore && (await saveBtn(p).isEnabled()), ncrRow(id));
        await p.close();
    });
}

// ══ NCR only: the attachment LIST is requested at its exact route — no 307, in the repository's own dev-proxy setup (2026-09-21) ═══════
// Scenario 19 (round 18) ran behind a different front-end proxy than the repository's vite.config.js; the stack for THIS scenario serves port 3099
// with that very config (changeOrigin + the 307 Location rewrite; only host / port / target overridden), so what is proven here is the real setup.
if ((process.argv[4] || 'ncr,obs,noi').split(',').includes('ncr') && (!onlySteps.length || onlySteps.includes('20'))) {
    const PNG_FILE = process.env.REAL_PNG;
    const fileTraffic = log => log.filter(r => /^\/api\/files\//.test(r.path));
    const bad = log => fileTraffic(log).filter(r => r.status === 307 || r.status === 'FAILED' || (typeof r.status === 'number' && r.status >= 400));
    const lists = log => fileTraffic(log).filter(r => r.path === '/api/files/by-entity');
    const rowOf = id => sql(`select status||'|'||ifnull(dueDate,'')||'|'||ifnull(closeoutDate,'')||'|'||ifnull(closedBy,'') from ncr where id='${id}'`);
    async function openRef(p, id) {
        const ref = sql(`select documentNumber from ncr where id='${id}'`);
        await p.goto(BASE + '/dashboard'); await p.waitForTimeout(1500);
        await p.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref);
        await modalOf(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
    }
    const goTab = async (p, label) => { await p.locator('[class*=modalContent] button', { hasText: label }).first().click(); await p.waitForTimeout(1200); };

    await step('NCR-20a', async () => {                       // list + print of a record that HAS a stored photo
        const { p, log } = await fresh(userReal); const id = seed.ncr_ready[0];
        await p.addInitScript(() => { window.print = () => { window.__printCalled = true; }; });
        await openRef(p, id); await goTab(p, '照片與附件');
        check('NCR-20a opening the record and its photo tab: the list route was called (4 categories) and NOT ONE file request was redirected, failed or refused', lists(log).length >= 4 && bad(log).length === 0, JSON.stringify(fileTraffic(log).map(r => `${r.path}:${r.status}`).slice(0, 12)));
        check('NCR-20a the stored improvement photo is listed in the form (seeded-after.png)', (await modalOf(p).innerText()).includes('seeded-after.png'));
        await p.locator('[class*=modalContent] [class*=printButton]').first().click(); await p.waitForTimeout(2500);
        const imgs = await p.evaluate(() => [...document.querySelectorAll('img')].filter(i => /\/api\/files\/download\//.test(i.getAttribute('src') || '')).map(i => ({ ok: i.complete && i.naturalWidth > 0 })));
        const printed = await p.evaluate(() => !!window.__printCalled);
        check('NCR-20a print view: the print step ran (window.print reached) and the stored photo is rendered in it (an image loaded from the authenticated download URL)', printed && imgs.length >= 1 && imgs.some(i => i.ok), JSON.stringify({ printed, imgs }));
        check('NCR-20a and still no redirected / failed file request after the print data was gathered', bad(log).length === 0 && lists(log).length >= 8, `${lists(log).length} lists; bad=${JSON.stringify(bad(log))}`);
        await p.close();
    });

    await step('NCR-20b', async () => {                       // save the photo -> reopen and SEE it -> late closure -> download after closing
        const { p, log } = await fresh(userReal); const id = seed.ncr_nophoto[3];
        await openRef(p, id); await goTab(p, '照片與附件');
        await p.locator('#attachment-upload-ncr-improvement-photos').setInputFiles(PNG_FILE); await p.waitForTimeout(400);
        await saveBtn(p).click(); const gone = await modalGone(p, 10000); await p.waitForTimeout(600);
        check('NCR-20b step 1 (plain save): record saved, photo uploaded once, modal closes, no failed / redirected file request', gone && count(log, 'PUT', `/api/ncr/${id}/`, 200) === 1 && count(log, 'POST', '/api/files/upload', 200) === 1 && bad(log).length === 0, JSON.stringify(fileTraffic(log).map(r => `${r.m} ${r.path}:${r.status}`)));
        const { p: p2, log: log2 } = await fresh(userReal);
        await openRef(p2, id); await goTab(p2, '照片與附件');
        check('NCR-20b step 2: reopening the record shows the stored photo in the improvement-photo section (list answered directly, 200)', (await modalOf(p2).innerText()).includes('real.png') && lists(log2).length >= 4 && bad(log2).length === 0, JSON.stringify(fileTraffic(log2).map(r => `${r.path}:${r.status}`).slice(0, 8)));
        await goTab(p2, '驗證與結案'); await p2.locator('[class*=modalContent] [name=effectivenessVerified]').first().selectOption('Yes');
        await saveBtn(p2).click(); const gone2 = await modalGone(p2, 10000); await p2.waitForTimeout(800);
        check('NCR-20b step 3: the closing save passes the front-end photo check (it READ the stored list) and the server: ONE request, 200, Closed LATE, due date 2025-01-16 unchanged', gone2 && count(log2, 'PUT', `/api/ncr/${id}/`, 200) === 1 && lists(log2).length >= 5 && /^Closed\|2025-01-16\|\d{4}-\d\d-\d\d\|\d+$/.test(rowOf(id)), `${rowOf(id)} lists=${lists(log2).length}`);
        const path = sql(`select file_path from attachments where entity_type='ncr' and entity_id='${id}' and category='improvementPhoto' and is_deleted=0`);
        const dl = await userReal.request.get(`${BASE}/api/files/download/${path}`);
        check('NCR-20b step 4: after the closure the photo is still listed when the record is opened again, and downloads (200, the uploaded bytes)', dl.status() === 200 && (await dl.body()).equals(readBytes(PNG_FILE)), `${dl.status()} ${path}`);
        const { p: p3, log: log3 } = await fresh(userReal);
        await openRef(p3, id); await goTab(p3, '照片與附件');
        check('NCR-20b the closed record lists its photo too, and every file request of the three pages went straight to the route (no 307 anywhere)', (await modalOf(p3).innerText()).includes('real.png') && bad(log3).length === 0 && bad(log).length === 0 && bad(log2).length === 0);
        await p.close().catch(() => { }); await p2.close().catch(() => { }); await p3.close();
    });
}

// ══ NCR only: the backend refuses to close without ncr:close:all (2026-09-21) — a REAL 403 ═══════════════════════════════════════════
if ((process.argv[4] || 'ncr,obs,noi').split(',').includes('ncr') && (!onlySteps.length || onlySteps.includes('18'))) {
    await step('NCR-18', async () => {
        const { p, log } = await fresh(noclose); const id = seed.ncr_ready[3];
        const row = () => sql(`select status||'|'||ifnull(closeoutDate,'')||'|'||ifnull(closedBy,'')||'|'||ifnull(dueDate,'') from ncr where id='${id}'`);
        const ref = sql(`select documentNumber from ncr where id='${id}'`);
        await p.goto(BASE + '/dashboard'); await p.waitForTimeout(1500);
        await p.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref);
        await modalOf(p).waitFor({ timeout: 15000 }); await p.waitForTimeout(500);
        await tab(p, '驗證與結案');
        const verdict = p.locator('[class*=modalContent] [name=effectivenessVerified]').first();
        await verdict.selectOption('Yes');
        const co = p.locator('[class*=modalContent] [name=closeoutDate]').first();
        await co.fill('2025-03-01');
        const before = row(); const auditBefore = sql("select count(*) from audit_logs where entity_type='NCR'");
        await saveBtn(p).click(); await p.waitForTimeout(1800);
        const n = await notices(p); const put = log.filter(r => r.m === 'PUT');
        note('NCR-18 answer / toast', `${put.map(r => r.status)} / ${n.join(' | ')}`);
        check('NCR-18 the real backend answers 403 (this account may update but not close)', put.length === 1 && put[0].status === 403, JSON.stringify(put));
        check('NCR-18 ONE notice with the reason "Required: ncr:close:all" and "not saved"; no "NCR closed" hint at any point',
            n.length === 1 && /ncr:close:all/.test(n[0]) && /尚未保存/.test(n[0]) && (await p.locator('[data-sonner-toast]', { hasText: 'NCR closed. You may now update NOI' }).count()) === 0, n.join(' | '));
        check('NCR-18 the window stays open and the typed close-out date and the verdict are still there', (await modalOf(p).isVisible()) && (await co.inputValue()) === '2025-03-01' && (await verdict.inputValue()) === 'Yes');
        check('NCR-18 nothing changed: record, audit log (the refusal wrote none), and the button works again', row() === before && before.startsWith('Open|') && sql("select count(*) from audit_logs where entity_type='NCR'") === auditBefore && (await saveBtn(p).isEnabled()), row());
        // the same account, directly against the real API: PUT close and POST created-as-Closed are refused too
        const csrf = (await noclose.cookies()).find(c => c.name === 'csrf_token')?.value;
        const rows0 = Number(sql('select count(*) from ncr'));
        const put2 = await noclose.request.fetch(`${BASE}/api/ncr/${id}/`, { method: 'PUT', headers: { 'X-CSRF-Token': csrf }, data: { status: 'Closed', effectivenessVerified: 'Yes', raiseDate: '2025-01-02', dueDate: '2025-01-16' } });
        const post2 = await noclose.request.fetch(`${BASE}/api/ncr/`, { method: 'POST', headers: { 'X-CSRF-Token': csrf }, data: { vendor: 'Accept Co', description: 'born closed', rev: '', submit: 'v', status: 'Closed', raiseDate: '2025-01-02', severity: 'Minor', subject: 'BORN CLOSED' } });
        check('NCR-18 directly through the API: PUT status Closed → 403, POST with status Closed → 403, no row created', put2.status() === 403 && post2.status() === 403 && Number(sql('select count(*) from ncr')) === rows0 && row() === before, `${put2.status()} ${post2.status()}`);
        // an ordinary save (not a closure) still works for the same account: take the verdict back and save
        await verdict.selectOption('Pending');
        await saveBtn(p).click(); const gone = await modalGone(p, 8000);
        check('NCR-18 the same account can still save a non-closing edit (verdict back to Pending): saved, still Open', gone && row().startsWith('Open|'), row());
        await p.close();
    });
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
