// ITR business review — real browser, real screens, isolated stack (2026-09-23). Covers what the
// Checklist round did NOT already cover: create + NOI handoff, Approve/Publish permission enforcement,
// Revoke Approval, NCR/re-inspection handoff, Approval History, delete protection. Checklist-link/result
// evidence is reused from the Checklist round, not re-tested here.
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

const editor = await login('itr_editor');       // itr:view/create/update, no itr:approve:all
const approver = await login('itr_approver');    // + itr:approve:all
const ncrUser = await login('itr_ncr');          // itr_editor's perms + ncr:create:all

let itrId = null, itrDocNo = null;

// ══ 1. Create + NOI handoff (real screen) ═══════════════════════════════════════════════════════════
try {
    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1200);
    await editor.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(500);
    const noiSelect = modal(editor).locator('select').first();
    await noiSelect.selectOption('QTS-IRR-NOI-000001');
    await editor.waitForTimeout(500);
    const formStateAfterNoi = sql(`SELECT COUNT(*) FROM itr;`); // just to confirm no premature write
    const saveBtn = modal(editor).locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click();
    await editor.waitForTimeout(1200);
    const created = sql(`SELECT id, documentNumber, status, noiNumber, foundLocation, discipline FROM itr ORDER BY rowid DESC LIMIT 1;`);
    note('ITR created via real screen, NOI selected (id|documentNumber|status|noiNumber|foundLocation|discipline)', created);
    const parts = created.split('|');
    itrId = parts[0]; itrDocNo = parts[1];
    note('foundLocation/discipline auto-handed-off from the selected NOI (§17: ITR reads these from NOI)', `foundLocation=${parts[4]} discipline=${parts[5]}`);
} catch (e) { fail('1. Create + NOI handoff', e); }

// ══ 2. Set inspectionResult=Fail (real screen), reopen the row, then Approve/Publish permission check ═
try {
    if (!itrId) throw new Error('no ITR from step 1');
    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1200);
    await editor.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(600);
    const resultSelect = modal(editor).locator('select').filter({ has: modal(editor).locator('option[value="Fail"]') }).first();
    const allSel = modal(editor).locator('select');
    const selCount = await allSel.count();
    let resultIdx = -1;
    for (let i = 0; i < selCount; i++) {
        const vals = await allSel.nth(i).locator('option').evaluateAll(els => els.map(e => e.value));
        if (vals.includes('Fail') && vals.includes('Pass')) { resultIdx = i; break; }
    }
    note('located the Inspection Result dropdown', resultIdx !== -1);
    if (resultIdx !== -1) {
        await allSel.nth(resultIdx).selectOption('Fail');
        const saveBtn2 = modal(editor).locator('button', { hasText: /^(儲存|Save)$/ });
        await saveBtn2.first().click();
        await editor.waitForTimeout(1200);
    }
    const afterFail = sql(`SELECT inspectionResult FROM itr WHERE id='${itrId}';`);
    note('inspectionResult after setting Fail and saving', afterFail);
} catch (e) { fail('2. Set inspectionResult=Fail', e); }

// ══ 3. Publish/Approve: itr_editor (no itr:approve:all) — button visible? blocked by backend? ═══════
try {
    if (!itrId) throw new Error('no ITR');
    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1200);
    await editor.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(600);
    const publishBtn = modal(editor).locator('button', { hasText: 'Publish' });
    note('Publish button visible to itr_editor (no itr:approve:all)', await publishBtn.count() > 0);
    if (await publishBtn.count()) {
        await publishBtn.first().click();
        await editor.waitForTimeout(400);
        const confirmBtn = editor.locator("button", { hasText: /^(發佈|Publish)$/ }).last();
        if (await confirmBtn.count()) { await confirmBtn.first().click(); }
        await editor.waitForTimeout(1000);
        const toastMsg = (await editor.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
        note('toast after itr_editor clicks Publish', toastMsg);
    }
    const statusAfterEditorPublish = sql(`SELECT status FROM itr WHERE id='${itrId}';`);
    note('ITR status after itr_editor Publish attempt (should stay unchanged if blocked)', statusAfterEditorPublish);
} catch (e) { fail('3. Publish blocked for itr_editor', e); }

// ══ 4. Publish/Approve: itr_approver (has itr:approve:all) — should succeed ═════════════════════════
try {
    if (!itrId) throw new Error('no ITR');
    await approver.goto(UI + '/itr'); await approver.waitForTimeout(1200);
    await approver.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(600);
    const publishBtn2 = modal(approver).locator('button', { hasText: 'Publish' });
    await publishBtn2.first().click();
    await approver.waitForTimeout(400);
    const confirmBtn2 = approver.locator("button", { hasText: /^(發佈|Publish)$/ }).last();
    if (await confirmBtn2.count()) { await confirmBtn2.first().click(); }
    await approver.waitForTimeout(1200);
    const afterApprove = sql(`SELECT status, type FROM itr WHERE id='${itrId}';`);
    note('ITR status/rev after itr_approver Publish', afterApprove);
} catch (e) { fail('4. Publish succeeds for itr_approver', e); }

