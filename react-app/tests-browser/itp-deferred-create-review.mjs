// ITP deferred-create review (2026-09-28, round 2). Real isolated backend + real screens.
// Batch scope: "Add New" must not write a blank record to the backend; the record is created only
// on the user's first Save/Publish click (create-only completes it); every subsequent save on an
// EXISTING record still requires itp:update:all; attachment upload/delete ALWAYS requires
// itp:update:all (Option A, confirmed backend policy, NOT changed) and is now disabled client-side
// with an explanatory note whenever the caller lacks it, so nobody selects a file only to hit a
// 403 after Save. Backend permission gate, scope, WorkflowEngine untouched.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
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
const descField = pg => modal(pg).locator('label', { hasText: '主旨' }).first().locator('xpath=following-sibling::input[1]');
const vendorSelect = pg => modal(pg).locator('label', { hasText: '承攬廠商' }).first().locator('xpath=following-sibling::select[1]');
const saveBtn = pg => modal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const cancelBtn = pg => modal(pg).locator('button', { hasText: /^(取消|Cancel|關閉|Close)$/ }).first();
const toasts = async pg => (await pg.locator('[data-sonner-toast]').allInnerTexts());
function countRequests(pg, method, pathPrefix) {
    const state = { count: 0 };
    pg.on('request', req => { if (req.method() === method && req.url().includes(pathPrefix)) state.count++; });
    return state;
}
const openAddNew = async pg => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    await pg.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(400);
};
const fillBasicFields = async (pg, description) => {
    await descField(pg).fill(description, { timeout: 5000 });
    await vendorSelect(pg).selectOption('ITP DeferredCreate Review Co', { timeout: 5000 });
};
const goToPlanTab = async pg => { await modal(pg).locator('button', { hasText: '檢驗計畫' }).click(); await pg.waitForTimeout(300); };
const goToGeneralTab = async pg => { await modal(pg).locator('button', { hasText: '基本資訊' }).click(); await pg.waitForTimeout(300); };

// Opens "Add New Item", fills every representative field type (free text EN/CH, an array field
// [Criteria], and an enum <select> [Verification Point]), and clicks Apply. Used to verify actual
// FIELD CONTENT survives the create round-trip, not just item id/order/count.
const addInspectionItemWithContent = async (pg, item) => {
    await modal(pg).locator('button', { hasText: /Add New Item/ }).first().click();
    await pg.waitForTimeout(200);
    const panel = pg.locator('.fixed.inset-0').last();
    const fillPair = async (labelText, en, ch) => {
        const label = panel.locator('label', { hasText: labelText });
        await label.locator('xpath=following-sibling::input[1]').fill(en);
        if (ch !== undefined) await label.locator('xpath=following-sibling::input[2]').fill(ch);
    };
    await fillPair('Activity (EN/CH)', item.activityEn, item.activityCh);
    await fillPair('Standard (EN/CH)', item.standardEn);
    await panel.locator('button', { hasText: '+ Add Criteria' }).click();
    await pg.waitForTimeout(150);
    // NOTE: the Standard EN input ALSO has placeholder="EN" and appears earlier in the DOM than
    // the newly-added criteria row's EN input — .first() would silently overwrite Standard
    // instead of filling Criteria. Use .nth(1) (the second "EN"-placeholder input) instead.
    await panel.locator('input[placeholder="EN"]').nth(1).fill(item.criteriaEn);
    await fillPair('Check Time (EN/CH)', item.checkTimeEn);
    await fillPair('Method (EN/CH)', item.methodEn);
    await fillPair('Frequency (EN/CH)', item.frequencyEn);
    await panel.locator('label', { hasText: 'Record' }).locator('xpath=following-sibling::input[1]').fill(item.record);
    // Verification Point: an enum <select> per role (Sub-Con/Main Con/Employer/HSE) — set two
    // distinct roles to cover the enum field type as a "representative supported field".
    await panel.locator('text=Sub-Con').locator('xpath=following::select[1]').selectOption(item.vpSub);
    await panel.locator('text=HSE').locator('xpath=following::select[1]').selectOption(item.vpHse);
    await panel.locator('button', { hasText: /Apply/ }).first().click();
    await pg.waitForTimeout(300);
};
// Reads back one item's row from the on-screen table (Activity/Standard/CheckTime/Method/
// Frequency/Records/VP columns) as plain text, keyed by its Event No. (A1/A2/...).
const readItemRowText = async (pg, eventNo) => {
    await goToPlanTab(pg);
    // Rooted at the page (pg), not at modal(pg) — a filter's `has` locator must be page/frame-
    // rooted to correctly match descendants of each candidate row; rooting it at an already-
    // scoped sub-locator silently matches nothing (confirmed via a standalone repro).
    const row = pg.locator('tr').filter({ has: pg.locator('td', { hasText: eventNo }) }).first();
    return (await row.innerText()).replace(/\s+/g, ' ').trim();
};

