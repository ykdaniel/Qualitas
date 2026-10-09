// Shared admin-cluster review — real browser, real screens + API, isolated stack (2026-09-24).
// Covers: Document Naming Rules (configure a prefix, then verify the NEXT generated number reflects
// it — not just observing an already-generated number), Contractors update, KPI weight save (current
// codebase version, not memory), and Projects' role-name-based authorization gate (re-confirmed on
// this session's current code, not carried over from an earlier finding).
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

const settingsMgr = await login('settings_manager');
const fakeAdmin = await login('fake_admin_perms');
const realAdmin = await login('real_admin_role');

// ══ 1. Document Naming Rules: change a prefix, save, then verify the NEXT record reflects it ═══════
try {
    await settingsMgr.goto(UI + '/document-naming-rules'); await settingsMgr.waitForTimeout(1200);
    const ncrRow = settingsMgr.locator('tr', { hasText: 'NCR' }).first();
    const prefixInput = ncrRow.locator('input').first();
    const oldPrefix = await prefixInput.inputValue();
    note('current NCR prefix before change', oldPrefix);
    const newPrefix = 'QTS-REVIEW-[ABBREV]-NCR-';
    await prefixInput.fill(newPrefix);
    const saveBtn = settingsMgr.locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click();
    await settingsMgr.waitForTimeout(1200);
    const dbRule = sql(`SELECT prefix FROM document_naming_rules WHERE doc_type='ncr';`);
    note('DB prefix for ncr after saving via real screen', dbRule);

    // Now create a real NCR (via API, minimal fields) and confirm its generated number uses the NEW prefix.
    const ncrRes = await apiCall(settingsMgr, 'POST', '/api/ncr/', {
        vendor: 'Shared Review Co', description: 'Naming-rule verification NCR', rev: '', submit: '', status: 'Open',
        type: 'Material', severity: 'Minor', discipline: 'Civil', contractor: 'Shared Review Co',
        raisedBy: 'x', foundBy: 'x', assignedTo: null, raiseDate: '2026-09-24', foundLocation: 'x',
        referenceStandards: 'x', deviation: 'x',
    }).catch(e => ({ status: 'n/a', body: { error: String(e) } }));
    note('created a real NCR after the prefix change', `HTTP ${ncrRes.status} documentNumber=${ncrRes.body?.documentNumber}`);
    const usesNewPrefix = (ncrRes.body?.documentNumber || '').startsWith('QTS-REVIEW-');
    note('the newly-generated documentNumber actually uses the just-configured prefix (not just the default)', usesNewPrefix);
} catch (e) { fail('1. Document Naming Rules', e); }

// ══ 2. Contractors update (real screen) ══════════════════════════════════════════════════════════════
try {
    let capturedReq = null, capturedRes = null;
    const onReq = req => { if (req.method() === 'PUT' && req.url().includes('/contractors/')) capturedReq = req.postData(); };
    const onRes = async res => { if (res.request().method() === 'PUT' && res.url().includes('/contractors/')) { capturedRes = { status: res.status(), body: await res.text().catch(() => '<unreadable>') }; } };
    settingsMgr.on('request', onReq);
    settingsMgr.on('response', onRes);

    await settingsMgr.goto(UI + '/contractors'); await settingsMgr.waitForTimeout(1200);
    await settingsMgr.locator('tr', { hasText: 'Shared Review Co' }).first().click();
    await modal(settingsMgr).waitFor({ timeout: 10000 });
    await settingsMgr.waitForTimeout(500);
    const nameLabel = modal(settingsMgr).locator('label', { hasText: '承包商名稱' }).first();
    const nameField = nameLabel.locator('xpath=following-sibling::input[1]');
    note('name field found', await nameField.count());
    await nameField.fill('Shared Review Co (edited)');
    const valAfterFill = await nameField.inputValue();
    note('name field value right after fill', valAfterFill);
    const submitBtn = modal(settingsMgr).locator('button[type=submit]');
    note('submit button count', await submitBtn.count());
    await submitBtn.first().click();
    await settingsMgr.waitForTimeout(1500);
    note('PUT request body actually sent', capturedReq);
    note('PUT response actually received', capturedRes ? `HTTP ${capturedRes.status} body=${capturedRes.body}` : '(no PUT request was ever fired)');
    const afterUpdate = sql(`SELECT name FROM contractors WHERE id='SHARED-V1';`);
    note('Contractor name after real-screen update', afterUpdate);

    settingsMgr.off('request', onReq);
    settingsMgr.off('response', onRes);
} catch (e) { fail('2. Contractors update', e); }

// ══ 3. KPI weights (real screen, current codebase version) ═══════════════════════════════════════════
try {
    await settingsMgr.goto(UI + '/kpi'); await settingsMgr.waitForTimeout(1200);
    const toggleBtn = settingsMgr.locator('[class*=weightToggle]').first();
    const toggleCount = await toggleBtn.count();
    note('KPI weight-section toggle found on the dashboard', toggleCount > 0);
    if (toggleCount > 0) {
        await toggleBtn.click();
        await settingsMgr.waitForTimeout(500);
        const pqpInput = settingsMgr.locator('label', { hasText: 'PQP' }).first().locator('input[type=number]');
        const before = await pqpInput.inputValue();
        await pqpInput.fill('55');
        const saveWeightsBtn = settingsMgr.locator('button', { hasText: /儲存|Save/ }).last();
        await saveWeightsBtn.click();
        await settingsMgr.waitForTimeout(1000);
        const dbWeight = sql(`SELECT pqp_weight FROM kpi_weights ORDER BY rowid DESC LIMIT 1;`);
        note('PQP weight before/after real-screen save, and DB value', `${before} -> 55, DB=${dbWeight}`);
    }
} catch (e) { fail('3. KPI weights', e); }

