// ITP Record-link misrouting fix (2026-09-28). Real isolated backend + real screens. Batch scope:
// stop guessing ITR-vs-Checklist from a "QTS-" prefix (every document type shares it) and instead
// look the value up for real against both endpoints; report not-found/forbidden/ambiguous clearly
// instead of silently routing to the wrong module. Covers both entry points that had the bug:
// the list-page modal (ITPAdvancedEditor.tsx) and the standalone /itp/:id route (ITPDetail.tsx).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const editModal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
const planTabBtn = pg => editModal(pg).locator('button', { hasText: '檢驗計畫' });
const recordBtn = (pg, text) => editModal(pg).locator('button', { hasText: text });

const openListModal = async (pg, ref) => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    await pg.locator('input[placeholder="搜尋 ITP..."]').first().fill(ref);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: ref }).first().click();
    await editModal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
    await planTabBtn(pg).click();
    await pg.waitForTimeout(400);
};

const full = await login('rlfix_full');
const noItr = await login('rlfix_noitr');

// ══ Entry point 1: list-page modal (ITPAdvancedEditor.tsx) ═════════════════════════════════════════
try {
    await openListModal(full, 'QTS-RLF-ITP-000001');
    await recordBtn(full, 'QTS-RLF-ITR-000001').click();
    await full.waitForTimeout(1800);
    note('1a. R1 (real ITR document, not "CHK", but does start with "QTS") navigates correctly — expect /itr, NOT /checklist', full.url());
} catch (e) { fail('1. List modal: real ITR record navigates to /itr, not misrouted to /checklist', e); }

try {
    await openListModal(full, 'QTS-RLF-ITP-000001');
    await recordBtn(full, 'QTS-RLF-CHK-000001').click();
    await full.waitForTimeout(1800);
    note('1b. R2 (real Checklist) still navigates correctly to /checklist with the right openId', full.url());
} catch (e) { fail('1b. List modal: real Checklist record still navigates correctly', e); }

try {
    await openListModal(full, 'QTS-RLF-ITP-000001');
    const toastPromise = full.waitForSelector('[data-sonner-toast]', { timeout: 8000 }).catch(() => null);
    await recordBtn(full, 'QTS-RLF-ITR-999999').click();
    const toastEl = await toastPromise;
    const toastText = toastEl ? await toastEl.innerText() : '(no toast)';
    note('1c. R3 (dangling, matches nothing) — stays on ITP page, clear "not found" message, no silent misroute', `url=${full.url()} toast="${toastText}"`);
} catch (e) { fail('1c. List modal: dangling record reports not-found, no misroute', e); }

try {
    await openListModal(full, 'QTS-RLF-ITP-000001');
    const toastPromise = full.waitForSelector('[data-sonner-toast]', { timeout: 8000 }).catch(() => null);
    await recordBtn(full, 'QTS-RLF-AMBIGUOUS-000001').click();
    const toastEl = await toastPromise;
    const toastText = toastEl ? await toastEl.innerText() : '(no toast)';
    note('1d. R4 (genuinely ambiguous — same number exists as both an ITR and a Checklist) — clear "multiple matches" message, does not silently pick one', `url=${full.url()} toast="${toastText}"`);
} catch (e) { fail('1d. List modal: ambiguous record reports the ambiguity, does not guess', e); }

// ══ Entry point 2: standalone /itp/:id route (ITPDetail.tsx) — uses rlf-itp-2, seeded in the
// older phased {a:[],b:[],c:[]} detail_data shape this page's own (separate, narrower) parser
// understands; unrelated pre-existing format split, not part of this fix. ══════════════════════════
try {
    await full.goto(UI + '/itp/rlf-itp-2'); await full.waitForTimeout(1500);
    await full.locator('button', { hasText: 'QTS-RLF-ITR-000001' }).first().click();
    await full.waitForTimeout(1800);
    note('2a. /itp/:id page: real ITR record navigates to /itr (not /checklist)', full.url());
} catch (e) { fail('2. Standalone /itp/:id page: real ITR record navigates correctly', e); }

try {
    await full.goto(UI + '/itp/rlf-itp-2'); await full.waitForTimeout(1500);
    await full.locator('button', { hasText: 'QTS-RLF-CHK-000001' }).first().click();
    await full.waitForTimeout(1800);
    note('2b. /itp/:id page: real Checklist record still navigates correctly', full.url());
} catch (e) { fail('2b. Standalone /itp/:id page: real Checklist record still navigates correctly', e); }

// ══ Permission case: a value that IS a real ITR, but this account cannot view ITRs — must be
// reported as a permission problem, never silently misrouted to Checklist and never claimed
// "not found" (which would incorrectly imply the document itself doesn't exist) ════════════════════
try {
    await openListModal(noItr, 'QTS-RLF-ITP-000001');
    const toastPromise = noItr.waitForSelector('[data-sonner-toast]', { timeout: 8000 }).catch(() => null);
    await recordBtn(noItr, 'QTS-RLF-ITR-000001').click();
    const toastEl = await toastPromise;
    const toastText = toastEl ? await toastEl.innerText() : '(no toast)';
    note('3a. Account WITHOUT itr:view:all clicking a real ITR record — expect a permission message, not "not found", not misrouted', `url=${noItr.url()} toast="${toastText}"`);
} catch (e) { fail('3. No itr:view:all: real ITR record reports a permission problem, not "not found"', e); }

await browser.close();
console.log('DONE');
