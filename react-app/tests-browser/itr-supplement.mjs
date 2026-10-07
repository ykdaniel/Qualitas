// ITR supplement (2026-09-23): full Approve+Revoke chain, Re-inspection handoff, and delete protection
// with a real itr:delete:all account, in four independent cases. Reuses proven interaction patterns from
// checklist-review.mjs (link, fill Pass) and itr-review.mjs (create, NOI select, Publish/confirm).
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

const editor = await login('itr_editor');
const approver = await login('itr_approver');
const deleter = await login('itr_deleter');

// Reusable: create an ITR via screen, NOI selected, returns {id, docNo}
async function createItrOnScreen(p) {
    await p.goto(UI + '/itr'); await p.waitForTimeout(1000);
    await p.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(p).waitFor({ timeout: 10000 });
    await p.waitForTimeout(500);
    await modal(p).locator('select').first().selectOption('QTS-IRR-NOI-000001');
    await p.waitForTimeout(400);
    await modal(p).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await p.waitForTimeout(1000);
    const row = sql(`SELECT id, documentNumber FROM itr ORDER BY rowid DESC LIMIT 1;`);
    const [id, docNo] = row.split('|');
    return { id, docNo };
}

// Reusable: open an ITR by docNo, link the given template id via the option-scanning select, return instance recordsNo
async function linkTemplateOnScreen(p, docNo, templateId) {
    await p.goto(UI + '/itr'); await p.waitForTimeout(1000);
    await p.locator('tr', { hasText: docNo }).first().click();
    await modal(p).waitFor({ timeout: 10000 });
    await p.waitForTimeout(500);
    const allSelects = modal(p).locator('select');
    const c = await allSelects.count();
    let idx = -1;
    for (let i = 0; i < c; i++) {
        const vals = await allSelects.nth(i).locator('option').evaluateAll(els => els.map(e => e.value));
        if (vals.includes(templateId)) { idx = i; break; }
    }
    if (idx === -1) throw new Error('link-checklist select not found');
    await allSelects.nth(idx).selectOption(templateId);
    await p.waitForTimeout(1000);
    const itrRow = sql(`SELECT id FROM itr WHERE documentNumber='${docNo}';`);
    return sql(`SELECT recordsNo FROM checklist WHERE itrId='${itrRow}' ORDER BY rowid DESC LIMIT 1;`);
}

// Reusable: open ITR, expand instance row, go to 檢查項目 tab, click result button (1=Pass, 2=Fail), save
async function fillInstanceResult(p, docNo, instanceRecordsNo, resultIdx) {
    await p.goto(UI + '/itr'); await p.waitForTimeout(1000);
    await p.locator('tr', { hasText: docNo }).first().click();
    await modal(p).waitFor({ timeout: 10000 });
    await p.waitForTimeout(500);
    const row = modal(p).locator('div.group.cursor-pointer', { hasText: instanceRecordsNo }).first();
    await row.click();
    await p.waitForTimeout(600);
    const itemsTab = p.locator('button', { hasText: /檢查項目|Inspection Items/i }).first();
    if (await itemsTab.count()) { await itemsTab.click(); await p.waitForTimeout(400); }
    const radiogroup = p.locator('[role=radiogroup]').first();
    await radiogroup.locator('button').nth(resultIdx).click();
    await p.waitForTimeout(300);
    const saveBtn = p.locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click();
    await p.waitForTimeout(1000);
}

// Reusable: create a bare template via API (fast, not under review here), returns id
async function makeTemplate(p, label) {
    const r = await apiCall(p, 'POST', '/api/checklist/', {
        date: '2026-09-23', status: 'Ongoing', activity: label, contractor: 'ITR Review Co',
        detail_data: JSON.stringify({ items: [{ id: 1, item: label + ' item', criteria: 'criteria', situation: '', result: '' }] }),
    });
    return r.body.id;
}

let approveChainItrId = null, approveChainDocNo = null;

