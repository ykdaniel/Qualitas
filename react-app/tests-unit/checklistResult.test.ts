import test from 'node:test';
import assert from 'node:assert/strict';
import {
    classifyResult, summarizeItems, deriveChecklistStatus, itemCounts, itemsMissingNaReason,
    isLegacyNaWithoutReason, withResult, itemsForSave, hasApprovalLimitingNa,
    isNaPending, failuresSoFar, ongoingProgress,
} from '../src/utils/checklistResult.ts';

const it = (result: any, extra: any = {}) => ({ item: 'i', criteria: 'c', situation: '', result, ...extra });

test('classify: four states + legacy/unknown', () => {
    assert.equal(classifyResult(''), 'unfilled');
    assert.equal(classifyResult(undefined), 'unfilled');
    assert.equal(classifyResult(null), 'unfilled');
    assert.equal(classifyResult('-'), 'unfilled');      // historical ITP seed
    assert.equal(classifyResult('  '), 'unfilled');
    assert.equal(classifyResult('O'), 'pass');
    assert.equal(classifyResult('X'), 'fail');
    assert.equal(classifyResult('/'), 'na');
    for (const bad of ['♦', 'o', 'x', 'P', 'OK', ' O', 0, 1, true, {}]) assert.equal(classifyResult(bad), 'unknown', String(bad));
});

test('summary: N/A is judged but not pass; unknown and unfilled are not judged', () => {
    const s = summarizeItems([it('O'), it('X'), it('/'), it(''), it('♦'), it(undefined), 'junk']);
    assert.deepEqual(s, { total: 7, pass: 1, fail: 1, na: 1, unfilled: 2, unknown: 2, judged: 3 });
    assert.deepEqual(summarizeItems(undefined), { total: 0, pass: 0, fail: 0, na: 0, unfilled: 0, unknown: 0, judged: 0 });
});

test('counts follow O / X only', () => {
    assert.deepEqual(itemCounts([it('O'), it('O'), it('X'), it('/'), it('')]), { passCount: 2, failCount: 1 });
});

// RULE CHANGE (2026-09-20): N/A alone no longer makes a Fail. Previously O+'/' and all-'/' derived 'Fail'
// (asserted here); now they are Ongoing ("contains N/A, pending, cannot be approved"). Fail needs every item
// judged AND at least one X. Mirrors backend derive_checklist_status.
test('status derivation: the unified rule', () => {
    assert.equal(deriveChecklistStatus([]), 'Ongoing');                              // empty list
    assert.equal(deriveChecklistStatus(undefined), 'Ongoing');
    assert.equal(deriveChecklistStatus([it('O'), it('O')]), 'Pass');                 // all O
    assert.equal(deriveChecklistStatus([it('O'), it('/')]), 'Ongoing');              // O + N/A
    assert.equal(deriveChecklistStatus([it('/'), it('/')]), 'Ongoing');              // all N/A
    assert.equal(deriveChecklistStatus([it('O'), it('X')]), 'Fail');
    assert.equal(deriveChecklistStatus([it('X'), it('/')]), 'Fail');                 // X + N/A, all judged
    assert.equal(deriveChecklistStatus([it('X'), it('/'), it('O')]), 'Fail');
    assert.equal(deriveChecklistStatus([it('X'), it('')]), 'Ongoing');               // X + unfilled
    assert.equal(deriveChecklistStatus([it('X'), it('-')]), 'Ongoing');
    assert.equal(deriveChecklistStatus([it('O'), it('')]), 'Ongoing');
    assert.equal(deriveChecklistStatus([it('O'), it('♦')]), 'Ongoing');              // unknown value
    assert.equal(deriveChecklistStatus([it('X'), it('♦')]), 'Ongoing');              // X + unknown: not all judged
    assert.equal(deriveChecklistStatus([it('/'), it('♦')]), 'Ongoing');
});

test('pass/fail counts stay O / X only; N/A is judged but never counted as a pass', () => {
    assert.deepEqual(itemCounts([it('O'), it('/')]), { passCount: 1, failCount: 0 });
    assert.deepEqual(itemCounts([it('/'), it('/')]), { passCount: 0, failCount: 0 });
    assert.deepEqual(itemCounts([it('X'), it('/'), it('O')]), { passCount: 1, failCount: 1 });
    assert.equal(summarizeItems([it('O'), it('/')]).judged, 2);
});

