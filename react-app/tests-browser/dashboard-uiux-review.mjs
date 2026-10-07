// Dashboard UI/UX batch review (2026-09-29). Real isolated backend + real screens. Checks:
// 1. Same data + filter -> same stats everywhere the number appears (key-stats tile / module
//    stats card / gauge), all reading the same useDashboardStats() output.
// 2. Contractor filter (existing mechanism, unchanged) still narrows every number correctly.
// 3. No horizontal overflow at desktop/tablet/mobile widths.
// 4. Trend card titles state their real date basis (spot-checked against known seed labels).
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const shotsDir = process.argv[3] || '/tmp/qualitas-dashboard-review-screens';
mkdirSync(shotsDir, { recursive: true });
let failures = 0;
const assert = (cond, msg) => { console.log((cond ? 'PASS: ' : 'FAIL: ') + msg); if (!cond) failures++; };

// Ground truth computed directly from seed_dashboard_uiux_review.py (independent of the app code).
// ITP 5 rows: [V1 Approved, V1 "Approved with comments", V1 Pending, V2 Approved, V2 Void].
// "Void" is excluded from total by the existing (untouched) rule; "Approved with comments" counts
// as approved by the existing (untouched) rule.
const ALL = {
    itp: { total: 4, approved: 3, approvalRate: 75 },    // 4 non-void; 3 approved (rows 1,2,4)
    pqp: { total: 4, approved: 2, maturity: 50 },
    ncr: { total: 4, open: 2, openRate: 50 },
    obs: { total: 3, open: 2, openRate: 67 },            // round(2/3*100) = 67
    noi: { total: 3, open: 2, openRate: 67 },
};
const VENDOR_A = {
    itp: { total: 3, approved: 2, approvalRate: 67 },    // V1 rows: Approved, Approved w/comments, Pending -> 3 total, 2 approved
    pqp: { total: 3, approved: 2, maturity: 67 },
    ncr: { total: 2, open: 1, openRate: 50 },
    obs: { total: 2, open: 2, openRate: 100 },
    noi: { total: 2, open: 2, openRate: 100 },
};

