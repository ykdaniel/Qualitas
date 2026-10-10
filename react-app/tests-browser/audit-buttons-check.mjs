// AUDIT-BUTTONS-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py,
// seed_audit_export_docx_review.py, seed_audit_agenda_review.py). Usage: node audit-buttons-check.mjs <stack.json> <outDir>
// window.print is stubbed (counted, never opened); Word downloads are saved to <outDir>.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const result = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const browser = await chromium.launch({ headless: true });

async function login(user, language = 'zh', width = 1400) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(lang => { localStorage.setItem('language', lang); window.__printed = 0; window.print = () => { window.__printed++; }; }, language);
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  return p;
}
const open = async (p, id) => { await p.goto(UI + `/audit?openId=${id}`); await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 }); };
const step = async (p, n) => { await p.locator('.max-w-4xl button').nth(n - 1).click(); await p.waitForTimeout(400); };
// buttons of the footer's left group (FormActions tools) and of the step card (everything inside the form above the footer)
const layout = p => p.evaluate(() => {
  const bar = document.querySelector('[data-form-actions]');
  const tools = bar?.firstElementChild?.matches('div') && bar.children.length > 1 ? bar.firstElementChild : null;
  const texts = el => el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [];
  const card = [...document.querySelectorAll('form button')].filter(b => !bar.contains(b)).map(b => b.innerText.trim())
    .filter(t => /列印|匯出 Word|Print|Export Word/.test(t));
  const icons = tools ? [...tools.querySelectorAll('button')].filter(b => /列印|匯出 Word|Print|Export Word/.test(b.innerText)).map(b => !!b.querySelector('svg')) : [];
  return { tools: texts(tools), card, icons };
});

// 1. full user on a saved audit: per step, the step's print + Word in the footer's left group, nothing in the card
{
  const p = await login('audit_full');
  await open(p, 'ahb-export-1');
  const expected = {
    1: [], 2: [],
    3: ['列印稽核計畫', '匯出 Word'], 4: ['列印查檢表', '匯出 Word'], 5: ['列印報告', '匯出 Word'],
  };
  for (const n of [1, 2, 3, 4, 5]) {
    await step(p, n);
    const l = await layout(p);
    const docButtons = l.tools.filter(t => /列印|匯出 Word/.test(t));
    result(`step ${n}: footer left = ${JSON.stringify(expected[n])}, none in the card, icons on all`,
      JSON.stringify(docButtons) === JSON.stringify(expected[n]) && l.card.length === 0 && l.icons.every(Boolean)
      && (n === 1 || l.tools[0].includes('上一步')), JSON.stringify(l));
    if (n >= 3) await p.screenshot({ path: `${out}/step${n}-footer.png`, fullPage: false });
  }

  // 2. each print button prints its own printout
  for (const [n, kind] of [[3, 'plan'], [4, 'checklist'], [5, 'report']]) {
    await step(p, n);
    const before = await p.evaluate(() => window.__printed);
    await p.locator(`[data-step-print=${kind}]`).click(); await p.waitForTimeout(500);
    const got = await p.evaluate(() => ({ printed: window.__printed, kind: document.querySelector('.audit-print-root')?.dataset.printKind }));
    await p.evaluate(() => dispatchEvent(new Event('afterprint')));
    result(`step ${n}: footer print button prints the ${kind}`, got.printed === before + 1 && got.kind === kind, JSON.stringify(got));
  }

  // 3. each Word button downloads that step's document (?kind=…, file name, title inside the docx)
  for (const [n, kind, file, title] of [[3, 'plan', 'AHB-EXPORT-1-Plan.docx', '內部稽核計畫'], [4, 'checklist', 'AHB-EXPORT-1-Checklist.docx', '稽核查檢表'],
    [5, 'report', 'AHB-EXPORT-1.docx', '內部稽核報告']]) {
    await step(p, n);
    let url = '';
    const onReq = r => { if (/export-docx/.test(r.url())) url = r.url(); };
    p.on('request', onReq);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.locator(`[data-step-word=${kind}]`).click()]);
    p.off('request', onReq);
    const path = `${out}/${dl.suggestedFilename()}`; await dl.saveAs(path);
    const zip = readFileSync(path).subarray(0, 2).toString() === 'PK';
    const docTitle = await p.evaluate(async k => {
      const r = await fetch(`/api/audit/ahb-export-1/export-docx?kind=${k}`, { credentials: 'include' });
      const bin = new Uint8Array(await r.arrayBuffer()); const dv = new DataView(bin.buffer); let off = 0, xml = '';
      while (off < bin.length - 30 && dv.getUint32(off, true) === 0x04034b50) {
        const method = dv.getUint16(off + 8, true), csize = dv.getUint32(off + 18, true), nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
        const name = new TextDecoder().decode(bin.subarray(off + 30, off + 30 + nlen)); const start = off + 30 + nlen + elen;
        if (name === 'word/document.xml') { const data = bin.subarray(start, start + csize); xml = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data); break; }
        off = start + csize;
      }
      return (xml.match(/(內部稽核報告|內部稽核計畫|稽核查檢表)/) || [])[1];
    }, kind);
    result(`step ${n}: Word = ${file} (kind=${kind}, "${title}")`, dl.suggestedFilename() === file && new URL(url).searchParams.get('kind') === kind && zip && docTitle === title,
      JSON.stringify({ file: dl.suggestedFilename(), kind: url && new URL(url).searchParams.get('kind'), zip, docTitle }));
  }
  await p.context().close();
}

