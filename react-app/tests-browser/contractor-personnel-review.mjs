// CONTRACTOR-PERSONNEL-2026-001 browser acceptance, isolated stack only (8344/3344 via meeting-fix-vite-launcher.mjs,
// seed_contractor_personnel_review.py). Usage: CP_REVIEW_PASSWORD=... CP_EVIDENCE_DIR=... node tests-browser/contractor-personnel-review.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PW = process.env.CP_REVIEW_PASSWORD;
if (!PW) throw new Error('CP_REVIEW_PASSWORD not set — use the value the isolated stack was seeded with.');
const BASE = process.env.MTG_BASE || 'http://127.0.0.1:3344';
const OUT = process.env.CP_EVIDENCE_DIR || '/private/tmp/claude-501/contractor-personnel-evidence';
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString(), ...a);
let checks = 0;
const check = (v, msg) => { if (!v) throw new Error(`FAILED: ${msg}`); checks++; log('PASS', msg); };

// REFUSAL-DIALOG-2026-003: a failed save no longer shows a sonner toast; it opens the shared refusal
// dialog (react-app/src/components/Shared/RefusalDialog.tsx). Reads its parts; null if it never shows.
async function readRefusalDialog(p, timeout = 5000) {
    const dlg = p.locator('[data-testid="refusal-dialog"]');
    try { await dlg.waitFor({ state: 'visible', timeout }); } catch { return null; }
    return dlg.evaluate((el) => {
        const text = (n) => (n ? (n.textContent || '').trim() : '');
        const msg = el.querySelector('#refusal-dialog-message');
        const body = msg ? msg.parentElement : null;
        const paras = body ? Array.from(body.querySelectorAll(':scope > p')) : [];
        const original = paras.find((n) => n.getAttribute('lang') === 'en');
        const note = paras.find((n) => n !== msg && n !== original && /note/i.test(n.className));
        return {
            title: text(el.querySelector('#refusal-dialog-title')),
            message: text(msg),
            items: body ? Array.from(body.querySelectorAll('li')).map(text) : [],
            original: original ? text(original) : null,
            note: note ? text(note) : null,
            all: text(el),
        };
    });
}
// REFUSAL-DIALOG-2026-003: the dialog only closes on OK / × / Esc — close it so later steps are not blocked.
async function closeRefusalDialog(p) {
    const dlg = p.locator('[data-testid="refusal-dialog"]');
    if (await dlg.count() === 0) return;
    await dlg.getByRole('button', { name: 'OK', exact: true }).click();
    await dlg.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(15000);
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('dialog', d => d.accept());
const contractorWrites = [];
page.on('request', r => {
    if (['PUT', 'POST'].includes(r.method()) && /\/api\/contractors\/?$|\/api\/contractors\/CP-[A-Z]+$/.test(new URL(r.url()).pathname)) contractorWrites.push(r.url());
});

const login = async (username) => {
    await page.context().clearCookies();
    await page.addInitScript(() => localStorage.setItem('language', 'en'));
    await page.goto(`${BASE}/login`);
    await page.fill('#email', username);
    await page.fill('#password', PW);
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.includes('/login'), { waitUntil: 'commit' });
    await page.waitForTimeout(1000);
};
const api = (method, path, body) => page.evaluate(async ({ method, path, body }) => {
    const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1];
    const r = await fetch(path, { method, credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}) },
        body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json().catch(() => null) };
}, { method, path, body });
const modal = () => page.locator('[class*="modalContent"]').first();
const toasts = () => page.locator('[data-sonner-toast]').allTextContents().then(x => x.join(' | '));
const personnel = () => modal().locator('[data-personnel]');
const personNames = () => personnel().locator('tr[data-person]').evaluateAll(trs => trs.map(tr => tr.dataset.person));

