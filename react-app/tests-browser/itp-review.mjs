// ITP business review — real browser, real screens, three role tiers, isolated stack. Prints observations
// (not pass/fail assertions): this is a review, not a regression test. See seed_itp_review.py for accounts.
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
const editor = await login('itp_editor');       // itp:view:all, itp:create:all, itp:update:all — no itp:approve:all / itp:void:all
const creator = await login('itp_creator');     // itp:view:all, itp:create:all only — no update
const checklistV = await login('itp_checklist_v'); // itp:view:all, checklist:view:all — no itp:create/update

const modal = p => p.locator('[class*=modalContent], [class*=ModalContent]').first();
const addBtn = p => p.locator('button', { hasText: /新增|Add/ });

// ══ 1. itp_editor: create, observe the default status a fresh ITP lands in ══════════════════════════════
let p = await editor.newPage();
p.on('dialog', d => d.accept());
await p.goto(UI + '/itp'); await p.waitForTimeout(2000);
note('editor sees the Add entry point', await addBtn(p).count() > 0);
await addBtn(p).first().click();
await modal(p).waitFor({ timeout: 10000 }); await p.waitForTimeout(500);

const rowsBefore = sql("SELECT id, status, rev FROM itp ORDER BY rowid DESC LIMIT 1;");
note('a brand-new ITP is created immediately on clicking Add (before any field is filled in) — status/rev in DB right after click', rowsBefore);

// ══ 2. Generate Checklist with zero inspection items ══════════════════════════════════════════════════
const genBtn = modal(p).locator('button', { hasText: 'Generate Checklist' });
note('Generate Checklist button present', await genBtn.count() > 0);
note('Generate Checklist disabled with zero items (button disabled attr)', await genBtn.first().isDisabled().catch(() => 'n/a'));

// Add one inspection item via the advanced editor, then try Generate Checklist for real.
const addItemBtn = modal(p).locator('button', { hasText: 'Add New Item' });
if (await addItemBtn.count()) {
    await addItemBtn.first().click();
    await p.waitForTimeout(500);
    // best-effort: fill the first visible text input in the newly-added item row with an activity description
    const firstInput = modal(p).locator('textarea, input[type=text]').first();
    if (await firstInput.count()) { await firstInput.fill('Review test inspection item'); await p.waitForTimeout(300); }
}
note('Generate Checklist enabled after adding one item', !(await genBtn.first().isDisabled().catch(() => true)));
if (!(await genBtn.first().isDisabled().catch(() => true))) {
    await genBtn.first().click();
    await p.waitForTimeout(1500);
    const newChecklist = sql("SELECT recordsNo, status, itpId, itpVersion FROM checklist ORDER BY rowid DESC LIMIT 1;");
    note('checklist row created by Generate Checklist (recordsNo|status|itpId|itpVersion)', newChecklist);
    note('current URL after Generate Checklist (does it navigate to the new checklist?)', p.url());
}

// ══ 3. Publish from whatever status the ITP is currently in (no confirm() handling needed — dialog auto-accepted above) ══
await p.goto(UI + '/itp'); await p.waitForTimeout(1500);
const itpRow = sql("SELECT id, status FROM itp ORDER BY rowid DESC LIMIT 1;");
note('ITP status just before Publish attempt', itpRow);
// Re-open the same ITP via edit
await p.locator('table tbody tr').first().locator('button, a').first().click().catch(() => {});
await p.waitForTimeout(1000);
if (await modal(p).count() === 0) {
    // fall back: click first row itself
    await p.locator('table tbody tr').first().click().catch(() => {});
    await p.waitForTimeout(1000);
}
const publishBtn = modal(p).locator('button', { hasText: 'Publish' });
if (await publishBtn.count()) {
    const netlog = [];
    p.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/itp')) netlog.push(`${r.request().method()} ${u.pathname} -> ${r.status()}`); });
    await publishBtn.first().click();
    await p.waitForTimeout(1500);
    const afterPublish = sql("SELECT id, status, rev FROM itp ORDER BY rowid DESC LIMIT 1;");
    note('itp_editor (no itp:approve:all) clicks Publish — DB status/rev after', afterPublish);
    note('network calls during Publish', JSON.stringify(netlog));
} else {
    note('Publish button not found on reopened ITP (script could not relocate the row/modal)', '');
}
await p.close();

// ══ 4. itp_creator (create-only, no update): can they even reach an existing ITP's edit modal? ══════════
let p2 = await creator.newPage();
await p2.goto(UI + '/itp'); await p2.waitForTimeout(1500);
await p2.locator('table tbody tr').first().click().catch(() => {});
await p2.waitForTimeout(1000);
note('itp_creator (no itp:update:all) clicking an existing row — modal opened?', await modal(p2).count() > 0);
if (await modal(p2).count() > 0) {
    const saveBtn = modal(p2).locator('button', { hasText: /^(儲存|Save)$/ });
    await saveBtn.first().click().catch(() => {});
    await p2.waitForTimeout(1000);
    note('itp_creator attempts Save on existing ITP — any visible error/toast?', (await p2.locator('[data-sonner-toast]').allInnerTexts()).join(' | '));
}
await p2.close();

// ══ 5. checklist_v: can a plain checklist viewer (no ITP write perms) reach the ITP-generated checklist? ══
let p3 = await checklistV.newPage();
const lastChecklist = sql("SELECT recordsNo FROM checklist ORDER BY rowid DESC LIMIT 1;");
note('last checklist recordsNo in DB (target for checklist_v to open)', lastChecklist);
await p3.goto(UI + '/checklist'); await p3.waitForTimeout(1500);
note('checklist_v sees the checklist list page without error', p3.url());
await p3.close();

await browser.close();
console.log('DONE');
