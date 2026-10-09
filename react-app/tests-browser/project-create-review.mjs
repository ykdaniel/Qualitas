import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const password = readFileSync(`${stack.root}/admin-password`, 'utf8');
const browser = await chromium.launch({headless: true});
const sql = query => execFileSync('sqlite3', ['-readonly', stack.db, query], {encoding: 'utf8'}).trim();
const ui = `http://127.0.0.1:${stack.vite_port}`;
let checks = 0;
const check = (value, expected, label) => { assert.deepEqual(value, expected, label); checks++; console.log(`PASS ${label}`); };
async function login(name) {
    const context = await browser.newContext();
    await context.addInitScript(() => localStorage.setItem('language', 'zh'));
    const page = await context.newPage();
    await page.goto(`${ui}/login`);
    await page.fill('#email', `pcr_${name}`);
    await page.fill('#password', password);
    await page.click('button[type=submit]');
    await page.waitForURL(url => !url.pathname.startsWith('/login'));
    return page;
}
async function open(page, module) {
    await page.goto(`${ui}/${module}`);
    await page.getByRole('button', {name: /新增|Add/}).first().click({timeout: 10000}).catch(async e => { console.log('PAGE', page.url(), (await page.locator('body').innerText()).slice(0,2500)); throw e; });
    const modal = page.locator('[class*=modalContent]').first();
    const project = modal.getByLabel('專案', {exact: true});
    await project.waitFor();
    await page.waitForFunction(() => {
        const label = [...document.querySelectorAll('label')].find(x => x.textContent === '專案');
        return label && !document.getElementById(label.htmlFor)?.disabled;
    });
    return {modal, project};
}
async function fill(modal, module, text) {
    const label = module === 'fat' ? '設備名稱' : '主旨';
    await modal.locator('label', {hasText: label}).first().locator('xpath=following-sibling::input[1]').fill(text);
    if (module === 'itp') await modal.locator('label', {hasText: '承攬廠商'}).first().locator('xpath=following-sibling::select[1]').selectOption('Project Review Vendor');
}
try {
    for (const module of ['fat', 'itp']) {
        const page = await login('multi');
        let {modal, project} = await open(page, module);
        check(await project.locator('option').evaluateAll(nodes => nodes.map(x => x.value)), ['', 'PCR-P1', 'PCR-P2'], `${module}: only allowed projects`);
        check(await project.inputValue(), '', `${module}: no arbitrary project selected`);
        await project.selectOption('PCR-P2');
        await fill(modal, module, `Project review ${module}`);
        const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/${module}/`);
        await modal.getByRole('button', {name: /^(儲存|Save)$/}).click();
        const saved = await response;
        check(saved.status(), 200, `${module}: multi-project create succeeds`);
        check(saved.request().postDataJSON().project_id, 'PCR-P2', `${module}: POST contains selected id`);
        const record = await saved.json();
        check(sql(`SELECT project_id FROM ${module} WHERE id='${record.id}'`), 'PCR-P2', `${module}: DB belongs to chosen project`);
        // The real backend remains the authority even if someone crafts a different payload.
        const rejected = await page.evaluate(async ({module, payload}) => {
            const csrf = document.cookie.split('; ').find(x => x.startsWith('csrf_token='))?.split('=')[1];
            const r = await fetch(`/api/${module}/`, {method:'POST', headers:{'Content-Type':'application/json','X-CSRF-Token':csrf || ''}, body:JSON.stringify({...payload, project_id:'PCR-P3'})});
            return r.status;
        }, {module, payload: saved.request().postDataJSON()});
        check(rejected, 403, `${module}: out-of-scope POST rejected`);
        const before = sql(`SELECT count(*) FROM ${module}`);
        ({modal, project} = await open(page, module));
        await project.selectOption('PCR-P1');
        await modal.getByRole('button', {name:/^(取消|Cancel|關閉|Close)$/}).click();
        check(sql(`SELECT count(*) FROM ${module}`), before, `${module}: cancel creates nothing`);
        // Failed option loading blocks saving; retry preserves the user's other fields.
        await page.route('**/api/projects/**', route => route.fulfill({status: 503, body: 'unavailable'}));
        await page.goto(`${ui}/${module}`);
        await page.getByRole('button', {name: /新增|Add/}).first().click();
        modal = page.locator('[class*=modalContent]').first();
        await modal.getByRole('alert').waitFor();
        await fill(modal, module, 'Keep these inputs');
        check(await modal.getByRole('button', {name:/^(儲存|Save)$/}).isDisabled(), true, `${module}: load failure blocks save`);
        await page.unroute('**/api/projects/**');
        await modal.getByRole('button', {name:'重試', exact:true}).click();
        project = modal.getByLabel('專案', {exact:true});
        await project.locator('option[value="PCR-P2"]').waitFor({state:'attached'});
        check(await modal.locator('input').evaluateAll(nodes => nodes.some(x => x.value === 'Keep these inputs')), true, `${module}: retry preserves input`);
        await modal.getByRole('button', {name:/^(取消|Cancel|關閉|Close)$/}).click();
        await page.context().close();
        const single = await login('single');
        ({modal, project} = await open(single, module));
        await fill(modal, module, `Single scope ${module}`);
        const oneResponse = single.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/${module}/`);
        await modal.getByRole('button', {name:/^(儲存|Save)$/}).click();
        const one = await oneResponse;
        check(one.status(), 200, `${module}: existing single-project default succeeds`);
        check((await one.json()).project_id, 'PCR-P1', `${module}: backend single-project default preserved`);
        await single.context().close();
    }
    console.log(`${checks} assertions passed`);
} finally { await browser.close(); }
