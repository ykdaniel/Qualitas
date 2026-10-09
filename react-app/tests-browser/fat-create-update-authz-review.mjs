// FAT new/edit-form authorization review (2026-09-28). Real isolated backend + real screens.
// Batch scope: FATEditModal's readOnly gate — split from a single fat:update:all-based `canEdit`
// flag into `canCreate` (new record) vs `canEdit` (existing record). Backend untouched.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const REPRO_BASELINE = process.argv[3] === '--baseline';

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
const equipField = pg => modal(pg).locator('label', { hasText: '設備名稱' }).first().locator('xpath=following-sibling::input[1]');

const createOnly = await login('fat_create_only');

if (REPRO_BASELINE) {
    // ══ 0. BASELINE REPRO (run before any fix): create-only account opens "Add New" — expect the
    // equipment field to be DISABLED, because FAT.tsx currently gates the new-record form with the
    // same `canEdit = hasPermission('fat:update:all')` flag used for editing an EXISTING record,
    // and fat_create_only holds fat:create:all but NOT fat:update:all. ═══════════════════════════
    try {
        await createOnly.goto(UI + '/fat'); await createOnly.waitForTimeout(1200);
        const addBtn = createOnly.locator('button', { hasText: /新增|Add/ });
        note('0a. Add New button visible to fat_create_only (has fat:create:all)', await addBtn.count());
        await addBtn.first().click();
        await modal(createOnly).waitFor({ timeout: 10000 });
        await createOnly.waitForTimeout(500);
        const disabled = await equipField(createOnly).isDisabled();
        note('0b. BASELINE BUG CHECK: equipment field disabled on a BRAND-NEW record for a create-only account (expect true = bug reproduced)', disabled);
    } catch (e) { fail('0. Baseline repro', e); }
    await browser.close();
    console.log('DONE');
    process.exit(0);
}

// ══ 1. fat_create_only: has view+create, NO update — must be able to fill and create ═══════════
let createdId = null;
try {
    await createOnly.goto(UI + '/fat'); await createOnly.waitForTimeout(1200);
    await createOnly.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(createOnly).waitFor({ timeout: 10000 });
    await createOnly.waitForTimeout(500);
    const disabled = await equipField(createOnly).isDisabled();
    note('1a. equipment field disabled for fat_create_only on a NEW record (expect false = fixed)', disabled);
    await equipField(createOnly).fill('FCU authz new record', { timeout: 5000 });
    const supplierSelect = modal(createOnly).locator('label', { hasText: '供應商' }).first().locator('xpath=following-sibling::select[1]');
    await supplierSelect.selectOption('FAT CUA Review Co', { timeout: 5000 });
    await modal(createOnly).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await createOnly.waitForTimeout(1200);
    const created = sql(`SELECT id, equipment, status FROM fat WHERE equipment='FCU authz new record';`);
    note('1b. FAT actually created via real screen (id|equipment|status)', created);
    createdId = created.split('|')[0];
} catch (e) { fail('1. fat_create_only creates a new FAT', e); }

// ══ 2. Same account reopens the record it just created: must NOT be able to modify; direct PUT still 403 ═
try {
    if (!createdId) throw new Error('no FAT from step 1');
    await createOnly.goto(UI + '/fat'); await createOnly.waitForTimeout(1200);
    await createOnly.locator('tr').filter({ has: createOnly.locator('td', { hasText: 'FCU authz new record' }) }).first().click();
    await modal(createOnly).waitFor({ timeout: 10000 });
    await createOnly.waitForTimeout(500);
    const disabled = await equipField(createOnly).isDisabled();
    note('2a. equipment field disabled for fat_create_only reopening its OWN just-created record (expect true — no fat:update:all)', disabled);
    const saveBtnCount = await modal(createOnly).locator('button', { hasText: /^(儲存|Save)$/ }).count();
    note('2b. Save button present on the read-only reopen (expect 0)', saveBtnCount);
    await createOnly.keyboard.press('Escape').catch(() => {});

    const putRes = await apiCall(createOnly, 'PUT', `/api/fat/${createdId}`, { equipment: 'should be rejected' });
    note('2c. fat_create_only direct PUT on its own record (expect 403)', `HTTP ${putRes.status} body=${JSON.stringify(putRes.body).slice(0, 150)}`);
    note('2d. equipment unchanged in DB after rejected PUT', sql(`SELECT equipment FROM fat WHERE id='${createdId}';`));
} catch (e) { fail('2. Reopen own record, no update permission', e); }

// ══ 3. fat_update_only: has view+update, NO create — can edit in-scope existing record, cannot create ═
const updateOnly = await login('fat_update_only');
try {
    await updateOnly.goto(UI + '/fat'); await updateOnly.waitForTimeout(1200);
    const addBtnCount = await updateOnly.locator('button', { hasText: /新增|Add/ }).count();
    note('3a. Add New button visible to fat_update_only (NO fat:create:all, expect 0)', addBtnCount);

    await updateOnly.locator('tr').filter({ has: updateOnly.locator('td', { hasText: 'In-scope FAT for edit test' }) }).first().click();
    await modal(updateOnly).waitFor({ timeout: 10000 });
    await updateOnly.waitForTimeout(500);
    const disabled = await equipField(updateOnly).isDisabled();
    note('3b. equipment field disabled for fat_update_only on an EXISTING in-scope record (expect false)', disabled);
    await equipField(updateOnly).fill('Edited by fat_update_only', { timeout: 5000 });
    await modal(updateOnly).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await updateOnly.waitForTimeout(1000);
    note('3c. DB after real-screen edit', sql(`SELECT equipment FROM fat WHERE id='fcu-fat-inscope';`));

    const postRes = await apiCall(updateOnly, 'POST', '/api/fat/', { equipment: 'should be rejected create', vendor_id: 'FCU-V1', project_id: 'FCU-P1' });
    note('3d. fat_update_only direct POST create (NO fat:create:all, expect 403)', `HTTP ${postRes.status} body=${JSON.stringify(postRes.body).slice(0, 150)}`);
} catch (e) { fail('3. fat_update_only edits, cannot create', e); }

