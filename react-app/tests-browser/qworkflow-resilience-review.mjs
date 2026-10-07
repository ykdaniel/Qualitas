import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = '/private/tmp/claude-501/qworkflow-resilience-review';
mkdirSync(output, { recursive: true });
const PW = 'Accept-Test-1234';
const BASE = `http://127.0.0.1:${state.vite_port}`;
const log = (...a) => console.log(new Date().toISOString(), ...a);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.setDefaultTimeout(15000);
await page.addInitScript(() => localStorage.setItem('language', 'en'));

await page.goto(`${BASE}/login`);
await page.fill('#email', 'dw_unscoped');
await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.includes('/login'));
log('LOGIN OK');

const results = {};
const projectTrigger = () => page.locator('[class*="trigger"]').first();
async function selectProject(name) {
    await projectTrigger().click();
    await page.waitForTimeout(200);
    await page.locator('[class*="dropdownItem"]', { hasText: name }).click();
}

// ══ Test 1: switch-project race ══
{
    log('=== TEST 1: project-switch race ===');
    await page.goto(`${BASE}/workflow`);
    await page.waitForTimeout(600);

    await selectProject('Dashboard Review Project 2');
    await page.waitForTimeout(800);
    log('Project 2 selected as baseline (so switching TO P1 next is a real projectId change)');

    let interceptedCount = 0;
    await page.route('**/api/workflow/**', async (route) => {
        const url = route.request().url();
        if (url.includes('project_id=DW-P1')) {
            interceptedCount++;
            await new Promise(r => setTimeout(r, 3000));
        }
        await route.continue();
    });

    // Switch to P1 (kicks off delayed requests: projectId actually changes P2->P1), then
    // switch to P2 again before the delayed P1 response resolves (P2 fetch is not delayed).
    await selectProject('Dashboard Review Project 1');
    await page.waitForTimeout(200);
    await selectProject('Dashboard Review Project 2');
    await page.waitForTimeout(1000);
    const rowCountRightAfterSwitch = await page.locator('table tbody tr').count();
    const noiTextRightAfterSwitch = await page.evaluate(() => document.body.innerText.includes('QTS-DRC-NOI-000002'));
    log('Right after switch: rows=', rowCountRightAfterSwitch, 'P2 NOI visible=', noiTextRightAfterSwitch);
    await page.screenshot({ path: `${output}/01-race-right-after-switch.png`, fullPage: true });

    await page.waitForTimeout(3000); // let the delayed P1 response land
    const rowCountAfterDelay = await page.locator('table tbody tr').count();
    const stillP2 = await page.evaluate(() => document.body.innerText.includes('QTS-DRC-NOI-000002'));
    const p1Leaked = await page.evaluate(() => document.body.innerText.includes('DW Accepted (P1)'));
    log('After delay elapsed: rows=', rowCountAfterDelay, 'still P2=', stillP2, 'P1 leaked=', p1Leaked);
    await page.screenshot({ path: `${output}/02-race-after-delay.png`, fullPage: true });

    results.raceTest = {
        interceptedOldProjectRequests: interceptedCount,
        rowCountRightAfterSwitch, noiTextRightAfterSwitch,
        rowCountAfterDelay, stillShowingP2AfterDelay: stillP2, staleP1DataLeaked: p1Leaked,
        pass: interceptedCount > 0 && stillP2 && !p1Leaked,
    };
    await page.unroute('**/api/workflow/**');
}

