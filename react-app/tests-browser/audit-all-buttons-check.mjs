// AUDIT-BUTTON-TEST-2026-10-11: every button of the Audit module (list page, 5-step wizard, states x permissions).
// v2 (AUDIT-TEMPLATES-2026-001 regress R2): follows the current UI — the shared DataTable labels in Chinese (AUDIT-BTNFIX),
// exact contractor / status column filters, the disabled delete button's tooltip on its wrapper, the read-only banner,
// the default lunch leaving with a day's last session, and step 4's audit types (template library) + clause / question
// dropdowns instead of the old fixed 20-clause ISO dropdown.
// TEST ONLY — isolated stack (vite 3323 / backend 8323), freshly reset with /tmp/claude-501/reset-r2-3323.sh (seeds
// seed_audit_hardening_b_review.py, seed_audit_export_docx_review.py, seed_audit_agenda_review.py and the scratch seed
// that adds contractor "Second Vendor"; the 4 audit templates come from backend startup).
// Usage: node audit-all-buttons-check.mjs <stack.json> <outDir>
// window.print is stubbed (counted, never opened); Word downloads are saved to <outDir>/downloads.
// Writes <outDir>/results.json (one entry per check) and prints one line per check.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3];
const EV = out;  // evidence paths in results point into the output directory
mkdirSync(`${out}/downloads`, { recursive: true }); mkdirSync(`${out}/shots`, { recursive: true });
if (stack.vite_port !== 3323 || stack.backend_port !== 8323) { console.error('refusing: not the 3323/8323 isolated stack'); process.exit(2); }
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const d = new Date();
const TODAY = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- result recorder ----------
const R = [];
let section = '';
const rec = (loc, btn, exp, act, ok, ev = '') => {
  const status = ok === true ? 'PASS' : ok === false ? 'FAIL' : ok;  // or '待確認' / '未測'
  const a = typeof act === 'string' ? act : JSON.stringify(act);
  R.push({ sec: section, loc, btn, exp, act: a, status, ev });
  console.log(`${status} [${section}] ${loc} | ${btn} -> ${a.replace(/\s+/g, ' ').slice(0, 300)}`);
};
const shot = async (p, name, full = false) => { await p.screenshot({ path: `${out}/shots/${name}.png`, fullPage: full }); return `${EV}/shots/${name}.png`; };
const guard = async (name, fn) => {
  try { await fn(); } catch (e) {
    console.log(`SCRIPT-ERROR in ${name}: ${e.stack || e}`);
    R.push({ sec: section, loc: name, btn: '(script)', exp: '-', act: String(e.message || e).slice(0, 300), status: 'SCRIPT-ERROR', ev: '' });
  }
};

// ---------- browser helpers ----------
const browser = await chromium.launch({ headless: true });
async function login(user, width = 1400) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(() => { localStorage.setItem('language', 'zh'); window.__printed = 0; window.print = () => { window.__printed++; }; });
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 });
  return p;
}
const DT_ROWS = 'div.rounded-md.border table tbody tr';
const gotoList = async p => { await p.goto(UI + '/audit'); await p.waitForSelector(DT_ROWS, { timeout: 20000 }); await p.waitForTimeout(800); };
const dtNos = p => p.locator(DT_ROWS).evaluateAll(rows => rows.filter(r => r.cells.length > 2).map(r => r.cells[1].innerText.trim()));
const dtRow = (p, no) => p.locator(DT_ROWS).filter({ has: p.locator('td:nth-child(2)', { hasText: new RegExp(`^${no}$`) }) });
const wizardOpen = async p => (await p.locator('[data-wizard-header]').count()) > 0;
const docNo = p => p.locator('input[name=auditDocNo]').inputValue();
// the list has more rows than one page: narrow it with the search box first, click the row, then clear the search again
const SEARCH = 'input[placeholder="搜尋稽核..."]';
const openRow = async (p, no) => {
  await p.fill(SEARCH, no); await p.waitForTimeout(400);
  await dtRow(p, no).locator('td').nth(2).click();
  await p.waitForSelector('input[name=auditDocNo]', { timeout: 10000 });
  await p.fill(SEARCH, ''); await p.waitForTimeout(300);
};
const stepBtn = (p, n) => p.locator('[data-wizard-header] .max-w-4xl button').nth(n - 1);
const step = async (p, n) => { await stepBtn(p, n).click(); await p.waitForTimeout(350); };
const curStep = p => p.locator('[data-wizard-header] .max-w-4xl button.bg-teal-600').count();
const heading = p => p.locator('form h2, form h1').first().innerText();
const foot = (p, re) => p.locator('[data-wizard-footer] button').filter({ hasText: re });
const closeX = p => p.locator('[data-wizard-header] button').first();
const modal = p => p.locator('[class*=modalOverlay]');
const toast = async (p, re, timeout = 5000) => {
  try { await p.locator('[data-sonner-toast]').filter({ hasText: re }).first().waitFor({ timeout }); return true; } catch { return false; }
};
const api = (p, method, url, body) => p.evaluate(async ([method, url, body]) => {
  const csrf = (document.cookie.match(/(?:^|; )csrf_token=([^;]+)/) || [])[1];
  const headers = { 'Content-Type': 'application/json' };
  if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf);
  const r = await fetch(url, { method, credentials: 'include', headers, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch { /* empty */ }
  return { status: r.status, body: j };
}, [method, url, body]);
const getAudit = async (p, id) => (await api(p, 'GET', `/api/audit/${id}`)).body;
// count POST / PUT / DELETE to /api/audit and export-docx requests from now on
const track = p => {
  const c = { POST: 0, PUT: 0, DELETE: 0, docx: 0 };
  const on = r => {
    const path = new URL(r.url()).pathname;
    if (/\/api\/audit\//.test(path) && c[r.method()] !== undefined) c[r.method()]++;
    if (/export-docx/.test(path)) c.docx++;
  };
  p.on('request', on);
  return { c, stop: () => p.off('request', on) };
};
const isDis = loc => loc.evaluate(el => el.matches(':disabled'));
const printCheck = async (p, kind) => {
  const before = await p.evaluate(() => window.__printed);
  await p.locator(`[data-step-print=${kind}]`).click(); await p.waitForTimeout(700);
  const got = await p.evaluate(() => ({ printed: window.__printed, kind: document.querySelector('.audit-print-root')?.dataset.printKind,
    text: (document.querySelector('.audit-print-root')?.innerText || '').slice(0, 4000) }));
  await p.evaluate(() => dispatchEvent(new Event('afterprint'))); await p.waitForTimeout(200);
  return { calls: got.printed - before, kind: got.kind, text: got.text };
};
function docxText(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const n = buf.readUInt16LE(eocd + 10); let off = buf.readUInt32LE(eocd + 16);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(off + 10), csize = buf.readUInt32LE(off + 20), nlen = buf.readUInt16LE(off + 28),
      elen = buf.readUInt16LE(off + 30), clen = buf.readUInt16LE(off + 32), lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString();
    if (name === 'word/document.xml') {
      const ln = buf.readUInt16LE(lho + 26), le = buf.readUInt16LE(lho + 28);
      const data = buf.subarray(lho + 30 + ln + le, lho + 30 + ln + le + csize);
      const xml = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
      return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(m => m[1]).join('');
    }
    off += 46 + nlen + elen + clen;
  }
  return null;
}
const wordDownload = async (p, kind) => {
  let url = '';
  const onReq = r => { if (/export-docx/.test(r.url())) url = r.url(); };
  p.on('request', onReq);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }), p.locator(`[data-step-word=${kind}]`).click()]);
  p.off('request', onReq);
  const file = dl.suggestedFilename(); const path = `${out}/downloads/${file}`; await dl.saveAs(path);
  const buf = readFileSync(path);
  return { file, kind: url ? new URL(url).searchParams.get('kind') : null, zip: buf.subarray(0, 2).toString() === 'PK', text: docxText(buf) || '', ev: `${EV}/downloads/${file}` };
};
const DOC_TITLE = { plan: '內部稽核計畫', checklist: '稽核查檢表', report: '內部稽核報告' };
const DOC_SUFFIX = { plan: '-Plan', checklist: '-Checklist', report: '' };

// state probe of an open wizard: walks the 5 steps with Next / Back and records which controls are usable
async function probeWizard(p) {
  const s = {};
  await step(p, 1);
  s.step1 = await p.evaluate(() => {
    const f = document.querySelector('form');
    const dis = sel => { const el = f.querySelector(sel); return el ? el.matches(':disabled') : null; };
    return { title: dis('input[name=auditTitle]'), project: dis('select[name=projectId]'), status: dis('select[name=status]'),
      startDate: dis('input[name=auditStartDate]'), statusOptions: [...f.querySelectorAll('select[name=status] option')].map(o => o.value) };
  });
  s.back1 = await foot(p, /上一步/).count();
  s.next1 = await foot(p, /下一步/).count();
  s.saveDraft = await foot(p, /儲存草稿/).count();
  // read-only banner (AUDIT-BTNFIX): [data-readonly-banner="<i18n key>"] with the reason
  s.banner = await p.evaluate(() => { const b = document.querySelector('[data-readonly-banner]'); return b ? { key: b.getAttribute('data-readonly-banner'), text: b.innerText.trim() } : null; });
  s.notice = !!s.banner;
  await foot(p, /下一步/).click(); await p.waitForTimeout(300);
  s.afterNext = await curStep(p);
  s.step2 = await p.evaluate(() => [...document.querySelectorAll('form input[type=text], form textarea')].every(e => e.matches(':disabled')));
  await foot(p, /上一步/).click(); await p.waitForTimeout(300);
  s.afterBack = await curStep(p);
  await step(p, 3);
  s.step3 = await p.evaluate(() => ({
    addRow: [...document.querySelectorAll('form button')].some(b => /新增一列/.test(b.innerText)),
    rowDelete: document.querySelectorAll('[data-agenda-row] button').length,
    rows: document.querySelectorAll('[data-agenda-row]').length,
    inputsDisabled: [...document.querySelectorAll('[data-agenda-row] input')].every(i => i.matches(':disabled')),
  }));
  s.print3 = await p.locator('[data-step-print=plan]').count(); s.word3 = await p.locator('[data-step-word=plan]').count();
  await step(p, 4);
  s.step4 = await p.evaluate(() => {
    const chip = document.querySelector('form [data-template-chip="ISO 9001:2015"]');
    const form = document.querySelector('[data-add-form]');
    const clausePick = form?.querySelector('select[data-clause-pick]');
    const task = form?.querySelector('textarea[name=task]');
    const plus = form?.querySelector('[data-add-item]');
    const items = [...document.querySelectorAll('form div[class*="h-[300px]"] > div.group')];
    const itemBtns = items.flatMap(i => [...i.querySelectorAll('button')]);
    return { chipDisabled: chip?.matches(':disabled'), clausePickDisabled: clausePick?.matches(':disabled'), taskDisabled: task?.matches(':disabled'), plusDisabled: plus?.matches(':disabled'),
      batchPick: document.querySelectorAll('form [data-batch-pick]').length,
      items: items.length, itemBtnsDisabled: itemBtns.length ? itemBtns.every(b => b.matches(':disabled')) : null,
      chipCursor: chip ? getComputedStyle(chip).cursor : null };
  });
  s.print4 = await p.locator('[data-step-print=checklist]').count(); s.word4 = await p.locator('[data-step-word=checklist]').count();
  await step(p, 5);
  s.step5 = await p.evaluate(() => {
    const pass = document.querySelector('form button[title="符合 (Pass)"]');
    const note = document.querySelector('form table tbody textarea');
    const findings = document.querySelector('form textarea[name=findings]');
    const search = document.querySelector('form div.no-print.p-4 input');
    const chip = document.querySelector('form div.no-print.p-4 button');
    return { passDisabled: pass ? pass.matches(':disabled') : null, noteDisabled: note ? note.matches(':disabled') : null,
      findingsDisabled: findings?.matches(':disabled'), searchDisabled: search?.matches(':disabled'), chipDisabled: chip?.matches(':disabled'),
      passCursor: pass ? getComputedStyle(pass).cursor : null };
  });
  s.next5 = await foot(p, /下一步/).count();
  s.submit = await foot(p, /完成並建立計畫/).count();
  s.print5 = await p.locator('[data-step-print=report]').count(); s.word5 = await p.locator('[data-step-word=report]').count();
  s.saveDraft5 = await foot(p, /儲存草稿/).count();
  return s;
}

