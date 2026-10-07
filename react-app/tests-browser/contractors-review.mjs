// Contractors business review — real browser, real screens + API, isolated stack (2026-09-24).
// Contractors is the most-referenced cross-module dependency this whole review (PQP/NOI/NCR/ITP/FAT
// all need contractors:view:all for their own dropdowns), but had never itself been screen-tested.
// Covers: view-only permission gate on the Add button (contrast with KM's ungated one), create, and
// delete protection when referenced by another module (validators.check_contractor_references).
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
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent], [class*=modal]').first();

const viewer = await login('contractor_viewer');
const manager = await login('contractor_manager');

let contractorId = null;

// ══ 1. Permission gate on the Add entry point (contrast with KM's ungated button) ══════════════════
try {
    await viewer.goto(UI + '/contractors'); await viewer.waitForTimeout(1200);
    const addBtnCount = await viewer.locator('button', { hasText: /新增|Add/ }).count();
    note('contractor_viewer (view-only): Add button visible', addBtnCount > 0);
    const createAttempt = await apiCall(viewer, 'POST', '/api/contractors/', { name: 'Viewer bypass', package: 'X', abbreviation: 'VB', scope: 'X', contactPerson: 'X', email: 'x@x.com', phone: '000', address: 'X' });
    note('contractor_viewer direct API create attempt', `HTTP ${createAttempt.status}`);
} catch (e) { fail('1. Permission gate', e); }

// ══ 2. Create (real screen, contractor_manager) ══════════════════════════════════════════════════════
try {
    await manager.goto(UI + '/contractors'); await manager.waitForTimeout(1200);
    await manager.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(manager).waitFor({ timeout: 10000 });
    await manager.waitForTimeout(500);
    const m = modal(manager);
    async function fillByLabel(labelText, value) {
        const label = m.locator('label', { hasText: labelText }).first();
        const field = label.locator('xpath=following-sibling::*[self::input or self::textarea][1]');
        await field.fill(value);
    }
    await fillByLabel('Package', 'Review Package');
    await fillByLabel('承包商名稱', 'Contractor Review Co');
    await fillByLabel('廠商代號', 'CRC');
    await fillByLabel('工作範圍', 'Review scope');
    await fillByLabel('聯絡人', 'Review Contact');
    await fillByLabel('電子郵件', 'review@example.com');
    await fillByLabel('電話', '0912345678');
    await fillByLabel('地址', 'Review address');
    await m.locator('button[type=submit]').first().click();
    await manager.waitForTimeout(1200);
    const created = sql(`SELECT id, name FROM contractors ORDER BY rowid DESC LIMIT 1;`);
    note('Contractor created via real screen (id|name)', created);
    contractorId = created.split('|')[0];
} catch (e) { fail('2. Create', e); }

// ══ 3. Delete protection: reference this contractor from a real ITP, then attempt delete ═════════════
try {
    if (!contractorId) throw new Error('no contractor from step 2');
    const itpRes = await apiCall(manager, 'POST', '/api/itp/', { vendor: 'Contractor Review Co', description: 'Referencing ITP', rev: '', submit: '', status: 'Pending' });
    note('3a: created a real ITP referencing this contractor', `HTTP ${itpRes.status} vendor_id=${itpRes.body?.vendor_id || 'n/a'}`);
    const delReferenced = await apiCall(manager, 'DELETE', `/api/contractors/${contractorId}`, null);
    note('3a: attempt to delete a REFERENCED contractor', `HTTP ${delReferenced.status} body=${JSON.stringify(delReferenced.body).slice(0, 250)}`);
    const stillThereRef = sql(`SELECT COUNT(*) FROM contractors WHERE id='${contractorId}';`);
    note('3a: row still present after the rejection', stillThereRef);

    // Independent unreferenced contractor for the legitimate-delete comparison.
    const freshRes = await apiCall(manager, 'POST', '/api/contractors/', { name: 'Delete-comparison Co', package: 'X', abbreviation: 'DCC', scope: 'X', contactPerson: 'X', email: 'x@x.com', phone: '000', address: 'X' });
    const freshId = freshRes.body?.id;
    note('3b: created a fresh, unreferenced contractor', `HTTP ${freshRes.status} id=${freshId}`);
    const delUnreferenced = await apiCall(manager, 'DELETE', `/api/contractors/${freshId}`, null);
    note('3b: delete the unreferenced contractor (should succeed)', `HTTP ${delUnreferenced.status}`);
    const stillThereUnref = sql(`SELECT COUNT(*) FROM contractors WHERE id='${freshId}';`);
    note('3b: row count after the legitimate delete (0 = removed)', stillThereUnref);
} catch (e) { fail('3. Delete protection (referenced vs unreferenced)', e); }

await browser.close();
console.log('DONE');
