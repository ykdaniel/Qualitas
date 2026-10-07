// PQP business review — real browser, real screens, three role tiers, isolated stack. Prints observations (not pass/fail assertions):
// this is a review, not a regression test.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 }); await p.close();
    return ctx;
}
const creator = await login('pqp_creator');
const creatorCV = await login('pqp_creator_cv');   // pqp:create:all + contractors:view:all — used from step 1b onward once the finding below is recorded
const editor = await login('pqp_editor');
const approver = await login('pqp_approver');

const modal = p => p.locator('[class*=modalContent]').first();
const labelled = (p, text) => modal(p).locator('label', { hasText: text }).first().locator('..').locator('input, select, textarea').first();
const toasts = async p => (await p.locator('[data-sonner-toast]').allInnerTexts()).map(x => x.replace(/\s+/g, ' ').trim());
const saveBtn = p => modal(p).locator('button', { hasText: /^(儲存|Save|Saving\.\.\.)$/ });
const publishBtn = p => modal(p).locator('button', { hasText: 'Publish' });

// ══ 1. pqp_creator (create only): can they find the entry point and finish the create? ══════════════════════════════════════
let p = await creator.newPage();
const netlog = [];
p.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/')) netlog.push(`${r.request().method()} ${u.pathname} -> ${r.status()}`); });
await p.goto(UI + '/pqp'); await p.waitForTimeout(3000);
note('network calls made just navigating to /pqp (does it include /api/contractors?)', JSON.stringify(netlog));
const addBtnVisible = await p.locator('button', { hasText: /新增品質計劃|Add/ }).count();
note('creator sees the "Add" entry point on the list page', addBtnVisible > 0);
await p.locator('button', { hasText: '新增品質計劃' }).first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
note('create modal: publish button shown to a create-only account (canPublish is a separate permission)', (await publishBtn(p).count()) > 0);
await labelled(p, '主旨').fill('QA Plan for Review Walkthrough');
const contractorSelect = labelled(p, '承包商');
await p.waitForTimeout(1500);
const opts = await contractorSelect.locator('option').allTextContents();
note('contractor dropdown options actually available when the create modal opens', JSON.stringify(opts));
// FINDING: pqp_creator holds exactly the documented minimum permission (pqp:create:all) and the contractor
// picker is REQUIRED to save, but /api/contractors/ answered 403 for this account and the dropdown just
// silently stays empty — no error toast, no "couldn't load contractors" message. Record what the user actually
// sees, then click Save with the (unfillable) required field blank to see what validation shows.
await saveBtn(p).click(); await p.waitForTimeout(800);
const blockedErrors = await modal(p).locator('[class*=errorMessage]').allInnerTexts();
note('creator: with the contractor field impossible to fill, clicking Save shows this validation, with NO explanation that the dropdown itself failed to load', JSON.stringify(blockedErrors));
note('creator: modal stays open, nothing was saved (the account cannot complete this task at all, not "some friction")', await modal(p).isVisible());
await p.close();

// Continue the walkthrough on an account that ALSO holds contractors:view:all, so the rest of the PQP flow can
// actually be walked. This is a workaround for the review, not a fix — see the finding above.
p = await creatorCV.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('button', { hasText: '新增品質計劃' }).first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(500);
await labelled(p, '主旨').fill('QA Plan for Review Walkthrough');
await labelled(p, '承包商').selectOption({ label: 'PQP Review Co' });
await labelled(p, '版本').selectOption('Rev1.0');
await saveBtn(p).click();
const savedGone = await modal(p).waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
note('creator+contractor-view: save succeeds and modal closes (record created)', savedGone);
await p.waitForTimeout(800);
const listedAfterCreate = await p.locator('table', { hasText: 'QA Plan for Review Walkthrough' }).count();
note('the new record is visible back on the list without a manual refresh', listedAfterCreate > 0 || (await p.locator('text=QA Plan for Review Walkthrough').count()) > 0);
const pqpId = sql("select id from pqp where title='QA Plan for Review Walkthrough'");
note('created row in DB', pqpId);
await p.close();

// ══ 2. same creator, no update permission: open it again — read only? ═══════════════════════════════════════════════════════
p = await creator.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('text=QA Plan for Review Walkthrough').first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
const titleInput = labelled(p, '主旨');
const isDisabled = await titleInput.isDisabled().catch(() => null);
note('creator reopening their own just-created record: form fields disabled (no update permission)', isDisabled);
await p.close();

