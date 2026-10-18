import test from 'node:test';
import assert from 'node:assert/strict';

// Optimistic lock, batch B1 (OPTIMISTIC-LOCK-2026-001): stores keep the version they read and send one ONLY when the caller
// passes it. A form that resends its whole record must not resend the version it was opened with.

// api.ts reads the csrf cookie and window.location inside its interceptors; give it just enough of a browser.
(globalThis as any).document = { cookie: '' };
(globalThis as any).window = { location: { pathname: '/ncr', origin: 'http://localhost', href: '' } };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
const { default: api, createNcrFromItr, revokeItrApproval, setUserScope, updateContractor } = await import('../src/services/api');
const { withRowVersion, rowVersionParams } = await import('../src/utils/rowVersion');
const { useNCRStore } = await import('../src/store/ncrStore');
const { useITRStore } = await import('../src/store/itrStore');
const { useFATStore } = await import('../src/store/fatStore');
const { useChecklistStore } = await import('../src/store/checklistStore');
const { useITPStore } = await import('../src/store/itpStore');
const { useIAMStore } = await import('../src/store/iamStore');
const { useProjectStore } = await import('../src/store/projectStore');
const { updateRegistered } = await import('../src/services/materialApi');

// A recording adapter: no network, no server — only what the client actually sends. Every answer carries row_version 8.
const requests: { method?: string; url?: string; data?: any; params?: any }[] = [];
let answer: (data: any) => any = (data) => ({ id: 'x1', ...(typeof data === 'object' && data ? data : {}), row_version: 8 });
api.defaults.adapter = async (config) => {
    let data = config.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* leave as string */ } }
    requests.push({ method: config.method, url: config.url, data, params: config.params });
    return { data: answer(data), status: 200, statusText: 'OK', headers: {}, config };
};
const last = () => requests[requests.length - 1];

test('withRowVersion drops a version inside the payload and adds only the explicit one', () => {
    assert.deepEqual(withRowVersion({ a: 1, row_version: 3 }), { a: 1 });
    assert.deepEqual(withRowVersion({ a: 1, row_version: 3 }, 5), { a: 1, row_version: 5 });
    assert.deepEqual(withRowVersion({ a: 1 }, 0), { a: 1, row_version: 0 });          // 0 is a version, not "none"
    assert.deepEqual(withRowVersion({ a: 1 }, null), { a: 1 });
    const input = { a: 1, row_version: 3 };
    withRowVersion(input, 4);
    assert.deepEqual(input, { a: 1, row_version: 3 });                               // the caller's object is not changed
    assert.equal(rowVersionParams(undefined), undefined);
    assert.deepEqual(rowVersionParams(2), { row_version: 2 });
});

test('a store save sends no version unless the caller gives one, and keeps the version it gets back', async () => {
    useNCRStore.setState({ ncrList: [{ id: 'x1', row_version: 2 } as any] });
    await useNCRStore.getState().updateNCR('x1', { description: 'd', row_version: 2 } as any);
    assert.equal('row_version' in last().data, false);                    // the whole record resent: its version is dropped
    assert.equal(useNCRStore.getState().ncrList[0].row_version, 8);      // ...and the answer's version is kept
    await useNCRStore.getState().updateNCR('x1', { description: 'd' }, 8);
    assert.equal(last().data.row_version, 8);
});

test('the ITR store sends row_version only when given (the old detail_data._version echo is unchanged)', async () => {
    useITRStore.setState({ itrList: [{ id: 'x1', detail_data: JSON.stringify({ _version: 4 }), row_version: 4 } as any] });
    await useITRStore.getState().updateITR('x1', { remark: 'r', row_version: 4, detail_data: '{}' } as any);
    assert.equal('row_version' in last().data, false);
    assert.deepEqual(JSON.parse(last().data.detail_data), { _version: 4 });
    await useITRStore.getState().updateITR('x1', { remark: 'r' }, 4);
    assert.equal(last().data.row_version, 4);
});