// ======================================================================================
// A. 清單頁 (audit_full)
// ======================================================================================
section = '清單頁';
let full = await login('audit_full');
await gotoList(full);
const SEEDED = ['AHB-DRAFT-1', 'AHB-VOID-1', 'AHB-CLOSED-1', 'AHB-LEGACY-1', 'AHB-EXPORT-1', 'AHB-AGENDA-1', 'AHB-AGENDA-CLOSED-1'];
{
  const nos = await dtNos(full);
  if (nos.length !== 7 || !SEEDED.every(n => nos.includes(n))) {
    console.error('refusing: stack is not freshly seeded (run /tmp/claude-501/reset-r2-3323.sh first): ' + JSON.stringify(nos));
    process.exit(3);
  }
  rec('清單', '頁面載入', '列出 7 筆種子稽核', nos, true, await shot(full, 'A01-list', true));
}

await guard('搜尋框', async () => {
  const box = full.locator('input[placeholder="搜尋稽核..."]');
  await box.fill('export'); await full.waitForTimeout(500);
  const a = await dtNos(full);
  await box.fill('closed'); await full.waitForTimeout(500);
  const b = await dtNos(full);
  await box.fill('王稽核'); await full.waitForTimeout(500);
  const c = await dtNos(full);
  await box.fill('zzzz-none'); await full.waitForTimeout(500);
  const e = await dtNos(full); const noData = await full.locator(DT_ROWS).filter({ hasText: '沒有符合條件的資料' }).count();
  const ev = await shot(full, 'A02-search-empty');
  await box.fill(''); await full.waitForTimeout(500);
  const f = await dtNos(full);
  rec('工具列', '搜尋框（編號）', '輸入 export 只剩 AHB-EXPORT-1', a, JSON.stringify(a) === '["AHB-EXPORT-1"]');
  rec('工具列', '搜尋框（狀態）', '輸入 closed 只剩 2 筆 Closed', b, b.length === 2 && b.includes('AHB-CLOSED-1') && b.includes('AHB-AGENDA-CLOSED-1'));
  rec('工具列', '搜尋框（稽核員）', '輸入 王稽核 列出稽核員為王稽核的 3 筆', c, c.length === 3 && ['AHB-EXPORT-1', 'AHB-AGENDA-1', 'AHB-AGENDA-CLOSED-1'].every(n => c.includes(n)));
  rec('工具列', '搜尋框（無結果）', '無符合時顯示「沒有符合條件的資料」', { rows: e, noData }, e.length === 0 && noData === 1, ev);
  rec('工具列', '搜尋框（清空）', '清空後回到 7 筆', f.length, f.length === 7);
});

await guard('新增稽核', async () => {
  await full.locator('button', { hasText: '新增稽核' }).click();
  await full.waitForSelector('input[name=auditTitle]', { timeout: 10000 });
  const st = { open: await wizardOpen(full), docNo: await docNo(full), title: await full.locator('input[name=auditTitle]').inputValue(), step: await curStep(full),
    status: await full.locator('select[name=status]').inputValue(),
    options: await full.locator('select[name=status] option').evaluateAll(os => os.map(o => o.value)) };
  const ev = await shot(full, 'A03-add-wizard');
  rec('工具列', '新增稽核', '開啟空白精靈：第 1 步、編號空白、狀態 Draft、可選 Draft/Planned/In Progress/Completed', st,
    st.open && st.docNo === '' && st.title === '' && st.step === 1 && st.status === 'Draft' && JSON.stringify(st.options) === '["Draft","Planned","In Progress","Completed"]', ev);
  await closeX(full).click(); await full.waitForTimeout(400);
  rec('精靈', '✕ 關閉（新稽核、未修改）', '直接關閉、不出現未儲存提示', { open: await wizardOpen(full), modal: await modal(full).count() },
    !(await wizardOpen(full)) && (await modal(full).count()) === 0);
});

await guard('排程月曆', async () => {
  const month = () => full.locator('[class*=monthDisplay]').innerText();
  const m0 = await month();
  await full.locator('[class*=navBtn]').first().click(); await full.waitForTimeout(300);
  const mPrev = await month();
  const iconsPrev = await full.locator('[class*=matrixTable] [role=button]').count();
  await full.locator('[class*=todayBtn]').click(); await full.waitForTimeout(300);
  const mToday = await month();
  await full.locator('[class*=navBtn]').nth(1).click(); await full.waitForTimeout(300);
  const mNext = await month();
  await full.locator('[class*=navBtn]').nth(1).click(); await full.waitForTimeout(300);
  const mNext2 = await month();
  await full.locator('[class*=todayBtn]').click(); await full.waitForTimeout(300);
  rec('排程月曆', '上一月 ‹', '月份由 2026年10月 變 2026年9月', { m0, mPrev }, /2026.*10/.test(m0) && /2026.*9月/.test(mPrev));
  rec('排程月曆', '今天', '回到本月 2026年10月', mToday, mToday === m0);
  rec('排程月曆', '下一月 ›', '連按兩次：11月、12月', { mNext, mNext2 }, /11月/.test(mNext) && /12月/.test(mNext2));
  rec('排程月曆', '9 月無稽核', '9 月格內沒有稽核圖示', iconsPrev, iconsPrev === 0);
  const vendors = await full.locator('[class*=matrixTable] tbody tr td:nth-child(2)').allInnerTexts();
  const icons = await full.locator('[class*=matrixTable] [role=button]').evaluateAll(els => els.map(e => e.getAttribute('title')));
  const ev = await shot(full, 'A04-matrix');
  rec('排程月曆', '10 月排程列', '只列有稽核的 Active 承包商（Review Vendor）', vendors, JSON.stringify(vendors) === '["Review Vendor"]', ev);
  rec('排程月曆', '同日多筆稽核顯示', '10/01 同一承包商有 7 筆稽核，應能看到／點到每一筆', `10/01 格只顯示 ${icons.length} 個圖示：${icons.join(', ')}`,
    icons.length >= 7 ? true : '待確認', ev);
  const t0 = icons[0].split(':')[0];
  await full.locator('[class*=matrixTable] [role=button]').first().click();
  await full.waitForSelector('input[name=auditDocNo]', { timeout: 10000 }); await full.waitForTimeout(300);
  const opened = await docNo(full);
  rec('排程月曆', '點擊排程圖示', `開啟該筆稽核（${t0}）`, opened, opened === t0, await shot(full, 'A05-matrix-open'));
  await closeX(full).click(); await full.waitForTimeout(400);
});

// data for the vendor filter / pagination: one audit of a second contractor + 4 fillers (no contractor) -> 12 rows
const created = {};
await guard('建立測試資料', async () => {
  const base = { auditNo: '', status: 'Draft', date: '', end_date: '', contractor: '', selected_templates: [], custom_check_items: [], agenda: [] };
  const sv = await api(full, 'POST', '/api/audit/', { ...base, title: 'BTN second vendor', date: '2026-10-15', end_date: '2026-10-15', contractor: 'Second Vendor', vendor_id: 'btn-vendor-2', project_id: 'AHB-P1', project_name: 'Audit Review P1' });
  created.second = sv.body;
  for (let i = 1; i <= 4; i++) {
    const f = await api(full, 'POST', '/api/audit/', { ...base, title: `BTN filler ${i}`, project_id: 'AHB-P1', project_name: 'Audit Review P1' });
    if (f.status !== 200) console.log('filler create failed', f.status, JSON.stringify(f.body));
  }
  const v = await api(full, 'POST', '/api/audit/', { ...base, title: 'BTN delete me', project_id: 'AHB-P1', project_name: 'Audit Review P1' });
  const vv = await api(full, 'PUT', `/api/audit/${v.body.id}`, { ...v.body, status: 'Void' });
  created.voidDel = vv.body;
  if (v.status !== 200) console.log('void create failed', JSON.stringify(v.body));
  console.log('created', sv.status, v.status, vv.status, created.second?.auditNo, created.voidDel?.auditNo, created.voidDel?.status);
  await gotoList(full);
});

await guard('承包商篩選', async () => {
  const items = () => full.locator('[class*=vendorItem]');
  const texts = (await items().allInnerTexts()).map(s => s.replace(/\s+/g, ' ').trim());
  rec('承包商面板', '面板內容', '全部 13、Review Vendor 7、Second Vendor 1', texts,
    JSON.stringify(texts) === JSON.stringify(['全部 13', 'Review Vendor 7', 'Second Vendor 1']));
  await items().filter({ hasText: 'Second Vendor' }).click(); await full.waitForTimeout(400);
  const a = await dtNos(full); const mv = await full.locator('[class*=matrixTable] tbody tr td:nth-child(2)').allInnerTexts();
  const ev = await shot(full, 'A06-vendor-filter');
  rec('承包商面板', '點 Second Vendor', '清單只剩該承包商 1 筆；排程只剩該承包商', { rows: a, matrix: mv }, a.length === 1 && a[0] === created.second.auditNo && JSON.stringify(mv) === '["Second Vendor"]', ev);
  await items().filter({ hasText: 'Second Vendor' }).click(); await full.waitForTimeout(400);
  const b = await dtNos(full);
  rec('承包商面板', '再點一次 Second Vendor', '取消篩選，回到全部（第一頁 10 筆）', b.length, b.length === 10);
  await items().filter({ hasText: 'Review Vendor' }).click(); await full.waitForTimeout(400);
  const c = await dtNos(full);
  await items().filter({ hasText: '全部' }).click(); await full.waitForTimeout(400);
  const e = await dtNos(full);
  rec('承包商面板', '點 Review Vendor', '只列 7 筆 Review Vendor', c.length, c.length === 7 && c.every(n => SEEDED.includes(n)));
  rec('承包商面板', '點 全部', '取消篩選', e.length, e.length === 10);
});