const creator = await login('itp_new_create_only');
const updater = await login('itp_new_update_only');
const full = await login('itp_new_full');
const multiscope = await login('itp_new_create_multiscope');
const createApprove = await login('itp_new_create_approve');

// ══ 1. Add New button visibility depends on itp:create:all ═══════════════════════════════════════
try {
    await creator.goto(UI + '/itp'); await creator.waitForTimeout(800);
    note('1a. Add New button visible to itp_new_create_only (has itp:create:all)', await creator.locator('button', { hasText: /新增|Add/ }).count());
    // itp_new_update_only has NO itp:create:all -> button must now be hidden (this batch's fix).
    await updater.goto(UI + '/itp'); await updater.waitForTimeout(800);
    note('1b. Add New button visible to itp_new_update_only (NO itp:create:all, expect 0 — previously an informational-only gap, now fixed)', await updater.locator('button', { hasText: /新增|Add/ }).count());
} catch (e) { fail('1. Add New button gated by itp:create:all', e); }

// ══ 2. Full Inspection Plan lifecycle BEFORE first save sends ZERO write requests ════════════════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    const putDetailReqs = countRequests(creator, 'PUT', '/detail');
    const postReqs = countRequests(creator, 'POST', '/api/itp/');
    const checklistPostReqs = countRequests(creator, 'POST', '/api/checklist/');
    await openAddNew(creator);
    await fillBasicFields(creator, 'Plan lifecycle before save');

    // Add
    await goToPlanTab(creator);
    await modal(creator).locator('button', { hasText: /Add New Item/ }).first().click();
    await creator.waitForTimeout(200);
    await modal(creator).locator('button', { hasText: /Apply/ }).first().click();
    await creator.waitForTimeout(300);
    note('2a. plan tab shows 1 item after Add+Apply', await modal(creator).locator('button', { hasText: '檢驗計畫' }).innerText());

    // Modify (open the just-added item's editor and re-apply — exercises the edit path itself,
    // not just add).
    await modal(creator).locator('button[title="Edit"]').first().click();
    await creator.waitForTimeout(200);
    await modal(creator).locator('button', { hasText: /Apply/ }).first().click();
    await creator.waitForTimeout(300);

    // Delete then re-add, to exercise delete before save too (window.confirm auto-accepted by
    // this page's dialog handler set in login()).
    await modal(creator).locator('button[title="Delete"]').first().click();
    await creator.waitForTimeout(300);
    note('2a2. item removed by Delete before save', await modal(creator).locator('button', { hasText: '檢驗計畫' }).innerText());
    await modal(creator).locator('button', { hasText: /Add New Item/ }).first().click();
    await creator.waitForTimeout(200);
    await modal(creator).locator('button', { hasText: /Apply/ }).first().click();
    await creator.waitForTimeout(300);

    note('2b. PUT .../detail requests fired by add/modify/delete/Apply BEFORE any save (expect 0)', putDetailReqs.count);
    note('2c. row count unchanged throughout (expect no POST fired at all)', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);
    note('2d. total POST /api/itp/ requests so far (expect 0)', postReqs.count);

    // Generate Checklist while unsaved must create nothing (itpId is still null).
    await modal(creator).locator('button', { hasText: /Generate Checklist/ }).first().click();
    await creator.waitForTimeout(800);
    note('2e. Generate Checklist while unsaved: toast shown, no checklist created', (await toasts(creator)).join(' | '));
    note('2f. checklist table unaffected (expect 0 POST to /api/checklist/)', checklistPostReqs.count);
    note('2g. checklist row count for this ITP is 0 (nothing created)', sql(`SELECT COUNT(*) FROM checklist WHERE activity='Plan lifecycle before save';`));

    await goToGeneralTab(creator);
    await cancelBtn(creator).click();
    await creator.waitForTimeout(600);
    note('2h. row count unchanged after Cancel (main record AND plan both never landed)', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);
    note('2i. total POST /api/itp/ requests for the whole sequence (expect 0)', postReqs.count);
} catch (e) { fail('2. Full Plan lifecycle before save sends nothing', e); }

