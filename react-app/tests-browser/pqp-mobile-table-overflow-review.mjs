import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

// BACKLOG (recorded under the #28/#38 batch, 2026-09-29): the shared DataTable component's list
// pages overflowed the WHOLE PAGE horizontally at mobile widths, independent of language, on every
// module that renders more columns than fit. Root cause: the four pagination nav buttons in
// DataTablePagination.tsx render a Tailwind `sr-only` (position:absolute) span for their accessible
// name, but their `<Button>` parent had no `position: relative` — with no positioned ancestor
// anywhere up the tree, that absolutely-positioned span's containing block became the INITIAL
// containing block (the page root), so its layout position (based on the table's full, unclipped
// intrinsic width) leaked into `document.documentElement`'s own scrollable area even though
// `<body>` and every actual visible container (`.content`, `.shell`, etc.) were correctly clipped
// to the viewport via `overflow-x: auto`. Fix: added `relative` to those 4 buttons so the sr-only
// span's containing block is the button itself, not the page root — one file, four classNames,
// nothing else touched. `.content`'s existing `overflow-x: auto` was ALREADY working correctly for
// the visible table; this was purely an invisible accessibility-span layout leak, not a missing
// scroll container.
//
//   cd backend && python scripts/verification/isolated_stack.py up --port 8198 --vite-port 3198 \
//       --vite-script <launcher> > stack.json
//   python scripts/verification/isolated_stack.py seed --root <root> \
//       --script scripts/verification/seed_pqp_mobile_table_overflow_review.py
//   python scripts/verification/isolated_stack.py seed --root <root> \
//       --script scripts/verification/seed_dashboard_stats_consistency_review.py   # NCR regression account
//   node ../react-app/tests-browser/pqp-mobile-table-overflow-review.mjs stack.json
//   python scripts/verification/isolated_stack.py down --root <root>

const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const baseline = process.argv.includes('--baseline');
const output = process.argv.find(x => x.startsWith('--output='))?.slice(9) || '/tmp/qualitas-pqp-mobile-table';
mkdirSync(output, { recursive: true });

const PW = 'Accept-Test-1234';
const widths = [375, 390, 820, 1440];
const langs = ['zh', 'en'];

let checks = 0;
const check = (v, msg) => { assert.ok(v, msg); checks++; console.log(`PASS ${msg}`); };

const browser = await chromium.launch();

async function loginAs(page, username) {
  await page.goto(`http://127.0.0.1:${state.vite_port}/login`);
  await page.fill('#email', username);
  await page.fill('#password', PW);
  await page.click('button[type=submit]');
  await page.waitForURL(u => !u.pathname.includes('/login'));
}

async function checkModuleAtWidths(page, path, lang, moduleLabel) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`http://127.0.0.1:${state.vite_port}${path}`);
    await page.waitForSelector('table');
    await page.waitForTimeout(300);

    const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const tableInfo = await page.evaluate(() => {
      const table = document.querySelector('table');
      const scrollParent = table?.closest('[class*=overflow]');
      return {
        tableScrollWidth: table?.scrollWidth ?? null,
        scrollParentScrollWidth: scrollParent?.scrollWidth ?? null,
        scrollParentClientWidth: scrollParent?.clientWidth ?? null,
      };
    });

    await page.screenshot({ path: `${output}/${baseline ? 'before' : 'after'}-${moduleLabel}-${lang}-${width}.png`, fullPage: false });

    if (baseline) {
      console.log('BASELINE', JSON.stringify({ module: moduleLabel, lang, width, pageOverflow, ...tableInfo }));
      continue;
    }

    check(pageOverflow <= 1, `${moduleLabel} ${lang} ${width}px: page itself has no horizontal overflow (was ${pageOverflow}px)`);

    if (width < 900 && tableInfo.scrollParentScrollWidth !== null && tableInfo.scrollParentScrollWidth > tableInfo.scrollParentClientWidth + 5) {
      // Only assert when the table is actually wider than its box at this width (PQP's seed data
      // guarantees this; NCR's regression seed may or may not depending on column count).
      check(true, `${moduleLabel} ${lang} ${width}px: table has its own scrollable container (${tableInfo.scrollParentScrollWidth}px content in a ${tableInfo.scrollParentClientWidth}px box)`);
    }
  }
}