// 4. a new audit: print buttons there, Word only after the first Save Draft
{
  const p = await login('audit_full');
  await p.goto(UI + '/audit'); await p.waitForSelector('table tbody tr', { timeout: 15000 });
  await p.locator('button', { hasText: /新增|Add/ }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await step(p, 3);
  const before = await layout(p);
  await step(p, 1);
  await p.fill('input[name=auditTitle]', 'buttons check new');
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500);
  await step(p, 3);
  const after = await layout(p);
  result('new audit: print shown, Word only after the first Save Draft',
    JSON.stringify(before.tools.filter(t => /列印|匯出/.test(t))) === '["列印稽核計畫"]' && JSON.stringify(after.tools.filter(t => /列印|匯出/.test(t))) === '["列印稽核計畫","匯出 Word"]',
    JSON.stringify({ before: before.tools, after: after.tools }));
  await p.context().close();
}

// 5. read-only users keep both (view-only user; Closed audit); English labels; phone width keeps the footer inside
{
  const p = await login('audit_viewer');
  await open(p, 'ahb-agenda-closed-1'); await step(p, 5);
  const l = await layout(p);
  result('view-only user on a Closed audit: print + Word in the footer', JSON.stringify(l.tools.filter(t => /列印|匯出/.test(t))) === '["列印報告","匯出 Word"]', JSON.stringify(l.tools));
  await p.context().close();
  const q = await login('audit_full', 'en');
  await open(q, 'ahb-export-1'); await step(q, 3);
  const en = await layout(q);
  const title = await q.locator('h2', { hasText: 'Audit Plan' }).count();
  result('English: step 3 "Audit Plan", footer Print Audit Plan + Export Word', title === 1 && JSON.stringify(en.tools.filter(t => /Print|Export/.test(t))) === '["Print Audit Plan","Export Word"]', JSON.stringify(en.tools));
  await q.context().close();
  const m = await login('audit_full', 'zh', 390);
  await open(m, 'ahb-export-1'); await step(m, 5);
  const fit = await m.evaluate(() => {
    const overlay = document.querySelector('[data-form-actions]').closest('.fixed');
    const outside = [...document.querySelectorAll('[data-form-actions] button')].filter(b => { const r = b.getBoundingClientRect(); return r.left < 0 || r.right > window.innerWidth; }).length;
    return { overlayOverflow: overlay.scrollWidth - overlay.clientWidth, outside };
  });
  result('phone 390: footer buttons inside the screen, no overflow', fit.overlayOverflow <= 0 && fit.outside === 0, JSON.stringify(fit));
  await m.screenshot({ path: `${out}/phone-step5.png`, fullPage: true });
  await m.context().close();
}

