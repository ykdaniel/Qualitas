import { readFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { verifyIsolatedTarget } from './forms-leave-guard-review-isolation-guard.mjs';
const state = JSON.parse(readFileSync(process.argv[2], 'utf8'));
verifyIsolatedTarget(state);
const password = process.env.NOI_ITR_UX_REVIEW_PASSWORD;
if (!password) throw new Error('NOI_ITR_UX_REVIEW_PASSWORD required');
const base = `http://127.0.0.1:${state.vite_port}`;
const out = process.env.NOI_ITR_LABEL_EVIDENCE_DIR;
if (!out) throw new Error('NOI_ITR_LABEL_EVIDENCE_DIR required');
mkdirSync(out, { recursive: true });
let checks = 0;
const check = (condition, label) => { assert.ok(condition, label); checks++; console.info('PASS', label); };
const browser = await chromium.launch();
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
 await page.addInitScript(() => localStorage.setItem('language', 'en'));
 await page.goto(`${base}/login`);
 await page.fill('#email', 'noiitrux_full'); await page.fill('#password', password);
 await page.click('button[type=submit]'); await page.waitForURL(u => !u.pathname.includes('/login'));
 const open = async () => {
   await page.goto(`${base}/noi`);
   const responsePromise = page.waitForResponse(r => r.url().includes('/noi/niu-noi-3/related') && r.ok());
   await page.locator('table tbody tr').filter({ hasText: 'QTS-NIUP1-NOI-000003' }).click();
   const response = await responsePromise;
   await page.getByRole('heading', {name:'Related Documents',exact:true}).scrollIntoViewIfNeeded();
   return response.json();
 };
 const data = await open();
 const entries = [...data.upstream, ...data.downstream];
 check(entries.find(e=>e.id==='niu-itr-3-orig').isReInspection === false,'HTTP original flag false');
 check(entries.find(e=>e.id==='niu-itr-3-reinsp').isReInspection === true,'HTTP reinspection flag true');
 check(!Object.hasOwn(entries.find(e=>e.entityType==='ncr'),'isReInspection'),'HTTP NCR omits new key');
 const button = ref => page.getByRole('button').filter({hasText:ref});
 const original = button('QTS-NIUP1-ITR-000003');
 const repeat = button('QTS-NIUP1-ITR-000004');
 check(await original.getByText('Re-inspection',{exact:true}).count()===0,'original has no badge');
 check(await repeat.getByText('Re-inspection',{exact:true}).count()===1,'reinspection has badge');
 check((await original.innerText()).includes('Rebar spacing inspection') && (await repeat.innerText()).includes('Rebar spacing inspection'),'same titles preserved');
 check((await original.innerText()).includes('Reject') && (await repeat.innerText()).includes('In Progress'),'statuses preserved');
 check(await button('QTS-NIUP1-NCR-000001').getByText('Re-inspection',{exact:true}).count()===0,'NCR not marked');
 await repeat.scrollIntoViewIfNeeded(); await page.screenshot({path:`${out}/related-badges.png`});
 for (const ref of ['QTS-NIUP1-ITR-000003','QTS-NIUP1-ITR-000004']) {
   await button(ref).click();
   await page.locator(`input[value="${ref}"]`).waitFor({state:'visible'});
   check(new URL(page.url()).pathname === '/itr',`opens ${ref}`);
   await page.getByRole('button',{name:'Cancel',exact:true}).click();
   await page.waitForURL(u=>u.pathname==='/noi');
   await open();
 }
 await button('QTS-NIUP1-NCR-000001').click(); await page.waitForURL(u=>u.pathname==='/ncr');
 check(page.url()===`${base}/ncr`,'NCR navigation unchanged');
 console.info(`DONE ${checks} checks`);
} finally { await browser.close(); }
