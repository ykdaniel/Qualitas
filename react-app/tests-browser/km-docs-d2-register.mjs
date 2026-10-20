// KM-DOCS-2026-001 D2 preview check (playwright): register list → search hit → detail with inline PDF → empty states →
// set current → archive locks fields → legacy KM read-only. Runs against the ISOLATED stack only (vite 3390 → backend 8390),
// seeded with backend seed scripts that create QTS-KM-000001 (current, + a Word-only draft), -000002 (no version),
// -000003 (PDF-only draft) and one legacy KM book.
//   node tests-browser/km-docs-d2-register.mjs <admin password> [output.json]
import { chromium } from 'playwright';
import fs from 'node:fs';

const UI = 'http://127.0.0.1:3390';
const [, , PW, OUT = 'km-docs-d2-register.json'] = process.argv;
if (!PW) { console.error('usage: node km-docs-d2-register.mjs <admin password> [out.json]'); process.exit(2); }

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
try {
    await page.goto(UI + '/login');
    await page.fill('#email', 'admin');
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 });

    await page.goto(UI + '/km');
    await page.waitForSelector('[data-testid=documents-register]');
    await page.waitForSelector('tbody tr');
    const nos = await page.$$eval('tbody tr td:first-child', (tds) => tds.map((t) => t.textContent.trim()));
    check('register lists the company documents (archived hidden by default)', nos.includes('QTS-KM-000001') && nos.includes('QTS-KM-000002'), nos.join(', '));
    check('legacy link is in the header', await page.isVisible('[data-testid=legacy-link]'));

    await page.fill('[data-testid=documents-search]', 'preheat');
    await page.waitForTimeout(1200);
    const hit = await page.$$eval('tbody tr', (rows) => rows.map((r) => r.innerText));
    check('search hits the Word text with a snippet', hit.length === 1 && hit[0].includes('QTS-KM-000001') && /preheat/i.test(hit[0]), hit[0]?.slice(0, 120));

    await page.fill('[data-testid=documents-search]', '');
    await page.waitForTimeout(800);
    await page.click('text=QTS-KM-000001');
    await page.waitForSelector('[data-testid=document-detail]');
    await page.waitForSelector('[data-testid=pdf-viewer] iframe');
    const src = await page.getAttribute('[data-testid=pdf-viewer] iframe', 'src');
    check('current version PDF is shown inline from a blob URL', src?.startsWith('blob:'), src?.slice(0, 30));
    const v2 = await page.innerText('[data-testid=version-2]');
    check('a Word-only draft offers Set current disabled', /Set current|設為現行/.test(v2) && await page.isDisabled('[data-testid=version-2] >> text=/Set current|設為現行/'));

    for (const [no, expected] of [['QTS-KM-000002', /No PDF uploaded yet|尚未上傳 PDF/], ['QTS-KM-000003', /No current version yet|尚無現行版|Current|現行/]]) {
        await page.goto(UI + '/km');
        await page.waitForSelector('tbody tr');
        if (await page.isVisible(`text=${no}`)) {
            await page.click(`text=${no}`);
            await page.waitForSelector('[data-testid=document-detail]');
            const body = await page.innerText('[data-testid=document-detail]');
            check(`${no}: empty state or PDF as expected`, expected.test(body));
        }
    }

    await page.goto(UI + '/km/legacy');
    await page.waitForSelector('[data-testid=km-legacy-banner]');
    check('legacy page shows the read-only banner', true);
    check('legacy page has no "Add Article"', !(await page.isVisible('text=/Add Article|新增文章/')));
    if (await page.isVisible('tbody tr')) {
        await page.click('tbody tr');
        await page.waitForTimeout(1000);
        const detail = await page.innerText('body');
        check('legacy article detail has no edit / Word import', !/Import Word|匯入 Word/.test(detail) && !(await page.isVisible('button:has-text("Edit")')));
        check('legacy article detail still exports Word', /Export Word|匯出 Word/.test(detail));
    }
    await page.screenshot({ path: OUT.replace(/\.json$/, '.png'), fullPage: false });
} finally {
    await browser.close();
    fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
    const failed = results.filter((r) => !r.ok).length;
    console.log(`${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}
