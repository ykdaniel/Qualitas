// ITP standalone detail page parser fix (2026-09-29, BACKLOG #35). Real isolated backend + real
// screens. Batch scope: ITPDetail.tsx (/itp/:id) used to parse detail_data with its own inline
// logic that only understood the older phased {a,b,c} object shape; a record whose items were
// stored as a flat array (what the list-page modal's shared utils/itpParser.ts already accepts)
// silently rendered ZERO items on this page even though the list-page modal showed them fine.
// Fixed by making ITPDetail.tsx load through the same parseInspectionItems() the list-page modal
// uses. This script checks BOTH entry points show the same item count/content/order for every
// detail_data shape, and that a save-and-reload round trip on the standalone page does not lose
// items.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);
let failures = 0;
const assert = (cond, msg) => { if (cond) { note('PASS: ' + msg); } else { console.log('FAIL: ' + msg); failures++; } };

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

// Activity text (English) of every visible inspection-item row, in DOM order, EXCLUDING the
// always-rendered-but-CSS-hidden print portal (#itp-print-root, ITPDetail.tsx only).
const activityTexts = async (pg, scope = null) => {
    const root = scope ? scope : pg;
    return root.locator('.font-bold.text-sm.mb-1').evaluateAll(
        els => els.filter(el => !el.closest('#itp-print-root')).map(el => el.textContent.trim())
    );
};

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

const full = await login('dp_full');

// ══ 1. QTS-DP-ITP-000001 — flat array (the exact shape that rendered EMPTY on /itp/:id before the fix) ══
try {
    await openListModal(full, 'QTS-DP-ITP-000001');
    const modalTexts = await activityTexts(full, editModal(full));
    note('1a. List-page modal, flat-array record', JSON.stringify(modalTexts));
    assert(modalTexts.length === 3, `list modal shows 3 items for the flat-array record (got ${modalTexts.length})`);

    await full.goto(UI + '/itp/dp-itp-1'); await full.waitForTimeout(1200);
    const detailTexts = await activityTexts(full);
    note('1b. Standalone /itp/:id, flat-array record (THE BUG: used to be empty)', JSON.stringify(detailTexts));
    assert(detailTexts.length === 3, `standalone page shows 3 items for the flat-array record, not empty (got ${detailTexts.length})`);
    assert(JSON.stringify(detailTexts) === JSON.stringify(modalTexts), 'standalone page content/order matches the list-page modal exactly');
} catch (e) { fail('1. Flat-array record: both entry points show the same 3 items', e); }

// ══ 2. QTS-DP-ITP-000002 — old phased {a,b,c} object (regression: already worked before the fix) ══
try {
    await openListModal(full, 'QTS-DP-ITP-000002');
    const modalTexts = await activityTexts(full, editModal(full));
    note('2a. List-page modal, phased-object record', JSON.stringify(modalTexts));
    assert(modalTexts.length === 2, `list modal shows 2 items for the phased record (got ${modalTexts.length})`);

    await full.goto(UI + '/itp/dp-itp-2'); await full.waitForTimeout(1200);
    const detailTexts = await activityTexts(full);
    note('2b. Standalone /itp/:id, phased-object record (regression check)', JSON.stringify(detailTexts));
    assert(detailTexts.length === 2, `standalone page still shows 2 items for the phased record (got ${detailTexts.length})`);
    assert(JSON.stringify(detailTexts) === JSON.stringify(modalTexts), 'standalone page content/order still matches the list-page modal');
} catch (e) { fail('2. Phased {a,b,c} record: unchanged, both entry points match', e); }

// ══ 3. QTS-DP-ITP-000003 — flat array, one item missing `phase` + one legacy plain-string activity ══
try {
    await openListModal(full, 'QTS-DP-ITP-000003');
    const modalTexts = await activityTexts(full, editModal(full));
    note('3a. List-page modal, mixed-shape record', JSON.stringify(modalTexts));
    assert(modalTexts.length === 2, `list modal shows 2 items for the mixed record (got ${modalTexts.length})`);
    assert(modalTexts.includes('Legacy plain-string activity, no phase key'), 'list modal normalizes the legacy plain-string activity field to readable text');

    await full.goto(UI + '/itp/dp-itp-3'); await full.waitForTimeout(1200);
    const detailTexts = await activityTexts(full);
    note('3b. Standalone /itp/:id, mixed-shape record', JSON.stringify(detailTexts));
    assert(detailTexts.length === 2, `standalone page shows the same 2 items (got ${detailTexts.length})`);
    assert(JSON.stringify(detailTexts) === JSON.stringify(modalTexts), 'standalone page content/order matches the list-page modal (including the normalized legacy field and the phase-less item defaulting to Phase A)');
} catch (e) { fail('3. Mixed-shape record: missing-phase + legacy-string normalized identically on both entry points', e); }

// ══ 4. QTS-DP-ITP-000004 — no detail_data at all: must stay an empty, addable plan, not an error ══
try {
    await full.goto(UI + '/itp/dp-itp-4'); await full.waitForTimeout(1200);
    const detailTexts = await activityTexts(full);
    assert(detailTexts.length === 0, `standalone page shows 0 items for a record with no detail_data (got ${detailTexts.length})`);
    const addBtn = full.locator('button', { hasText: 'Add New Item' });
    await addBtn.first().waitFor({ timeout: 5000 });
    note('4. No detail_data at all', 'renders empty plan, no crash, Add Item button present');
} catch (e) { fail('4. No detail_data: empty plan, no crash', e); }

// ══ 5. Save-and-reload round trip on the standalone page (flat-array record) — items must not be lost ══
try {
    await full.goto(UI + '/itp/dp-itp-1'); await full.waitForTimeout(1200);
    const before = await activityTexts(full);
    const saveBtn = full.locator('button', { hasText: 'Save Document' });
    await saveBtn.first().click();
    await full.waitForTimeout(1500);
    await full.reload(); await full.waitForTimeout(1500);
    const after = await activityTexts(full);
    note('5. Save Document then reload (flat-array record)', `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
    assert(after.length === 3, `all 3 items survive a save + reload round trip (got ${after.length})`);
    assert(JSON.stringify(after) === JSON.stringify(before), 'item content/order unchanged after save + reload');
} catch (e) { fail('5. Save + reload round trip does not lose items', e); }

await browser.close();
console.log(failures === 0 ? `ALL PASSED` : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
