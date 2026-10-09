import test from 'node:test';
import assert from 'node:assert/strict';
import { computeNCRStats } from '../src/hooks/useNCRStats';
import { computeOBSStats } from '../src/hooks/useOBSStats';

// BACKLOG #24.4 (2026-10-06): useNCRStats/useOBSStats used to compute closed/void/opening with
// their own ad-hoc, literal-match-only logic instead of the shared utils/statusBuckets.ts helpers
// the Dashboard already uses — any non-standard status value fell through every bucket (counted
// toward `total` but neither opening nor closed nor void), so a module's own summary card could
// disagree with the sum of its own tabs. These tests prove the fix: every status, standard or
// not, lands in exactly one of opening/closed/void, and opening+closed+void === total always.

test('NCR: standard 5-state data — opening folds Open+In Progress+Resolved, closed/void stay exact', () => {
    const stats = computeNCRStats([
        { status: 'Open' }, { status: 'Open' }, { status: 'Open' },
        { status: 'In Progress' },
        { status: 'Resolved' },
        { status: 'Closed' },
        { status: 'Void' },
    ]);
    assert.equal(stats.open, 3);
    assert.equal(stats.inProgress, 1);
    assert.equal(stats.resolved, 1);
    assert.equal(stats.closed, 1);
    assert.equal(stats.void, 1);
    assert.equal(stats.opening, 5); // 3 Open + 1 In Progress + 1 Resolved
    assert.equal(stats.total, 7);
    assert.equal(stats.opening + stats.closed + stats.void, stats.total);
});

test('NCR: a non-standard status value counts toward opening, not silently dropped', () => {
    const stats = computeNCRStats([
        { status: 'Open' },
        { status: 'Some Legacy Value' },
        { status: '' },
        { status: null as unknown as string },
    ]);
    assert.equal(stats.total, 4);
    // none of these are Closed or Void, so all 4 are outstanding
    assert.equal(stats.opening, 4);
    assert.equal(stats.closed, 0);
    assert.equal(stats.void, 0);
    assert.equal(stats.opening + stats.closed + stats.void, stats.total);
    // the literal-match tab counts only see the one real "Open" row
    assert.equal(stats.open, 1);
});

test('NCR: opening + closed + void always equals total, for any mix', () => {
    const mixes: { status: string }[][] = [
        [],
        [{ status: 'Closed' }],
        [{ status: 'Void' }],
        [{ status: 'Closed' }, { status: 'Void' }, { status: 'Open' }, { status: 'weird' }],
    ];
    for (const list of mixes) {
        const stats = computeNCRStats(list);
        assert.equal(stats.opening + stats.closed + stats.void, stats.total);
    }
});

test('OBS: standard 5-state data — opening folds Open+In Progress+Resolved', () => {
    const stats = computeOBSStats([
        { status: 'Open' },
        { status: 'In Progress' },
        { status: 'Resolved' },
        { status: 'Closed' }, { status: 'Closed' },
        { status: 'Void' },
    ]);
    assert.equal(stats.opening, 3);
    assert.equal(stats.closed, 2);
    assert.equal(stats.void, 1);
    assert.equal(stats.total, 6);
    assert.equal(stats.opening + stats.closed + stats.void, stats.total);
});

test('OBS: a blank status now counts toward opening (previous bug: fell through every bucket)', () => {
    const stats = computeOBSStats([
        { status: '' },
        { status: null as unknown as string },
        { status: 'Closed' },
    ]);
    assert.equal(stats.total, 3);
    assert.equal(stats.opening, 2); // the two blank/null rows
    assert.equal(stats.closed, 1);
    assert.equal(stats.void, 0);
    assert.equal(stats.opening + stats.closed + stats.void, stats.total);
});

test('OBS: opening + closed + void always equals total, for any mix', () => {
    const mixes: { status: string }[][] = [
        [],
        [{ status: 'Closed' }],
        [{ status: 'Void' }],
        [{ status: 'Closed' }, { status: 'Void' }, { status: 'Open' }, { status: 'weird' }],
    ];
    for (const list of mixes) {
        const stats = computeOBSStats(list);
        assert.equal(stats.opening + stats.closed + stats.void, stats.total);
    }
});
