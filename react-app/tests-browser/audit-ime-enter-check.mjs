// AUDIT-POLISH-2026-001 R2: the Enter handlers of the wizard's custom-item fields must ignore the keydown Safari sends when
// Enter confirms an IME candidate (isComposing=false, keyCode=229) and Chrome's (isComposing=true), and still act on a
// plain Enter. Synthetic events in Chromium (no Safari available here). Usage: node audit-ime-enter-check.mjs <stack.json>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`;
const browser = await chromium.launch({ headless: true });
const p = await (await browser.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
await p.goto(UI + '/login'); await p.fill('#email', 'audit_full'); await p.fill('#password', 'Accept-Test-1234'); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
await p.goto(UI + '/audit?openId=AHB-RETIRED-1');
await p.waitForSelector('input[name=auditDocNo]');
await p.locator('button', { hasText: /^3$/ }).first().click();  // Checklist Setup
await p.waitForSelector('input[name=task]');
const count = () => p.evaluate(() => document.querySelectorAll('[class*="rounded-2xl"] input[name=no], li, .group').length);
const items = () => p.evaluate(() => [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^IME-/.test(e.textContent || '')).length);
async function keydown(opts) {
  await p.evaluate(({ keyCode, isComposing }) => {
    const el = document.querySelector('input[name=task]');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true, isComposing });
    Object.defineProperty(ev, 'keyCode', { get: () => keyCode });
    Object.defineProperty(ev, 'which', { get: () => keyCode });
    el.dispatchEvent(ev);
  }, opts);
  await p.waitForTimeout(300);
}
await p.fill('input[name=task]', 'IME-safari');
await keydown({ keyCode: 229, isComposing: false });
console.log(`${(await items()) === 0 && (await p.inputValue('input[name=task]')) === 'IME-safari' ? 'PASS' : 'FAIL'} Safari IME confirm (keyCode 229, isComposing false) adds nothing, text kept`);
await keydown({ keyCode: 13, isComposing: true });
console.log(`${(await items()) === 0 ? 'PASS' : 'FAIL'} Chrome IME confirm (isComposing true) adds nothing`);
await keydown({ keyCode: 13, isComposing: false });
console.log(`${(await items()) === 1 && (await p.inputValue('input[name=task]')) === '' ? 'PASS' : 'FAIL'} plain Enter adds the item and clears the field (items=${await items()})`);
await browser.close();
