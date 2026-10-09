// Dashboard load-state fix review (BACKLOG #37, 2026-09-29). Real isolated backend + real screens
// for the "normal" scenarios; Playwright network interception (page.route) for the "delayed
// response" / "simulated failure" / "retry recovery" scenarios — each section below is labelled
// REAL or SIMULATED so the two kinds of evidence are never conflated.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const assert = (cond, msg) => { console.log((cond ? 'PASS: ' : 'FAIL: ') + msg); if (!cond) failures++; };

const browser = await chromium.launch({ headless: true });
async function newLoggedInPage(user = 'ls_full') {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return { ctx, p };
}

const keyStatsTile = (p, labelZh) => p.locator('[class*=keyStatsTile]').filter({ hasText: labelZh }).first();
// PQP/ITP moved out of the key-stats grid into their own consolidated ApprovalSummaryCard
// (2026-09-29 Dashboard simplification batch) — NCR/OBS/NOI are unaffected and still use
// keyStatsTile above. Same #37 status wiring either way (loading/error-empty/error-stale/ok).
const approvalCard = (p, labelZh) => p.locator('[class*=approvalSummaryCard]').filter({ hasText: labelZh }).first();
const switchProject = async (p, nameSubstring) => {
    await p.locator('button[title="選擇專案"]').click();
    await p.locator('[class*=dropdownItem]', { hasText: nameSubstring }).click();
    await p.waitForTimeout(200);
};

// ══════════════════════════════════════════════════════════════════════════════════
// 1. REAL — normal load, "All Projects" scope: LS-P1 (PQP 2/ITP 1/NCR 0) + LS-P2
//    (PQP 5/ITP 3/NCR 2) combined = PQP 7, ITP 4, NCR 2. Confirms the status wrapper added this
//    round does not change any number from what the underlying stores actually hold.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage();
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1500);
    const pqpText = await approvalCard(p, 'PQP').innerText();
    const itpText = await approvalCard(p, 'ITP').innerText();
    const ncrText = await keyStatsTile(p, 'NCR').innerText();
    console.log('--- [REAL] All-projects key stats ---\nPQP: ' + pqpText + '\nITP: ' + itpText + '\nNCR: ' + ncrText);
    assert(pqpText.includes('7'), '[REAL] PQP total = 7 (2 from LS-P1 + 5 from LS-P2), not 0/loading/error');
    assert(itpText.includes('4'), '[REAL] ITP total = 4 (1 + 3)');
    assert(ncrText.includes('2'), '[REAL] NCR total = 2 (0 + 2)');
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 2. REAL — a SEPARATE session logged in as ls_p1_only (scoped to LS-P1 ONLY, via the existing
//    backend `UserProject`/`apply_scope` mechanism — already covered by the P0 isolation tests
//    referenced in BACKLOG.md, not re-proven here). Confirms NCR's REAL, genuine zero for that
//    scope reads as "0" (an 'ok' status), never mistaken for loading/error, and PQP/ITP show
//    LS-P1's own numbers (2 / 1), not ls_full's combined 7 / 4.
//
//    NOTE — found THIS round, not assumed: the project-selector DROPDOWN itself does not filter
//    these lists server-side for any account that can see more than one project (routers/itp.py,
//    pqp.py, ncr.py, obs.py, noi.py's list endpoints do not even declare a `project_id` query
//    parameter — confirmed by comparing the response body byte-for-byte with and without
//    `?project_id=LS-P1` on ls_full's own session: identical, both 7 PQP rows). This is the same
//    gap BACKLOG #28 already flagged as "not verifiable, only one project existed" — now
//    confirmed with a real second project and updated accordingly. Out of scope for THIS batch
//    (BACKLOG #37 is about load-STATE presentation, not data-scope filtering) — not fixed here.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage('ls_p1_only');
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1500);
    const pqpText = await approvalCard(p, 'PQP').innerText();
    const itpText = await approvalCard(p, 'ITP').innerText();
    const ncrText = await keyStatsTile(p, 'NCR').innerText();
    console.log('--- [REAL] ls_p1_only (scoped to LS-P1 only) key stats ---\nPQP: ' + pqpText + '\nITP: ' + itpText + '\nNCR: ' + ncrText);
    assert(pqpText.includes('2') && !pqpText.includes('7'), '[REAL] ls_p1_only sees PQP = 2 (LS-P1 only, backend-scope-enforced), not 7 (ls_full\'s combined total)');
    assert(itpText.includes('1') && !itpText.includes('4'), '[REAL] ls_p1_only sees ITP = 1 (LS-P1 only), not 4');
    assert(ncrText.split('\n').some(line => line.trim() === '0'), `[REAL] NCR reads a genuine 0 for LS-P1 (not "loading"/"could not load") — got: ${JSON.stringify(ncrText)}`);
    assert(!/載入中|無法載入/.test(ncrText), '[REAL] the real zero for NCR is NOT rendered as a loading or error state');
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 3. SIMULATED — delayed response: intercept /api/pqp/ with a 2.5s artificial delay on a FRESH
//    page load. Checked WHILE the delay is still in flight (before the 2.5s elapses).
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage();
    await p.route('**/api/pqp/**', async route => {
        await new Promise(r => setTimeout(r, 2500));
        await route.continue();
    });
    await p.goto(UI + '/dashboard');
    await p.waitForTimeout(600); // well inside the 2.5s delay window
    const pqpTileDuringDelay = await approvalCard(p, 'PQP').innerText();
    console.log('--- [SIMULATED: delayed /api/pqp/] mid-flight tile text ---\n' + pqpTileDuringDelay);
    assert(!pqpTileDuringDelay.includes('7') && !/\b0\b/.test(pqpTileDuringDelay.replace(/PQP/g, '')),
        `[SIMULATED] while the PQP request is still in flight, the tile shows neither the eventual "7" nor a premature "0" — got: ${JSON.stringify(pqpTileDuringDelay)}`);
    assert(/載入中/.test(pqpTileDuringDelay), `[SIMULATED] the tile explicitly says "loading" while in flight — got: ${JSON.stringify(pqpTileDuringDelay)}`);
    await p.waitForTimeout(2200); // let the delayed response land
    const pqpTileAfter = await approvalCard(p, 'PQP').innerText();
    assert(pqpTileAfter.includes('7'), `[SIMULATED] once the delayed response lands, PQP shows the real "7" — got: ${JSON.stringify(pqpTileAfter)}`);
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 4. SIMULATED — failure with NO prior data (fresh session): /api/ncr/ always 500.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage();
    await p.route('**/api/ncr/**', route => route.fulfill({ status: 500, body: '{"detail":"Simulated failure"}' }));
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1200);
    const ncrTile = await keyStatsTile(p, 'NCR').innerText();
    console.log('--- [SIMULATED: /api/ncr/ always 500, no prior data] ---\n' + ncrTile);
    assert(!/\b0\b/.test(ncrTile.replace(/NCR/g, '')), `[SIMULATED] NCR total is NOT shown as 0 when the load failed with nothing cached — got: ${JSON.stringify(ncrTile)}`);
    assert(/無法載入/.test(ncrTile), '[SIMULATED] NCR tile shows the "could not load" message');
    assert(await keyStatsTile(p, 'NCR').locator('button', { hasText: '重試' }).count() > 0, '[SIMULATED] NCR tile has a working Retry button');

    // 5b. Other modules (not intercepted) are NOT blocked by NCR's failure — same page load.
    const pqpTile = await approvalCard(p, 'PQP').innerText();
    assert(pqpTile.includes('7'), `[SIMULATED] PQP (not intercepted) still loads normally on the same page while NCR fails — got: ${JSON.stringify(pqpTile)}`);
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 5. SIMULATED -> REAL recovery: an error-empty module (from scenario 4) recovers cleanly once
//    the interception is removed and its own Retry button is clicked — a manual, one-shot
//    re-fetch (the store's existing fetchXxx()), not an automatic retry loop.
//
//    NOTE on 'error-stale' (failed reload that still shows OLD data, flagged): this needs a
//    module that (a) already loaded successfully, THEN (b) is re-fetched WHILE STAYING ON THE
//    SAME scope, and that second fetch fails. Today's Dashboard has no UI affordance to trigger
//    (b) on its own — the only thing that re-fetches an already-`ok` module is a project-scope
//    change (AppProviders.tsx), which this hook deliberately does NOT treat as "same scope" (see
//    scenario 6). A full page reload would exercise it, but a reload also wipes the in-memory
//    zustand store, so there would BE no stale data to keep — that is not the same situation and
//    was rejected as a false test after actually trying it live. `deriveModuleStatus`'s
//    'error-stale' branch is instead verified directly, as the exact function used here, in
//    tests-unit/dashboardModuleStatus.test.ts.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage();
    await p.route('**/api/pqp/**', route => route.fulfill({ status: 500, body: '{"detail":"Simulated failure"}' }));
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1200);
    const beforeText = await approvalCard(p, 'PQP').innerText();
    assert(/無法載入/.test(beforeText), `[SIMULATED] PQP starts in error-empty (baseline for this recovery check) — got: ${JSON.stringify(beforeText)}`);

    await p.unroute('**/api/pqp/**');
    await approvalCard(p, 'PQP').locator('button', { hasText: '重試' }).click();
    await p.waitForTimeout(1200);
    const recoveredText = await approvalCard(p, 'PQP').innerText();
    console.log('--- [SIMULATED->REAL] PQP after Retry succeeds ---\n' + recoveredText);
    assert(recoveredText.includes('7') && !/無法載入/.test(recoveredText), `[SIMULATED->REAL] after Retry succeeds, PQP reads the real "7", no error text left — got: ${JSON.stringify(recoveredText)}`);
    await ctx.close();
}

