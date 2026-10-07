// ITP inspection-item "Copy" UI/UX review (2026-09-28). Real isolated backend + real screens.
// Batch scope: add a per-item Copy control (readOnly-gated, no new required fields, no
// authorization/save-policy change) that opens the SAME Add-New editor panel pre-filled from the
// source item; Apply adds an independent new item with a fresh id, Cancel adds nothing; editing
// the copy's Criteria/Verification Points afterwards must never mutate the source item.
// Reuses the icp_full account/fixtures from seed_itp_checklist_publish_uiux_review.py (same
// module, same permission set already needed here — itp:create/update:all).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 600) : ''}`);
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
const itemEditorPanel = pg => pg.locator('div.rounded-2xl').filter({ has: pg.locator('h3', { hasText: 'Add New Inspection Item' }) });
const saveBtn = pg => editModal(pg).locator('button', { hasText: /^(儲存|Save)$/ }).first();
const planTabBtn = pg => editModal(pg).locator('button', { hasText: '檢驗計畫' });
const activityEnInput = panel => panel.locator('label', { hasText: 'Activity (EN/CH)' }).locator('xpath=following-sibling::input[1]');
const rowByActivity = (pg, text) => editModal(pg).locator('tr', { hasText: text });
const copyBtnFor = (pg, text) => rowByActivity(pg, text).locator('button[title=Copy]');

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

// ══ 1. Existing ITP: Copy opens the same editor panel, pre-filled from the source ═════════════════
try {
    await openByRef(full, 'QTS-ICP-ITP-000001'); // icp-itp-with-items, has item "Rebar spacing check"
    await planTabBtn(full).click();
    await full.waitForTimeout(300);

    await copyBtnFor(full, 'Rebar spacing check').click();
    const panel = itemEditorPanel(full);
    await panel.waitFor({ timeout: 5000 });
    const prefilled = await activityEnInput(panel).inputValue();
    note('1a. Copy opens the Add-New-style editor panel, pre-filled with the source content', prefilled);
    note('1b. panel title says "Add New..." (same reused panel, not a separate UI)', await panel.locator('h3', { hasText: 'Add New Inspection Item' }).count());
} catch (e) { fail('1. Copy opens the existing Add-New panel pre-filled from source', e); }

// ══ 2. Cancel adds nothing, no write ═══════════════════════════════════════════════════════════════
try {
    const beforeDb = sql(`SELECT detail_data FROM itp WHERE id='icp-itp-with-items';`);
    await itemEditorPanel(full).locator('button', { hasText: 'Cancel' }).click();
    await full.waitForTimeout(300);
    const rowCountAfterCancel = await editModal(full).locator('tbody tr', { hasText: 'Rebar spacing check' }).count();
    note('2a. still exactly the original item on screen after Cancel (expect 1)', rowCountAfterCancel);
    const afterDb = sql(`SELECT detail_data FROM itp WHERE id='icp-itp-with-items';`);
    note('2b. DB detail_data unchanged by Cancel (no write sent)', beforeDb === afterDb ? 'unchanged' : 'CHANGED');
} catch (e) { fail('2. Cancel adds nothing and sends no write', e); }

// ══ 3. Apply: adds an independent new item with a fresh id; editing the copy does not touch source ═
try {
    await copyBtnFor(full, 'Rebar spacing check').click();
    const panel = itemEditorPanel(full);
    await panel.waitFor({ timeout: 5000 });
    await activityEnInput(panel).fill('Rebar spacing check (COPY EDITED)');
    // Also touch a Criteria field to specifically exercise the "editing the copy must not mutate
    // the source" requirement for nested array content, not just the top-level activity field.
    const criteriaEnInput = panel.locator('label', { hasText: 'Criteria' }).locator('xpath=following::input[@placeholder="EN"]').first();
    await criteriaEnInput.fill('Spacing within tolerance (COPY EDITED)');
    await panel.locator('button', { hasText: 'Apply' }).click();
    await full.waitForTimeout(400);

    const originalRow = rowByActivity(full, 'Rebar spacing check').filter({ hasNotText: 'COPY EDITED' });
    const copyRow = rowByActivity(full, 'COPY EDITED');
    note('3a. original item still shows its untouched original text (source not mutated)', await originalRow.count());
    note('3b. the new copy row exists with the edited text', await copyRow.count());
    // td[0] is the drag-handle cell (icon only, no text) when not read-only — the Event No. id is td[1].
    const originalId = await originalRow.locator('td').nth(1).innerText();
    const copyId = await copyRow.locator('td').nth(1).innerText();
    note('3c. the new item got a fresh id, distinct from the source id', `${originalId} vs ${copyId}` + (originalId !== copyId ? ' (distinct)' : ' (SAME — BUG)'));
} catch (e) { fail('3. Apply adds an independent copy with a fresh id, source untouched', e); }

