import test from 'node:test';
import assert from 'node:assert/strict';

// Optimistic lock, batch B2 (OPTIMISTIC-LOCK-2026-001): the version a record form saves against, and the refusal dialog's
// "Reload this record" for a 409 VERSION_CONFLICT.
const { createRecordVersion, reloadAndReopen } = await import('../src/hooks/useRecordVersion');
const { isVersionConflict } = await import('../src/utils/refusal');
const { showRefusal, showCodedRefusal, useRefusalStore } = await import('../src/store/refusalStore');
const fs = await import('node:fs');

const axiosError = (status: number, data: unknown) => ({ isAxiosError: true, response: { status, data } });

test('the form version: taken at open, moved on only by a save that answered a version', () => {
    const v = createRecordVersion();
    assert.equal(v.current(), null);                              // nothing opened: no version is sent
    v.open(3);
    assert.equal(v.current(), 3);
    v.saved(4);                                                   // the first write of a save went through
    assert.equal(v.current(), 4);                                 // ...the second write (deferred status, Save draft again) sends 4
    v.saved(undefined);                                           // an answer without a version changes nothing
    v.saved(null);
    assert.equal(v.current(), 4);
    v.open(undefined);                                            // a new record
    assert.equal(v.current(), null);
    v.saved(0);                                                   // created: version 0 is a version
    assert.equal(v.current(), 0);
});

// a session like useOpenSession's, without React
const fakeSession = () => {
    let value = 0;
    return { key: 0, next: () => ++value, isCurrent: (n: number) => n === value };
};

test('reload this record: closes, reloads, reopens — or leaves alone a form opened meanwhile (R1 P1), or says why not', async () => {
    const run = async (o: { failed?: boolean; found?: boolean; openMeanwhile?: boolean }) => {
        const session = fakeSession();
        const log: string[] = [];
        await reloadAndReopen(session, {
            close: () => log.push('close'),
            reload: async () => { log.push('reload'); if (o.openMeanwhile) session.next(); },      // the user opened a row
            failed: () => !!o.failed,
            found: () => o.found !== false,
            reopen: () => log.push('reopen'),
            forget: () => log.push('forget'),
            notify: (n) => log.push(n),
        });
        return log;
    };
    assert.deepEqual(await run({}), ['close', 'reload', 'reopen']);
    assert.deepEqual(await run({ openMeanwhile: true }), ['close', 'reload']);             // never touches the newer form
    assert.deepEqual(await run({ failed: true }), ['close', 'reload', 'forget', 'refusal.reloadFailed']);
    assert.deepEqual(await run({ found: false }), ['close', 'reload', 'forget', 'refusal.reloadGone']);
});

test('isVersionConflict: only the coded 409 VERSION_CONFLICT', () => {
    assert.equal(isVersionConflict(axiosError(409, { code: 'VERSION_CONFLICT', detail: 'x' })), true);
    assert.equal(isVersionConflict(axiosError(409, { code: 'RECORD_LOCKED', detail: 'x' })), false);
    assert.equal(isVersionConflict(axiosError(409, { detail: 'Conflict' })), false);
    assert.equal(isVersionConflict(new Error('VERSION_CONFLICT')), false);
});

test('showRefusal carries the reload action and whether it discards input; 401 is still dropped', () => {
    const reload = () => undefined;
    showRefusal(axiosError(409, { code: 'VERSION_CONFLICT', detail: 'x' }), 'save', { keepsInput: true, onReload: reload });
    let current = useRefusalStore.getState().current;
    assert.equal(current?.onReload, reload);
    assert.equal(current?.keepsInput, true);
    assert.equal(current?.reloadDiscardsInput, undefined);       // default: the dialog asks before discarding the form
    showRefusal(axiosError(409, { code: 'VERSION_CONFLICT', detail: 'x' }), 'save', { onReload: reload, reloadDiscardsInput: false });
    current = useRefusalStore.getState().current;
    assert.equal(current?.reloadDiscardsInput, false);          // a list row's action: nothing typed to lose
    useRefusalStore.getState().close();
    showRefusal(axiosError(401, {}), 'save', { onReload: reload });
    assert.equal(useRefusalStore.getState().current, null);
    showCodedRefusal('DELETE_REFERENCED', {}, 'delete');
    assert.equal(useRefusalStore.getState().current?.onReload, undefined);
    useRefusalStore.getState().close();
});

test('the reload wording exists in both languages', () => {
    const src = fs.readFileSync('src/context/LanguageContext.tsx', 'utf8');
    for (const key of ['refusal.reload', 'refusal.reloadConfirm', 'refusal.reloadConfirmYes', 'refusal.reloadCancel',
                       'refusal.reloadGone', 'refusal.reloadFailed']) {
        const hits = src.match(new RegExp(`'${key.replace('.', '\\.')}':`, 'g')) ?? [];
        assert.equal(hits.length, 2, `${key} must be defined once in English and once in Chinese`);
    }
    assert.match(src, /'refusal\.reload': '重新載入這筆'/);
});

test('serial writes (B3a): overlapping writes run one after another, each sees the version the previous one answered', async () => {
    const { createSerialWrites } = await import('../src/hooks/useRecordVersion');
    const serial = createSerialWrites();
    const v = createRecordVersion();
    v.open(5);
    const sent: number[] = [];
    let stored = 5;
    const write = (delay: number, fail = false) => serial(async () => {
        const mine = v.current();
        sent.push(mine as number);
        await new Promise(r => setTimeout(r, delay));
        if (fail || mine !== stored) throw new Error('409');
        stored += 1;
        v.saved(stored);
    });
    // three item saves fired at once (the first one slow), then one that fails, then Save
    const results = await Promise.allSettled([write(30), write(0), write(0, true), write(0)]);
    assert.deepEqual(sent, [5, 6, 7, 7]);                     // never two writes with the same version in flight
    assert.deepEqual(results.map(r => r.status), ['fulfilled', 'fulfilled', 'rejected', 'fulfilled']);
    assert.equal(v.current(), 8);
});

