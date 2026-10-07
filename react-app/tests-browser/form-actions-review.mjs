import assert from 'node:assert/strict';
import {readFileSync, mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const stack=JSON.parse(readFileSync(process.argv[2],'utf8'));
const base=`http://127.0.0.1:${stack.vite_port}`;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
page.setDefaultTimeout(10000);
await page.addInitScript(()=>{if(!localStorage.getItem('language'))localStorage.setItem('language','zh');});
await page.goto(`${base}/login`);
await page.fill('#email','admin');
await page.fill('#password',readFileSync(`${stack.root}/admin-password`,'utf8'));
await page.click('button[type=submit]');
await page.waitForURL(url=>!url.pathname.startsWith('/login'));
const modules=['itp','pqp','noi','itr','ncr','obs','osd','fat','followup','meeting-minutes','km','contractors','audit','checklist','iam'];
const output=process.argv[3] || '/tmp/qualitas-form-actions-screenshots';
mkdirSync(output,{recursive:true});
let assertions=0;
const check=(ok,message)=>{assert.ok(ok,message);assertions++;console.log(`PASS ${message}`);};
const writes=[];
page.on('request',r=>{if(['POST','PUT','PATCH','DELETE'].includes(r.method())&&!r.url().includes('/auth/'))writes.push(r.url());});
async function inspect(name, bar=page.locator('[data-form-actions]').last()){
 await bar.waitFor();
 await bar.scrollIntoViewIfNeeded();
 const buttons=await bar.locator('button').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>0).map(n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n);return {text:n.textContent.trim(),height:r.height,x:r.x,y:r.y,right:r.right,color:c.backgroundColor,radius:c.borderRadius,font:c.fontSize};}));
 check(buttons.length>0,`${name}: actions visible`);
 check(buttons.every(b=>Math.abs(b.height-40)<1),`${name}: all footer buttons 40px high`);
 check(buttons.every(b=>b.radius==='8px'&&b.font==='14px'),`${name}: shared corner and font metrics`);
 check(buttons.every(b=>['rgb(255, 255, 255)','rgb(128, 96, 53)','rgb(255, 250, 242)'].includes(b.color)),`${name}: shared semantic colors`);
 const save=buttons.findIndex(b=>/^(儲存|保存|Save|新增用戶|Add Project|儲存範本)/.test(b.text));
 const cancel=buttons.findIndex(b=>/^(取消|關閉|Cancel|Close)$/.test(b.text));
 if(save>=0&&cancel>=0)check(cancel<save,`${name}: cancel before save in keyboard order`);
 const rect=await bar.boundingBox();
 check(buttons.every(b=>b.x>=rect.x-1&&b.right<=rect.x+rect.width+1),`${name}: actions stay within footer`);
 return bar;
}
try {
for(const module of modules){
 await page.setViewportSize({width:1440,height:1000});
 await page.goto(`${base}/${module}`);
 await page.getByRole('button',{name:/新增/}).first().click();
 await inspect(module);
 if(module==='itp'){
  await page.getByRole('button',{name:/Inspection Plan|檢驗計畫/}).click();
  await inspect('itp-plan');
  await page.screenshot({path:`${output}/itp-desktop.png`});
  await page.setViewportSize({width:600,height:900});
  await inspect('itp-plan-narrow');
  await page.screenshot({path:`${output}/itp-narrow.png`});
  await page.setViewportSize({width:1440,height:1000});
  await page.getByRole('button',{name:/新增項目|Add New Item/i}).click();
  const itemBar=page.locator('[data-form-actions]').filter({has:page.getByRole('button',{name:/^(套用|Apply)$/})});
  await inspect('itp-item-panel', itemBar);
  await itemBar.getByRole('button',{name:/取消|Cancel/}).click();
 }
 if(['pqp','ncr','contractors','checklist'].includes(module))await page.screenshot({path:`${output}/${module}.png`});
 const cancel=page.locator('[data-form-actions]').last().getByRole('button',{name:/^(取消|關閉|Cancel|Close)$/});
 if(await cancel.count())await cancel.click();
 check(writes.length===0,`${module}: open/cancel causes no business write`);
}
for(const [route,tab,add,label] of [['contractors','Projects',/Add Project|新增/,'project'],['iam','角色管理',/新增角色/,'role']]){
 await page.goto(`${base}/${route}`);await page.getByRole('button',{name:tab,exact:true}).click();await page.getByRole('button',{name:add}).first().click();await inspect(label);
}
await page.goto(`${base}/noi`);
await page.getByRole('button',{name:'批次新增',exact:true}).click();
await inspect('noi-bulk');
await page.goto(`${base}/itp`);
const itps=await page.evaluate(async()=>{const r=await fetch('/api/itp/');return r.json();});
assert.ok(itps[0]?.id,'isolated startup supplies an ITP for detail layout');
await page.goto(`${base}/itp/${itps[0].id}`);
await inspect('itp-detail-page');
await page.getByRole('button',{name:'Add New Item',exact:true}).click();
await inspect('itp-detail-item',page.locator('[data-form-actions]').filter({has:page.getByRole('button',{name:'Save Changes',exact:true})}));
// Standalone settings forms use the same right-aligned primary actions.
for(const route of ['document-naming-rules','settings/security']){
 await page.goto(`${base}/${route}`);await inspect(route);
}
await page.goto(`${base}/kpi`);
await page.getByRole('button',{name:/權重|Weights/}).click();
await inspect('kpi-weights');
// Check a long English footer at a phone width, and exclude it from printing.
await page.evaluate(()=>localStorage.setItem('language','en'));
await page.goto(`${base}/itp`);
await page.getByRole('button',{name:/Add.*ITP/}).click();
await page.getByRole('button',{name:/Inspection Plan/}).click();
await page.setViewportSize({width:375,height:850});
await inspect('itp-english-phone');
await page.screenshot({path:`${output}/itp-english-phone.png`});
await page.emulateMedia({media:'print'});
check(await page.locator('[data-form-actions]').last().isHidden(),'form actions excluded from printed output');
await page.emulateMedia({media:'screen'});
check(writes.length===0,'all layout inspections left business data untouched');
console.log(`PASS ${assertions} assertions; no business data written`);
}finally{await browser.close();}
