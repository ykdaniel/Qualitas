// ITR supplement round 2 (2026-09-24), bounded to exactly three unresolved gaps flagged by the user:
// (1) originalItrId actual-value match (not just "printed a value"); (2) NCR-reference delete
// protection (the "referencing_ncrs" branch in delete_itr, distinct from the re-inspection-chain branch
// already confirmed); (3) a field-level spot check of the approval snapshot content, not just byte length.
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
async function makeTemplate(p, label) {
    const r = await apiCall(p, 'POST', '/api/checklist/', {
        date: '2026-09-24', status: 'Ongoing', activity: label, contractor: 'ITR Review Co',
        detail_data: JSON.stringify({ items: [{ id: 1, item: label + ' item', criteria: 'criteria', situation: '', result: '' }] }),
    });
    return r.body.id;
}
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
    await p.locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await p.waitForTimeout(1000);
}

// ══ 1 & 3. Rebuild the approve chain, this time explicitly capturing the source ITR id for comparison
//           and doing a field-level spot check of the approval snapshot content ══════════════════════
let sourceItrId = null, sourceDocNo = null, sourceInstRecNo = null;
try {
    const { id, docNo } = await createItrOnScreen(editor);
    sourceItrId = id; sourceDocNo = docNo;
    note('1: source ITR id captured explicitly for later comparison', sourceItrId);

    const tplId = await makeTemplate(editor, 'Supp2 source template');
    const instRecNo = await linkTemplateOnScreen(editor, docNo, tplId);
    sourceInstRecNo = instRecNo;
    await fillInstanceResult(editor, docNo, instRecNo, 1); // Pass

    // Snapshot the ACTUAL row content right before approving, to compare field-by-field after.
    const itrRowBefore = sql(`SELECT documentNumber, vendor_id, status, description FROM itr WHERE id='${id}';`);
    const instRowBefore = sql(`SELECT recordsNo, activity, status, passCount, failCount FROM checklist WHERE recordsNo='${instRecNo}';`);
    note('3: source ITR row content just before approval (documentNumber|vendor_id|status|description)', itrRowBefore);
    note('3: source instance row content just before approval (recordsNo|activity|status|passCount|failCount)', instRowBefore);

    await approver.goto(UI + '/itr'); await approver.waitForTimeout(1000);
    await approver.locator('tr', { hasText: docNo }).first().click();
    await modal(approver).waitFor({ timeout: 10000 });
    await approver.waitForTimeout(500);
    await modal(approver).locator('button', { hasText: 'Publish' }).first().click();
    await approver.waitForTimeout(400);
    await approver.locator('button', { hasText: /^(發佈|Publish)$/ }).last().click();
    await approver.waitForTimeout(1200);

    // Queried separately (not concatenated with sqlite3's default "|" separator) since JSON field
    // values could themselves contain "|", which would corrupt a combined single-row parse.
    const itrSnapJson = sql(`SELECT itr_snapshot FROM itr_approval_events WHERE itr_id='${id}' AND event_type='APPROVED';`);
    const checklistSnapJson = sql(`SELECT checklists_snapshot FROM itr_approval_events WHERE itr_id='${id}' AND event_type='APPROVED';`);
    let itrSnap = null, checklistSnap = null;
    try { itrSnap = JSON.parse(itrSnapJson); } catch (e) { note('3: itr_snapshot did not parse as JSON', String(e)); }
    try { checklistSnap = JSON.parse(checklistSnapJson); } catch (e) { note('3: checklists_snapshot did not parse as JSON', String(e)); }

    if (itrSnap) {
        note('3: field-level check — itr_snapshot.documentNumber matches the real row', itrSnap.documentNumber === docNo ? `MATCH (${itrSnap.documentNumber})` : `MISMATCH snapshot=${itrSnap.documentNumber} actual=${docNo}`);
        note('3: field-level check — itr_snapshot.status is Approved', itrSnap.status === 'Approved' ? 'MATCH' : `MISMATCH (${itrSnap.status})`);
    }
    if (checklistSnap) {
        const list = Array.isArray(checklistSnap) ? checklistSnap : (checklistSnap.items || checklistSnap.checklists || null);
        note('3: checklists_snapshot shape', Array.isArray(list) ? `array of ${list.length}` : JSON.stringify(checklistSnap).slice(0, 150));
        if (Array.isArray(list) && list.length) {
            const entry = list.find(c => c.recordsNo === instRecNo) || list[0];
            note('3: field-level check — checklists_snapshot entry recordsNo/status/passCount matches the real instance', `snapshot: recordsNo=${entry.recordsNo} status=${entry.status} passCount=${entry.passCount}  |  actual: ${instRowBefore}`);
        }
    }
} catch (e) { fail('1&3. Rebuild chain + snapshot spot check', e); }

