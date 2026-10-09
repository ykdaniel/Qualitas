// Dashboard / Q-Workflow business review — real browser, isolated stack (2026-09-24).
// Dashboard has no backend endpoint of its own (pure client-side aggregation of each module's
// own scope-enforced list); Q-Workflow has no permission gate, only P0 scope filtering. This
// checks: (1) an unscoped account sees both seeded projects' data on both pages; (2) a
// project-scoped account sees ONLY its own project's data on both pages, confirming P0
// isolation actually reaches these two aggregate/read-only surfaces, not just per-module CRUD.
import { chromium } from '/Users/nook/Documents/Qualitas/react-app/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';
const stack = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const UI = `http://127.0.0.1:${stack.vite_port}`, PW = 'Accept-Test-1234';
const note = (name, extra = '') => console.log(`OBSERVED ${name}${extra !== '' ? '  -> ' + String(extra).replace(/\s+/g, ' ').slice(0, 500) : ''}`);
const fail = (section, err) => console.log(`NOT VERIFIED ON SCREEN [${section}]  -> ${String(err?.message || err).split('\n')[0]}`);

const browser = await chromium.launch({ headless: true });
async function login(user) {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await ctx.addInitScript(() => localStorage.setItem('language', 'zh'));
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    await p.goto(UI + '/login'); await p.fill('#email', user); await p.fill('#password', PW); await p.click('button[type=submit]');
    await p.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 15000 });
    return p;
}

const unscoped = await login('dw_unscoped');
const scoped = await login('dw_scoped_p1');

// ══ 1. Q-Workflow tracker: row count per account ═════════════════════════════════════════════════
try {
    await unscoped.goto(UI + '/workflow'); await unscoped.waitForTimeout(1500);
    const unscopedText = await unscoped.locator('body').innerText();
    note('unscoped account: "DW Accepted (P1)" row visible', unscopedText.includes('DW Accepted (P1)'));
    note('unscoped account: "DW Stuck at W-H (P2)" row visible', unscopedText.includes('DW Stuck at W-H (P2)'));

    await scoped.goto(UI + '/workflow'); await scoped.waitForTimeout(1500);
    const scopedText = await scoped.locator('body').innerText();
    note('scoped(P1) account: "DW Accepted (P1)" row visible (own project, expect true)', scopedText.includes('DW Accepted (P1)'));
    note('scoped(P1) account: "DW Stuck at W-H (P2)" row visible (other project, expect FALSE)', scopedText.includes('DW Stuck at W-H (P2)'));
} catch (e) { fail('1. Q-Workflow scope filtering', e); }

// ══ 2. Dashboard: NOI counts per account (client-side aggregation of the scoped NOI list) ════════
try {
    await unscoped.goto(UI + '/dashboard'); await unscoped.waitForTimeout(1500);
    const unscopedDashText = await unscoped.locator('body').innerText();
    const noiMatchUnscoped = unscopedDashText.match(/NOI[\s\S]{0,40}?(\d+)/);
    note('unscoped account dashboard: NOI-related figure near "NOI" label', noiMatchUnscoped ? noiMatchUnscoped[0].replace(/\s+/g, ' ') : '(pattern not found — see manual check)');

    await scoped.goto(UI + '/dashboard'); await scoped.waitForTimeout(1500);
    const scopedDashText = await scoped.locator('body').innerText();
    const noiMatchScoped = scopedDashText.match(/NOI[\s\S]{0,40}?(\d+)/);
    note('scoped(P1) account dashboard: NOI-related figure near "NOI" label', noiMatchScoped ? noiMatchScoped[0].replace(/\s+/g, ' ') : '(pattern not found — see manual check)');
} catch (e) { fail('2. Dashboard NOI count scope filtering', e); }

// ══ 3. Underlying NOI list API directly, per account (ground truth the Dashboard aggregates from) ═
async function apiCall(p, method, path) {
    return await p.evaluate(async ({ method, path }) => {
        const res = await fetch(path, { method, credentials: 'include' });
        let j = null; try { j = await res.json(); } catch (_) {}
        return { status: res.status, count: Array.isArray(j) ? j.length : null, refs: Array.isArray(j) ? j.map(x => x.referenceNo) : null };
    }, { method, path });
}
try {
    const unscopedNois = await apiCall(unscoped, 'GET', '/api/noi/');
    note('3a: unscoped account /api/noi/ — count and referenceNos', `count=${unscopedNois.count} refs=${JSON.stringify(unscopedNois.refs)}`);
    const scopedNois = await apiCall(scoped, 'GET', '/api/noi/');
    note('3b: scoped(P1) account /api/noi/ — count and referenceNos (expect only the P1 one)', `count=${scopedNois.count} refs=${JSON.stringify(scopedNois.refs)}`);
} catch (e) { fail('3. Underlying NOI list scope ground-truth', e); }

await browser.close();
console.log('DONE');
