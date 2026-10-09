// AUDIT-POLISH-2026-001: what the wizard's three print buttons actually print (isolated stack only).
// Opens an audit through ?openId= (also exercises the deep link), goes to steps 3 / 4 / 5 (the steps with a print button),
// renders each with print media into a PDF (page.pdf = the browser's print pipeline) and reports pages + text markers.
// Usage: node audit-print-check.mjs <stack.json> <outDir> <auditNo>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const auditNo = process.argv[4];
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const p = await ctx.newPage();
await p.goto(UI + '/login'); await p.fill('#email', 'audit_full'); await p.fill('#password', PW); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
await p.goto(`${UI}/audit?openId=${encodeURIComponent(auditNo)}`);
await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 });
console.log('DEEPLINK opened', await p.inputValue('input[name=auditDocNo]'), 'url', new URL(p.url()).search || '(openId removed)');
for (const step of [3, 4, 5]) {
  await p.locator('button', { hasText: new RegExp(`^${step}$`) }).first().click();
  await p.waitForTimeout(600);
  const hasPrintButton = await p.locator('button', { hasText: /列印|Print/ }).count();
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: `${out}/step${step}.pdf`, format: 'A4', printBackground: true });
  await p.emulateMedia({ media: 'screen' });
  console.log(`STEP ${step} printButtons=${hasPrintButton} pdf=${out}/step${step}.pdf`);
}
await browser.close();