// ══ 2. Re-inspection: explicit originalItrId comparison ═══════════════════════════════════════════════
try {
    if (!sourceItrId) throw new Error('no source ITR from step 1');
    // Use the SAME source ITR from step 1&3 — it's now Approved, which per _require_itr_approve_permission
    // and create_reinspection's own eligibility check (inspectionResult=='Fail' or status=='Reject') would
    // actually be INELIGIBLE (status is Approved, inspectionResult was never set to Fail). Build a fresh,
    // separate Fail ITR instead so the re-inspect button/action has a real chance to fire.
    const { id: rId, docNo: rDoc } = await createItrOnScreen(editor);
    const rTpl = await makeTemplate(editor, 'Supp2 reinspect-source template');
    const rInst = await linkTemplateOnScreen(editor, rDoc, rTpl);
    await fillInstanceResult(editor, rDoc, rInst, 2); // Fail

    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1000);
    await editor.locator('tr', { hasText: rDoc }).first().click();
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

    note('2: source ITR id for the re-inspection test, captured explicitly', rId);
    await editor.goto(UI + '/itr'); await editor.waitForTimeout(1000);
    await editor.locator('tr', { hasText: rDoc }).first().click();
    await modal(editor).waitFor({ timeout: 10000 });
    await editor.waitForTimeout(500);
    const reinspectBtn = modal(editor).locator('button', { hasText: /Re-inspect|重新檢驗/i });
    await reinspectBtn.first().click();
    await editor.waitForTimeout(1500);
    const childRow = sql(`SELECT id, originalItrId FROM itr WHERE originalItrId IS NOT NULL ORDER BY rowid DESC LIMIT 1;`);
    const [childId, childOriginalItrId] = childRow.split('|');
    note('2: new re-inspection ITR id', childId);
    note('2: new re-inspection ITR.originalItrId value read from DB', childOriginalItrId);
    note('2: explicit comparison — does originalItrId equal the actual source ITR id?', childOriginalItrId === rId ? `MATCH (both ${rId})` : `MISMATCH: originalItrId=${childOriginalItrId} actual source id=${rId}`);
} catch (e) { fail('2. originalItrId explicit match', e); }

// ══ 3(b). NCR-reference delete protection (the OTHER branch of delete_itr, not yet tested) ═════════════
try {
    const { id: nId, docNo: nDoc } = await createItrOnScreen(deleter);
    note('3b: fresh ITR created as the NCR-reference-delete target', `${nId} ${nDoc}`);
    const ncrRes = await apiCall(deleter, 'POST', '/api/ncr/', {
        vendor: 'ITR Review Co', description: 'NCR referencing an ITR via reInspectionNumber', rev: '', submit: '',
        status: 'Open', reInspectionNumber: nDoc,
    });
    note('3b: NCR created with reInspectionNumber pointing at the target ITR', `HTTP ${ncrRes.status} id=${ncrRes.body?.id} documentNumber=${ncrRes.body?.documentNumber}`);
    const delRes = await apiCall(deleter, 'DELETE', `/api/itr/${nId}/`, null);
    note('3b: attempt to delete the ITR an NCR references via reInspectionNumber', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 300)}`);
    const stillThere = sql(`SELECT COUNT(*) FROM itr WHERE id='${nId}';`);
    note('3b: ITR row still present after the rejection', stillThere);
} catch (e) { fail('3b. NCR-reference delete protection', e); }

await browser.close();
console.log('DONE');
