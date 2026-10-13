// CHECKLIST-TEMPLATE-LAYOUT-2026-001 browser check — isolated stack only (see seed_checklist_template_layout_review.py).
//   node tests-browser/checklist-template-layout-check.mjs <stack.json> <seed SEED-json file> <evidence dir>
// Password comes from CHK_LAYOUT_REVIEW_PASSWORD (never printed). Prints OBSERVED / FAIL lines; exit 1 on any FAIL.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const seed = JSON.parse(readFileSync(process.argv[3], 'utf8').replace(/^SEED /, ''));
const EVID = process.argv[4];
const PW = process.env.CHK_LAYOUT_REVIEW_PASSWORD;
if (!PW) throw new Error('CHK_LAYOUT_REVIEW_PASSWORD not set');
const UI = `http://127.0.0.1:${stack.vite_port}`;
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
let failures = 0;
const note = (name, v = '') => console.log(`OBSERVED ${name}${v !== '' ? '  -> ' + (typeof v === 'string' ? v : JSON.stringify(v)) : ''}`);
const check = (name, ok, v = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${v !== '' ? '  -> ' + (typeof v === 'string' ? v : JSON.stringify(v)) : ''}`); };

const browser = await chromium.launch({ headless: true });
async function login(user, width) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Taipei' });
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    p.on('pageerror', e => { failures++; console.log('FAIL pageerror  -> ' + e.message); });
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}

// geometry of the items table: column widths, page / table overflow, every box shown in full
const measure = p => p.evaluate(() => {
    const table = document.querySelector('table[class*=webTable]');
    const card = table.closest('[class*=cardContent]');
    const ths = [...table.querySelectorAll('thead th')].map(th => ({ text: th.textContent.trim(), w: Math.round(th.getBoundingClientRect().width) }));
    const boxes = [...table.querySelectorAll('textarea')].map(t => ({ h: t.clientHeight, sh: t.scrollHeight, w: t.clientWidth }));
    const rows = [...table.querySelectorAll('tbody tr')].map(r => Math.round(r.getBoundingClientRect().height));
    const groups = [...table.querySelectorAll('[role=radiogroup]')].map(g => {
        const td = g.closest('td'); const cs = getComputedStyle(td);
        return { g: Math.round(g.getBoundingClientRect().width), room: Math.round(td.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
    });
    const de = document.documentElement;
    return { tableW: Math.round(table.getBoundingClientRect().width), cardW: card ? card.clientWidth : null, ths, rows, boxes, groups,
             pageOverflow: de.scrollWidth - de.clientWidth, tableOverflow: card ? card.scrollWidth - card.clientWidth : null };
});

function judge(label, m, mode) {
    note(`${label} geometry`, m);
    check(`${label}: no horizontal page overflow`, m.pageOverflow <= 0, m.pageOverflow);
    check(`${label}: table fits its card`, m.tableOverflow <= 0 && m.tableW <= m.cardW + 1, { tableW: m.tableW, cardW: m.cardW });
    check(`${label}: every box shows its full text (no inner scroll)`, m.boxes.every(b => b.sh <= b.h + 1), m.boxes);
    const w = Object.fromEntries(m.ths.map(t => [t.text || 'del', t.w]));
    if (mode === 'template') {
        const item = m.ths[1].w, crit = m.ths[2].w;
        check(`${label}: Criteria wider than Item`, crit > item, { item, crit });
        check(`${label}: no result columns in template mode`, m.ths.length === 4, m.ths.map(t => t.text));
    } else {
        check(`${label}: result columns shown`, m.ths.length === 6, m.ths.map(t => t.text));
        check(`${label}: result buttons fit their column`, m.groups.every(g => g.g <= g.room), m.groups);
        check(`${label}: Actual Situation at least 140px`, m.ths[3].w >= 140, w);
    }
}

const shot = (p, name) => p.screenshot({ path: `${EVID}/${name}.png`, fullPage: true });

for (const width of [1440, 1024]) {
    const p = await login('chk_layout', width);
    // ── template, the user's route: from the ITP with returnItp ─────────────────────────────────────────────
    await p.goto(`${UI}/checklist?openId=${seed.template}&from=itp&returnItp=${seed.itp_id}`);
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    await p.waitForTimeout(600);
    judge(`template @${width}`, await measure(p), 'template');
    await shot(p, `template-${width}`);

    if (width === 1440) {
        const crit = p.locator('table[class*=webTable] tbody tr').nth(1).locator('textarea').nth(1);
        const h0 = await crit.evaluate(t => t.clientHeight);
        await crit.click(); await crit.evaluate(t => t.setSelectionRange(t.value.length, t.value.length));
        await p.keyboard.press('Enter');
        check('Enter adds no line break', !(await crit.inputValue()).includes('\n'), await crit.inputValue());
        await p.keyboard.type(' and torque wrench calibrated within 6 months, record attached to the ITR, witness by QC');
        const h1 = await crit.evaluate(t => t.clientHeight);
        check('box grows as text is typed', h1 > h0, { h0, h1 });
        await crit.evaluate(t => {
            const dt = new DataTransfer(); dt.setData('text/plain', 'line one\nline two\r\n  line three');
            t.focus(); t.setSelectionRange(t.value.length, t.value.length);
            t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        });
        await p.waitForTimeout(100);
        const pasted = await crit.inputValue();
        check('pasted line breaks become spaces', pasted.endsWith('line one line two line three') && !/[\r\n]/.test(pasted), pasted.slice(-40));
        const legacy = await p.locator('table[class*=webTable] tbody tr').nth(2).locator('textarea').nth(1).inputValue();
        check('old line break in data is kept and shown', legacy.includes('\n'), legacy);
        await shot(p, 'template-1440-edited');

        // save payload: same shape as before (items id/item/criteria with empty situation/result, status Ongoing)
        const reqP = p.waitForRequest(r => r.url().includes('/api/checklist') && ['PUT', 'PATCH'].includes(r.method()));
        await p.locator('button', { hasText: /Save Template|儲存範本/ }).click();
        const body = (await reqP).postDataJSON();
        const items = JSON.parse(body.detail_data).items;
        note('template save payload keys', { top: Object.keys(body).sort(), item: Object.keys(items[0]).sort() });
        check('template payload: status Ongoing, items carry no situation/result',
              body.status === 'Ongoing' && items.every(i => i.situation === '' && i.result === ''), { status: body.status });
        check('template payload: criteria text sent as typed (one line)', items[1].criteria === pasted, items[1].criteria);
        await p.waitForTimeout(1200);
        const dbItems = JSON.parse(sql(`SELECT detail_data FROM checklist WHERE recordsNo='${seed.template}'`)).items;
        check('saved to the database', dbItems[1].criteria === pasted && dbItems.length === 4, dbItems[1].criteria.slice(-30));

        // returnItp: back from the template reopens the ITP it was opened from
        await p.goto(`${UI}/checklist?openId=${seed.template}&from=itp&returnItp=${seed.itp_id}`);
        await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
        await p.locator('button', { hasText: /^(Cancel|取消)$/ }).first().click();
        await p.waitForURL(u => u.pathname === '/itp', { timeout: 10000 });
        check('Cancel returns to the ITP (reopenItp)', new URL(p.url()).searchParams.get('reopenItp') === seed.itp_id, p.url());
        await p.waitForTimeout(1200);
        await shot(p, 'return-to-itp-1440');
    }

    // ── result columns, case 1: an instance made from a template whose ITR link is empty (editable) ────────────
    await p.goto(`${UI}/checklist?openId=${seed.instance}`);
    await p.locator('[class*=tabButton]').nth(1).waitFor({ timeout: 15000 });
    await p.locator('[class*=tabButton]').nth(1).click();
    await p.locator('table[class*=webTable]').waitFor({ timeout: 10000 });
    await p.waitForTimeout(600);
    judge(`instance @${width}`, await measure(p), 'instance');
    await shot(p, `instance-${width}`);
    if (width === 1440) {
        const sit = p.locator('table[class*=webTable] tbody tr').nth(1).locator('textarea').nth(2);
        await sit.fill('Torque checked on 12 of 12 bolts');
        const reqP = p.waitForRequest(r => r.url().includes('/api/checklist') && ['PUT', 'PATCH'].includes(r.method()));
        await p.locator('button', { hasText: /^(Save|儲存)$/ }).click();
        const body = (await reqP).postDataJSON();
        const items = JSON.parse(body.detail_data).items;
        note('instance save payload keys', { top: Object.keys(body).sort(), item: Object.keys(items[0]).sort() });
        check('instance payload keeps situation / result values',
              items[1].situation === 'Torque checked on 12 of 12 bolts' && items[0].result === 'O' && items[2].result === 'X' && items[3].result === '/',
              items.map(i => [i.situation.slice(0, 12), i.result]));
        await p.waitForTimeout(1000);
    }

    // ── result columns, case 2: a bare template still carrying historical results (read-only) ──────────────────
    await p.goto(`${UI}/checklist?openId=${seed.historical}`);
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    await p.waitForTimeout(600);
    judge(`historical template @${width}`, await measure(p), 'instance');
    const dis = await p.evaluate(() => [...document.querySelectorAll('table[class*=webTable] textarea')].map(t => t.matches(':disabled')));
    check(`historical template @${width}: boxes read-only`, dis.length > 0 && dis.every(Boolean), dis);
    await shot(p, `historical-${width}`);
    await p.context().close();
}

// ── read-only rule: a view-only account gets every box disabled ─────────────────────────────────────────────
for (const [label, no, tab] of [['template', seed.template, false], ['instance', seed.instance, true]]) {
    const p = await login('chk_layout_view', 1440);
    await p.goto(`${UI}/checklist?openId=${no}`);
    if (tab) { await p.locator('[class*=tabButton]').nth(1).waitFor({ timeout: 15000 }); await p.locator('[class*=tabButton]').nth(1).click(); }
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    await p.waitForTimeout(500);
    const st = await p.evaluate(() => [...document.querySelectorAll('table[class*=webTable] textarea')].map(t => t.matches(':disabled')));
    check(`read-only (${label}): every box disabled`, st.length > 0 && st.every(Boolean), st);
    const m = await measure(p);
    check(`read-only (${label}): full text shown`, m.boxes.every(b => b.sh <= b.h + 1), m.boxes);
    await shot(p, `readonly-${label}-1440`);
    await p.context().close();
}

await browser.close();
console.log(failures ? `DONE with ${failures} FAIL` : 'DONE all PASS');
process.exit(failures ? 1 : 0);
