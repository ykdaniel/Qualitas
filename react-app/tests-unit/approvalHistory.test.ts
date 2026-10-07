import test from 'node:test';
import assert from 'node:assert/strict';
import {
    formatUtc, formatLocalWithZone, actorOf, revokedTarget, isApproval, pageWindow, snapshotItems, ITR_SNAPSHOT_FIELDS,
} from '../src/utils/approvalHistory.ts';

test('formatUtc: stored server time, always labelled UTC; garbage is returned as-is, never replaced', () => {
    assert.equal(formatUtc('2026-09-20T03:22:09+00:00'), '2026-09-20 03:22:09 UTC');
    assert.equal(formatUtc('2026-09-20T11:22:09+08:00'), '2026-09-20 03:22:09 UTC');     // an offset is normalised, not dropped
    assert.equal(formatUtc('not a time'), 'not a time');
    assert.equal(formatUtc(''), '');
    assert.equal(formatUtc(null), '');
});

test('formatLocalWithZone includes the zone name; unparseable input gives null (nothing invented)', () => {
    const s = formatLocalWithZone('2026-09-20T03:22:09+00:00', 'en-US');
    assert.ok(s && /(UTC|GMT|[A-Z]{2,5})/.test(s), String(s));
    assert.equal(formatLocalWithZone('garbage'), null);
    assert.equal(formatLocalWithZone(undefined), null);
});

test('actorOf: as recorded; blank or missing parts stay missing', () => {
    assert.deepEqual(actorOf({ actor_full_name: 'Ada Approver', actor_username: 'acc_approver', actor_user_id: 3 }),
        { name: 'Ada Approver', username: 'acc_approver', userId: 3 });
    assert.deepEqual(actorOf({ actor_full_name: '  ', actor_username: 'x', actor_user_id: null }), { name: null, username: 'x', userId: null });
    assert.deepEqual(actorOf({ actor_full_name: null, actor_username: undefined, actor_user_id: undefined }), { name: null, username: null, userId: null });
});

test('revokedTarget: known, unknown (pre-event approval), or not applicable', () => {
    assert.deepEqual(revokedTarget({ event_type: 'REVOKED', approval_event_id: 5, approval_event_sequence: 1 }), { kind: 'known', sequence: 1, id: 5 });
    assert.deepEqual(revokedTarget({ event_type: 'REVOKED', approval_event_id: null, approval_event_sequence: null }), { kind: 'unknown' });
    assert.deepEqual(revokedTarget({ event_type: 'REVOKED', approval_event_id: undefined, approval_event_sequence: undefined }), { kind: 'unknown' });
    assert.deepEqual(revokedTarget({ event_type: 'APPROVED', approval_event_id: null, approval_event_sequence: null }), { kind: 'na' });
    assert.equal(isApproval({ event_type: 'APPROVED' }), true);
    assert.equal(isApproval({ event_type: 'REVOKED' }), false);
});

test('pageWindow arithmetic', () => {
    assert.deepEqual(pageWindow({ skip: 0, limit: 3, total: 7, count: 3 }), { from: 1, to: 3, total: 7, hasPrev: false, hasNext: true });
    assert.deepEqual(pageWindow({ skip: 6, limit: 3, total: 7, count: 1 }), { from: 7, to: 7, total: 7, hasPrev: true, hasNext: false });
    assert.deepEqual(pageWindow({ skip: 0, limit: 20, total: 0, count: 0 }), { from: 0, to: 0, total: 0, hasPrev: false, hasNext: false });
});

test('snapshotItems: only object items, verbatim; missing list is empty, not invented', () => {
    assert.deepEqual(snapshotItems({ items: [{ item: 'a', result: 'O' }, null, 'x', { item: 'b', result: '/', naReason: 'n/a here' }] }),
        [{ item: 'a', result: 'O' }, { item: 'b', result: '/', naReason: 'n/a here' }]);
    assert.deepEqual(snapshotItems({}), []);
    assert.deepEqual(snapshotItems(null), []);
    assert.equal(ITR_SNAPSHOT_FIELDS[0][0], 'documentNumber');
});
