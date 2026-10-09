// Step 8 retry, API-only: the "Add New Item" UI interaction proved too flaky to script reliably across
// two attempts (round2 + round2b both failed to reach a real Generate-Checklist click). Verifying the
// LINK step via the exact same POST /checklist/ payload shape ITPModals.tsx::handleGenerateChecklist
// sends (confirmed by reading that function directly) is an honest substitute for the click itself,
// clearly labeled as such — not claimed as a screen-verified click.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, timezoneId: 'Asia/Taipei' });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const p = await ctx.newPage();
await p.goto(UI + '/login'); await p.fill('#email', 'itp_itr_linker'); await p.fill('#password', PW); await p.click('button[type=submit]');
await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

async function apiCall(method, path, body) {
    return await p.evaluate(async ({ method, path, body }) => {
        const csrf = document.cookie.split('; ').find(c => c.startsWith('csrf_token='))?.split('=')[1] || '';
        const res = await fetch(path, { method, credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: body ? JSON.stringify(body) : undefined });
        let json = null; try { json = await res.json(); } catch (_) {}
        return { status: res.status, body: json };
    }, { method, path, body });
}

// 1) Create a source ITP (matches handleAddNew's real payload shape)
const itpRes = await apiCall('POST', '/api/itp/', { vendor: 'ITP Review Co', description: 'Round2c ITP', rev: '', submit: '', status: 'Pending', remark: '', submissionDate: new Date().toISOString().split('T')[0] });
note('created source ITP', `HTTP ${itpRes.status} id=${itpRes.body?.id}`);

// 2) Generate Checklist — EXACT payload shape from ITPModals.tsx::handleGenerateChecklist
const detailData = JSON.stringify({
    projectTitle: 'Round2c ITP', recordsNo: '', packageName: '', inspectionDate: new Date().toISOString().split('T')[0],
    location: '', stage: '', items: [{ id: 1, item: '[A1] Round2c item', criteria: 'Round2c criteria', situation: '', result: '' }],
    remarks: '', signatures: { siteEngineer: '', constructionLeader: '', subcontractorRep: '' },
});
const genRes = await apiCall('POST', '/api/checklist/', { date: new Date().toISOString().split('T')[0], status: 'Ongoing', activity: 'Round2c ITP', itpId: itpRes.body.id, itpVersion: '', contractor: 'ITP Review Co', detail_data: detailData });
note('Generate-Checklist-equivalent POST /api/checklist/', `HTTP ${genRes.status} id=${genRes.body?.id} recordsNo=${genRes.body?.recordsNo}`);
const genRow = sql(`SELECT recordsNo, status, itpId, itpVersion, itrId, template_id FROM checklist WHERE id='${genRes.body.id}';`);
note('the resulting row, read back from DB', genRow);
note('classifies as a "blank template" under the §17 rule (itrId NULL && template_id NULL)?', !genRow.split('|').includes('itrId') && genRow.split('|')[4] === '' && genRow.split('|')[5] === '');

// 3) Create an ITR and attempt to link this exact row as the template source
const itrRes = await apiCall('POST', '/api/itr/', { vendor: 'ITP Review Co', description: 'Round2c ITR', rev: '', submit: '', status: 'In Progress' });
note('created ITR for link test', `HTTP ${itrRes.status} id=${itrRes.body?.id} status=${itrRes.body?.status}`);
const linkRes = await apiCall('POST', `/api/itr/${itrRes.body.id}/link-checklist?checklist_id=${genRes.body.id}`, null);
note('POST link-checklist using the Generate-Checklist row as template source', `HTTP ${linkRes.status} body=${JSON.stringify(linkRes.body).slice(0, 300)}`);
const instanceRow = sql(`SELECT recordsNo, itrId, template_id, itpId, itpVersion, detail_data FROM checklist WHERE itrId='${itrRes.body.id}';`);
note('resulting ITR-bound instance row (recordsNo|itrId|template_id|itpId|itpVersion|detail_data)', instanceRow);

await browser.close();
console.log('DONE');
