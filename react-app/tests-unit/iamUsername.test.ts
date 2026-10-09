import test from 'node:test';
import assert from 'node:assert/strict';

(globalThis as any).document = { cookie: '' };
(globalThis as any).window = { location: { pathname: '/iam', origin: 'http://localhost', href: '' } };
const { default: api } = await import('../src/services/api');
const { useIAMStore } = await import('../src/store/iamStore');

test('IAM preserves distinct login names when users share the same display name', async () => {
    api.defaults.adapter = async config => ({
        data: [
            { id: 1, username: 'inspector_a', full_name: 'Inspector', email: 'a@example.test', is_active: true },
            { id: 2, username: 'inspector_b', full_name: 'Inspector', email: 'b@example.test', is_active: false },
            { id: 3, username: 'no_display_name', full_name: null, email: 'c@example.test', is_active: true },
        ],
        status: 200, statusText: 'OK', headers: {}, config,
    });
    await useIAMStore.getState().fetchUsers();
    const users = useIAMStore.getState().users;
    assert.deepEqual(users.map(u => (u as any).username), ['inspector_a', 'inspector_b', 'no_display_name']);
    assert.deepEqual(users.map(u => u.name), ['Inspector', 'Inspector', 'no_display_name']);
    assert.equal(users[1].status, 'inactive');
});

test('combined IAM reload and create/update responses retain login names', async () => {
    const user = { id: 4, username: 'actual_login', full_name: 'Display Name', email: 'd@example.test', is_active: true };
    api.defaults.adapter = async config => ({
        data: config.url === '/iam/roles/' ? [] : config.method === 'get' ? [user] : user,
        status: 200, statusText: 'OK', headers: {}, config,
    });
    await useIAMStore.getState().fetchData();
    assert.equal(useIAMStore.getState().users[0].username, 'actual_login');
    useIAMStore.setState({ users: [] });
    await useIAMStore.getState().createUser({ name: 'actual_login', status: 'active' });
    assert.equal(useIAMStore.getState().users[0].username, 'actual_login');
    await useIAMStore.getState().updateUser(4, { email: 'changed@example.test' });
    assert.equal(useIAMStore.getState().users[0].username, 'actual_login');
    assert.equal(useIAMStore.getState().users[0].name, 'Display Name');
});
