// NCR business review — real browser, real screens, isolated stack (2026-09-24). Focuses on role
// handoff (create -> owner approval -> effectiveness/close), reusing the module's own extensive existing
// hardening (test_ncr_close_permission_http.py, _OWNER_APPROVAL_FIELDS change-detection gate in
// routers/ncr.py) as background, not re-deriving it from scratch. Fields are targeted by [name=] — NCR's
// form uses react-hook-form's register(), so this is more robust than label-text matching across i18n.
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

const creator = await login('ncr_creator');   // create only, no update/approve/close
const updater = await login('ncr_updater');   // + update
const approver = await login('ncr_approver'); // + approve
const closer = await login('ncr_closer');     // + close

let ncrId = null, ncrDocNo = null;

// ══ 1. Create (real screen, ncr_creator — the documented-minimum role) ═════════════════════════════
try {
    await creator.goto(UI + '/ncr'); await creator.waitForTimeout(1200);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(600);
    const m = modal(creator);

    async function tryField(label, action) {
        try { await action(); note(`field ok: ${label}`, true); }
        catch (e) { note(`field FAILED: ${label}`, String(e.message).split('\n')[0]); throw e; }
    }
    await tryField('subject', () => m.locator('[name=subject]').fill('NCR review subject', { timeout: 5000 }));
    await tryField('type', () => m.locator('[name=type]').selectOption('Material', { timeout: 5000 }));
    await tryField('severity', () => m.locator('[name=severity]').selectOption('Minor', { timeout: 5000 }));
    await tryField('discipline', () => m.locator('[name=discipline]').selectOption('Civil', { timeout: 5000 }));
    const contractorOpts = await m.locator('[name=contractor] option').allInnerTexts();
    note('Contractor dropdown options for ncr_creator (has contractors:view:all)', JSON.stringify(contractorOpts));
    await tryField('contractor', () => m.locator('[name=contractor]').selectOption('NCR Review Co', { timeout: 5000 }));
    await tryField('raisedBy', () => m.locator('[name=raisedBy]').first().fill('Reviewer A', { timeout: 5000 }));
    await tryField('foundBy', () => m.locator('[name=foundBy]').first().fill('Reviewer B', { timeout: 5000 }));
    const assignedOpts = await m.locator('[name=assignedTo] option').allInnerTexts();
    note('Assigned To dropdown options for ncr_creator (has iam:user:view)', JSON.stringify(assignedOpts));
    await tryField('assignedTo', () => m.locator('[name=assignedTo]').selectOption({ index: 1 }, { timeout: 5000 }));
    await tryField('raiseDate', async () => {
        const f = m.locator('[name=raiseDate]');
        await f.click({ timeout: 5000 });
        await f.fill('2026-09-24', { timeout: 5000 });
    });
    await tryField('foundLocation', () => m.locator('[name=foundLocation]').first().fill('Block A', { timeout: 5000 }));
    // referenceStandards/deviation live on the "description" tab (TABS[1]; NCRModals.tsx FIELD_TAB map),
    // not the default "basic" tab — switch tabs by position (translated labels vary by locale).
    await tryField('switch to description tab', () => m.locator('[class*=tabButton]').nth(1).click({ timeout: 5000 }));
    await tryField('referenceStandards', () => m.locator('[name=referenceStandards]').fill('ASTM-1', { timeout: 5000 }));
    await tryField('deviation', () => m.locator('[name=deviation]').fill('Deviation description for review', { timeout: 5000 }));
    await creator.waitForTimeout(300);

    const saveBtn = m.locator('button', { hasText: /^(儲存|Save)$/ });
    const saveDisabled = await saveBtn.first().isDisabled().catch(() => 'n/a');
    note('Save button disabled state after filling all open-required fields', saveDisabled);
    if (saveDisabled === false) {
        await saveBtn.first().click();
        await creator.waitForTimeout(1200);
        const created = sql(`SELECT id, documentNumber, status FROM ncr ORDER BY rowid DESC LIMIT 1;`);
        note('NCR created via real screen (id|documentNumber|status)', created);
        [ncrId, ncrDocNo] = created.split('|');
    } else {
        const toasts = (await creator.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
        note('could not save — visible toasts / validation state', toasts);
    }
} catch (e) { fail('1. Create', e); }

// ══ 1b. ncr_updater sets productDisposition="Use As Is" — a prerequisite for ownerApproval to even be
//        enabled (needsOwnerApproval), independent of who holds ncr:approve:all ═══════════════════════
try {
    if (!ncrId) throw new Error('no NCR from step 1');
    await updater.goto(UI + '/ncr'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: ncrDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(600);
    await modal(updater).locator('[class*=tabButton]').nth(2).click(); // "disposition" tab
    await updater.waitForTimeout(300);
    await modal(updater).locator('[name=productDisposition]').selectOption('Use As Is');
    await modal(updater).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await updater.waitForTimeout(1000);
    const afterDisposition = sql(`SELECT productDisposition FROM ncr WHERE id='${ncrId}';`);
    note('1b: productDisposition set by ncr_updater (prerequisite for ownerApproval to be enabled at all)', afterDisposition);
} catch (e) { fail('1b. Set productDisposition', e); }

// ══ 2. ncr_creator attempts ownerApproval on their own new NCR — screen should disable it ═══════════
try {
    if (!ncrId) throw new Error('no NCR from step 1');
    await creator.goto(UI + '/ncr'); await creator.waitForTimeout(1200);
    await creator.locator('tr', { hasText: ncrDocNo }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(600);
    await modal(creator).locator('[class*=tabButton]').nth(5).click(); // "closure" tab
    await creator.waitForTimeout(300);
    const ownerApprovalField = modal(creator).locator('[name=ownerApproval]');
    const isDisabled = await ownerApprovalField.isDisabled().catch(() => null);
    note('ncr_creator (no ncr:approve:all, but productDisposition now qualifies): ownerApproval field disabled on screen', isDisabled);
} catch (e) { fail('2. ownerApproval disabled for creator', e); }

// ══ 3. ncr_updater (has ncr:update:all, NOT ncr:approve:all) attempts to set ownerApproval via API ═══
try {
    if (!ncrId) throw new Error('no NCR');
    const bypassAttempt = await apiCall(updater, 'PUT', `/api/ncr/${ncrId}/`, { ownerApproval: 'Approved' });
    note('ncr_updater (no ncr:approve:all) direct PUT ownerApproval=Approved', `HTTP ${bypassAttempt.status} body=${JSON.stringify(bypassAttempt.body).slice(0, 250)}`);
    const dbAfter = sql(`SELECT ownerApproval FROM ncr WHERE id='${ncrId}';`);
    note('DB ownerApproval after the attempt', dbAfter || '(empty)');
} catch (e) { fail('3. ownerApproval backend block for updater', e); }

// ══ 4. ncr_approver sets ownerApproval — real screen ═════════════════════════════════════════════════
try {
    if (!ncrId) throw new Error('no NCR');
    await approver.goto(UI + '/ncr'); await approver.waitForTimeout(1200);
    await approver.locator('tr', { hasText: ncrDocNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(600);
    await modal(approver).locator('[class*=tabButton]').nth(5).click(); // "closure" tab
    await approver.waitForTimeout(300);
    const ownerApprovalField2 = modal(approver).locator('[name=ownerApproval]');
    const disabled2 = await ownerApprovalField2.isDisabled().catch(() => null);
    note('ncr_approver (has ncr:approve:all): ownerApproval field enabled on screen', disabled2 === false);
    await ownerApprovalField2.selectOption('Approved');
    const saveBtn2 = modal(approver).locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn2.first().click();
    await approver.waitForTimeout(1200);
    const afterApprove = sql(`SELECT ownerApproval, status FROM ncr WHERE id='${ncrId}';`);
    note('ownerApproval/status after ncr_approver saves', afterApprove);
} catch (e) { fail('4. ownerApproval via screen for approver', e); }

// ══ 5. ncr_closer attempts to close without meeting closure preconditions — expect a specific refusal ═
try {
    if (!ncrId) throw new Error('no NCR');
    const closeAttempt = await apiCall(closer, 'PUT', `/api/ncr/${ncrId}/`, { status: 'Closed' });
    note('ncr_closer (has ncr:close:all) attempts to close WITHOUT meeting closure preconditions', `HTTP ${closeAttempt.status} body=${JSON.stringify(closeAttempt.body).slice(0, 300)}`);
    const statusAfter = sql(`SELECT status FROM ncr WHERE id='${ncrId}';`);
    note('status after the incomplete-closure attempt', statusAfter);
} catch (e) { fail('5. Close without preconditions', e); }

// ══ 6. ncr_updater (no ncr:close:all) attempts to close — expect blocked at the permission layer ═════
try {
    if (!ncrId) throw new Error('no NCR');
    const closeAttempt2 = await apiCall(updater, 'PUT', `/api/ncr/${ncrId}/`, { status: 'Closed' });
    note('ncr_updater (no ncr:close:all) attempts to close', `HTTP ${closeAttempt2.status} body=${JSON.stringify(closeAttempt2.body).slice(0, 250)}`);
} catch (e) { fail('6. Close blocked for updater', e); }

await browser.close();
console.log('DONE');
