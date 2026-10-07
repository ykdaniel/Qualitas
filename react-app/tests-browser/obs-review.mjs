// OBS business review — real browser, real screens + targeted API checks, isolated stack (2026-09-24).
// Covers: create, closure via the two-engineer-approval derivation, the frontend-only photo-evidence
// gate (confirmed via code read to have NO backend counterpart), the reopen-vs-approve-permission
// mismatch already documented in BACKLOG #20 (re-confirmed, not re-discovered), and retry-after-failure.
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

const creator = await login('obs_creator');
const updater = await login('obs_updater');

let obsId = null, obsDocNo = null;

// ══ 1. Create (real screen, obs_creator — documented minimum: subject + description only) ═══════════
try {
    await creator.goto(UI + '/obs'); await creator.waitForTimeout(1200);
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(500);
    await modal(creator).locator('[name=subject]').fill('OBS review subject');
    // detailsDescription lives on the "description" tab (TABS[1]; OBSModals.tsx), not the default "basic" tab.
    await modal(creator).locator('[class*=tabButton]').nth(1).click();
    await creator.waitForTimeout(300);
    await modal(creator).locator('[name=detailsDescription]').fill('OBS review observation description');
    const saveBtn = modal(creator).locator('button', { hasText: /^(儲存|Save)$/ });
    const saveDisabled = await saveBtn.first().isDisabled().catch(() => 'n/a');
    note('Save button disabled state after filling only Subject + Description', saveDisabled);
    if (saveDisabled === false) {
        await saveBtn.first().click();
        await creator.waitForTimeout(1200);
        const created = sql(`SELECT id, documentNumber, status FROM obs ORDER BY rowid DESC LIMIT 1;`);
        note('OBS created via real screen with only the two required fields (id|documentNumber|status)', created);
        [obsId, obsDocNo] = created.split('|');
    }
} catch (e) { fail('1. Create', e); }

// ══ 2. Attempt closure via both engineer approvals, WITHOUT any photo evidence — frontend gate check ══
try {
    if (!obsId) throw new Error('no OBS from step 1');
    await updater.goto(UI + '/obs'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: obsDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    await modal(updater).locator('[class*=tabButton]').nth(4).click(); // "closure" tab
    await updater.waitForTimeout(300);
    await modal(updater).locator('[name=qualityEngineerApproval]').selectOption('Approved');
    await modal(updater).locator('[name=constructionEngineerApproval]').selectOption('Approved');
    const saveBtn2 = modal(updater).locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn2.first().click();
    await updater.waitForTimeout(1200);
    const toastMsg = (await updater.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
    note('toast/warning shown when attempting to close without photo evidence (frontend gate)', toastMsg);
    const statusAfterAttempt = sql(`SELECT status FROM obs WHERE id='${obsId}';`);
    note('DB status after the blocked-by-frontend closure attempt (should still be Open — the save should not have gone through)', statusAfterAttempt);
} catch (e) { fail('2. Frontend photo-evidence gate', e); }

// ══ 3. Retry after "failure": add the required note that the gate demands is missing (simulated here as
//        re-attempting with the same data — since no real photo file is uploaded, this documents the gate's
//        existence rather than a full success path; the point is whether the SAME modal/session can retry
//        cleanly, not silently corrupt state) ═════════════════════════════════════════════════════════
try {
    if (!obsId) throw new Error('no OBS');
    // Confirm the modal is still open / usable after the blocked attempt (not stuck, not silently closed).
    const stillOpen = await modal(updater).count() > 0;
    note('3. modal still open and usable after the blocked closure attempt (retry-without-reload possible)', stillOpen);
} catch (e) { fail('3. Retry state after blocked closure', e); }

// ══ 4. Backend bypass: does the backend independently enforce the photo-evidence gate, or only the two-
//        engineer-approval derivation? Direct PUT status=Closed, skipping both. ═══════════════════════
try {
    if (!obsId) throw new Error('no OBS');
    const bypassClose = await apiCall(updater, 'PUT', `/api/obs/${obsId}`, { status: 'Closed' });
    note('4. obs_updater direct PUT status=Closed, skipping engineer approvals AND photo evidence entirely', `HTTP ${bypassClose.status} body=${JSON.stringify(bypassClose.body).slice(0, 250)}`);
    const statusAfterBypass = sql(`SELECT status, qualityEngineerApproval, constructionEngineerApproval FROM obs WHERE id='${obsId}';`);
    note('4. DB state after the bypass attempt', statusAfterBypass);
} catch (e) { fail('4. Backend bypass of the closure gate', e); }

// ══ 5. Reopen the (now Closed) OBS with only obs:update:all — no obs:approve:all — matches BACKLOG #20's
//        already-documented finding: re-confirming current behavior, not re-discovering it. ═══════════
try {
    if (!obsId) throw new Error('no OBS');
    const statusBeforeReopen = sql(`SELECT status FROM obs WHERE id='${obsId}';`);
    note('5. status before reopen attempt', statusBeforeReopen);
    if (statusBeforeReopen === 'Closed') {
        const reopenAttempt = await apiCall(updater, 'PUT', `/api/obs/${obsId}`, { status: 'Open' });
        note('5. obs_updater (no obs:approve:all) attempts to reopen via direct status change', `HTTP ${reopenAttempt.status}`);
        const statusAfterReopen = sql(`SELECT status FROM obs WHERE id='${obsId}';`);
        note('5. status after the reopen attempt', statusAfterReopen);

        // Now, while genuinely still Closed (re-set it), try to touch an evidence-locked field WITHOUT reopening.
        await apiCall(updater, 'PUT', `/api/obs/${obsId}`, { status: 'Closed' });
        const evidenceTouch = await apiCall(updater, 'PUT', `/api/obs/${obsId}`, { productDisposition: 'Changed while still Closed' });
        note('5b. obs_updater attempts to change productDisposition (evidence-locked field) while STILL Closed (no status change in the payload)', `HTTP ${evidenceTouch.status} body=${JSON.stringify(evidenceTouch.body).slice(0, 250)}`);
    }
} catch (e) { fail('5. Reopen vs evidence-lock distinction', e); }

// ══ 6. Frontend screen confirmation: obs_updater (no obs:approve:all) opens the Closed OBS — is it
//        read-only per the frontend's own locked-check, even though backend allows reopening? ══════════
try {
    if (!obsId) throw new Error('no OBS');
    await apiCall(updater, 'PUT', `/api/obs/${obsId}`, { status: 'Closed' }); // ensure Closed for this check
    await updater.goto(UI + '/obs'); await updater.waitForTimeout(1200);
    await updater.locator('tr', { hasText: obsDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const subjectField = modal(updater).locator('[name=subject]');
    const isDisabled = await subjectField.isDisabled().catch(() => null);
    note('6. obs_updater (no obs:approve:all) opens a Closed OBS — subject field disabled on screen (frontend readOnly gate)', isDisabled);
} catch (e) { fail('6. Frontend readOnly gate on Closed OBS', e); }

await browser.close();
console.log('DONE');
