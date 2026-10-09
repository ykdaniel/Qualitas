import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {verifyIsolatedTarget} from './forms-leave-guard-review-isolation-guard.mjs';
const state=JSON.parse(readFileSync(process.argv[2],'utf8')); verifyIsolatedTarget(state);
const password=process.env.NOI_ITR_UX_REVIEW_PASSWORD, out=process.env.NOI_ITR_LABEL_EVIDENCE_DIR;
if(!password || !out) throw Error('Credentials and evidence directory required');
mkdirSync(out,{recursive:true}); const base=`http://127.0.0.1:${state.vite_port}`;
let checks=0; const check=(v,label)=>{assert.ok(v,label);checks++;console.info('PASS',label)};
const browser=await chromium.launch();
try {
 for(const [lang,width] of ['en','zh'].flatMap(lang => [375,640,641,820,1280].map(width => [lang,width]))) {
 const page=await browser.newPage({viewport:{width,height:1000}});
 await page.addInitScript(l=>localStorage.setItem('language',l),lang);
 await page.goto(`${base}/login`);await page.fill('#email','noiitrux_full');await page.fill('#password',password);
 await page.click('button[type=submit]');await page.waitForURL(u=>!u.pathname.includes('/login'));
 await page.goto(`${base}/noi`);
 await page.locator('table tbody tr').filter({hasText:'QTS-NIUP1-NOI-000003'}).click();
 const row=page.getByRole('button').filter({hasText:'QTS-NIUP1-ITR-000004'});
 await row.waitFor(); await row.scrollIntoViewIfNeeded();
 const badge=row.getByText(lang==='zh'?'複驗':'Re-inspection',{exact:true});
 await page.screenshot({path:`${out}/${lang}-${width}.png`});
 const geometry=await badge.evaluate(el=>{
 const r=el.getBoundingClientRect();let visible={left:0,top:0,right:innerWidth,bottom:innerHeight};
 for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),b=p.getBoundingClientRect();
 if(/hidden|auto|scroll|clip/.test(s.overflowX)){visible.left=Math.max(visible.left,b.left);visible.right=Math.min(visible.right,b.right)}
 if(/hidden|auto|scroll|clip/.test(s.overflowY)){visible.top=Math.max(visible.top,b.top);visible.bottom=Math.min(visible.bottom,b.bottom)}}
 return {rect:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},visible,hit:el.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2))};});
 console.info(lang,width,JSON.stringify(geometry));
 check(geometry.rect.left>=geometry.visible.left-1 && geometry.rect.right<=geometry.visible.right+1 && geometry.rect.top>=geometry.visible.top-1 && geometry.rect.bottom<=geometry.visible.bottom+1,`${lang}/${width} badge not clipped`);
 check(geometry.hit,`${lang}/${width} badge not covered`);
 check(await page.getByRole('button').filter({hasText:'QTS-NIUP1-ITR-000003'}).getByText(lang==='zh'?'複驗':'Re-inspection',{exact:true}).count()===0,`${lang}/${width} original unmarked`);
 await row.click();await page.locator('input[value="QTS-NIUP1-ITR-000004"]').waitFor({state:'visible'});
 check(new URL(page.url()).pathname==='/itr',`${lang}/${width} correct ITR opens`);
 await page.close();
 }
 console.info(`DONE ${checks} checks`);
}finally{await browser.close()}
