// Audit module end-to-end smoke (isolated stack only) covering AUDIT-HARDENING A/B, AUDIT-CONTRACTORS and AUDIT-POLISH
// behaviour as a user sees it. Seeds: seed_audit_hardening_b_review.py + seed_audit_polish_review.py. English UI.
// Mutates data (creates audits, voids AHB-DRAFT-1, links AHB-LEGACY-1, deletes AHB-VOID-1) — run the read-mostly scripts
// (audit-polish-check / audit-print-check / audit-ime-enter-check) BEFORE this one.
// Usage: node audit-smoke-all.mjs <stack.json> <outDir>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const browser = await chromium.launch({ headless: true });

async function login(user) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('language', 'en'));
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await p.goto(UI + '/audit'); await p.waitForSelector("table:not([class*='matrixTable']) tbody tr", { timeout: 15000 }); await p.waitForTimeout(800);
  return p;
}
const api = (p, path) => p.evaluate(async path => { const r = await fetch(path, { credentials: 'include' }); let b = null; try { b = await r.json(); } catch (_) {} return { status: r.status, body: b }; }, path);
// the Audit List data table only (the schedule matrix is a table too, and its cells carry audit numbers)
const listTable = "table:not([class*='matrixTable'])";
const rows = p => p.evaluate(sel => [...document.querySelectorAll(`${sel} tbody tr`)].map(r => r.innerText.replace(/\s+/g, ' ').trim()), listTable);
const rowNos = async p => (await rows(p)).map(t => (t.match(/AHB-[A-Z]+-\d+/) || [])[0]).filter(Boolean).sort();  // seeded audits only
async function pickProject(p, name) {
  await p.locator('[class*="trigger"]').first().click();
  await p.getByText(name, { exact: true }).last().click();
  await p.waitForTimeout(1200);
}
async function openAudit(p, no) {
  await p.locator(`${listTable} tbody tr`, { hasText: no }).first().locator('td').nth(2).click();
  await p.waitForSelector('input[name=auditDocNo]', { timeout: 10000 });
}
const wizardState = p => p.evaluate(() => ({
  docNo: document.querySelector('input[name=auditDocNo]')?.value,
  project: document.querySelector('select[name=projectId]')?.value,
  statusOptions: [...(document.querySelector('select[name=status]')?.options || [])].map(o => o.value),
  locked: [...document.querySelectorAll('form fieldset')].every(f => f.disabled),
  saveVisible: [...document.querySelectorAll('button')].some(b => /Save Draft/.test(b.innerText)),
  notice: document.querySelector('.bg-amber-50')?.innerText || '',
  error: document.querySelector('.bg-red-50')?.innerText || '',
}));
const closeWizard = async p => { await p.locator('.fixed button:has(svg.lucide-x)').first().click(); await p.waitForTimeout(500); };
const contractorSelect = p => p.locator('select').filter({ has: p.locator('option', { hasText: 'Select Contractor' }) }).first();
const saveDraft = async p => { await p.locator('button', { hasText: 'Save Draft' }).first().click(); await p.waitForTimeout(1500); };