await guard('分頁', async () => {
  // DataTable labels are translated now (AUDIT-BTNFIX): 「第 x／y 頁」, sr-only 第一頁 / 上一頁 / 下一頁 / 最後一頁
  const pageTxt = () => full.locator('div', { hasText: /^第 \d+／\d+ 頁$/ }).last().innerText();
  const pgBtn = name => full.locator('button', { has: full.locator('span.sr-only', { hasText: new RegExp(`^${name}$`) }) });
  const bar = await full.locator('body').innerText();
  rec('分頁', '分頁列文字（中文）', '「已選取 0／13 列」「每頁列數」「第 1／2 頁」，無英文殘留', { selected: (bar.match(/已選取 \d+／\d+ 列/) || [null])[0], perPage: bar.includes('每頁列數'), english: /Rows per page|row\(s\) selected|Page \d+ of/.test(bar) },
    /已選取 0／13 列/.test(bar) && bar.includes('每頁列數') && /第 1／2 頁/.test(bar) && !/Rows per page|row\(s\) selected|Page \d+ of/.test(bar));
  const p1 = { page: await pageTxt(), rows: (await dtNos(full)).length };
  await pgBtn('下一頁').click(); await full.waitForTimeout(300);
  const p2 = { page: await pageTxt(), rows: (await dtNos(full)).length };
  const ev = await shot(full, 'A07-page2', true);
  await pgBtn('上一頁').click(); await full.waitForTimeout(300);
  const p3 = { page: await pageTxt() };
  await pgBtn('最後一頁').click(); await full.waitForTimeout(300);
  const p4 = { page: await pageTxt() };
  await pgBtn('第一頁').click(); await full.waitForTimeout(300);
  const p5 = { page: await pageTxt(), prevDisabled: await pgBtn('上一頁').isDisabled() };
  rec('分頁', '初始', '第 1／2 頁，10 筆', p1, p1.page === '第 1／2 頁' && p1.rows === 10);
  rec('分頁', '下一頁 ›', '第 2／2 頁，3 筆', p2, p2.page === '第 2／2 頁' && p2.rows === 3, ev);
  rec('分頁', '上一頁 ‹', '回到第 1 頁', p3, p3.page === '第 1／2 頁');
  rec('分頁', '最後一頁 »', '第 2／2 頁', p4, p4.page === '第 2／2 頁');
  rec('分頁', '第一頁 «', '第 1 頁，上一頁停用', p5, p5.page === '第 1／2 頁' && p5.prevDisabled);
  await full.locator('button[role=combobox]', { hasText: '10' }).click();
  await full.locator('[role=option]', { hasText: '20' }).click(); await full.waitForTimeout(300);
  const p6 = { page: await pageTxt(), rows: (await dtNos(full)).length };
  rec('分頁', '每頁列數 10→20', '第 1／1 頁，13 筆', p6, p6.page === '第 1／1 頁' && p6.rows === 13);
});

await guard('欄位設定 View', async () => {
  const heads = () => full.locator('div.rounded-md.border table thead th').allInnerTexts();
  const viewBtn = () => full.locator('button', { hasText: /^檢視$/ });
  await viewBtn().click(); await full.waitForTimeout(300);
  const menu = await full.locator('[role=menuitemcheckbox]').allInnerTexts();
  const menuLabel = (await full.locator('[role=menu]').innerText()).split('\n')[0].trim();
  await full.locator('[role=menuitemcheckbox]', { hasText: 'location' }).click(); await full.waitForTimeout(300);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const h1 = await heads();
  const ev = await shot(full, 'A08-view-hide-location');
  await viewBtn().click(); await full.waitForTimeout(300);
  await full.locator('[role=menuitemcheckbox]', { hasText: 'location' }).click(); await full.waitForTimeout(300);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const h2 = await heads();
  rec('資料表', '檢視（欄位清單）', '按鈕「檢視」、選單標題「顯示欄位」、列出 7 個可隱藏欄位', { menuLabel, menu }, menuLabel === '顯示欄位' && menu.length === 7);
  rec('資料表', '檢視 取消勾選 location', '「地點」欄隱藏', h1, !h1.some(h => h.includes('地點')), ev);
  rec('資料表', '檢視 重新勾選 location', '「地點」欄恢復', h2, h2.some(h => h.includes('地點')));
});

await guard('欄位標題選單', async () => {
  const head = name => full.locator('div.rounded-md.border table thead button', { hasText: name });
  await head('稽核編號').click(); await full.waitForTimeout(300);
  const pop = await full.locator('[role=dialog]').last().innerText();
  await full.locator('[role=dialog] button', { hasText: '降冪排序' }).click(); await full.waitForTimeout(300);
  const desc = await dtNos(full);
  await full.locator('[role=dialog] button', { hasText: '升冪排序' }).click(); await full.waitForTimeout(300);
  const asc = await dtNos(full);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const cmp = (x, y) => x.localeCompare(y, undefined, { numeric: true });
  const nondecr = asc.every((v, i) => i === 0 || cmp(asc[i - 1], v) <= 0);
  rec('資料表', '欄標題選單（稽核編號）', '出現 升冪排序 / 降冪排序 / 隱藏此欄 / 篩選（無英文）', pop.replace(/\s+/g, ' '),
    ['升冪排序', '降冪排序', '隱藏此欄', '篩選'].every(x => pop.includes(x)) && !/Sort Asc|Sort Desc|Hide Column|Filter/.test(pop));
  rec('資料表', '降冪排序', '依編號遞減', desc.slice(0, 3), JSON.stringify(desc) === JSON.stringify([...asc].reverse()) && desc[0] !== asc[0]);
  rec('資料表', '升冪排序', '依編號遞增', asc.slice(0, 3), nondecr);
  // status filter
  await head('狀態').click(); await full.waitForTimeout(300);
  await full.locator('[role=dialog] [role=combobox]').click(); await full.waitForTimeout(200);
  await full.locator('[role=option]', { hasText: /^Closed$/ }).click(); await full.waitForTimeout(400);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const closed = await dtNos(full);
  const ev = await shot(full, 'A09-status-filter');
  await head('狀態').click(); await full.waitForTimeout(300);
  await full.locator('[role=dialog] [role=combobox]').click(); await full.waitForTimeout(200);
  await full.locator('[role=option]', { hasText: /^全部$/ }).click(); await full.waitForTimeout(400);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const all = await dtNos(full);
  rec('資料表', '狀態欄 篩選 = Closed', '只剩 2 筆 Closed', closed, closed.length === 2 && closed.includes('AHB-CLOSED-1') && closed.includes('AHB-AGENDA-CLOSED-1'), ev);
  rec('資料表', '狀態欄 篩選 = 全部', '回到全部', all.length, all.length === 13);
  // text filter on title
  await head('主旨').click(); await full.waitForTimeout(300);
  const ph = await full.locator('[role=dialog] input').getAttribute('placeholder');
  await full.locator('[role=dialog] input').fill('Agenda'); await full.waitForTimeout(400);
  const ag = await dtNos(full);
  await full.locator('[role=dialog] input').fill(''); await full.waitForTimeout(300);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  rec('資料表', '主旨欄 篩選文字', '提示文字「篩選主旨…」；輸入 Agenda 只剩 2 筆', { placeholder: ph, rows: ag }, ph === '篩選主旨…' && ag.length === 2);
  // contractor filter
  await head('承包商').click(); await full.waitForTimeout(300);
  await full.locator('[role=dialog] [role=combobox]').click(); await full.waitForTimeout(200);
  await full.locator('[role=option]', { hasText: /^Second Vendor$/ }).click(); await full.waitForTimeout(400);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const sv = await dtNos(full);
  const svEv = await shot(full, 'A09b-contractor-filter', true);
  await head('承包商').click(); await full.waitForTimeout(300);
  await full.locator('[role=dialog] [role=combobox]').click(); await full.waitForTimeout(200);
  await full.locator('[role=option]', { hasText: /^全部$/ }).click(); await full.waitForTimeout(400);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  rec('資料表', '承包商欄 篩選 = Second Vendor', '精確比對：只剩 Second Vendor 的 1 筆（不含沒有承包商的稽核）', sv, sv.length === 1 && sv[0] === created.second?.auditNo, svEv);
  // hide column from header, restore via View
  await head('稽核員').click(); await full.waitForTimeout(300);
  await full.locator('[role=dialog] button', { hasText: '隱藏此欄' }).click(); await full.waitForTimeout(300);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const h = await full.locator('div.rounded-md.border table thead th').allInnerTexts();
  await full.locator('button', { hasText: /^檢視$/ }).click(); await full.waitForTimeout(300);
  await full.locator('[role=menuitemcheckbox]', { hasText: 'auditor' }).click(); await full.waitForTimeout(300);
  await full.keyboard.press('Escape'); await full.waitForTimeout(200);
  const hBack = await full.locator('div.rounded-md.border table thead th').allInnerTexts();
  rec('資料表', '隱藏此欄（稽核員）', '「稽核員」欄隱藏，可由「檢視」恢復', { hidden: h, restored: hBack.some(x => x.includes('稽核員')) }, !h.some(x => x.includes('稽核員')) && hBack.some(x => x.includes('稽核員')));
});

await guard('開啟列', async () => {
  await openRow(full, 'AHB-DRAFT-1');
  const no = await docNo(full);
  rec('資料表', '點擊整列', '開啟該筆稽核精靈', no, no === 'AHB-DRAFT-1', await shot(full, 'A10-row-open'));
  await closeX(full).click(); await full.waitForTimeout(400);
  const editIcons = await full.locator(`${DT_ROWS} td:last-child button`).first().evaluate(td => td.parentElement.querySelectorAll('button').length);
  rec('資料表', '編輯圖示', '（任務提到「edit icon」）', `操作欄只有刪除鈕（每列 ${editIcons} 個按鈕），沒有編輯圖示；開啟只能點整列`, '待確認');
});

