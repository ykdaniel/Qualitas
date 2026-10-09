// IAM Data Scope partial-load-failure review (2026-09-28). Real isolated backend + real screens.
// Reproduces and verifies the fix for: an account with iam:user:manage but NOT
// contractors:view:all used to have its ENTIRE Data Scope section (projects AND the existing
// scope) fail to load, because Promise.all([getProjects(), getContractors()]) rejects atomically
// on the real 403 from GET /contractors/ — risking a silent vendor_id wipe on save. Backend
// permission gates, scope enforcement, and the (already-confirmed) full-replace contract of
// PUT /iam/users/{id}/scope are all untouched by this batch.
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

const openUser = async (pg, username) => {
    await pg.goto(UI + '/iam'); await pg.waitForTimeout(800);
    await pg.locator('input[placeholder="搜尋用戶..."]').first().fill(username);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: username }).first().click();
    await modal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
};
const projectCheckbox = (pg, projectName) => modal(pg).locator('label', { hasText: projectName }).locator('input[type=checkbox]');
// NOTE: not `following-sibling::div[1]` — when the contractor-list-failed error banner renders,
// it inserts an extra <div> directly after this label, so the row div (and its <select>) is no
// longer the first sibling. `following::select[1]` (document-order, not position-dependent) is
// robust to that banner appearing or not.
const vendorSelect = pg => modal(pg).locator('label', { hasText: '承包商（選填）' }).locator('xpath=following::select[1]');
const scopeSaveBtn = pg => modal(pg).locator('button', { hasText: /Save scope|儲存範圍/ });

const mgrNoContractor = await login('iam_mgr_no_contractor');
const mgrFull = await login('iam_mgr_full');
const viewerOnly = await login('iam_viewer_only');

// ══ 1. REAL reproduction: iam:user:manage WITHOUT contractors:view:all opens a target that
// already HAS a project + a contractor assigned. Projects and the existing scope must still
// load and display correctly despite the real 403 on GET /contractors/. ═════════════════════════
try {
    await openUser(mgrNoContractor, 'Scope Target With Vendor');
    note('1a. project checkbox for ISP-P1 is CHECKED (existing scope loaded despite contractor 403)', await projectCheckbox(mgrNoContractor, 'IAM ScopePartial Review Project 1').isChecked());
    const vendorVal = await vendorSelect(mgrNoContractor).inputValue();
    note('1b. vendor select still shows the EXISTING vendor id (ISP-V1), not blanked out', vendorVal);
    const bannerTexts = (await modal(mgrNoContractor).locator('text=承包商清單載入失敗').allInnerTexts());
    note('1c. contractor-list-failed banner IS shown (real 403, not simulated)', bannerTexts.length > 0);
    note('1d. contractor <select> is disabled while its list failed to load', await vendorSelect(mgrNoContractor).isDisabled());
    const scopeSaveVisible = await scopeSaveBtn(mgrNoContractor).count();
    note('1e. Save scope button IS present and enabled (existing scope loaded fine — only contractors failed)', `count=${scopeSaveVisible} disabled=${await scopeSaveBtn(mgrNoContractor).isDisabled()}`);
} catch (e) { fail('1. Real reproduction: projects + existing scope survive a contractor-list 403', e); }

// ══ 2. Only modify PROJECTS (add a second one) and save — vendor_id must be preserved exactly ═══
try {
    const before = sql(`SELECT vendor_id FROM users WHERE username='scope_target_with_vendor';`);
    await projectCheckbox(mgrNoContractor, 'IAM ScopePartial Review Project 2').check();
    await scopeSaveBtn(mgrNoContractor).click();
    await mgrNoContractor.waitForTimeout(1000);
    const after = sql(`SELECT vendor_id FROM users WHERE username='scope_target_with_vendor';`);
    note('2a. vendor_id in DB BEFORE vs AFTER a projects-only edit (must be identical)', `${before} -> ${after} -> unchanged=${before === after}`);
    const targetId = sql(`SELECT id FROM users WHERE username='scope_target_with_vendor';`);
    const projs = sql(`SELECT project_id FROM user_projects WHERE user_id='${targetId}' ORDER BY project_id;`);
    note('2b. project_ids in DB now include BOTH projects', projs);
} catch (e) { fail('2. Projects-only edit preserves vendor_id exactly', e); }

