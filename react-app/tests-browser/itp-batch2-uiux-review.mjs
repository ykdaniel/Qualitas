// ITP batch 2 UI/UX fixes (2026-09-29). Real isolated backend + real screens, except where
// explicitly labeled SIMULATED. Batch scope: (1) compact on-screen header replacing the
// permanently-visible print-style header (print output itself unchanged — verified by code
// inspection, not by rendering an actual print job, since headless Playwright cannot drive
// window.print()); (2) persistent, per-area save-status indicator (main record / inspection plan
// / attachments) reflecting real save outcomes, never collapsing all three into one flag;
// (3) item panel + primary action buttons now use the existing i18n mechanism instead of
// hardcoded English, while Activity's own bilingual EN/CH content inputs remain two separate
// fields.
// Reuses icp_full / icp-itp-with-items from seed_itp_checklist_publish_uiux_review.py (same
// module, same permission set already needed here).
//
// IMPORTANT discovered while writing this test (pre-existing behavior, NOT changed by this
// batch): ITP.tsx's onSave already auto-closes the edit modal whenever the attachment phase has
// zero errors (`if (errors.length === 0) { setIsEditModalOpen(false); ... }`) — a fully clean
// Save/Publish has always closed the modal. The persistent save-status bar is therefore mainly
// observable (a) while editing, before any save, and (b) after a PARTIAL failure, which is also
// exactly the case the batch's own requirement ("never show the whole record as saved just
// because one step succeeded") is about — so this test deliberately exercises that case via one
// SIMULATED attachment-upload failure (route interception), not a real broken upload.
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
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const editModal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
const planTabBtn = pg => editModal(pg).locator('button', { hasText: '檢驗計畫' });
const saveBtn = pg => editModal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const statusBadge = (pg, labelText) => editModal(pg).locator('span', { hasText: labelText });

const openByRef = async (pg, ref) => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    await pg.locator('input[placeholder="搜尋 ITP..."]').first().fill(ref);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: ref }).first().click();
    await editModal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
};

const full = await login('icp_full');

// ══ 1. Compact header replaces the permanently-visible print header on screen ══════════════════════
try {
    await openByRef(full, 'QTS-ICP-ITP-000001');
    await planTabBtn(full).click();
    await full.waitForTimeout(400);
    const bigTitle = editModal(full).locator('h1', { hasText: 'INSPECTION & TEST PLAN' });
    note('1a. the old permanently-visible print-style H1 title exists in the DOM but is NOT visible on screen (display:none via `hidden`, restored only under print media)', await bigTitle.isVisible());
    const compactBar = editModal(full).locator('span.font-mono', { hasText: 'QTS-ICP-ITP-000001' });
    note('1b. the new compact identity bar IS visible on screen with the document reference', await compactBar.first().isVisible());
} catch (e) { fail('1. Compact on-screen header replaces the print-style header', e); }

// ══ 2. Footer action buttons + item panel are localized ═══════════════════════════════════════════
try {
    note('2a. Print button localized (列印)', await editModal(full).locator('button', { hasText: '列印' }).count());
    note('2b. Add New Item button localized (新增項目)', await editModal(full).locator('button', { hasText: '新增項目' }).count());
    note('2c. Publish button localized (發布)', await editModal(full).locator('button', { hasText: '發布' }).count());

    await editModal(full).locator('button', { hasText: /新增項目|Add New Item/ }).click();
    await full.waitForTimeout(400);
    const panel = full.locator('div.rounded-2xl').filter({ has: full.locator('h3', { hasText: '新增檢驗項目' }) });
    await panel.waitFor({ timeout: 5000 });
    note('2d. item panel title localized (新增檢驗項目)', await panel.locator('h3').innerText());
    note('2e. item panel field label localized ("檢驗活動（中／英）")', await panel.locator('label', { hasText: '檢驗活動' }).count());
    await panel.locator('button', { hasText: '取消' }).click();
    await full.waitForTimeout(300);
} catch (e) { fail('2. Footer buttons + item panel localized', e); }

// ══ 3. Save-status bar: initial state, then editing General flips ONLY Main Record ═════════════════
try {
    note('3a. initial state, existing unmodified record (expect all 已保存/Saved)',
        `main=${await statusBadge(full, '主資料：').first().innerText()} plan=${await statusBadge(full, '檢驗計畫：').first().innerText()} attach=${await statusBadge(full, '附件：').first().innerText()}`);

    await editModal(full).locator('button', { hasText: '基本資訊' }).click();
    await full.waitForTimeout(300);
    const descInput = editModal(full).locator('label', { hasText: '主旨' }).locator('xpath=following-sibling::input[1]');
    await descInput.fill('Batch 2 save-status probe — edited description');
    await full.waitForTimeout(200);
    note('3b. after editing a General field: Main Record -> Unsaved, Plan/Attachments untouched',
        `main=${await statusBadge(full, '主資料：').first().innerText()} plan=${await statusBadge(full, '檢驗計畫：').first().innerText()} attach=${await statusBadge(full, '附件：').first().innerText()}`);
} catch (e) { fail('3. Save-status bar initial state + General edit flips only Main Record', e); }