test('display helpers: one description of an Ongoing checklist', () => {
    const s = (...r: string[]) => summarizeItems(r.map(it));
    assert.equal(isNaPending(s('O', '/')), true);
    assert.equal(isNaPending(s('/', '/')), true);
    assert.equal(isNaPending(s('X', '/')), false);                                   // that is a Fail
    assert.equal(isNaPending(s('O', '/', '')), false);                               // not all judged
    assert.equal(isNaPending(s('O', '/', '♦')), false);
    assert.equal(isNaPending(summarizeItems([])), false);
    assert.equal(failuresSoFar(s('X', '')), 1);                                      // never hide the fail count
    assert.equal(failuresSoFar(s('X', 'X', '/', '')), 2);
    assert.equal(failuresSoFar(s('X', '♦')), 1);
    assert.equal(failuresSoFar(s('X', '/')), 0);                                     // a Fail, not Ongoing
    assert.equal(failuresSoFar(s('O', '')), 0);
    assert.equal(ongoingProgress(s('X', '')).key, 'checklist.progress.rowOngoingWithFail');
    assert.equal(ongoingProgress(s('O', '/')).key, 'checklist.progress.rowNaPending');
    assert.equal(ongoingProgress(s('O', '')).key, 'checklist.progress.rowOngoing');
    assert.deepEqual(ongoingProgress(s('X', 'X', '')).params, { judged: 2, total: 3, fail: 2 });
});

test('approval-limiting note applies to any N/A (mixed or all)', () => {
    assert.equal(hasApprovalLimitingNa(summarizeItems([it('O'), it('/')])), true);
    assert.equal(hasApprovalLimitingNa(summarizeItems([it('/'), it('/')])), true);
    assert.equal(hasApprovalLimitingNa(summarizeItems([it('O'), it('X')])), false);
});

test('N/A reason: required for a new N/A, exempt for an untouched historical one', () => {
    const originals = [it('/'), it('/', { naReason: 'no rebar in this bay' }), it('O'), it('')];
    // untouched legacy (idx0) exempt; idx1 has reason; idx2 newly N/A without reason; idx3 newly N/A blank
    const edited = [it('/'), it('/', { naReason: 'no rebar in this bay' }), it('/'), it('/', { naReason: '   ' })];
    assert.deepEqual(itemsMissingNaReason(edited, originals), [2, 3]);
    assert.equal(isLegacyNaWithoutReason(edited[0], originals[0]), true);
    assert.equal(isLegacyNaWithoutReason(edited[2], originals[2]), false);
    // clearing an existing reason is a change, not a legacy item
    assert.deepEqual(itemsMissingNaReason([it('/', { naReason: '' })], [it('/', { naReason: 'had one' })]), [0]);
    // O -> / -> O -> / again needs a reason again (original was O)
    assert.deepEqual(itemsMissingNaReason([it('/')], [it('O')]), [0]);
    assert.deepEqual(itemsMissingNaReason([it('/', { naReason: 'n/a here' })], [it('O')]), []);
});

test('withResult drops the reason when leaving N/A; other items untouched', () => {
    const na = it('/', { naReason: 'why' });
    assert.equal(withResult(na, 'O').naReason, undefined);
    assert.equal(withResult(na, '').result, '');
    assert.equal(withResult(it('O'), '/').naReason, undefined);   // reason is entered separately
    assert.equal('naReason' in withResult(na, '/'), true);
});

test('itemsForSave never normalises legacy values', () => {
    const legacy = [it('-'), it(undefined), it('♦'), { item: 'x' }, it('/', { naReason: 'r' }), it('O', { naReason: 'stale' })];
    const out = itemsForSave(legacy);
    // untouched items come back as the very same objects — nothing converted
    for (const i of [0, 1, 2, 3, 4]) assert.strictEqual(out[i], legacy[i]);
    assert.equal(out[0].result, '-');
    assert.equal(out[2].result, '♦');
    assert.equal('naReason' in out[5], false);       // stale reason on a non-N/A item is dropped
    assert.equal(out[5].result, 'O');
});
