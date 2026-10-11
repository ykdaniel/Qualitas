// AUDIT-BTNFIX-2026-001 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py,
// seed_audit_agenda_review.py, seed_audit_btnfix_review.py). Usage: node audit-btnfix-check.mjs <stack.json> <outDir>
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
  await ctx.addInitScript(lang => { localStorage.setItem('language', lang); }, language);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'warning' && /Missing translation/.test(m.text())) console.log('WARN', m.text()); });
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 20000 });
  return p;
}
const DT_ROWS = 'div.rounded-md.border table tbody tr';
const gotoList = async (p, path = '/audit') => { await p.goto(UI + path); await p.waitForSelector('div.rounded-md.border table', { timeout: 20000 }); await p.waitForTimeout(800); };
const dtNos = p => p.locator(DT_ROWS).evaluateAll(rows => rows.filter(r => r.cells.length > 2).map(r => r.cells[1].innerText.trim()));
const dtRow = (p, no) => p.locator(DT_ROWS).filter({ has: p.locator('td:nth-child(2)', { hasText: new RegExp(`^${no}$`) }) });
const head = (p, text) => p.locator('div.rounded-md.border table thead th button').filter({ hasText: text }).first();
const wizardOpen = async p => (await p.locator('[data-wizard-header]').count()) > 0;
const open = async (p, id) => { await p.goto(UI + `/audit?openId=${id}`); await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 }); await p.waitForTimeout(300); };
const banner = async p => { const b = p.locator('[data-readonly-banner]'); return (await b.count()) ? { key: await b.getAttribute('data-readonly-banner'), text: (await b.innerText()).trim() } : null; };
const toast = async (p, re, timeout = 5000) => { try { await p.locator('[data-sonner-toast]').filter({ hasText: re }).first().waitFor({ timeout }); return true; } catch { return false; } };
async function filterColumn(p, title, option) {
  await head(p, title).click(); await p.waitForTimeout(300);
  await p.locator('[role=dialog] [role=combobox]').click(); await p.waitForTimeout(200);
  await p.locator('[role=option]', { hasText: option instanceof RegExp ? option : new RegExp(`^${option}$`) }).click(); await p.waitForTimeout(400);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
}