// ══ 4. Item panel's own immediate Apply (existing, unchanged behavior for an existing record)
// reflects the REAL plan-save result independently of Main's still-unsaved edit ════════════════════
try {
    await planTabBtn(full).click();
    await full.waitForTimeout(300);
    await editModal(full).locator('button', { hasText: /新增項目|Add New Item/ }).click();
    await full.waitForTimeout(400);
    const panel = full.locator('div.rounded-2xl').filter({ has: full.locator('h3', { hasText: '新增檢驗項目' }) });
    await panel.waitFor({ timeout: 5000 });
    const activityEn = panel.locator('label', { hasText: '檢驗活動' }).locator('xpath=following-sibling::input[1]');
    await activityEn.fill('Batch 2 probe item');
    await panel.locator('button', { hasText: '套用' }).click();
    await full.waitForTimeout(1000);
    note('4a. after the item panel\'s own immediate Apply (real PUT): Plan -> Saved, while Main is STILL Unsaved (its edit from step 3 has not been sent by the main Save button yet) — proves the two are genuinely independent, not one flag',
        `main=${await statusBadge(full, '主資料：').first().innerText()} plan=${await statusBadge(full, '檢驗計畫：').first().innerText()}`);
} catch (e) { fail('4. Item panel Apply updates Plan status independently of Main', e); }

// ══ 5. Queue a pending attachment -> Attachments flips to pending, independent of Main/Plan ════════
try {
    await editModal(full).locator('button', { hasText: '基本資訊' }).click();
    await full.waitForTimeout(300);
    const fileInput = editModal(full).locator('input[type=file]').first();
    if (await fileInput.count() > 0) {
        await fileInput.setInputFiles({ name: 'batch2-probe.txt', mimeType: 'text/plain', buffer: Buffer.from('probe') });
        await full.waitForTimeout(300);
        note('5a. after queuing a pending file (not yet saved): Attachments -> 尚未處理 (pending)', await statusBadge(full, '附件：').first().innerText());
    } else {
        note('5. SKIPPED — no file input control found on this build', '');
    }
} catch (e) { fail('5. Queuing an attachment flips its own status to pending', e); }

// ══ 6. SIMULATED attachment-upload failure (route interception, NOT a real broken upload — used
// only to reach the "main+plan saved, attachments failed" state without a real network fault) —
// the modal must stay open (per existing behavior: it only auto-closes when the attachment phase
// has zero errors) and Attachments must show 'failed' while Main/Plan correctly show 'saved',
// NEVER collapsed into one "everything saved" state ═════════════════════════════════════════════════
try {
    await full.route('**/api/files/**', route => route.fulfill({ status: 500, body: JSON.stringify({ detail: 'simulated upload failure' }) }));
    await saveBtn(full).click();
    await full.waitForTimeout(1500);
    await full.unroute('**/api/files/**');
    note('6a. modal still open after a partial failure (attachment phase errored) — expect > 0', await editModal(full).count());
    note('6b. Main Record + Inspection Plan correctly show Saved (their own writes succeeded) while Attachments shows failed — the record is NOT presented as fully saved',
        `main=${await statusBadge(full, '主資料：').first().innerText()} plan=${await statusBadge(full, '檢驗計畫：').first().innerText()} attach=${await statusBadge(full, '附件：').first().innerText()}`);
} catch (e) { fail('6. Simulated partial attachment failure: per-area status stays accurate, not collapsed', e); }

// ══ 7. Retry (real, no interception this time): attachment succeeds -> errors.length===0 -> the
// modal auto-closes (pre-existing behavior, unchanged) — verify the REAL DB state directly since
// the badges are no longer on screen to check ══════════════════════════════════════════════════════
try {
    const beforeCount = sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='icp-itp-with-items';`);
    await saveBtn(full).click();
    await full.waitForTimeout(1500);
    note('7a. modal count after a fully clean retry (expect 0 — closes per existing behavior, unrelated to this batch)', await editModal(full).count());
    const afterCount = sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='icp-itp-with-items';`);
    note('7b. real DB attachment count before/after the successful retry', `${beforeCount} -> ${afterCount}`);
    note('7c. real DB description reflects the Main Record edit from step 3', sql(`SELECT description FROM itp WHERE id='icp-itp-with-items';`));
} catch (e) { fail('7. Clean retry actually persists everything and closes as before', e); }

await browser.close();
console.log('DONE');
