// AUDIT-GRADES-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py,
// seed_audit_grades_review.py). Usage: node audit-grades-check.mjs <stack.json> <outDir>
// Results are 符合 Pass / 正面發現 Positive / 主要不符合 Major / 次要不符合 Minor; an older 'fail' shows as 不符合（未分級）
// and counts as graded; 'pending' / none = 未評. Progress = graded / total. Printouts and Word: separate clause / question
// columns. window.print is stubbed.
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
const api = (p, path) => p.evaluate(async u => (await fetch('/api' + u, { credentials: 'include' })).json(), path);
const open = async (p, id) => { await p.goto(UI + `/audit?openId=${id}`); await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 }); };
const step = async (p, n) => { await p.locator('.max-w-4xl button').nth(n - 1).click(); await p.waitForTimeout(400); };
const stats = p => p.evaluate(() => {
  const card = s => document.querySelector(`[data-stat="${s}"] p.text-2xl`)?.innerText.trim();
  const cards = [...(document.querySelector('form [data-stat=pass]')?.parentElement?.children || [])];
  return { total: cards[0]?.querySelector('p.text-2xl')?.innerText.trim(), progress: cards[1]?.querySelector('p.text-2xl')?.innerText.trim(),
    graded: cards[1]?.querySelector('p.text-xs')?.innerText.trim(), pass: card('pass'), positive: card('positive'), major: card('major'), minor: card('minor'),
    legend: [...document.querySelectorAll('form span.text-xs.text-slate-500')].map(e => e.innerText.trim()).filter(t => /: \d+$/.test(t)) };
});
const rowOf = (p, task) => p.locator('form table tbody tr', { hasText: task });
const pressed = (p, task) => rowOf(p, task).locator('[data-grade][aria-pressed=true]').getAttribute('data-grade').catch(() => null);
const printText = async (p, kind) => {
  await p.locator(`[data-step-print=${kind}]`).click(); await p.waitForTimeout(600);
  const t = await p.evaluate(() => document.querySelector('.audit-print-root')?.innerText || '');
  // the report's summary table as {English label: value} (label cells hold "中文" + <small>English</small>)
  const summary = await p.evaluate(() => {
    const out = {};
    for (const td of document.querySelectorAll('.audit-print-root td.lbl')) {
      const en = td.querySelector('small')?.innerText.trim(); const v = td.nextElementSibling?.innerText.trim();
      if (en && v !== undefined) out[en] = v;
    }
    return out;
  });
  await p.evaluate(() => dispatchEvent(new Event('afterprint'))); await p.waitForTimeout(200);
  return Object.assign(new String(t), { summary });
};
const wordXml = (p, id, kind) => p.evaluate(async ([id, k]) => {
  const r = await fetch(`/api/audit/${id}/export-docx?kind=${k}`, { credentials: 'include' });
  const bin = new Uint8Array(await r.arrayBuffer()); const dv = new DataView(bin.buffer); let off = 0;
  while (off < bin.length - 30 && dv.getUint32(off, true) === 0x04034b50) {
    const method = dv.getUint16(off + 8, true), csize = dv.getUint32(off + 18, true), nlen = dv.getUint16(off + 26, true), elen = dv.getUint16(off + 28, true);
    const name = new TextDecoder().decode(bin.subarray(off + 30, off + 30 + nlen)); const start = off + 30 + nlen + elen;
    if (name === 'word/document.xml') {
      const data = bin.subarray(start, start + csize);
      const xml = method === 8 ? await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : new TextDecoder().decode(data);
      return xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '');
    }
    off = start + csize;
  }
  return '';
}, [id, kind]);
// the Word summary grid as {label: value}: each label cell is "中文\nEnglish", its value is the next line
const wordSummary = (text) => Object.fromEntries(['Total Items', 'Progress', 'Pass', 'Positive', 'Major', 'Minor', 'Not graded', 'Fail (ungraded)']
  .map(k => [k, (text.match(new RegExp(`(?<=\\n)${k.replace(/[()]/g, '\\$&')}\\n+(\\d+%?)`)) || [])[1]]).filter(([, v]) => v !== undefined));