// ══ Test 2: load failure -> retry ══
{
    log('=== TEST 2: failure + retry ===');
    // Establish a known-good baseline on Project 1 first, so we can check nothing from it lingers.
    await selectProject('Dashboard Review Project 1');
    await page.waitForTimeout(800);
    const baselineRows = await page.locator('table tbody tr').count();
    log('Baseline P1 rows before failure test:', baselineRows);

    await page.route('**/api/workflow/**', route => route.abort('failed'));
    await selectProject('Dashboard Review Project 2');
    await page.waitForTimeout(1000);

    const errorBannerVisible = await page.locator('[class*="errorBanner"]').count();
    const rowCountDuringFailure = await page.locator('table tbody tr').count();
    const summaryCardsVisible = await page.locator('[class*="summaryGrid"]').count();
    const zeroTextShown = await page.evaluate(() => {
        const grid = document.querySelector('[class*="summaryGrid"]');
        return grid ? grid.textContent : null;
    });
    log('During failure: errorBanner=', errorBannerVisible, 'rows=', rowCountDuringFailure,
        'summaryGridPresent=', summaryCardsVisible, 'summaryGridText=', zeroTextShown);
    await page.screenshot({ path: `${output}/03-failure-state.png`, fullPage: true });

    // Clear the failure, click Retry, confirm recovery.
    await page.unroute('**/api/workflow/**');
    await page.getByRole('button', { name: /retry/i }).click();
    await page.waitForTimeout(1200);
    const errorBannerAfterRetry = await page.locator('[class*="errorBanner"]').count();
    const rowCountAfterRetry = await page.locator('table tbody tr').count();
    const noiTextAfterRetry = await page.evaluate(() => document.body.innerText.includes('QTS-DRC-NOI-000002'));
    log('After retry: errorBanner=', errorBannerAfterRetry, 'rows=', rowCountAfterRetry, 'P2 NOI visible=', noiTextAfterRetry);
    await page.screenshot({ path: `${output}/04-after-retry.png`, fullPage: true });

    results.failureRetryTest = {
        errorBannerVisibleDuringFailure: errorBannerVisible > 0,
        rowCountDuringFailure,
        summaryGridPresentDuringFailure: summaryCardsVisible > 0,
        errorBannerClearedAfterRetry: errorBannerAfterRetry === 0,
        rowCountAfterRetry,
        p2VisibleAfterRetry: noiTextAfterRetry,
        pass: errorBannerVisible > 0 && rowCountDuringFailure === 0 && summaryCardsVisible === 0
            && errorBannerAfterRetry === 0 && noiTextAfterRetry,
    };
}

// ══ Test 3: pagination failure (later page fails) ══
{
    log('=== TEST 3: pagination failure (page 2 of 2) ===');
    // DW-P2 has 202 workflow rows (page 1: skip=0 limit=200 OK, page 2: skip=200 limit=200 fails).
    await selectProject('Dashboard Review Project 2');
    await page.waitForTimeout(800);
    const fullRowCountBeforeTest = await page.locator('table tbody tr').count();
    log('Full row count (both pages succeed):', fullRowCountBeforeTest);

    await page.route('**/api/workflow/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.get('skip') === '200') {
            await route.abort('failed');
            return;
        }
        await route.continue();
    });
    // Force a reload of the data by switching away and back.
    await selectProject('Dashboard Review Project 1');
    await page.waitForTimeout(500);
    await selectProject('Dashboard Review Project 2');
    await page.waitForTimeout(1500);

    const errorBannerVisible = await page.locator('[class*="errorBanner"]').count();
    const rowCountOnPageFailure = await page.locator('table tbody tr').count();
    log('Page-2 failure: errorBanner=', errorBannerVisible, 'rows=', rowCountOnPageFailure);
    await page.screenshot({ path: `${output}/05-pagination-failure.png`, fullPage: true });

    results.paginationFailureTest = {
        fullRowCountBeforeTest,
        errorBannerVisibleOnPageFailure: errorBannerVisible > 0,
        rowCountOnPageFailure,
        pass: errorBannerVisible > 0 && rowCountOnPageFailure === 0 && fullRowCountBeforeTest > 200,
    };
    await page.unroute('**/api/workflow/**');
}

log('===== RESULTS =====');
log(JSON.stringify(results, null, 1));

await browser.close();
log('DONE');