// 1. #36 contractor column filter: exact match, no audits without a contractor
{
  const p = await login('audit_full');
  await gotoList(p);
  await p.selectOption('select', '50').catch(() => {});
  const all = await dtNos(p);
  await filterColumn(p, '承包商', 'Second Vendor');
  const sv = await dtNos(p);
  await p.screenshot({ path: `${out}/contractor-filter-second-vendor.png` });
  result('#36 承包商欄篩選 Second Vendor：只剩 AHB-SV-1（沒有承包商的 AHB-NOVENDOR-1 不在內）', JSON.stringify(sv) === '["AHB-SV-1"]', JSON.stringify(sv));
  await filterColumn(p, '承包商', 'Review Vendor');
  const rv = await dtNos(p);
  const rvContractors = await p.locator(DT_ROWS).evaluateAll(rows => rows.map(r => r.cells[4]?.innerText.trim()));
  result('#36 承包商欄篩選 Review Vendor：每一列都是 Review Vendor，沒有「-」', rv.length > 0 && rvContractors.every(c => c === 'Review Vendor') && !rv.includes('AHB-NOVENDOR-1') && !rv.includes('AHB-SV-1'), JSON.stringify(rvContractors));
  await filterColumn(p, '承包商', /^(全部|All)$/);
  const back = await dtNos(p);
  result('#36 篩選改回「全部」：回到原本筆數', back.length === all.length, `${back.length} vs ${all.length}`);
  await filterColumn(p, '狀態', 'Void');
  const voids = await dtNos(p);
  result('#36 狀態欄篩選 Void：只剩 Void（精確比對同樣適用狀態欄）', voids.length >= 1 && voids.every(n => /VOID/.test(n)), JSON.stringify(voids));
  await filterColumn(p, '狀態', /^(全部|All)$/);

  // 2. #41 disabled trash: no wizard; the enabled one still opens the delete confirmation and nothing else
  const draftTrash = dtRow(p, 'AHB-DRAFT-1').locator('td:last-child button');
  // the tooltip of the disabled button: whatever is under the pointer at the button's centre carries the reason as title
  const hoverTitle = async (row, page = p) => { await row.scrollIntoViewIfNeeded(); const b = await row.boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    return page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[title]')?.getAttribute('title') || null, [b.x + b.width / 2, b.y + b.height / 2]); };
  const tipFull = await hoverTitle(draftTrash);
  result('灰色刪除鈕滑鼠移上去：提示「請先將此稽核作廢，才能刪除」', tipFull === '請先將此稽核作廢，才能刪除', tipFull);
  const tipVoid = await hoverTitle(dtRow(p, 'AHB-VOID-1').locator('td:last-child button'));
  result('可用的刪除鈕滑鼠移上去：提示「刪除」', tipVoid === '刪除', tipVoid);
  await draftTrash.click({ force: true }); await p.waitForTimeout(500);
  const openedFull = await wizardOpen(p);
  result('#41 audit_full 點 Draft 列的灰色刪除鈕：不開啟精靈', (await draftTrash.isDisabled()) && !openedFull);
  if (openedFull) { await p.locator('[data-wizard-header] button').first().click(); await p.waitForTimeout(400); }
  await p.locator(DT_ROWS).filter({ hasText: 'AHB-DRAFT-1' }).locator('td').nth(2).click(); await p.waitForTimeout(600);
  const rowOpens = await wizardOpen(p);
  result('#41 點同一列的其他欄位：仍會開啟精靈', rowOpens);
  if (rowOpens) { await p.locator('[data-wizard-header] button').first().click(); await p.waitForTimeout(400); }
  const voidTrash = dtRow(p, 'AHB-VOID-1').locator('td:last-child button');
  await voidTrash.click(); await p.waitForTimeout(500);
  const confirm = await p.locator('[class*=modalOverlay]').count();
  result('#41 點 Void 列可用的刪除鈕：跳出刪除確認，不開啟精靈', !(await voidTrash.isDisabled()) && confirm > 0 && !(await wizardOpen(p)));
  if (confirm) { await p.locator('[class*=modalOverlay] button', { hasText: '取消' }).click(); await p.waitForTimeout(300); }
  result('#41 取消刪除後 AHB-VOID-1 仍在清單', (await dtNos(p)).includes('AHB-VOID-1'));
  await p.context().close();

  const v = await login('audit_viewer');
  await gotoList(v);
  const vTrash = dtRow(v, 'AHB-VOID-1').locator('td:last-child button');
  await vTrash.scrollIntoViewIfNeeded(); const vb = await vTrash.boundingBox(); await v.mouse.move(vb.x + vb.width / 2, vb.y + vb.height / 2);
  const tipViewer = await v.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[title]')?.getAttribute('title') || null, [vb.x + vb.width / 2, vb.y + vb.height / 2]);
  result('audit_viewer 灰色刪除鈕滑鼠移上去：提示沒有刪除權限', !!tipViewer && /權限/.test(tipViewer), tipViewer);
  await vTrash.click({ force: true }); await v.waitForTimeout(500);
  result('#41 audit_viewer（無刪除權限）點 Void 列的灰色刪除鈕：不開啟精靈、不跳確認', (await vTrash.isDisabled()) && !(await wizardOpen(v)) && !(await v.locator('[class*=modalOverlay]').count()));
  await v.context().close();
}

// 3. read-only banner with the reason
{
  const p = await login('audit_full');
  for (const [id, key, text] of [['ahb-ahb-closed-1', 'audit.wizard.readOnlyClosed', '已結案'], ['ahb-ahb-void-1', 'audit.wizard.readOnlyVoid', '已作廢']]) {
    await open(p, id);
    const b = await banner(p);
    result(`唯讀橫幅 ${id}：${text}`, b && b.key === key && b.text.includes(text) && b.text.includes('唯讀'), JSON.stringify(b));
    await p.screenshot({ path: `${out}/banner-${id}.png` });
  }
  await open(p, 'ahb-ahb-draft-1');
  result('可編輯的 Draft（audit_full）：沒有唯讀橫幅', (await banner(p)) === null);
  await p.locator('.max-w-4xl button').nth(4).click(); await p.waitForTimeout(300);
  result('Draft 第 5 步也沒有橫幅', (await banner(p)) === null);
  await open(p, 'ahb-ahb-closed-1');
  await p.locator('.max-w-4xl button').nth(3).click(); await p.waitForTimeout(300);
  result('Closed 切到第 4 步：橫幅仍在', (await banner(p))?.key === 'audit.wizard.readOnlyClosed');
  await p.context().close();

  const v = await login('audit_viewer');
  await open(v, 'ahb-ahb-draft-1');
  const vb = await banner(v);
  result('audit_viewer 開 Draft：沒有修改權限的橫幅', vb?.key === 'audit.wizard.readOnlyNoPermission' && vb.text.includes('權限'), JSON.stringify(vb));
  await v.screenshot({ path: `${out}/banner-no-permission.png` });
  await open(v, 'ahb-ahb-closed-1');
  result('audit_viewer 開 Closed：以「已結案」為原因', (await banner(v))?.key === 'audit.wizard.readOnlyClosed');
  // create-only: a new audit has no banner until its first save, then the existing "created, no update" notice
  await gotoList(v);
  await v.locator('button', { hasText: /新增稽核|新增/ }).first().click(); await v.waitForSelector('input[name=auditTitle]');
  const before = await banner(v);
  await v.fill('input[name=auditTitle]', 'btnfix create-only');
  await v.locator('button', { hasText: /儲存草稿/ }).first().click(); await v.waitForTimeout(1500);
  const after = await banner(v);
  result('audit_viewer 新增稽核：存檔前沒有橫幅，存檔後顯示「已建立、無更新權限」', before === null && after?.key === 'audit.wizard.createdNoUpdateNotice', JSON.stringify({ before, after }));
  await v.context().close();

  const e = await login('audit_full', 'en');
  await open(e, 'ahb-ahb-closed-1');
  const eb = await banner(e);
  result('English: closed banner in English', eb?.text.includes('closed') && eb.text.includes('read-only'), JSON.stringify(eb));
  await e.context().close();
}

// 4. #68 agenda: deleting a day's last session drops that day's untouched default lunch
{
  const p = await login('audit_full');
  const rows = () => p.locator('[data-agenda-row]').evaluateAll(rs => rs.map(r => ({ kind: r.dataset.agendaKind, date: r.querySelector('input[type=date]').value, remarks: r.querySelectorAll('input')[6].value })));
  const addRow = () => p.locator('button', { hasText: '新增一列' }).click();
  const del = async kind => { await p.locator(`[data-agenda-row][data-agenda-kind=${kind}] button`).first().click(); await p.waitForTimeout(200); };
  const toStep3 = async () => { await open(p, 'ahb-agenda-1'); await p.locator('.max-w-4xl button').nth(2).click(); await p.waitForTimeout(300); };
  await toStep3();
  await addRow(); await p.waitForTimeout(200);
  const r1 = await rows();
  await del('session');
  const r2 = await rows();
  result('#68 新的一天新增一列（帶出午餐）→ 刪掉這一列：午餐一併移除', r1.length === 2 && r1.some(r => r.kind === 'lunch') && r2.length === 0, JSON.stringify({ r1, r2 }));
  await addRow(); await addRow(); await p.waitForTimeout(200);
  const r3 = await rows();
  await del('session');
  const r4 = await rows();
  result('#68 同一天還有其他行程：刪掉一列，午餐保留', r3.filter(r => r.kind === 'session').length === 2 && r4.length === 2 && r4.some(r => r.kind === 'lunch'), JSON.stringify({ r3, r4 }));
  await p.goto(UI + '/audit'); await p.waitForTimeout(300);   // drop the unsaved edits (leave the page)
  if (await p.locator('[class*=modalOverlay]').count()) { await p.locator('[class*=modalOverlay] button').last().click(); await p.waitForTimeout(300); }
  await toStep3();
  await addRow(); await p.waitForTimeout(200);
  await p.locator('[data-agenda-row][data-agenda-kind=lunch] input').nth(6).fill('keep'); await p.waitForTimeout(100);
  await del('session');
  const r5 = await rows();
  result('#68 使用者改過的午餐（備註 keep）：刪掉當天最後一個行程後保留', r5.length === 1 && r5[0].kind === 'lunch' && r5[0].remarks === 'keep', JSON.stringify(r5));
  await p.screenshot({ path: `${out}/agenda-edited-lunch-kept.png` });
  await p.context().close();
}

// 5. Chinese strings: date-order warning, DataTable labels (Audit + other modules), and English still English
{
  const p = await login('audit_full');
  await open(p, 'ahb-ahb-draft-1');
  const end = p.locator('input[name=auditEndDate]');
  await end.fill('2026-09-01'); await end.blur();
  result('日期先後警告為中文（結束日期早於開始日期）', await toast(p, /早於/), JSON.stringify(await p.locator('[data-sonner-toast]').allInnerTexts()));
  await p.screenshot({ path: `${out}/date-warning-zh.png` });
  await p.goto(UI + '/audit'); await p.waitForTimeout(300);
  if (await p.locator('[class*=modalOverlay]').count()) { await p.locator('[class*=modalOverlay] button').last().click(); await p.waitForTimeout(300); }
  await gotoList(p);
  const txt = await p.locator('body').innerText();
  result('Audit 清單：分頁、每頁列數、選取列數、檢視為中文', /第 \d+／\d+ 頁/.test(txt) && txt.includes('每頁列數') && /已選取 0／\d+ 列/.test(txt) && txt.includes('檢視') && !/Rows per page|row\(s\) selected|dataTable\./.test(txt));
  await head(p, '狀態').click(); await p.waitForTimeout(300);
  const menu = await p.locator('[role=dialog]').innerText();
  result('欄位標題選單：升冪／降冪排序、隱藏此欄、篩選為中文', ['升冪排序', '降冪排序', '隱藏此欄', '篩選'].every(s => menu.includes(s)) && !/Sort Asc|Hide Column/.test(menu), menu);
  await p.screenshot({ path: `${out}/audit-header-menu-zh.png` });
  await p.keyboard.press('Escape');
  await p.locator('button', { hasText: '檢視' }).click(); await p.waitForTimeout(300);
  result('「檢視」選單標題為「顯示欄位」', (await p.locator('[role=menu]').innerText()).includes('顯示欄位'));
  await p.keyboard.press('Escape');
  await p.screenshot({ path: `${out}/audit-list-zh.png` });
  await p.context().close();

  const l = await login('btnfix_lists');
  for (const [path, name] of [['/noi', 'NOI'], ['/osd', 'OSD'], ['/meeting-minutes', 'MeetingMinutes']]) {
    await gotoList(l, path);
    const t = await l.locator('body').innerText();
    result(`${name} 清單（共用 DataTable）：中文分頁、沒有英文殘留或未翻譯的鍵`, /第 \d+／\d+ 頁/.test(t) && t.includes('每頁列數') && !/Rows per page|dataTable\./.test(t));
    await l.screenshot({ path: `${out}/${name}-list-zh.png`, fullPage: true });
  }
  await l.context().close();

  const en = await login('btnfix_lists', 'en');
  await gotoList(en, '/noi');
  const te = await en.locator('body').innerText();
  result('English NOI list: pagination stays English (Page x of y, Rows per page, View)', /Page \d+ of \d+/.test(te) && te.includes('Rows per page') && te.includes('View'));
  await en.screenshot({ path: `${out}/NOI-list-en.png`, fullPage: true });
  await en.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
