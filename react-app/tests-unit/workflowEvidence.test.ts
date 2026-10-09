import test from 'node:test';
import assert from 'node:assert/strict';
import { hasUnverified, improvementNotes, summaryNote, summaryTitle } from '../src/utils/workflowEvidence';
import type { Checkpoint, WorkflowSummary } from '../src/types/workflow';

// a dictionary that echoes the key and its params: proves WHICH text is chosen and with what numbers
const t = (key: string, params?: Record<string, string | number>) => key + (params ? JSON.stringify(params) : '');
const cp = (over: Partial<Checkpoint>): Checkpoint => ({ key: 'improvement', state: 'done', done: true, blocking_ncr_id: null, ...over });
const flow = (over: Partial<WorkflowSummary>): WorkflowSummary => ({ qworkflow_id: 'q', reference_no: null, noi_id: null, noi_reference_no: null, noi_package: null, issue_date: null, vendor_name: null,
    checkpoints: [], done_count: 9, completion_percent: 100, ncr_ids: [], itr_ids: [], reinsp_itr_ids: [], ...over });

test('a blocked improvement cell says why (one message per reason), an old server answer without the new fields says nothing', () => {
    for (const r of ['missing', 'invalid', 'legacy_unverified'] as const) {
        assert.deepEqual(improvementNotes(cp({ state: 'current', done: false, blocking_ncr_id: 'n', blocking_reason: r }), t), [`workflow.evidence.blocking.${r}`]);
    }
    assert.deepEqual(improvementNotes(cp({}), t), []);
});

test('verified and unverified counts are reported separately, with the underlying reasons for the unverified ones', () => {
    const lines = improvementNotes(cp({ verified_count: 2, unverified_count: 3, unverified_ncr_ids: ['a', 'b', 'c'], unverified_reasons: { missing: 1, legacy_unverified: 2 } }), t);
    assert.deepEqual(lines, [
        'workflow.evidence.verified{"count":2}',
        'workflow.evidence.closedUnverified{"count":3}',
        'workflow.evidence.reason.missing{"count":1}；workflow.evidence.reason.legacy_unverified{"count":2}',
    ]);
});

test('the percentage note appears only when something passed without verification, and never claims verification', () => {
    assert.equal(summaryNote(flow({}), t), '');
    assert.equal(summaryTitle(flow({ unverified_photo_count: 0 }), t), '');
    assert.equal(hasUnverified(flow({ unverified_photo_count: 1 })), true);
    const w = flow({ unverified_photo_count: 2, unverified_photo_reasons: { invalid: 1, missing: 1 } });
    assert.equal(summaryNote(w, t), 'workflow.evidence.summary{"count":2}');
    assert.equal(summaryTitle(w, t), 'workflow.evidence.summaryTitle{"count":2}\nworkflow.evidence.reason.missing{"count":1}；workflow.evidence.reason.invalid{"count":1}');
});

test('the wording itself: zh and en both keep "not verified" and never say "verified" for the Closed-status pass', async () => {
    const src = (await import('node:fs')).readFileSync('src/context/LanguageContext.tsx', 'utf8');                 // `npm test` runs from react-app/
    const line = (key: string) => src.split('\n').filter(l => l.includes(`'${key}'`));
    assert.equal(line('workflow.evidence.closedUnverified').length, 2);
    assert.ok(line('workflow.evidence.closedUnverified').some(l => l.includes('依已結案狀態通過，照片未核對')));
    assert.ok(line('workflow.evidence.closedUnverified').some(l => l.includes('Passed on Closed status, photos not verified')));
    assert.ok(line('workflow.evidence.verified').some(l => l.includes('目前照片已核對')));
});