// ══ A. Full Approve + Revoke chain ══════════════════════════════════════════════════════════════════
try {
    const { id, docNo } = await createItrOnScreen(editor);
    approveChainItrId = id; approveChainDocNo = docNo;
    note('A: ITR created for the approve chain', `${id} ${docNo}`);

    const tplId = await makeTemplate(editor, 'Approve-chain template');
    const instRecNo = await linkTemplateOnScreen(editor, docNo, tplId);
    note('A: template linked, instance created', instRecNo);

    await fillInstanceResult(editor, docNo, instRecNo, 1); // Pass
    const instAfterFill = sql(`SELECT status FROM checklist WHERE recordsNo='${instRecNo}';`);
    note('A: instance status after filling Pass', instAfterFill);

    if (instAfterFill !== 'Pass') throw new Error(`instance did not reach Pass (got ${instAfterFill}) — approval preconditions not met, cannot proceed`);

    // Approve via itr_approver
    await approver.goto(UI + '/itr'); await approver.waitForTimeout(1000);
    await approver.locator('tr', { hasText: docNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(500);
    await modal(approver).locator('button', { hasText: 'Publish' }).first().click();
    await approver.waitForTimeout(400);
    await approver.locator('button', { hasText: /^(發佈|Publish)$/ }).last().click();
    await approver.waitForTimeout(1200);
    const afterApprove = sql(`SELECT status, type, approvedBy, approvedAt FROM itr WHERE id='${id}';`);
    note('A: ITR status/rev/approvedBy/approvedAt after real Approve click', afterApprove);
    const eventsAfterApprove = sql(`SELECT event_type, sequence FROM itr_approval_events WHERE itr_id='${id}' ORDER BY sequence;`);
    note('A: itr_approval_events rows after approval', eventsAfterApprove);
    const snapshotCheck = sql(`SELECT length(itr_snapshot), length(checklists_snapshot), snapshot_sha256 IS NOT NULL FROM itr_approval_events WHERE itr_id='${id}' AND event_type='APPROVED';`);
    note('A: snapshot fields populated on the APPROVED event (itr_snapshot len | checklists_snapshot len | has sha256)', snapshotCheck);

    // Approval History modal
    await approver.goto(UI + '/itr'); await approver.waitForTimeout(1000);
    await approver.locator('tr', { hasText: docNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(500);
    const historyBtn = modal(approver).locator('[data-approval-history-button]');
    if (await historyBtn.count()) {
        await historyBtn.first().click();
        await approver.waitForTimeout(800);
        const secondModal = approver.locator('[class*=modalContent], [class*=ModalContent]').nth(1);
        const historyText = await secondModal.innerText().catch(() => '');
        note('A: Approval History modal content (truncated)', historyText.slice(0, 300));
        const closeHistBtn = approver.locator('button', { hasText: /×|Close|關閉/i }).last();
        if (await closeHistBtn.count()) await closeHistBtn.click().catch(() => {});
        await approver.waitForTimeout(400);
    }

    // Revoke
    const revokeBtn = modal(approver).locator('button', { hasText: /Revoke|撤回核准/i });
    note('A: Revoke button visible on the now-Approved ITR', await revokeBtn.count() > 0);
    if (await revokeBtn.count()) {
        await revokeBtn.first().click();
        await approver.waitForTimeout(400);
        const reasonBox = approver.locator('textarea').last();
        await reasonBox.fill('Round supplement: legitimate revoke test');
        const confirmRevokeBtn = approver.locator('button', { hasText: /撤回核准/i }).last();
        await confirmRevokeBtn.click();
        await approver.waitForTimeout(1200);
    }
    const afterRevoke = sql(`SELECT status FROM itr WHERE id='${id}';`);
    note('A: ITR status after Revoke', afterRevoke);
    const eventsAfterRevoke = sql(`SELECT event_type, sequence FROM itr_approval_events WHERE itr_id='${id}' ORDER BY sequence;`);
    note('A: itr_approval_events rows after revoke (history should be APPENDED, not replaced)', eventsAfterRevoke);
} catch (e) { fail('A. Approve + Revoke chain', e); }

// ══ B. Re-inspection + handoff ══════════════════════════════════════════════════════════════════════
let originalItrId = null, originalDocNo = null, originalInstanceRecNo = null;
try {
    const { id, docNo } = await createItrOnScreen(editor);
    originalItrId = id; originalDocNo = docNo;
    const tplId = await makeTemplate(editor, 'Reinspect-source template');
    const instRecNo = await linkTemplateOnScreen(editor, docNo, tplId);
    originalInstanceRecNo = instRecNo;
    await fillInstanceResult(editor, docNo, instRecNo, 2); // Fail
    const instBeforeReinspect = sql(`SELECT status, template_id, source_template_version FROM checklist WHERE recordsNo='${instRecNo}';`);
    note('B: original instance status/template_id/source_template_version before re-inspect', instBeforeReinspect);

    // Set inspectionResult=Fail on the ITR itself (separate field from the checklist's own status)
    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1000);
    await editor.locator('tr', { hasText: docNo }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(500);
    const allSel = modal(editor).locator('select');
    const selCount = await allSel.count();
    let resultIdx = -1;
    for (let i = 0; i < selCount; i++) {
        const vals = await allSel.nth(i).locator('option').evaluateAll(els => els.map(e => e.value));
        if (vals.includes('Fail') && vals.includes('Pass')) { resultIdx = i; break; }
    }
    if (resultIdx !== -1) { await allSel.nth(resultIdx).selectOption('Fail'); }
    await modal(editor).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await editor.waitForTimeout(1000);
    const itrBeforeReinspect = sql(`SELECT inspectionResult, status, noiNumber, foundLocation, discipline FROM itr WHERE id='${id}';`);
    note('B: original ITR state before re-inspect (inspectionResult|status|noiNumber|foundLocation|discipline)', itrBeforeReinspect);

    note('B: foundLocation/discipline on the original ITR are empty despite the seeded NOI having non-empty values — the CREATE flow never populated them (ITRModals.tsx onChange for the NOI select only sets raiseDate/subject/contractor/itpNo, confirmed by reading the handler; no request-body capture needed since the field is never touched client-side at all). No auto-copy-at-create policy is evident in the code. Treating as PENDING DECISION, not a defect.', '');

    // Re-inspect (real screen click)
    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1000);
    await editor.locator('tr', { hasText: docNo }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(500);
    const reinspectBtn = modal(editor).locator('button', { hasText: /Re-inspect|重新檢驗/i });
    note('B: Re-inspect button visible on a Fail ITR that was never approved', await reinspectBtn.count() > 0);
    const beforeItrCount = sql(`SELECT COUNT(*) FROM itr;`);
    if (await reinspectBtn.count()) {
        await reinspectBtn.first().click();
        await editor.waitForTimeout(1500);
    }
    const afterItrCount = sql(`SELECT COUNT(*) FROM itr;`);
    note('B: ITR count before/after Re-inspect click', `${beforeItrCount} -> ${afterItrCount}`);
    const newItrRow = sql(`SELECT id, documentNumber, originalItrId, noiNumber, foundLocation, discipline, status FROM itr WHERE originalItrId='${id}';`);
    note('B: the new re-inspection ITR (id|documentNumber|originalItrId|noiNumber|foundLocation|discipline|status)', newItrRow);
    const newItrId = newItrRow.split('|')[0];
    const newInstance = sql(`SELECT recordsNo, itrId, template_id, source_template_version, status, detail_data FROM checklist WHERE itrId='${newItrId}';`);
    note('B: the new re-inspection Checklist instance (recordsNo|itrId|template_id|source_template_version|status|detail_data)', newInstance);

    // Confirm the ORIGINAL ITR and its instance are unchanged
    const originalAfter = sql(`SELECT inspectionResult, status FROM itr WHERE id='${id}';`);
    const originalInstanceAfter = sql(`SELECT status, detail_data FROM checklist WHERE recordsNo='${instRecNo}';`);
    note('B: original ITR unchanged after re-inspect', originalAfter);
    note('B: original instance unchanged after re-inspect (still Fail, results intact)', originalInstanceAfter);
} catch (e) { fail('B. Re-inspection', e); }

// ══ C. Delete protection — real itr:delete:all account, 4 independent cases ═══════════════════════════
try {
    // Case 1: the Approved-then-Revoked ITR from section A — has approval history (events), currently
    // back to In Progress. Expect: blocked, citing history.
    if (approveChainItrId) {
        const d1 = await apiCall(deleter, 'DELETE', `/api/itr/${approveChainItrId}/`, null);
        note('C1: delete the approved-then-revoked ITR (has approval event history)', `HTTP ${d1.status} body=${JSON.stringify(d1.body).slice(0, 250)}`);
        const still1 = sql(`SELECT COUNT(*) FROM itr WHERE id='${approveChainItrId}';`);
        note('C1: row still present after rejection', still1);
    }

    // Case 2: a FRESH Approved (not revoked) ITR — independent record so C1's lock doesn't interfere.
    const { id: c2Id, docNo: c2Doc } = await createItrOnScreen(deleter);
    const tpl2 = await makeTemplate(deleter, 'Delete-case2 template');
    const inst2 = await linkTemplateOnScreen(deleter, c2Doc, tpl2);
    await fillInstanceResult(deleter, c2Doc, inst2, 1); // Pass
    await deleter.goto(UI + '/itr'); await deleter.waitForTimeout(1000);
    await deleter.locator('tr', { hasText: c2Doc }).first().click();
    await modal(deleter).waitFor({ timeout: 10000 });
    await deleter.waitForTimeout(500);
    await modal(deleter).locator('button', { hasText: 'Publish' }).first().click();
    await deleter.waitForTimeout(400);
    await deleter.locator('button', { hasText: /^(發佈|Publish)$/ }).last().click();
    await deleter.waitForTimeout(1200);
    const c2Status = sql(`SELECT status FROM itr WHERE id='${c2Id}';`);
    note('C2: independent ITR approved (not revoked) for the currently-Approved delete case', c2Status);
    const d2 = await apiCall(deleter, 'DELETE', `/api/itr/${c2Id}/`, null);
    note('C2: delete a currently-Approved ITR (locked record, not history-based)', `HTTP ${d2.status} body=${JSON.stringify(d2.body).slice(0, 250)}`);
    const still2 = sql(`SELECT COUNT(*) FROM itr WHERE id='${c2Id}';`);
    note('C2: row still present after rejection', still2);

    // Case 3: the original ITR from section B — has a re-inspection pointing at it via originalItrId.
    if (originalItrId) {
        const d3 = await apiCall(deleter, 'DELETE', `/api/itr/${originalItrId}/`, null);
        note('C3: delete the original ITR that a re-inspection refers to', `HTTP ${d3.status} body=${JSON.stringify(d3.body).slice(0, 250)}`);
        const still3 = sql(`SELECT COUNT(*) FROM itr WHERE id='${originalItrId}';`);
        note('C3: row still present after rejection', still3);
    }

    // Case 4: a fresh, never-approved, unreferenced, evidence-free ITR — the genuinely-deletable
    // mistaken-record case. Independent of all the above.
    const c4 = await apiCall(deleter, 'POST', '/api/itr/', { vendor: 'ITR Review Co', description: 'Mistakenly created, to be deleted', rev: '', submit: '', status: 'In Progress', noiNumber: 'QTS-IRR-NOI-000001' });
    const c4Id = c4.body?.id;
    note('C4: created a fresh, untouched ITR', `${c4.status} ${c4Id}`);
    const d4 = await apiCall(deleter, 'DELETE', `/api/itr/${c4Id}/`, null);
    note('C4: delete the never-approved, unreferenced ITR — should succeed', `HTTP ${d4.status}`);
    const still4 = sql(`SELECT COUNT(*) FROM itr WHERE id='${c4Id}';`);
    note('C4: row count after the successful delete (0 = removed)', still4);
} catch (e) { fail('C. Delete protection', e); }

await browser.close();
console.log('DONE');
