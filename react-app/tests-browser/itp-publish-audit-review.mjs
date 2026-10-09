// ITP Publish retry: full PUT payload/response capture + audit-log increment check
// (2026-09-28). "Rev didn't reach Rev3.0" alone only proves no cumulative bump — this captures
// the actual request/response bodies and the audit_logs row count to directly confirm the retry
// does not re-run Publish as a second, independent event when nothing but the attachment step
// needed retrying.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const sql = q => execFileSync('sqlite3', ['-readonly', stack.db, q]).toString().trim();
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 800) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
const page = await ctx.newPage();
page.on('dialog', d => d.accept());
await page.goto(UI + '/login');
await page.fill('#email', 'save_attach_reviewer'); await page.fill('#password', PW);
await page.click('button[type=submit]');
await page.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });

const modal = pg => pg.locator('[class*=modalContent], [class*=ModalContent]').first();
async function openItpRowBySearch(refSuffix) {
    const searchInput = page.locator('input[placeholder="搜尋 ITP..."]').first();
    await searchInput.fill(refSuffix);
    await page.waitForTimeout(700);
    await page.locator('tr', { hasText: refSuffix }).first().click({ timeout: 10000 });
}

const captured = [];
page.on('response', async res => {
    if (res.url().includes('/api/itp/sat-itp-publish') && ['PUT', 'POST'].includes(res.request().method())) {
        let body = null;
        try { body = await res.json(); } catch { body = await res.text().catch(() => null); }
        captured.push({ method: res.request().method(), url: res.url().replace(UI, ''), postData: res.request().postData(), status: res.status(), body });
    }
});

try {
    const IMG = '/private/tmp/claude-501/-Users-nook-Documents-Qualitas/7246b20f-6cce-4d88-a22e-ed01a13b4a1d/scratchpad/pub_test.png';
    execFileSync('/opt/homebrew/bin/python3', ['-c', `
import struct, zlib
def chunk(tag, data):
    return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag+data))
open('${IMG}','wb').write(b'\\x89PNG\\r\\n\\x1a\\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b'\\x00\\xff\\x00\\x00'))+chunk(b'IEND',b''))
`]);

    const auditBefore = sql(`SELECT COUNT(*) FROM audit_logs WHERE entity_type='ITP' AND entity_id='sat-itp-publish';`);
    note('0. audit_logs rows for this ITP before anything', auditBefore);

    await page.goto(UI + '/itp'); await page.waitForTimeout(1000);
    await openItpRowBySearch('QTS-SAR-ITP-000005');
    await modal(page).waitFor({ timeout: 10000 });
    const m = modal(page);
    await m.locator('#attachment-upload-attachment').setInputFiles(IMG);
    let blockUpload = true;
    await page.route('**/api/files/upload', route => (blockUpload && route.request().method() === 'POST') ? route.abort('failed') : route.continue());

    await m.locator('button', { hasText: 'Publish' }).first().click();
    await page.waitForTimeout(1500);
    note('1. captured PUT payload/response for FIRST Publish attempt', JSON.stringify(captured, null, 0));
    const auditAfter1 = sql(`SELECT COUNT(*) FROM audit_logs WHERE entity_type='ITP' AND entity_id='sat-itp-publish';`);
    note('2. audit_logs rows after FIRST Publish attempt', auditAfter1);
    const revAfter1 = sql(`SELECT rev, status FROM itp WHERE id='sat-itp-publish';`);
    note('3. rev/status after FIRST attempt', revAfter1);

    captured.length = 0;
    blockUpload = false;
    await m.locator('button', { hasText: 'Publish' }).first().click();
    await page.waitForTimeout(1500);
    note('4. captured PUT payload/response for RETRY Publish attempt', JSON.stringify(captured, null, 0));
    const auditAfter2 = sql(`SELECT COUNT(*) FROM audit_logs WHERE entity_type='ITP' AND entity_id='sat-itp-publish';`);
    note('5. audit_logs rows after RETRY attempt', auditAfter2);
    note('6. full audit_logs detail rows for this ITP (action|old_value snippet|new_value snippet)',
        sql(`SELECT action, substr(old_value,1,80), substr(new_value,1,80) FROM audit_logs WHERE entity_type='ITP' AND entity_id='sat-itp-publish' ORDER BY id;`));
    const revAfter2 = sql(`SELECT rev, status FROM itp WHERE id='sat-itp-publish';`);
    note('7. rev/status after RETRY (expect still Rev2.0/Approved)', revAfter2);
    await page.unroute('**/api/files/upload');
} catch (e) { fail('ITP Publish payload/audit capture', e); }

await browser.close();
console.log('DONE');