// ══ 4. Save persists both items correctly; reopening confirms independence survives a real save ═══
try {
    await saveBtn(full).click();
    await full.waitForTimeout(1200);
    const raw = sql(`SELECT detail_data FROM itp WHERE id='icp-itp-with-items';`);
    note('4a. real DB detail_data after save (expect both the original AND the edited copy, each with their own distinct content)', raw);

    // Reopen fresh from the list to rule out any client-side-only illusion of independence.
    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await openByRef(full, 'QTS-ICP-ITP-000001');
    await planTabBtn(full).click();
    await full.waitForTimeout(300);
    const reopenedOriginal = await rowByActivity(full, 'Rebar spacing check').filter({ hasNotText: 'COPY EDITED' }).count();
    const reopenedCopy = await rowByActivity(full, 'COPY EDITED').count();
    note('4b. after a full reload, both the original and the independent copy are still there correctly', `original=${reopenedOriginal} copy=${reopenedCopy}`);
} catch (e) { fail('4. Save persists both items independently; survives a reopen', e); }

// ══ 5. Read-only mode: no Copy entry point ═════════════════════════════════════════════════════════
// icp_full always has itp:update:all in this fixture set, so there is no readOnly account seeded
// for this batch — verified instead by code inspection: the entire "Op." column (Edit/Copy/Delete)
// in ITPAdvancedEditor.tsx is rendered only inside `{!readOnly && (...)}`, the same existing gate
// Edit/Delete already relied on; Copy was added inside that same block, not a new gate. Not
// re-verified on screen this batch since it is the same code path as the already-covered
// Edit/Delete buttons.
note('5. Read-only hides Copy (code-read: same `{!readOnly && ...}` block as Edit/Delete, not independently screen-tested)', '');

// ══ 6. NEW (unsaved) ITP: local add, copy, edit-independence, and Cancel — all before any save,
// itpId stays null throughout, nothing is created on the backend until Save is clicked ══════════════
try {
    await full.goto(UI + '/itp'); await full.waitForTimeout(800);
    await full.locator('button', { hasText: /新增|Add/ }).first().click();
    await editModal(full).waitFor({ timeout: 10000 });
    await full.waitForTimeout(500);
    await planTabBtn(full).click();
    await full.waitForTimeout(300);

    const beforeItpCount = sql(`SELECT COUNT(*) FROM itp;`);

    // Add one local item via the editor's own "Add New Item" button.
    await editModal(full).locator('button', { hasText: 'Add New Item' }).click();
    let panel = itemEditorPanel(full);
    await panel.waitFor({ timeout: 5000 });
    await activityEnInput(panel).fill('Original Local Item');
    await panel.locator('button', { hasText: 'Apply' }).click();
    await full.waitForTimeout(300);
    note('6a. local item added purely client-side, no ITP record created yet', `itp count before=${beforeItpCount} after=${sql(`SELECT COUNT(*) FROM itp;`)}`);

    // Copy it, edit the copy, Apply.
    await copyBtnFor(full, 'Original Local Item').click();
    panel = itemEditorPanel(full);
    await panel.waitFor({ timeout: 5000 });
    await activityEnInput(panel).fill('Local Copy Edited');
    await panel.locator('button', { hasText: 'Apply' }).click();
    await full.waitForTimeout(300);
    const originalStillThere = await rowByActivity(full, 'Original Local Item').filter({ hasNotText: 'Local Copy Edited' }).count();
    const localCopyThere = await rowByActivity(full, 'Local Copy Edited').count();
    note('6b. local original untouched, local copy present with its own edited text (all before any save)', `original=${originalStillThere} copy=${localCopyThere}`);
    note('6c. still no ITP record created on the backend (itpId still null, nothing written)', sql(`SELECT COUNT(*) FROM itp;`));

    // Cancel a further copy attempt: nothing extra should appear.
    await copyBtnFor(full, 'Local Copy Edited').click();
    panel = itemEditorPanel(full);
    await panel.waitFor({ timeout: 5000 });
    await panel.locator('button', { hasText: 'Cancel' }).click();
    await full.waitForTimeout(300);
    const rowCountNow = await editModal(full).locator('tbody tr').filter({ hasText: /Local|Original/ }).count();
    note('6d. Cancel on the new-record screen adds nothing (still exactly 2 local items)', rowCountNow);

    // Now actually save the new record and confirm both items persist independently.
    await saveBtn(full).click();
    await full.waitForTimeout(1500);
    const newRow = sql(`SELECT id, detail_data FROM itp WHERE id NOT IN ('icp-itp-with-items','icp-itp-existing-rev') ORDER BY rowid DESC LIMIT 1;`);
    note('6e. new record actually created by Save, detail_data holds BOTH independent items with their distinct final text', newRow);
} catch (e) { fail('6. New (unsaved) ITP: local add/copy/edit-independence/cancel before any save', e); }

await browser.close();
console.log('DONE');
