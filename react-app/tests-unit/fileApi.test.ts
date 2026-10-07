import test from 'node:test';
import assert from 'node:assert/strict';

// api.ts reads the csrf cookie and window.location inside its interceptors; give it just enough of a browser.
(globalThis as any).document = { cookie: '' };
(globalThis as any).window = { location: { pathname: '/ncr', origin: 'http://localhost', href: '' } };
const { default: api, getEntityFiles } = await import('../src/services/api');

// A recording adapter: no network, no server — only what the client asks for.
const requests: { method?: string; url?: string; params?: unknown }[] = [];
api.defaults.adapter = async (config) => {
    requests.push({ method: config.method, url: config.url, params: config.params });
    return { data: [], status: 200, statusText: 'OK', headers: {}, config };
};

test('getEntityFiles asks for the exact backend route — no trailing slash, so no 307 redirect is needed', async () => {
    requests.length = 0;
    await getEntityFiles('ncr', 'abc', 'improvementPhoto');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'get');
    assert.equal(requests[0].url, '/files/by-entity');
    assert.deepEqual(requests[0].params, { entity_type: 'ncr', entity_id: 'abc', category: 'improvementPhoto' });
});

test('getEntityFiles without a category sends no category parameter', async () => {
    requests.length = 0;
    await getEntityFiles('obs', 'x');
    assert.equal(requests[0].url, '/files/by-entity');
    assert.deepEqual(requests[0].params, { entity_type: 'obs', entity_id: 'x' });
});