// ══ 3. Same account/flow, but the target originally has NO contractor — must stay None ═════════
try {
    const before = sql(`SELECT vendor_id FROM users WHERE username='scope_target_no_vendor';`);
    note('3a. vendor_id before (expect NULL/empty)', before);
    await openUser(mgrNoContractor, 'Scope Target No Vendor');
    note('3b. vendor select shows empty (Any/none) for a target with no contractor', await vendorSelect(mgrNoContractor).inputValue());
    await projectCheckbox(mgrNoContractor, 'IAM ScopePartial Review Project 2').check();
    await scopeSaveBtn(mgrNoContractor).click();
    await mgrNoContractor.waitForTimeout(1000);
    const after = sql(`SELECT vendor_id FROM users WHERE username='scope_target_no_vendor';`);
    note('3c. vendor_id AFTER a projects-only edit (must still be NULL/empty, not accidentally assigned)', after);
} catch (e) { fail('3. A target with no contractor keeps none after a projects-only edit', e); }

// ══ 4. Existing-scope load failure (simulated interception): Save must be disabled; retry works ═
try {
    const targetId = sql(`SELECT id FROM users WHERE username='scope_target_with_vendor';`);
    await mgrFull.route(`**/api/iam/users/${targetId}/scope`, route => { if (route.request().method() === 'GET') route.abort('failed'); else route.continue(); });
    await openUser(mgrFull, 'Scope Target With Vendor');
    const bannerTexts = (await modal(mgrFull).locator('text=此使用者目前的資料範圍載入失敗').allInnerTexts());
    note('4a. existing-scope-load-failed banner shown (SIMULATED via route interception, not a real permission gap)', bannerTexts.length > 0);
    note('4b. Save scope button disabled while scope failed to load', await scopeSaveBtn(mgrFull).isDisabled());
    // Even if the admin somehow toggles a project checkbox on this broken load, no PUT can be sent.
    const putReqs = { count: 0 };
    mgrFull.on('request', req => { if (req.method() === 'PUT' && req.url().includes('/scope')) putReqs.count++; });
    await projectCheckbox(mgrFull, 'IAM ScopePartial Review Project 1').click().catch(() => {});
    await scopeSaveBtn(mgrFull).click({ force: true }).catch(() => {});
    await mgrFull.waitForTimeout(500);
    note('4c. no PUT .../scope request was ever sent while disabled (expect 0)', putReqs.count);

    await mgrFull.unroute(`**/api/iam/users/${targetId}/scope`);
    await modal(mgrFull).locator('button', { hasText: /重試|Retry/ }).first().click();
    await mgrFull.waitForTimeout(1000);
    note('4d. after Retry, scope loads correctly and Save is re-enabled', !(await scopeSaveBtn(mgrFull).isDisabled()));
    const stillVendor = sql(`SELECT vendor_id FROM users WHERE username='scope_target_with_vendor';`);
    note('4e. vendor_id in DB is untouched by this whole failed-then-retried sequence (no PUT ever landed)', stillVendor);
} catch (e) { fail('4. Existing-scope load failure disables Save; retry recovers', e); }

// ══ 5. Project-list load failure (simulated): contractor + existing scope still show; retry works
try {
    await mgrFull.route('**/api/projects/', route => { if (route.request().method() === 'GET') route.abort('failed'); else route.continue(); });
    await openUser(mgrFull, 'Scope Target With Vendor');
    const bannerTexts = (await modal(mgrFull).locator('text=專案清單載入失敗').allInnerTexts());
    note('5a. projects-list-failed banner shown (SIMULATED via route interception)', bannerTexts.length > 0);
    const vendorVal = await vendorSelect(mgrFull).inputValue();
    note('5b. vendor select STILL shows the existing vendor correctly (contractor list + scope unaffected by the projects failure)', vendorVal);
    note('5c. Save scope button still enabled (only projects failed, existing scope loaded fine)', !(await scopeSaveBtn(mgrFull).isDisabled()));

    await mgrFull.unroute('**/api/projects/');
    await modal(mgrFull).locator('button', { hasText: /重試|Retry/ }).first().click();
    await mgrFull.waitForTimeout(1000);
    note('5d. after Retry, project checkboxes are visible again', await modal(mgrFull).locator('label', { hasText: 'IAM ScopePartial Review Project 1' }).count());
} catch (e) { fail('5. Projects-list load failure does not block contractor/scope; retry recovers', e); }

