// KM (Knowledge Base) business review — real browser, real screens + API, isolated stack (2026-09-24).
// KM has no status/workflow — a wiki-style article system with per-chapter optimistic locking via
// version_no (repositories/km_repository.py::update — stale version_no raises ValueError -> HTTP 409,
// confirmed by reading services/km_service.py::update_article). Covers: create, view-only permission
// separation, and the optimistic-lock conflict (two "concurrent" edits, one with a stale version_no).
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
async function apiCall(p, method, path, body) {
    return await p.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let j = null; try { j = await res.json(); } catch (_) {}
        return { status: res.status, body: j };
    }, { method, path, body });
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();

const viewer = await login('km_viewer');
const editor = await login('km_editor');

let articleId = null;

// ══ 1. km_viewer (view-only): confirm no Add button, and a direct API create attempt is blocked ═══════
try {
    await viewer.goto(UI + '/km'); await viewer.waitForTimeout(1200);
    const addBtnCount = await viewer.locator('button', { hasText: /新增|Add/ }).count();
    note('km_viewer (view-only): Add button visible', addBtnCount > 0);
    const createAttempt = await apiCall(viewer, 'POST', '/api/km/', { title: 'Viewer bypass attempt', content: 'x' });
    note('km_viewer direct API POST attempt (should be blocked)', `HTTP ${createAttempt.status}`);
} catch (e) { fail('1. km_viewer create blocked', e); }

// ══ 2. Create (real screen, km_editor) — title only, content left as Quill's default empty state ═════
try {
    await editor.goto(UI + '/km'); await editor.waitForTimeout(1200);
    await editor.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(500);
    await modal(editor).locator('[name=title]').fill('KM review article');
    const beforeCount = sql(`SELECT COUNT(*) FROM km_articles;`);
    await modal(editor).locator('button[type=submit]').first().click();
    await editor.waitForTimeout(1500);
    const afterCount = sql(`SELECT COUNT(*) FROM km_articles;`);
    note('km_articles count before/after real-screen create', `${beforeCount} -> ${afterCount}`);
    const created = sql(`SELECT id, title, version_no FROM km_articles ORDER BY rowid DESC LIMIT 1;`);
    note('article created via real screen (id|title|version_no)', created);
    articleId = created.split('|')[0];
} catch (e) { fail('2. Create via real screen', e); }

// ══ 3. km_viewer opens the article — confirm read-only (no edit affordance visible) ══════════════════
try {
    if (!articleId) throw new Error('no article from step 2');
    await viewer.goto(UI + '/km'); await viewer.waitForTimeout(1200);
    await viewer.locator('tr', { hasText: 'KM review article' }).first().click().catch(async () => {
        await viewer.locator('text=KM review article').first().click();
    });
    await viewer.waitForTimeout(800);
    const editBtnVisible = await viewer.locator('button', { hasText: /編輯|Edit/i }).count();
    note('km_viewer opens the article — an Edit affordance is visible', editBtnVisible > 0);
} catch (e) { fail('3. km_viewer read-only view', e); }

// ══ 4. Optimistic lock: two "concurrent" edits — one with the CURRENT version_no (succeeds), one with a
//        STALE version_no (409) ═══════════════════════════════════════════════════════════════════════
try {
    if (!articleId) throw new Error('no article');
    const currentVersion = sql(`SELECT version_no FROM km_articles WHERE id='${articleId}';`);
    note('4: current version_no before the conflict test', currentVersion);

    // First writer: correct version_no -> should succeed and bump the version.
    const goodEdit = await apiCall(editor, 'PUT', `/api/km/${articleId}`, { title: 'KM review article (edited by writer A)', version_no: Number(currentVersion) });
    note('4a: writer A edits with the CURRENT version_no', `HTTP ${goodEdit.status}`);
    const versionAfterA = sql(`SELECT version_no, title FROM km_articles WHERE id='${articleId}';`);
    note('4a: version_no/title after writer A\'s successful edit', versionAfterA);

    // Second writer: still using the OLD (now stale) version_no -> should 409.
    const staleEdit = await apiCall(editor, 'PUT', `/api/km/${articleId}`, { title: 'KM review article (edited by writer B, stale)', version_no: Number(currentVersion) });
    note('4b: writer B edits with the now-STALE version_no (simulating a concurrent edit)', `HTTP ${staleEdit.status} body=${JSON.stringify(staleEdit.body).slice(0, 250)}`);
    const versionAfterB = sql(`SELECT version_no, title FROM km_articles WHERE id='${articleId}';`);
    note('4b: version_no/title after the rejected stale edit (should be UNCHANGED from writer A\'s result)', versionAfterB);
} catch (e) { fail('4. Optimistic lock conflict', e); }

// ══ 5. History: confirm version history is queryable and shows the edit ══════════════════════════════
try {
    if (!articleId) throw new Error('no article');
    const historyRes = await apiCall(editor, 'GET', `/api/km/${articleId}/history`, null);
    note('5: article history entries count', Array.isArray(historyRes.body) ? historyRes.body.length : `HTTP ${historyRes.status}`);
} catch (e) { fail('5. History query', e); }

await browser.close();
console.log('DONE');