await guard('刪除', async () => {
  const draftTrash = dtRow(full, 'AHB-DRAFT-1').locator('td:last-child button');
  const dis = { disabled: await draftTrash.isDisabled(), title: await draftTrash.getAttribute('title') };
  // a disabled button gets no pointer events, so the tooltip that shows is the one on its wrapper div (AUDIT-BTNFIX)
  await draftTrash.scrollIntoViewIfNeeded();
  const bb = await draftTrash.boundingBox(); await full.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  dis.hoverTitle = await full.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[title]')?.getAttribute('title') || null, [bb.x + bb.width / 2, bb.y + bb.height / 2]);
  rec('資料表', '刪除鈕（非 Void 列）', '停用，滑鼠移上去提示「請先將此稽核作廢，才能刪除」', dis, dis.disabled && dis.title === '請先將此稽核作廢，才能刪除' && dis.hoverTitle === '請先將此稽核作廢，才能刪除');
  await draftTrash.click({ force: true }); await full.waitForTimeout(500);
  const openedByDisabled = await wizardOpen(full);
  rec('資料表', '點停用的刪除鈕', '不刪除、不開啟精靈', { wizardOpened: openedByDisabled, modal: await modal(full).count() }, !openedByDisabled,
    openedByDisabled ? await shot(full, 'A11-disabled-trash-opens') : '');
  if (openedByDisabled) { await closeX(full).click(); await full.waitForTimeout(400); }

  const vno = created.voidDel.auditNo;
  const trash = dtRow(full, vno).locator('td:last-child button');
  const en = { disabled: await trash.isDisabled(), title: await trash.getAttribute('title') };
  rec('資料表', '刪除鈕（Void 列）', '可按，提示「刪除」', en, !en.disabled && en.title === '刪除');
  await trash.click(); await full.waitForTimeout(400);
  const m = { modal: await modal(full).count(), text: (await modal(full).innerText().catch(() => '')).replace(/\s+/g, ' '), wizard: await wizardOpen(full) };
  const ev = await shot(full, 'A12-delete-confirm');
  rec('資料表', '刪除鈕 → 確認視窗', '出現 ConfirmModal「確認刪除／您確定要刪除此稽核嗎？」，不開啟精靈', m, m.modal === 1 && /確認刪除/.test(m.text) && /您確定要刪除此稽核嗎/.test(m.text) && !m.wizard, ev);
  await modal(full).locator('button', { hasText: '取消' }).click(); await full.waitForTimeout(400);
  const afterCancel = { modal: await modal(full).count(), row: await dtRow(full, vno).count() };
  rec('資料表', '確認視窗「取消」', '視窗關閉、資料仍在', afterCancel, afterCancel.modal === 0 && afterCancel.row === 1);
  await trash.click(); await full.waitForTimeout(300);
  await modal(full).locator('button', { hasText: '×' }).click(); await full.waitForTimeout(300);
  rec('資料表', '確認視窗「×」', '視窗關閉、資料仍在', { modal: await modal(full).count(), row: await dtRow(full, vno).count() },
    (await modal(full).count()) === 0 && (await dtRow(full, vno).count()) === 1);
  await trash.click(); await full.waitForTimeout(300);
  await modal(full).locator('button', { hasText: /^刪除$/ }).click(); await full.waitForTimeout(1200);
  const gone = { row: await dtRow(full, vno).count(), api: (await api(full, 'GET', `/api/audit/${created.voidDel.id}`)).status };
  rec('資料表', '確認視窗「刪除」', '列消失、API 回 404', gone, gone.row === 0 && gone.api === 404, await shot(full, 'A13-deleted'));
  const refuse = await api(full, 'DELETE', '/api/audit/ahb-ahb-draft-1');
  rec('API', 'DELETE 非 Void（audit_full）', '後端拒絕（400），資料保留', { status: refuse.status, detail: refuse.body?.detail }, refuse.status === 400 && (await api(full, 'GET', '/api/audit/ahb-ahb-draft-1')).status === 200);
});
await full.context().close();

// ======================================================================================
// B. 精靈第 1–5 步 (audit_full): build a new In Progress audit through the UI
// ======================================================================================
section = '精靈';
full = await login('audit_full');
await gotoList(full);
let newId = null, newNo = '';
await guard('第1步', async () => {
  await full.locator('button', { hasText: '新增稽核' }).click();
  await full.waitForSelector('input[name=auditTitle]');
  rec('第1步', '上一步', '第 1 步不顯示上一步', await foot(full, /上一步/).count(), (await foot(full, /上一步/).count()) === 0);
  await full.fill('input[name=auditTitle]', 'BTN 進行中稽核');
  await full.locator('select[name=projectId]').selectOption('AHB-P1');
  await full.locator('form select:not([name])').first().selectOption('ahb-vendor');
  await full.fill('input[name=auditStartDate]', '2026-10-21');
  await full.fill('input[name=auditEndDate]', '2026-10-20');
  const warned = await toast(full, /早於/);   // Chinese since AUDIT-BTNFIX (it used to be English)
  const tText = (await full.locator('[data-sonner-toast]').allInnerTexts()).join(' | ');
  rec('第1步', '結束日早於開始日', '跳出中文日期順序警告 toast（…早於…）', { warned, text: tText }, warned && !/is before/.test(tText), await shot(full, 'B01-date-warning'));
  await full.fill('input[name=auditEndDate]', '2026-10-22');
  await full.locator('select[name=status]').selectOption('In Progress');
  rec('第1步', '狀態下拉（新稽核）', '可選 In Progress', await full.locator('select[name=status]').inputValue(), (await full.locator('select[name=status]').inputValue()) === 'In Progress');
});

await guard('導覽', async () => {
  await foot(full, /下一步/).click(); await full.waitForTimeout(300);
  const a = { step: await curStep(full), h: await heading(full) };
  await foot(full, /上一步/).click(); await full.waitForTimeout(300);
  const b = { step: await curStep(full), title: await full.locator('input[name=auditTitle]').inputValue() };
  await step(full, 4);
  const c = { step: await curStep(full), h: await heading(full) };
  await step(full, 5);
  const e = { step: await curStep(full), next: await foot(full, /下一步/).count(), submit: await foot(full, /完成並建立計畫/).count() };
  const ev = await shot(full, 'B02-step5-footer');
  await step(full, 1);
  const f = { step: await curStep(full), title: await full.locator('input[name=auditTitle]').inputValue() };
  rec('導覽', '下一步', '第 1→2 步（人員與範圍）', a, a.step === 2 && /人員與範圍/.test(a.h));
  rec('導覽', '上一步', '回第 1 步，已填資料保留', b, b.step === 1 && b.title === 'BTN 進行中稽核');
  rec('導覽', '步驟列點第 4 步', '直接跳到「配置查檢表」', c, c.step === 4 && /配置查檢表/.test(c.h));
  rec('導覽', '步驟列點第 5 步', '第 5 步無「下一步」，顯示「完成並建立計畫」', e, e.step === 5 && e.next === 0 && e.submit === 1, ev);
  rec('導覽', '步驟列點第 1 步', '回第 1 步，資料保留', f, f.step === 1 && f.title === 'BTN 進行中稽核');
});

await guard('第2步', async () => {
  await step(full, 2);
  const vals = { projectDirector: '陳經理', techLead: '林工程師', leadAuditor: '王稽核', supportAuditors: '李稽核', location: '二號工區', auditCriteria: 'ISO 9001' };
  for (const [k, v] of Object.entries(vals)) await full.fill(`input[name=${k}]`, v);
  await full.fill('textarea[name=scopeDescription]', '收料與儲存');
  const ok = await full.evaluate(() => document.querySelector('input[name=leadAuditor]').value === '王稽核');
  rec('第2步', '人員／範圍欄位輸入', '7 個欄位皆可輸入', ok, ok, await shot(full, 'B03-step2'));
});

await guard('第3步 Agenda', async () => {
  await step(full, 3);
  const rows = () => full.locator('[data-agenda-row]').evaluateAll(rs => rs.map(r => {
    const v = [...r.querySelectorAll('input')].map(i => i.value);
    return { kind: r.dataset.agendaKind, date: v[0], start: v[1], end: v[2], item: v[3], auditor: v[5], bg: getComputedStyle(r).backgroundColor };
  }));
  const empty = await full.locator('form').getByText('尚未安排行程').count();
  rec('第3步', '空白議程', '顯示「尚未安排行程…」', empty, empty === 1);
  const pr = await printCheck(full, 'plan');
  rec('第3步', '列印稽核計畫（未儲存的新稽核）', '呼叫列印一次、列印內容為 plan', { calls: pr.calls, kind: pr.kind }, pr.calls === 1 && pr.kind === 'plan');
  rec('第3步', '匯出 Word（未儲存）', '新稽核首次儲存前不顯示 Word 鈕', await full.locator('[data-step-word=plan]').count(), (await full.locator('[data-step-word=plan]').count()) === 0);
  const add = () => full.locator('form button', { hasText: '新增一列' }).click();
  await add(); await full.waitForTimeout(200);
  const a = await rows();
  rec('第3步', '新增一列（新的一天）', '新增 2026-10-21 時段 + 灰底 12:00–13:00 Lunch Time；稽核員預設王稽核', a,
    a.length === 2 && a[0].kind === 'session' && a[0].date === '2026-10-21' && a[0].auditor === '王稽核' && a[1].kind === 'lunch'
    && a[1].start === '12:00' && a[1].end === '13:00' && a[1].item === 'Lunch Time' && a[1].bg !== a[0].bg, await shot(full, 'B04-agenda-lunch'));
  const inp = i => full.locator('[data-agenda-row]').nth(i).locator('input');
  await inp(0).nth(1).fill('09:00'); await inp(0).nth(2).fill('10:00'); await inp(0).nth(3).fill('文件審查');
  await add(); await full.waitForTimeout(200);
  const b = await rows();
  rec('第3步', '新增一列（同一天）', '接續 10/21、從 13:00 開始，不再加午餐', b, b.length === 3 && b[2].date === '2026-10-21' && b[2].start === '13:00' && b.filter(r => r.kind === 'lunch').length === 1);
  await inp(2).nth(2).fill('12:30'); await inp(2).nth(3).fill('現場查核');
  const bad = await full.locator('form').getByText('有時段的結束時間早於開始時間').count();
  const t = track(full);
  await foot(full, /儲存草稿/).click();
  const blocked = await toast(full, /有時段的結束時間早於開始時間/);
  await full.waitForTimeout(500); t.stop();
  rec('第3步', '結束早於開始 + 儲存草稿', '顯示紅字提示，儲存被擋（toast，無 POST）', { notice: bad, toast: blocked, posts: t.c.POST }, bad === 1 && blocked && t.c.POST === 0, await shot(full, 'B05-agenda-timeorder'));
  await inp(2).nth(2).fill('14:00');
  await full.locator('[data-agenda-row]').nth(2).locator('button').click(); await full.waitForTimeout(200);
  const c = await rows();
  rec('第3步', '刪除列（垃圾桶）', '該列移除', c.length, c.length === 2);
  await add(); await full.waitForTimeout(200);
  const di = inp(2).nth(0);
  await di.fill('2026-10-25'); await di.focus(); await di.blur(); await full.waitForTimeout(200);
  const e = await rows();
  const outside = await full.locator('form').getByText('部分日期不在稽核期間').count();
  rec('第3步', '日期改到期間外（10/25）', '黃色提示「部分日期不在稽核期間」，10/25 自動加午餐', { outside, lunches: e.filter(r => r.kind === 'lunch').map(r => r.date) },
    outside === 1 && e.filter(r => r.kind === 'lunch').map(r => r.date).sort().join() === '2026-10-21,2026-10-25', await shot(full, 'B06-agenda-outside'));
  const idx = e.findIndex(r => r.kind === 'session' && r.date === '2026-10-25');
  await full.locator('[data-agenda-row]').nth(idx).locator('button').click(); await full.waitForTimeout(200);
  const f = await rows();
  const leftover = f.filter(r => r.kind === 'lunch' && r.date === '2026-10-25').length;
  // AUDIT-BTNFIX #68: deleting a day's last session drops that day's untouched default lunch
  rec('第3步', '刪除當天唯一時段', '當天未修改的預設午餐一併移除', `刪除 10/25 唯一時段後，10/25 的預設午餐${leftover ? '仍留在議程' : '一併移除'}（共 ${f.length} 列）`, !leftover && f.length === 2);
  if (leftover) {
    const li = f.findIndex(r => r.kind === 'lunch' && r.date === '2026-10-25');
    await full.locator('[data-agenda-row]').nth(li).locator('button').click(); await full.waitForTimeout(200);
  }
  // the lunch row's own delete button: a new day (10/22) brings its lunch; delete the lunch, then the session
  await add(); await full.waitForTimeout(200);
  const d2 = inp((await rows()).length - 1).nth(0);
  await d2.fill('2026-10-22'); await d2.focus(); await d2.blur(); await full.waitForTimeout(200);
  const g0 = await rows();
  const lunch22 = g0.findIndex(r => r.kind === 'lunch' && r.date === '2026-10-22');
  if (lunch22 >= 0) { await full.locator('[data-agenda-row]').nth(lunch22).locator('button').click(); await full.waitForTimeout(200); }
  const g1 = await rows();
  rec('第3步', '刪除午餐列', '午餐列可刪除（當天的時段保留）', { before: g0.length, lunch22: lunch22 >= 0, after: g1.length, session22: g1.filter(r => r.kind === 'session' && r.date === '2026-10-22').length },
    lunch22 >= 0 && g1.length === g0.length - 1 && g1.filter(r => r.kind === 'lunch' && r.date === '2026-10-22').length === 0 && g1.filter(r => r.kind === 'session' && r.date === '2026-10-22').length === 1);
  const s22 = g1.findIndex(r => r.kind === 'session' && r.date === '2026-10-22');
  if (s22 >= 0) { await full.locator('[data-agenda-row]').nth(s22).locator('button').click(); await full.waitForTimeout(200); }
  const g = await rows();
  rec('第3步', '刪除後回到原議程', '剩 10/21 的時段 + 午餐 2 列', g.map(r => `${r.date} ${r.kind}`), g.length === 2);
});

