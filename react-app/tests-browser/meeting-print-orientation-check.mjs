// MEETING-TABS-2026-001 print check, isolated stack only (8344/3344, seed_meeting_tabs_review.py).
// The minutes print portrait A4 and only the photo pages landscape A4 (2 x 2) — also after ITP's print CSS (an unnamed
// landscape @page) has been loaded in the same session, which is how the minutes used to come out landscape.
// Usage: MTG_TABS_REVIEW_PASSWORD=... MTG_PRINT_OUT=/path/print.pdf node tests-browser/meeting-print-orientation-check.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PW = process.env.MTG_TABS_REVIEW_PASSWORD;
const OUT = process.env.MTG_PRINT_OUT;
if (!PW || !OUT) throw new Error('MTG_TABS_REVIEW_PASSWORD and MTG_PRINT_OUT are required.');
const BASE = 'http://127.0.0.1:3344';
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; console.log('PASS', msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.addInitScript(() => localStorage.setItem('language', 'zh'));
await page.goto(`${BASE}/login`);
await page.fill('#email', 'mtg_reviewer');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'), { waitUntil: 'commit' });
await page.waitForTimeout(1500);

// five photos on the legacy Draft MOM-DEMO-001 (Draft: uploads allowed)
const uploaded = await page.evaluate(async () => {
    const list = await (await fetch('/api/meeting-minutes/', { credentials: 'same-origin' })).json();
    const m = list.find(x => x.documentNumber === 'MOM-DEMO-001');
    const csrf = decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '');
    const fd = new FormData();
    fd.append('entity_type', 'meeting'); fd.append('entity_id', m.id); fd.append('category', 'attachment');
    const colors = ['#b91c1c', '#1d4ed8', '#047857', '#a16207', '#6d28d9'];
    for (let i = 0; i < colors.length; i++) {
        const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
        const g = c.getContext('2d'); g.fillStyle = colors[i]; g.fillRect(0, 0, 1200, 900);
        g.fillStyle = '#fff'; g.font = 'bold 120px sans-serif'; g.fillText(`PHOTO ${i + 1}`, 260, 500);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        fd.append('files', new File([blob], `site-photo-${i + 1}.png`, { type: 'image/png' }));
    }
    const r = await fetch('/api/files/upload', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf }, body: fd });
    return r.status;
});
check(uploaded === 200, `5 photos uploaded (${uploaded})`);

// load ITP's print CSS (unnamed landscape @page) into this session, then go to the minutes without a reload
await page.evaluate(() => { history.pushState({}, '', '/itp'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(2000);
const itpLandscape = await page.evaluate(() => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /@page\s*\{[^}]*landscape/.test(r.cssText)); } catch { return false; } }));
check(itpLandscape, 'an unnamed landscape @page from another module is loaded (the old failure condition)');
await page.evaluate(() => { history.pushState({}, '', '/meeting-minutes'); dispatchEvent(new PopStateEvent('popstate')); });
await page.waitForTimeout(1500);
await page.locator('tr', { hasText: 'MOM-DEMO-001' }).first().click();
await page.waitForTimeout(1000);
await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
await page.getByRole('button', { name: /列印/ }).click();
await page.waitForFunction(() => window.__printed === true, null, { timeout: 15000 });
const imgs = await page.evaluate(() => [...document.querySelectorAll('.mom-print-root .photo-cell img')].map(i => i.naturalWidth));
check(imgs.length === 5 && imgs.every(w => w > 0), `print waited for all 5 photos to load (${imgs.join(',')})`);
check(await page.locator('.mom-print-root .photo-page').count() === 2, 'two photo pages (4 + 1)');
const captions = await page.locator('.mom-print-root .photo-cell figcaption').allTextContents();
check(captions.map(c => c.match(/site-photo-(\d)/)?.[1]).join('') === '12345', `photos in upload order (${captions.join(' | ')})`);
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
await browser.close();

const pdf = readFileSync(OUT).toString('latin1');
const boxes = [...pdf.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map(m => (Number(m[1]) < Number(m[2]) ? 'P' : 'L'));
console.log('page orientations:', boxes.join(''));
check(boxes.length >= 3, `PDF pages (${boxes.length})`);
check(boxes.slice(-2).every(o => o === 'L'), 'the last two pages (photos) are landscape');
check(boxes.slice(0, -2).every(o => o === 'P'), 'every page of the minutes themselves is portrait');
console.log(`ALL ${checks} CHECKS PASSED`);