test('FAT details: the version goes in the query, the answer\'s version is kept; no query without one', async () => {
    useFATStore.setState({ fatList: [{ id: 'f1', row_version: 1 } as any], fatDetails: {} });
    answer = () => ({ id: 'f1', row_version: 2 });
    await useFATStore.getState().saveFATDetails('f1', [], 1);
    assert.deepEqual(last().params, { row_version: 1 });
    assert.deepEqual(last().data, []);
    assert.equal(useFATStore.getState().fatList[0].row_version, 2);
    await useFATStore.getState().saveFATDetails('f1', []);
    assert.equal(last().params, undefined);
    answer = (data) => ({ id: 'x1', ...(typeof data === 'object' && data ? data : {}), row_version: 8 });
});

test('ITP plan: an object gets the version only when given; anything else goes as it is (never an empty plan)', async () => {
    answer = () => [];
    await useITPStore.getState().updateITPDetail('p1', { a: [], row_version: 3 }, 4);
    assert.deepEqual(requests.find(r => r.method === 'put' && r.url === '/itp/p1/detail' && r.data?.row_version === 4)?.data, { a: [], row_version: 4 });
    requests.length = 0;
    await useITPStore.getState().updateITPDetail('p1', null);
    const sent = requests.find(r => r.method === 'put');
    assert.ok(sent && sent.data == null, JSON.stringify(sent?.data));     // null goes as null, as before — not {}
    answer = (data) => ({ id: 'x1', ...(typeof data === 'object' && data ? data : {}), row_version: 8 });
});

test('secondary writes: ITR create-NCR and revoke, user scope, contractor, material', async () => {
    await createNcrFromItr('i1');
    assert.equal(last().params, undefined);
    await createNcrFromItr('i1', 3);
    assert.deepEqual(last().params, { row_version: 3 });
    await revokeItrApproval('i1', 'In Progress', 'why', 5);
    assert.deepEqual(last().data, { new_status: 'In Progress', reason: 'why', row_version: 5 });
    await setUserScope(7, { project_ids: ['P1'], vendor_id: null, row_version: 1 });
    assert.deepEqual(last().data, { project_ids: ['P1'], vendor_id: null });
    await setUserScope(7, { project_ids: ['P1'], vendor_id: null }, 1);
    assert.equal(last().data.row_version, 1);
    await updateContractor('v1', { name: 'n' }, 0);
    assert.deepEqual(last().data, { name: 'n', row_version: 0 });
    await updateRegistered('s1', { brand: 'b', rowVersion: 9 } as any);
    assert.deepEqual(last().data, { brand: 'b' });                       // camelCase API: rowVersion, also only when given
    await updateRegistered('s1', { brand: 'b' }, 2);
    assert.deepEqual(last().data, { brand: 'b', rowVersion: 2 });
});

test('normalisers that pick fields keep row_version (checklist, IAM, projects)', async () => {
    answer = () => [{ id: 'c1', recordsNo: 'CHK-1', itpIndex: 0, status: 'Ongoing', detail_data: '{"items":[]}', row_version: 6 }];
    await useChecklistStore.getState().fetchRecords();
    assert.equal(useChecklistStore.getState().records[0].row_version, 6);
    answer = (data) => ({ id: 'c1', recordsNo: 'CHK-1', itpIndex: 0, status: 'Ongoing', detail_data: '{"items":[]}', ...data, row_version: 7 });
    const saved = await useChecklistStore.getState().updateRecord('c1', { activity: 'a', row_version: 6 } as any);
    assert.equal('row_version' in last().data, false);
    assert.equal(saved.row_version, 7);

    answer = () => [{ id: 3, username: 'u', email: 'u@example.com', role_id: 1, permissions: [], is_active: true, row_version: 4 }];
    await useIAMStore.getState().fetchUsers();
    assert.equal(useIAMStore.getState().users[0].row_version, 4);
    answer = () => ({ id: 3, username: 'u', email: 'u@example.com', role_id: 1, permissions: [], is_active: true, row_version: 5 });
    await useIAMStore.getState().updateUser(3, { email: 'u@example.com' }, 4);
    assert.deepEqual(last().data, { email: 'u@example.com', row_version: 4 });
    assert.equal(useIAMStore.getState().users[0].row_version, 5);

    answer = () => [{ id: 'P1', name: 'Tower', code: 'TW', description: null, owner: null, created_at: null, row_version: 2 }];
    await useProjectStore.getState().fetchProjects();
    assert.equal(useProjectStore.getState().projectList[0].row_version, 2);
});
