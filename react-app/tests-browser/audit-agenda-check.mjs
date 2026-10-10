// AUDIT-AGENDA-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py then
// seed_audit_agenda_review.py). Usage: node audit-agenda-check.mjs <stack.json> <outDir>
// window.print is stubbed (counted, never opened); printouts are read from the DOM.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const result = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const browser = await chromium.launch({ headless: true });

async function login(user, language = 'zh') {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(lang => { localStorage.setItem('language', lang); window.__printed = 0; window.print = () => { window.__printed++; }; }, language);
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  return p;
}
const open = async (p, id) => { await p.goto(UI + `/audit?openId=${id}`); await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 }); };
const step = async (p, n) => { await p.locator('.max-w-4xl button').nth(n - 1).click(); await p.waitForTimeout(400); };
const rowInputs = (p, i) => p.locator('[data-agenda-row]').nth(i).locator('input');
const fillRow = async (p, i, [date, start, end, item, auditee, auditor, remarks]) => {
  const inputs = rowInputs(p, i);
  for (const [k, v] of [[0, date], [1, start], [2, end], [3, item], [4, auditee], [5, auditor], [6, remarks]]) {
    if (v !== undefined) await inputs.nth(k).fill(v);
  }
};
const api = (p, path) => p.evaluate(async u => (await fetch(u, { credentials: 'include' })).json(), path);
const printText = async (p, label) => {
  await p.locator('button', { hasText: label }).first().click(); await p.waitForTimeout(500);
  const text = await p.evaluate(() => document.querySelector('.audit-print-root')?.innerText || '');
  const rows = await p.evaluate(() => [...document.querySelectorAll('.audit-print-root .agenda-items tbody tr')].map(r => [...r.cells].map(c => c.innerText.trim())));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  return { text, rows };
};

