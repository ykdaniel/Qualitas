import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:3320/login'); await p.fill('#email', 'audit_full'); await p.fill('#password', 'Accept-Test-1234'); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'));
const check = async label => {
  await p.goto('http://127.0.0.1:3320/audit?openId=ahb-export-1', { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForSelector('input[name=auditDocNo]'); await p.locator('.max-w-4xl button').nth(1).click(); await p.waitForTimeout(500);
  await p.emulateMedia({ media: 'print' });
  const r = await p.evaluate(() => getComputedStyle(document.getElementById('root')).display);
  await p.emulateMedia({ media: 'screen' });
  console.log(label, '#root display in print =', r);
};
await check('fresh load:');
// client-side navigation (SPA) to NCR, then back to Audit without reload
await p.evaluate(() => { history.pushState({}, '', '/ncr'); dispatchEvent(new PopStateEvent('popstate')); }); await p.waitForTimeout(2500);
const sheets = await p.evaluate(() => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => r.cssText.includes('#root') && r.cssText.includes('none')); } catch { return false; } }));
console.log('after visiting NCR (SPA), a #root{display:none} print rule is loaded:', sheets);
await p.evaluate(() => { history.pushState({}, '', '/audit?openId=ahb-export-1'); dispatchEvent(new PopStateEvent('popstate')); }); await p.waitForTimeout(2000);
await p.waitForSelector('input[name=auditDocNo]'); await p.locator('.max-w-4xl button').nth(1).click(); await p.waitForTimeout(500);
await p.emulateMedia({ media: 'print' });
console.log('audit after NCR (no reload): #root display in print =', await p.evaluate(() => getComputedStyle(document.getElementById('root')).display));
await b.close();
