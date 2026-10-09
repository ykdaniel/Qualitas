import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWriteFailure } from '../src/utils/materialSubmittal';

const err = (status?: number, detail?: string) => ({ response: status === undefined ? undefined : { status, data: detail ? { detail } : {} } });

// ── classifyWriteFailure: only a 4xx is a definite refusal ──────────────────────────────────────────────────
test('no response (network error / timeout) is UNKNOWN, never "not saved"', () => {
    assert.deepEqual(classifyWriteFailure(err(undefined)), { kind: 'unknown', status: null });
    assert.deepEqual(classifyWriteFailure(new Error('timeout of 30000ms exceeded')), { kind: 'unknown', status: null });
});

test('a 5xx is UNKNOWN: the server may have committed before failing', () => {
    for (const s of [500, 502, 503, 504]) assert.deepEqual(classifyWriteFailure(err(s, 'boom')), { kind: 'unknown', status: s });
});

test('a 4xx is a definite refusal and keeps the server detail', () => {
    assert.deepEqual(classifyWriteFailure(err(409, 'already recorded')), { kind: 'rejected', status: 409, detail: 'already recorded' });
    assert.deepEqual(classifyWriteFailure(err(422)), { kind: 'rejected', status: 422, detail: null });
});

// ── R2 (review R5): the export filters exactly like the table's column-header filters, over every fetched record ──────
import { appendUnique, createListGuard, filterRowsLikeTable, shelfLevels } from '../src/utils/materialSubmittal';
import { createApprovedColumns } from '../src/components/MaterialSubmittal/columns';
import type { ApprovedMaterial } from '../src/services/materialApi';

const mt = ((k: string) => k) as unknown as Parameters<typeof createApprovedColumns>[0];
const item = (i: number, over: Partial<ApprovedMaterial> = {}): ApprovedMaterial => ({
    submittalId: `s${i}`, revisionId: `r${i}`, projectId: 'P1', vendorId: 'V1', vendorName: i % 2 ? 'North Vendor' : 'South Vendor',
    documentNumber: `QTS-V1-MSA-${String(i).padStart(6, '0')}`, revNo: 0, result: i % 3 === 0 ? 'ApprovedWithComments' : 'Approved',
    name: i % 5 === 0 ? `Fire stop ${i}` : `Pipe ${i}`, brand: i % 4 === 0 ? 'Acme' : 'Other', model: `M${i}`, approvedDate: '2026-10-01', ...over,
});

test('column filters: result + text columns combine, case-insensitive, over records beyond the loaded page', () => {
    const all = Array.from({ length: 700 }, (_, i) => item(i + 1));                 // e.g. fetched in 500 + 200
    const cols = createApprovedColumns(mt);
    const got = filterRowsLikeTable(all, cols, [{ id: 'result', value: 'ApprovedWithComments' }, { id: 'name', value: 'FIRE' }, { id: 'vendor', value: 'north' }]);
    const expected = all.filter((r) => r.result === 'ApprovedWithComments' && r.name!.toLowerCase().includes('fire') && r.vendorName!.toLowerCase().includes('north'));
    assert.ok(expected.length > 0 && expected.some((r) => Number(r.submittalId.slice(1)) > 200), 'matches lie beyond the first page');
    assert.deepEqual(got.map((r) => r.submittalId), expected.map((r) => r.submittalId));
});

test('column filters: no filter keeps every row; an empty result filter ("ALL") keeps every row; unmatched gives none', () => {
    const all = Array.from({ length: 30 }, (_, i) => item(i + 1));
    const cols = createApprovedColumns(mt);
    assert.equal(filterRowsLikeTable(all, cols, []).length, 30);
    assert.equal(filterRowsLikeTable(all, cols, [{ id: 'result', value: '' }]).length, 30);
    assert.deepEqual(filterRowsLikeTable(all, cols, [{ id: 'brand', value: 'nobody' }]), []);
    assert.deepEqual(filterRowsLikeTable(all, cols, [{ id: 'documentNumber', value: '000012' }]).map((r) => r.submittalId), ['s12']);
});

// ── R2 (review R6): stale answers and double "load more" ─────────────────────────────────────────────────────────────
test('list guard: a restart makes older answers stale; only one load-more at a time; a stale finish cannot unlock the new list', () => {
    const g = createListGuard();
    const first = g.restart();
    const more = g.beginMore();
    assert.equal(more, first);
    assert.equal(g.beginMore(), null, 'second click while the first runs');
    const second = g.restart();                                   // filter changed while "load more" was running
    assert.equal(g.isCurrent(more!), false, 'the old page must be dropped');
    const newMore = g.beginMore();
    assert.equal(newMore, second);
    g.endMore(more!);                                             // the old request finishes late
    assert.equal(g.beginMore(), null, 'the late old finish must not unlock the running new one');
    g.endMore(newMore!);
    assert.equal(g.beginMore(), second);
});

test('appendUnique: a page that overlaps the loaded rows adds each record once', () => {
    const cur = [item(1), item(2)];
    const out = appendUnique(cur, [item(2), item(3)], (r) => r.submittalId);
    assert.deepEqual(out.map((r) => r.submittalId), ['s1', 's2', 's3']);
});

// ── shelf view (user's choice 2026-10-09): one level per category ───────────────────────────────────────────────────
test('shelf levels: categories in name order, uncategorised last, list order kept inside a level, blanks count as uncategorised', () => {
    const rows = [item(1, { category: 'Pipe' }), item(2, { category: null }), item(3, { category: 'Fire' }), item(4, { category: '  ' }),
                  item(5, { category: 'Pipe' }), item(6, { category: ' Fire ' })];
    const levels = shelfLevels(rows);
    assert.deepEqual(levels.map((l) => l.category), ['Fire', 'Pipe', null]);
    assert.deepEqual(levels.map((l) => l.items.map((r) => r.submittalId)), [['s3', 's6'], ['s1', 's5'], ['s2', 's4']]);
    assert.deepEqual(shelfLevels([]), []);
});