// ═══ 1. Contractors page: a company's people — add, change, deactivate (no delete) ═══
log('=== 1. personnel list on the Contractors page ===');
await login('cp_admin');
await page.goto(`${BASE}/contractors`);
await page.waitForTimeout(800);
await page.locator('tr', { hasText: 'TECO' }).first().click();
await modal().waitFor();
await page.waitForTimeout(500);
check(await personnel().isVisible(), '1: the company form has a Personnel section');
check((await personNames()).length === 5 && !(await personNames()).includes('Former Staff'), `1: five active people, the one who left hidden (${(await personNames()).join(', ')})`);
await personnel().getByLabel(/Show inactive/).check();
check((await personNames()).includes('Former Staff'), '1: "Show inactive (1)" shows the one who left');
check(await personnel().locator('tr[data-person="Former Staff"]').evaluate(el => getComputedStyle(el).color) === 'rgb(148, 163, 184)', '1: … greyed');
await personnel().getByLabel(/Show inactive/).uncheck();
const newRow = () => personnel().locator('tr[data-person-new]');
await newRow().getByLabel('Name').fill('New Inspector');
await newRow().getByLabel('Position').fill('Inspector');
await newRow().getByLabel('Name').press('Enter');                      // inside the contractor form: must not submit it
await page.waitForTimeout(400);
check(await modal().isVisible() && contractorWrites.length === 0, '1: Enter in a personnel field does not submit the contractor form');
await newRow().getByRole('button', { name: 'Add' }).click();
await page.waitForTimeout(600);
check((await personNames()).includes('New Inspector') && /Person added\./.test(await toasts()), '1: a person is added at once (no form Save needed)');
await newRow().getByLabel('Name').fill('new inspector');
await newRow().getByRole('button', { name: 'Add' }).click();
await page.waitForTimeout(600);
// REFUSAL-DIALOG-2026-003: the duplicate name is a coded refusal (DUPLICATE_NAME, docType personnel) shown in the
// refusal dialog, not a toast; ContractorPersonnel's run() does not pass keepsInput, so there is no kept-input note.
const dupDialog = await readRefusalDialog(page);
check(dupDialog?.title === 'Cannot save' && dupDialog?.message === 'Person "new inspector" already exists. Use another name.'
    && dupDialog?.note === null && (await personNames()).filter(n => /new inspector/i.test(n)).length === 1,
    `1: the same name twice is refused with the reason in the refusal dialog (${JSON.stringify(dupDialog)})`);
check(await page.locator('[data-sonner-toast][data-type="error"]').count() === 0, '1: … and no error toast');
await closeRefusalDialog(page);
await newRow().getByLabel('Name').fill('');
const row = () => personnel().locator('tr[data-person="New Inspector"]');
await row().getByRole('button', { name: 'Change person' }).click();
await row().getByLabel('Position').fill('Senior Inspector');
await row().getByRole('button', { name: 'Apply' }).click();
await page.waitForTimeout(600);
check((await row().textContent()).includes('Senior Inspector'), '1: ✏️ changes the position');
await row().getByRole('button', { name: 'Change person' }).click();
await row().getByLabel('Position').fill('changed by mistake');
await row().getByLabel('Position').press('Escape');
check(await modal().isVisible() && (await row().textContent()).includes('Senior Inspector'), '1: Esc drops the change and keeps the form open');
await row().getByRole('button', { name: 'Deactivate' }).click();
await page.waitForTimeout(600);
check(!(await personNames()).includes('New Inspector') && /Deactivated/.test(await toasts()), '1: Deactivate takes the person off the active list');
check(await personnel().getByRole('button', { name: /^Delete/ }).count() === 0, '1: there is no delete for people');
await page.screenshot({ path: `${OUT}/01-personnel.png` });
await modal().getByRole('button', { name: 'Cancel' }).click();
await page.waitForTimeout(500);
// a company with people is not deleted
await page.locator('tr', { hasText: 'TECO' }).first().getByTitle('Delete').click();
await page.getByRole('button', { name: 'Delete' }).last().click();
await page.waitForTimeout(800);
// REFUSAL-DIALOG-2026-003: this deletes the COMPANY (people themselves are never deleted, only deactivated). Since
// REFUSAL-DIALOG-2026-001 batch 1 a refused delete opens the refusal dialog (Contractors.tsx showRefusal(err, 'delete')),
// so the old toast text was stale: the backend's coded CONTRACTOR_DELETE_HAS_PERSONNEL counts every person on the list,
// inactive ones included — on a fresh seed 5 active + "Former Staff" + "New Inspector" (deactivated above) = 7. No note on a delete.
const delDialog = await readRefusalDialog(page);
check(delDialog?.title === 'Cannot delete'
    && delDialog?.message === 'Contractor TECO has 7 people on its personnel list. Set it inactive instead of deleting it.'
    && delDialog?.note === null, `1: deleting a company with people is refused, with the reason in the refusal dialog (${JSON.stringify(delDialog)})`);
