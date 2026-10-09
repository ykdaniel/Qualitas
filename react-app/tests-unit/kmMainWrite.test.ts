import test from 'node:test';
import assert from 'node:assert/strict';
import { writeKMMain } from '../src/utils/kmMainWrite';
import type { KMMainWriteState } from '../src/utils/kmMainWrite';
import { kmService } from '../src/services/kmService';

test('confirmed create survives a later chapter failure; retry updates same main with latest content/version', async () => {
    const originalCreate = kmService.create, originalUpdate = kmService.update;
    const calls: unknown[] = [];
    try {
        kmService.create = async payload => { calls.push(['POST', payload]); return { id: 'main-1', version_no: 1 } as any; };
        kmService.update = async (id, payload) => { calls.push(['PUT', id, payload]); return { id, version_no: 2 } as any; };
        const state: KMMainWriteState = { id: null };
        await writeKMMain(state, { title: 'First', content: '' });
        // The caller's chapter phase rejects; this confirmed main state must survive it.
        await assert.rejects(async () => { throw new Error('chapter failed'); });
        await writeKMMain(state, { title: 'Edited before retry', content: '' });
        assert.deepEqual(calls, [['POST', { title: 'First', content: '' }], ['PUT', 'main-1', { title: 'Edited before retry', content: '', version_no: 1 }]]);
        assert.deepEqual(state, { id: 'main-1', versionNo: 2 });
    } finally { kmService.create = originalCreate; kmService.update = originalUpdate; }
});

test('main rejection does not advance saved id/version; confirmed updates carry fresh version into retry', async () => {
    const original = kmService.update;
    try {
        const state: KMMainWriteState = { id: 'existing', versionNo: 4 };
        kmService.update = async () => { throw new Error('rejected'); };
        await assert.rejects(writeKMMain(state, { title: 'changed' }));
        assert.deepEqual(state, { id: 'existing', versionNo: 4 });
        const versions: unknown[] = [];
        kmService.update = async (id, payload) => { versions.push(payload.version_no); return { id, version_no: Number(payload.version_no) + 1 } as any; };
        await writeKMMain(state, { title: 'changed', version_no: 1 });
        await writeKMMain(state, { title: 'latest', version_no: 1 });
        assert.deepEqual(versions, [4, 5]);
    } finally { kmService.update = original; }
});
