// count browser requests to the removed endpoint while the Audit page + wizard are used (isolated stack only)
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8')); const UI = `http://127.0.0.1:${stack.vite_port}`;
const b = await chromium.launch({ headless: true }); const p = await (await b.newContext()).newPage();
const hits = []; const opts = [];
p.on('request', r => { if (r.url().includes('/api/audit/contractors')) hits.push(r.url()); if (r.url().includes('/api/contractors/options')) opts.push(r.url()); });
await p.goto(UI + '/login'); await p.fill('#email', 'audit_full'); await p.fill('#password', 'Accept-Test-1234'); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login')); await p.goto(UI + '/audit'); await p.waitForTimeout(2000);
await p.goto(UI + '/audit?openId=AHB-DRAFT-1'); await p.waitForSelector('input[name=auditDocNo]'); await p.waitForTimeout(1000);
console.log(`requests to /api/audit/contractors: ${hits.length}; to /api/contractors/options: ${opts.length}`);
console.log(hits.length === 0 && opts.length > 0 ? 'PASS no request to the removed endpoint; the shared list is used' : 'FAIL');
await b.close();
