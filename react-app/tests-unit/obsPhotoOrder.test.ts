import test from 'node:test';
import assert from 'node:assert/strict';
import { fnv1a, legacyKeys, moveKey, orderPhotos, storedKey } from '../src/utils/obsPhotoOrder';
import type { AttachmentInfo } from '../src/services/api';

const file = (id: string, uploaded_at: string): AttachmentInfo =>
    ({ id, entity_type: 'obs', entity_id: 'o', file_name: `${id}.jpg`, file_url: `/api/files/${id}`, category: 'defectPhoto', uploaded_at } as AttachmentInfo);

// the server answers newest first
const server = [file('c', '2026-10-12T03:00:00+00:00'), file('b', '2026-10-12T02:00:00+00:00'), file('a', '2026-10-12T01:00:00+00:00')];
const LEG1 = 'data:image/jpeg;base64,AAAA';
const LEG2 = 'data:image/jpeg;base64,BBBB';

test('fnv1a: known value and 8 hex digits', () => {
    assert.equal(fnv1a(''), '811c9dc5');
    assert.equal(fnv1a('a'), 'e40c292c');
    assert.match(fnv1a(LEG1), /^[0-9a-f]{8}$/);
});

test('legacyKeys: content hash plus occurrence, so duplicates stay distinct', () => {
    const keys = legacyKeys([LEG1, LEG2, LEG1]);
    assert.equal(keys[0], `legacy:${fnv1a(LEG1)}:0`);
    assert.equal(keys[2], `legacy:${fnv1a(LEG1)}:1`);
    assert.equal(new Set(keys).size, 3);
});

test('legacyKeys: removing one legacy photo does not change the keys of the others', () => {
    const before = legacyKeys([LEG1, LEG2]);
    const after = legacyKeys([LEG2]);
    assert.equal(after[0], before[1]);
});

test('orderPhotos: no saved order -> legacy first, then uploads first-upload-first', () => {
    const out = orderPhotos([LEG1], server, null);
    assert.deepEqual(out.map((p) => p.key), [legacyKeys([LEG1])[0], 'att:a', 'att:b', 'att:c']);
    assert.equal(out[0].legacyIndex, 0);
    assert.equal(out[1].stored?.id, 'a');
    assert.equal(out[1].src, '/api/files/a');
});

test('orderPhotos: the saved order comes first, unknown photos follow in the default order, missing keys are ignored', () => {
    const leg = legacyKeys([LEG1])[0];
    const out = orderPhotos([LEG1], server, ['att:c', 'att:gone', leg, 'att:c']);
    assert.deepEqual(out.map((p) => p.key), ['att:c', leg, 'att:a', 'att:b']);
});

test('orderPhotos: empty saved list is the default order', () => {
    assert.deepEqual(orderPhotos([], server, []).map((p) => p.key), ['att:a', 'att:b', 'att:c']);
});

test('moveKey: up, down, and the ends', () => {
    const keys = ['x', 'y', 'z'];
    assert.deepEqual(moveKey(keys, 'y', -1), ['y', 'x', 'z']);
    assert.deepEqual(moveKey(keys, 'y', 1), ['x', 'z', 'y']);
    assert.deepEqual(moveKey(keys, 'x', -1), keys);
    assert.deepEqual(moveKey(keys, 'z', 1), keys);
    assert.deepEqual(moveKey(keys, 'nope', 1), keys);
    assert.deepEqual(keys, ['x', 'y', 'z']);
});

test('storedKey', () => {
    assert.equal(storedKey({ id: '42' }), 'att:42');
});