// 1. step 5 of a seeded audit: one of each grade, an older ungraded fail, two not graded
{
  const p = await login('audit_full');
  await open(p, 'ahb-grades-1'); await step(p, 5);
  const s = await stats(p);
  result('stats cards: 7 items, progress 5/7 = 71% (已評 5), one of each grade', s.total === '7' && s.progress === '71%' && /已評 5/.test(s.graded)
    && s.pass === '1' && s.positive === '1' && s.major === '1' && s.minor === '1', JSON.stringify(s));
  result('legend: the four grades, 不符合（未分級） 1, 未評 2', ['符合: 1', '正面發現: 1', '主要不符合: 1', '次要不符合: 1', '不符合（未分級）: 1', '未評: 2'].every(x => s.legend.includes(x)), JSON.stringify(s.legend));
  const titles = await rowOf(p, 'How are resources provided?').locator('[data-grade]').evaluateAll(bs => bs.map(b => b.title));
  result('each item has the four grade buttons (titles bilingual)', JSON.stringify(titles) === '["符合 (Pass)","正面發現 (Positive)","主要不符合 (Major)","次要不符合 (Minor)"]', JSON.stringify(titles));
  const grades = [];
  for (const task of ['How are resources provided?', 'Training records?', 'How are suppliers controlled?', 'Document control?', 'Segregation?', 'Audit programme?', 'Corrective actions?']) grades.push(await pressed(p, task));
  result('the stored grades show as the pressed button; fail / pending / none press nothing', JSON.stringify(grades) === '["pass","positive","major","minor",null,null,null]', JSON.stringify(grades));
  result('the older fail shows the 不符合（未分級） badge', await rowOf(p, 'Segregation?').locator('[data-ungraded-fail]').count() === 1);
  await p.screenshot({ path: `${out}/step5-grades.png` });

  // regrade the old fail, grade a pending one, clear one by clicking its active grade again
  await rowOf(p, 'Segregation?').locator('[data-grade=major]').click(); await p.waitForTimeout(200);
  const s2 = await stats(p);
  result('regrading the old fail as Major: badge gone, Major 2, no ungraded line, progress unchanged (71%)',
    await rowOf(p, 'Segregation?').locator('[data-ungraded-fail]').count() === 0 && s2.major === '2' && !s2.legend.some(x => x.startsWith('不符合（未分級）')) && s2.progress === '71%', JSON.stringify(s2));
  await rowOf(p, 'Audit programme?').locator('[data-grade=positive]').click(); await p.waitForTimeout(200);
  const s3 = await stats(p);
  result('grading an ungraded item: Positive 2, progress 6/7 = 86%', s3.positive === '2' && s3.progress === '86%', JSON.stringify(s3));
  await rowOf(p, 'How are resources provided?').locator('[data-grade=pass]').click(); await p.waitForTimeout(200);
  const s4 = await stats(p);
  result('clicking the active grade again clears it: Pass 0, progress back to 5/7 = 71%', s4.pass === '0' && s4.progress === '71%' && await pressed(p, 'How are resources provided?') === null, JSON.stringify(s4));
  await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500);
  const savedItems = (await api(p, '/audit/ahb-grades-1')).custom_check_items;
  const saved = savedItems.map(i => i.status ?? null);
  result('saved statuses', JSON.stringify(saved) === '["","positive","major","minor","major","positive",null]', JSON.stringify(saved));
  // the browser's local date, as the wizard's localToday() writes it
  const today = await p.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  result('clearing a grade stamps the item with today (updatedAt), untouched items keep theirs', savedItems[0].updatedAt === today && savedItems[1].updatedAt === '2026-10-02',
    JSON.stringify(savedItems.map(i => i.updatedAt ?? null)));

  // printouts: report summary + items; checklist blank boxes; separate clause / question columns
  const report = await printText(p, 'report');
  const sm = report.summary;
  const reportOk = sm['Total Items'] === '7' && sm.Progress === '71%' && sm.Pass === '0' && sm.Positive === '2' && sm.Major === '2' && sm.Minor === '1'
    && sm['Not graded'] === '2' && !('Fail (ungraded)' in sm) && !('Attention / Pending' in sm)
    && report.includes('條文內容') && report.includes('查檢重點') && report.includes('正面發現 Positive') && report.includes('未評 Not graded') && !report.includes('Attention');
  result('report printout: grade summary (Pass 0 / Positive 2 / Major 2 / Minor 1 / Not graded 2, 71%), results in the item table, separate 條文內容 / 查檢重點 columns', reportOk, JSON.stringify(sm));
  await step(p, 4);
  const checklist = await printText(p, 'checklist');
  result('checklist printout: four blank grade boxes per item, separate clause / question columns', (checklist.match(/☐ 正面發現 Positive/g) || []).length === 7
    && (checklist.match(/☐ 主要不符合 Major/g) || []).length === 7 && checklist.includes('條文內容') && checklist.includes('查檢重點') && !checklist.includes('☐ 不符合 Fail') && !checklist.includes('Attention'),
    checklist.slice(0, 200));

  // Word report / checklist
  const word = await wordXml(p, 'ahb-grades-1', 'report');
  const ws = wordSummary(word);
  result('Word report: grade summary numbers (Total 7, 71%, Pass 0 / Positive 2 / Major 2 / Minor 1 / Not graded 2), results, separate clause / question columns, no Attention',
    JSON.stringify(ws) === JSON.stringify({ 'Total Items': '7', Progress: '71%', Pass: '0', Positive: '2', Major: '2', Minor: '1', 'Not graded': '2' })
    && ['正面發現 Positive', '主要不符合 Major', '條文內容', '查檢重點'].every(x => word.includes(x)) && !word.includes('Attention'), JSON.stringify(ws));
  const wordC = await wordXml(p, 'ahb-grades-1', 'checklist');
  result('Word checklist: the four grade boxes', (wordC.match(/☐ 次要不符合 Minor/g) || []).length === 7 && !wordC.includes('Attention'));
  await p.context().close();
}

