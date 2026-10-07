import test from 'node:test';
import assert from 'node:assert/strict';
import { isClosedStatus, isVoidStatus, isOutstandingStatus, buildParetoCumulative } from '../src/utils/statusBuckets';

// BACKLOG #24.4/#37 Dashboard statistics-consistency batch (2026-09-29): NCR and OBS share the
// same real status shape (backend/core/utils.py::WorkflowEngine.TRANSITIONS["NCR"|"OBS"]) — Open /
// In Progress / Resolved / Closed / Void. These tests cover every one of those five real statuses
// explicitly, not just Open/Closed, since the bug this batch fixed was specifically about
// In Progress/Resolved being mis-bucketed.

test('isClosedStatus: only "Closed" (case/whitespace-insensitive) is closed', () => {
    assert.equal(isClosedStatus('Closed'), true);
    assert.equal(isClosedStatus('closed'), true);
    assert.equal(isClosedStatus('  CLOSED  '), true);
    assert.equal(isClosedStatus('Open'), false);
    assert.equal(isClosedStatus('In Progress'), false);
    assert.equal(isClosedStatus('Resolved'), false);
    assert.equal(isClosedStatus('Void'), false);
    assert.equal(isClosedStatus(undefined), false);
    assert.equal(isClosedStatus(null), false);
    assert.equal(isClosedStatus(''), false);
});

test('isVoidStatus: only "Void" (case/whitespace-insensitive) is void', () => {
    assert.equal(isVoidStatus('Void'), true);
    assert.equal(isVoidStatus('void'), true);
    assert.equal(isVoidStatus('  VOID  '), true);
    assert.equal(isVoidStatus('Open'), false);
    assert.equal(isVoidStatus('Closed'), false);
    assert.equal(isVoidStatus(undefined), false);
});

test('isOutstandingStatus: Open, In Progress, Resolved and any non-standard value are all outstanding — Closed and Void are not', () => {
    // The exact bug this batch fixed: the OLD useDashboardStats.ts ncrOpen only matched literal
    // "open"/"opening", which would have failed these two.
    assert.equal(isOutstandingStatus('In Progress'), true);
    assert.equal(isOutstandingStatus('Resolved'), true);
    assert.equal(isOutstandingStatus('Open'), true);
    // The exact other-direction bug: the OLD obsOpen matched "anything not Closed", which would
    // have wrongly counted Void as outstanding.
    assert.equal(isOutstandingStatus('Void'), false);
    assert.equal(isOutstandingStatus('Closed'), false);
    // A legacy/unrecognized status string is still outstanding (neither terminal state matched).
    assert.equal(isOutstandingStatus('Some Legacy Status'), true);
    assert.equal(isOutstandingStatus(undefined), true);
});

test('isOutstandingStatus is the exact complement of isClosedStatus||isVoidStatus for all five real statuses', () => {
    for (const status of ['Open', 'In Progress', 'Resolved', 'Closed', 'Void']) {
        const expected = !isClosedStatus(status) && !isVoidStatus(status);
        assert.equal(isOutstandingStatus(status), expected, status);
    }
});

test('buildParetoCumulative: denominator excludes Void — a contractor with a Void record still reaches 100% cumulative once open+closed rows are exhausted', () => {
    // 2 open, 1 closed, (1 void — represented simply by NOT being in open/closed; the void row
    // itself never reaches this function, matching how NCRParetoChart/OBSParetoChart build their
    // per-contractor { open, closed } counts before calling this).
    const rows = [{ contractor: 'A', open: 2, closed: 1 }];
    const result = buildParetoCumulative(rows);
    assert.equal(result[0].cumulativePercent, 100, 'the only row accounts for all of open+closed, so it is 100%, not scaled down by an excluded Void record elsewhere');
});

test('buildParetoCumulative: running total across multiple contractors, denominator is the grand total of open+closed only', () => {
    const rows = [
        { contractor: 'A', open: 3, closed: 1 }, // 4
        { contractor: 'B', open: 1, closed: 0 }, // 1
        { contractor: 'C', open: 0, closed: 1 }, // 1
    ];
    // grand total open+closed = 6
    const result = buildParetoCumulative(rows);
    assert.equal(result[0].cumulativePercent, Math.round((4 / 6) * 100)); // 67
    assert.equal(result[1].cumulativePercent, Math.round((5 / 6) * 100)); // 83
    assert.equal(result[2].cumulativePercent, 100);
});

test('buildParetoCumulative: no rows or all-zero open/closed -> 0%, not NaN or a divide-by-zero crash', () => {
    assert.deepEqual(buildParetoCumulative([]), []);
    const result = buildParetoCumulative([{ contractor: 'All Void', open: 0, closed: 0 }]);
    assert.equal(result[0].cumulativePercent, 0);
});

test('buildParetoCumulative: preserves every input field (does not drop open/closed/contractor) and only adds cumulativePercent', () => {
    const rows = [{ contractor: 'X', open: 2, closed: 3, extra: 'kept' as const }];
    const result = buildParetoCumulative(rows);
    assert.equal(result[0].contractor, 'X');
    assert.equal(result[0].open, 2);
    assert.equal(result[0].closed, 3);
    assert.equal(result[0].extra, 'kept');
    assert.equal(typeof result[0].cumulativePercent, 'number');
});
