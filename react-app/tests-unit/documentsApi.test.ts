// KM-DOCS-2026-001 D2: what the register sends — list query shape (booleans as strings, empties dropped), row_version on
// edits and transitions, the multipart version upload (only the files given, the summary always, the label only when typed).
import assert from 'node:assert/strict';
import test from 'node:test';
import { listQuery } from '../src/services/documentsApi';
import { withRowVersion } from '../src/utils/rowVersion';

test('listQuery keeps the scope, turns booleans into strings and drops empty filters', () => {
    assert.deepEqual(listQuery({ scope: 'company', doc_type: '', status: undefined, q: 'weld', include_hidden: true, limit: 500 }),
        { scope: 'company', q: 'weld', include_hidden: 'true', limit: 500 });
    assert.deepEqual(listQuery({ scope: 'company' }), { scope: 'company' });
});

test('an edit and a transition carry the version the document was read at, and none when it is unknown', () => {
    assert.deepEqual(withRowVersion({ title_zh: 'x', row_version: 99 }, 3), { title_zh: 'x', row_version: 3 });
    assert.deepEqual(withRowVersion({ to: 'current', version_id: 'v1' }, 0), { to: 'current', version_id: 'v1', row_version: 0 });
    assert.deepEqual(withRowVersion({ to: 'archived' }, null), { to: 'archived' });
});

test('the multipart version upload only appends what was given', async () => {
    const seen: { url: string; body: FormData }[] = [];
    const api = (await import('../src/services/api')).default;
    const original = api.post;
    (api as { post: unknown }).post = async (url: string, body: FormData) => { seen.push({ url, body }); return { data: { id: 'v' } }; };
    try {
        const { documentsApi } = await import('../src/services/documentsApi');
        const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'a.pdf', { type: 'application/pdf' });
        await documentsApi.addVersion('d1', { pdf }, 'first', '  ');
        await documentsApi.addVersion('d1', { pdf }, '', 'Rev A');
    } finally {
        (api as { post: unknown }).post = original;
    }
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, '/documents/d1/versions');
    assert.deepEqual([...seen[0].body.keys()].sort(), ['change_summary', 'pdf']);
    assert.equal(seen[0].body.get('change_summary'), 'first');
    assert.deepEqual([...seen[1].body.keys()].sort(), ['change_summary', 'pdf', 'version_label']);
    assert.equal(seen[1].body.get('version_label'), 'Rev A');
});