// ══ 3. First save: FULL FIELD CONTENT (not just id/order/count) survives the round trip ═════════
// Two items with distinct, representative values across every field TYPE the editor exposes: free
// text (Activity/Standard/CheckTime/Method/Frequency), an array field (Criteria), a freeform
// autocomplete field (Record), and an enum <select> field (Verification Point, two roles each).
let createdId = null, createdRef = null;
const ITEM_1 = { activityEn: 'Rebar spacing check', activityCh: '鋼筋間距檢查', standardEn: 'ACI 318', criteriaEn: 'Spacing <= 200mm', checkTimeEn: 'Before pour', methodEn: 'Visual + tape measure', frequencyEn: 'Every pour', record: 'ITR-0001', vpSub: 'H', vpHse: 'W' };
const ITEM_2 = { activityEn: 'Concrete slump test', activityCh: '混凝土坍度試驗', standardEn: 'ASTM C143', criteriaEn: '75-100mm slump', checkTimeEn: 'At delivery', methodEn: 'Slump cone test', frequencyEn: 'Per truck', record: 'ITR-0002', vpSub: 'R', vpHse: '※' };
try {
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    await openAddNew(creator);
    await fillBasicFields(creator, 'Field-by-field roundtrip check');
    await goToPlanTab(creator);
    await addInspectionItemWithContent(creator, ITEM_1);
    await addInspectionItemWithContent(creator, ITEM_2);

    const rowA1Before = await readItemRowText(creator, 'A1');
    const rowA2Before = await readItemRowText(creator, 'A2');
    note('3a. on-screen row content BEFORE save — A1', rowA1Before);
    note('3a2. on-screen row content BEFORE save — A2', rowA2Before);

    await goToGeneralTab(creator);
    await saveBtn(creator).click();
    await creator.waitForTimeout(1200);
    const row = sql(`SELECT id, referenceNo FROM itp WHERE description='Field-by-field roundtrip check';`);
    createdId = row.split('|')[0];
    createdRef = row.split('|')[1];
    note('3b. row count increased by exactly 1', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);

    // Check the RAW DATABASE VALUE first save actually wrote — every field, both items.
    const stored = JSON.parse(sql(`SELECT detail_data FROM itp WHERE id='${createdId}';`));
    const [dbA1, dbA2] = stored.a || [];
    const fieldsMatch = (dbItem, expected) =>
        dbItem?.id === expected.expectId &&
        dbItem?.activity?.en === expected.activityEn && dbItem?.activity?.ch === expected.activityCh &&
        (typeof dbItem?.standard === 'string' ? dbItem.standard : dbItem?.standard?.en) === expected.standardEn &&
        (Array.isArray(dbItem?.criteria) ? dbItem.criteria[0]?.en : undefined) === expected.criteriaEn &&
        dbItem?.checkTime?.en === expected.checkTimeEn &&
        dbItem?.method?.en === expected.methodEn &&
        (typeof dbItem?.frequency === 'string' ? dbItem.frequency : dbItem?.frequency?.en) === expected.frequencyEn &&
        dbItem?.record === expected.record &&
        dbItem?.vp?.sub === expected.vpSub && dbItem?.vp?.hse === expected.vpHse;
    note('3c. DB detail_data for A1 matches every field exactly (activity/standard/criteria/checkTime/method/frequency/record/vp)', fieldsMatch(dbA1, { ...ITEM_1, expectId: 'A1' }));
    note('3d. DB detail_data for A2 matches every field exactly', fieldsMatch(dbA2, { ...ITEM_2, expectId: 'A2' }));
    note('3e. raw DB values for A1 (for inspection, not itself an assertion)', JSON.stringify(dbA1));
    note('3f. raw DB values for A2 (for inspection, not itself an assertion)', JSON.stringify(dbA2));

    // Reopen and compare the SAME on-screen row content against what was shown before save.
    await creator.goto(UI + '/itp'); await creator.waitForTimeout(800);
    const searchInput = creator.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(createdRef);
    await creator.waitForTimeout(700);
    await creator.locator('tr', { hasText: createdRef }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(400);
    const rowA1After = await readItemRowText(creator, 'A1');
    const rowA2After = await readItemRowText(creator, 'A2');
    note('3g. on-screen row content for A1 UNCHANGED after reopen (before === after)', rowA1Before === rowA1After);
    note('3h. on-screen row content for A2 UNCHANGED after reopen (before === after)', rowA2Before === rowA2After);
} catch (e) { fail('3. First save preserves full field content, not just id/order/count', e); }

// ══ 4. create-only: attachment controls are DISABLED with an explanatory note (never a 403 after
// selecting a file) — both for a brand-new record and for the one just created ══════════════════
try {
    await openAddNew(creator);
    await fillBasicFields(creator, 'Attachment control check (new)');
    const fileInputCountNew = await modal(creator).locator('input[type=file]').count();
    note('4a. file input present for create-only on a NEW record (expect 0 — disabled up front)', fileInputCountNew);
    const noteTextNew = await modal(creator).locator('text=更新權限').first().innerText().catch(() => '');
    note('4b. explanatory note shown on a NEW record', noteTextNew);
    await cancelBtn(creator).click();
    await creator.waitForTimeout(400);

    // On the just-created EXISTING record from step 3 (create-only, no update):
    await creator.goto(UI + '/itp'); await creator.waitForTimeout(800);
    const searchInput = creator.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(createdRef);
    await creator.waitForTimeout(700);
    await creator.locator('tr', { hasText: createdRef }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(400);
    const fileInputCountExisting = await modal(creator).locator('input[type=file]').count();
    note('4c. file input present for create-only reopening its OWN existing record (expect 0)', fileInputCountExisting);
    // Whole form is also read-only now (existing record, no itp:update:all).
    note('4d. description field disabled on the existing record (expect true — existing record now correctly requires itp:update:all)', await descField(creator).isDisabled());
    const saveVisible = await modal(creator).locator('button', { hasText: /^(儲存|Save)$/ }).count();
    note('4e. Save button hidden on this read-only reopen (expect 0)', saveVisible);
    await creator.keyboard.press('Escape').catch(() => {});
} catch (e) { fail('4. Attachment controls disabled + explanatory note for create-only', e); }

// ══ 5. Full-permission account: create -> attachment fails -> retry in the SAME window, with a
// mid-retry field edit, reuses the SAME id, sends exactly one more POST-equivalent (no duplicate
// create), and completes the upload. A different account completing the upload is NOT accepted as
// evidence for this path — this is the same session/window throughout. ══════════════════════════
const tmpFile = `${process.env.TMPDIR || '/tmp'}/itp-dc-review-upload.txt`;
writeFileSync(tmpFile, 'itp deferred-create review upload content');
try {
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    const postReqs = countRequests(full, 'POST', '/api/itp/');
    await openAddNew(full);
    await fillBasicFields(full, 'Full-account create-then-attach-retry');
    await goToPlanTab(full);
    await modal(full).locator('button', { hasText: /Add New Item/ }).first().click();
    await full.waitForTimeout(200);
    await modal(full).locator('button', { hasText: /Apply/ }).first().click();
    await full.waitForTimeout(300);
    await goToGeneralTab(full);
    const fileInputVisible = await modal(full).locator('input[type=file]').count();
    note('5a. file input IS available to a full-permission account (has itp:update:all)', fileInputVisible);
    await modal(full).locator('input[type=file]').first().setInputFiles(tmpFile);
    await full.waitForTimeout(300);

    await full.route('**/api/files/upload*', route => route.abort('failed'));
    await saveBtn(full).click();
    await full.waitForTimeout(1500);
    note('5b. modal still open after the attachment failure', await modal(full).isVisible());
    note('5c. exactly one row created (record + plan already saved)', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);
    const row = sql(`SELECT id FROM itp WHERE description='Full-account create-then-attach-retry';`);
    const rowId = row;
    note('5d. total POST /api/itp/ so far (expect exactly 1 — the create; none yet from a retry)', postReqs.count);

    // Mid-retry field edit: change the description before retrying.
    await descField(full).fill('Full-account create-then-attach-retry (edited before retry)', { timeout: 5000 });
    await full.unroute('**/api/files/upload*');
    await saveBtn(full).click();
    await full.waitForTimeout(1500);
    note('5e. retry succeeds: modal closed', !(await modal(full).isVisible().catch(() => false)));
    note('5f. STILL exactly one row for this id (no duplicate create on retry)', sql(`SELECT COUNT(*) FROM itp WHERE id='${rowId}';`));
    note('5g. total POST /api/itp/ across the whole sequence (expect exactly 1 — the retry used PUT, not a second POST)', postReqs.count);
    note('5h. the mid-retry field edit WAS saved', sql(`SELECT description FROM itp WHERE id='${rowId}';`));
    note('5i. attachment now present after the successful retry', sql(`SELECT COUNT(*) FROM attachments WHERE entity_type='itp' AND entity_id='${rowId}';`));
} catch (e) { fail('5. Full-permission account: create, attachment-fail, SAME-window retry with a mid-retry edit', e); }

// ══ 6. First-save failure (simulated + real) — still holds after the permission-gating changes ══
try {
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    await openAddNew(creator);
    await fillBasicFields(creator, 'Simulated-500 first save (round2)');
    await creator.route('**/api/itp/', route => { if (route.request().method() === 'POST') route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'forced 500' }) }); else route.continue(); });
    await saveBtn(creator).click();
    await creator.waitForTimeout(1000);
    note('6a. modal still open after simulated 500', await modal(creator).isVisible());
    note('6b. description input preserved', await descField(creator).inputValue());
    note('6c. row count unchanged', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);
    await creator.unroute('**/api/itp/');
    await saveBtn(creator).click();
    await creator.waitForTimeout(1200);
    note('6d. retry succeeds, exactly +1 row', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);
} catch (e) { fail('6. First save simulated failure still holds', e); }

