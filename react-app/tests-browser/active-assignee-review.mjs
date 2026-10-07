import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
await context.addInitScript(() => localStorage.setItem('language', 'zh'));
const page = await context.newPage();
const ui = `http://127.0.0.1:${stack.vite_port}`;
let checks=0;
function check(value,expected,label){assert.deepEqual(value,expected,label); checks++; console.log(`PASS ${label}`);}
try {
    await page.goto(`${ui}/login`);
    await page.fill('#email','assignee_reviewer');
    await page.fill('#password',readFileSync(`${stack.root}/admin-password`,'utf8'));
    await page.click('button[type=submit]');
    await page.waitForURL(u => !u.pathname.startsWith('/login'));
    for(const module of ['ncr','followup']) {
        await page.goto(`${ui}/${module}${module==='ncr'?'?openId=inactive-ncr':''}`);
        if(module==='followup') await page.getByRole('row').filter({hasText:'INACTIVE-FU'}).click();
        const modal=page.locator('[class*=modalContent]').first();
        const select=module==='ncr'?modal.locator('select[name=assignedTo]'):modal.locator('select').filter({has:page.locator('option',{hasText:'historical_inactive'})});
        await select.locator('option',{hasText:'historical_inactive'}).waitFor({state:'attached'});
        const historical=select.locator('option',{hasText:'historical_inactive'});
        check(await historical.isDisabled(),true,`${module}: historical inactive option cannot be newly selected`);
        check((await historical.innerText()).includes('已停用'),true,`${module}: inactive marker shown`);
        check(await select.inputValue(),await historical.getAttribute('value'),`${module}: historical selection retained`);
        check(await select.locator('option',{hasText:'other_inactive'}).count(),0,`${module}: other inactive account excluded`);
        check(await select.locator('option',{hasText:'assignee_reviewer'}).isEnabled(),true,`${module}: active assignee selectable`);
        // A fresh create dialog must not offer even the historical inactive account.
        await page.goto(`${ui}/${module}`);
        await page.getByRole('button',{name:/新增|Add/}).first().click();
        const fresh=page.locator('[class*=modalContent]').first();
        await fresh.locator('option',{hasText:'assignee_reviewer'}).first().waitFor({state:'attached'});
        check(await fresh.locator('select option',{hasText:'historical_inactive'}).count(),0,`${module}: inactive absent on create`);
    }
    console.log(`${checks} assertions passed`);
} finally {await browser.close();}