await closeRefusalDialog(page);
check(await page.locator('tr', { hasText: 'TECO' }).count() > 0, '1: … and TECO is still there');

// ═══ 2. Meeting attendees: company, then one of its people; position follows ═══
log('=== 2. attendee picker ===');
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(800);
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await modal().waitFor();
const field = (label) => modal().locator(`xpath=.//label[normalize-space()="${label}"]/following-sibling::*[1]`);
await field('Subject').fill('CP attendees');
await field('Contractor').selectOption('Hailong Construction');
await modal().getByRole('tab', { name: /^Attendees/ }).click();
const picker = () => modal().locator('[data-attendee-picker]');
const company = () => picker().getByLabel('Company');
const name = () => picker().getByLabel('Name');
const position = () => picker().getByLabel('Position');
const listOptions = (id) => page.locator(`datalist#${id} option`).evaluateAll(os => os.map(o => o.value));
const companyOptions = await listOptions('meeting-attendee-companies');   // the stack's base seed adds companies A / B / C
check(['EC', 'HL', 'TECO'].every(c => companyOptions.includes(c)) && !companyOptions.includes('Hailong Construction'), `2: companies offered by short name (${companyOptions.join(',')})`);
await company().fill('TECO');
await page.waitForTimeout(600);
const tecoList = await name().getAttribute('list');
const tecoPeople = await listOptions(tecoList);
check(tecoPeople.length === 5 && tecoPeople.includes('曾耀葦(Toby Tseng)') && !tecoPeople.includes('Former Staff') && !tecoPeople.includes('New Inspector'),
    `2: TECO's active people are offered (${tecoPeople.join(', ')})`);
