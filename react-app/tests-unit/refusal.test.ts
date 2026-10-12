// REFUSAL-DIALOG-2026-001: what the refusal dialog says (utils/refusal.ts), checked against the real dictionaries,
// and every refusal code the backend raises has its wording in both languages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeCoded, describeRefusal } from '../src/utils/refusal';

const fs = await import('node:fs');
const path = await import('node:path');

// The two dictionaries, read from the source (`npm test` runs from react-app/): en is the first block, zh the second.
const src = fs.readFileSync('src/context/LanguageContext.tsx', 'utf8').replace(/\r\n/g, '\n');
const zhStart = src.indexOf('\n  zh: {');
assert.ok(zhStart > 0, 'zh block not found');
const dict = (part: string) => Object.fromEntries([...part.matchAll(/^ {4}'([^']+)': '((?:[^'\\]|\\.)*)',$/gm)].map(m => [m[1], m[2]]));
const DICTS = { en: dict(src.slice(0, zhStart)), zh: dict(src.slice(zhStart)) };
const tr = (lang: 'en' | 'zh') => (key: string, params?: Record<string, string | number>) => {
    let v = DICTS[lang][key] ?? key;
    for (const [k, val] of Object.entries(params ?? {})) v = v.replace(new RegExp(`{${k}}`, 'g'), String(val));
    return v;
};
const zh = tr('zh');
const en = tr('en');

const axiosErr = (status: number | undefined, data?: unknown) => ({ isAxiosError: true, message: 'Request failed', response: status === undefined ? undefined : { status, data } });

test('a coded delete refusal is translated (zh and en) with its parameters', () => {
    const err = axiosErr(400, {
        detail: "Cannot delete NCR 'QTS-NCR-000012' with status 'Open'. Please Void the NCR first, then delete.",
        code: 'DELETE_NOT_VOID', params: { docType: 'NCR', number: 'QTS-NCR-000012', status: 'Open', allowed: ['Void'] },
    });
    assert.deepEqual(describeRefusal(err, zh, 'delete', 'zh'), {
        title: '無法刪除', message: 'NCR QTS-NCR-000012 的狀態為「Open」，請先作廢（Void）再刪除。', items: undefined,
    });
    assert.equal(describeRefusal(err, en, 'delete', 'en')?.message, 'NCR QTS-NCR-000012 is "Open". Void it first, then delete it.');
});

test('Meeting Minutes (Draft may also be deleted) gets its own wording', () => {
    const err = axiosErr(400, { detail: 'x', code: 'DELETE_NOT_VOID', params: { docType: 'MeetingMinutes', number: 'MOM-1', status: 'Published', allowed: ['Void', 'Draft'] } });
    assert.match(describeRefusal(err, zh, 'delete', 'zh')!.message, /^會議記錄 MOM-1 的狀態為「Published」。只有草稿（Draft）/);
});

test('DELETE_REFERENCED lists the citing documents as bullet lines with translated types', () => {
    const err = axiosErr(400, { detail: 'x', code: 'DELETE_REFERENCED', params: {
        docType: 'NOI', number: 'NOI-7', references: [{ type: 'ITR', count: 2 }, { type: 'Follow-up', count: 1 }, { type: 'Mystery', count: 3 }] } });
    const view = describeRefusal(err, zh, 'delete', 'zh')!;
    assert.equal(view.message, 'NOI NOI-7 仍被下列紀錄引用，請先處理這些紀錄：');
    assert.deepEqual(view.items, ['2 筆 ITR', '1 筆 Follow-up', '3 筆 Mystery']);       // an unknown type is shown as sent
    assert.deepEqual(describeRefusal(err, en, 'delete', 'en')!.items, ['2 ITR record(s)', '1 Follow-up record(s)', '3 Mystery record(s)']);
    // lower-case entity names from the shared reference check (contractor / project / role) are translated too
    const contractor = axiosErr(400, { detail: 'x', code: 'DELETE_REFERENCED', params: { docType: 'contractor', number: 'ACME', references: [{ type: 'ITP', count: 1 }] } });
    assert.equal(describeRefusal(contractor, zh, 'delete', 'zh')!.message, '承包商 ACME 仍被下列紀錄引用，請先處理這些紀錄：');
});

test('list parameters are joined, and records the caller cannot see are counted, never named', () => {
    const err = axiosErr(400, { detail: 'x', code: 'ITR_DELETE_SOURCE_CITED', params: { number: 'ITR-9', refs: ['NCR-1', 'OBS-2'], hiddenCount: 1 } });
    assert.equal(describeRefusal(err, zh, 'delete', 'zh')!.message, 'ITR ITR-9 是下列紀錄的來源 ITR：NCR-1、OBS-2、另 1 筆您沒有權限查看的紀錄。請改為作廢，不要刪除。');
    const none = axiosErr(400, { detail: 'x', code: 'ITR_DELETE_SOURCE_CITED', params: { number: 'ITR-9', refs: ['NCR-1'], hiddenCount: 0 } });
    assert.equal(describeRefusal(none, en, 'delete', 'en')!.message, 'ITR ITR-9 is the source ITR of NCR-1. Void the ITR instead of deleting it.');
});

test('attachment locks pick their wording by kind', () => {
    const err = axiosErr(409, { detail: 'x', code: 'ATTACHMENT_LOCKED', params: { kind: 'record', docType: 'MEETING', status: 'Published' } });
    assert.equal(describeRefusal(err, zh, 'delete', 'zh')!.message, '這筆會議記錄的狀態為「Published」，附件已鎖定，不能變更。');
});

test('a parameter the record does not have (a legacy row without a number) shows a dash, never the placeholder', () => {
    const err = axiosErr(400, { detail: 'x', code: 'ITR_DELETE_LOCKED', params: { number: null, status: 'Approved' } });
    const message = describeRefusal(err, zh, 'delete', 'zh')!.message;
    assert.equal(message, 'ITR — 的狀態為「Approved」（已鎖定）。核准或作廢的 ITR 會保留存檔，不能刪除。');
    assert.ok(!/[{}]/.test(message));
});

test('a missing permission names the permission code', () => {
    const err = axiosErr(403, { detail: 'Operation not permitted. Required: ncr:delete:all', code: 'PERMISSION_DENIED', params: { permissions: ['ncr:delete:all'] } });
    assert.equal(describeRefusal(err, zh, 'delete', 'zh')!.message, '您沒有執行此操作的權限（需要 ncr:delete:all）。');
    // AnyPermissionChecker: alternatives, not "all of"
    const anyOf = axiosErr(403, { detail: 'x', code: 'PERMISSION_DENIED', params: { permissions: ['a:view:all', 'b:view:all'] } });
    assert.equal(describeRefusal(anyOf, zh, 'delete', 'zh')!.message, '您沒有執行此操作的權限（需要下列其中一項：a:view:all、b:view:all）。');
    assert.equal(describeRefusal(anyOf, en, 'delete', 'en')!.message, 'You do not have permission to do this (requires one of: a:view:all, b:view:all).');
});

test('a refusal without a code: Chinese line plus the original in zh, the original alone in en', () => {
    const err = axiosErr(400, { detail: 'Cannot do the thing.' });
    assert.deepEqual(describeRefusal(err, zh, 'save', 'zh'), { title: '無法儲存', message: '系統拒絕了這個操作，原因如下：', original: 'Cannot do the thing.' });
    assert.deepEqual(describeRefusal(err, en, 'save', 'en'), { title: 'Cannot save', message: 'Cannot do the thing.' });
    // an unknown code falls back the same way
    const unknown = axiosErr(400, { detail: 'Cannot do the thing.', code: 'NOT_A_CODE', params: {} });
    assert.equal(describeRefusal(unknown, zh, 'delete', 'zh')!.original, 'Cannot do the thing.');
});

test('status-only fallbacks: 404, 403, 409, 422 field errors', () => {
    assert.equal(describeRefusal(axiosErr(404, { detail: 'NCR not found' }), zh, 'delete', 'zh')!.message, '這筆紀錄已不存在，可能已被其他人刪除。請重新整理清單。');
    assert.equal(describeRefusal(axiosErr(403, {}), zh, 'delete', 'zh')!.message, '您沒有執行此操作的權限。');
    assert.match(describeRefusal(axiosErr(409, {}), zh, 'delete', 'zh')!.message, /^這筆資料已在別處被更改/);
    const v = describeRefusal(axiosErr(422, { detail: [{ loc: ['body', 'raiseDate'], code: 'invalid_calendar', msg: 'date is not a real calendar date' }] }), zh, 'save', 'zh')!;
    assert.equal(v.title, '無法儲存');
    assert.ok(v.message.length > 0 && !v.message.includes('['));
});

test('server and network failures are "failed", never show the body; 401 shows nothing', () => {
    const server = describeRefusal(axiosErr(500, { detail: 'Internal Server Error: Traceback ...' }), zh, 'delete', 'zh')!;
    assert.equal(server.title, '刪除失敗');
    assert.ok(server.message.includes('HTTP 500') && !server.message.includes('Traceback'));
    assert.equal(describeRefusal(axiosErr(undefined), en, 'save', 'en')!.title, 'Save failed');
    assert.equal(describeRefusal(axiosErr(401, { detail: 'Could not validate credentials' }), zh, 'delete', 'zh'), null);
    assert.equal(describeRefusal(new Error('boom'), zh, 'delete', 'zh')!.title, '刪除失敗');
});

test('describeCoded renders a refusal known before any request (NOI delete-check)', () => {
    const view = describeCoded('DELETE_REFERENCED', { docType: 'NOI', number: 'NOI-1', references: [{ type: 'Observation', count: 1 }] }, zh, 'delete')!;
    assert.equal(view.title, '無法刪除');
    assert.deepEqual(view.items, ['1 筆 Observation']);
    assert.equal(describeCoded('NOT_A_CODE', {}, zh, 'delete'), null);
});

test('every refusal code the backend raises has its wording in both languages', () => {
    const backend = path.resolve('..', 'backend');
    const files: string[] = [];
    const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'tests' || e.name.startsWith('.') || e.name === '__pycache__') continue;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (e.name.endsWith('.py')) files.push(p);
        }
    };
    walk(backend);
    const codes = new Set<string>();
    for (const f of files) {
        const text = fs.readFileSync(f, 'utf8');
        for (const m of text.matchAll(/Refusal\(\s*'([A-Z_]+)'/g)) codes.add(m[1]);
        for (const m of text.matchAll(/RefusalHTTPException\(\s*\d+,[^\n]*?'([A-Z_]+)'/g)) codes.add(m[1]);
        for (const m of text.matchAll(/RefusalHTTPException\(\s*409,\s*locked\[0\],\s*'([A-Z_]+)'/g)) codes.add(m[1]);
    }
    // raised through helpers rather than literally
    codes.add('DELETE_REFERENCED');
    codes.add('PERMISSION_DENIED');
    assert.ok(codes.size >= 16, `expected the batch-1 codes, found ${[...codes].join(', ')}`);
    for (const code of codes) {
        for (const lang of ['en', 'zh'] as const) {
            const has = Object.keys(DICTS[lang]).some((k) => k === `refusal.code.${code}` || k.startsWith(`refusal.code.${code}.`));
            assert.ok(has, `refusal.code.${code} missing in ${lang}`);
        }
    }
    // every wording only uses placeholders the backend sends for that code (backend/core/refusals.py callers)
    const PARAMS: Record<string, string[]> = {
        DELETE_NOT_VOID: ['docType', 'number', 'status', 'allowed'],
        DELETE_REFERENCED: ['docType', 'number', 'references'],
        ITR_DELETE_LOCKED: ['number', 'status'],
        ITR_DELETE_APPROVAL_HISTORY: ['number', 'eventCount', 'rowHistory'],
        ITR_DELETE_REINSPECTION_CITED: ['number', 'ncrs'],
        ITR_DELETE_SOURCE_CITED: ['number', 'refs', 'hiddenCount'],
        ITR_DELETE_HAS_REINSPECTIONS: ['number', 'children'],
        ITR_DELETE_CHECKLIST_EVIDENCE: ['number', 'checklists'],
        ITR_UNLINK_LOCKED: ['number', 'status'],
        ITR_UNLINK_EVIDENCE: ['checklist'],
        CHECKLIST_DELETE_ITR_OWNED: ['number', 'itr'],
        CHECKLIST_DELETE_HAS_EVIDENCE: ['number'],
        CONTRACTOR_DELETE_HAS_PERSONNEL: ['name', 'count'],
        ROLE_ADMIN_PROTECTED: [],
        PERMISSION_DENIED: ['permissions'],
        ATTACHMENT_LOCKED: ['kind', 'docType', 'status', 'category'],
    };
    assert.deepEqual([...codes].sort(), Object.keys(PARAMS).sort(), 'a backend code is missing from (or extra in) the PARAMS table');
    for (const lang of ['en', 'zh'] as const) {
        for (const [key, text] of Object.entries(DICTS[lang])) {
            const m = /^refusal\.code\.([A-Z_]+)/.exec(key);
            if (!m) continue;
            for (const ph of text.matchAll(/\{(\w+)\}/g)) assert.ok(PARAMS[m[1]].includes(ph[1]), `${lang} ${key} uses {${ph[1]}}, which the backend does not send`);
        }
        // each attachment-lock kind the backend can send (core/attachment_access.lock_refusal) has its own wording
        for (const kind of ['record', 'pqp', 'parentItr', 'evidence']) assert.ok(DICTS[lang][`refusal.code.ATTACHMENT_LOCKED.${kind}`], `${lang} ATTACHMENT_LOCKED.${kind}`);
        for (const code of Object.keys(PARAMS).filter((c) => c !== 'ATTACHMENT_LOCKED')) assert.ok(DICTS[lang][`refusal.code.${code}`], `${lang} refusal.code.${code}`);
    }
    // and both languages have exactly the same refusal.* keys
    const keys = (lang: 'en' | 'zh') => Object.keys(DICTS[lang]).filter((k) => k.startsWith('refusal.')).sort();
    assert.deepEqual(keys('zh'), keys('en'));
});
