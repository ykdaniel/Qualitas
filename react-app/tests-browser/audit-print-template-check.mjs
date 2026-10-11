// AUDIT-PRINT-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py then
// seed_audit_export_docx_review.py). Usage: node audit-print-template-check.mjs <stack.json> <outDir>
// window.print is stubbed (counted, never opened); the printout is inspected under print media emulation.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const result = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const squash = s => s.replace(/\s+/g, '');
// (R3) The printed PDF itself: pages in order with size (pt) and whether the page draws any text. Chromium writes plain
// (non object-stream) PDFs with Flate content streams, so a small reader is enough: page tree Kids -> MediaBox + Contents.
function pdfPages(path) {
  const pdf = readFileSync(path), text = pdf.toString('latin1');
  const obj = n => { const m = new RegExp(`(?:^|\\s)${n} 0 obj`).exec(text); return m ? text.slice(m.index, text.indexOf('endobj', m.index)) : ''; };
  const stream = n => {
    const m = new RegExp(`(?:^|\\s)${n} 0 obj`).exec(text); const start = text.indexOf('stream', m.index) + 6;
    const from = start + (text[start] === '\r' ? 2 : 1); const end = text.indexOf('endstream', from);
    const raw = pdf.subarray(from, end); try { return inflateSync(raw).toString('latin1'); } catch { return raw.toString('latin1'); }
  };
  const root = /\/Root (\d+) 0 R/.exec(text)[1];
  const kidsOf = n => { const k = /\/Kids\s*\[([^\]]*)\]/.exec(obj(n)); return k ? [...k[1].matchAll(/(\d+) 0 R/g)].map(x => x[1]) : []; };
  const pages = [];
  const walk = n => { const o = obj(n); if (/\/Type\s*\/Pages/.test(o)) kidsOf(n).forEach(walk); else pages.push(n); };
  walk(/\/Pages (\d+) 0 R/.exec(obj(root))[1]);
  return pages.map(n => {
    const o = obj(n); const box = (/\/MediaBox\s*\[([^\]]*)\]/.exec(o) || [, ''])[1].trim().split(/\s+/).map(Number);
    const contents = [...((/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/.exec(o) || [, ''])[1]).matchAll(/(\d+) 0 R/g)].map(x => x[1]);
    return { w: Math.round(box[2] - box[0]), h: Math.round(box[3] - box[1]), text: contents.some(c => /T[Jj]\b/.test(stream(c))) };
  });
}
const isA4Portrait = pg => Math.abs(pg.w - 595) <= 2 && Math.abs(pg.h - 842) <= 2;
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('language', 'zh'); window.__printed = 0; window.print = () => { window.__printed++; }; });
const p = await ctx.newPage();
await p.goto(UI + '/login'); await p.fill('#email', 'audit_full'); await p.fill('#password', PW); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