await name().fill('曾耀葦(Toby Tseng)');
check(await position().inputValue() === 'QAQC Manager' && await picker().locator('[data-from-list]').isVisible(), '2: picking a person fills the position and says it comes from the list');
check(await picker().getByLabel(/personnel list/).count() === 0, '2: no "add to list" box for someone already on it');
await picker().getByRole('button', { name: 'Add' }).click();
await company().fill('Hailong Construction');
await page.waitForTimeout(600);
await name().fill('Daniel Huang');
check(await position().inputValue() === 'Quality Manager', '2: the full company name works too');
await picker().getByRole('button', { name: 'Add' }).click();
// a name not on the list: typed, and put on the list at the same time
await company().fill('TECO');
await name().fill('Visiting Engineer');
await position().fill('Visitor');
const addBox = picker().getByLabel('Add to the TECO personnel list');
check(await addBox.isVisible(), '2: for a typed name, "Add to the TECO personnel list" is offered');
await addBox.check();
await picker().getByRole('button', { name: 'Add' }).click();
await page.waitForTimeout(800);
check(/Visiting Engineer added to the TECO personnel list\./.test(await toasts()), '2: … and adding puts them on the list');
check((await api('GET', '/api/contractors/personnel/options?contractor_id=CP-TECO')).body.some(p => p.name === 'Visiting Engineer' && p.position === 'Visitor'), '2: … stored with the position');
await company().fill('Empty Co');
await page.waitForTimeout(600);
check(await picker().locator('[data-no-people]').isVisible(), '2: a company with nobody listed says so (type the name)');
await company().fill('Random Ltd');
await name().fill('Walk-in Guest');
check(await picker().getByLabel(/personnel list/).count() === 0, '2: a company not on the contractor list: no "add to list" box');
await picker().getByRole('button', { name: 'Add' }).click();
const attendeeRows = await modal().locator('[data-attendees] tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].slice(0, 3).map(c => c.innerText.trim()).join(' / ')));
check(JSON.stringify(attendeeRows) === JSON.stringify(['TECO / 曾耀葦(Toby Tseng) / QAQC Manager', 'HL / Daniel Huang / Quality Manager',
    'TECO / Visiting Engineer / Visitor', 'Random Ltd / Walk-in Guest / -']), `2: the attendee table (${attendeeRows.join(' | ')})`);
await page.screenshot({ path: `${OUT}/02-attendees.png` });
await modal().getByRole('button', { name: /^Save$/ }).click();
await page.waitForTimeout(2000);
const saved = (await api('GET', '/api/meeting-minutes/')).body.find(m => m.title === 'CP attendees');
const people = (await api('GET', '/api/contractors/personnel/options')).body;
const idOf = (n) => people.find(p => p.name === n)?.id;
const norm = (list) => (list || []).map(x => ({ company: x.company, name: x.name, role: x.role, contractorId: x.contractorId, personnelId: x.personnelId }));
check(!!saved && JSON.stringify(norm(saved.attendees)) === JSON.stringify(norm([
    { company: 'TECO', name: '曾耀葦(Toby Tseng)', role: 'QAQC Manager', contractorId: 'CP-TECO', personnelId: idOf('曾耀葦(Toby Tseng)') },
    { company: 'HL', name: 'Daniel Huang', role: 'Quality Manager', contractorId: 'CP-HL', personnelId: idOf('Daniel Huang') },
    { company: 'TECO', name: 'Visiting Engineer', role: 'Visitor', contractorId: 'CP-TECO', personnelId: idOf('Visiting Engineer') },
    { company: 'Random Ltd', name: 'Walk-in Guest', role: '' },
])), `2: stored as text snapshots plus the ids (${JSON.stringify(saved?.attendees)})`);
// a rename later does not change the meeting
await api('PUT', `/api/contractors/personnel/${idOf('曾耀葦(Toby Tseng)')}`, { name: 'Toby Tseng (renamed)', position: 'Director' });
const again = (await api('GET', '/api/meeting-minutes/')).body.find(m => m.title === 'CP attendees');
check(again.attendees[0].name === '曾耀葦(Toby Tseng)' && again.attendees[0].role === 'QAQC Manager', '2: renaming the person later leaves the meeting as it was');
// older meetings: plain text attendees read as before
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(800);
await page.locator('tr', { hasText: 'MOM-CP-001' }).first().click();
await modal().waitFor();
await modal().getByRole('tab', { name: /^Attendees/ }).click();
const oldRows = await modal().locator('[data-attendees] tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].slice(0, 3).map(c => c.innerText.trim()).join(' / ')));
check(JSON.stringify(oldRows) === JSON.stringify(['TECO / 曾耀葦(Toby Tseng) / QAQC Manager', 'HL / Breeze Yeh / PM']), '2: a meeting saved before shows its text attendees as before');

// ═══ 3. Without contractor management: pick from the lists, no "add to list" ═══
log('=== 3. meeting-only user ===');
await login('cp_meeting');
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(800);
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await modal().waitFor();
await modal().getByRole('tab', { name: /^Attendees/ }).click();
await company().fill('TECO');
await page.waitForTimeout(600);
const offered3 = await listOptions(await name().getAttribute('list'));
check(offered3.length === 6 && offered3.includes('Visiting Engineer'), `3: the people are offered without contractor permissions (5 + the one added in 2: ${offered3.join(', ')})`);
await name().fill('Someone New');
check(await picker().getByLabel(/personnel list/).count() === 0, '3: no "add to list" box without contractors:manage');
check((await api('GET', '/api/contractors/CP-TECO/personnel')).status === 403, '3: the full list (contact details) stays behind contractors:view');

// ═══ 4. A TECO account: only TECO's people ═══
log('=== 4. contractor-scoped user ===');
await login('cp_teco');
check((await api('GET', '/api/contractors/personnel/options?contractor_id=CP-HL')).body.length === 0, '4: another company\'s people are not served');
check((await api('GET', '/api/contractors/personnel/options')).body.every(p => p.contractor_id === 'CP-TECO'), '4: only TECO\'s people');
await page.goto(`${BASE}/meeting-minutes`);
await page.waitForTimeout(800);
await page.getByRole('button', { name: /Add New Meeting/i }).click();
await modal().waitFor();
await modal().getByRole('tab', { name: /^Attendees/ }).click();
check((await listOptions('meeting-attendee-companies')).join(',') === 'TECO', '4: only TECO is offered as a company');

// 401 while one account signs out and the next signs in; 403 / 404 are the refusals the checks above ask for
// plus the two refusals asked for in 1 (the same name twice; deleting a company with people), logged on purpose
const errors = consoleErrors.filter(e => !/Failed to load resource: the server responded with a status of 40[0134]/.test(e)
    && !/^(Saving the personnel list failed|Deleting the contractor failed): AxiosError: Request failed with status code 400/.test(e));
check(errors.length === 0, `no front-end errors (${errors.join(' | ')})`);
log(`ALL ${checks} CHECKS PASSED`);
await browser.close();