await guard('儲存草稿（首次）', async () => {
  const t = track(full);
  await foot(full, /儲存草稿/).click(); await full.waitForTimeout(1800);
  const msg = await full.locator('[data-wizard-footer]').getByText(/進度已於/).count();
  const word = await full.locator('[data-step-word=plan]').count();
  t.stop();
  await step(full, 1); newNo = await docNo(full);
  const list = (await api(full, 'GET', '/api/audit/')).body;
  const rec1 = list.find(a => a.auditNo === newNo);
  newId = rec1?.id;
  rec('頁尾', '儲存草稿（新稽核首次）', 'POST 1 次、產生編號、顯示「進度已於…」、Word 鈕出現；狀態 In Progress、議程 2 列', { posts: t.c.POST, newNo, msg, word, status: rec1?.status, agenda: rec1?.agenda?.length },
    t.c.POST === 1 && !!newNo && msg === 1 && word === 1 && rec1?.status === 'In Progress' && rec1?.agenda?.length === 2, await shot(full, 'B07-saved-draft'));
  const t2 = track(full);
  await step(full, 2); await full.fill('input[name=location]', '二號工區 B');
  await foot(full, /儲存草稿/).click(); await full.waitForTimeout(1500);
  t2.stop();
  rec('頁尾', '儲存草稿（第二次）', 'PUT 1 次、不再 POST（不產生重複稽核）', t2.c, t2.c.PUT === 1 && t2.c.POST === 0);
  await step(full, 3);
});

await guard('第3步 列印/Word', async () => {
  const pr = await printCheck(full, 'plan');
  rec('第3步', '列印稽核計畫', '列印一次、kind=plan、內容含編號與議程', { calls: pr.calls, kind: pr.kind, hasNo: pr.text.includes(newNo), hasItem: pr.text.includes('文件審查') },
    pr.calls === 1 && pr.kind === 'plan' && pr.text.includes(newNo) && pr.text.includes('文件審查'));
  const w = await wordDownload(full, 'plan');
  rec('第3步', '匯出 Word（計畫）', `下載 ${newNo}-Plan.docx（docx、標題 內部稽核計畫）`, { file: w.file, kind: w.kind, zip: w.zip, title: w.text.includes('內部稽核計畫'), hasItem: w.text.includes('文件審查') },
    w.file === `${newNo}-Plan.docx` && w.kind === 'plan' && w.zip && w.text.includes('內部稽核計畫') && w.text.includes('文件審查'), w.ev);
});

