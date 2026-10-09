import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {verifyIsolatedTarget} from './forms-leave-guard-review-isolation-guard.mjs';
const state=JSON.parse(readFileSync(process.argv[2],'utf8'));verifyIsolatedTarget(state);
const out=process.env.QWORKFLOW_UX_REVIEW_EVIDENCE_DIR,pw=process.env.QWORKFLOW_UX_REVIEW_PASSWORD;
if(!out||!pw)throw Error('Missing required environment');mkdirSync(out,{recursive:true});
const base=`http://127.0.0.1:${state.vite_port}`;let n=0;const check=(v,msg)=>{assert.ok(v,msg);n++;console.info('PASS',msg)};
const browser=await chromium.launch();
try{for(const lang of ['en','zh'])for(const width of [375,820,1440]){
const page=await browser.newPage({viewport:{width,height:1000}});await page.addInitScript(l=>localStorage.setItem('language',l),lang);
await page.goto(base+'/login');await page.fill('#email','qwux_full');await page.fill('#password',pw);await page.click('button[type=submit]');await page.waitForURL(u=>!u.pathname.includes('/login'));await page.goto(base+'/workflow');
const row=page.locator('tbody tr').filter({hasText:'QTS-QWUP1-NOI-000001'});await row.waitFor();
check(await page.getByTestId('workflow-legend').locator('> span').count()===3,`${lang}/${width} three legend states`);
const cell=row.getByTestId('workflow-summary');check((await cell.innerText()).includes('11%'),`${lang}/${width} original percentage in summary`);
check((await cell.locator('strong').getAttribute('aria-label')).includes(lang==='en'?'Workflow completion':'流程完成度'),`${lang}/${width} precise completion label`);
check(await page.getByRole('columnheader',{name:lang==='en'?'Subject':'檢驗項目',exact:true}).count()===1,`${lang}/${width} subject retained`);
await page.evaluate(()=>document.querySelector('table').scrollIntoView({block:'start'}));
for(const end of [false,true]){
await page.locator('table').evaluate((t,end)=>t.parentElement.scrollLeft=end?t.parentElement.scrollWidth:0,end);
await page.waitForTimeout(80);
const g=await cell.evaluate(el=>{const r=el.getBoundingClientRect(),w=el.closest('table').parentElement.getBoundingClientRect();return {inside:r.left>=w.left-1&&r.right<=Math.min(w.right,innerWidth)+1,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)),textFits:[...el.children].every(c=>c.scrollWidth<=c.clientWidth+1)};});
check(g.inside&&g.hit&&g.textFits,`${lang}/${width} summary readable scroll=${end?'end':'start'}`);
}
check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${lang}/${width} no page overflow`);
await page.screenshot({path:`${out}/${lang}-${width}.png`});
await page.locator('table').evaluate(t=>t.parentElement.scrollLeft=0);await row.locator('[data-checkpoint="noi"]').click();await page.waitForURL(u=>u.pathname==='/noi');check(true,`${lang}/${width} NOI checkpoint navigation`);await page.close();
}console.info(`DONE ${n} checks`)}finally{await browser.close()}