// ── audit_full: view/create/update/delete, unscoped, NO contractors:view:all ──────────────────────────────────────────
{
  const p = await login('audit_full');
  check('A1 list shows every seeded audit', JSON.stringify(await rowNos(p)) === JSON.stringify(['AHB-CLOSED-1', 'AHB-DRAFT-1', 'AHB-LEGACY-1', 'AHB-RETIRED-1', 'AHB-VOID-1', 'AHB-VOIDONLY-1']), JSON.stringify(await rowNos(p)));
  const contractorsApi = (await api(p, '/api/contractors/')).status;
  const panel = await p.evaluate(() => Object.fromEntries([...document.querySelectorAll('[class*="vendorItem"]')].map(el => [el.innerText.split('\n')[0].trim(), /pastUnfinished/.test(el.className)])));
  check('A2 contractor panel filled without contractors permission', contractorsApi === 403 && 'Review Vendor' in panel && 'Void Only Co' in panel, `contractorsApi=${contractorsApi} ${JSON.stringify(panel)}`);
  check('A3 overdue flag: past Draft yes, Void-only no', panel['Review Vendor'] === true && panel['Void Only Co'] === false, JSON.stringify(panel));
  const scheduleRows = await p.locator('[class*="matrixRow"]').count();
  check('A4 schedule has contractor rows', scheduleRows >= 1, `rows=${scheduleRows}`);

  await pickProject(p, 'Audit Review P1');
  const p1 = await rowNos(p);
  await pickProject(p, 'Audit Review P2');
  const p2 = await rowNos(p);
  check('A5 project switch re-fetches the list', JSON.stringify(p1) === JSON.stringify(['AHB-DRAFT-1', 'AHB-RETIRED-1', 'AHB-VOID-1', 'AHB-VOIDONLY-1']) && JSON.stringify(p2) === JSON.stringify(['AHB-CLOSED-1']), `P1=${p1} P2=${p2}`);

  // create in P1 with a contractor
  await pickProject(p, 'Audit Review P1');
  await p.locator('button', { hasText: 'Add Audit' }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  let w = await wizardState(p);
  check('A6 new audit: header project preselected, create statuses only', w.project === 'AHB-P1' && JSON.stringify(w.statusOptions) === JSON.stringify(['Draft', 'Planned', 'In Progress', 'Completed']), JSON.stringify(w));
  const pickerTexts = await contractorSelect(p).locator('option').allInnerTexts();
  check('A7 wizard contractor picker lists active contractors (not the inactive one)', pickerTexts.includes('Review Vendor') && !pickerTexts.includes('Retired Co'), JSON.stringify(pickerTexts));
  await p.fill('input[name=auditTitle]', 'smoke create');
  await contractorSelect(p).selectOption({ label: 'Review Vendor' });
  await p.fill('input[name=auditStartDate]', '2026-10-20');
  await saveDraft(p);
  w = await wizardState(p);
  const firstNo = w.docNo;
  check('A8 first Save Draft fills Audit No with the contractor prefix', /^QTS-RV-AUDIT-\d{6}$/.test(firstNo || '') && JSON.stringify(w.statusOptions) === JSON.stringify(['Draft', 'Planned', 'Void']), JSON.stringify(w));
  // set the status while still on step 1 (on the last step the earlier steps show a check icon instead of their number)
  await p.locator('select[name=status]').selectOption('Planned');
  // Enter in the last step's search must not save/close
  await p.locator('button', { hasText: /^4$/ }).first().click();  // last step
  const search = p.locator('input[placeholder*="Search items"]');
  const writes = [];
  const onReq = r => { if (r.method() !== 'GET' && r.url().includes('/api/audit')) writes.push(`${r.method()} ${r.url()}`); };
  p.on('request', onReq);
  await search.fill('x'); await search.press('Enter'); await p.waitForTimeout(1000);
  p.off('request', onReq);
  check('A9 Enter in the last-step search: wizard stays open, nothing saved', await search.count() === 1 && writes.length === 0, JSON.stringify(writes));
  await search.fill('');
  await p.locator('button[type=submit]').first().click();
  await p.waitForTimeout(1500);
  const created = (await api(p, '/api/audit/')).body.find(a => a.title === 'smoke create');
  check('A10 submit keeps the number, saves project + status', created && created.auditNo === firstNo && created.project_id === 'AHB-P1' && created.status === 'Planned' && created.vendor_id === 'ahb-vendor', JSON.stringify(created));

  // Void lock + delete only Void
  await pickProject(p, 'All Projects');
  const del = await p.evaluate(sel => Object.fromEntries([...document.querySelectorAll(`${sel} tbody tr`)].map(r => [((r.innerText.match(/AHB-[A-Z]+-\d+/) || [])[0]), r.querySelector('button')?.disabled])), listTable);
  check('A11 delete enabled only for Void audits', del['AHB-VOID-1'] === false && del['AHB-VOIDONLY-1'] === false && del['AHB-DRAFT-1'] === true && del['AHB-CLOSED-1'] === true, JSON.stringify(del));
  await openAudit(p, 'AHB-VOID-1'); w = await wizardState(p); await closeWizard(p);
  check('A12 Void audit is read-only', w.locked && !w.saveVisible && JSON.stringify(w.statusOptions) === '["Void"]', JSON.stringify(w));
  await openAudit(p, 'AHB-CLOSED-1'); w = await wizardState(p); await closeWizard(p);
  check('A13 Closed audit is read-only', w.locked && !w.saveVisible, JSON.stringify(w));
  await openAudit(p, 'AHB-DRAFT-1');
  await p.locator('select[name=status]').selectOption('Void'); await saveDraft(p);
  w = await wizardState(p); await closeWizard(p);
  check('A14 saving Draft as Void locks it immediately', w.locked && !w.saveVisible && (await api(p, '/api/audit/ahb-ahb-draft-1')).body.status === 'Void', JSON.stringify(w));
  await p.locator(`${listTable} tbody tr`, { hasText: 'AHB-VOID-1' }).first().locator('button').first().click();
  await p.waitForTimeout(600);
  const wizardOpenedByTrash = await p.locator('input[name=auditDocNo]').count();
  await p.getByRole('button', { name: 'Delete', exact: true }).last().click();
  await p.waitForTimeout(1200);
  check('A15 trash opens only the confirm dialog; delete removes the Void audit', wizardOpenedByTrash === 0 && (await api(p, '/api/audit/ahb-ahb-void-1')).status === 404 && !(await rowNos(p)).includes('AHB-VOID-1'));

  // legacy project link
  await openAudit(p, 'AHB-LEGACY-1'); w = await wizardState(p);
  await saveDraft(p); await closeWizard(p);
  const legacy = (await api(p, '/api/audit/ahb-ahb-legacy-1')).body;
  check('A16 legacy name-only audit shows + links its project on save', w.project === 'AHB-P1' && legacy.project_id === 'AHB-P1' && legacy.auditNo === 'AHB-LEGACY-1', `${w.project} ${JSON.stringify({ project_id: legacy.project_id, auditNo: legacy.auditNo })}`);

  // inactive contractor kept + refused save shows the reason
  await openAudit(p, 'AHB-RETIRED-1');
  const sel = await contractorSelect(p).evaluate(s => ({ value: s.value, text: s.options[s.selectedIndex]?.text }));
  await p.fill('input[name=auditEndDate]', '2026-08-01'); await saveDraft(p);
  w = await wizardState(p); await closeWizard(p);
  check('A17 inactive contractor stays selected in its own audit', sel.value === 'retired' && sel.text === 'Retired Co', JSON.stringify(sel));
  check('A18 refused save shows the backend reason', /Could not save: .*end_date/.test(w.error), w.error);

  // deep link
  await p.goto(`${UI}/audit?openId=AHB-CLOSED-1`);
  await p.waitForSelector('input[name=auditDocNo]', { timeout: 10000 });
  check('A19 ?openId= opens the audit and drops the parameter', (await p.inputValue('input[name=auditDocNo]')) === 'AHB-CLOSED-1' && !new URL(p.url()).search.includes('openId'), p.url());
  await p.screenshot({ path: `${out}/audit-full-deeplink.png` });
  await p.context().close();
}

// ── audit_viewer: view + create only ─────────────────────────────────────────────────────────────────────────────────
{
  const p = await login('audit_viewer');
  const titles = await p.evaluate(sel => [...document.querySelectorAll(`${sel} tbody tr button`)].map(b => `${b.disabled}|${b.title}`), listTable);
  check('B1 no delete permission: every trash disabled with the reason', titles.length > 0 && titles.every(t => t === 'true|You do not have permission to delete audits'), JSON.stringify([...new Set(titles)]));
  await openAudit(p, 'AHB-RETIRED-1'); let w = await wizardState(p); await closeWizard(p);
  check('B2 no update permission: existing audit read-only', w.locked && !w.saveVisible, JSON.stringify(w));
  await p.locator('button', { hasText: 'Add Audit' }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await p.fill('input[name=auditTitle]', 'viewer create'); await saveDraft(p);
  w = await wizardState(p);
  check('B3 create-only user: created, then read-only with a notice', !!w.docNo && w.locked && !w.saveVisible && /read-only/.test(w.notice), JSON.stringify(w));
  await p.context().close();
}

// ── audit_multi: scoped to both projects ─────────────────────────────────────────────────────────────────────────────
{
  const p = await login('audit_multi');
  await pickProject(p, 'Audit Review P2');
  await p.locator('button', { hasText: 'Add Audit' }).first().click();
  await p.waitForSelector('input[name=auditTitle]');
  await p.fill('input[name=auditTitle]', 'multi create'); await saveDraft(p);
  const w = await wizardState(p);
  const rec = (await api(p, '/api/audit/')).body.find(a => a.title === 'multi create');
  check('C1 multi-project user can create (project sent)', !!w.docNo && !w.error && rec?.project_id === 'AHB-P2', JSON.stringify({ docNo: w.docNo, error: w.error, project: rec?.project_id }));
  await p.context().close();
}

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