await guard('第4步', async () => {
  await step(full, 4);
  // AUDIT-TEMPLATES R2: the chips are the template library's audit types; ticking one only marks the type
  const NAMES = ['ISO 9001:2015', 'ISO 45001', '品質管理程序書', '供應商評鑑表'];
  const chipAll = full.locator('form [data-template-chip]');
  await chipAll.first().waitFor({ timeout: 10000 });
  const chips = await chipAll.evaluateAll(es => es.map(e => e.getAttribute('data-template-chip')));
  rec('第4步', '稽核類型選項（模板庫）', '4 個：ISO 9001:2015 / ISO 45001 / 品質管理程序書 / 供應商評鑑表', chips, JSON.stringify(chips) === JSON.stringify(NAMES));
  const chip = n => full.locator(`form [data-template-chip="${n}"]`);
  const on = async n => (await chip(n).getAttribute('aria-pressed')) === 'true' && (await chip(n).getAttribute('class')).includes('bg-teal-600');
  const sel = full.locator('[data-add-form] select[data-clause-pick]');
  const qsel = full.locator('[data-add-form] select[data-question-pick]');
  const clause = full.locator('[data-add-form] textarea[data-new-clause]'), task = full.locator('[data-add-form] textarea[name=task]');
  const plus = full.locator('[data-add-form] [data-add-item]');
  const items = () => full.locator('form div[class*="h-[300px]"] > div.group');
  const itemTexts = () => items().evaluateAll(es => es.map(e => e.innerText.replace(/\s+/g, ' ')));
  const clauseOpts = () => sel.locator('option').evaluateAll(os => os.map(o => ({ v: o.value, t: o.textContent.trim(), g: o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null })));
  const pickClause = async no => {
    const v = (await clauseOpts()).find(o => o.v.endsWith(`::${no}`) && o.g === 'ISO 9001:2015')?.v;
    if (!v) throw new Error(`clause ${no} not in the dropdown`);
    await sel.selectOption(v); await full.waitForTimeout(150);
  };
  const o0 = await clauseOpts();
  rec('第4步', '未勾選類型時的條文下拉', '提示「請先在上方勾選稽核類型…」，只有「✎ 自訂題目」可選', o0.map(o => o.t),
    o0.length === 2 && o0[0].t.startsWith('請先在上方勾選稽核類型') && o0[1].v === 'custom' && o0[1].t.includes('自訂題目'));
  for (const n of NAMES) { await chip(n).click(); await full.waitForTimeout(100); }
  const emptyToast = await toast(full, /目前沒有查檢項目/, 3000);
  const allOn = await Promise.all(NAMES.map(on));
  const itemsAfterTick = await items().count();
  const batch = await full.locator('form [data-batch-pick]').evaluateAll(es => es.map(e => ({ name: e.getAttribute('data-batch-pick'), text: e.innerText.trim() })));
  await chip('ISO 45001').click(); await full.waitForTimeout(150);
  const after = await Promise.all(NAMES.map(on));
  rec('第4步', '稽核類型 chip 點選', '4 個皆可勾選（變色）；勾選只標記類型、不加入任何查檢項；空模板跳「目前沒有查檢項目」', { allOn, itemsAfterTick, emptyToast },
    allOn.every(Boolean) && itemsAfterTick === 0 && emptyToast);
  rec('第4步', '批次挑題按鈕', '只有含題目的已勾選類型出現「從 ISO 9001:2015 批次挑題」', batch,
    batch.length === 1 && batch[0].name === 'ISO 9001:2015' && batch[0].text === '從 ISO 9001:2015 批次挑題');
  rec('第4步', '稽核類型 chip 再點取消', 'ISO 45001 取消勾選，其餘保留', after, JSON.stringify(after) === '[true,false,true,true]', await shot(full, 'B08-templates'));

  // replaces the old fixed 20-clause ISO dropdown: clause (from the ticked types) + question dropdowns
  const o1 = await clauseOpts();
  const isoClauses = o1.filter(o => o.g === 'ISO 9001:2015');
  rec('第4步', '條文下拉（勾選 ISO 9001:2015 後）', '列出 ISO 9001:2015 的 59 個條文（編號＋標題）與「✎ 自訂題目」，沒有固定 20 條的舊清單', { iso: isoClauses.length, first: isoClauses[0]?.t, custom: o1.some(o => o.v === 'custom'), other: o1.filter(o => o.g && o.g !== 'ISO 9001:2015').length },
    isoClauses.length === 59 && /^4\.1\s+Understanding/.test(isoClauses[0]?.t || '') && o1.some(o => o.v === 'custom') && o1.filter(o => o.g && o.g !== 'ISO 9001:2015').length === 0);
  await pickClause('7.2');
  const q72 = await qsel.locator('option').evaluateAll(os => os.map(o => o.textContent.trim()));
  await qsel.selectOption({ index: 1 }); await full.waitForTimeout(150);
  const filled = { questions: q72, clause: (await clause.inputValue()).slice(0, 40), task: (await task.inputValue()).slice(0, 40) };
  rec('第4步', '條文下拉選 7.2 → 題目選「第 1 題」', '題目下拉有 全部（1 題）／第 1 題；選第 1 題自動帶入條文內容與查檢重點（仍可編輯）', filled,
    JSON.stringify(q72) === '["全部（1 題）","第 1 題"]' && filled.clause.startsWith('The organization shall:') && filled.task.startsWith('Show me how'));
  await plus.click(); await full.waitForTimeout(200);
  const n1 = await items().count();
  const card1 = (await itemTexts())[0] || '';
  rec('第4步', '新增（+）', '新增 1 筆（7.2，標示「來自模板：ISO 9001:2015」）、輸入欄清空', { items: n1, task: await task.inputValue(), clausePick: await sel.inputValue(), card: card1.slice(0, 80) },
    n1 === 1 && (await task.inputValue()) === '' && (await sel.inputValue()) === '' && card1.includes('7.2') && card1.includes('來自模板：ISO 9001:2015'));
  await pickClause('8.5.4'); await qsel.selectOption({ index: 1 }); await full.waitForTimeout(150);
  await task.press('Enter'); await full.waitForTimeout(200);
  const n2 = await items().count();
  rec('第4步', '查檢重點欄按 Enter', '等同新增（8.5.4 第 1 題）', { items: n2, card: ((await itemTexts())[1] || '').slice(0, 60) }, n2 === 2 && ((await itemTexts())[1] || '').includes('8.5.4'));
  await sel.selectOption('custom'); await full.waitForTimeout(150);
  const cno = full.locator('[data-add-form] input[name=no]');
  const customShown = await cno.count();
  await cno.fill('ZZZ');
  await cno.locator('xpath=following-sibling::button').click(); await full.waitForTimeout(150);
  const backToSelect = { select: (await sel.count()) === 1 && (await cno.count()) === 0, clausePick: await sel.inputValue(), clause: await clause.inputValue(), task: await task.inputValue() };
  rec('第4步', '✎ 自訂題目 → ✕', '自訂編號欄出現；按 ✕ 回到條文下拉、欄位清空', { customShown, ...backToSelect },
    customShown === 1 && backToSelect.select && backToSelect.clausePick === '' && backToSelect.clause === '' && backToSelect.task === '');
  await sel.selectOption('custom'); await full.waitForTimeout(150);
  await cno.fill('C-1'); await clause.fill('現場安全'); await task.fill('是否配戴安全帽？');
  await plus.click(); await full.waitForTimeout(200);
  const t3 = await itemTexts();
  rec('第4步', '自訂題目新增', '新增編號 C-1 的項目（不標示來自模板）', t3[2], t3.length === 3 && t3[2].includes('C-1') && t3[2].includes('是否配戴安全帽') && !t3[2].includes('來自模板'), await shot(full, 'B09-custom-items'));
  await plus.click(); await full.waitForTimeout(200);
  rec('第4步', '空白時按 +', '不新增', await items().count(), (await items().count()) === 3);

  // edit / cancel / save / custom-number edit / plain number input in edit mode
  const item = i => items().nth(i);
  await item(0).locator('button').first().click(); await full.waitForTimeout(200);
  await item(0).locator('textarea[name=task]').fill('人員資格是否有紀錄？（已修改）');
  await item(0).locator('button', { hasText: '儲存' }).click(); await full.waitForTimeout(200);
  const e1 = (await itemTexts())[0];
  rec('第4步', '編輯（筆）→ 儲存', '項目內容更新', e1, e1.includes('已修改'));
  await item(0).locator('button').first().click(); await full.waitForTimeout(200);
  await item(0).locator('textarea[name=task]').fill('不應保存的內容');
  await item(0).locator('button', { hasText: '取消' }).click(); await full.waitForTimeout(200);
  const e2 = (await itemTexts())[0];
  rec('第4步', '編輯 → 取消', '內容不變', e2, e2.includes('已修改') && !e2.includes('不應保存'));
  await item(2).locator('button').first().click(); await full.waitForTimeout(200);
  const customEdit = await item(2).locator('input[name=no]').inputValue().catch(() => null);
  await item(2).locator('button', { hasText: '取消' }).click(); await full.waitForTimeout(200);
  rec('第4步', '編輯自訂題目項目', '編輯列顯示編號輸入框（C-1）', customEdit, customEdit === 'C-1');
  await item(1).locator('button').first().click(); await full.waitForTimeout(200);
  const editRow = { selects: await item(1).locator('select').count(), noType: await item(1).locator('input[name=no]').getAttribute('type'), no: await item(1).locator('input[name=no]').inputValue() };
  await item(1).locator('input[name=no]').fill('9.1');
  await item(1).locator('textarea[name=clause]').fill('Monitoring, measurement, analysis and evaluation');
  await item(1).locator('button', { hasText: '儲存' }).click(); await full.waitForTimeout(200);
  const e3 = (await itemTexts())[1];
  rec('第4步', '編輯中改條文編號（純文字輸入，取代舊的 ISO 條文下拉）', '編輯列是純文字編號欄（無下拉）；改為 9.1 與新條文內容後儲存', { ...editRow, card: e3.slice(0, 90) },
    editRow.selects === 0 && editRow.noType === 'text' && editRow.no === '8.5.4' && e3.includes('9.1') && e3.includes('Monitoring') && !e3.includes('8.5.4'));
  // 「全部」: every question of a clause at once (4.1 has 2), then the duplicate guard, then delete them again
  await pickClause('4.1');
  const q41 = await qsel.inputValue();
  const preview = await full.locator('[data-add-form] [data-all-item]').count();
  const hideFields = await clause.count();
  await plus.click(); await full.waitForTimeout(200);
  const addedToast = await toast(full, /已從 ISO 9001:2015 帶入 2 項/);
  const n4 = await items().count();
  const t4 = await itemTexts();
  rec('第4步', '條文 4.1 → 題目「全部」→ +', '預設「全部（2 題）」、預覽 2 題（不顯示單題輸入欄）；按 + 一次加入 2 題並提示', { q: q41, preview, hideFields, items: n4, addedToast, tags: t4.slice(3).map(x => x.includes('4.1') && x.includes('來自模板：ISO 9001:2015')) },
    q41 === 'all' && preview === 2 && hideFields === 0 && n4 === 5 && addedToast && t4.slice(3).every(x => x.includes('4.1') && x.includes('來自模板：ISO 9001:2015')), await shot(full, 'B09b-all-questions'));
  await pickClause('4.1');
  const tagged = (await clauseOpts()).find(o => o.v.endsWith('::4.1'))?.t || '';
  await plus.click(); await full.waitForTimeout(200);
  const dupToast = await toast(full, /這一題已經在稽核中/);
  rec('第4步', '同一條文再按 +（全部）', '條文選項標示已加入；不重複加入、提示「這一題已經在稽核中」', { option: tagged, dupToast, items: await items().count() }, dupToast && (await items().count()) === 5);
  // back to an empty add form (the '' option is disabled): ✎ 自訂題目 then ✕
  await sel.selectOption('custom'); await full.waitForTimeout(100); await cno.locator('xpath=following-sibling::button').click(); await full.waitForTimeout(150);
  const before = await items().count();
  await item(before - 1).locator('button').nth(1).click(); await full.waitForTimeout(200);
  rec('第4步', '刪除項目（垃圾桶）', '項目移除', { before, after: await items().count() }, (await items().count()) === before - 1);
  await item(3).locator('button').nth(1).click(); await full.waitForTimeout(200);

  // save-blocking guards
  await task.fill('還沒按新增的問題');
  let t = track(full);
  await foot(full, /儲存草稿/).click();
  const g1 = await toast(full, /尚未按「新增」/); await full.waitForTimeout(400); t.stop();
  rec('第4步', '未按新增就儲存草稿', 'toast 提醒、不送出', { toast: g1, ...t.c }, g1 && t.c.PUT === 0 && t.c.POST === 0);
  await task.fill('');
  await item(0).locator('button').first().click(); await full.waitForTimeout(200);
  t = track(full);
  await foot(full, /儲存草稿/).click();
  const g2 = await toast(full, /正在編輯既有查檢項目/); await full.waitForTimeout(400); t.stop();
  rec('第4步', '編輯中就儲存草稿', 'toast 提醒、不送出', { toast: g2, ...t.c }, g2 && t.c.PUT === 0);
  await item(0).locator('button', { hasText: '取消' }).click(); await full.waitForTimeout(200);
  t = track(full);
  await full.locator('[data-step-word=checklist]').click();
  const g3 = await toast(full, /請先按「儲存草稿」再匯出/); await full.waitForTimeout(600); t.stop();
  rec('第4步', '有未儲存修改時按匯出 Word', 'toast 要求先儲存、不下載', { toast: g3, docx: t.c.docx }, g3 && t.c.docx === 0, await shot(full, 'B10-export-save-first'));
  t = track(full);
  await foot(full, /儲存草稿/).click(); await full.waitForTimeout(1500); t.stop();
  const saved = await getAudit(full, newId);
  const expTpl = NAMES.filter(n => n !== 'ISO 45001');
  rec('第4步', '儲存草稿', `類型 3 個（${expTpl.join(' / ')}）、查檢項 3 筆（7.2 / 9.1 / C-1）已儲存`, { put: t.c.PUT, templates: saved.selected_templates, nos: saved.custom_check_items.map(i => i.no) },
    t.c.PUT === 1 && JSON.stringify(saved.selected_templates) === JSON.stringify(expTpl) && JSON.stringify(saved.custom_check_items.map(i => i.no)) === '["7.2","9.1","C-1"]');
  const tags = saved.custom_check_items.map(i => i.templateItemId || null);
  rec('第4步', '模板題目來源標記（存檔）', '7.2 / 8.5.4 兩題帶 templateId + templateItemId；自訂題 C-1 不帶', tags,
    tags[0] === 'iso9001-7.2-1' && tags[1] === 'iso9001-8.5.4-1' && tags[2] === null && saved.custom_check_items[0].templateId != null && saved.custom_check_items[2].templateId == null);
  const pr = await printCheck(full, 'checklist');
  rec('第4步', '列印查檢表', '列印一次、kind=checklist、含查檢項', { calls: pr.calls, kind: pr.kind, hasItem: pr.text.includes('是否配戴安全帽') }, pr.calls === 1 && pr.kind === 'checklist' && pr.text.includes('是否配戴安全帽'));
  const w = await wordDownload(full, 'checklist');
  rec('第4步', '匯出 Word（查檢表）', `下載 ${newNo}-Checklist.docx（docx、標題 稽核查檢表）`, { file: w.file, kind: w.kind, zip: w.zip, title: w.text.includes('稽核查檢表'), hasItem: w.text.includes('是否配戴安全帽') },
    w.file === `${newNo}-Checklist.docx` && w.kind === 'checklist' && w.zip && w.text.includes('稽核查檢表') && w.text.includes('是否配戴安全帽'), w.ev);
});