// 1. layout: five steps, Agenda third; "Print Audit Plan" moved from step 2 to the Agenda step
{
  const p = await login('audit_full');
  await open(p, 'ahb-agenda-1');
  const labels = await p.evaluate(() => [...document.querySelectorAll('.max-w-4xl span')].map(s => s.innerText.trim()).filter(Boolean));
  result('five steps with 稽核行程 third', JSON.stringify(labels) === JSON.stringify(['專案資訊', '人員與範圍', '稽核行程', '配置查檢表', '執行與評估']), JSON.stringify(labels));
  await step(p, 2);
  const printOn2 = await p.locator('button', { hasText: /列印稽核計畫/ }).count();
  await step(p, 3);
  const printOn3 = await p.locator('button', { hasText: /列印稽核計畫/ }).count();
  const empty = await p.locator('[data-agenda-table]').innerText();
  result('print plan button only on the Agenda step; empty agenda shows the hint', printOn2 === 0 && printOn3 === 1 && /尚未安排行程/.test(empty), `${printOn2}/${printOn3}`);

  // 2. add rows (out of order); new rows continue the last row's date / end time and auditor
  await p.locator('button', { hasText: /新增一列/ }).click();
  const first = await rowInputs(p, 0).evaluateAll(els => els.map(e => e.value));
  result('a new row starts on the audit start date with the lead auditor', first[0] === '2026-10-01' && first[5] === '王稽核', JSON.stringify(first));
  await fillRow(p, 0, ['2026-10-02', '15:00', '15:30', '結束會議', '全體', undefined, '']);
  await p.locator('button', { hasText: /新增一列/ }).click();
  const second = await rowInputs(p, 1).evaluateAll(els => els.map(e => e.value));
  result('the next row continues the last row\'s date and end time', second[0] === '2026-10-02' && second[1] === '15:30', JSON.stringify(second));
  await fillRow(p, 1, ['2026-10-01', '09:00', '09:30', '起始會議', '全體', undefined, '會議室 A']);
  await p.locator('button', { hasText: /新增一列/ }).click();
  await fillRow(p, 2, ['2026-10-01', '12:00', '09:30', '8.4 外部供應管理', '採購部 / 陳', undefined, '']);  // end before start
  await p.locator('button', { hasText: /新增一列/ }).click();  // a blank row: dropped on save
  await fillRow(p, 3, ['', '', '', '', '', '', '']);

  // 3. end before start: flagged and the save refused; fixing it saves, sorted, blank row dropped
  const errorShown = await p.locator('text=結束時間早於開始時間').count();
  let writes = 0; const onReq = r => { if (/\/api\/audit\//.test(r.url()) && ['POST', 'PUT'].includes(r.method())) writes++; };
  p.on('request', onReq);
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(800);
  const toast = await p.locator('[data-sonner-toast]').last().innerText().catch(() => '');
  result('end before start: row flagged, save refused with a message, nothing sent', errorShown > 0 && writes === 0 && /結束時間早於開始時間/.test(toast), `${errorShown} ${writes} ${toast}`);
  await fillRow(p, 2, [undefined, '09:30', '12:00']);
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500);
  p.off('request', onReq);
  const saved = (await api(p, '/api/audit/ahb-agenda-1')).agenda;
  result('saved in time order, blank row dropped', JSON.stringify(saved.map(r => [r.date, r.start, r.item])) === JSON.stringify([
    ['2026-10-01', '09:00', '起始會議'], ['2026-10-01', '09:30', '8.4 外部供應管理'], ['2026-10-02', '15:00', '結束會議']]), JSON.stringify(saved));

  // the screen follows the save: re-ordered, blank row gone, and that is the saved state (no "unsaved" flag on a printout)
  const shown = await p.locator('[data-agenda-row]').evaluateAll(rows => rows.map(r => r.querySelectorAll('input')[3].value));
  const afterSave = await printText(p, /列印稽核計畫/);
  result('after Save Draft the table shows the saved order (blank row gone) and is not "unsaved"',
    JSON.stringify(shown) === JSON.stringify(['起始會議', '8.4 外部供應管理', '結束會議']) && !/含未儲存的修改/.test(afterSave.text), JSON.stringify(shown));

  // 4. a date outside the audit period: notice only, still saved
  await p.locator('button', { hasText: /新增一列/ }).click();
  await fillRow(p, 3, ['2026-10-05', '10:00', '11:00', '補充訪談', '品保部', undefined, '']);  // row 4 (index 3) now that the blank row is gone
  const notice = await p.locator('text=不在稽核期間').count();
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500);
  const saved2 = (await api(p, '/api/audit/ahb-agenda-1')).agenda;
  result('outside the audit period: notice shown, row still saved', notice > 0 && saved2.length === 4 && saved2[3].date === '2026-10-05', JSON.stringify(saved2.map(r => r.date)));
  await p.screenshot({ path: `${out}/agenda-step.png`, fullPage: true });

  // 5. reopen: rows come back in time order; plan + report printouts and Word all carry the same agenda
  await open(p, 'ahb-agenda-1'); await step(p, 3);
  const reopened = await p.locator('[data-agenda-row]').evaluateAll(rows => rows.map(r => r.querySelectorAll('input')[3].value));
  result('reopened in time order', JSON.stringify(reopened) === JSON.stringify(['起始會議', '8.4 外部供應管理', '結束會議', '補充訪談']), JSON.stringify(reopened));
  const plan = await printText(p, /列印稽核計畫/);
  await step(p, 5);
  const report = await printText(p, /列印報告/);
  const expected = [
    ['2026-10-01', '09:00–09:30', '起始會議', '全體', '王稽核', '會議室 A'],
    ['2026-10-01', '09:30–12:00', '8.4 外部供應管理', '採購部 / 陳', '王稽核', '—'],
    ['2026-10-02', '15:00–15:30', '結束會議', '全體', '王稽核', '—'],
    ['2026-10-05', '10:00–11:00', '補充訪談', '品保部', '王稽核', '—'],
  ];
  const word = await p.evaluate(async () => {
    const r = await fetch('/api/audit/ahb-agenda-1/export-docx', { credentials: 'include' });
    const bin = new Uint8Array(await r.arrayBuffer()); const dv = new DataView(bin.buffer); let off = 0, xml = '';
    while (off < bin.length - 30 && dv.getUint32(off, true) === 0x04034b50) {
      const method = dv.getUint16(off + 8, true), csize = dv.getUint32(off + 18, true), nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
      const name = new TextDecoder().decode(bin.subarray(off + 30, off + 30 + nlen)); const start = off + 30 + nlen + elen;
      if (name === 'word/document.xml') { const data = bin.subarray(start, start + csize); xml = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data); break; }
      off = start + csize;
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml'); const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const cell = c => [...c.getElementsByTagNameNS(W, 'p')].map(p => [...p.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('')).join('\n');
    const tbl = [...doc.getElementsByTagNameNS(W, 'tbl')].find(t => cell(t.getElementsByTagNameNS(W, 'tc')[0]).startsWith('日期'));
    return tbl ? [...tbl.getElementsByTagNameNS(W, 'tr')].slice(1).map(tr => [...tr.getElementsByTagNameNS(W, 'tc')].map(cell)) : null;
  });
  result('plan printout: section 4 稽核行程 with the rows in order', /4\. 稽核行程/.test(plan.text) && JSON.stringify(plan.rows) === JSON.stringify(expected), JSON.stringify(plan.rows));
  result('report printout: same agenda as section 4', /4\. 稽核行程/.test(report.text) && /5\. 查檢結果/.test(report.text) && JSON.stringify(report.rows) === JSON.stringify(expected), JSON.stringify(report.rows));
  result('Word export: the same agenda rows', JSON.stringify(word) === JSON.stringify(expected), JSON.stringify(word));
  await p.context().close();
}