// ══ 4. Projects authorization gate — now contractors:manage:all, not a role-name check ═══════════════
// 2026-09-28: routers/projects.py fixed to use RoleChecker(CONTRACTOR_MANAGE) like every other
// permission-gated route, instead of checking role.name against a hardcoded admin-name list.
try {
    const before4a = sql(`SELECT COUNT(*) FROM projects WHERE id='FAKE-PROJ-1';`);
    const fakeAdminAttempt = await apiCall(fakeAdmin, 'POST', '/api/projects/', { name: 'Fake admin project', id: 'FAKE-PROJ-1' });
    note('4a: fake_admin_perms (HAS contractors:manage:all, role name "NotAdmin") creates a Project — expect 200 now (fixed; previously wrongly rejected by the role-name gate)', `HTTP ${fakeAdminAttempt.status} body=${JSON.stringify(fakeAdminAttempt.body).slice(0, 200)}`);
    note('4a2. row actually created in DB', sql(`SELECT COUNT(*) FROM projects WHERE id='FAKE-PROJ-1';`));
    const auditRow = sql(`SELECT username FROM audit_logs WHERE entity_type='Project' AND entity_id='FAKE-PROJ-1';`);
    note('4a3. audit log records the real actor (fake_admin_perms), not some implicit admin identity', auditRow);

    const beforeRealAdmin = sql(`SELECT COUNT(*) FROM projects WHERE id='REAL-PROJ-1';`);
    const realAdminAttempt = await apiCall(realAdmin, 'POST', '/api/projects/', { name: 'Real admin project', id: 'REAL-PROJ-1' });
    note('4b: real_admin_role (role name literally "Admin", ZERO permission codes) attempts to create a Project — expect 403 now (fixed; previously wrongly allowed by the role-name gate)', `HTTP ${realAdminAttempt.status} body=${JSON.stringify(realAdminAttempt.body).slice(0, 200)}`);
    note('4b2. nothing created, DB unchanged', `${beforeRealAdmin} -> ${sql(`SELECT COUNT(*) FROM projects WHERE id='REAL-PROJ-1';`)}`);

    // Unauthenticated (no session at all) — must still be refused per the router's existing
    // dependencies=[Depends(get_current_user)], unrelated to this batch's fix.
    const anonRes = await fetch(`${UI}/api/projects/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Anon project', id: 'ANON-PROJ-1' }) });
    note('4c: unauthenticated request (no cookies) to create a Project — expect 401', anonRes.status);
    note('4c2. nothing created', sql(`SELECT COUNT(*) FROM projects WHERE id='ANON-PROJ-1';`));

    // Update, by the now-legitimately-permitted account.
    const updateRes = await apiCall(fakeAdmin, 'PUT', '/api/projects/SHARED-PROJ-PLAIN', { name: 'Shared Plain Project (updated)' });
    note('4d: fake_admin_perms updates a Project it now has permission for — expect 200', `HTTP ${updateRes.status}`);
    note('4d2. DB reflects the update', sql(`SELECT name FROM projects WHERE id='SHARED-PROJ-PLAIN';`));

    // Reference-deletion protection must still work, unrelated to the authorization fix — a
    // permission-holding account must still be blocked from deleting a REFERENCED project.
    const refDeleteRes = await apiCall(fakeAdmin, 'DELETE', '/api/projects/SHARED-PROJ-REF', null);
    note('4e: fake_admin_perms (has permission) attempts to delete a project referenced by a real ITP — expect still BLOCKED (reference protection unrelated to this fix)', `HTTP ${refDeleteRes.status} body=${JSON.stringify(refDeleteRes.body).slice(0, 200)}`);
    note('4e2. the referenced project still exists', sql(`SELECT COUNT(*) FROM projects WHERE id='SHARED-PROJ-REF';`));

    // An UNreferenced project, same permitted account, delete should succeed normally.
    const plainDeleteRes = await apiCall(fakeAdmin, 'DELETE', '/api/projects/SHARED-PROJ-PLAIN', null);
    note('4f: fake_admin_perms deletes an UNreferenced project it has permission for — expect 200', `HTTP ${plainDeleteRes.status}`);
    note('4f2. the plain project is actually gone', sql(`SELECT COUNT(*) FROM projects WHERE id='SHARED-PROJ-PLAIN';`));

    // Frontend entry point: the "Add Project" button already checks hasPermission('contractors:manage:all')
    // (react-app/src/components/Contractors/Contractors.tsx) — confirm it now correctly tracks the SAME
    // permission the backend enforces, for both a permitted and an unpermitted account.
    await fakeAdmin.goto(UI + '/contractors'); await fakeAdmin.waitForTimeout(1000);
    await fakeAdmin.locator('button', { hasText: 'Projects' }).click(); await fakeAdmin.waitForTimeout(500);
    note('4g: "Add Project" button visible to fake_admin_perms (has the permission, expect 1)', await fakeAdmin.locator('button', { hasText: 'Add Project' }).count());

    await realAdmin.goto(UI + '/contractors'); await realAdmin.waitForTimeout(1000);
    await realAdmin.locator('button', { hasText: 'Projects' }).click(); await realAdmin.waitForTimeout(500);
    note('4h: "Add Project" button visible to real_admin_role (role name "Admin", NO permission, expect 0)', await realAdmin.locator('button', { hasText: 'Add Project' }).count());
} catch (e) { fail('4. Projects authorization gate (contractors:manage:all)', e); }

await browser.close();
console.log('DONE');