await guard('第5步', async () => {
  await step(full, 5);
  const stats = () => full.locator('form div.grid-cols-4 > div').evaluateAll(cs => cs.map(c => c.querySelector('p.text-2xl').innerText.trim()));
  const s0 = await stats();
  rec('第5步', '統計卡', '總數 3、進度 0%、符合 0、不符合 0', s0, JSON.stringify(s0) === '["3","0%","0","0"]');
  const rowsL = () => full.locator('form table tbody tr');
  const btn = (i, title) => rowsL().nth(i).locator(`button[title="${title}"]`);
  const PASS = '符合 (Pass)', WARN = '注意/待改善 (!)', FAIL = '不符合 (X)';
  const active = async (i, title, cls) => (await btn(i, title).getAttribute('class')).includes(cls);
  const defaultWarn = await active(0, WARN, 'text-amber-500');
  await btn(0, PASS).click(); await btn(1, FAIL).click(); await btn(2, PASS).click(); await btn(2, WARN).click(); await full.waitForTimeout(200);
  const st = { r0pass: await active(0, PASS, 'text-green-600'), r1fail: await active(1, FAIL, 'text-red-600'), r2warn: await active(2, WARN, 'text-amber-500'), r2passOff: !(await active(2, PASS, 'text-green-600')) };
  const s1 = await stats();
  const upd = await rowsL().nth(0).locator('td').nth(4).innerText();
  rec('第5步', '未評估項目預設', '預設亮起「!」（待改善）', defaultWarn, defaultWarn);
  rec('第5步', 'Pass ✓ 按鈕', '第 1 列變綠色符合', st.r0pass, st.r0pass);
  rec('第5步', 'Fail ✕ 按鈕', '第 2 列變紅色不符合', st.r1fail, st.r1fail);
  rec('第5步', 'Warning ! 按鈕', '第 3 列由符合切回「!」', { warn: st.r2warn, passOff: st.r2passOff }, st.r2warn && st.r2passOff);
  rec('第5步', '統計即時更新', '符合 1、不符合 1、進度 67%', s1, s1[2] === '1' && s1[3] === '1' && s1[1] === '67%');
  rec('第5步', '更新日期欄', `改狀態後記錄今天 ${TODAY}`, upd.trim(), upd.trim() === TODAY, await shot(full, 'B11-step5-status'));
  const chips = full.locator('form div.no-print.p-4 button');
  const chipTexts = await chips.allInnerTexts();
  await chips.filter({ hasText: /^9\.1$/ }).click(); await full.waitForTimeout(200);
  const c1 = await rowsL().count();
  await chips.filter({ hasText: /^全部$/ }).click(); await full.waitForTimeout(200);
  const c2 = await rowsL().count();
  rec('第5步', '分類篩選 chip', '有 全部 / 7.2 / 9.1 / C-1；點 9.1 剩 1 列，點 全部 回 3 列', { chipTexts, c1, c2 },
    JSON.stringify(chipTexts) === '["全部","7.2","9.1","C-1"]' && c1 === 1 && c2 === 3);
  const search = full.locator('form div.no-print.p-4 input');
  await search.fill('Competence'); await full.waitForTimeout(200);
  const sc = await rowsL().count();
  const t = track(full);
  await search.press('Enter'); await full.waitForTimeout(600); t.stop();
  const stillOpen = await wizardOpen(full);
  await search.fill('zzz-none'); await full.waitForTimeout(200);
  const none = await full.locator('form').getByText('找不到符合條件的項目').count();
  const ev = await shot(full, 'B12-step5-noresults');
  await full.locator('form button', { hasText: '重設過濾條件' }).click(); await full.waitForTimeout(200);
  const reset = { search: await search.inputValue(), rows: await rowsL().count() };
  rec('第5步', '搜尋框', '輸入 Competence 剩 1 列', sc, sc === 1);
  rec('第5步', '搜尋框按 Enter', '不送出表單、精靈不關閉', { stillOpen, ...t.c }, stillOpen && t.c.PUT === 0);
  rec('第5步', '無結果 → 重設過濾條件', '顯示「找不到符合條件的項目」；重設後搜尋清空、回 3 列', { none, ...reset }, none === 1 && reset.search === '' && reset.rows === 3, ev);
  await rowsL().nth(0).locator('textarea').fill('Remark A 人員資格表已備');
  await full.fill('textarea[name=findings]', '整體符合，一項待改善。');
  const evid = await full.locator('form input[type=file]').count();
  rec('第5步', '證據／附件輸入', '（任務：有則測）', `第 5 步沒有任何檔案／證據上傳欄（input[type=file] = ${evid}），只有備註與稽核發現文字欄`, evid === 0 ? '待確認' : '未測');
  const pr = await printCheck(full, 'report');
  rec('第5步', '列印報告', '列印一次、kind=report、含備註與稽核發現（未儲存內容也印出）', { calls: pr.calls, kind: pr.kind, note: pr.text.includes('Remark A'), findings: pr.text.includes('整體符合') },
    pr.calls === 1 && pr.kind === 'report' && pr.text.includes('Remark A') && pr.text.includes('整體符合'));
  const t2 = track(full);
  await foot(full, /儲存草稿/).click(); await full.waitForTimeout(1500); t2.stop();
  const w = await wordDownload(full, 'report');
  rec('第5步', '匯出 Word（報告）', `下載 ${newNo}.docx（docx、標題 內部稽核報告、含備註與發現）`, { file: w.file, kind: w.kind, zip: w.zip, title: w.text.includes('內部稽核報告'), note: w.text.includes('Remark A'), findings: w.text.includes('整體符合') },
    w.file === `${newNo}.docx` && w.kind === 'report' && w.zip && w.text.includes('內部稽核報告') && w.text.includes('Remark A') && w.text.includes('整體符合'), w.ev);
  // final submit
  await rowsL().nth(1).locator('textarea').fill('兩份資格證明過期');
  const t3 = track(full);
  await foot(full, /完成並建立計畫/).click(); await full.waitForTimeout(1800); t3.stop();
  const closed = !(await wizardOpen(full));
  const saved = await getAudit(full, newId);
  await full.fill(SEARCH, newNo); await full.waitForTimeout(400);
  const listStatus = await dtRow(full, newNo).locator('td').nth(7).innerText().catch(() => null);
  await full.fill(SEARCH, ''); await full.waitForTimeout(300);
  rec('頁尾', '完成並建立計畫（第 5 步）', 'PUT 儲存並關閉精靈；狀態維持 In Progress；評估結果、備註、發現已存', { put: t3.c.PUT, closed, status: saved.status,
    statuses: saved.custom_check_items.map(i => i.status), notes: saved.custom_check_items.map(i => i.note || ''), findings: saved.findings, listStatus },
    t3.c.PUT === 1 && closed && saved.status === 'In Progress' && JSON.stringify(saved.custom_check_items.map(i => i.status)) === '["pass","fail","pending"]'
    && saved.custom_check_items[1].note === '兩份資格證明過期' && saved.findings === '整體符合，一項待改善。' && listStatus?.trim() === 'In Progress', await shot(full, 'B13-after-submit'));
});

await guard('關閉與未儲存提示', async () => {
  await openRow(full, newNo);
  await closeX(full).click(); await full.waitForTimeout(400);
  rec('精靈', '✕ 關閉（既有稽核、未修改）', '直接關閉、無提示', { open: await wizardOpen(full), modal: await modal(full).count() }, !(await wizardOpen(full)) && (await modal(full).count()) === 0);
  await openRow(full, newNo);
  await full.fill('input[name=auditTitle]', 'BTN 進行中稽核（未儲存）');
  await closeX(full).click(); await full.waitForTimeout(400);
  const m = { modal: await modal(full).count(), text: (await modal(full).innerText().catch(() => '')).replace(/\s+/g, ' ') };
  const ev = await shot(full, 'B14-unsaved-modal');
  rec('精靈', '✕ 關閉（有未儲存修改）', '出現「未儲存的變更」視窗，按鈕「留下並儲存」／「離開」', m, m.modal === 1 && /未儲存的變更/.test(m.text) && /留下並儲存/.test(m.text) && /離開/.test(m.text), ev);
  await modal(full).locator('button', { hasText: '留下並儲存' }).click(); await full.waitForTimeout(300);
  const stay = { open: await wizardOpen(full), modal: await modal(full).count(), title: await full.locator('input[name=auditTitle]').inputValue() };
  rec('精靈', '未儲存視窗「留下並儲存」', '視窗關閉、精靈保留修改內容', stay, stay.open && stay.modal === 0 && stay.title === 'BTN 進行中稽核（未儲存）');
  await closeX(full).click(); await full.waitForTimeout(300);
  await modal(full).locator('button', { hasText: '離開' }).click(); await full.waitForTimeout(500);
  const leave = { open: await wizardOpen(full), title: (await getAudit(full, newId)).title };
  rec('精靈', '未儲存視窗「離開」', '精靈關閉、修改未存（標題不變）', leave, !leave.open && leave.title === 'BTN 進行中稽核');
  // unsaved new check item (typed, not added) also guards the close
  await openRow(full, newNo); await step(full, 4);
  await full.locator('[data-add-form] textarea[name=task]').fill('未新增的問題');
  await closeX(full).click(); await full.waitForTimeout(400);
  const m2 = await modal(full).count();
  if (m2) await modal(full).locator('button', { hasText: '離開' }).click();
  await full.waitForTimeout(400);
  rec('精靈', '✕ 關閉（第 4 步有未新增的查檢項）', '同樣出現未儲存提示', m2, m2 === 1);
  // deep link: /audit?openId=... -> close goes back to the previous page
  await full.goto(UI + '/'); await full.waitForTimeout(800);
  await full.goto(UI + '/audit?openId=ahb-ahb-draft-1'); await full.waitForSelector('input[name=auditDocNo]', { timeout: 15000 });
  const dl = await docNo(full);
  await closeX(full).click(); await full.waitForTimeout(800);
  rec('精靈', '✕ 關閉（以 ?openId= 深連結開啟）', '開啟 AHB-DRAFT-1；關閉後回到前一頁（/）', { opened: dl, url: new URL(full.url()).pathname }, dl === 'AHB-DRAFT-1' && new URL(full.url()).pathname === '/');
});

await guard('狀態轉換即時鎖定', async () => {
  const c = await api(full, 'POST', '/api/audit/', { auditNo: '', status: 'Draft', date: '', end_date: '', title: 'BTN void live', project_id: 'AHB-P1', project_name: 'Audit Review P1', selected_templates: [], custom_check_items: [{ id: 1, no: '7.1', clause: 'Resources', task: 'x' }], agenda: [] });
  await gotoList(full);
  await openRow(full, c.body.auditNo);
  const opts = await full.locator('select[name=status] option').evaluateAll(os => os.map(o => o.value));
  rec('第1步', '狀態下拉（Draft 既有稽核）', '只列 Draft / Planned / Void（工作流程允許的）', opts, JSON.stringify(opts) === '["Draft","Planned","Void"]');
  await full.locator('select[name=status]').selectOption('Void');
  await foot(full, /儲存草稿/).click(); await full.waitForTimeout(1500);
  const st = { titleDisabled: await isDis(full.locator('input[name=auditTitle]')), saveDraft: await foot(full, /儲存草稿/).count(), status: (await getAudit(full, c.body.id)).status };
  await step(full, 5);
  st.submit = await foot(full, /完成並建立計畫/).count();
  rec('第1步', '狀態改 Void + 儲存草稿', '存成 Void 後精靈立即鎖定（欄位停用、儲存草稿與完成鈕消失）', st, st.status === 'Void' && st.titleDisabled && st.saveDraft === 0 && st.submit === 0, await shot(full, 'B15-void-live-lock'));
  await closeX(full).click(); await full.waitForTimeout(400);
  rec('精靈', '✕ 關閉（剛鎖定的稽核）', '直接關閉、無提示', { open: await wizardOpen(full), modal: await modal(full).count() }, !(await wizardOpen(full)) && (await modal(full).count()) === 0);
});

await guard('舊資料（僅專案名稱）', async () => {
  await openRow(full, 'AHB-LEGACY-1');
  const v = await full.locator('select[name=projectId]').inputValue();
  rec('第1步', '專案下拉（舊資料只有專案名稱）', '自動對應到 AHB-P1', v, v === 'AHB-P1');
  await closeX(full).click(); await full.waitForTimeout(400);
});
await full.context().close();

