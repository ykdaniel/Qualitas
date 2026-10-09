// CONTRACTOR-OPTIONS-2026-001 browser checks (isolated stack only). Seeds: seed_audit_hardening_b_review.py
// (+ seed_audit_polish_review.py) + seed_contractor_options_review.py. English UI.
// Usage: node contractor-options-check.mjs <stack.json> <outDir>
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3]; mkdirSync(out, { recursive: true });
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
let failures = 0;
const check = (name, ok, extra = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 260) : ''}`); };
const browser = await chromium.launch({ headless: true });

async function login(user, path) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => localStorage.setItem('language', 'en'));
  const p = await ctx.newPage();
  await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
  await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
  await p.goto(UI + path); await p.waitForTimeout(1500);
  return p;
}
const api = (p, path) => p.evaluate(async path => { const r = await fetch(path, { credentials: 'include' }); return r.status; }, path);
// options of every <select> that lists a seeded contractor
const contractorSelectOptions = p => p.evaluate(() => [...document.querySelectorAll('select')]
  .map(s => [...s.options].map(o => o.text.trim()))
  .find(texts => texts.includes('Review Vendor') || texts.includes('Caps Active Co')) || []);

// 1. module-only user: NCR / OBS / PQP add forms list the active contractors
{
  const p = await login('module_user', '/ncr');
  check('module user: full contractor list still forbidden', (await api(p, '/api/contractors/')) === 403);
  for (const [path, button] of [['/ncr', 'Add New NCR'], ['/obs', 'Add New OBS'], ['/pqp', 'Add New Quality Plan']]) {
    await p.goto(UI + path); await p.waitForTimeout(1200);
    await p.getByRole('button', { name: button }).first().click(); await p.waitForTimeout(800);
    const opts = await contractorSelectOptions(p);
    check(`module user: ${path} add form lists contractors (incl. 'Active', excl. inactive)`,
      opts.includes('Caps Active Co') && opts.includes('Review Vendor') && !opts.includes('Retired Co'), JSON.stringify(opts));
    await p.screenshot({ path: `${out}/module-user${path.replace('/', '-')}.png` });
  }
  await p.context().close();
}

// 2. audit_full: the Audit wizard picker and vendor panel now count 'Active' contractors as active
{
  const p = await login('audit_full', '/audit');
  await p.locator('button', { hasText: 'Add Audit' }).first().click(); await p.waitForSelector('input[name=auditTitle]');
  const opts = await contractorSelectOptions(p);
  check("audit wizard picker includes the contractor stored as 'Active'", opts.includes('Caps Active Co') && !opts.includes('Retired Co'), JSON.stringify(opts));
  await p.context().close();
}

// 3. noi_writer: contact auto-fill comes from /noi/contractor-contact
{
  const p = await login('noi_writer', '/noi');
  check('noi writer: full contractor list still forbidden', (await api(p, '/api/contractors/')) === 403);
  await p.getByRole('button', { name: 'Add New NOI' }).first().click(); await p.waitForTimeout(1500);
  const contact = () => p.evaluate(() => {
    const byLabel = text => { const l = [...document.querySelectorAll('label')].find(x => x.textContent.trim().startsWith(text)); return l?.parentElement?.querySelector('input')?.value; };
    const contractor = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.text === 'Review Vendor'));
    return { contractor: contractor?.value, contact: byLabel('Contact Person'), phone: document.querySelector('input[type=tel]')?.value, email: document.querySelector('input[type=email]')?.value };
  });
  let c = await contact();
  check('NOI: default contractor (first active, by name) and its contact details pre-filled',
    c.contractor === 'Caps Active Co' && c.contact === 'Cathy Caps' && c.phone === '02-1111-2222' && c.email === 'cathy@caps.example.com', JSON.stringify(c));
  const contractorSelect = p.locator('select').filter({ has: p.locator('option', { hasText: 'Review Vendor' }) }).first();
  await contractorSelect.selectOption('Review Vendor'); await p.waitForTimeout(1200);
  c = await contact();
  check('NOI: changing contractor re-fills system-filled contact fields', c.contact === 'Rex Review' && c.phone === '03-3333-4444' && c.email === 'rex@review.example.com', JSON.stringify(c));
  await p.fill('input[type=tel]', '09-9999-9999');
  await contractorSelect.selectOption('Caps Active Co'); await p.waitForTimeout(1200);
  c = await contact();
  check('NOI: a contact field the user edited is kept on contractor change; the others follow', c.phone === '09-9999-9999' && c.contact === 'Cathy Caps' && c.email === 'cathy@caps.example.com', JSON.stringify(c));
  await p.screenshot({ path: `${out}/noi-contact-autofill.png` });
  await p.context().close();
}

// 3b. leave guard (R2): the async contact auto-fill is not a user change — same assertions as
//     forms-consistency-review.mjs Part A2 for NOI (heading, Cancel, no "Unsaved Changes", modal closed, zero POSTs);
//     plus the guard still fires for a real edit (an ordinary field, and a contact field).
{
  const p = await login('noi_writer', '/noi');
  let posts = 0;
  p.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/noi/')) posts++; });
  const openNew = async () => {
    await p.getByRole('button', { name: 'Add New NOI' }).first().click();
    await p.waitForTimeout(1500);  // contact auto-fill (GET /noi/contractor-contact) lands meanwhile
  };
  const cancel = async () => { await p.locator('button').filter({ hasText: /^(Cancel|Close)$/ }).first().click(); await p.waitForTimeout(500); };
  const promptCount = () => p.getByText('Unsaved Changes', { exact: false }).count();
  // the new-record modal's heading is t('noi.addTitle') = "Add NOI" (the list button is "Add New NOI")
  const modalOpen = async () => (await p.locator('h2').filter({ hasText: /^Add NOI$/ }).count()) > 0;

  await openNew();
  const heading = (await p.locator('h2').first().innerText()).trim();
  const openBefore = await modalOpen();
  const filled = await p.evaluate(() => document.querySelector('input[type=tel]')?.value);
  await cancel();
  const prompts = await promptCount();
  const openAfter = await modalOpen();
  check('NOI: blank new record (contacts auto-filled) -> Cancel shows NO unsaved prompt and closes, zero POSTs',
    heading === 'Add NOI' && openBefore && filled === '02-1111-2222' && prompts === 0 && !openAfter && posts === 0,
    `heading=${heading} openBefore=${openBefore} filledPhone=${filled} prompts=${prompts} openAfter=${openAfter} posts=${posts}`);

  await openNew();
  const remark = p.locator('textarea').first();
  await remark.fill('guard check');
  await cancel();
  const promptAfterEdit = await promptCount();
  check('NOI: after editing a field, Cancel still shows the unsaved prompt', promptAfterEdit > 0, `prompts=${promptAfterEdit}`);
  await p.screenshot({ path: `${out}/noi-guard-after-edit.png` });
  await p.context().close();
}
{
  const p = await login('noi_writer', '/noi');
  await p.getByRole('button', { name: 'Add New NOI' }).first().click(); await p.waitForTimeout(1500);
  await p.fill('input[type=tel]', '07-7777-7777');
  await p.locator('button').filter({ hasText: /^(Cancel|Close)$/ }).first().click(); await p.waitForTimeout(500);
  check('NOI: after editing a contact field, Cancel still shows the unsaved prompt', (await p.getByText('Unsaved Changes', { exact: false }).count()) > 0);
  await p.context().close();
}

// 4. contractor_admin: the Contractors page loads the full list itself (no longer preloaded app-wide)
{
  const p = await login('contractor_admin', '/contractors');
  const text = await p.evaluate(() => document.body.innerText);
  check('Contractors page lists full records (contact details visible)', text.includes('Caps Active Co') && text.includes('cathy@caps.example.com'), '');
  await p.screenshot({ path: `${out}/contractors-page.png` });
  await p.context().close();
}

await browser.close();
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
process.exit(failures ? 1 : 0);
