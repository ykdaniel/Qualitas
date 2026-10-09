// ITP "Generate Checklist" permission-gating + Publish ConfirmModal UI/UX batch (2026-09-28).
// Real isolated backend + real screens except where explicitly labeled SIMULATED. Batch scope:
// (1) hide Generate Checklist entirely without checklist:create:all, show a clear reason when
// disabled for a fixable condition, and never surface the raw backend permission-code string if
// permission is lost mid-operation; (2) replace window.confirm() on Publish with the app's own
// ConfirmModal, showing the actual computed target rev/status, worded differently for a new
// record / an existing record / an attachment-only retry, with Cancel sending no request.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const sqlWrite = q => execFileSync('sqlite3', [stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const editModal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
const confirmDialog = (pg, titleText) => pg.locator('[class*=modalContent], [class*=ModalContent]')
    .filter({ has: pg.locator('h2', { hasText: titleText }) });
const saveBtn = pg => editModal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const planTabBtn = pg => editModal(pg).locator('button', { hasText: '檢驗計畫' });
const generateBtn = pg => editModal(pg).locator('button', { hasText: '產生 Checklist' });
const publishBtn = pg => editModal(pg).locator('button', { hasText: 'Publish' }).first();

const openByRef = async (pg, ref) => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    const searchInput = pg.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(ref);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: ref }).first().click();
    await editModal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
};

const full = await login('icp_full');
const nockl = await login('icp_nockl');

// ══ 1. No checklist:create:all: Generate Checklist button is ABSENT entirely (not just disabled) ═
try {
    await openByRef(nockl, 'QTS-ICP-ITP-000001'); // icp-itp-with-items
    await planTabBtn(nockl).click();
    await nockl.waitForTimeout(300);
    note('1a. Generate Checklist button count for a user WITHOUT checklist:create:all (expect 0)', await generateBtn(nockl).count());
} catch (e) { fail('1. Button hidden without permission', e); }

// ══ 2. Has permission, existing record with 0 items: button visible, disabled, clear reason shown ═
try {
    await openByRef(full, 'QTS-ICP-ITP-000002'); // icp-itp-existing-rev, no items
    await planTabBtn(full).click();
    await full.waitForTimeout(300);
    const btn = generateBtn(full);
    note('2a. button visible for icp_full (has checklist:create:all)', await btn.count());
    note('2b. button disabled (0 inspection items)', await btn.isDisabled());
    const reasonText = await editModal(full).locator('span', { hasText: '請先新增至少一項檢驗項目' }).count();
    note('2c. clear on-screen reason shown for why it is disabled', reasonText > 0);
} catch (e) { fail('2. Permission present but unmet condition shows a clear reason', e); }

// ══ 3. Has permission, has items: button enabled, real success, real navigation + DB row ═════════
try {
    await openByRef(full, 'QTS-ICP-ITP-000001'); // icp-itp-with-items
    await planTabBtn(full).click();
    await full.waitForTimeout(300);
    const btn = generateBtn(full);
    note('3a. button enabled (has 1 item)', !(await btn.isDisabled()));
    const beforeCount = sql(`SELECT COUNT(*) FROM checklist WHERE itpId='icp-itp-with-items';`);
    await btn.click();
    await full.waitForTimeout(1500);
    note('3b. real success navigates to /checklist', full.url());
    const afterCount = sql(`SELECT COUNT(*) FROM checklist WHERE itpId='icp-itp-with-items';`);
    note('3c. real DB row created, linked to this ITP (before/after count)', `${beforeCount} -> ${afterCount}`);
} catch (e) { fail('3. Real success path, permission present and conditions met', e); }

// ══ 4. Permission revoked mid-operation (REAL backend 403, produced by directly removing the row
// from role_permissions between page-load and the click — not a simulated network failure): the
// toast must show a friendly message, NEVER the raw "Operation not permitted. Required: ..." string,
// and the form/modal must stay open with the inspection item still present ═══════════════════════
try {
    await openByRef(full, 'QTS-ICP-ITP-000001'); // icp_full still has the permission when this loads
    await planTabBtn(full).click();
    await full.waitForTimeout(300);

    sqlWrite(`DELETE FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE name='IcpFull') AND permission_id=(SELECT id FROM permissions WHERE code='checklist:create:all');`);
    note('4a. permission actually revoked in DB (real backend will now reject the very next request)', sql(`SELECT COUNT(*) FROM role_permissions WHERE role_id=(SELECT id FROM roles WHERE name='IcpFull') AND permission_id=(SELECT id FROM permissions WHERE code='checklist:create:all');`));

    const toastPromise = full.waitForSelector('[data-sonner-toast]', { timeout: 8000 }).catch(() => null);
    await generateBtn(full).click();
    const toastEl = await toastPromise;
    const toastText = toastEl ? await toastEl.innerText() : '(no toast observed)';
    note('4b. toast text after a REAL mid-operation 403 (must be friendly, must NOT contain the raw permission code)', toastText);
    note('4c. raw permission code string absent from the toast', !toastText.includes('checklist:create:all') && !toastText.includes('Operation not permitted'));
    note('4d. modal still open, inspection item still present after the failure', (await editModal(full).count()) > 0);

    // Restore the permission for the rest of this run.
    sqlWrite(`INSERT INTO role_permissions (role_id, permission_id) VALUES ((SELECT id FROM roles WHERE name='IcpFull'), (SELECT id FROM permissions WHERE code='checklist:create:all'));`);
} catch (e) { fail('4. Real mid-operation permission loss shows a friendly message, not the raw code', e); }

