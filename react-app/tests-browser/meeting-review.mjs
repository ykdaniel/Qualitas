// Meeting Minutes business review — real browser, real screens + API, isolated stack (2026-09-24).
// Covers: create with an action-item draft (the cross-module FollowUp handoff — bulk-created only
// AFTER the meeting itself is saved, per MeetingMinutes.tsx), Draft->Published lock, Void as the one
// escape valve from Published (unlike FollowUp/Audit, this IS reachable per WorkflowEngine), and delete
// (Draft direct, Published needs Void first — confirmed achievable this time, no dead-end).
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

const creator = await login('meeting_creator');
const updater = await login('meeting_updater');

let meetingId = null, meetingDocNo = null;

// ══ 1. Create WITH an action-item draft — tests the cross-module FollowUp handoff ═══════════════════
try {
    await creator.goto(UI + '/meeting-minutes'); await creator.waitForTimeout(1200);
    note('page url', creator.url());
    note('Add button count', await creator.locator('button', { hasText: /新增|Add/ }).count());
    await creator.locator('button', { hasText: /新增|Add/ }).first().click();
    await modal(creator).waitFor({ timeout: 10000 });
    await creator.waitForTimeout(500);
    const actionTitleField = modal(creator).locator('input[placeholder="行動項目"]').first();
    note('action-item title input found on the new-meeting draft path', await actionTitleField.count() > 0);
    await actionTitleField.fill('Review action item');
    const addDraftBtn = actionTitleField.locator('xpath=ancestor::div[1]/button');
    note('add-draft button count via ancestor-row lookup', await addDraftBtn.count());
    await addDraftBtn.first().click();
    await creator.waitForTimeout(300);
    const beforeFollowUpCount = sql(`SELECT COUNT(*) FROM followup;`);
    const saveBtn = modal(creator).locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click();
    await creator.waitForTimeout(1500);
    const created = sql(`SELECT id, documentNumber, status FROM meeting_minutes ORDER BY rowid DESC LIMIT 1;`);
    note('Meeting Minutes created via real screen (id|documentNumber|status)', created);
    [meetingId, meetingDocNo] = created.split('|');
    const afterFollowUpCount = sql(`SELECT COUNT(*) FROM followup;`);
    note('FollowUp count before/after saving the meeting (draft action item should bulk-create after save)', `${beforeFollowUpCount} -> ${afterFollowUpCount}`);
    const followUpRow = sql(`SELECT title, sourceModule, sourceReferenceNo FROM followup ORDER BY rowid DESC LIMIT 1;`);
    note('the FollowUp row created from the action item (title|sourceModule|sourceReferenceNo)', followUpRow);
} catch (e) { fail('1. Create + action-item handoff', e); }

// ══ 2. Draft -> Published (real screen), then confirm the whole form locks ═══════════════════════════
try {
    if (!meetingId) throw new Error('no Meeting from step 1');
    await updater.goto(UI + '/meeting-minutes').catch(() => {});
    await updater.waitForTimeout(1000);
    await updater.locator('tr', { hasText: meetingDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const allSelects = modal(updater).locator('select');
    const selCount = await allSelects.count();
    let statusIdx = -1;
    for (let i = 0; i < selCount; i++) {
        const vals = await allSelects.nth(i).locator('option').evaluateAll(els => els.map(e => e.value));
        if (vals.includes('Published') && vals.includes('Draft') && vals.includes('Void')) { statusIdx = i; break; }
    }
    note('status select located by scanning option values', `index=${statusIdx} of ${selCount}`);
    if (statusIdx === -1) throw new Error('status select not found');
    await allSelects.nth(statusIdx).selectOption('Published');
    await modal(updater).locator('button', { hasText: /^(儲存|Save)$/ }).first().click();
    await updater.waitForTimeout(1200);
    const afterPublish = sql(`SELECT status FROM meeting_minutes WHERE id='${meetingId}';`);
    note('status after Draft -> Published', afterPublish);

    // Reopen: confirm the whole form is now locked (readOnly).
    await updater.goto(UI + '/meeting-minutes').catch(() => {});
    await updater.waitForTimeout(1000);
    await updater.locator('tr', { hasText: meetingDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const anySelect = modal(updater).locator('select').first();
    const isDisabled = await anySelect.isDisabled().catch(() => null);
    note('status dropdown disabled on a Published meeting (whole form should be readOnly)', isDisabled);
    const voidBtn = modal(updater).locator('button', { hasText: /Void|作廢/ });
    note('a dedicated Void button is visible (the one escape valve)', await voidBtn.count() > 0);
} catch (e) { fail('2. Draft -> Published lock', e); }

// ══ 3. Void via the dedicated button (real screen), then confirm delete becomes possible ═══════════
try {
    if (!meetingId) throw new Error('no Meeting');
    await updater.goto(UI + '/meeting-minutes').catch(() => {});
    await updater.waitForTimeout(1000);
    await updater.locator('tr', { hasText: meetingDocNo }).first().click();
    await modal(updater).waitFor({ timeout: 10000 });
    await updater.waitForTimeout(500);
    const voidBtn2 = modal(updater).locator('button', { hasText: /Void|作廢/ });
    await voidBtn2.first().click();
    await updater.waitForTimeout(1200);
    const afterVoid = sql(`SELECT status FROM meeting_minutes WHERE id='${meetingId}';`);
    note('status after clicking the Void button (the escape valve from Published)', afterVoid);

    const delRes = await apiCall(updater, 'DELETE', `/api/meeting-minutes/${meetingId}`, null);
    note('delete a now-Void meeting (should succeed, unlike FollowUp/Audit\'s dead end)', `HTTP ${delRes.status} body=${JSON.stringify(delRes.body).slice(0, 200)}`);
    const stillThere = sql(`SELECT COUNT(*) FROM meeting_minutes WHERE id='${meetingId}';`);
    note('row count after the delete attempt', stillThere);
} catch (e) { fail('3. Void escape valve + delete', e); }

// ══ 4. A fresh Draft meeting can be deleted directly, without going through Void first ═══════════════
try {
    const draftCreate = await apiCall(creator, 'POST', '/api/meeting-minutes/', { status: 'Draft' });
    const draftId = draftCreate.body?.id;
    note('4: created a fresh Draft meeting', `HTTP ${draftCreate.status} id=${draftId}`);
    const delDraft = await apiCall(creator, 'DELETE', `/api/meeting-minutes/${draftId}`, null);
    note('4: delete the Draft directly (no Void needed)', `HTTP ${delDraft.status}`);
} catch (e) { fail('4. Draft direct delete', e); }

await browser.close();
console.log('DONE');
