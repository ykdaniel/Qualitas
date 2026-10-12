// CHECKLIST-BACK-LABEL-2026-001 (R1 Back to ITP label, R2 action-bar layout + Word export) browser check — isolated stack only, seeded with seed_checklist_template_layout_review.py.
//   node tests-browser/checklist-back-label-check.mjs <stack.json> <seed SEED-json file> <evidence dir>
// Password comes from CHK_LAYOUT_REVIEW_PASSWORD (never printed). Prints OBSERVED / PASS / FAIL lines; exit 1 on any FAIL.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const seed = JSON.parse(readFileSync(process.argv[3], 'utf8').replace(/^SEED /, ''));
const EVID = process.argv[4];
const PW = process.env.CHK_LAYOUT_REVIEW_PASSWORD;
if (!PW) throw new Error('CHK_LAYOUT_REVIEW_PASSWORD not set');
const UI = `http://127.0.0.1:${stack.vite_port}`;
let failures = 0;
const check = (name, ok, v = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${v !== '' ? '  -> ' + (typeof v === 'string' ? v : JSON.stringify(v)) : ''}`); };

const browser = await chromium.launch({ headless: true });

// R2: the action bar — left: Back/Cancel, Print, Export Word (+ the template note); right: Save. Geometry of each piece.
const barLayout = p => p.evaluate(() => {
    const bar = document.querySelector('[data-form-actions]');
    const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim() }; };
    const [tools, main] = [bar.children[0], bar.children[bar.children.length - 1]];
    return { bar: box(bar), left: [...tools.children].map(box), right: [...main.children].map(box),
             overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});
const docxText = path => execFileSync('python3', ['-c', `import sys, docx
d = docx.Document(sys.argv[1])
out = [p.text for p in d.paragraphs]
for t in d.tables:
    for r in t.rows:
        out.append(' | '.join(c.text for c in r.cells))
print('\\n'.join(out))`, path]).toString();

async function login(lang = 'en', width = 1440, user = 'chk_layout') {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, timezoneId: 'Asia/Taipei' });
    await ctx.addInitScript(l => localStorage.setItem('language', l), lang);
    const p = await ctx.newPage();
    trackUrls(p);
    p.on('pageerror', e => { failures++; console.log('FAIL pageerror  -> ' + e.message); });
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}
const withReturn = no => `${UI}/checklist?openId=${no}&from=itp&returnItp=${seed.itp_id}`;
const openEditor = async (p, url, instance = false) => {
    await p.goto(url);
    if (instance) { await p.locator('[class*=tabButton]').nth(1).waitFor({ timeout: 15000 }); await p.locator('[class*=tabButton]').nth(1).click(); }
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    await p.waitForTimeout(400);
};
// the footer's cancel slot: the button just left of Save / Save Template (or the last secondary button when read-only)
const footerLabels = p => p.evaluate(() => [...document.querySelectorAll('button')].map(b => ({
    text: b.textContent.trim(), icon: !!b.querySelector('svg') })).filter(b => /^(Cancel|取消|Back to ITP|返回 ITP)$/.test(b.text)));
// The ITP page consumes ?reopenItp once and then drops it from the address, so record every address the page went
// through, and identify the reopened window by the ITP's own number (seeded as QTS-CTL1-HL-ITP-000001).
const ITP_NO = 'QTS-CTL1-HL-ITP-000001';
const trackUrls = p => { p._urls = []; p.on('framenavigated', f => { if (f === p.mainFrame()) p._urls.push(f.url()); }); };
const reopenedItp = async p => {
    await p.waitForURL(u => u.pathname === '/itp', { timeout: 10000 });
    await p.getByText('Edit ITP').first().waitFor({ timeout: 10000 }).catch(() => {});
    const param = p._urls.map(u => new URL(u)).filter(u => u.pathname === '/itp').map(u => u.searchParams.get('reopenItp')).find(Boolean) ?? null;
    p._urls.length = 0;
    return { param, modal: await p.getByText('Edit ITP').first().isVisible().catch(() => false),
             sameItp: await p.getByText(ITP_NO).first().isVisible().catch(() => false) };
};

// ── A. the real route: ITP edit window → Record link → template → Back to ITP ───────────────────────────────────
{
    const p = await login();
    await p.goto(`${UI}/itp?reopenItp=${seed.itp_id}`);
    await p.getByText(seed.template).first().click({ timeout: 15000 });
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    await p.waitForTimeout(400);
    const u = new URL(p.url());
    check('A: Record link opens the template with from=itp & returnItp', u.searchParams.get('from') === 'itp' && u.searchParams.get('returnItp') === seed.itp_id, p.url());
    const labels = await footerLabels(p);
    check('A: footer shows "Back to ITP" with an icon, no Cancel', labels.length === 1 && labels[0].text === 'Back to ITP' && labels[0].icon, labels);
    await p.screenshot({ path: `${EVID}/A-template-from-itp-1440.png`, fullPage: true });
    await p.getByRole('button', { name: 'Back to ITP' }).click();
    const r = await reopenedItp(p);
    check('A: Back to ITP reopens the same ITP edit window', r.param === seed.itp_id && r.modal && r.sameItp, r);
    await p.screenshot({ path: `${EVID}/A-back-reopened-itp-1440.png` });

    // ── B. unsaved change: the leave warning still comes first ──────────────────────────────────────────────────
    await openEditor(p, withReturn(seed.template));
    await p.locator('table[class*=webTable] tbody tr').nth(1).locator('textarea').nth(1).fill('Per ITP table 3, edited');
    await p.getByRole('button', { name: 'Back to ITP' }).click();
    await p.getByText('Unsaved Changes').first().waitFor({ timeout: 5000 }).catch(() => {});
    const warned = await p.getByText('Unsaved Changes').first().isVisible().catch(() => false);
    check('B: unsaved edit → leave warning shown, still on the Checklist', warned && new URL(p.url()).pathname === '/checklist', p.url());
    await p.waitForTimeout(600);                        // let the dialog finish fading in before the screenshot
    await p.screenshot({ path: `${EVID}/B-unsaved-warning-1440.png` });
    await p.getByRole('button', { name: 'Stay & Save' }).click();
    await p.waitForTimeout(400);
    check('B: "Stay & Save" keeps the edit on the Checklist', new URL(p.url()).pathname === '/checklist'
        && (await p.locator('table[class*=webTable] tbody tr').nth(1).locator('textarea').nth(1).inputValue()) === 'Per ITP table 3, edited');
    await p.getByRole('button', { name: 'Back to ITP' }).click();
    await p.getByRole('button', { name: 'Leave' }).click({ timeout: 5000 });
    const r2 = await reopenedItp(p);
    check('B: "Leave" goes back to the same ITP', r2.param === seed.itp_id && r2.modal && r2.sameItp, r2);

    // ── D. instance mode (result columns) opened with returnItp ─────────────────────────────────────────────────
    await openEditor(p, withReturn(seed.instance), true);
    const li = await footerLabels(p);
    check('D: instance mode with returnItp shows "Back to ITP"', li.length === 1 && li[0].text === 'Back to ITP', li);
    await p.screenshot({ path: `${EVID}/D-instance-from-itp-1440.png`, fullPage: true });
    await p.getByRole('button', { name: 'Back to ITP' }).click();
    const r3 = await reopenedItp(p);
    check('D: instance Back to ITP reopens the ITP', r3.param === seed.itp_id && r3.modal && r3.sameItp, r3);

    // historical (read-only) template from the ITP route: the button is still there and works
    await openEditor(p, withReturn(seed.historical));
    const lh = await footerLabels(p);
    check('D: read-only historical template with returnItp shows "Back to ITP"', lh.length === 1 && lh[0].text === 'Back to ITP', lh);

    // ── E. every entry without returnItp keeps "Cancel" ─────────────────────────────────────────────────────────
    for (const [label, url, inst] of [
        ['template library deep link', `${UI}/checklist?openId=${seed.template}`, false],
        ['from=itr', `${UI}/checklist?openId=${seed.template}&from=itr`, false],
        ['from=itp without returnItp (the /itp/:id page, ITPDetail.tsx)', `${UI}/checklist?openId=${seed.template}&from=itp`, false],
        ['instance without returnItp', `${UI}/checklist?openId=${seed.instance}`, true],
    ]) {
        await openEditor(p, url, inst);
        const l = await footerLabels(p);
        check(`E: ${label} → "Cancel"`, l.length === 1 && l[0].text === 'Cancel', l);
    }
    await p.goto(`${UI}/checklist`);
    await p.getByRole('button', { name: /New Template/ }).click({ timeout: 15000 });
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    const ln = await footerLabels(p);
    check('E: New Template from the library → "Cancel"', ln.length === 1 && ln[0].text === 'Cancel', ln);
    await p.screenshot({ path: `${EVID}/E-library-new-template-1440.png`, fullPage: true });
    await p.context().close();
}

// ── C. Chinese UI and a 1024 screen ─────────────────────────────────────────────────────────────────────────────
{
    const p = await login('zh', 1024);
    await openEditor(p, withReturn(seed.template));
    const l = await footerLabels(p);
    check('C: zh → "返回 ITP"', l.length === 1 && l[0].text === '返回 ITP' && l[0].icon, l);
    const fit = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        wrapped: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '返回 ITP').map(b => b.getBoundingClientRect().height) }));
    check('C: 1024 wide — no page overflow, button on one line', fit.overflow <= 0 && fit.wrapped.every(h => h < 50), fit);
    await p.screenshot({ path: `${EVID}/C-zh-template-from-itp-1024.png`, fullPage: true });
    await openEditor(p, `${UI}/checklist?openId=${seed.template}`);
    const l2 = await footerLabels(p);
    check('C: zh without returnItp → "取消"', l2.length === 1 && l2[0].text === '取消', l2);
    await p.context().close();
}

// ── F. R2 action bar: order and alignment at 1440 and 1024, template and instance ───────────────────────────────
for (const width of [1440, 1280, 1260, 1240, 1024]) {   // 1240-1280: the band where the R2 R1-review found Save wrapping
    const p = await login('en', width);
    for (const [label, url, inst] of [['template', withReturn(seed.template), false], ['instance', withReturn(seed.instance), true],
                                      ['template without returnItp', `${UI}/checklist?openId=${seed.template}`, false]]) {
        await openEditor(p, url, inst);
        const L = await barLayout(p);
        const left = L.left.map(b => b.text), right = L.right.map(b => b.text);
        const first = label.includes('without') ? 'Cancel' : 'Back to ITP';
        check(`F ${label} @${width}: left = ${first}, Print, Export Word`, left[0] === first && left[1] === 'Print' && left[2] === 'Export Word', left);
        check(`F ${label} @${width}: right = Save only`, right.length === 1 && /^Save( Template)?$/.test(right[0]), right);
        const buttons = [...L.left.slice(0, 3), ...L.right];
        check(`F ${label} @${width}: all buttons on one line, no page overflow`,
              buttons.every(b => b.y === buttons[0].y && b.h === buttons[0].h) && L.overflow <= 0, buttons.map(b => [b.text, b.y, b.h]));
        check(`F ${label} @${width}: Save at the right edge, buttons left`, L.right[0].x + L.right[0].w > L.left[2].x + L.left[2].w + 40, { left: L.left[2], right: L.right[0] });
        if (label === 'template') {
            const note = L.left[3];
            check(`F template @${width}: the save note is shown, clear of Save`, !!note && note.text.startsWith('Updating this template')
                  && (note.y >= L.right[0].y + L.right[0].h || note.x + note.w <= L.right[0].x), { note, save: L.right[0] });
            note && console.log(`OBSERVED F template @${width}: note ${Math.abs((note.y + note.h / 2) - (L.left[0].y + L.left[0].h / 2)) < 3 ? 'on the button row' : 'on its own row under the buttons'}, ${Math.round(note.h / 16)} line(s)`);
        }
        await p.screenshot({ path: `${EVID}/F-bar-${label.replace(/ /g, '-')}-${width}.png`, fullPage: true });
    }
    await p.context().close();
}

// ── G. R2 Word export: download and open it; unsaved edits / a new template ask for a save first ─────────────────
{
    const p = await login();
    for (const [label, no, inst] of [['template', seed.template, false], ['instance', seed.instance, true]]) {
        await openEditor(p, withReturn(no), inst);
        const dl = p.waitForEvent('download', { timeout: 15000 });
        await p.getByRole('button', { name: 'Export Word' }).click();
        const busy = await p.getByRole('button', { name: /Exporting/ }).isDisabled().catch(() => null);
        const d = await dl;
        const path = `${EVID}/G-${label}-${d.suggestedFilename()}`;
        await d.saveAs(path);
        check(`G ${label}: file name is the Form ID`, d.suggestedFilename() === `${no}.docx`, d.suggestedFilename());
        console.log(`OBSERVED G ${label}: button while exporting  -> ${busy === null ? 'already finished (not observed)' : busy ? 'disabled' : 'ENABLED'}`);
        const text = docxText(path);
        const must = ['FIELD INSPECTION CHECKLIST', no, 'Steel structure erection', '# | Inspection Item | Criteria | Actual Situation | Result',
                      'Manufacturer, size and grade comply', '-END-', 'Site Engineer', 'Subcontractor Representative'];
        if (label === 'instance') must.push('Mill certificates checked, all plates per submittal | 合格 Pass', '不合格 Fail', '不適用原因 N/A reason: Coating is in another package');
        else must.push('|  | 未填 Not filled');
        const missing = must.filter(m => !text.includes(m));
        check(`G ${label}: the .docx opens and has the printed sections`, missing.length === 0, missing);
    }
    // unsaved edit → save-first warning, nothing downloaded
    await openEditor(p, withReturn(seed.template));
    await p.locator('table[class*=webTable] tbody tr').nth(1).locator('textarea').nth(1).fill('Per ITP table 3, unsaved');
    let downloaded = false;
    p.once('download', () => { downloaded = true; });
    await p.getByRole('button', { name: 'Export Word' }).click();
    await p.getByText('Save first, then export').first().waitFor({ timeout: 5000 }).catch(() => {});
    const warned = await p.getByText('Save first, then export').first().isVisible().catch(() => false);
    await p.waitForTimeout(800);
    check('G unsaved edit: "save first" warning, no file', warned && !downloaded, { warned, downloaded });
    await p.screenshot({ path: `${EVID}/G-unsaved-save-first-1440.png` });
    // a brand-new template (never saved) → same warning
    await p.goto(`${UI}/checklist`);
    await p.getByRole('button', { name: /New Template/ }).click({ timeout: 15000 });
    await p.locator('table[class*=webTable]').waitFor({ timeout: 15000 });
    await p.getByRole('button', { name: 'Export Word' }).click();
    await p.getByText('Save first, then export').first().waitFor({ timeout: 5000 }).catch(() => {});
    check('G new template: "save first" warning', await p.getByText('Save first, then export').first().isVisible().catch(() => false));
    await p.context().close();
}
{
    // view-only account: export still works (checklist:view is enough); nothing to save, so the right side is empty
    const p = await login('en', 1440, 'chk_layout_view');
    await openEditor(p, withReturn(seed.template));
    const L = await barLayout(p);
    check('G view-only: left = Back to ITP, Print, Export Word; no Save, no note',
          L.left.map(b => b.text).join('|') === 'Back to ITP|Print|Export Word' && L.right.length === 0, { left: L.left.map(b => b.text), right: L.right.map(b => b.text) });
    const dl = p.waitForEvent('download', { timeout: 15000 });
    await p.getByRole('button', { name: 'Export Word' }).click();
    check('G view-only: Word export downloads', (await dl).suggestedFilename() === `${seed.template}.docx`);
    await p.screenshot({ path: `${EVID}/G-view-only-1440.png`, fullPage: true });
    await p.context().close();
}

await browser.close();
console.log(failures ? `DONE with ${failures} FAIL` : 'DONE all PASS');
process.exit(failures ? 1 : 0);