try {
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    await openAddNew(multiscope);
    await fillBasicFields(multiscope, 'Real-rejection first save (round2)');
    await saveBtn(multiscope).click();
    await multiscope.waitForTimeout(1000);
    note('6e. modal still open after a REAL backend 403 (ambiguous project scope, no interception; multi-project picker gap remains a separate open item, not addressed this batch)', await modal(multiscope).isVisible());
    note('6f. row count unchanged', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);
} catch (e) { fail('6b. First save real rejection still holds', e); }

// ══ 6.5. Publish path: NEW record uses create+approve (never update); EXISTING record needs
// update+approve, confirmed by ACTUALLY exercising both, not by re-describing the old design ═════
try {
    // itp_new_create_approve: itp:create:all + itp:approve:all, deliberately NO itp:update:all.
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    await openAddNew(createApprove);
    await fillBasicFields(createApprove, 'Publish on brand-new record');
    const publishBtnNew = modal(createApprove).locator('button', { hasText: 'Publish' });
    note('6g. Publish button IS offered on a NEW record for create+approve (no update) — confirms new-record Publish does not gate on itp:update:all client-side', await publishBtnNew.count());
    await publishBtnNew.first().click();
    await createApprove.waitForTimeout(1200);
    note('6h. modal closed: Publish succeeded on the brand-new record using ONLY create+approve (no update)', !(await modal(createApprove).isVisible().catch(() => false)));
    const created = sql(`SELECT status, rev FROM itp WHERE description='Publish on brand-new record';`);
    note('6i. the record was created directly as Approved (status|rev)', created);
    note('6j. row count increased by exactly 1 (a real POST, not a PUT — this account never held itp:update:all)', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);

    // Same account, EXISTING record (idc-itp-existing): Publish must be UNAVAILABLE — this
    // account still lacks itp:update:all, and update_itp's router requires it unconditionally
    // for every PUT, including Publish's.
    await createApprove.goto(UI + '/itp'); await createApprove.waitForTimeout(800);
    const searchInput65 = createApprove.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput65.fill('QTS-IDC-ITP-000001');
    await createApprove.waitForTimeout(700);
    await createApprove.locator('tr', { hasText: 'QTS-IDC-ITP-000001' }).first().click();
    await modal(createApprove).waitFor({ timeout: 10000 });
    await createApprove.waitForTimeout(400);
    const publishBtnExisting = modal(createApprove).locator('button', { hasText: 'Publish' });
    note('6k. Publish button on an EXISTING record for create+approve (no update, expect 0 — existing records need update+approve)', await publishBtnExisting.count());
} catch (e) { fail('6.5 Publish path: new=create+approve, existing=update+approve', e); }