// ══ 6. No iam:user:manage: backend still rejects the write (unaffected by this batch) ═══════════
try {
    const targetId = sql(`SELECT id FROM users WHERE username='scope_target_with_vendor';`);
    const before = sql(`SELECT vendor_id FROM users WHERE username='scope_target_with_vendor';`);
    const res = await apiCall(viewerOnly, 'PUT', `/api/iam/users/${targetId}/scope`, { project_ids: [], vendor_id: null });
    note('6a. iam_viewer_only (no iam:user:manage) direct PUT scope (expect 403)', `HTTP ${res.status} body=${JSON.stringify(res.body).slice(0, 150)}`);
    const after = sql(`SELECT vendor_id FROM users WHERE username='scope_target_with_vendor';`);
    note('6b. vendor_id unchanged after the rejected attempt', `${before} -> ${after} -> unchanged=${before === after}`);
} catch (e) { fail('6. No iam:user:manage still rejected by the backend', e); }

// ══ 7. Full-permission account: existing operations still work with no regression ═══════════════
try {
    await openUser(mgrFull, 'Scope Target No Vendor');
    const bannerCount = await modal(mgrFull).locator('text=載入失敗').count();
    note('7a. no error banners for a full-permission account (expect 0)', bannerCount);
    const contractorOptionCount = await vendorSelect(mgrFull).locator('option').count();
    note('7b. contractor dropdown has real options loaded (expect > 1)', contractorOptionCount);
    await vendorSelect(mgrFull).selectOption('ISP-V1');
    await scopeSaveBtn(mgrFull).click();
    await mgrFull.waitForTimeout(1000);
    note('7c. full-permission account CAN assign a contractor normally', sql(`SELECT vendor_id FROM users WHERE username='scope_target_no_vendor';`));
} catch (e) { fail('7. Full-permission account regression check', e); }

// ══ 8. Save must be blocked during the FIRST load too, not just after a failure — verified with a
// deliberately delayed getUserScope response, not by inference from disabled={scopeError}. ══════
try {
    const targetId = sql(`SELECT id FROM users WHERE username='scope_target_with_vendor';`);
    let releaseDelay;
    const delay = new Promise(res => { releaseDelay = res; });
    const putReqs = { count: 0 };
    mgrFull.on('request', req => { if (req.method() === 'PUT' && req.url().includes('/scope')) putReqs.count++; });
    await mgrFull.route(`**/api/iam/users/${targetId}/scope`, async route => {
        if (route.request().method() === 'GET') { await delay; }
        await route.continue();
    });
    // Don't await the full navigation+modal-open helper (it waits for the modal to be ready,
    // which won't happen until the delayed GET resolves) — drive it manually so we can inspect
    // the DOM WHILE the scope fetch is still pending.
    await mgrFull.goto(UI + '/iam'); await mgrFull.waitForTimeout(800);
    await mgrFull.locator('input[placeholder="搜尋用戶..."]').first().fill('Scope Target With Vendor');
    await mgrFull.waitForTimeout(700);
    await mgrFull.locator('tr', { hasText: 'Scope Target With Vendor' }).first().click();
    await mgrFull.waitForTimeout(800); // modal is open, but its own scope fetch is still pending
    const saveBtnDuringLoad = await scopeSaveBtn(mgrFull).count();
    note('8a. Save scope button present WHILE the scope fetch is still pending (expect 0 — not just disabled, not rendered)', saveBtnDuringLoad);
    note('8b. PUT .../scope requests sent during the pending window (expect 0)', putReqs.count);
    releaseDelay();
    await mgrFull.waitForTimeout(1000);
    note('8c. after the delayed response resolves, Save scope becomes available', await scopeSaveBtn(mgrFull).count());
    await mgrFull.unroute(`**/api/iam/users/${targetId}/scope`);
} catch (e) { fail('8. Save blocked during the very first (not just a failed) load', e); }

