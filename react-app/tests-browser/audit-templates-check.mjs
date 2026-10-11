// AUDIT-TEMPLATES-2026-001 R2 browser checks (isolated stack only; seeds: seed_audit_hardening_b_review.py,
// seed_audit_templates_review.py). Usage: node audit-templates-check.mjs <stack.json> <outDir>
// Flow (user's design 2026-10-11): a template chip = the audit type; the add form picks a clause, then all of its
// questions or one ("第 N 題"); "從 X 批次挑題" opens the picker for many clauses at once.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const INITIAL = ['ISO 9001:2015', 'ISO 45001', '品質管理程序書', '供應商評鑑表'];
let failures = 0;
const result = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 400) : ''}`); };
const browser = await chromium.launch({ headless: true });

async function login(user, language = 'zh') {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(lang => { localStorage.setItem('language', lang); }, language);
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  return p;
}
const api = (p, method, path, body) => p.evaluate(async ([m, u, b]) => {
  const csrf = (document.cookie.match(/(?:^|; )csrf_token=([^;]*)/) || [])[1];
  const headers = { ...(b ? { 'Content-Type': 'application/json' } : {}), ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) };
  const r = await fetch('/api' + u, { method: m, credentials: 'include', headers, body: b ? JSON.stringify(b) : undefined });
  return { status: r.status, body: await r.json().catch(() => null) };
}, [method, path, body]);
const open = async (p, id) => { await p.goto(UI + `/audit?openId=${id}`); await p.waitForSelector('input[name=auditDocNo]', { timeout: 15000 }); };
const step = async (p, n) => { await p.locator('.max-w-4xl button').nth(n - 1).click(); await p.waitForTimeout(400); };
const chips = p => p.$$eval('[data-template-chip]', els => els.map(e => ({ name: e.dataset.templateChip, on: e.getAttribute('aria-pressed') === 'true', text: e.innerText.trim() })));
const chip = (p, name) => p.locator(`[data-template-chip="${name}"]`);
const itemCards = p => p.locator('.custom-scrollbar > div.group').count();
const toasts = p => p.$$eval('[data-sonner-toast]', els => els.map(e => e.innerText.trim()));
const sawToast = (p, ...parts) => p.waitForFunction(ps => [...document.querySelectorAll('[data-sonner-toast]')].some(e => ps.every(x => e.innerText.includes(x))),
  parts, { timeout: 4000 }).then(() => true, () => false);
const saveDraft = async p => { await p.locator('button', { hasText: /儲存草稿/ }).first().click(); await p.waitForTimeout(1500); };
const clauseOptions = p => p.$$eval('[data-clause-pick] option', os => os.map(o => ({ value: o.value, text: o.textContent.trim() })));
const pickClause = async (p, no) => {
  const opt = (await clauseOptions(p)).find(o => o.value.endsWith(`::${no}`));
  await p.selectOption('[data-clause-pick]', opt.value); await p.waitForTimeout(250);
};
const pickQuestion = async (p, label) => { await p.selectOption('[data-question-pick]', { label }); await p.waitForTimeout(250); };
const visibleRecords = p => p.evaluate(() => [...document.querySelectorAll('tbody tr')].some(tr => !tr.closest('[data-audit-templates]') && tr.offsetParent !== null));

// 1. without audit:template:manage: no tab, templates readable, not writable; the wizard offers the 4 types
{
  const p = await login('audit_full');
  await p.goto(UI + '/audit'); await p.waitForSelector('table tbody tr', { timeout: 15000 });
  result('no manage permission: no 模板管理 tab', await p.locator('[data-audit-tab]').count() === 0);
  const list = await api(p, 'GET', '/audit/templates');
  result('no manage permission: GET /audit/templates = the 4 initial templates', list.status === 200 && JSON.stringify(list.body.map(t => t.name)) === JSON.stringify(INITIAL), JSON.stringify(list.body?.map?.(t => t.name)));
  const iso = list.body.find(t => t.name === 'ISO 9001:2015');
  const clauses = [...new Set(iso.items.map(i => i.no))];
  result('ISO 9001:2015 = the company checklist: 116 questions over 59 clauses, each with a clause title',
    iso.items.length === 116 && clauses.length === 59 && iso.items[0].title === 'Understanding the organization and its context' && iso.items.every(i => i.title && i.clause && i.task),
    `${iso.items.length} / ${clauses.length}`);
  const post = await api(p, 'POST', '/audit/templates', { name: 'Nope', items: [] });
  result('no manage permission: POST refused (403, permission — not CSRF)', post.status === 403 && /audit:template:manage|permission/i.test(JSON.stringify(post.body)), JSON.stringify(post));
  await open(p, 'ahb-tpl-1'); await step(p, 4);
  const c = await chips(p);
  const ph = (await clauseOptions(p))[0]?.text;
  result('wizard step 4: the 4 types, none ticked; the clause dropdown asks to tick a type first', JSON.stringify(c.map(x => x.name)) === JSON.stringify(INITIAL) && c.every(x => !x.on) && ph.includes('請先'), JSON.stringify({ c, ph }));
  await p.context().close();
}

// 2. template management tab
{
  const p = await login('audit_tpl_mgr');
  await p.goto(UI + '/audit'); await p.waitForSelector('[data-audit-tab=templates]', { timeout: 15000 });
  await p.locator('[data-audit-tab=templates]').click();
  await p.waitForSelector('[data-template-row]');
  const rows = await p.$$eval('[data-template-row]', els => els.map(e => e.dataset.templateRow));
  result('templates tab lists the 4 initial templates; the audit list is not shown', JSON.stringify(rows) === JSON.stringify(INITIAL) && !(await visibleRecords(p)), JSON.stringify(rows));
  await p.locator('[data-template-row="ISO 9001:2015"]').click();
  const firstTitle = await p.locator('[data-template-item]').first().locator('input').nth(1).inputValue();
  result('ISO 9001:2015 opens with 116 rows and a clause-title column', await p.locator('[data-template-item]').count() === 116 && firstTitle === 'Understanding the organization and its context', firstTitle);
  await p.screenshot({ path: `${out}/templates-tab-iso.png` });

  // new template with a clause title
  await p.locator('[data-template-new]').click();
  await p.fill('[data-template-name]', 'Site QA');
  let r = p.locator('[data-template-item]').nth(0);
  await r.locator('input').nth(0).fill('7.1'); await r.locator('input').nth(1).fill('Resources');
  await r.locator('textarea').nth(0).fill('The organization shall provide the resources'); await r.locator('textarea').nth(1).fill('Are resources provided?');
  await p.locator('[data-template-add-item]').click();
  r = p.locator('[data-template-item]').nth(1);
  await r.locator('input').nth(0).fill('7.1'); await r.locator('textarea').nth(1).fill('Is the site tidy?');
  await p.locator('[data-template-add-item]').click();   // a blank third row is dropped on save
  await p.locator('[data-template-save]').click(); await p.waitForTimeout(1000);
  const created = (await api(p, 'GET', '/audit/templates')).body.find(t => t.name === 'Site QA');
  result('new template saved: 2 items (blank row dropped), server ids, title kept', created && created.items.length === 2 && created.items.every(i => i.id)
    && created.items[0].title === 'Resources' && await sawToast(p, '模板已儲存'), JSON.stringify(created?.items));

  // duplicate name
  await p.locator('[data-template-new]').click();
  await p.fill('[data-template-name]', ' site qa ');
  await p.locator('[data-template-item]').nth(0).locator('textarea').nth(1).fill('x');
  await p.locator('[data-template-save]').click(); await p.waitForTimeout(800);
  result('a duplicate name (other case, spaces) is refused with a friendly message (not the raw backend text)', await sawToast(p, '已有同名的模板') && !(await toasts(p)).some(t => /already exists/.test(t)), JSON.stringify(await toasts(p)));
  await p.locator('[data-template-row="ISO 45001"]').click(); await p.waitForTimeout(300);
  if (await p.locator('[class*=modalOverlay]').count()) { await p.locator('[class*=modalOverlay] button', { hasText: '離開' }).click(); await p.waitForTimeout(300); }

  // R2 must-fix 1: leaving the tab with an unsaved edit asks; staying keeps it, leaving drops it, nothing lingers
  await p.fill('[data-template-name]', 'ISO 45001 edited');
  await p.locator('[data-audit-tab=records]').click(); await p.waitForTimeout(400);
  const asked = await p.locator('[class*=modalOverlay]').count() > 0;
  const stayButtons = await p.$$eval('[class*=modalOverlay] button', bs => bs.map(b => b.innerText.trim()));
  await p.locator('[class*=modalOverlay] button').filter({ hasNotText: '離開' }).first().click(); await p.waitForTimeout(300);
  const stayed = await p.inputValue('[data-template-name]').catch(() => null);
  result('unsaved template edit: switching to 稽核記錄 asks first; staying keeps the edit', asked && stayed === 'ISO 45001 edited', JSON.stringify({ asked, stayed, stayButtons }));
  await p.locator('[data-audit-tab=records]').click(); await p.waitForTimeout(300);
  await p.locator('[class*=modalOverlay] button', { hasText: '離開' }).click(); await p.waitForTimeout(400);
  const onRecords = await visibleRecords(p);
  await p.locator('[data-audit-tab=templates]').click(); await p.waitForSelector('[data-template-row]');
  await p.locator('[data-template-row="ISO 45001"]').click(); await p.waitForTimeout(300);
  const reloaded = await p.inputValue('[data-template-name]');
  result('choosing 離開: the records tab shows and the edit is dropped (reopened = saved name)', onRecords && reloaded === 'ISO 45001', JSON.stringify({ onRecords, reloaded }));
  // in-app navigation (a full page load would never show the app's own prompt — R2 review): the breadcrumb's first link
  await p.locator('nav[aria-label=breadcrumb] button, nav[aria-label=breadcrumb] a').first().click(); await p.waitForTimeout(500);
  result('after leaving the tab, in-app navigation away does not prompt (no stale guard)', !(await p.locator('[class*=modalOverlay]').count()) && new URL(p.url()).pathname !== '/audit', p.url());

  // deactivate 供應商評鑑表
  await p.goto(UI + '/audit'); await p.waitForSelector('[data-audit-tab=templates]'); await p.locator('[data-audit-tab=templates]').click(); await p.waitForSelector('[data-template-row]');
  await p.locator('[data-template-row="供應商評鑑表"]').click(); await p.waitForTimeout(200);
  await p.locator('[data-template-active]').uncheck();
  await p.locator('[data-template-save]').click(); await p.waitForTimeout(800);
  await p.locator('[data-template-row="ISO 45001"]').click(); await p.waitForTimeout(200);
  const afterDeactivate = await p.$$eval('[data-template-row]', els => els.map(e => e.dataset.templateRow));
  await p.getByText('顯示已停用').click(); await p.waitForTimeout(200);
  const withInactive = await p.$$eval('[data-template-row]', els => els.map(e => e.dataset.templateRow));
  result('a deactivated template leaves the list; 顯示已停用 shows it again', !afterDeactivate.includes('供應商評鑑表') && withInactive.includes('供應商評鑑表'), JSON.stringify({ afterDeactivate, withInactive }));
  await p.context().close();
}

// 3. wizard step 4: type chips, clause + question dropdowns, batch picker, untick
{
  const p = await login('audit_tpl_mgr');
  await open(p, 'ahb-tpl-1'); await step(p, 4);
  result('types offered: active templates only (供應商評鑑表 deactivated)', JSON.stringify((await chips(p)).map(x => x.name)) === JSON.stringify(['ISO 9001:2015', 'ISO 45001', '品質管理程序書', 'Site QA']));
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  const co = await clauseOptions(p);
  result('ticking ISO 9001:2015 only marks the type (no questions added); the clause dropdown lists its 59 clauses with titles',
    await itemCards(p) === 0 && (await chips(p))[0].on && co.filter(o => o.value.includes('::')).length === 59 && co[1].text.startsWith('4.1') && co[1].text.includes('Understanding the organization'),
    JSON.stringify(co.slice(0, 3)));
  result('a batch-pick button appears for the ticked type', await p.locator('[data-batch-pick="ISO 9001:2015"]').count() === 1);

  // clause 4.1, all of its questions
  await pickClause(p, '4.1');
  const qs = await p.$$eval('[data-question-pick] option', os => os.map(o => o.textContent.trim()));
  const preview = await p.locator('[data-all-item]').count();
  result('clause 4.1: question dropdown = 全部（2 題）, 第 1 題, 第 2 題; "all" previews both with clause text + question', JSON.stringify(qs) === '["全部（2 題）","第 1 題","第 2 題"]' && preview === 2, JSON.stringify({ qs, preview }));
  const [cl, qd] = await Promise.all([p.locator('[data-clause-pick]').boundingBox(), p.locator('[data-question-pick]').boundingBox()]);
  result('clause and question dropdowns sit side by side', Math.abs(cl.y - qd.y) < 2 && qd.x > cl.x + cl.width, JSON.stringify({ cl, qd }));
  await p.screenshot({ path: `${out}/wizard-add-all.png` });
  await p.locator('[data-add-item]').click(); await p.waitForTimeout(300);
  result('+ with 全部: both 4.1 questions added, notice', await itemCards(p) === 2 && await sawToast(p, '帶入 2 項'), JSON.stringify(await toasts(p)));
  const co41 = (await clauseOptions(p)).find(o => o.value.endsWith('::4.1')).text;
  result('a clause whose questions are all in the audit is marked （已加入）', co41.includes('已加入'), co41);

  // clause 4.3, one question, edited before adding
  await pickClause(p, '4.3'); await pickQuestion(p, '第 2 題');
  const filled = { clause: await p.inputValue('[data-new-clause]'), task: await p.inputValue('textarea[name=task]') };
  const grown = await p.$eval('textarea[name=task]', el => el.scrollHeight <= el.clientHeight + 1);
  result('one question fills clause text and question (text boxes grow to fit, no inner scrollbar)', filled.clause.startsWith('When determining this scope') && filled.task.startsWith('How have:') && grown, JSON.stringify(filled).slice(0, 200));
  await p.fill('textarea[name=task]', filled.task + '\nEdited before adding');
  await p.locator('[data-add-item]').click(); await p.waitForTimeout(300);
  result('the edited question is added', await itemCards(p) === 3 && (await p.locator('.custom-scrollbar > div.group').last().innerText()).includes('Edited before adding'));
  await pickClause(p, '4.3'); await pickQuestion(p, '第 2 題  （已加入）');
  await p.locator('[data-add-item]').click(); await p.waitForTimeout(300);
  result('adding the same question again: refused with a notice, no duplicate', await itemCards(p) === 3 && await sawToast(p, '已經在稽核中'));

  // custom question (no template)
  await p.selectOption('[data-clause-pick]', 'custom'); await p.waitForTimeout(200);
  await p.fill('input[name=no]', 'X.1'); await p.fill('[data-new-clause]', 'Project requirement'); await p.fill('textarea[name=task]', 'Is the HaiLong ITP followed?');
  await p.locator('[data-add-item]').click(); await p.waitForTimeout(300);
  result('✎ 自訂題目: free-text question added', await itemCards(p) === 4);

  // batch picker: present questions pre-ticked; add clause 4.4
  await p.locator('[data-batch-pick="ISO 9001:2015"]').click(); await p.waitForSelector('[data-template-picker]');
  const pre = await p.locator('[data-picker-count]').innerText();
  await p.locator('[data-picker-clause="4.4"]').check(); await p.waitForTimeout(150);
  const applyText = await p.locator('[data-picker-apply]').innerText();
  await p.screenshot({ path: `${out}/wizard-batch-picker.png` });
  await p.locator('[data-picker-apply]').click(); await p.waitForTimeout(300);
  result('batch picker: the 3 questions already in the audit are pre-ticked; ticking 4.4 adds its 3', pre.includes('3／116') && applyText.includes('新增 3') && await itemCards(p) === 7, JSON.stringify({ pre, applyText }));

  // fill two, then untick the type: unfilled ISO questions go, filled stay, custom stays, type stays ticked (kept)
  await step(p, 5);
  const rows = p.locator('tr', { has: p.locator('button[title="符合 (Pass)"]') });
  await rows.nth(0).locator('button[title="符合 (Pass)"]').click();
  await rows.nth(1).locator('textarea').fill('checked on site');
  await step(p, 4);
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  result('untick the type: 4 unfilled ISO questions removed, 2 filled kept (+ the custom one), type stays ticked because of them',
    await itemCards(p) === 3 && (await chips(p))[0].on && await sawToast(p, '已移除', '4 項') && await sawToast(p, '2 項已填寫'), JSON.stringify(await toasts(p)));
  await saveDraft(p);
  const saved = (await api(p, 'GET', '/audit/ahb-tpl-1')).body;
  result('saved: the type name kept, filled items keep templateId / templateItemId, the custom item has none',
    JSON.stringify(saved.selected_templates) === '["ISO 9001:2015"]' && saved.custom_check_items.filter(i => i.templateId).length === 2 && saved.custom_check_items.some(i => !i.templateId && i.no === 'X.1'),
    JSON.stringify(saved.selected_templates));

  // the template edited afterwards: the audit is untouched
  const tpls = (await api(p, 'GET', '/audit/templates')).body;
  const iso = tpls.find(t => t.name === 'ISO 9001:2015');
  const edit = await api(p, 'PUT', `/audit/templates/${iso.id}`, { name: 'ISO 9001:2015 Rev A', items: iso.items.slice(0, 3) });
  const again = (await api(p, 'GET', '/audit/ahb-tpl-1')).body;
  result('template renamed and cut to 3 items afterwards: the audit keeps its items unchanged', edit.status === 200 && JSON.stringify(again.custom_check_items) === JSON.stringify(saved.custom_check_items));
  // R2 must-fix 2: the renamed template is still recognised by its copies
  await open(p, 'ahb-tpl-1'); await step(p, 4);
  const c2 = await chips(p);
  result('reopened after the rename: "Rev A" shows ticked (its questions are in the audit); the old name shows as a leftover name',
    c2.find(x => x.name === 'ISO 9001:2015 Rev A')?.on && c2.find(x => x.name === 'ISO 9001:2015')?.on, JSON.stringify(c2));
  await api(p, 'PUT', `/audit/templates/${iso.id}`, { name: 'ISO 9001:2015', items: iso.items });
  await p.context().close();
}

// 3b. R2 review fixes: unticking a type clears the add form; the batch picker never removes copies of questions the
// template has dropped since
{
  const p = await login('audit_tpl_mgr');
  await open(p, 'ahb-ahb-draft-1'); await step(p, 4);
  const before = await itemCards(p);
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  await pickClause(p, '4.1');
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  const formAfter = { qPick: await p.locator('[data-question-pick]').count(), preview: await p.locator('[data-all-item]').count(), clause: await p.inputValue('[data-clause-pick]') };
  await p.locator('[data-add-item]').click(); await p.waitForTimeout(300);
  result('a clause picked, then its type unticked: the add form is cleared and + adds nothing', formAfter.qPick === 0 && formAfter.preview === 0 && formAfter.clause === '' && await itemCards(p) === before && !(await chips(p))[0].on, JSON.stringify(formAfter));
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  await pickClause(p, '4.2'); await pickQuestion(p, '第 1 題');
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  const taskAfter = await p.inputValue('textarea[name=task]');
  result('one question picked, then its type unticked: the fields are cleared too', taskAfter === '', taskAfter);

  await chip(p, 'Site QA').click(); await p.waitForTimeout(300);
  await p.locator('[data-batch-pick="Site QA"]').click(); await p.waitForSelector('[data-template-picker]');
  await p.locator('[data-picker-all]').check(); await p.locator('[data-picker-apply]').click(); await p.waitForTimeout(300);
  await saveDraft(p);
  const site = (await api(p, 'GET', '/audit/templates')).body.find(t => t.name === 'Site QA');
  const dropped = site.items[0];
  await api(p, 'PUT', `/audit/templates/${site.id}`, { items: [site.items[1], { no: '7.2', title: 'Competence', task: 'New question after the edit' }] });
  await open(p, 'ahb-ahb-draft-1'); await step(p, 4);
  await p.locator('[data-batch-pick="Site QA"]').click(); await p.waitForSelector('[data-template-picker]');
  await p.locator('[data-picker-all]').check(); await p.waitForTimeout(150);
  const applyText = await p.locator('[data-picker-apply]').innerText();
  await p.locator('[data-picker-apply]').click(); await p.waitForTimeout(300);
  const cards = await p.locator('.custom-scrollbar > div.group').allInnerTexts();
  result('batch picker after the template dropped a question: "新增 1、移除 0", and the old copy of the dropped question stays',
    applyText.includes('新增 1') && applyText.includes('移除 0') && cards.some(c => c.includes(dropped.task)) && cards.some(c => c.includes('New question after the edit')),
    JSON.stringify({ applyText, dropped: dropped.task }));
  await p.context().close();
}

// 4. an audit from before the library (names only)
{
  const p = await login('audit_tpl_mgr');
  await open(p, 'ahb-tpl-legacy-1'); await step(p, 4);
  const c = await chips(p);
  result('legacy audit: ISO 9001:2015 ticked by name, "Old supplier form" shown ticked', c.find(x => x.name === 'ISO 9001:2015')?.on && c.find(x => x.name === 'Old supplier form')?.on, JSON.stringify(c));
  await chip(p, 'Old supplier form').click(); await p.waitForTimeout(300);
  result('unticking a name the library does not have removes only the name', !(await chips(p)).some(x => x.name === 'Old supplier form') && await itemCards(p) === 1);
  await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(300);
  result('unticking ISO (nothing copied from it): the name goes, the hand-added item stays', await itemCards(p) === 1 && !(await chips(p)).find(x => x.name === 'ISO 9001:2015').on);
  await p.context().close();
}

// 5. English
{
  const p = await login('audit_tpl_mgr', 'en');
  await p.goto(UI + '/audit'); await p.waitForSelector('[data-audit-tab]');
  const tabs = await p.$$eval('[data-audit-tab]', els => els.map(e => e.innerText.trim()));
  await open(p, 'ahb-tpl-legacy-1'); await step(p, 4);
  if (!(await chips(p)).find(x => x.name === 'ISO 9001:2015')?.on) { await chip(p, 'ISO 9001:2015').click(); await p.waitForTimeout(200); }
  await pickClause(p, '4.2');
  const qs = await p.$$eval('[data-question-pick] option', os => os.map(o => o.textContent.trim()));
  result('English: tabs Audits / Templates; question dropdown All (2 questions) / Question 1 / Question 2', JSON.stringify(tabs) === '["Audits","Templates"]' && qs[0] === 'All (2 questions)' && qs[1] === 'Question 1', JSON.stringify({ tabs, qs }));
  await p.context().close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