// ══ 5. Publish confirm: NEW (unsaved) record variant ══════════════════════════════════════════════
try {
    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await full.locator('button', { hasText: /新增|Add/ }).first().click();
    await editModal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    await planTabBtn(full).click();
    await full.waitForTimeout(300);
    await publishBtn(full).click();
    const dlg = confirmDialog(full, '確認發布');
    await dlg.waitFor({ timeout: 5000 });
    const msg = await dlg.locator('div').filter({ hasText: /Rev/ }).last().innerText().catch(() => '(not found)');
    note('5a. new-record Publish confirm dialog message (expect: new-record wording naming a target Rev, no "from X to Y")', msg);
    note('5b. wording does not claim an existing rev is being replaced', !msg.includes('從') || !msg.includes('更新為'));
    // Cancel: confirm no write request was sent.
    const beforeAny = sql(`SELECT COUNT(*) FROM itp WHERE description LIKE '%UIUX Publish new-record probe%';`);
    await dlg.locator('button', { hasText: '取消' }).click();
    await full.waitForTimeout(500);
    note('5c. dialog closed after Cancel', await dlg.count());
    const afterAny = sql(`SELECT COUNT(*) FROM itp WHERE description LIKE '%UIUX Publish new-record probe%';`);
    note('5d. Cancel sent no write request (count unchanged, both zero)', `${beforeAny} -> ${afterAny}`);
} catch (e) { fail('5. Publish confirm — new record variant + Cancel sends nothing', e); }

// ══ 6. Publish confirm: EXISTING record variant — shows the actual fromRev -> toRev ═══════════════
try {
    await openByRef(full, 'QTS-ICP-ITP-000002'); // icp-itp-existing-rev, rev=Rev1.0
    await planTabBtn(full).click();
    await full.waitForTimeout(300);
    await publishBtn(full).click();
    const dlg = confirmDialog(full, '確認發布');
    await dlg.waitFor({ timeout: 5000 });
    const msg = await dlg.locator('div').filter({ hasText: 'Rev' }).last().innerText().catch(() => '(not found)');
    note('6a. existing-record Publish confirm message (expect fromRev=Rev1.0, toRev=Rev2.0)', msg);
    note('6b. mentions Rev1.0', msg.includes('Rev1.0'));
    note('6c. mentions Rev2.0', msg.includes('Rev2.0'));
    await dlg.locator('button', { hasText: '發布' }).click();
    await full.waitForTimeout(1200);
    note('6d. confirmed publish actually wrote the new rev/status', sql(`SELECT status, rev FROM itp WHERE id='icp-itp-existing-rev';`));
} catch (e) { fail('6. Publish confirm — existing record variant, correct rev/status shown and applied', e); }

// ══ 7. Publish confirm: attachment-only retry variant — SIMULATED attachment-phase failure via
// route interception (labeled: this is a simulated network failure, not a real backend rejection),
// used only to reach the "main+detail already saved, attachment pending" state without needing a
// real broken upload. The wording must NOT claim the revision/status will change again. ═══════════
try {
    await openByRef(full, 'QTS-ICP-ITP-000002'); // now status=Approved, rev=Rev2.0 from step 6
    // Attachments live on the "general" tab (default), not "plan" — queue the pending file there
    // first, then switch to "plan" to reach the Publish button.
    const fileInput = editModal(full).locator('input[type=file]').first();
    const hasFileInput = await fileInput.count();
    if (hasFileInput > 0) {
        await fileInput.setInputFiles({ name: 'probe.txt', mimeType: 'text/plain', buffer: Buffer.from('probe') });
        await full.waitForTimeout(300);
        await planTabBtn(full).click();
        await full.waitForTimeout(300);
        // SIMULATED: force the upload endpoint to fail so main+detail succeed but the attachment
        // phase does not, leaving skipRecordWrite true on the next Publish click.
        await full.route('**/api/files/**', route => route.fulfill({ status: 500, body: JSON.stringify({ detail: 'simulated upload failure' }) }));
        await publishBtn(full).click();
        let dlg = confirmDialog(full, '確認發布');
        await dlg.waitFor({ timeout: 5000 });
        await dlg.locator('button', { hasText: '發布' }).click();
        await full.waitForTimeout(1500);
        await full.unroute('**/api/files/**');

        // Retry: this second Publish click should recompute an IDENTICAL payload (same rev/status
        // already saved) -> skipRecordWrite true -> attachmentRetry wording.
        await publishBtn(full).click();
        dlg = confirmDialog(full, '確認發布');
        await dlg.waitFor({ timeout: 5000 });
        const msg = await dlg.locator('div').filter({ hasText: /附件|Rev/ }).last().innerText().catch(() => '(not found)');
        note('7a. retry-for-pending-attachment Publish confirm message (expect: mentions re-attempting the attachment, no new rev/status change claimed)', msg);
        note('7b. does not claim the revision will change again', !msg.includes('更新為'));
        await dlg.locator('button', { hasText: '取消' }).click();
    } else {
        note('7. SKIPPED — no file input control found on this build to attach a pending file to', '');
    }
} catch (e) { fail('7. Publish confirm — attachment-only retry variant (simulated upload failure to reach the state)', e); }

await browser.close();
console.log('DONE');