// 7. Lunch Time default: the first row of a new day brings a grey 12:00-13:00 "Lunch Time" row, stored, editable,
//    deletable, not re-added for a day that has rows, not inserted into existing agendas; printouts and Word shade it
{
  const p = await login('audit_full');
  const rowsNow = () => p.locator('[data-agenda-row]').evaluateAll(rows => rows.map(r => {
    const v = [...r.querySelectorAll('input')].map(i => i.value);
    return { kind: r.dataset.agendaKind, date: v[0], start: v[1], end: v[2], item: v[3], grey: getComputedStyle(r).backgroundColor };
  }));
  // like a user, leave the date field after setting it (Playwright's fill() on a date input does not blur it)
  const fill = async (i, values) => {
    const inputs = p.locator('[data-agenda-row]').nth(i).locator('input');
    for (const [k, v] of values) { await inputs.nth(k).fill(v); if (k === 0) { await inputs.nth(k).focus(); await inputs.nth(k).blur(); } }
  };
  await open(p, 'ahb-agenda-closed-1'); await step(p, 3);
  const old = await rowsNow();
  result('an existing agenda gets no lunch row on its own', old.length === 3 && old.every(r => r.kind === 'session'), JSON.stringify(old.map(r => r.kind)));
  await open(p, 'ahb-agenda-1'); await step(p, 3);
  await p.locator('button', { hasText: /新增一列/ }).click();
  const a = await rowsNow();
  result('first row of a day adds a grey 12:00-13:00 "Lunch Time" row for that day',
    a.length === 2 && a[1].kind === 'lunch' && a[1].date === '2026-10-01' && a[1].start === '12:00' && a[1].end === '13:00' && a[1].item === 'Lunch Time'
    && a[1].grey !== a[0].grey, JSON.stringify(a));
  await fill(0, [[1, '09:00'], [2, '11:30'], [3, '文件審查']]);
  await p.locator('button', { hasText: /新增一列/ }).click();  // continues 10/01 (from the lunch row): no second lunch
  const b = await rowsNow();
  result('another row on the same day: no second lunch', b.filter(r => r.kind === 'lunch').length === 1 && b[2].date === '2026-10-01' && b[2].start === '13:00', JSON.stringify(b));
  await fill(2, [[0, '2026-10-02'], [1, '09:00'], [2, '10:00'], [3, '現場查核']]);  // moved to a new day
  const c = await rowsNow();
  result('moving a row to a new day adds that day\'s lunch', c.filter(r => r.kind === 'lunch').map(r => r.date).join() === '2026-10-01,2026-10-02', JSON.stringify(c));
  await p.locator('[data-agenda-row][data-agenda-kind=lunch]').nth(1).locator('button').click();  // delete 10/02 lunch
  await p.locator('button', { hasText: /新增一列/ }).click();
  const d = await rowsNow();
  result('a deleted lunch is not added back for a day that has rows', d.filter(r => r.kind === 'lunch').map(r => r.date).join() === '2026-10-01', JSON.stringify(d));
  await fill(d.length - 1, [[1, '10:00'], [2, '11:00'], [3, '訪談']]);
  const lunchIdx = d.findIndex(r => r.kind === 'lunch');
  await fill(lunchIdx, [[1, '12:30'], [2, '13:30'], [3, 'Lunch (late)']]);  // editable
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500);
  const stored = (await p.evaluate(async () => (await (await fetch('/api/audit/ahb-agenda-1', { credentials: 'include' })).json()).agenda));
  result('stored: one lunch (kind lunch, edited), sorted with the sessions', JSON.stringify(stored.map(r => [r.kind, r.date, r.start, r.item])) === JSON.stringify([
    ['', '2026-10-01', '09:00', '文件審查'], ['lunch', '2026-10-01', '12:30', 'Lunch (late)'], ['', '2026-10-02', '09:00', '現場查核'], ['', '2026-10-02', '10:00', '訪談']]),
    JSON.stringify(stored));
  await p.locator('[data-step-print=plan]').click(); await p.waitForTimeout(500);
  const printed = await p.evaluate(() => [...document.querySelectorAll('.audit-print-root .agenda-items tbody tr')].map(r => ({ lunch: r.classList.contains('lunch'), bg: getComputedStyle(r.cells[0]).backgroundColor })));
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  const wordFill = await p.evaluate(async () => {
    const r = await fetch('/api/audit/ahb-agenda-1/export-docx?kind=plan', { credentials: 'include' });
    const bin = new Uint8Array(await r.arrayBuffer()); const dv = new DataView(bin.buffer); let off = 0, xml = '';
    while (off < bin.length - 30 && dv.getUint32(off, true) === 0x04034b50) {
      const method = dv.getUint16(off + 8, true), csize = dv.getUint32(off + 18, true), nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
      const name = new TextDecoder().decode(bin.subarray(off + 30, off + 30 + nlen)); const start = off + 30 + nlen + elen;
      if (name === 'word/document.xml') { const data = bin.subarray(start, start + csize); xml = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data); break; }
      off = start + csize;
    }
    const doc = new DOMParser().parseFromString(xml, 'application/xml'); const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const text = c => [...c.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('');
    const tbl = [...doc.getElementsByTagNameNS(W, 'tbl')].find(t => text(t.getElementsByTagNameNS(W, 'tc')[0]).startsWith('日期'));
    return [...tbl.getElementsByTagNameNS(W, 'tr')].slice(1).map(tr => { const tc = tr.getElementsByTagNameNS(W, 'tc')[0]; const shd = tc.getElementsByTagNameNS(W, 'shd')[0]; return shd ? shd.getAttributeNS(W, 'fill') : null; });
  });
  result('plan printout and Word shade only the lunch row', JSON.stringify(printed.map(r => r.lunch)) === '[false,true,false,false]' && printed[1].bg !== printed[0].bg
    && JSON.stringify(wordFill) === JSON.stringify([null, 'E5E7EB', null, null]), JSON.stringify({ printed, wordFill }));
  await p.screenshot({ path: `${out}/lunch-step3.png`, fullPage: true });
  await p.context().close();
}

