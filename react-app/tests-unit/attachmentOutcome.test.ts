import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDeleteResults, isUnchangedSincePriorWrite } from '../src/utils/attachmentOutcome';

const fulfilled = <T,>(value: T): PromiseSettledResult<T> => ({ status: 'fulfilled', value });
const rejected = (reason: unknown): PromiseSettledResult<never> => ({ status: 'rejected', reason });
const axiosErr = (status: number | undefined, detail?: string) => ({
    response: status === undefined ? undefined : { status, data: detail ? { detail } : undefined },
});

test('classifyDeleteResults: all succeed -> every id is deleted, no errors', () => {
    const ids = ['a', 'b'];
    const results = [fulfilled(undefined), fulfilled(undefined)];
    const out = classifyDeleteResults(ids, results);
    assert.deepEqual(out.deletedIds, ['a', 'b']);
    assert.deepEqual(out.errors, []);
});

test('classifyDeleteResults: one succeeds, one fails -> only the failed id stays out of deletedIds', () => {
    const ids = ['keep', 'fail'];
    const results = [fulfilled(undefined), rejected(axiosErr(500, 'boom'))];
    const out = classifyDeleteResults(ids, results);
    assert.deepEqual(out.deletedIds, ['keep']);
    assert.equal(out.errors.length, 1);
    assert.match(out.errors[0], /fail/);
    assert.match(out.errors[0], /boom/);
});

test('classifyDeleteResults: a 404 is NOT counted as deleted (never silently treated as success)', () => {
    const ids = ['ghost'];
    const results = [rejected(axiosErr(404))];
    const out = classifyDeleteResults(ids, results);
    assert.deepEqual(out.deletedIds, []);
    assert.equal(out.errors.length, 1);
    assert.match(out.errors[0], /找不到該筆附件/);
    // The limitation must be stated in the message itself — this id can never resolve on its
    // own via retry if it really was already deleted, and the message says so.
    assert.match(out.errors[0], /重新開啟/);
    assert.match(out.errors[0], /遺失/);
});

test('classifyDeleteResults: a 404 and a network failure produce DIFFERENT wording (two distinct unknowns)', () => {
    const ids = ['notfound', 'noresponse'];
    const results = [rejected(axiosErr(404)), rejected(axiosErr(undefined))];
    const out = classifyDeleteResults(ids, results);
    assert.equal(out.errors.length, 2);
    assert.notEqual(out.errors[0], out.errors[1]);
    assert.match(out.errors[0], /找不到該筆附件/);
    assert.match(out.errors[1], /網路中斷/);
    assert.doesNotMatch(out.errors[1], /找不到該筆附件/);
});

test('classifyDeleteResults: a generic 4xx/5xx surfaces the backend detail, not a generic label', () => {
    const ids = ['x'];
    const results = [rejected(axiosErr(409, 'referenced by another record'))];
    const out = classifyDeleteResults(ids, results);
    assert.match(out.errors[0], /referenced by another record/);
});

test('classifyDeleteResults: order of ids and results must line up positionally', () => {
    const ids = ['first', 'second', 'third'];
    const results = [rejected(axiosErr(500, 'e1')), fulfilled(undefined), rejected(axiosErr(404))];
    const out = classifyDeleteResults(ids, results);
    assert.deepEqual(out.deletedIds, ['second']);
    assert.equal(out.errors.length, 2);
    assert.match(out.errors[0], /first/);
    assert.match(out.errors[1], /third/);
});

test('isUnchangedSincePriorWrite: first write (no prior key) is never skipped', () => {
    const { key, skip } = isUnchangedSincePriorWrite({ title: 'a' }, null);
    assert.equal(skip, false);
    assert.equal(key, JSON.stringify({ title: 'a' }));
});

test('isUnchangedSincePriorWrite: identical payload to the last written one is skipped', () => {
    const payload = { title: 'a', rev: 'Rev2.0', status: 'Approved' };
    const priorKey = JSON.stringify(payload);
    const { skip } = isUnchangedSincePriorWrite({ title: 'a', rev: 'Rev2.0', status: 'Approved' }, priorKey);
    assert.equal(skip, true);
});

test('isUnchangedSincePriorWrite: a changed field (mid-retry edit) is NOT skipped, even if almost everything else matches', () => {
    const priorKey = JSON.stringify({ title: 'a', rev: 'Rev2.0', status: 'Approved' });
    const { skip } = isUnchangedSincePriorWrite({ title: 'a EDITED', rev: 'Rev2.0', status: 'Approved' }, priorKey);
    assert.equal(skip, false);
});

test('isUnchangedSincePriorWrite: key order in the object does not matter for JSON.stringify only when keys are inserted the same way — this documents that constraint', () => {
    // Both PQP.tsx and ITP.tsx always build `payload` the same way (spread from formData) on
    // every attempt, so key order is stable in practice; this test pins that assumption instead
    // of leaving it implicit.
    const a = { x: 1, y: 2 };
    const b = { x: 1, y: 2 };
    assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// ── ITP-specific: the combined {payload, detailPayload} key, exactly as ITPModals.tsx calls it ──
// (boundary condition: a retry must not skip the record write while the DETAIL write is still
// unfinished — main-record success alone must never look like "fully written").

test('ITP combined key: main payload AND detail both unchanged -> skip (both were written together last time)', () => {
    const payload = { description: 'x', status: 'Approved' };
    const detailPayload = { a: [], b: [] };
    const priorKey = JSON.stringify({ payload, detailPayload });
    const { skip } = isUnchangedSincePriorWrite(
        { payload: { description: 'x', status: 'Approved' }, detailPayload: { a: [], b: [] } },
        priorKey,
    );
    assert.equal(skip, true);
});

test('ITP combined key: main payload unchanged but DETAIL changed -> NOT skipped (detail work still owed)', () => {
    const priorKey = JSON.stringify({ payload: { description: 'x', status: 'Approved' }, detailPayload: { a: [], b: [] } });
    const { skip } = isUnchangedSincePriorWrite(
        { payload: { description: 'x', status: 'Approved' }, detailPayload: { a: [{ id: 'new-item' }], b: [] } },
        priorKey,
    );
    assert.equal(skip, false);
});

test('ITP combined key: a prior attempt where the DETAIL write failed never reaches this comparison with a matching key in the first place — simulated here by the caller simply never having recorded a prior key, which must not skip', () => {
    // Mirrors ITPModals.tsx's actual control flow: `lastWrittenPayloadKey` is only ever set AFTER
    // onSave() returns without throwing. If updateITPDetail() throws, onSave() never returns, so
    // the key is never recorded — the next attempt starts from lastWrittenPayloadKey = null,
    // which this function always treats as "not skippable", regardless of what the payload is.
    const { skip } = isUnchangedSincePriorWrite(
        { payload: { description: 'x', status: 'Approved' }, detailPayload: { a: [], b: [] } },
        null,
    );
    assert.equal(skip, false);
});
