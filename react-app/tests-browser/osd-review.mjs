// OSD business review — real browser, real screens + targeted API checks, isolated stack (2026-09-24).
// OSD has only 4 permission codes (view/create/update/delete) — no approve code, no tabs, single-page
// form. Covers: create, status transition, Closed-record editability (confirmed via code read to have
// NO backend content lock, unlike OBS/NOI), delete protection (confirmed via code read to have NONE at
// all, unlike ITR's extensive guards), and retry-after-failure via a real validation error.
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

const creator = await login('osd_creator');
const updater = await login('osd_updater');
const deleter = await login('osd_deleter');

let osdId = null, osdDocNo = null;

// ══ 1. Retry after failure: click Save with NOTHING filled (itemDescription required) — expect a clear
//        block, then fill it in and succeed in the SAME session ═══════════════════════════════════════
try {
    await creator.goto(UI + '/osd'); await creator.waitForTimeout(1200);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(500);
    const saveBtn = modal(creator).locator('button', { hasText: /^(儲存|Save)$/ });
    const disabledBefore = await saveBtn.first().isDisabled().catch(() => 'n/a');
    note('1a: Save button disabled state with itemDescription still empty', disabledBefore);
    if (disabledBefore !== false) {
        await saveBtn.first().click().catch(() => {});
        await creator.waitForTimeout(600);
        const toastsBefore = (await creator.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
        note('1a: toast/validation shown when attempting to save without itemDescription', toastsBefore);
    }
    // Retry: fill the required field and save again, same modal instance.
    await modal(creator).locator('[name=itemDescription]').fill('OSD review item description');
    const disabledAfter = await saveBtn.first().isDisabled().catch(() => 'n/a');
    note('1b: Save button disabled state after filling itemDescription (retry, same session)', disabledAfter);
    if (disabledAfter === false) {
        await saveBtn.first().click();
        await creator.waitForTimeout(1200);
        const created = sql(`SELECT id, documentNumber, status FROM osd ORDER BY rowid DESC LIMIT 1;`);
        note('OSD created via real screen after the retry (id|documentNumber|status)', created);
        [osdId, osdDocNo] = created.split('|');
    }
} catch (e) { fail('1. Create + retry after failure', e); }

// ══ 2. Status transition (real screen): Open -> Resolved -> Closed ══════════════════════════════════
try {
    if (!osdId) throw new Error('no OSD from step 1');
    await updater.goto(UI + '/osd'); await updater.waitForTimeout(1200);
    for (const next of ['Resolved', 'Closed']) {
        await updater.locator('tr', { hasText: osdDocNo }).first().click();
        await modal(updater).waitFor({ timeout: 10000 });
        await updater.waitForTimeout(500);
        await modal(updater).locator('[name=status]').selectOption(next);
        await modal(updater).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
        await updater.waitForTimeout(1000);
        const dbStatus = sql(`SELECT status FROM osd WHERE id='${osdId}';`);
        note(`status after transitioning to "${next}"`, dbStatus);
        await updater.goto(UI + '/osd'); await updater.waitForTimeout(800);
    }
} catch (e) { fail('2. Status transition', e); }

// ══ 3. Closed-record editability: does the backend lock item/damage content once Closed? ═══════════
try {
    if (!osdId) throw new Error('no OSD');
    const beforeEdit = sql(`SELECT itemDescription, damageDescription FROM osd WHERE id='${osdId}';`);
    note('3: itemDescription/damageDescription before editing a Closed record', beforeEdit);
    const editAttempt = await apiCall(updater, 'PUT', `/api/osd/${osdId}`, { itemDescription: 'Edited while Closed', damageDescription: 'Edited damage note while Closed' });
    note('3: osd_updater direct PUT editing content fields on a Closed OSD (status not touched)', `HTTP ${editAttempt.status}`);
    const afterEdit = sql(`SELECT itemDescription, damageDescription, status FROM osd WHERE id='${osdId}';`);
    note('3: itemDescription/damageDescription/status after the edit attempt', afterEdit);
} catch (e) { fail('3. Closed-record editability', e); }

// ══ 4. Frontend readOnly gate on a Closed OSD (uses osd:create:all as the "override", not a separate
//        approve code — confirmed via code read) ══════════════════════════════════════════════════════
try {
    if (!osdId) throw new Error('no OSD');
    await updater.goto(UI + '/osd'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: osdDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const itemField = modal(updater).locator('[name=itemDescription]');
    const isDisabled = await itemField.isDisabled().catch(() => null);
    note('4: osd_updater (has osd:update:all but NOT osd:create:all) opens a Closed OSD — itemDescription disabled on screen', isDisabled);
} catch (e) { fail('4. Frontend readOnly gate on Closed OSD', e); }

// ══ 5. Delete protection (or lack thereof): a real osd:delete:all account deletes a CLOSED record ═══
try {
    if (!osdId) throw new Error('no OSD');
    const statusBeforeDelete = sql(`SELECT status FROM osd WHERE id='${osdId}';`);
    note('5: OSD status right before the delete attempt', statusBeforeDelete);
    const delRes = await apiCall(deleter, 'DELETE', `/api/osd/${osdId}`, null);
    note('5: osd_deleter (has osd:delete:all) attempts to delete a Closed OSD', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 200)}`);
    const stillThere = sql(`SELECT COUNT(*) FROM osd WHERE id='${osdId}';`);
    note('5: row count after the delete attempt (0 = no protection blocked it)', stillThere);
} catch (e) { fail('5. Delete protection', e); }

await browser.close();
console.log('DONE');