// ══════════════════════════════════════════════════════════════════════════════════
// 6. SIMULATED — scope switch whose re-fetch fails: must NOT show the previous scope's numbers,
//    even flagged as stale. This is the specific gap a naive "error+hasData=stale" rule would miss.
// ══════════════════════════════════════════════════════════════════════════════════
{
    const { ctx, p } = await newLoggedInPage();
    await p.goto(UI + '/dashboard'); await p.waitForTimeout(1500);
    const allProjectsText = await approvalCard(p, 'PQP').innerText();
    assert(allProjectsText.includes('7'), '[REAL] baseline: All-projects PQP = 7 before switching');

    await p.route('**/api/pqp/**', route => route.fulfill({ status: 500, body: '{"detail":"Simulated failure"}' }));
    await switchProject(p, 'Load-State Review P1');
    await p.waitForTimeout(1200);
    const afterFailedSwitch = await approvalCard(p, 'PQP').innerText();
    console.log('--- [SIMULATED: /api/pqp/ fails during a project switch] ---\n' + afterFailedSwitch);
    assert(!afterFailedSwitch.includes('7'), `[SIMULATED] the OLD scope's "7" is not shown after switching scope even though the fetch for the new scope failed — got: ${JSON.stringify(afterFailedSwitch)}`);
    assert(/無法載入/.test(afterFailedSwitch), '[SIMULATED] shows "could not load" (error-empty), not a flagged-stale "7" from the wrong scope');
    await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