// 7b. (R2/R3) typing a date (every keystroke an intermediate date) or stepping it with arrow keys leaves exactly one lunch,
//     for the current day, already while the field still has focus; a day's untouched default lunch goes with its last
//     session, an edited one stays
{
  const p = await login('audit_full');
  await p.goto(UI + '/audit'); await p.waitForSelector('table tbody tr', { timeout: 15000 });
  await p.locator('button', { hasText: /新增|Add/ }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await step(p, 3);
  await p.locator('button', { hasText: /新增一列/ }).click();  // a new audit has no start date: a row without a date, no lunch
  const lunches = () => p.locator('[data-agenda-row][data-agenda-kind=lunch]').evaluateAll(rows => rows.map(r => [...r.querySelectorAll('input')].map(i => i.value)));
  const sessionDate = () => p.locator('[data-agenda-row][data-agenda-kind=session] input[type=date]').first().inputValue();
  const dateInput = p.locator('[data-agenda-row][data-agenda-kind=session] input[type=date]').first();
  const noLunchYet = (await lunches()).length;
  await dateInput.click({ position: { x: 12, y: 10 } });  // month segment
  await p.keyboard.type('10012026', { delay: 40 });        // 1, 10, 10/0, 10/01, … every keystroke an intermediate value
  const inField = await lunches();                         // the field still has focus
  await p.locator('[data-agenda-row][data-agenda-kind=session] input').nth(3).click();  // leave the date field (click the item field)
  const typed = await lunches();
  result('keyboard-typed date: one lunch for the final day while still in the field, nothing left by the intermediate dates, unchanged on leaving',
    noLunchYet === 0 && JSON.stringify(inField) === JSON.stringify(typed) && typed.length === 1 && typed[0][0] === '2026-10-01' && await sessionDate() === '2026-10-01',
    JSON.stringify({ noLunchYet, inField, typed }));
  await dateInput.click({ position: { x: 12, y: 10 } });
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');  // two steps (Oct -> Dec)
  await p.locator('[data-agenda-row][data-agenda-kind=session] input').nth(3).click();  // leave the date field (click the item field)
  const arrowed = await lunches(); const d1 = await sessionDate();
  result('arrow keys: one lunch, for the final day; the left day\'s untouched default lunch is removed with its only session',
    arrowed.length === 1 && arrowed[0][0] === d1 && d1 !== '2026-10-01', JSON.stringify({ d1, arrowed }));
  // an edited lunch stays when its day's last session moves away
  await p.locator('[data-agenda-row][data-agenda-kind=lunch] input').nth(6).fill('keep');  // remarks
  await dateInput.click({ position: { x: 12, y: 10 } });
  await p.keyboard.type('11152026', { delay: 40 });
  await p.locator('[data-agenda-row][data-agenda-kind=session] input').nth(3).click();  // leave the date field (click the item field)
  const kept = await lunches(); const d2 = await sessionDate();
  result('an edited lunch stays when its day\'s last session moves; the new day gets its own lunch',
    d2 === '2026-11-15' && kept.length === 2 && kept.some(l => l[0] === d1 && l[6] === 'keep') && kept.some(l => l[0] === d2), JSON.stringify({ d2, kept }));
  await p.context().close();
}

// 7c. (R3) straight from the date field onto a button below: the table does not grow on leaving the field, so the same
//     click lands — Save Draft saves on the first click (footer not yet at the bottom), Add row adds a row
{
  const p = await login('audit_full');
  await p.goto(UI + '/audit'); await p.waitForSelector('table tbody tr', { timeout: 15000 });
  await p.locator('button', { hasText: /新增|Add/ }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await p.fill('input[name=auditTitle]', 'direct click check');
  await step(p, 3);
  await p.locator('button', { hasText: /新增一列/ }).click();
  const dateInput = p.locator('[data-agenda-row][data-agenda-kind=session] input[type=date]').first();
  await dateInput.click({ position: { x: 12, y: 10 } });
  await p.keyboard.type('10012026', { delay: 30 });
  const footerAtBottom = await p.evaluate(() => Math.round(document.querySelector('[data-wizard-footer]').getBoundingClientRect().bottom) >= window.innerHeight - 1);
  let writes = 0; const onReq = r => { if (/\/api\/audit\/?$/.test(new URL(r.url()).pathname) && r.method() === 'POST') writes++; };
  p.on('request', onReq);
  const saveBox = await p.locator('button', { hasText: /儲存草稿/ }).first().boundingBox();
  await p.mouse.click(saveBox.x + saveBox.width / 2, saveBox.y + saveBox.height / 2);  // one real click, straight from the date field
  await p.waitForTimeout(1500);
  p.off('request', onReq);
  const docNo = await p.evaluate(() => document.querySelector('input[name=auditDocNo]')?.value ?? null);
  const savedLunch = await p.locator('[data-agenda-row][data-agenda-kind=lunch]').count();
  result('typed a new day, then one click on Save Draft: saved on the first click (with the lunch row)', writes === 1 && savedLunch === 1,
    JSON.stringify({ footerAtBottom, writes, savedLunch, docNo }));
  // Add row straight from the date field — a second session on 10/01 moved to a new day: the old day keeps its lunch, the
  // new day gets one, so the table grows by a row (with the R2 blur rule this happened during the click)
  await p.locator('button', { hasText: /新增一列/ }).click();
  const sessionsBefore = await p.locator('[data-agenda-row][data-agenda-kind=session]').count();
  const second = p.locator('[data-agenda-row][data-agenda-kind=session] input[type=date]').nth(1);
  await second.click({ position: { x: 12, y: 10 } });
  await p.keyboard.type('10052026', { delay: 30 });
  const addBox = await p.locator('button', { hasText: /新增一列/ }).boundingBox();
  await p.mouse.click(addBox.x + addBox.width / 2, addBox.y + addBox.height / 2);
  await p.waitForTimeout(400);
  const sessionsAfter = await p.locator('[data-agenda-row][data-agenda-kind=session]').count();
  const lunchDays = await p.locator('[data-agenda-row][data-agenda-kind=lunch] input[type=date]').evaluateAll(els => els.map(e => e.value));
  result('typed a new day (table grows by its lunch), then one click on Add row: the row is added', sessionsAfter === sessionsBefore + 1
    && JSON.stringify(lunchDays.sort()) === '["2026-10-01","2026-10-05"]', JSON.stringify({ sessionsBefore, sessionsAfter, lunchDays }));
  await p.context().close();
}

// 8. the audit item / process column is the widest agenda column at 1400 and 800 wide (narrow screens scroll the table)
for (const width of [1400, 800]) {
  const p = await login('audit_full', 'zh', width);
  await open(p, 'ahb-agenda-closed-1'); await step(p, 3);
  const w = await p.evaluate(() => {
    const inputs = [...document.querySelector('[data-agenda-row]').querySelectorAll('input')].map(i => Math.round(i.getBoundingClientRect().width));
    const box = document.querySelector('[data-agenda-table]').parentElement;
    const overlay = box.closest('.fixed');
    return { date: inputs[0], start: inputs[1], end: inputs[2], item: inputs[3], auditee: inputs[4], auditor: inputs[5], remarks: inputs[6],
             tableScrolls: box.scrollWidth > box.clientWidth, wizardOverflow: overlay.scrollWidth - overlay.clientWidth };
  });
  result(`${width}px: audit item column is the widest (>= 230px); start / end >= 128px (a full "下午12:00" + clock icon); no wizard overflow`,
    w.item >= 230 && w.item > Math.max(w.date, w.start, w.end, w.auditee, w.auditor, w.remarks) && w.start >= 128 && w.end >= 128
    && w.wizardOverflow <= 0, JSON.stringify(w));
  await p.screenshot({ path: `${out}/agenda-width-${width}.png` });
  await p.context().close();
}

// 6. the title / step bar and the footer stay in place while a long step scrolls; the step bar does not move
for (const [label, width, height] of [['desktop 1400x700', 1400, 700], ['phone 390x700', 390, 700]]) {
  const p = await login('audit_full', 'zh', width);
  await p.setViewportSize({ width, height });
  await open(p, 'ahb-export-1'); await step(p, 5);
  const before = await p.evaluate(() => {
    const overlay = document.querySelector('[data-wizard-header]').closest('.fixed');
    return { scrollable: overlay.scrollHeight - overlay.clientHeight };
  });
  const geo = await p.evaluate(async () => {
    const overlay = document.querySelector('[data-wizard-header]').closest('.fixed');
    overlay.scrollTop = overlay.scrollHeight / 2;
    await new Promise(r => setTimeout(r, 300));
    const h = document.querySelector('[data-wizard-header]').getBoundingClientRect();
    const f = document.querySelector('[data-wizard-footer]').getBoundingClientRect();
    const circle = document.querySelector('[data-wizard-header] .max-w-4xl button');
    const cs = getComputedStyle(circle);
    return { scrollTop: Math.round(overlay.scrollTop), headerTop: Math.round(h.top), footerBottom: Math.round(f.bottom), viewport: window.innerHeight,
             transition: cs.transitionDuration, card: getComputedStyle(document.querySelector('.print-modal-content')).overflow };
  });
  await p.locator('[data-wizard-header] .max-w-4xl button').first().hover(); await p.waitForTimeout(200);
  const hovered = await p.evaluate(() => getComputedStyle(document.querySelector('[data-wizard-header] .max-w-4xl button')).transform);
  await p.screenshot({ path: `${out}/sticky-${width}.png` });
  result(`${label}: after scrolling, title/step bar at the top and footer at the bottom; step bar has no transition / hover zoom`,
    before.scrollable > 0 && geo.scrollTop > 0 && Math.abs(geo.headerTop) <= 1 && Math.abs(geo.footerBottom - geo.viewport) <= 1
    && ['0s', '0s, 0s'].includes(geo.transition) && (hovered === 'none' || hovered === 'matrix(1, 0, 0, 1, 0, 0)') && geo.card === 'clip',
    JSON.stringify({ ...before, ...geo, hovered }));
  await p.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