// The scenario that used to print a blank page: another module's print CSS (#root hidden in print) loaded first, SPA only.
await p.goto(UI + '/ncr'); await p.waitForTimeout(2500);
const spa = async path => { await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, path); };
// (R3/R4) every other module with print CSS, so all of it is loaded before Audit prints: their unconditional #root
// hiding (blank page), ITP's / Checklist's unnamed @page (Letter landscape, zero margins) and ITR's forced-visible
// #itr-single-print-root (a blank first page in front of a named page)
for (const path of ['/osd', '/obs', '/pqp', '/fat', '/material-submittals', '/meeting-minutes', '/noi', '/itr', '/itp', '/checklist', '/km']) {
  await spa(path); await p.waitForTimeout(1500);
}
await spa('/audit?openId=ahb-export-1');
await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 });
const ncrRuleLoaded = await p.evaluate(() => [...document.styleSheets].some(s => { try { return [...s.cssRules].some(r => /#root/.test(r.cssText) && /none/.test(r.cssText) && !/has\(/.test(r.cssText)); } catch { return false; } }));
result('setup: another module\'s unconditional #root print rule is loaded (old blank-page condition)', ncrRuleLoaded);
const setup = await p.evaluate(() => {
  const rules = [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch { return []; } })
    .flatMap(r => r.cssRules ? [r, ...r.cssRules] : [r]).map(r => r.cssText);
  return { itrForcedVisible: rules.some(t => /#itr-single-print-root/.test(t) && /display: block !important/.test(t)),
           unnamedPageRules: rules.filter(t => /^@page \{/.test(t)).length, container: !!document.getElementById('itr-single-print-root') };
});
result('setup: ITR\'s forced-visible #itr-single-print-root rule and other modules\' unnamed @page rules are loaded', setup.itrForcedVisible && setup.container && setup.unnamedPageRules >= 2, JSON.stringify(setup));

const step = async n => { await p.locator('.max-w-4xl button').nth(n - 1).click(); await p.waitForTimeout(500); };
async function printOut(n, label, kind) {
  await step(n);
  const before = await p.evaluate(() => window.__printed);
  await p.locator('button', { hasText: label }).first().click();
  await p.waitForTimeout(600);
  await p.emulateMedia({ media: 'print' });
  const state = await p.evaluate(k => {
    const root = document.querySelector('.audit-print-root');
    return {
      printed: window.__printed, kind: root?.dataset.printKind, inBody: root?.parentElement === document.body,
      rootHidden: getComputedStyle(document.getElementById('root')).display === 'none',
      shown: root ? getComputedStyle(root).display : null, text: root?.innerText || '',
      buttons: root ? root.querySelectorAll('button, svg').length : -1, k,
    };
  }, kind);
  // preferCSSPageSize: the page size / margins come from the CSS (@page audit), as in a real print, not from Playwright
  await p.pdf({ path: `${out}/print-${kind}.pdf`, preferCSSPageSize: true, printBackground: true });
  state.pdf = pdfPages(`${out}/print-${kind}.pdf`);
  await p.screenshot({ path: `${out}/print-${kind}.png`, fullPage: true });
  await p.emulateMedia({ media: 'screen' });
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  await p.waitForTimeout(300);
  const unmounted = await p.evaluate(() => !document.querySelector('.audit-print-root'));
  return { ...state, before, unmounted };
}

// 1-3. each button prints its own formal printout, outside #root, never blank, no buttons / icons, removed afterwards
// steps since AUDIT-AGENDA-2026-001: 3 Agenda (Print Audit Plan), 4 Checklist, 5 Execution & Review
const plan = await printOut(3, /列印稽核計畫/, 'plan');
const checklist = await printOut(4, /列印查檢表/, 'checklist');
const report = await printOut(5, /列印報告/, 'report');
for (const [kind, r] of [['plan', plan], ['checklist', checklist], ['report', report]]) {
  result(`${kind}: print called once, printout in <body>, #root hidden, printout visible, no buttons/icons, removed after print`,
    r.printed === r.before + 1 && r.kind === kind && r.inBody && r.rootHidden && r.shown === 'block' && r.buttons === 0 && r.unmounted,
    JSON.stringify({ ...r, text: undefined }));
}
// (R3) the actual PDFs: no blank page (the first page used to be an empty sibling of the printout), every page A4 portrait
// although ITP's and Checklist's @page rules are loaded
for (const [kind, r, minPages] of [['plan', plan, 1], ['checklist', checklist, 1], ['report', report, 2]]) {
  result(`${kind} PDF: ${r.pdf.length} page(s), every page has text, all A4 portrait`, r.pdf.length >= minPages && r.pdf.every(pg => pg.text) && r.pdf.every(isA4Portrait),
    JSON.stringify(r.pdf));
}
result('plan: title + sections 1-4 (incl. agenda) + plan sign-off, no results', /內部稽核計畫/.test(plan.text) && /3\. 稽核範圍與準則/.test(plan.text)
  && /4\. 稽核行程/.test(plan.text) && /5\. 計畫簽核/.test(plan.text) && !/查檢結果|符合 Pass/.test(plan.text), plan.text.slice(0, 300));
result('checklist: title, 5 items with blank result boxes, no recorded results or remarks',
  /稽核查檢表/.test(checklist.text) && (checklist.text.match(/☐ 符合 Pass/g) || []).length === 5
  && !/人力配置表已核准|待補年度稽核計畫/.test(checklist.text) && !/(^|[^☐] )(符合|不符合) (Pass|Fail)/m.test(checklist.text.replace(/☐ /g, '☐'))
  && /現場材料標示是否清楚/.test(checklist.text), checklist.text.slice(0, 300));

// 4. the report printout carries everything the Word export carries (every cell / paragraph text of the .docx)
const wordTexts = await p.evaluate(async () => {
  const r = await fetch('/api/audit/ahb-export-1/export-docx', { credentials: 'include' });
  const bin = new Uint8Array(await r.arrayBuffer()); const dv = new DataView(bin.buffer); let off = 0, xml = null;
  while (off < bin.length - 30 && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true), csize = dv.getUint32(off + 18, true), nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
    const name = new TextDecoder().decode(bin.subarray(off + 30, off + 30 + nlen)); const start = off + 30 + nlen + elen;
    if (name === 'word/document.xml') { const data = bin.subarray(start, start + csize); xml = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data); break; }
    off = start + csize;
  }
  const doc = new DOMParser().parseFromString(xml, 'application/xml'); const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  return [...doc.getElementsByTagNameNS(W, 'p')].map(p => [...p.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('')).filter(t => t.trim());
});
// Word-only lines: the masthead's "Rev ... 狀態" line (one paragraph in Word, two lines + a badge in print) and the sign-off
// cells' fill-in lines (the printout's shared SignCell words them slightly differently).
const ignored = t => /^版次 Rev|^姓名：|^日期：|^單位 Company：/.test(t);
const reportText = squash(report.text);
const missing = wordTexts.filter(t => !ignored(t) && !reportText.includes(squash(t)));
result(`report printout contains every text of the Word export (${wordTexts.length} paragraphs, ${wordTexts.filter(ignored).length} wording-only lines skipped)`,
  missing.length === 0, JSON.stringify(missing));
const order = ['1. 稽核資訊', '2. 稽核團隊', '3. 稽核範圍與準則', '4. 稽核行程', '5. 查檢結果', '5.1 查檢明細', '6. 稽核發現與總結', '7. 簽核'];
const positions = order.map(h => report.text.indexOf(h));
result('report sections in the same order as Word', positions.every((v, i) => v >= 0 && (i === 0 || v > positions[i - 1])), JSON.stringify(positions));

// 5. unsaved edit: printed as on screen, flagged in the masthead
await step(5);
await p.fill('textarea[name=findings]', '列印時尚未儲存的修改');
await p.locator('button', { hasText: /列印報告/ }).first().click();
await p.waitForTimeout(600);
const unsaved = await p.evaluate(() => document.querySelector('.audit-print-root')?.innerText || '');
result('unsaved changes: printout shows the screen content and flags it', /列印時尚未儲存的修改/.test(unsaved) && /含未儲存的修改/.test(unsaved), unsaved.slice(0, 200));
await p.evaluate(() => dispatchEvent(new Event('afterprint')));

await p.evaluate(() => dispatchEvent(new Event('afterprint')));

// 6. (R2) a second click prints again even if the browser never fired afterprint for the first one
await step(5);
const n0 = await p.evaluate(() => window.__printed);
await p.locator('button', { hasText: /列印報告/ }).first().click(); await p.waitForTimeout(500);
await p.locator('button', { hasText: /列印報告/ }).first().click(); await p.waitForTimeout(500);
const n1 = await p.evaluate(() => ({ printed: window.__printed, mounted: document.querySelectorAll('.audit-print-root').length }));
result('two clicks without afterprint print twice (one printout mounted)', n1.printed === n0 + 2 && n1.mounted === 1, JSON.stringify({ n0, ...n1 }));
await p.evaluate(() => dispatchEvent(new Event('afterprint')));

// 7. (R2) the page size / margins are Audit's own named page, not a global @page
const pageRules = await p.evaluate(() => {
  // the stylesheet that defines .audit-print-root (Audit.print.css) — other modules' sheets have their own unnamed @page
  const sheet = [...document.styleSheets].find(s => { try { return [...s.cssRules].some(r => r.cssText.includes('.audit-print-root')); } catch { return false; } });
  const flat = [...sheet.cssRules].flatMap(r => r.cssRules ? [r, ...r.cssRules] : [r]).map(r => r.cssText);
  return { named: flat.filter(t => /^@page audit/.test(t)), unnamed: flat.filter(t => /^@page \{/.test(t)), pageProp: flat.filter(t => /page: audit/.test(t)).length };
});
result('Audit.print.css: named @page audit (A4) used by .audit-print-root, no unnamed @page', pageRules.named.length === 1 && /a4/i.test(pageRules.named[0])
  && pageRules.unnamed.length === 0 && pageRules.pageProp === 1, JSON.stringify(pageRules));

// 8. (R2) half-percent rounding and clause-only items: wizard card, printout and Word agree
const made = await p.evaluate(async () => {
  const csrf = decodeURIComponent((document.cookie.match(/(?:^|; )csrf_token=([^;]*)/) || [])[1] || '');
  const mk = async (title, items) => (await (await fetch('/api/audit/', { method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
    body: JSON.stringify({ auditNo: '', title, date: '2026-10-01', end_date: '2026-10-02', project_id: 'AHB-P1', project_name: '', auditor: 'R2',
      project_director: '', support_auditors: '', tech_lead: '', location: '', findings: '', audit_criteria: '', scope_description: '',
      selected_templates: [], custom_check_items: items, contractor: '', status: 'Draft' }) })).json()).id;
  const q = (n, status, extra = {}) => ({ id: n, task: `q${n}`, status, ...extra });
  return {
    eight: await mk('R2 one of eight', [q(0, 'pass'), ...[1, 2, 3, 4, 5, 6, 7].map(n => q(n))]),
    forty: await mk('R2 23 of 40', Array.from({ length: 40 }, (_, n) => q(n, n < 23 ? 'pass' : undefined))),
    clause: await mk('R2 clause only', [{ id: 1, no: '7.1', clause: 'Clause only', task: '', status: 'pass' }]),
  };
});
const wordProgress = async id => p.evaluate(async id => {
  const r = await fetch(`/api/audit/${id}/export-docx`, { credentials: 'include' });
  const bin = new Uint8Array(await r.arrayBuffer()); const dv = new DataView(bin.buffer); let off = 0, xml = '';
  while (off < bin.length - 30 && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true), csize = dv.getUint32(off + 18, true), nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
    const name = new TextDecoder().decode(bin.subarray(off + 30, off + 30 + nlen)); const start = off + 30 + nlen + elen;
    if (name === 'word/document.xml') { const data = bin.subarray(start, start + csize); xml = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data); break; }
    off = start + csize;
  }
  return (xml.match(/<w:t[^>]*>(\d+%)<\/w:t>/) || [])[1];
}, id);
for (const [key, expected] of [['eight', '13%'], ['forty', '58%']]) {
  await p.goto(UI + `/audit?openId=${made[key]}`); await p.waitForTimeout(1500);
  await p.waitForSelector('input[name=auditDocNo]'); await step(5);
  const card = await p.evaluate(() => [...document.querySelectorAll('p')].map(x => x.innerText).find(t => /^\d+%$/.test(t)));
  await p.locator('button', { hasText: /列印報告/ }).first().click(); await p.waitForTimeout(500);
  const printed = await p.evaluate(() => (document.querySelector('.audit-print-root')?.innerText.match(/完成率\s*Progress\s*(\d+%)/) || [])[1]);
  await p.evaluate(() => dispatchEvent(new Event('afterprint')));
  const word = await wordProgress(made[key]);
  result(`progress ${key}: wizard card, printout and Word all ${expected}`, card === expected && printed === expected && word === expected, JSON.stringify({ card, printed, word }));
}
await p.goto(UI + `/audit?openId=${made.clause}`); await p.waitForTimeout(1500);
await p.waitForSelector('input[name=auditDocNo]'); await step(5);
await p.locator('button', { hasText: /列印報告/ }).first().click(); await p.waitForTimeout(500);
const cell = await p.evaluate(() => [...document.querySelectorAll('.audit-print-root .items tbody tr')].map(r => r.cells[2].innerText));
result('clause-only item: clause printed, no extra dash line (as in Word)', cell.length === 1 && cell[0].trim() === 'Clause only', JSON.stringify(cell));
await p.evaluate(() => dispatchEvent(new Event('afterprint')));

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