// ══ 4. fat_view_only: view only — cannot create or modify anything ══════════════════════════════
const viewOnly = await login('fat_view_only');
try {
    await viewOnly.goto(UI + '/fat'); await viewOnly.waitForTimeout(1200);
    const addBtnCount = await viewOnly.locator('button', { hasText: /新增|Add/ }).count();
    note('4a. Add New button visible to fat_view_only (expect 0)', addBtnCount);
    // Step 3 already renamed this record on screen ('In-scope FAT for edit test' -> 'Edited by
    // fat_update_only'); match on the current content, not the seed's original label.
    await viewOnly.locator('tr').filter({ has: viewOnly.locator('td', { hasText: 'Edited by fat_update_only' }) }).first().click();
    await modal(viewOnly).waitFor({ timeout: 10000 });
    await viewOnly.waitForTimeout(500);
    const disabled = await equipField(viewOnly).isDisabled();
    note('4b. equipment field disabled for fat_view_only (expect true)', disabled);
    await viewOnly.keyboard.press('Escape').catch(() => {});

    const postRes = await apiCall(viewOnly, 'POST', '/api/fat/', { equipment: 'should be rejected', vendor_id: 'FCU-V1', project_id: 'FCU-P1' });
    note('4c. fat_view_only direct POST create (expect 403)', `HTTP ${postRes.status}`);
    const putRes = await apiCall(viewOnly, 'PUT', '/api/fat/fcu-fat-inscope', { equipment: 'should be rejected' });
    note('4d. fat_view_only direct PUT update (expect 403)', `HTTP ${putRes.status}`);
} catch (e) { fail('4. fat_view_only cannot create or modify', e); }

// ══ 5. Scope: fat_update_only (scoped to FCU-P1) attempts PUT on an out-of-scope FCU-P2 record ═
try {
    const before = sql(`SELECT equipment FROM fat WHERE id='fcu-fat-outofscope';`);
    const r = await apiCall(updateOnly, 'PUT', '/api/fat/fcu-fat-outofscope', { equipment: 'should be rejected by scope' });
    note('5a. fat_update_only (scoped to FCU-P1) PUT on FCU-P2 record (expect 404, scope hides existence)', `HTTP ${r.status} body=${JSON.stringify(r.body).slice(0, 150)}`);
    const after = sql(`SELECT equipment FROM fat WHERE id='fcu-fat-outofscope';`);
    note('5b. out-of-scope record unchanged', before === after);
} catch (e) { fail('5. Scope still enforced', e); }

// ══ 6a. Cancel on a new record must NOT send a create request ═══════════════════════════════════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM fat;`);
    await createOnly.goto(UI + '/fat'); await createOnly.waitForTimeout(1200);
    await createOnly.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(createOnly).waitFor({ timeout: 10000 });
    await createOnly.waitForTimeout(500);
    await equipField(createOnly).fill('Should never be saved', { timeout: 5000 });
    await modal(createOnly).locator('button', { hasText: /^(取消|Cancel)$/ }).first().click();
    await createOnly.waitForTimeout(800);
    const countAfter = sql(`SELECT COUNT(*) FROM fat;`);
    note('6a. row count unchanged after Cancel on a new record', `${countBefore} -> ${countAfter}`);
    const leaked = sql(`SELECT COUNT(*) FROM fat WHERE equipment='Should never be saved';`);
    note('6a2. no row with the cancelled content exists', leaked);
} catch (e) { fail('6a. Cancel does not create', e); }

// ══ 6b. Save-flow finding (NOT this batch's scope — reported separately, not fixed here): does a
// FAILED create leave the form open with the user's input intact, or silently close/discard it? ══
try {
    await createOnly.goto(UI + '/fat'); await createOnly.waitForTimeout(1200);
    await createOnly.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(createOnly).waitFor({ timeout: 10000 });
    await createOnly.waitForTimeout(500);
    await equipField(createOnly).fill('Forced-failure input should survive', { timeout: 5000 });
    // Force the backend to reject this one POST, simulating any create failure (network, 500,
    // validation, etc.) without touching real backend behavior.
    await createOnly.route('**/api/fat/', route => {
        if (route.request().method() === 'POST') {
            route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced failure for this review' }) });
        } else {
            route.continue();
        }
    });
    await modal(createOnly).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await createOnly.waitForTimeout(1000);
    const stillOpen = await modal(createOnly).isVisible().catch(() => false);
    note('6b. FAT new-record modal still open after a FORCED backend failure (expect true if input is preserved; false = modal silently closed, input lost)', stillOpen);
    if (stillOpen) {
        const val = await equipField(createOnly).inputValue().catch(() => null);
        note('6b2. equipment field value still present after the failed save', val);
    }
    await createOnly.unroute('**/api/fat/');
} catch (e) { fail('6b. Save-failure behavior (informational only, not fixed this batch)', e); }

await browser.close();
console.log('DONE');
