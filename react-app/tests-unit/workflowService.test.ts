import test from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).document = { cookie: '' };
(globalThis as any).window = { location: { pathname: '/workflow', origin: 'http://localhost' } };
const { default: api } = await import('../src/services/api');
const { fetchAllWorkflows, fetchWorkflowStats, fetchNeedsAttention } = await import('../src/services/workflowService');

test('workflow list retrieves beyond 200 and keeps selected project on every page', async () => {
    const calls: any[] = [];
    api.defaults.adapter = async config => {
        calls.push(config.params);
        const skip = config.params.skip;
        return { data: Array.from({ length: skip === 0 ? 200 : 3 }, (_, i) => ({ qworkflow_id: `flow-${skip + i}` })),
            status: 200, statusText: 'OK', headers: {}, config };
    };
    const rows = await fetchAllWorkflows('P-A');
    assert.equal(rows.length, 203);
    assert.equal(new Set(rows.map(r => r.qworkflow_id)).size, 203);
    assert.deepEqual(calls, [{ project_id: 'P-A', skip: 0, limit: 200 }, { project_id: 'P-A', skip: 200, limit: 200 }]);
});

test('later workflow page failure rejects instead of reporting a partial list as complete', async () => {
    api.defaults.adapter = async config => {
        if (config.params.skip) throw new Error('second page unavailable');
        return { data: Array.from({ length: 200 }, () => ({})), status: 200, statusText: 'OK', headers: {}, config };
    };
    await assert.rejects(fetchAllWorkflows('P-B'), /second page unavailable/);
});

test('workflow stats and attention send the same explicit project filter', async () => {
    const calls: any[] = [];
    api.defaults.adapter = async config => {
        calls.push({ url: config.url, params: config.params });
        return { data: [], status: 200, statusText: 'OK', headers: {}, config };
    };
    await fetchWorkflowStats('P-B');
    await fetchNeedsAttention(3, 'P-B');
    assert.deepEqual(calls, [
        { url: '/workflow/stats', params: { project_id: 'P-B' } },
        { url: '/workflow/needs-attention', params: { limit: 3, project_id: 'P-B' } },
    ]);
});
