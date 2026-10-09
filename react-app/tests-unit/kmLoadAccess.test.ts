import test from 'node:test';
import assert from 'node:assert/strict';
import { kmService } from '../src/services/kmService';
import { useKMStore } from '../src/store/kmStore';

test('KM denied load hides prior articles and recovery clears access denial', async () => {
    const original = kmService.getAll;
    try {
        useKMStore.setState({ kmList: [{ id: 'previous' }] as any });
        kmService.getAll = async () => { throw { response: { status: 403, data: { detail: 'Operation not permitted. Required: km:view:all' } } }; };
        await useKMStore.getState().fetchKMs();
        assert.equal(useKMStore.getState().accessDenied, true);
        assert.deepEqual(useKMStore.getState().kmList, []);
        assert.doesNotMatch(useKMStore.getState().error!, /km:view|Operation not permitted/);
        kmService.getAll = async () => [];
        await useKMStore.getState().fetchKMs();
        assert.equal(useKMStore.getState().accessDenied, false);
        assert.equal(useKMStore.getState().error, null);
    } finally { kmService.getAll = original; }
});

test('KM network failure is not classified as missing permission or empty success', async () => {
    const original = kmService.getAll;
    try {
        kmService.getAll = async () => { throw new Error('Network Error'); };
        await useKMStore.getState().fetchKMs();
        assert.equal(useKMStore.getState().accessDenied, false);
        assert.ok(useKMStore.getState().error);
        assert.equal(useKMStore.getState().loading, false);
    } finally { kmService.getAll = original; }
});
