// One-off 1280px check (2026-09-29 follow-up): the 1024-1344px band was where the PQP/ITP
// gauge squish used to happen before the flex-wrap fix. Screenshot zh + en at exactly 1280px.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const shotsDir = process.argv[3] || '/tmp/qualitas-1280-screens';
mkdirSync(shotsDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
for (const lang of ['zh', 'en']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
    await ctx.addInitScript((l) => localStorage.setItem('language', l), lang);
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', 'dash_full'); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1200);
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`[${lang}] 1280px overflow = ${overflow}`);
    await p.screenshot({ path: `${shotsDir}/1280-${lang}-full.png`, fullPage: true });
    // Zoom into just the PQP/ITP gauge section for a close look at title wrapping / squish.
    const dual = p.locator('[class*=dualChartContainer]');
    await dual.scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${shotsDir}/1280-${lang}-gauges.png`, clip: await dual.boundingBox() });
    await ctx.close();
}
await browser.close();
console.log('DONE');