test('itpStore.updateITPDetail (B3a): takes the saved ITP from the answer (new row_version) instead of re-fetching', async () => {
    (globalThis as any).document ??= { cookie: '' };
    (globalThis as any).window ??= { location: { pathname: '/itp', origin: 'http://localhost', href: '' } };
    const { default: api } = await import('../src/services/api');
    const { useITPStore } = await import('../src/store/itpStore');
    const calls: string[] = [];
    api.defaults.adapter = async (config) => {
        calls.push(`${config.method} ${config.url}`);
        return { data: { id: 'p1', referenceNo: 'ITP-1', detail_data: '{"a":[]}', row_version: 9 }, status: 200, statusText: 'OK', headers: {}, config };
    };
    useITPStore.setState({ itpList: [{ id: 'p1', row_version: 8 } as any, { id: 'p2', row_version: 1 } as any] });
    const saved = await useITPStore.getState().updateITPDetail('p1', { a: [] }, 8);
    assert.equal(saved.row_version, 9);
    assert.deepEqual(calls, ['put /itp/p1/detail']);           // no list re-fetch (it dropped the page's search)
    assert.equal(useITPStore.getState().itpList.find(i => i.id === 'p1')?.row_version, 9);
    assert.equal(useITPStore.getState().itpList.find(i => i.id === 'p2')?.row_version, 1);
});

test('B3b stores: scope save writes the account version back; a working load clears an old error; KM errors stay axios errors', async () => {
    (globalThis as any).document ??= { cookie: '' };
    (globalThis as any).window ??= { location: { pathname: '/iam', origin: 'http://localhost', href: '' } };
    (globalThis as any).localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
    const { default: api } = await import('../src/services/api');
    const { useIAMStore } = await import('../src/store/iamStore');
    const { useContractorsStore } = await import('../src/store/contractorsStore');
    const { useProjectStore } = await import('../src/store/projectStore');
    const { useKMStore } = await import('../src/store/kmStore');
    const sent: any[] = [];
    let reply: (config: any) => any = () => ({ status: 200, data: {} });
    api.defaults.adapter = async (config) => {
        let data = config.data;
        if (typeof data === 'string') { try { data = JSON.parse(data); } catch { /* keep */ } }
        sent.push({ method: config.method, url: config.url, data });
        const r = reply(config);
        if (r.status >= 400) {
            const err: any = new Error('Request failed'); err.isAxiosError = true; err.response = { status: r.status, data: r.data }; err.config = config;
            throw err;
        }
        return { data: r.data, status: r.status, statusText: 'OK', headers: {}, config };
    };

    // IAM: the scope save sends the account's version and the answered one replaces it in the user list
    useIAMStore.setState({ users: [{ id: '7', row_version: 3 } as any, { id: '8', row_version: 1 } as any] });
    reply = () => ({ status: 200, data: { project_ids: ['P1'], vendor_id: null, row_version: 4 } });
    const saved = await useIAMStore.getState().saveUserScope(7, { project_ids: ['P1'], vendor_id: null }, 3);
    assert.equal(saved.row_version, 4);
    assert.deepEqual(sent.at(-1)?.data, { project_ids: ['P1'], vendor_id: null, row_version: 3 });
    assert.equal(useIAMStore.getState().users.find(u => u.id === '7')?.row_version, 4);
    assert.equal(useIAMStore.getState().users.find(u => u.id === '8')?.row_version, 1);

    // contractors / projects: a load that works clears the error of an earlier failed one
    useContractorsStore.setState({ error: 'Failed to fetch contractors' });
    reply = () => ({ status: 200, data: [] });
    await useContractorsStore.getState().fetchContractors();
    assert.equal(useContractorsStore.getState().error, null);
    useProjectStore.setState({ error: 'Failed to fetch projects' });
    await useProjectStore.getState().fetchProjects();
    assert.equal(useProjectStore.getState().error, null);

    // KM: a refused update reaches the caller as the axios error (status and code intact), not a bare Error
    reply = () => ({ status: 409, data: { code: 'VERSION_CONFLICT', detail: 'changed', params: { docType: 'KM', number: 'x' } } });
    await assert.rejects(useKMStore.getState().updateKM('k1', { content: 'c', version_no: 1 } as any),
        (err: any) => err.isAxiosError === true && err.response?.status === 409 && err.response?.data?.code === 'VERSION_CONFLICT');
});

test('itrStore.updateITR (B4): resolves to the saved ITR with its new row_version, sent only when given', async () => {
    (globalThis as any).document ??= { cookie: '' };
    (globalThis as any).window ??= { location: { pathname: '/itr', origin: 'http://localhost', href: '' } };
    const { default: api } = await import('../src/services/api');
    const { useITRStore } = await import('../src/store/itrStore');
    const sent: any[] = [];
    api.defaults.adapter = async (config) => {
        const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
        sent.push(data);
        return { data: { id: 'i1', documentNumber: 'ITR-1', ...data, row_version: 6 }, status: 200, statusText: 'OK', headers: {}, config };
    };
    useITRStore.setState({ itrList: [{ id: 'i1', row_version: 5 } as any] });
    const saved = await useITRStore.getState().updateITR('i1', { remark: 'r', row_version: 2 } as any, 5);
    assert.equal(sent.at(-1)?.row_version, 5);                     // the explicit version, not the one inside the payload
    assert.equal(saved.row_version, 6);
    assert.equal(useITRStore.getState().itrList[0].row_version, 6);
});
