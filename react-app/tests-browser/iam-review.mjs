// IAM business review — real browser, real screens + API, isolated stack (2026-09-24).
// Covers: user create (real screen), role_id self-escalation block (re-verified on THIS
// session's current code, not cited from an earlier session's memory), role create + permission
// assignment (real screen), and per-user data-isolation scope get/set (real screen, via
// UserScopeSection's own Save button).
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

const manager = await login('iam_manager');
const viewer = await login('iam_viewer');

// ══ 1. User create (real screen) ══════════════════════════════════════════════════════════════════
let newUserId = null;
try {
    let capturedReq = null, capturedRes = null;
    manager.on('request', req => { if (req.method() === 'POST' && req.url().includes('/iam/users/')) capturedReq = req.postData(); });
    manager.on('response', async res => { if (res.request().method() === 'POST' && res.url().includes('/iam/users/')) capturedRes = { status: res.status(), body: await res.text().catch(() => '<unreadable>') }; });
    manager.on('console', msg => { if (msg.type() === 'error') note('browser console error', msg.text()); });

    await manager.goto(UI + '/iam'); await manager.waitForTimeout(1200);
    await manager.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(manager).waitFor({ timeout: 10000 });
    const m = modal(manager);
    async function fillByLabel(labelText, value) {
        const label = m.locator('label', { hasText: labelText }).first();
        const field = label.locator('xpath=following-sibling::*[self::input or self::textarea][1]');
        await field.fill(value);
    }
    await fillByLabel('姓名', 'Review New User');
    await fillByLabel('電子郵件', 'reviewnewuser@example.com');
    await fillByLabel('密碼', 'Accept-Test-1234');
    await fillByLabel('確認密碼', 'Accept-Test-1234');
    await fillByLabel('變更原因', 'IAM review — creating a test account');
    // Explicitly pick a non-Admin role — the modal defaults the role select to the FIRST
    // role in the list (which may be "Admin"), which would otherwise 403 unrelated to this test.
    const roleLabel = m.locator('label', { hasText: '角色' }).first();
    const roleSelect = roleLabel.locator('xpath=following-sibling::div[1]//select');
    await roleSelect.selectOption({ label: 'IamViewer' });
    await m.locator('button[type=submit]').first().click();
    await manager.waitForTimeout(1500);
    note('POST request body actually sent', capturedReq);
    note('POST response actually received', capturedRes ? `HTTP ${capturedRes.status} body=${capturedRes.body}` : '(no POST request was ever fired)');
    const created = sql(`SELECT id, username, email FROM users WHERE email='reviewnewuser@example.com';`);
    note('user created via real screen (id|username|email)', created);
    newUserId = created.split('|')[0];
} catch (e) { fail('1. User create', e); }

// ══ 2. Role self-escalation block — re-verified on current code ═════════════════════════════════════
try {
    if (!newUserId) throw new Error('no user from step 1');
    const selfRow = sql(`SELECT id || '|' || role_id FROM users WHERE username='iam_manager';`);
    const [selfId, selfRoleId] = selfRow.split('|');
    const targetRoleRow = sql(`SELECT id FROM roles WHERE name='PowerRole';`);
    // Attempt: iam_manager tries to change their OWN role_id (self-escalation attempt) — should be blocked regardless of permission.
    const selfEscalate = await apiCall(manager, 'PUT', `/api/iam/users/${selfId}/`, { role_id: parseInt(targetRoleRow), reason: 'self role change attempt' });
    note('2a: iam_manager attempts to change THEIR OWN role_id', `HTTP ${selfEscalate.status} body=${JSON.stringify(selfEscalate.body).slice(0, 200)}`);

    // Attempt: iam_manager changes a DIFFERENT user's role_id (legitimate, has ROLE_MANAGE) — should succeed.
    const otherChange = await apiCall(manager, 'PUT', `/api/iam/users/${newUserId}/`, { role_id: parseInt(targetRoleRow), reason: 'granting PowerRole to new test user' });
    note('2b: iam_manager changes a DIFFERENT user\'s role_id (has iam:role:manage)', `HTTP ${otherChange.status}`);
    const otherRoleAfter = sql(`SELECT role_id FROM users WHERE id=${newUserId};`);
    note('2b: target user role_id in DB after the change', otherRoleAfter);

    // Attempt: iam_viewer (no ROLE_MANAGE) tries to change someone else's role — should be blocked.
    const viewerAttempt = await apiCall(viewer, 'PUT', `/api/iam/users/${newUserId}/`, { role_id: parseInt(selfRoleId), reason: 'viewer attempts role change' });
    note('2c: iam_viewer (no iam:role:manage) attempts to change ANOTHER user\'s role_id', `HTTP ${viewerAttempt.status} body=${JSON.stringify(viewerAttempt.body).slice(0, 200)}`);
} catch (e) { fail('2. Role self-escalation block', e); }

