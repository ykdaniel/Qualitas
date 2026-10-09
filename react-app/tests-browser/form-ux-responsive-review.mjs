import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'playwright';
const state=JSON.parse(readFileSync(process.argv[2],'utf8'));
const baseline=process.argv.includes('--baseline');
const output=process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'/tmp/qualitas-form-ux';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:375,height:812}});
page.setDefaultTimeout(10000);
await page.addInitScript(()=>localStorage.setItem('language','zh'));
let checks=0;const check=(v,msg)=>{assert.ok(v,msg);checks++;console.log(`PASS ${msg}`);};
try{
 await page.goto(`http://127.0.0.1:${state.vite_port}/login`);
 await page.fill('#email','admin');await page.fill('#password',readFileSync(`${state.root}/admin-password`,'utf8'));
 await page.click('button[type=submit]');await page.waitForURL(u=>!u.pathname.includes('/login'));
 const writes=[];page.on('request',r=>{if(['POST','PUT','DELETE','PATCH'].includes(r.method())&&!r.url().includes('/auth/'))writes.push(r.url());});
 for(const mod of baseline?['noi']:['noi','pqp','fat','ncr','obs','osd','itr','followup','meeting-minutes']){
  await page.goto(`http://127.0.0.1:${state.vite_port}/${mod}`);await page.getByRole('button',{name:/新增/}).first().click();
  const modal=page.locator('[class*=modalContent]').first();await modal.waitFor();
  const grid=modal.locator('[class*=formGrid]').first();
  const columns=await grid.evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
  await page.screenshot({path:`${output}/${baseline?'before':'after'}-${mod}.png`});
  if(baseline){console.log('BASELINE',JSON.stringify({module:mod,columns}));continue;}
  check(columns===1,`${mod}: phone layout has one field column`);
  const body=modal.locator('[class*=modalBody]').first();
  check(await body.evaluate(n=>n.scrollWidth<=n.clientWidth+1),`${mod}: no horizontal form overflow`);
  const close=modal.locator('[class*=closeButton]').first();check(await close.getAttribute('aria-label')==='關閉',`${mod}: close icon has translated accessible name`);
  const foot=modal.locator('[data-form-actions]').last();
  const before=await foot.boundingBox();check(before.y>=0&&before.y+before.height<=812,`${mod}: footer within phone viewport`);
  await body.evaluate(n=>n.scrollTop=n.scrollHeight);
  const after=await foot.boundingBox();check(Math.abs(before.y-after.y)<1,`${mod}: footer stays visible while fields scroll`);
  await foot.getByRole('button',{name:/^(取消|Cancel|關閉|Close)$/}).click();check(writes.length===0,`${mod}: cancel does not write data`);
 }
 if(!baseline){
  await page.goto(`http://127.0.0.1:${state.vite_port}/noi`);
  await page.getByRole('button',{name:/新增/}).first().click();
  const modal=page.locator('[class*=modalContent]').first();
  for(const [width,expected] of [[800,2],[1440,3]]){
   await page.setViewportSize({width,height:1000});
   check(await modal.locator('[class*=formGrid]').first().evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length)===expected,`NOI at ${width}px: ${expected} field columns`);
  }
  const close=modal.locator('[class*=closeButton]').first();await close.focus();await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  check(await close.evaluate(n=>getComputedStyle(n).outlineStyle)==='solid','close icon has visible keyboard focus');
  await close.click();
  // This fixture is written only to the isolated stack.
  const created=await page.evaluate(async()=>{
   const vendors=await (await fetch('/api/contractors/')).json();
   const token=document.cookie.split('; ').find(x=>x.startsWith('csrf_token='))?.split('=').slice(1).join('=');
   const response=await fetch('/api/fat/',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':decodeURIComponent(token||'')},body:JSON.stringify({equipment:'Responsive footer fixture',supplier:vendors[0].name,startDate:'2026-09-29',endDate:'2026-09-29'})});
   return {status:response.status,body:await response.json()};
  });
  assert.equal(created.status,200,JSON.stringify(created));
  await page.goto(`http://127.0.0.1:${state.vite_port}/fat`);
  await page.getByRole('row').filter({hasText:'Responsive footer fixture'}).last().locator('button[title]').first().click();
  await page.setViewportSize({width:375,height:812});
  const detail=page.locator('[class*=modalContent]').first();
  for(let i=0;i<12;i++)await detail.getByRole('button',{name:/新增行|新增列|新增項目|Add Row|Add Item|Add New Item/}).click();
  const body=detail.locator('[class*=modalBody]').first();
  const foot=detail.locator('[data-form-actions]').last();
  const before=await foot.boundingBox();
  check(before.y>=0&&before.y+before.height<=812,'FAT detail footer stays inside phone viewport');
  await body.evaluate(n=>n.scrollTop=n.scrollHeight);
  const after=await foot.boundingBox();
  check(Math.abs(before.y-after.y)<1,'FAT detail footer does not scroll away with item rows');
  await page.screenshot({path:`${output}/after-fat-details.png`});
  const writesBeforeCancel=writes.length;
  await foot.getByRole('button',{name:/^(取消|Cancel|關閉|Close)$/}).click();
  check(writes.length===writesBeforeCancel,'FAT detail cancel does not persist local item rows');
 }
 console.log(`${checks} assertions passed`);
}finally{await browser.close();}