// 5b. (R2) an edit made while a re-ordering Save Draft is in flight stays unsaved (R1 marked it saved and it was lost)
{
  const p = await login('audit_full');
  await p.route('**/api/audit/ahb-agenda-1', async route => {
    if (route.request().method() === 'PUT') await new Promise(r => setTimeout(r, 2500));
    await route.continue();
  });
  await open(p, 'ahb-agenda-1'); await step(p, 3);
  await p.locator('button', { hasText: /新增一列/ }).click();
  const last = (await p.locator('[data-agenda-row]').count()) - 1;
  await fillRow(p, last, ['2026-09-30', '08:00', '08:30', '事前文件審查', '品保部', undefined, '']);  // sorts to the top on save
  await p.locator('button', { hasText: /儲存草稿/ }).first().click();
  await p.waitForTimeout(300);
  await step(p, 2);
  await p.fill('input[name=location]', 'EDITED-DURING-SAVE');  // while the PUT is still held back
  await p.waitForTimeout(3500);  // the save completes
  const stored = await api(p, '/api/audit/ahb-agenda-1');
  const onScreen = await p.inputValue('input[name=location]');
  await step(p, 3);
  const plan = await printText(p, /列印稽核計畫/);
  result('edit during an in-flight save: still on screen, not in the database, flagged unsaved',
    onScreen === 'EDITED-DURING-SAVE' && stored.location !== 'EDITED-DURING-SAVE' && stored.agenda[0].item === '事前文件審查' && /含未儲存的修改/.test(plan.text),
    JSON.stringify({ onScreen, storedLocation: stored.location, firstRow: stored.agenda[0]?.item, unsavedFlag: /含未儲存的修改/.test(plan.text) }));
  // control: the same re-ordering save with no edit in between ends saved (screen re-ordered, no unsaved flag)
  await p.unroute('**/api/audit/ahb-agenda-1');
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500);
  const saved = await printText(p, /列印稽核計畫/);
  const storedAfter = await api(p, '/api/audit/ahb-agenda-1');
  result('control: saving again stores the edit and clears the unsaved flag', storedAfter.location === 'EDITED-DURING-SAVE' && !/含未儲存的修改/.test(saved.text),
    JSON.stringify({ storedLocation: storedAfter.location }));
  await p.context().close();
}

// 6. read-only: a view-only user, and a Closed audit — rows shown, inputs disabled, no add / delete
for (const [user, id, label] of [['audit_viewer', 'ahb-agenda-1', 'view-only user'], ['audit_full', 'ahb-agenda-closed-1', 'Closed audit']]) {
  const p = await login(user);
  await open(p, id); await step(p, 3);
  const state = await p.evaluate(() => ({
    rows: document.querySelectorAll('[data-agenda-row]').length,
    disabled: document.querySelector('[data-agenda-table]')?.closest('fieldset')?.disabled,
    add: [...document.querySelectorAll('button')].some(b => /新增一列/.test(b.innerText)),
    remove: document.querySelectorAll('[data-agenda-row] button').length,
    print: [...document.querySelectorAll('button')].some(b => /列印稽核計畫/.test(b.innerText)),
  }));
  result(`${label}: agenda shown read-only, no add/delete, print still available`, state.rows >= 3 && state.disabled === true && !state.add && state.remove === 0 && state.print, JSON.stringify(state));
  await p.context().close();
}

// 7. English labels
{
  const p = await login('audit_full', 'en');
  await open(p, 'ahb-agenda-closed-1'); await step(p, 3);
  const head = await p.locator('[data-agenda-table] thead').innerText();
  const title = await p.locator('h2', { hasText: 'Agenda' }).count();
  result('English: step title and column headers', title === 1 && /Date/.test(head) && /Audit Item \/ Process/.test(head) && /Auditee/.test(head), head);
  await p.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
