import test from 'node:test';
import assert from 'node:assert/strict';

// api.ts reads the csrf cookie and window.location inside its interceptors; give it just enough of a browser.
(globalThis as any).document = { cookie: '' };
(globalThis as any).window = { location: { pathname: '/itp', origin: 'http://localhost', href: '' } };
const { default: api } = await import('../src/services/api');
const { useITPStore } = await import('../src/store/itpStore');

// A recording adapter: no network, no server — only what the client actually sends.
const requests: { method?: string; url?: string; data?: unknown }[] = [];
api.defaults.adapter = async (config) => {
    let data = config.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* leave as string */ } }
    requests.push({ method: config.method, url: config.url, data });
    return {
        data: { id: 'new-id', referenceNo: 'QTS-TEST-ITP-000001', ...(typeof data === 'object' && data ? data : {}) },
        status: 200, statusText: 'OK', headers: {}, config,
    };
};

// Data-contract test for addITP's detail_data handling: ITP.tsx's onSave (the only real call
// site — confirmed via a repo-wide grep of every "addITP(" occurrence, which finds exactly two:
// this store's own definition and that one call site) always passes the SAME phase-split shape
// ITPModals.tsx's prepareDetailPayload() produces — {a: [...], b: [...], c: [...], checklist: [],
// self_inspection: null} — never the flat ITPInspectionItem[] shape the field's OWN TypeScript
// type declares. An earlier version of this store did a per-item remapping (itemNo -> item_no,
// etc.) that assumed the flat-array shape and would throw calling .map() on a non-array object;
// that mapping is gone now, replaced with a pass-through. This test locks down the actual,
// exercised contract (pass-through, unmodified) so a future edit that reintroduces per-item
// remapping — which would silently break on this exact shape — fails loudly here first.
test('addITP passes detail_data through UNCHANGED, matching the phase-split shape its one real caller (ITP.tsx) sends', async () => {
    requests.length = 0;
    const detailData = {
        a: [{ id: 'A1', activity: { en: 'Check rebar', ch: '' }, criteria: [{ en: 'per spec', ch: '' }], isNew: true }],
        b: [],
        c: [],
        checklist: [],
        self_inspection: null,
    };
    await useITPStore.getState().addITP({
        vendor: 'Test Co',
        description: 'contract test',
        rev: 'Rev1.0',
        submit: '',
        status: 'Pending',
        remark: '',
        submissionDate: '2026-09-28',
        detail_data: detailData as any,
    } as any);

    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'post');
    assert.equal(requests[0].url, '/itp/');
    const sent = requests[0].data as any;
    // Pass-through: byte-for-byte the same object the caller supplied, no per-item key renaming
    // (item_no/reference_doc/... does NOT appear), no .map() applied (would throw on this
    // non-array shape if it were).
    assert.deepEqual(sent.detail_data, detailData);
});

test('addITP with no detail_data at all (a plain new record) sends detail_data as null/undefined, not an empty array or throwing', async () => {
    requests.length = 0;
    await useITPStore.getState().addITP({
        vendor: 'Test Co',
        description: 'no plan yet',
        rev: 'Rev1.0',
        submit: '',
        status: 'Pending',
        remark: '',
        submissionDate: '2026-09-28',
    } as any);

    assert.equal(requests.length, 1);
    const sent = requests[0].data as any;
    assert.ok(sent.detail_data === null || sent.detail_data === undefined);
});

test('addITP preserves the explicitly selected project in its POST', async () => {
    requests.length = 0;
    await useITPStore.getState().addITP({
        vendor: 'Test Co', description: 'project selection', rev: 'Rev1.0',
        submit: '', status: 'Pending', remark: '', project_id: 'allowed-project-2',
    });
    assert.equal((requests[0].data as any).project_id, 'allowed-project-2');
});