// 2. the older audit's ungraded fail in the Word / printout summary; a Closed audit cannot be regraded
{
  const p = await login('audit_full');
  const word = await (async () => { await p.goto(UI + '/audit'); return wordXml(p, 'ahb-grades-closed-1', 'report'); })();
  const ws = wordSummary(word);
  result('Word report of an audit still holding an older fail: full summary incl. Fail (ungraded) 1, row text shows',
    JSON.stringify(ws) === JSON.stringify({ 'Total Items': '7', Progress: '71%', Pass: '1', Positive: '1', Major: '1', Minor: '1', 'Not graded': '2', 'Fail (ungraded)': '1' })
    && word.includes('不符合（未分級） Fail'), JSON.stringify(ws));
  await open(p, 'ahb-grades-closed-1'); await step(p, 5);
  const disabled = await rowOf(p, 'Training records?').locator('[data-grade=pass]').isDisabled();
  await rowOf(p, 'Training records?').locator('[data-grade=pass]').click({ force: true }).catch(() => {}); await p.waitForTimeout(200);
  result('Closed audit: grade buttons disabled, clicking changes nothing', disabled && await pressed(p, 'Training records?') === 'positive');
  const report = await printText(p, 'report');
  result('Closed audit printout keeps the 不符合（未分級） line', report.includes('不符合（未分級）') && report.includes('Fail (ungraded)'));
  await p.context().close();
}

// 3. English labels
{
  const p = await login('audit_full', 'en');
  await open(p, 'ahb-grades-1'); await step(p, 5);
  const labels = await p.locator('form table tbody tr').first().locator('[data-grade]').allInnerTexts();
  const s = await stats(p);
  result('English: grade buttons Pass / Positive / Major / Minor, legend Not graded', JSON.stringify(labels.map(x => x.trim())) === '["Pass","Positive","Major","Minor"]' && s.legend.some(x => x.startsWith('Not graded')), JSON.stringify({ labels, legend: s.legend }));
  await p.context().close();
}

// 4. the six stats cards fit: 3 × 2 on a ~1024px screen (no sideways scroll), one row of six on a wide one (user 2026-10-11)
{
  const p = await login('audit_full');
  await open(p, 'ahb-grades-1'); await step(p, 5);
  const layout = () => p.evaluate(() => {
    const grid = document.querySelector('[data-stat=pass]').parentElement;
    const cards = [...grid.children].filter(c => c.offsetParent);
    const rows = new Set(cards.map(c => Math.round(c.getBoundingClientRect().top))).size;
    const clipped = cards.filter(c => [...c.querySelectorAll('p')].some(x => x.scrollWidth > x.clientWidth + 1)).length;
    return { cards: cards.length, rows, overflow: grid.scrollWidth - grid.clientWidth, clipped };
  });
  await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(300);
  const narrow = await layout();
  // 1280 = the narrowest width that puts all six in one row (xl), so the tightest cards
  await p.setViewportSize({ width: 1280, height: 900 }); await p.waitForTimeout(300);
  const wide = await layout();
  await p.setViewportSize({ width: 1400, height: 900 }); await p.waitForTimeout(300);
  result('stats cards: 3 × 2 at 1024px, one row of six at 1280px, neither with sideways scroll or cut labels',
    narrow.cards === 6 && narrow.rows === 2 && narrow.overflow <= 0 && narrow.clipped === 0 && wide.cards === 6 && wide.rows === 1 && wide.overflow <= 0 && wide.clipped === 0, JSON.stringify({ narrow, wide }));
  await p.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
