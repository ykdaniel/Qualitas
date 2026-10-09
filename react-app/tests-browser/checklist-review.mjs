// Checklist template/instance business review — real screens, isolated stack (2026-09-23).
// Each numbered section is wrapped in try/catch so one locator failure doesn't abort the rest;
// failures are reported as "NOT VERIFIED ON SCREEN", never silently treated as a product defect.
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
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();

const full = await login('chk_full');
const noClose = await login('chk_no_close');

let itpId = null, templateChecklistId = null, templateRecordsNo = null, itrId = null, instanceRecordsNo = null;

// ══ 1. ITP source: create a real ITP with one inspection item, Generate Checklist for real ═══════════
try {
    await full.goto(UI + '/itp'); await full.waitForTimeout(1200);
    await full.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    itpId = sql(`SELECT id FROM itp ORDER BY rowid DESC LIMIT 1;`);
    note('ITP created for Checklist-source test', itpId);

    // "Add New Item" / "Generate Checklist" only render on the 2nd tab ("Inspection Plan"), not the default
    // "General Info" tab. The UI is in zh locale, so the English label doesn't match — target by tab position.
    await modal(full).locator('[class*=tabButton]').nth(1).click();
    await full.waitForTimeout(400);
    await modal(full).locator('button', { hasText: 'Add New Item' }).first().click();
    await full.waitForTimeout(400);
    // Item editor is a page-level overlay (NOT nested in modalContent) — target by the "Activity (EN/CH)" label
    const activityLabel = full.locator('label', { hasText: 'Activity (EN/CH)' }).first();
    await activityLabel.waitFor({ timeout: 5000 });
    const activityInput = activityLabel.locator('xpath=following-sibling::input[1]');
    await activityInput.fill('Checklist-review source item');
    await full.locator('button', { hasText: 'Apply' }).first().click();
    await full.waitForTimeout(500);
    note('inspection item added to ITP via the real item editor (Activity + Apply)', true);

    const genBtn = modal(full).locator('button', { hasText: 'Generate Checklist' });
    const disabled = await genBtn.first().isDisabled();
    note('Generate Checklist enabled after adding the item', !disabled);
    if (!disabled) {
        await genBtn.first().click();
        await full.waitForTimeout(1500);
        const row = sql(`SELECT id, recordsNo, status, itpId, itpVersion, itrId, template_id FROM checklist WHERE itpId='${itpId}' ORDER BY rowid DESC LIMIT 1;`);
        note('checklist row generated FROM the real click (id|recordsNo|status|itpId|itpVersion|itrId|template_id)', row);
        const parts = row.split('|');
        templateChecklistId = parts[0]; templateRecordsNo = parts[1];
        note('itpId correctly propagated (non-empty) into the generated template', parts[3] === itpId);
    }
} catch (e) { fail('1. ITP source', e); }

