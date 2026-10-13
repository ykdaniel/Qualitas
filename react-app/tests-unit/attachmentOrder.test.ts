import test from 'node:test';
import assert from 'node:assert/strict';
import { oldestFirst } from '../src/utils/attachmentOrder';

const at = (id: string, uploaded_at: string) => ({ id, uploaded_at });

test('oldestFirst: the server order (newest first) comes back first-upload-first', () => {
    const server = [at('c', '2026-10-12T12:00:03+00:00'), at('b', '2026-10-12T12:00:02+00:00'), at('a', '2026-10-12T12:00:01+00:00')];
    assert.deepEqual(oldestFirst(server).map(f => f.id), ['a', 'b', 'c']);
});

test('oldestFirst: equal timestamps keep the order they arrived in', () => {
    const server = [at('x', '2026-10-12T12:00:00+00:00'), at('y', '2026-10-12T12:00:00+00:00'), at('w', '2026-10-11T08:00:00+00:00')];
    assert.deepEqual(oldestFirst(server).map(f => f.id), ['w', 'x', 'y']);
});

test('oldestFirst: does not change the list it was given', () => {
    const server = [at('b', '2026-10-12'), at('a', '2026-10-11')];
    oldestFirst(server);
    assert.deepEqual(server.map(f => f.id), ['b', 'a']);
});

test('oldestFirst: empty list', () => {
    assert.deepEqual(oldestFirst([]), []);
});