// ══ 3. Role create + permission assignment (real screen) ════════════════════════════════════════════
try {
    await manager.goto(UI + '/iam'); await manager.waitForTimeout(800);
    await manager.locator('button', { hasText: /角色管理|Roles/ }).first().click();
    await manager.waitForTimeout(800);
    await manager.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(manager).waitFor({ timeout: 10000 });
    const m2 = modal(manager);
    async function fillByLabel2(labelText, value) {
        const label = m2.locator('label', { hasText: labelText }).first();
        const field = label.locator('xpath=following-sibling::*[self::input or self::textarea][1]');
        await field.fill(value);
    }
    await fillByLabel2('角色名稱', 'ReviewRole');
    await fillByLabel2('描述', 'Role created during IAM review');
    // Pick 2 arbitrary permission checkboxes.
    const checkboxes = m2.locator('input[type=checkbox]');
    const cbCount = await checkboxes.count();
    note('permission checkboxes available in the matrix', cbCount);
    await checkboxes.nth(0).click();
    await checkboxes.nth(1).click();
    await fillByLabel2('變更原因', 'IAM review — creating a test role');
    await m2.locator('button[type=submit]').first().click();
    await manager.waitForTimeout(1200);
    const createdRole = sql(`SELECT id, name FROM roles WHERE name='ReviewRole';`);
    note('role created via real screen (id|name)', createdRole);
    const [roleId] = createdRole.split('|');
    const assignedPermCount = sql(`SELECT COUNT(*) FROM role_permissions WHERE role_id=${roleId};`);
    note('permissions actually persisted for the new role (expect 2)', assignedPermCount);
} catch (e) { fail('3. Role create + permission assignment', e); }

// ══ 4a. Data-isolation scope defect: iam:user:manage WITHOUT contractors:view:all ═══════════════════
// UserScopeSection.tsx does Promise.all([getProjects(), getContractors()]) — since Promise.all
// rejects atomically, a 403 on contractors silently drops the ALREADY-SUCCEEDED projects fetch too,
// and getUserScope() (only reached after that Promise.all resolves) never even runs.
try {
    const managerNoContractor = await login('iam_manager_no_contractor');
    await managerNoContractor.goto(UI + '/iam'); await managerNoContractor.waitForTimeout(1200);
    await managerNoContractor.locator('tr', { hasText: 'Scope Target' }).first().click({ timeout: 10000 });
    await modal(managerNoContractor).waitFor({ timeout: 10000 });
    await managerNoContractor.waitForTimeout(1200);
    const m3a = modal(managerNoContractor);
    const projCbCount = await m3a.locator('label', { hasText: 'IAM Review Project' }).locator('input[type=checkbox]').count();
    const noProjectsTextCount = await m3a.locator('text=/No projects|沒有專案/').count();
    note('4a: account has iam:user:manage but NOT contractors:view:all — project checkboxes rendered', projCbCount);
    note('4a: "no projects" placeholder shown instead (proves the list came back empty, not just unrendered)', noProjectsTextCount);
} catch (e) { fail('4a. Data-isolation scope — cross-module permission dependency', e); }

// ══ 4b. Data-isolation scope: get/set via real screen (UserScopeSection), properly-permissioned account ═
try {
    const targetRow = sql(`SELECT id FROM users WHERE username='scope_target';`);
    await manager.goto(UI + '/iam'); await manager.waitForTimeout(1200);
    await manager.locator('tr', { hasText: 'Scope Target' }).first().click({ timeout: 10000 });
    await modal(manager).waitFor({ timeout: 10000 });
    await manager.waitForTimeout(1200); // UserScopeSection loads projects/contractors async after modal mount
    const m3 = modal(manager);
    const projCb1 = m3.locator('label', { hasText: 'IAM Review Project 1' }).locator('input[type=checkbox]');
    note('4b: project checkbox found (manager DOES hold contractors:view:all)', await projCb1.count());
    await projCb1.click();
    // The modal has multiple <select> elements (role/status/company + the scope's contractor
    // picker) — .filter({has:...}) on option text is unreliable here (established pitfall this
    // session), so scan every select's option-text list and pick the one containing our target.
    // Both the Company picker (unrelated cosmetic field, reuses the same contractor list) and the
    // scope's contractor picker list "IAM Review Vendor" as an option — the scope one is the LAST
    // matching select in DOM order (Company appears earlier, in the main form grid).
    const allSelects = m3.locator('select');
    const optionTexts = await allSelects.evaluateAll(nodes => nodes.map(n => Array.from(n.options).map(o => o.text)));
    const vendorIdx = optionTexts.map((opts, i) => opts.includes('IAM Review Vendor') ? i : -1).filter(i => i >= 0).pop();
    note('4b: select elements found, vendor-picker index', `${optionTexts.length} selects, vendor at index ${vendorIdx}`);
    await allSelects.nth(vendorIdx).selectOption({ label: 'IAM Review Vendor' });
    const saveScopeBtn = m3.locator('button', { hasText: /Save scope|儲存範圍/ }).first();
    await saveScopeBtn.click();
    await manager.waitForTimeout(1000);
    const projIdsAfter = sql(`SELECT project_id FROM user_projects WHERE user_id=${targetRow};`);
    const vendorIdAfter = sql(`SELECT vendor_id FROM users WHERE id=${targetRow};`);
    note('4b: scope_target scope after real-screen save (project_ids | vendor_id)', `${projIdsAfter} | ${vendorIdAfter}`);
} catch (e) { fail('4b. Data-isolation scope get/set', e); }

await browser.close();
console.log('DONE');