// ══ 5. Raise NCR from the Fail-result, now-Approved ITR (itr_ncr account) ══════════════════════════
try {
    if (!itrId) throw new Error('no ITR');
    await ncrUser.goto(UI + '/itr'); await ncrUser.waitForTimeout(1200);
    await ncrUser.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(ncrUser).waitFor({ timeout: 10000 });
    await ncrUser.waitForTimeout(600);
    const raiseNcrBtn = modal(ncrUser).locator("button", { hasText: /Raise NCR|開立 NCR/i });
    note('Raise NCR button visible to itr_ncr (has ncr:create:all) on an Approved+Fail ITR', await raiseNcrBtn.count() > 0);
    const beforeNcrCount = sql(`SELECT COUNT(*) FROM ncr;`);
    if (await raiseNcrBtn.count()) {
        await raiseNcrBtn.first().click();
        await ncrUser.waitForTimeout(1500);
    }
    const afterNcrCount = sql(`SELECT COUNT(*) FROM ncr;`);
    note('NCR count before/after Raise NCR click', `${beforeNcrCount} -> ${afterNcrCount}`);
    const ncrRow = sql(`SELECT id, documentNumber, reInspectionNumber FROM ncr ORDER BY rowid DESC LIMIT 1;`);
    note('the NCR row created (id|documentNumber|reInspectionNumber)', ncrRow);
} catch (e) { fail('5. Raise NCR', e); }

// ══ 6. Revoke Approval (itr_approver) ═══════════════════════════════════════════════════════════════
try {
    if (!itrId) throw new Error('no ITR');
    await approver.goto(UI + '/itr'); await approver.waitForTimeout(1200);
    await approver.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(600);
    const revokeBtn = modal(approver).locator('button[title*="Revoke"], button', { hasText: /Revoke|撤回/i });
    note('Revoke Approval button visible to itr_approver on the Approved ITR', await revokeBtn.count() > 0);
    if (await revokeBtn.count()) {
        await revokeBtn.first().click();
        await approver.waitForTimeout(400);
        const reasonBox = approver.locator('textarea').last();
        if (await reasonBox.count()) { await reasonBox.fill('Round review: revoke test'); }
        const confirmRevokeBtn = approver.locator('button', { hasText: /Revoke|撤回/i }).last();
        await confirmRevokeBtn.click();
        await approver.waitForTimeout(1200);
    }
    const afterRevoke = sql(`SELECT status FROM itr WHERE id='${itrId}';`);
    note('ITR status after Revoke Approval', afterRevoke);
    const eventCount = sql(`SELECT COUNT(*) FROM itr_approval_events WHERE itr_id='${itrId}';`);
    note('approval-event count recorded for this ITR (history preservation check)', eventCount);
} catch (e) { fail('6. Revoke Approval', e); }

// ══ 7. Approval History modal ═══════════════════════════════════════════════════════════════════════
try {
    if (!itrId) throw new Error('no ITR');
    await approver.goto(UI + '/itr'); await approver.waitForTimeout(1200);
    await approver.locator('tr', { hasText: itrDocNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(600);
    const historyBtn = modal(approver).locator('[data-approval-history-button]');
    note('Approval History button present', await historyBtn.count() > 0);
    if (await historyBtn.count()) {
        await historyBtn.first().click();
        await approver.waitForTimeout(800);
        const historyRows = await approver.locator('[class*=modalContent], [class*=ModalContent]').nth(1).locator('tr, li, [class*=event]').count().catch(() => 0);
        note('history modal opened, approximate row/event count found', historyRows);
    }
} catch (e) { fail('7. Approval History', e); }

// ══ 8. Delete protection: this ITR now has approval history — must be blocked even though not currently Approved ═
try {
    if (!itrId) throw new Error('no ITR');
    const delRes = await apiCall(approver, 'DELETE', `/api/itr/${itrId}/`, null);
    note('itr_approver attempts DELETE on an ITR with approval history (currently In Progress after revoke)', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 250)}`);
    const stillThere = sql(`SELECT COUNT(*) FROM itr WHERE id='${itrId}';`);
    note('ITR row still present after the delete attempt', stillThere);

    // Comparison: a fresh, never-approved ITR with no history should delete cleanly.
    const noiSelect2Res = await apiCall(editor, 'POST', '/api/itr/', { vendor: 'ITR Review Co', description: 'Delete-protection comparison ITR', rev: '', submit: '', status: 'In Progress', noiNumber: 'QTS-IRR-NOI-000001' });
    const cleanId = noiSelect2Res.body?.id;
    const delCleanRes = await apiCall(editor, 'DELETE', `/api/itr/${cleanId}/`, null);
    note('itr_editor attempts DELETE on a fresh, never-approved ITR (no history)', `HTTP ${delCleanRes.status}`);
} catch (e) { fail('8. Delete protection', e); }

await browser.close();
console.log('DONE');
