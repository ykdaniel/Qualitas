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