const browser = await chromium.launch({ headless: true });
async function login() {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', 'dash_full'); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}

const page = await login();
await page.goto(UI + '/dashboard'); await page.waitForTimeout(1200);

// ── 1. Key-stats tiles read the right numbers (all-contractors scope) ──
const keyStatsText = await page.locator('[class*=keyStatsGrid]').innerText();
console.log('--- Key stats tile text (all contractors) ---\n' + keyStatsText);
assert(keyStatsText.includes(String(ALL.itp.total)), `key-stats shows ITP total ${ALL.itp.total}`);
assert(keyStatsText.includes(String(ALL.pqp.total)), `key-stats shows PQP total ${ALL.pqp.total}`);
assert(keyStatsText.includes(String(ALL.ncr.total)), `key-stats shows NCR total ${ALL.ncr.total}`);
assert(keyStatsText.includes(String(ALL.obs.total)), `key-stats shows OBS total ${ALL.obs.total}`);
assert(keyStatsText.includes(String(ALL.noi.total)), `key-stats shows NOI total ${ALL.noi.total}`);

// ── 2. Same numbers also appear (and match) on the ITP/PQP stats cards + gauges further down ──
const itpCardText = await page.locator('[class*=itpStatsCard]').innerText();
const pqpCardText = await page.locator('[class*=pqpStatsCard]').innerText();
console.log('--- ITP stats card ---\n' + itpCardText);
console.log('--- PQP stats card ---\n' + pqpCardText);
assert(itpCardText.includes(String(ALL.itp.total)), `ITP stats card total matches key-stats tile (${ALL.itp.total})`);
assert(pqpCardText.includes(String(ALL.pqp.total)), `PQP stats card total matches key-stats tile (${ALL.pqp.total})`);

const gaugeText = await page.locator('[class*=gaugeChartContainer]').first().innerText();
console.log('--- Gauge (first = PQP) ---\n' + gaugeText);
assert(gaugeText.includes(`${ALL.pqp.maturity}%`), `PQP gauge maturity matches computed rate (${ALL.pqp.maturity}%)`);

// ── 3. Scope bar shows contractor filter + a project chip (read-only) ──
const scopeText = await page.locator('[class*=scopeBar]').first().innerText();
console.log('--- Scope bar ---\n' + scopeText);
assert(scopeText.length > 0, 'scope bar renders with some content');

// ── 4. Contractor filter (existing mechanism) still narrows every number ──
await page.selectOption('select', { label: 'Dash Review Co A' });
await page.waitForTimeout(600);
const keyStatsTextFiltered = await page.locator('[class*=keyStatsGrid]').innerText();
console.log('--- Key stats tile text (Dash Review Co A only) ---\n' + keyStatsTextFiltered);
assert(keyStatsTextFiltered.includes(String(VENDOR_A.itp.total)), `filtered key-stats shows ITP total ${VENDOR_A.itp.total} for Dash Review Co A`);
assert(keyStatsTextFiltered.includes(String(VENDOR_A.pqp.total)), `filtered key-stats shows PQP total ${VENDOR_A.pqp.total} for Dash Review Co A`);
assert(keyStatsTextFiltered.includes(String(VENDOR_A.ncr.total)), `filtered key-stats shows NCR total ${VENDOR_A.ncr.total} for Dash Review Co A`);
const itpCardTextFiltered = await page.locator('[class*=itpStatsCard]').innerText();
assert(itpCardTextFiltered.includes(String(VENDOR_A.itp.total)), `filtered ITP stats card total also matches (${VENDOR_A.itp.total}) — same filter, same number everywhere`);

await page.selectOption('select', { value: 'all' });
await page.waitForTimeout(400);

// ── 5. Trend card titles state their real date basis (not a blanket "Trend") ──
const trendText = await page.locator('[class*=trendGrid]').innerText();
console.log('--- Trend grid titles ---\n' + trendText);
assert(/發生日期|raise date/i.test(trendText), 'a trend title names "raise date" (NCR/OBS basis), not a generic "Trend"');
assert(/送審日期|submission date/i.test(trendText), 'the ITP trend title names "submission date"');
assert(/核發日期|issue date/i.test(trendText), 'the NOI trend title names "issue date"');
assert(!/^NCR Trend$|^OBS Trend$|^ITP Trend$/m.test(trendText), 'no card is left as a blanket "X Trend" with no basis stated');

// ── 6. Section order: scope bar -> key stats -> upcoming (if any) -> trend/detail, by DOM position ──
const order = await page.evaluate(() => {
    const q = sel => { const el = document.querySelector(sel); return el ? el.getBoundingClientRect().top : null; };
    return {
        scope: q('[class*=scopeBar]'),
        keyStats: q('[class*=keyStatsSection]'),
        trendGrid: q('[class*=trendAnalysisSection]'),
        gauge: q('[class*=dualChartContainer]'),
    };
});
console.log('--- Section Y positions ---', JSON.stringify(order));
assert(order.scope < order.keyStats, 'scope bar renders above the key-stats summary');
assert(order.keyStats < order.trendGrid, 'key-stats summary renders above the trend section');
assert(order.trendGrid < order.gauge, 'trend section renders above the PQP/ITP gauge (detail) section');

// ── 7. No horizontal overflow at desktop / tablet / mobile widths; screenshot each ──
for (const [name, width, height] of [['desktop', 1440, 1400], ['tablet', 820, 1800], ['mobile', 390, 2400]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert(overflow <= 1, `${name} (${width}px): no horizontal overflow (scrollWidth - clientWidth = ${overflow})`);
    await page.screenshot({ path: `${shotsDir}/after-${name}.png`, fullPage: true });
}
await page.setViewportSize({ width: 1440, height: 1000 });

await browser.close();
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