// ══ 2. Template edit + version bump (real screen, on the Checklist module) ═══════════════════════════
try {
    if (!templateRecordsNo) throw new Error('no template from step 1 to edit');
    await full.goto(UI + '/checklist'); await full.waitForTimeout(1200);
    const versionBefore = sql(`SELECT version FROM checklist WHERE recordsNo='${templateRecordsNo}';`);
    note('template version before edit', versionBefore);
    // Checklist's editor is an INLINE page view (Checklist.tsx swaps view==='list'/'editor' in place), NOT a modal.
    await full.locator('tr', { hasText: templateRecordsNo }).first().click();
    await full.waitForTimeout(800);
    let didEdit = false;
    const activityLabel2 = full.locator('label', { hasText: /Activity/i }).first();
    if (await activityLabel2.count()) {
        const inp = activityLabel2.locator('xpath=following-sibling::input[1]');
        if (await inp.count()) {
            await inp.fill('Checklist-review source item EDITED');
            didEdit = await inp.inputValue() === 'Checklist-review source item EDITED';
        }
    }
    note('edited the template activity field on screen (fill confirmed via inputValue readback)', didEdit);
    const putLog = [];
    full.on('response', r => { const u = new URL(r.url()); if (u.pathname.includes('/api/checklist/') && r.request().method() === 'PUT') putLog.push(`${r.status()}`); });
    // A bare template's Save button reads "Save Template"/"儲存範本" (t('checklist.saveTemplate')), NOT
    // plain "Save"/"儲存" — that's a different button than the ITR-instance Save used elsewhere below.
    const saveBtn = full.locator('button', { hasText: /^(儲存範本|Save Template)$/ });
    note('template Save button found', await saveBtn.count() > 0);
    if (await saveBtn.count()) { await saveBtn.first().click(); await full.waitForTimeout(1200); }
    const toastAfterSave = (await full.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
    note('PUT request(s) fired by clicking Save', JSON.stringify(putLog));
    note('toast after Save (should include the new version number per checklist.saveSuccessWithVersion)', toastAfterSave);
    const versionAfter = sql(`SELECT version, activity FROM checklist WHERE recordsNo='${templateRecordsNo}';`);
    note('template version+activity after edit+save (read back from DB)', versionAfter);
} catch (e) { fail('2. Template edit + version', e); }

// ══ 3. ITR reference: link the ITP-generated template into a real ITR via the real dropdown ═══════════
try {
    if (!templateChecklistId) throw new Error('no template checklist id from step 1');
    // Correction: AppProviders.tsx calls useNOIStore.getState().fetchNOIs() globally at app init, so the
    // store is populated regardless of which page the user starts on — the earlier hypothesis that ITR's
    // NOI picker depends on having visited /noi first was wrong; retracted, not reported as a finding.
    await full.goto(UI + '/itr'); await full.waitForTimeout(1200);
    await full.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    // Unlike ITP, ITR's "Add" only opens a blank modal — it does NOT auto-create a row. The checklist-link
    // dropdown stays disabled until persistedItrId exists, so the new ITR must actually be Saved first.
    // Also: ITR creation requires an NOI to be selected (client-side validation, confirmed via debug run:
    // toast "請選擇一個 NOI 編號。" when omitted) — select the one seeded for this review.
    // Debug run confirmed: the NOI picker is reliably the FIRST <select> in the new-ITR modal (options: ["選擇 NOI", "QTS-CRC-NOI-000001"]).
    const noiSelect = modal(full).locator('select').first();
    const noiOpts = await noiSelect.locator('option').allInnerTexts();
    note('NOI selector options', JSON.stringify(noiOpts));
    await noiSelect.selectOption('QTS-CRC-NOI-000001');
    await full.waitForTimeout(400);

    const beforeItrCount = sql(`SELECT COUNT(*) FROM itr;`);
    const itrSaveBtn = modal(full).locator('button', { hasText: /^(儲存|Save)$/ });
    await itrSaveBtn.first().click();
    await full.waitForTimeout(1500);
    const afterItrCount = sql(`SELECT COUNT(*) FROM itr;`);
    note('ITR row count before/after clicking Save on the new ITR form', `${beforeItrCount} -> ${afterItrCount}`);
    itrId = sql(`SELECT id, documentNumber, status FROM itr ORDER BY rowid DESC LIMIT 1;`);
    note('ITR created for link test (id|documentNumber|status)', itrId);
    const itrIdOnly = itrId.split('|')[0];
    const itrDocNo = itrId.split('|')[1];

    // Save closes the modal (same success-path pattern as ITP/PQP) — reopen the row so persistedItrId is
    // set and the checklist-link dropdown (disabled while !persistedItrId) becomes usable.
    await full.waitForTimeout(800);
    await full.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(600);

    // Option value is the checklist's raw id (ITRModals.tsx: <option key={c.id} value={c.id}>). The
    // .filter({has:...}) chain proved unreliable for the NOI select above, so find the right <select>
    // by scanning each one's actual options for our known id instead of trusting a filter/index guess.
    const allSelects = modal(full).locator('select');
    const selCount = await allSelects.count();
    let targetIdx = -1;
    for (let i = 0; i < selCount; i++) {
        const vals = await allSelects.nth(i).locator('option').evaluateAll(els => els.map(e => e.value));
        if (vals.includes(templateChecklistId)) { targetIdx = i; break; }
    }
    note('link-checklist dropdown located by scanning option values', `index=${targetIdx} of ${selCount} selects`);
    if (targetIdx === -1) throw new Error('could not locate the checklist-link <select> containing the generated template id');
    const target = allSelects.nth(targetIdx);
    await target.selectOption(templateChecklistId);
    await full.waitForTimeout(1200);
    const instanceRow = sql(`SELECT recordsNo, itrId, template_id, itpId, itpVersion FROM checklist WHERE itrId='${itrIdOnly}' ORDER BY rowid DESC LIMIT 1;`);
    note('instance created by real screen link (recordsNo|itrId|template_id|itpId|itpVersion)', instanceRow);
    instanceRecordsNo = instanceRow.split('|')[0];
    note('template_id correctly points back to the source template', instanceRow.split('|')[2] === templateChecklistId);
} catch (e) { fail('3. ITR reference / link', e); }

// ══ 4. Instance independence: edit the TEMPLATE again after linking, confirm the INSTANCE is unaffected ═
try {
    if (!templateRecordsNo || !instanceRecordsNo) throw new Error('missing template or instance from earlier steps');
    const instanceActivityBefore = sql(`SELECT activity FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
    await full.goto(UI + '/checklist'); await full.waitForTimeout(1200);
    await full.locator('tr', { hasText: templateRecordsNo }).first().click();
    await full.waitForTimeout(800);
    const activityLabel3 = full.locator('label', { hasText: /Activity/i }).first();
    if (await activityLabel3.count()) {
        const inp = activityLabel3.locator('xpath=following-sibling::input[1]');
        if (await inp.count()) { await inp.fill('Checklist-review source item EDITED AGAIN post-link'); }
    }
    const saveBtn2 = full.locator('button', { hasText: /^(儲存範本|Save Template)$/ });
    if (await saveBtn2.count()) { await saveBtn2.first().click(); await full.waitForTimeout(1200); }
    const templateActivityAfter = sql(`SELECT activity FROM checklist WHERE recordsNo='${templateRecordsNo}';`);
    const instanceActivityAfter = sql(`SELECT activity FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
    note('template activity after 2nd edit', templateActivityAfter);
    note('instance activity BEFORE vs AFTER the template edit (should be identical — deep copy, not a live reference)', `${instanceActivityBefore}  |  ${instanceActivityAfter}`);
} catch (e) { fail('4. Instance independence', e); }

// ══ 5. Result filling on the instance (real screen, O/X/N-A radiogroup) ══════════════════════════════
try {
    if (!instanceRecordsNo) throw new Error('no instance from step 3');
    await full.goto(UI + '/itr'); await full.waitForTimeout(1200);
    await full.locator('tr', { hasText: itrId.split('|')[1] }).first().click();
    await modal(full).waitFor({ timeout: 10000 }).catch(() => {});
    await full.waitForTimeout(600);
    // Expand the linked instance row: the clickable header is the div.group.cursor-pointer containing recordsNo
    // (ITRModals.tsx: onClick={() => setExpandedInstanceId(...)}) — a generic hasText locator matched the
    // wrong (larger) ancestor in earlier attempts, so scope explicitly to that class.
    const instRow = modal(full).locator('div.group.cursor-pointer', { hasText: instanceRecordsNo }).first();
    note('instance row header located', await instRow.count() > 0);
    await instRow.click().catch(() => {});
    await full.waitForTimeout(1200);
    // Debug run confirmed: the expanded snapshot panel opens on a "基本資訊" (Basic Info) tab by default;
    // the result controls live under a separate "檢查項目" (Inspection Items) tab that must be clicked first.
    const itemsTab = full.locator('button', { hasText: /檢查項目|Inspection Items/i }).first();
    if (await itemsTab.count()) { await itemsTab.click(); await full.waitForTimeout(500); }
    note('clicked the Inspection Items tab within the expanded snapshot panel', await itemsTab.count() > 0);
    // Search the whole page, not just modal(full) — ChecklistSnapshotModal's "inline" prop is not a
    // guarantee it renders inside the same DOM subtree as the parent modalContent div.
    const radiogroup = full.locator('[role=radiogroup]').first();
    const rgCount = await radiogroup.count();
    if (rgCount === 0) {
        const expandedPanelVisible = await full.locator('.border-t.border-slate-200.p-3.bg-slate-50').count();
        note('expanded panel container visible even though no radiogroup found (helps tell "click failed" apart from "panel renders differently")', expandedPanelVisible > 0);
    }
    note('a result radiogroup is visible after expanding the instance', rgCount > 0);
    if (rgCount > 0) {
        // ORDER = [unfilled, pass, fail, na] -> pass is the 2nd button
        await radiogroup.locator('button').nth(1).click();
        await full.waitForTimeout(400);
        const saveInstBtn = modal(full).locator('button', { hasText: /^(儲存|Save)$/ });
        if (await saveInstBtn.count()) { await saveInstBtn.first().click(); await full.waitForTimeout(1200); }
        const afterFill = sql(`SELECT status, passCount, failCount FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
        note('instance status/passCount/failCount after marking the one item Pass and saving', afterFill);
    }
} catch (e) { fail('5. Result filling', e); }

// ══ 6. Reopen: with checklist:close:all (full) vs without (noClose) ══════════════════════════════════
try {
    if (!instanceRecordsNo) throw new Error('no instance to reopen');
    const statusBeforeReopen = sql(`SELECT status FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
    note('instance status before any reopen attempt', statusBeforeReopen);
    if (statusBeforeReopen.includes('Pass') || statusBeforeReopen.includes('Fail')) {
        // chk_no_close: does the Reopen button even render?
        await noClose.goto(UI + '/itr'); await noClose.waitForTimeout(1200);
        await noClose.locator('tr', { hasText: itrId.split('|')[1] }).first().click();
        await modal(noClose).waitFor({ timeout: 10000 }).catch(() => {});
        await noClose.waitForTimeout(600);
        const instRow2 = modal(noClose).locator('div.group.cursor-pointer', { hasText: instanceRecordsNo }).first();
        await instRow2.click().catch(() => {});
        await noClose.waitForTimeout(500);
        const reopenBtnNoClose = modal(noClose).locator('button', { hasText: /Reopen|重新開啟/i });
        note('chk_no_close (no checklist:close:all): Reopen button visible', await reopenBtnNoClose.count() > 0);

        // Now try the SAME action directly against the backend, bypassing the frontend gate, as chk_no_close.
        const bypassRes = await noClose.evaluate(async (id) => {
            const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
            const res = await fetch(`/api/checklist/${id}/`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify({ status: 'Ongoing' }) });
            return res.status;
        }, sql(`SELECT id FROM checklist WHERE recordsNo='${instanceRecordsNo}';`));
        note('chk_no_close: direct backend PUT status=Ongoing (bypassing the frontend button) on a Pass/Fail instance', `HTTP ${bypassRes}`);
        const statusAfterBypass = sql(`SELECT status FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
        note('instance status after the bypass attempt', statusAfterBypass);

        // chk_full: does Reopen actually work?
        await full.goto(UI + '/itr'); await full.waitForTimeout(1200);
        await full.locator('tr', { hasText: itrId.split('|')[1] }).first().click();
        await modal(full).waitFor({ timeout: 10000 }).catch(() => {});
        await full.waitForTimeout(600);
        const instRow3 = modal(full).locator('div.group.cursor-pointer', { hasText: instanceRecordsNo }).first();
        await instRow3.click().catch(() => {});
        await full.waitForTimeout(500);
        const reopenBtnFull = modal(full).locator('button', { hasText: /Reopen|重新開啟/i });
        if (await reopenBtnFull.count()) {
            await reopenBtnFull.first().click();
            await full.waitForTimeout(1200);
            const statusAfterReopen = sql(`SELECT status FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
            note('chk_full: instance status after clicking Reopen', statusAfterReopen);
        } else {
            note('chk_full: Reopen button not found on screen', '');
        }
    } else {
        note('instance never reached Pass/Fail — Reopen step skipped (depends on step 5 succeeding)', '');
    }
} catch (e) { fail('6. Reopen', e); }

// ══ 7. Delete protection: instance (must be blocked regardless of permission) vs bare template ═══════
try {
    if (instanceRecordsNo) {
        const instId = sql(`SELECT id FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
        const delInstRes = await full.evaluate(async (id) => {
            const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
            const res = await fetch(`/api/checklist/${id}/`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
            let j = null; try { j = await res.json(); } catch (_) {}
            return { status: res.status, body: j };
        }, instId);
        note('chk_full (has checklist:delete:all) attempts DELETE on the ITR-owned INSTANCE directly', `HTTP ${delInstRes.status} body=${JSON.stringify(delInstRes.body).slice(0, 200)}`);
        const stillThere = sql(`SELECT COUNT(*) FROM checklist WHERE id='${instId}';`);
        note('instance row still present after the delete attempt', stillThere);
    }
    if (templateChecklistId) {
        // chk_no_delete actually lacks checklist:delete:all (chk_no_close does NOT — it only lacks
        // checklist:close:all, and still holds delete; using it here would test the wrong thing).
        const noDelete = await login('chk_no_delete');
        const delTplNoDelete = await noDelete.evaluate(async (id) => {
            const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
            const res = await fetch(`/api/checklist/${id}/`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': csrf } });
            let j = null; try { j = await res.json(); } catch (_) {}
            return { status: res.status, body: j };
        }, templateChecklistId);
        note('chk_no_delete (lacks checklist:delete:all) attempts DELETE on the bare template', `HTTP ${delTplNoDelete.status} body=${JSON.stringify(delTplNoDelete.body).slice(0, 200)}`);
    }
} catch (e) { fail('7. Delete protection', e); }

// ══ 8. Unlink (real screen click) ══════════════════════════════════════════════════════════════════
try {
    if (!instanceRecordsNo || !itrId) throw new Error('no instance/ITR to unlink');
    await full.goto(UI + '/itr'); await full.waitForTimeout(1200);
    await full.locator('tr', { hasText: itrId.split('|')[1] }).first().click();
    await modal(full).waitFor({ timeout: 10000 }).catch(() => {});
    await full.waitForTimeout(600);
    const beforeUnlinkCount = sql(`SELECT COUNT(*) FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
    // The row header (div.group.cursor-pointer) contains exactly one button when !isLocked — the
    // trash-icon Unlink control (ITRModals.tsx handleUnlinkChecklist); its title is a translated
    // string ("Remove"/"移除"), not literally "Unlink", so target by position within the row instead.
    const row = modal(full).locator('div.group.cursor-pointer', { hasText: instanceRecordsNo }).first();
    const rowBtns = row.locator('button');
    let clicked = false;
    if (await rowBtns.count()) { await rowBtns.last().click(); clicked = true; }
    note('attempted to click the Unlink control (last button in the instance row header)', clicked);
    if (clicked) {
        await full.waitForTimeout(500);
        // ConfirmModal's confirm button reads t('common.delete') = "刪除"/"Delete" (ITRModals.tsx:
        // confirmText={t('common.delete')}) — not "確認"/"Confirm"/"Yes".
        const confirmBtn = full.locator('button', { hasText: /^(刪除|Delete)$/ });
        note('unlink confirmation dialog confirm button found', await confirmBtn.count() > 0);
        if (await confirmBtn.count()) { await confirmBtn.first().click(); await full.waitForTimeout(1000); }
        const afterUnlinkCount = sql(`SELECT COUNT(*) FROM checklist WHERE recordsNo='${instanceRecordsNo}';`);
        note('instance row count before/after Unlink (0 = row removed, matches delete_checklist called internally by unlink_checklist)', `${beforeUnlinkCount} -> ${afterUnlinkCount}`);
    }
} catch (e) { fail('8. Unlink', e); }

await browser.close();
console.log('DONE');
