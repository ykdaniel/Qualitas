// AUDIT-POLISH-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py + the round's extra seed).
// Usage: node audit-polish-check.mjs <stack.json> <outDir>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const result = (name, ok, extra = '') => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 300) : ''}`);
const browser = await chromium.launch({ headless: true });

async function login(user, language = 'zh') {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
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
  const row = p.locator('table tbody tr', { hasText: no }).first();
  await row.locator('td').nth(2).click();
  await p.waitForSelector('input[name=auditDocNo]', { timeout: 10000 }).catch(async e => { await p.screenshot({ path: `${out}/open-${no}-failed.png` }); throw e; });
};
const closeWizard = async p => { await p.locator('.fixed button:has(svg.lucide-x)').first().click(); await p.waitForTimeout(400); };

// 1. Void-only contractor is not flagged overdue; Review Vendor (past Draft) still is. Both in the stats panel.
{
  const p = await login('audit_full');
  const flagged = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[class*="vendorItem"]')]
    .map(el => [el.innerText.split('\n')[0].trim(), /pastUnfinished/.test(el.className)])));
  result('void-only contractor not flagged overdue', flagged['Void Only Co'] === false, JSON.stringify(flagged));
  result('contractor with a past Draft still flagged', flagged['Review Vendor'] === true, JSON.stringify(flagged));

  // 2. zh texts: panel hint, month label, placeholders
  const hint = await p.locator('[class*="panelSubtitle"]').first().innerText();
  const month = await p.locator('[class*="monthDisplay"]').first().innerText();
  result('zh vendor hint', hint === '選擇承包商以篩選稽核', hint);
  result('zh month label', /月/.test(month) && !/[A-Za-z]/.test(month), month);
  await p.locator('button', { hasText: /新增|Add/ }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  const ph = await p.getAttribute('input[name=auditTitle]', 'placeholder');
  result('title placeholder translated (no raw key)', ph === '輸入稽核主旨', ph);
  await closeWizard(p);

  // 3. deactivated contractor still shown in the picker of its own audit
  await openAudit(p, 'AHB-RETIRED-1');
  const picker = await p.evaluate(() => {
    const s = [...document.querySelectorAll('select')].find(x => [...x.options].some(o => /Contractor|承包商|廠商/.test(o.text) && o.value === ''));
    return { value: s.value, text: s.options[s.selectedIndex]?.text, options: [...s.options].map(o => o.text) };
  });
  result('inactive contractor kept in its audit picker', picker.value === 'retired' && picker.text === 'Retired Co', JSON.stringify(picker));

  // 4. a refused save shows the backend's reason (end date before start date -> 422)
  await p.fill('input[name=auditEndDate]', '2026-08-01');
  await p.locator('button', { hasText: /儲存草稿|Save Draft/ }).first().click();
  await p.waitForTimeout(1200);
  const err = await p.locator('.bg-red-50').first().innerText().catch(() => '');
  result('save error shows the reason', /無法儲存/.test(err) && /date/i.test(err), err);
  await p.screenshot({ path: `${out}/save-error-reason.png` });
  await p.context().close();
}

// 5. create-only user: after the first Save Draft the wizard is read-only with a notice
{
  const p = await login('audit_viewer');
  await p.locator('button', { hasText: /新增|Add/ }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await p.fill('input[name=auditTitle]', 'create-only check');
  await p.locator('button', { hasText: /儲存草稿|Save Draft/ }).first().click();
  await p.waitForTimeout(1500);
  const state = await p.evaluate(() => ({
    docNo: document.querySelector('input[name=auditDocNo]')?.value,
    notice: document.querySelector('.bg-amber-50')?.innerText || '',
    disabled: [...document.querySelectorAll('form fieldset')].every(f => f.disabled),
    saveVisible: [...document.querySelectorAll('button')].some(b => /儲存草稿|Save Draft/.test(b.innerText)),
  }));
  result('create-only user: created then read-only with notice', !!state.docNo && /唯讀/.test(state.notice) && state.disabled && !state.saveVisible, JSON.stringify(state));
  await p.screenshot({ path: `${out}/create-only-read-only.png` });
  await p.context().close();
}

// 6. step-5 search is case-insensitive
{
  const p = await login('audit_full');
  await openAudit(p, 'AHB-DRAFT-1');
  await p.locator('button', { hasText: /^5$/ }).first().click();
  await p.fill('input[placeholder*="Search items"], input[placeholder*="搜尋"]', 'print-item-07');
  await p.waitForTimeout(400);
  const rows = await p.locator('tbody tr', { hasText: 'PRINT-ITEM-07' }).count();
  result('step-5 search ignores case', rows >= 1, `rows=${rows}`);
  await p.context().close();
}
await browser.close();