// ══ 7. update-only (no create) still cannot create; existing-record edit/Publish regression ═════
try {
    const countBefore = sql(`SELECT COUNT(*) FROM itp;`);
    const putRes = await apiCall(updater, 'POST', '/api/itp/', { description: 'should be rejected', vendor: 'ITP DeferredCreate Review Co', status: 'Pending' });
    note('7a. update-only direct POST create (expect 403)', `HTTP ${putRes.status}`);
    note('7b. row count unchanged', `${countBefore} -> ${sql(`SELECT COUNT(*) FROM itp;`)}`);

    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    const searchInput = full.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill('QTS-IDC-ITP-000001');
    await full.waitForTimeout(700);
    await full.locator('tr', { hasText: 'QTS-IDC-ITP-000001' }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(400);
    await descField(full).fill('Existing ITP edited (regression check)', { timeout: 5000 });
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    note('7c. existing-record edit still closes on success', !(await modal(full).isVisible().catch(() => false)));
    note('7d. DB reflects the edit', sql(`SELECT description FROM itp WHERE id='idc-itp-existing';`));

    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await searchInput.fill('QTS-IDC-ITP-000001');
    await full.waitForTimeout(700);
    await full.locator('tr', { hasText: 'QTS-IDC-ITP-000001' }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(400);
    await goToPlanTab(full);
    const publishBtn = modal(full).locator('button', { hasText: 'Publish' });
    note('7e. Publish button visible to itp_new_full (has itp:approve:all AND itp:update:all)', await publishBtn.count());
    await publishBtn.first().click();
    await full.waitForTimeout(1200);
    note('7f. Publish succeeds, status now Approved', sql(`SELECT status, rev FROM itp WHERE id='idc-itp-existing';`));
} catch (e) { fail('7. update-only still cannot create; existing edit/Publish regression', e); }

await browser.close();
console.log('DONE');
