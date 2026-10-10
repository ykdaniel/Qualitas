// AUDIT-EXPORT-DOCX-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py then
// seed_audit_export_docx_review.py). Usage: node audit-export-docx-check.mjs <stack.json> <outDir>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const result = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`); };
const browser = await chromium.launch({ headless: true });
const EXPORT = /匯出 Word|Export Word/;

async function login(user, language = 'zh') {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(lang => localStorage.setItem('language', lang), language);
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await p.goto(UI + '/audit');
  await p.waitForSelector('table tbody tr', { timeout: 15000 });
  await p.waitForTimeout(800);
  return p;
}
const openAudit = async (p, no) => {
  await p.locator('table tbody tr', { hasText: no }).first().locator('td').nth(2).click();
  await p.waitForSelector('input[name=auditDocNo]', { timeout: 10000 });
};
const toStep4 = async p => { await p.locator('.max-w-4xl button').nth(3).click(); await p.waitForTimeout(500); };
const exportButton = p => p.locator('button', { hasText: EXPORT });
const download = async (p, name) => {
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), exportButton(p).click()]);
  const path = `${out}/${name}-${dl.suggestedFilename()}`;
  await dl.saveAs(path);
  const head = readFileSync(path).subarray(0, 2).toString();
  return { file: dl.suggestedFilename(), size: statSync(path).size, zip: head === 'PK' };
};

// 1. full user: button on step 4 beside "Print Report", downloads <auditNo>.docx; not on steps 1-3
{
  const p = await login('audit_full');
  await openAudit(p, 'AHB-EXPORT-1');
  const early = await exportButton(p).count();
  await toStep4(p);
  const header = await p.locator('header .no-print').first().innerText();
  result('export button only on step 4, next to Print Report', early === 0 && /列印報告/.test(header) && EXPORT.test(header), `${early} | ${header}`);
  const got = await download(p, 'full');
  result('download is AHB-EXPORT-1.docx (a real docx/zip)', got.file === 'AHB-EXPORT-1.docx' && got.zip && got.size > 10000, JSON.stringify(got));
  await p.screenshot({ path: `${out}/step4-export-button.png` });

  // 2. unsaved change: warned, nothing downloaded
  await p.fill('textarea[name=findings]', 'unsaved edit');
  let downloaded = false;
  p.once('download', () => { downloaded = true; });
  await exportButton(p).click();
  await p.waitForTimeout(1500);
  const toast = await p.locator('[data-sonner-toast]').last().innerText().catch(() => '');
  result('unsaved changes: asks to save first, no download', !downloaded && /儲存草稿/.test(toast), toast);
  await p.screenshot({ path: `${out}/unsaved-warning.png` });
  await p.context().close();
}

// 3. new audit: no button until the first Save Draft, then it exports the new number
{
  const p = await login('audit_full');
  await p.locator('button', { hasText: /新增|Add/ }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await toStep4(p);
  const before = await exportButton(p).count();
  await p.locator('.max-w-4xl button').nth(0).click();
  await p.fill('input[name=auditTitle]', 'export after first save');
  await p.locator('button', { hasText: /儲存草稿|Save Draft/ }).first().click();
  await p.waitForTimeout(1500);
  const docNo = await p.inputValue('input[name=auditDocNo]');
  await toStep4(p);
  const got = await download(p, 'new');
  result('new audit: no button before saving, exports after Save Draft', before === 0 && !!docNo && got.file === `${docNo}.docx` && got.zip,
    `${before} | ${docNo} | ${JSON.stringify(got)}`);
  await p.context().close();
}

// 4. read-only cases still export: a view-only user, and a locked Void record
{
  const p = await login('audit_viewer');
  await openAudit(p, 'AHB-EXPORT-1');
  await toStep4(p);
  const got = await download(p, 'viewer');
  result('view-only user can export', got.file === 'AHB-EXPORT-1.docx' && got.zip, JSON.stringify(got));
  await p.context().close();
  const q = await login('audit_full');
  await openAudit(q, 'AHB-VOID-1');
  await toStep4(q);
  const void1 = await download(q, 'void');
  result('locked Void record can export', void1.file === 'AHB-VOID-1.docx' && void1.zip, JSON.stringify(void1));
  await q.context().close();
}

// 5. English label; the button is hidden in print (inside the header's no-print group)
{
  const p = await login('audit_full', 'en');
  await openAudit(p, 'AHB-EXPORT-1');
  await toStep4(p);
  const label = await exportButton(p).innerText();
  await p.emulateMedia({ media: 'print' });
  const printed = await exportButton(p).isVisible();
  result('English label, hidden when printing', /Export Word/.test(label) && !printed, `${label} | visible in print: ${printed}`);
  await p.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