// ══ 9. getProjects() fails, getUserScope() succeeds (2 pre-existing projects) — change ONLY the
// contractor and save: both original project_ids must survive, not be dropped to []. ════════════
try {
    const targetId = sql(`SELECT id FROM users WHERE username='scope_target_two_projects';`);
    const beforeProjects = sql(`SELECT project_id FROM user_projects WHERE user_id='${targetId}' ORDER BY project_id;`);
    note('9a. project_ids before (expect both ISP-P1 and ISP-P2)', beforeProjects);

    await mgrFull.route('**/api/projects/', route => { if (route.request().method() === 'GET') route.abort('failed'); else route.continue(); });
    let sentPayload = null;
    mgrFull.on('request', req => {
        if (req.method() === 'PUT' && req.url().includes(`/iam/users/${targetId}/scope`)) {
            try { sentPayload = req.postDataJSON(); } catch (_) { sentPayload = req.postData(); }
        }
    });
    await openUser(mgrFull, 'Scope Target Two Projects');
    note('9b. projects-list-failed banner shown', (await modal(mgrFull).locator('text=專案清單載入失敗').count()) > 0);
    note('9c. Save scope still enabled (existing scope loaded fine; only the project NAME list failed)', !(await scopeSaveBtn(mgrFull).isDisabled()));

    await vendorSelect(mgrFull).selectOption('ISP-V1');
    await scopeSaveBtn(mgrFull).click();
    await mgrFull.waitForTimeout(1000);
    note('9d. PUT payload project_ids actually sent (must contain BOTH original ids, not [])', JSON.stringify(sentPayload?.project_ids));
    const afterProjects = sql(`SELECT project_id FROM user_projects WHERE user_id='${targetId}' ORDER BY project_id;`);
    note('9e. DB project_ids after saving (must still have BOTH)', afterProjects);
    note('9f. DB vendor_id reflects the contractor change that WAS intended', sql(`SELECT vendor_id FROM users WHERE username='scope_target_two_projects';`));
    await mgrFull.unroute('**/api/projects/');
} catch (e) { fail('9. Projects-list failure + contractor-only save preserves original project_ids', e); }

// ══ 10. Retrying ONE failed source must not discard an unsaved edit made to a DIFFERENT,
// already-successfully-loaded field. ═════════════════════════════════════════════════════════════
try {
    const targetId = sql(`SELECT id FROM users WHERE username='scope_target_two_projects';`);
    await mgrFull.route('**/api/contractors/', route => { if (route.request().method() === 'GET') route.abort('failed'); else route.continue(); });
    await openUser(mgrFull, 'Scope Target Two Projects');
    note('10a. contractor-list-failed banner shown', (await modal(mgrFull).locator('text=承包商清單載入失敗').count()) > 0);

    // Admin unchecks ISP-P2 (an unsaved, in-progress edit) BEFORE retrying the contractor list.
    await projectCheckbox(mgrFull, 'IAM ScopePartial Review Project 2').uncheck();
    note('10b. ISP-P2 unchecked (unsaved edit in progress)', await projectCheckbox(mgrFull, 'IAM ScopePartial Review Project 2').isChecked());

    await mgrFull.unroute('**/api/contractors/');
    await modal(mgrFull).locator('button', { hasText: /重試|Retry/ }).first().click();
    await mgrFull.waitForTimeout(1000);
    note('10c. after retrying ONLY the contractor list, ISP-P2 is STILL unchecked (the unsaved project edit was not silently discarded)', await projectCheckbox(mgrFull, 'IAM ScopePartial Review Project 2').isChecked());
    note('10d. ISP-P1 remains checked throughout (untouched by the retry)', await projectCheckbox(mgrFull, 'IAM ScopePartial Review Project 1').isChecked());
    // Confirm nothing was saved yet — the DB still has both original projects.
    const dbProjects = sql(`SELECT project_id FROM user_projects WHERE user_id='${targetId}' ORDER BY project_id;`);
    note('10e. DB unaffected (nothing was saved in this scenario)', dbProjects);
} catch (e) { fail('10. Retrying one failed source does not discard an unsaved edit elsewhere', e); }

await browser.close();
console.log('DONE');
