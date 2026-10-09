// AUDIT-LAYOUT-2026-001: wizard layout at three widths — columns per row and no horizontal page scroll — plus the merged
// step 2 (Personnel + Scope & Location) and the 4-step progress bar. Isolated stack only. Usage: node audit-layout-check.mjs <stack.json> <outDir>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`;
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + extra : ''}`); };
const browser = await chromium.launch({ headless: true });
for (const [label, width, cols] of [['desktop 1440', 1440, 3], ['laptop 1024', 1024, 2], ['phone 390', 390, 1]]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('language', 'en'));
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', 'audit_full'); await p.fill('#password', 'Accept-Test-1234'); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await p.goto(UI + '/audit?openId=AHB-DRAFT-1'); await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 });
  // columns = how many of the first three fields (Doc No, Project, Contractor) sit on the same row as Doc No
  const firstRow = await p.evaluate(() => {
    const els = [document.querySelector('input[name=auditDocNo]'), document.querySelector('select[name=projectId]'),
      [...document.querySelectorAll('select')].find(s => [...s.options].some(o => /Select Contractor/.test(o.text)))];
    const tops = els.map(el => Math.round(el.getBoundingClientRect().top));
    return { cols: tops.filter(t => t === tops[0]).length, tops };
  });
  // The wizard is a fixed overlay that scrolls by itself: overflow shows up in IT, not in the document.
  const fit = await p.evaluate(() => {
    const overlay = document.querySelector('input[name=auditDocNo]').closest('.fixed');
    const labels = [...document.querySelectorAll('button')].filter(b => /^[0-9]$/.test(b.innerText.trim()))
      .map(b => b.parentElement.querySelector('span')).filter(s => s && getComputedStyle(s).display !== 'none')
      .map(s => { const r = s.getBoundingClientRect(); return { text: s.innerText, left: Math.round(r.left), right: Math.round(r.right) }; });
    return { overlayOverflow: overlay.scrollWidth - overlay.clientWidth, pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
             viewport: window.innerWidth, labels };
  });
  const clipped = fit.labels.filter(l => l.left < 0 || l.right > fit.viewport);
  check(`${label}: step 1 has ${cols} column(s)`, firstRow.cols === cols, JSON.stringify(firstRow));
  check(`${label}: no horizontal overflow (wizard overlay and page)`, fit.overlayOverflow <= 0 && fit.pageOverflow <= 0, `overlay=${fit.overlayOverflow}px page=${fit.pageOverflow}px`);
  check(`${label}: every visible progress label inside the viewport`, clipped.length === 0,
    fit.labels.length ? JSON.stringify(fit.labels) : 'labels hidden at this width (numbers only)');
  await p.screenshot({ path: `${out}/step1-${width}.png`, fullPage: true });
  const steps = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => /^[0-9]$/.test(b.innerText.trim())).map(b => b.innerText.trim()));
  if (width === 1440) check('progress bar has 4 steps', JSON.stringify(steps) === '["1","2","3","4"]', JSON.stringify(steps));
  await p.locator('button', { hasText: /^2$/ }).first().click(); await p.waitForTimeout(400);
  const step2 = await p.evaluate(() => ({
    personnel: ['projectDirector', 'techLead', 'leadAuditor', 'supportAuditors'].every(n => document.querySelector(`input[name=${n}]`)),
    scope: !!document.querySelector('input[name=location]') && !!document.querySelector('input[name=auditCriteria]') && !!document.querySelector('textarea[name=scopeDescription]'),
    printPlan: [...document.querySelectorAll('button')].some(b => /Print Audit Plan/.test(b.innerText)),
  }));
  check(`${label}: step 2 holds personnel + scope fields and the print-plan button`, step2.personnel && step2.scope && step2.printPlan, JSON.stringify(step2));
  await p.screenshot({ path: `${out}/step2-${width}.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures ? 1 : 0);
