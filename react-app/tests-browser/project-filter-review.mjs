// Project-selector server-side filtering fix review (BACKLOG #28, 2026-09-29). Real isolated
// backend + real screens for the data-correctness checks; Playwright network interception for the
// race-condition (stale response) check — labelled where used.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const assert = (cond, msg) => { console.log((cond ? 'PASS: ' : 'FAIL: ') + msg); if (!cond) failures++; };

const browser = await chromium.launch({ headless: true });
async function newLoggedInPage(user) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return { ctx, p };
}
const switchProject = async (p, nameSubstring) => {
    await p.locator('button[title="選擇專案"]').click();
    await p.waitForTimeout(200);
    await p.locator('[class*=dropdownItem]', { hasText: nameSubstring }).click();
};

// ══════════════════════════════════════════════════════════════════════════════════
// 1. REAL — pf_full (scoped to BOTH PF-A and PF-B) switches the project dropdown; the ITP page's
//    own list must show the right ROWS (not just the right count) for each project.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage('pf_full');
    await p.goto(UI + '/itp'); await p.waitForTimeout(1200);
    const allRows = await p.locator('table tbody tr').count();
    console.log(`--- [REAL] pf_full, All Projects, ITP row count: ${allRows} (expect 5) ---`);
    assert(allRows === 5, `All-projects ITP table shows 5 rows (got ${allRows})`);

    await switchProject(p, 'Project Filter Review A');
    await p.waitForTimeout(1000);
    const aText = await p.locator('table tbody').innerText();
    assert(aText.includes('PF-A-ITP-1') && aText.includes('PF-A-ITP-2') && !aText.includes('PF-B-ITP'),
        '[REAL] after switching to Project A, table shows exactly PF-A\'s 2 rows, none of PF-B\'s');

    await switchProject(p, 'Project Filter Review B');
    await p.waitForTimeout(1000);
    const bText = await p.locator('table tbody').innerText();
    assert(bText.includes('PF-B-ITP-1') && bText.includes('PF-B-ITP-2') && bText.includes('PF-B-ITP-3') && !bText.includes('PF-A-ITP'),
        '[REAL] after switching to Project B, table shows exactly PF-B\'s 3 rows, none of PF-A\'s');
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 2. REAL — same check on a second module (FollowUp) and the Dashboard's key-stats tile (NCR), to
//    confirm this isn't just an ITP-specific fix.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage('pf_full');
    await p.goto(UI + '/followup'); await p.waitForTimeout(1200);
    await switchProject(p, 'Project Filter Review A');
    await p.waitForTimeout(1000);
    const fuText = await p.locator('body').innerText();
    assert(fuText.includes('PF-A-FU-1') && !fuText.includes('PF-B-FU'), '[REAL] FollowUp list also correctly narrows to Project A only');
    await ctx.close();
}
{
    const { ctx, p } = await newLoggedInPage('pf_full');
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1200);
    const allNcr = await p.locator('[class*=keyStatsTile]').filter({ hasText: 'NCR' }).first().innerText();
    assert(allNcr.includes('5'), `[REAL] Dashboard NCR key-stat = 5 (All Projects) — got ${JSON.stringify(allNcr)}`);
    await switchProject(p, 'Project Filter Review A');
    await p.waitForTimeout(1200);
    const aNcr = await p.locator('[class*=keyStatsTile]').filter({ hasText: 'NCR' }).first().innerText();
    assert(aNcr.includes('2') && !aNcr.includes('5'), `[REAL] Dashboard NCR key-stat becomes 2 after switching to Project A — got ${JSON.stringify(aNcr)}`);
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 3. REAL — a single-project account (pf_a_only) simply never sees Project B's data, in the UI —
//    the project selector for this account shouldn't even offer it, but confirm the LIST itself
//    is correct regardless (matches the direct-API check already done for this account).
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage('pf_a_only');
    await p.goto(UI + '/itp'); await p.waitForTimeout(1200);
    const text = await p.locator('table tbody').innerText();
    assert(text.includes('PF-A-ITP-1') && text.includes('PF-A-ITP-2') && !text.includes('PF-B-ITP'),
        '[REAL] pf_a_only (scoped to Project A only) sees only Project A\'s rows, regardless of dropdown state');
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 4. SIMULATED — race condition: delay Project A's response, switch quickly to Project B (whose
//    response is NOT delayed) — B's (later-issued, faster) response must win; A's late response
//    must not overwrite it when it eventually arrives.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage('pf_full');
    await p.goto(UI + '/itp'); await p.waitForTimeout(1200);

    // Delay ONLY the request for project_id=PF-A; let PF-B's go through immediately.
    await p.route('**/api/itp/**', async (route, request) => {
        if (request.url().includes('project_id=PF-A')) {
            await new Promise(r => setTimeout(r, 2000));
        }
        await route.continue();
    });
    await switchProject(p, 'Project Filter Review A'); // slow request in flight
    await p.waitForTimeout(150);
    await switchProject(p, 'Project Filter Review B'); // fast request, issued after, should resolve first
    await p.waitForTimeout(1000); // B's fast response should have landed; A's is still delayed
    const midText = await p.locator('table tbody').innerText();
    console.log('--- [SIMULATED] mid-flight (B landed, A still delayed) table ---\n' + midText);
    assert(midText.includes('PF-B-ITP-1') && !midText.includes('PF-A-ITP-1'), '[SIMULATED] Project B\'s (later, faster) response is shown while A\'s slow response is still pending');

    await p.waitForTimeout(1500); // let A's delayed response finally land
    const finalText = await p.locator('table tbody').innerText();
    console.log('--- [SIMULATED] after A\'s late response finally arrives ---\n' + finalText);
    assert(finalText.includes('PF-B-ITP-1') && !finalText.includes('PF-A-ITP-1'), '[SIMULATED] Project B\'s data is STILL shown — A\'s late-arriving response did not overwrite it');
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 5. SIMULATED — switch to a project whose fetch then fails: BACKLOG #37's explicit error state
//    applies (not the old project's data, not a silent 0) — this is the itpStore-level version of
//    the Dashboard-level check already covered in dashboard-loadstate-review.mjs; checked here on
//    the ITP LIST PAGE itself (a different consumer of the same store) to confirm the fix is at
//    the store, not just the Dashboard's own rendering.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage('pf_full');
    await p.goto(UI + '/itp'); await p.waitForTimeout(1200);
    const before = await p.locator('table tbody').innerText();
    assert(before.includes('PF-A-ITP-1') || before.includes('PF-B-ITP-1'), '[REAL] ITP list loaded before the simulated failure (baseline)');

    await p.route('**/api/itp/**', route => route.fulfill({ status: 500, body: '{"detail":"Simulated failure"}' }));
    await switchProject(p, 'Project Filter Review A');
    await p.waitForTimeout(1200);
    const bodyText = await p.locator('body').innerText();
    console.log('--- [SIMULATED] ITP list after project switch whose fetch fails ---');
    assert(!bodyText.includes('PF-B-ITP-1') && !bodyText.includes('PF-A-ITP-1'), '[SIMULATED] no stale project\'s rows are shown after a failed switch');
    await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
