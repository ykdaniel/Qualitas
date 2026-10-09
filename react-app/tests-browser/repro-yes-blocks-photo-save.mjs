// REPRODUCTION of a KNOWN, UNRESOLVED usability problem (BACKLOG #33.4) — not a regression test of a fixed behaviour.
//
// An NCR that already has "Effectiveness Verified = Yes" but no stored improvement photo cannot save a photo first: the form derives status Closed from
// "Yes", the front-end closure check finds no STORED photo and stops the save ("尚無法結案…先儲存並上傳改善照片"), so the user has to change their own
// recorded "Yes" back by hand, save the photo, and set "Yes" again. Nothing here resets the user's choice or saves in two steps for them (declined 2026-09-21).
//
// The script asserts the CURRENT behaviour and exits 0 with "REPRODUCED" when it is still there; it exits 1 ("NOT REPRODUCED") if the behaviour changed, i.e.
// somebody fixed or altered it — then update the BACKLOG entry. Isolated stack only (see qworkflow-photo.mjs for how to start one; seed = seed_qworkflow_photos.py, case Y):
//   REAL_PNG=<a real png> node ../react-app/tests-browser/repro-yes-blocks-photo-save.mjs stack.json seed.out
import { chromium } from '../node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [stackFile, seedFile] = process.argv.slice(2);
const stack = JSON.parse(readFileSync(stackFile, 'utf8')), seed = JSON.parse(readFileSync(seedFile, 'utf8').replace(/^SEED\s+/, '')).cases;
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const UI = `http://127.0.0.1:${stack.vite_port}`, id = seed.Y.ncrs[0], ref = sql(`select documentNumber from ncr where id='${id}'`);
let ok = true; const seen = (name, cond, extra = '') => { if (!cond) ok = false; console.log(`${cond ? 'OBSERVED' : 'DIFFERENT'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 240) : ''}`); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1100 }, timezoneId: 'Asia/Taipei' });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
let p = await ctx.newPage();
await p.goto(UI + '/login'); await p.fill('#email', 'qw_user'); await p.fill('#password', 'Accept-Test-1234'); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
const writes = []; p.on('response', r => { const u = new URL(r.url()); if (u.pathname.startsWith('/api/') && r.request().method() !== 'GET') writes.push(`${r.request().method()} ${u.pathname} ${r.status()}`); });
const modal = () => p.locator('[class*=modalContent]').first();
const tab = async label => { await modal().locator('button', { hasText: label }).first().click(); await p.waitForTimeout(250); };
const save = () => modal().locator('button', { hasText: /^(儲存|儲存中\.\.\.)$/ }).first();
await p.goto(UI + '/dashboard'); await p.waitForTimeout(1200);
await p.evaluate(r => { history.pushState(history.state, '', '/ncr?openId=' + encodeURIComponent(r)); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, ref);
await modal().waitFor({ timeout: 15000 }); await p.waitForTimeout(500);

await tab('驗證與結案');
const verdict = modal().locator('[name=effectivenessVerified]').first();
seen('the record already carries "Effectiveness Verified = Yes" (stored Open, no photo)', (await verdict.inputValue()) === 'Yes' && sql(`select status||'|'||effectivenessVerified from ncr where id='${id}'`) === 'Open|Yes');
await tab('照片與附件'); await modal().locator('#attachment-upload-ncr-improvement-photos').setInputFiles(process.env.REAL_PNG); await p.waitForTimeout(400);
await save().click(); await p.waitForTimeout(1500);
const toast = (await p.locator('[data-sonner-toast]').allInnerTexts()).join(' | ').replace(/\s+/g, ' ');
seen('saving the photo is STOPPED before anything is written: the "尚無法結案…先儲存並上傳改善照片" notice appears', /尚無法結案/.test(toast) && /先儲存並上傳改善照片/.test(toast), toast);
seen('no write request was sent, no attachment row, the NCR is unchanged, the window is still open and the photo is still pending in it',
  writes.length === 0 && sql(`select count(*) from attachments where entity_id='${id}'`) === '0' && sql(`select status||'|'||effectivenessVerified from ncr where id='${id}'`) === 'Open|Yes' && (await modal().isVisible()) && (await modal().innerText()).includes('real.png'), JSON.stringify(writes));

// the only way out today: the USER changes their own recorded choice
await tab('驗證與結案'); await verdict.selectOption('Pending');
await save().click(); await p.waitForTimeout(2500);
seen('after the user sets the verdict back to "Pending" by hand the photo saves (PUT + upload, window closes), and the stored verdict is now Pending — the earlier "Yes" is gone until they set it again',
  writes.some(w => /^PUT .*\/api\/ncr\/.* 200$/.test(w)) && writes.some(w => w === 'POST /api/files/upload 200') && sql(`select count(*) from attachments where entity_id='${id}' and is_deleted=0`) === '1' && sql(`select effectivenessVerified from ncr where id='${id}'`) === 'Pending', JSON.stringify(writes));
await browser.close();
console.log(ok ? '\nREPRODUCED (known issue BACKLOG #33.4 is still present; nothing was changed to hide it)' : '\nNOT REPRODUCED — the behaviour differs from the recorded one; update BACKLOG #33.4');
process.exit(ok ? 0 : 1);