// ======================================================================================
// C. 狀態與權限
// ======================================================================================
section = '狀態與權限';
const STATES = [['Draft', 'AHB-DRAFT-1'], ['In Progress', 'AHB-EXPORT-1'], ['Closed', 'AHB-CLOSED-1'], ['Void', 'AHB-VOID-1']];
const probes = {};
for (const user of ['audit_full', 'audit_viewer']) {
  const p = await login(user);
  await gotoList(p);
  for (const [status, no] of STATES) {
    await guard(`${user} ${status}`, async () => {
      await openRow(p, no);
      const s = await probeWizard(p);
      probes[`${user}|${status}`] = s;
      const ev = await shot(p, `C-${user}-${status.replace(' ', '')}-step5`);
      await step(p, 4); const ev4 = await shot(p, `C-${user}-${status.replace(' ', '')}-step4`);
      const editable = user === 'audit_full' && (status === 'Draft' || status === 'In Progress');
      const lockedOk = s.step1.title && s.step1.project && s.step1.status && s.step2 && !s.step3.addRow && s.step3.rowDelete === 0
        && s.step4.chipDisabled && s.step4.clausePickDisabled && s.step4.taskDisabled && s.step4.plusDisabled && s.step4.batchPick === 0 && (s.step4.itemBtnsDisabled !== false)
        && (s.step5.passDisabled !== false) && (s.step5.noteDisabled !== false) && s.step5.findingsDisabled && s.saveDraft === 0 && s.submit === 0;
      const editOk = !s.step1.title && !s.step1.project && !s.step1.status && !s.step2 && s.step3.addRow && !s.step4.chipDisabled && !s.step4.clausePickDisabled && !s.step4.taskDisabled
        && !s.step4.plusDisabled && s.step4.itemBtnsDisabled === false && s.step5.passDisabled === false && s.step5.noteDisabled === false && !s.step5.findingsDisabled
        && s.saveDraft === 1 && s.submit === 1;
      const loc = `${user}／${status}（${no}）`;
      rec(loc, '編輯控制項（第 1–5 步欄位、Agenda 新增/刪除、模板、查檢項、Pass/Fail/!、備註、發現）', editable ? '全部可用' : '全部停用／隱藏（唯讀）',
        { step1: s.step1, step2AllDisabled: s.step2, step3: s.step3, step4: s.step4, step5: s.step5 }, editable ? editOk : lockedOk, ev4);
      rec(loc, '儲存草稿／完成並建立計畫', editable ? '顯示' : '隱藏', { saveDraft: s.saveDraft, submit: s.submit }, editable ? (s.saveDraft === 1 && s.submit === 1) : (s.saveDraft === 0 && s.submit === 0));
      rec(loc, '下一步／上一步／步驟列', '唯讀時仍可瀏覽各步', { back1: s.back1, next1: s.next1, afterNext: s.afterNext, afterBack: s.afterBack, next5: s.next5 },
        s.back1 === 0 && s.next1 === 1 && s.afterNext === 2 && s.afterBack === 1 && s.next5 === 0);
      rec(loc, '列印（第 3/4/5 步）＋匯出 Word', '三步皆有列印與 Word', [s.print3, s.word3, s.print4, s.word4, s.print5, s.word5], [s.print3, s.word3, s.print4, s.word4, s.print5, s.word5].every(x => x === 1), ev);
      rec(loc, '第 5 步分類篩選／搜尋', '仍可使用（只是瀏覽）', { chipDisabled: s.step5.chipDisabled, searchDisabled: s.step5.searchDisabled }, s.step5.chipDisabled === false && s.step5.searchDisabled === false);
      if (editable) rec(loc, '唯讀提示橫幅', '可編輯時不顯示唯讀橫幅', s.banner || '無橫幅', s.banner === null);
      if (status === 'Draft' && user === 'audit_full') {
        rec(loc, '狀態下拉選項', 'Draft / Planned / Void', s.step1.statusOptions, JSON.stringify(s.step1.statusOptions) === '["Draft","Planned","Void"]');
      }
      if (status === 'In Progress' && user === 'audit_full') {
        rec(loc, '狀態下拉選項', 'In Progress / Completed / Void', s.step1.statusOptions, JSON.stringify(s.step1.statusOptions) === '["In Progress","Completed","Void"]');
      }
      if (!editable) {
        // clicking a locked control does nothing
        await step(p, 5);
        const before = await p.locator('form table tbody tr').first().locator('button[title="不符合 (X)"]').getAttribute('class');
        await p.locator('form table tbody tr').first().locator('button[title="不符合 (X)"]').click({ force: true }).catch(() => {});
        await p.waitForTimeout(200);
        const after = await p.locator('form table tbody tr').first().locator('button[title="不符合 (X)"]').getAttribute('class');
        rec(loc, '點擊鎖定中的 Fail ✕', '沒有反應（狀態不變）', before === after ? '無變化' : '狀態被改變', before === after);
        const expKey = status === 'Closed' ? 'audit.wizard.readOnlyClosed' : status === 'Void' ? 'audit.wizard.readOnlyVoid' : 'audit.wizard.readOnlyNoPermission';
        rec(loc, '唯讀提示橫幅', `顯示唯讀橫幅（${expKey}）並說明原因`, s.banner || '畫面沒有唯讀橫幅', !!s.banner && s.banner.key === expKey && s.banner.text.length > 0);
        // the print + Word still work when read-only
        const pr = await printCheck(p, 'report');
        const w = await wordDownload(p, 'report');
        rec(loc, '列印報告＋匯出 Word（唯讀）', `列印 kind=report；下載 ${no}.docx`, { print: pr.kind, calls: pr.calls, file: w.file, zip: w.zip }, pr.calls === 1 && pr.kind === 'report' && w.file === `${no}.docx` && w.zip, w.ev);
      }
      await closeX(p).click(); await p.waitForTimeout(400);
      if (await modal(p).count()) {
        rec(loc, '✕ 關閉', '未修改應直接關閉', '出現未儲存提示', false);
        await modal(p).locator('button', { hasText: '離開' }).click(); await p.waitForTimeout(300);
      }
    });
  }
  if (user === 'audit_viewer') {
    await guard('viewer 清單', async () => {
      const add = await p.locator('button', { hasText: '新增稽核' }).count();
      rec('audit_viewer／清單', '新增稽核', '有建立權限 → 顯示', add, add === 1);
      const trash = await p.locator(`${DT_ROWS} td:last-child button`).evaluateAll(bs => bs.map(b => ({ dis: b.disabled, title: b.title })));
      const voidTrash = await dtRow(p, 'AHB-VOID-1').locator('td:last-child button');
      rec('audit_viewer／清單', '刪除鈕（含 Void 列）', '全部停用，提示「您沒有刪除稽核的權限」', { all: trash.length, disabled: trash.filter(t => t.dis).length, voidTitle: await voidTrash.getAttribute('title') },
        trash.every(t => t.dis && t.title === '您沒有刪除稽核的權限'), await shot(p, 'C-viewer-list'));
      const del = await api(p, 'DELETE', '/api/audit/ahb-ahb-void-1');
      rec('audit_viewer／API', 'DELETE Void 稽核', '403', del.status, del.status === 403);
      const put = await api(p, 'PUT', '/api/audit/ahb-ahb-draft-1', { title: 'viewer edit' });
      rec('audit_viewer／API', 'PUT 既有稽核', '403', put.status, put.status === 403);
    });
    await guard('viewer 新建', async () => {
      await p.locator('button', { hasText: '新增稽核' }).click();
      await p.waitForSelector('input[name=auditTitle]');
      const editableNew = !(await isDis(p.locator('input[name=auditTitle]'))) && (await foot(p, /儲存草稿/).count()) === 1;
      rec('audit_viewer／新稽核', '新稽核可編輯', '欄位可填、顯示儲存草稿', editableNew, editableNew);
      await p.fill('input[name=auditTitle]', 'BTN viewer create');
      await p.locator('select[name=projectId]').selectOption('AHB-P1');
      const t = track(p);
      await foot(p, /儲存草稿/).click(); await p.waitForTimeout(1800); t.stop();
      const st = { posts: t.c.POST, docNo: await docNo(p), notice: await p.getByText('稽核已建立。您沒有「更新稽核」權限').count(),
        saveDraft: await foot(p, /儲存草稿/).count(), titleDisabled: await isDis(p.locator('input[name=auditTitle]')) };
      rec('audit_viewer／新稽核', '儲存草稿（首次建立）', '建立成功（POST 1 次、有編號），之後轉唯讀並顯示黃色說明、儲存草稿消失', st,
        st.posts === 1 && !!st.docNo && st.notice === 1 && st.saveDraft === 0 && st.titleDisabled, await shot(p, 'C-viewer-created'));
      await closeX(p).click(); await p.waitForTimeout(400);
      rec('audit_viewer／新稽核', '✕ 關閉', '直接關閉、無提示', { open: await wizardOpen(p), modal: await modal(p).count() }, !(await wizardOpen(p)) && (await modal(p).count()) === 0);
    });
  }
  if (user === 'audit_full') {
    await guard('full API 鎖定', async () => {
      const a = await getAudit(p, 'ahb-ahb-closed-1');
      const put = await api(p, 'PUT', '/api/audit/ahb-ahb-closed-1', { ...a, title: 'changed' });
      rec('audit_full／API', 'PUT Closed 稽核（改標題）', '後端拒絕（400），資料不變', { status: put.status, detail: put.body?.detail }, put.status === 400 && (await getAudit(p, 'ahb-ahb-closed-1')).title === 'Closed in P2');
      const delClosed = await api(p, 'DELETE', '/api/audit/ahb-ahb-closed-1');
      rec('audit_full／API', 'DELETE Closed 稽核', '後端拒絕（400）', delClosed.status, delClosed.status === 400);
    });
  }
  await p.context().close();
}

await guard('audit_multi', async () => {
  const p = await login('audit_multi');
  await gotoList(p);
  const nos = (await api(p, 'GET', '/api/audit/')).body.map(a => a.auditNo);
  await openRow(p, 'AHB-DRAFT-1');
  const editable = !(await isDis(p.locator('input[name=auditTitle]'))) && (await foot(p, /儲存草稿/).count()) === 1;
  rec('audit_multi（限 2 專案）', '清單＋開啟 Draft', '看得到 P1/P2 的稽核（不含無專案的舊資料）；Draft 可編輯', { rows: nos.length, legacy: nos.includes('AHB-LEGACY-1'), editable }, nos.includes('AHB-DRAFT-1') && nos.includes('AHB-CLOSED-1') && editable, await shot(p, 'C-multi-draft'));
  await closeX(p).click(); await p.waitForTimeout(300);
  await p.context().close();
});

await browser.close();
writeFileSync(`${out}/results.json`, JSON.stringify({ probes, results: R }, null, 1));
const count = s => R.filter(r => r.status === s).length;
console.log(`\nPASS ${count('PASS')}  FAIL ${count('FAIL')}  待確認 ${count('待確認')}  觀察 ${count('觀察')}  未測 ${count('未測')}  SCRIPT-ERROR ${count('SCRIPT-ERROR')}`);
