// Deeper field-level follow-up to itp-detail-parser-fix-review.mjs (BACKLOG #35, 2026-09-29).
// The existing script only compares each item's Activity(EN) text and count. Per explicit
// instruction this round, that is not enough: this script opens the EDIT PANEL for every item on
// BOTH entry points (list-page modal / ITPAdvancedEditor.tsx and standalone /itp/:id /
// ITPDetail.tsx) and compares every field — activity, standard, criteria (all pairs), checkTime,
// method, frequency, record, all 4 VP verification points — plus the item's explicit Phase select
// value (not just which visual phase-group it was rendered under). Real isolated backend, real
// screens, same seed as itp-detail-parser-fix-review.mjs (must be seeded first).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const assert = (cond, msg) => { if (cond) { console.log('PASS: ' + msg); } else { console.log('FAIL: ' + msg); failures++; } };

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

// Read every field of the currently-open item edit panel: the Phase select's value plus every
// OTHER select and text input's value, in DOM order (order differs between the two panels — this
// script does not assume it, see below).
async function readOpenPanel(pg) {
    return pg.evaluate(() => {
        // The Phase select is uniquely identifiable by its first option's text (from the shared
        // PHASES constant, "A. Before Construction ..."), independent of class names, which differ
        // between ITPDetail.tsx and ITPAdvancedEditor.tsx.
        const phaseSelect = Array.from(document.querySelectorAll('select'))
            .find(s => (s.options[0]?.text || '').startsWith('A. Before Construction'));
        if (!phaseSelect) throw new Error('Phase select not found — item edit panel is not open');
        const panel = phaseSelect.closest('.fixed') || phaseSelect.closest('[class*="fixed"]') || document.body;
        const inputs = Array.from(panel.querySelectorAll('input[type="text"], input:not([type])'));
        const otherSelects = Array.from(panel.querySelectorAll('select')).filter(s => s !== phaseSelect);
        return {
            phase: phaseSelect.value,
            textValues: inputs.map(i => i.value),
            selectValues: otherSelects.map(s => s.value),
        };
    });
}

const openListModalItem = async (pg, ref, activityText) => {
    await pg.goto(UI + '/itp'); await pg.waitForTimeout(1000);
    await pg.locator('input[placeholder="搜尋 ITP..."]').first().fill(ref);
    await pg.waitForTimeout(700);
    await pg.locator('tr', { hasText: ref }).first().click();
    await editModal(pg).waitFor({ timeout: 10000 });
    await pg.waitForTimeout(500);
    await planTabBtn(pg).click();
    await pg.waitForTimeout(400);
    const row = editModal(pg).locator('.font-bold.text-sm.mb-1', { hasText: activityText }).first();
    await row.scrollIntoViewIfNeeded();
    // Find the row's own Edit button by title (not "first button in row"), which is robust to the
    // list-page modal also having a drag-handle icon button before Edit.
    await row.locator('xpath=ancestor::*[.//button[@title="Edit"]][1]').first()
        .locator('button[title="Edit"]').first().click();
    await pg.waitForTimeout(400);
};

const openDetailPageItem = async (pg, id, activityText) => {
    await pg.goto(UI + '/itp/' + id); await pg.waitForTimeout(1200);
    const row = pg.locator('.font-bold.text-sm.mb-1', { hasText: activityText }).first();
    await row.scrollIntoViewIfNeeded();
    await row.locator('xpath=ancestor::*[.//button[@title="Edit"]][1]').first()
        .locator('button[title="Edit"]').first().click();
    await pg.waitForTimeout(400);
};

const closePanel = async pg => {
    const cancelBtn = pg.locator('button', { hasText: 'Cancel' }).last();
    if (await cancelBtn.count()) await cancelBtn.click();
    await pg.waitForTimeout(200);
};

const full = await login('dp_full');

// Cases: [reference, standalone-page id, [activity texts in expected phase order], expectedPhases]
const cases = [
    ['QTS-DP-ITP-000001', 'dp-itp-1', ['Flat A1 sighted', 'Flat A2 sighted', 'Flat B1 sighted'], ['A', 'A', 'B']],
    ['QTS-DP-ITP-000002', 'dp-itp-2', ['Phased A1 sighted', 'Phased B1 sighted'], ['A', 'B']],
    ['QTS-DP-ITP-000003', 'dp-itp-3', ['Legacy plain-string activity, no phase key', 'Mixed B1 sighted, has its own phase'], ['A', 'B']],
];

for (const [ref, id, activities, expectedPhases] of cases) {
    console.log(`\n=== ${ref} (${id}) ===`);
    for (let i = 0; i < activities.length; i++) {
        const activity = activities[i];
        const expectedPhase = expectedPhases[i];
        try {
            await openListModalItem(full, ref, activity);
            const modalData = await readOpenPanel(full);
            await closePanel(full);

            await openDetailPageItem(full, id, activity);
            const detailData = await readOpenPanel(full);
            await closePanel(full);

            assert(modalData.phase === expectedPhase, `[${ref}] "${activity}" — list modal Phase select = ${expectedPhase} (got ${modalData.phase})`);
            assert(detailData.phase === expectedPhase, `[${ref}] "${activity}" — standalone page Phase select = ${expectedPhase} (got ${detailData.phase})`);

            const modalSorted = JSON.stringify([...modalData.textValues].sort());
            const detailSorted = JSON.stringify([...detailData.textValues].sort());
            assert(modalSorted === detailSorted,
                `[${ref}] "${activity}" — every text field (activity/standard/criteria/checkTime/method/frequency/record) has the same set of values on both entry points\n    modal=${modalSorted}\n    detail=${detailSorted}`);

            const modalSelSorted = JSON.stringify([...modalData.selectValues].sort());
            const detailSelSorted = JSON.stringify([...detailData.selectValues].sort());
            assert(modalSelSorted === detailSelSorted,
                `[${ref}] "${activity}" — all 4 VP verification-point values match on both entry points (modal=${modalSelSorted} detail=${detailSelSorted})`);
        } catch (e) {
            console.log(`FAIL (exception): [${ref}] "${activity}" — ${String(e?.message || e).split('\n')[0]}`);
            failures++;
        }
    }
}

await browser.close();
console.log(failures === 0 ? `\nALL PASSED` : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
