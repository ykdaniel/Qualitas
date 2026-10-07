// ITP full UI/UX walkthrough — screenshots only, review round (2026-09-28). No assertions, no
// product code touched. Captures the real screens a user sees with a realistic ~15-item plan.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const OUT = process.argv[3];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const p = await ctx.newPage();
await p.goto(UI + '/login'); await p.fill('#email', 'uiux_reviewer'); await p.fill('#password', PW); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

const editModal = () => p.locator('[class*=modalContent], [class*=ModalContent]').first();

// 1. ITP list view
await p.goto(UI + '/itp'); await p.waitForTimeout(1200);
await p.screenshot({ path: `${OUT}/1-list.png`, fullPage: true });

// 2. Open the record — General tab (default)
await p.locator('input[placeholder="搜尋 ITP..."]').first().fill('QTS-UIR-ITP-000001');
await p.waitForTimeout(700);
await p.locator('tr', { hasText: 'QTS-UIR-ITP-000001' }).first().click();
await editModal().waitFor({ timeout: 10000 });
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/2-general-tab.png` });

// 3. Plan tab — top of the full item table
await editModal().locator('button', { hasText: '檢驗計畫' }).click();
await p.waitForTimeout(600);
await p.screenshot({ path: `${OUT}/3-plan-tab-top.png` });

// 4. Plan tab — scroll the inner table to see mid-list rows + sticky header behavior
const tableScroller = editModal().locator('div.overflow-auto').first();
await tableScroller.evaluate(el => { el.scrollTop = el.scrollHeight * 0.4; });
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/4-plan-tab-scrolled.png` });

// 5. Footer action row (Generate Checklist / Add New Item / Publish / Save / Cancel) — scroll to bottom
await tableScroller.evaluate(el => { el.scrollTop = el.scrollHeight; });
await p.waitForTimeout(400);
await p.screenshot({ path: `${OUT}/5-plan-tab-bottom-and-footer.png` });

// 6. Click Edit on one item to see the item editor panel
await editModal().locator('button[title=Edit]').first().click();
await p.waitForTimeout(500);
await p.screenshot({ path: `${OUT}/6-item-edit-panel.png` });
await p.keyboard.press('Escape').catch(() => {});
await editModal().locator('button', { hasText: 'Cancel' }).click().catch(() => {});
await p.waitForTimeout(300);

// 7. Click a "Record" link on an item that has one, to see where it goes
await editModal().locator('button', { hasText: 'QTS-UIR-ITR-000001' }).first().click().catch(() => {});
await p.waitForTimeout(800);
await p.screenshot({ path: `${OUT}/7-after-clicking-record-link.png`, fullPage: true });

await browser.close();
console.log('SCREENSHOTS DONE');
