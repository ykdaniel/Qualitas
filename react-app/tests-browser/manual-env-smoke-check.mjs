import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);

await page.goto(`${BASE}/login`);
await page.fill('#email', 'chain_full');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
console.log('LOGIN OK, url:', page.url());

await page.goto(`${BASE}/itp`);
await page.waitForTimeout(500);
const itpMenuVisible = await page.locator('text=+ Add ITP').count();
console.log('ITP page loaded, Add button present:', itpMenuVisible > 0);

await page.goto(`${BASE}/noi`);
await page.waitForTimeout(400);
const noiMenuVisible = await page.locator('text=Add New NOI').count();
console.log('NOI page loaded, Add button present:', noiMenuVisible > 0);

await page.goto(`${BASE}/itr`);
await page.waitForTimeout(400);
const itrMenuVisible = await page.locator('text=Add New ITR').count();
console.log('ITR page loaded, Add button present:', itrMenuVisible > 0);

await browser.close();
console.log('SMOKE CHECK DONE');