// ══ 3. pqp_editor (create+update, no approve): edit + try to jump straight to Approved via the status dropdown ═══════════════
p = await editor.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('text=QA Plan for Review Walkthrough').first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
note('editor: publish button shown even though this account has no approve permission', (await publishBtn(p).count()) > 0);
const statusSelect = labelled(p, 'Status') || labelled(p, '狀態');
const statusLocator = modal(p).locator('label', { hasText: /Status|狀態/ }).first().locator('..').locator('select').first();
const statusEnabled = !(await statusLocator.isDisabled().catch(() => true));
note('editor: the Status dropdown (which includes "Approved") is NOT disabled just because this account lacks approve permission', statusEnabled);
if (statusEnabled) {
    await statusLocator.selectOption({ label: '已核准' }).catch(async () => { await statusLocator.selectOption('Approved'); });
}
const beforeAttempt = sql(`select status from pqp where id='${pqpId}'`);
await saveBtn(p).click(); await p.waitForTimeout(1500);
const n = await toasts(p);
const stillOpen = await modal(p).isVisible();
const afterAttempt = sql(`select status from pqp where id='${pqpId}'`);
note('editor tries to save status=Approved without approve permission: server response and what the user actually sees', JSON.stringify({ toast: n, modalStillOpen: stillOpen, dbStatusBefore: beforeAttempt, dbStatusAfter: afterAttempt }));
note('editor: was the input (title etc.) preserved after the failed save, or did the modal reset/close?', await titleInput.inputValue().catch(() => '(field not found / modal closed)'));
await p.close();

// ══ 4. same editor: a normal, permitted status change (Not Submit -> Under Review) ══════════════════════════════════════════
p = await editor.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('text=QA Plan for Review Walkthrough').first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
const statusLocator2 = modal(p).locator('label', { hasText: /Status|狀態/ }).first().locator('..').locator('select').first();
await statusLocator2.selectOption('Under Review').catch(async () => { await statusLocator2.selectOption({ label: '審核中' }); });
await saveBtn(p).click();
const gone2 = await modal(p).waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
note('editor: an ordinary status change within their permission (-> Under Review) succeeds and modal closes', gone2);
note('DB status now', sql(`select status from pqp where id='${pqpId}'`));
await p.close();

// ══ 5. pqp_approver: approve it, then publish ════════════════════════════════════════════════════════════════════════════
p = await approver.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('text=QA Plan for Review Walkthrough').first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
const statusLocator3 = modal(p).locator('label', { hasText: /Status|狀態/ }).first().locator('..').locator('select').first();
await statusLocator3.selectOption('Approved').catch(async () => { await statusLocator3.selectOption({ label: '已核准' }); });
await saveBtn(p).click();
const gone3 = await modal(p).waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
note('approver: sets Approved and saves — succeeds', gone3);
note('DB status now', sql(`select status from pqp where id='${pqpId}'`));
await p.close();

p = await approver.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('text=QA Plan for Review Walkthrough').first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
// handlePublish uses a NATIVE window.prompt() for the change summary (not an in-app field) — Playwright
// auto-dismisses prompt()/confirm() as Cancel unless a dialog handler is registered; without one the click
// silently does nothing, which is itself worth recording as a UI consistency finding (the rest of the app
// never uses native dialogs). Register a handler here so the actual publish behaviour can be observed.
let promptSeen = null;
p.once('dialog', async d => { promptSeen = { type: d.type(), message: d.message() }; await d.accept('Reviewed-round change summary'); });
const versionBefore = sql(`select version from pqp where id='${pqpId}'`);
await publishBtn(p).click(); await p.waitForTimeout(1500);
note('Publish uses a native browser dialog (window.prompt), not an in-app form field — inconsistent with the rest of the app', JSON.stringify(promptSeen));
const publishModalGone = await modal(p).waitFor({ state: 'hidden', timeout: 8000 }).then(() => true).catch(() => false);
note('approver: clicking Publish (no change-summary typed) succeeds', publishModalGone);
note('version before/after publish, and history rows', JSON.stringify({ before: versionBefore, after: sql(`select version from pqp where id='${pqpId}'`), history: sql(`select version_no, version, status from pqp_history where pqp_id='${pqpId}' order by version_no`) }));
await p.close();

// ══ 6. editor (no approve) reopens the now-Approved record: fully locked? ═══════════════════════════════════════════════════
p = await editor.newPage();
await p.goto(UI + '/pqp'); await p.waitForTimeout(1200);
await p.locator('text=QA Plan for Review Walkthrough').first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(300);
const editorSeesLocked = await labelled(p, '主旨').isDisabled().catch(() => null);
note('editor reopening the now-Approved record: form disabled even though this account has update permission (needs approve to touch a locked record)', editorSeesLocked);
await p.close();
await browser.close();
console.log('\nREVIEW WALKTHROUGH DONE — see OBSERVED lines above, no pass/fail verdict (this is a business review, not a regression suite).');