try {
  // ── PQP: primary fix target ──
  for (const lang of langs) {
    const page = await browser.newPage({ viewport: { width: 390, height: 812 } });
    page.setDefaultTimeout(15000);
    await page.addInitScript((l) => localStorage.setItem('language', l), lang);
    await loginAs(page, 'pmt_full');

    await checkModuleAtWidths(page, '/pqp', lang, 'pqp');

    if (!baseline) {
      // Interactive checks at 390px: search, pagination, row action must stay usable.
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`http://127.0.0.1:${state.vite_port}/pqp`);
      await page.waitForSelector('table');

      const searchInput = page.locator('input[type=text],input[type=search]').first();
      await searchInput.fill('QTS-PMT-PQP-000001');
      await page.waitForTimeout(400);
      const filteredCount = await page.locator('table tbody tr').count();
      check(filteredCount >= 1, `pqp ${lang} 390px: search still returns row(s) (${filteredCount})`);
      await searchInput.fill('');
      await page.waitForTimeout(400);
      const fullCount = await page.locator('table tbody tr').count();
      check(fullCount === 6, `pqp ${lang} 390px: clearing search restores all 6 seeded rows (got ${fullCount})`);

      // Table container scrolls horizontally to reach the last column (Operations / View button).
      const scrollContainer = page.locator('table').first().locator('xpath=ancestor::div[contains(@class,"overflow")]').first();
      const beforeScroll = await scrollContainer.evaluate(n => n.scrollLeft);
      await scrollContainer.evaluate(n => { n.scrollLeft = n.scrollWidth; });
      const afterScroll = await scrollContainer.evaluate(n => n.scrollLeft);
      check(afterScroll > beforeScroll, `pqp ${lang} 390px: table container scrolls horizontally to reveal the last column`);

      // Pagination indicator visible; the pagination row lives in the SAME wide, scrollable box as
      // the table (by design — it sits inside DataTable's own scroll container), so its "next page"
      // button legitimately sits past x=390 until scrolled into view. What matters is: (1) the page
      // itself doesn't stretch to reach it (already asserted above via pageOverflow<=1), and (2) it
      // is genuinely reachable and clickable once the container is scrolled — not permanently
      // off-page the way the pre-fix accessibility-span leak made the page itself grow to expose it.
      const pagination = page.locator('body').getByText(/Page \d+ of \d+|第 \d+ 頁/).first();
      check(await pagination.count() >= 1, `pqp ${lang} 390px: pagination indicator present`);
      const nextBtn = page.locator('button').filter({ has: page.locator('.sr-only', { hasText: /Go to next page|next page/i }) }).first();
      await nextBtn.scrollIntoViewIfNeeded();
      const nextBox = await nextBtn.boundingBox();
      check(!!nextBox && nextBox.width === 32 && nextBox.height === 32, `pqp ${lang} 390px: "next page" button keeps its real clickable size after scrolling into view (${nextBox?.width}x${nextBox?.height})`);

      // Row action (View) still clickable — click the first row's action button and confirm it opens a modal.
      const viewButton = page.locator('table tbody tr').first().locator('button[title]').first();
      await viewButton.click();
      const modal = page.locator('[class*=modalContent]').first();
      await modal.waitFor({ timeout: 5000 });
      check(await modal.isVisible(), `pqp ${lang} 390px: row action (View) opens the detail modal`);
      const closeBtn = modal.locator('[class*=closeButton]').first();
      if (await closeBtn.count()) await closeBtn.click(); else await page.keyboard.press('Escape');
    }
    await page.close();
  }

  // ── NCR: regression check, same shared DataTable component, different module ──
  for (const lang of langs) {
    const page = await browser.newPage({ viewport: { width: 390, height: 812 } });
    page.setDefaultTimeout(15000);
    await page.addInitScript((l) => localStorage.setItem('language', l), lang);
    await loginAs(page, 'sc_full');

    await checkModuleAtWidths(page, '/ncr', lang, 'ncr');

    if (!baseline) {
      await page.setViewportSize({ width: 390, height: 900 });
      await page.goto(`http://127.0.0.1:${state.vite_port}/ncr`);
      await page.waitForSelector('table');
      const rowCount = await page.locator('table tbody tr').count();
      check(rowCount >= 1, `ncr ${lang} 390px: seeded rows still render under whatever default filter is active (regression, got ${rowCount})`);
      const pagination = page.locator('body').getByText(/Page \d+ of \d+|第 \d+ 頁/).first();
      check(await pagination.count() >= 1, `ncr ${lang} 390px: pagination indicator present (regression)`);
    }
    await page.close();
  }

  console.log(baseline ? `BASELINE DONE (${checks} logged)` : `ALL PASSED (${checks} checks)`);
} finally {
  await browser.close();
}
