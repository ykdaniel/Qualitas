import test from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, lateClosureDays, ncrOverdueState } from '../src/utils/ncrOverdue';
import { describeSaveError } from '../src/utils/saveErrors';
import { issueMessageKey } from '../src/utils/dateIssues';

test('dayNumber: strict calendar days only — nothing rolls over and no time zone is involved', () => {
    assert.equal(dayNumber('1970-01-01'), 0);
    assert.equal(dayNumber('1970-01-02'), 1);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-9-5', ' 2026-09-05', '2026-09-05T00:00:00Z', '', null, undefined, 20260905]) assert.equal(dayNumber(bad), null, String(bad));
    assert.equal(dayNumber('2028-02-29'), dayNumber('2028-02-28')! + 1);
    for (const tz of ['Asia/Taipei', 'UTC', 'America/Los_Angeles']) {
        const before = process.env.TZ; process.env.TZ = tz;
        try { assert.equal(dayNumber('2026-09-21')! - dayNumber('2026-09-20')!, 1, tz); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
    }
});

test('lateClosureDays: positive only when the close-out date is after the due date', () => {
    assert.equal(lateClosureDays('2025-01-16', '2025-03-01'), 44);
    assert.equal(lateClosureDays('2025-01-16', '2025-01-17'), 1);
    assert.equal(lateClosureDays('2025-01-16', '2025-01-16'), null);     // on the due date: not late
    assert.equal(lateClosureDays('2025-01-16', '2025-01-10'), null);
    for (const [d, c] of [['', '2025-03-01'], ['2025-01-16', ''], [undefined, '2025-03-01'], ['2025-02-30', '2025-03-01'], ['2025-01-16', 'garbage']]) assert.equal(lateClosureDays(d, c), null);
});

test('ncrOverdueState keeps "open and overdue" apart from "closed late" — a late closure is Closed, not overdue', () => {
    const today = '2026-09-21';
    assert.equal(ncrOverdueState({ status: 'Open', dueDate: '2026-09-01' }, today), 'open-overdue');
    assert.equal(ncrOverdueState({ status: 'In Progress', dueDate: '2026-09-20' }, today), 'open-overdue');
    assert.equal(ncrOverdueState({ status: 'Open', dueDate: '2026-09-21' }, today), 'open');          // due today is not overdue yet
    assert.equal(ncrOverdueState({ status: 'Open', dueDate: '2026-12-01' }, today), 'open');
    assert.equal(ncrOverdueState({ status: 'Open' }, today), 'open');
    assert.equal(ncrOverdueState({ status: 'Closed', dueDate: '2026-09-01', closeoutDate: '2026-09-15' }, today), 'closed-late');
    assert.equal(ncrOverdueState({ status: 'closed', dueDate: '2026-09-01', closeoutDate: '2026-09-01' }, today), 'closed-on-time');
    assert.equal(ncrOverdueState({ status: 'Closed', dueDate: '2026-09-01', closeoutDate: '2026-08-20' }, today), 'closed-on-time');
    assert.equal(ncrOverdueState({ status: 'Closed', dueDate: '2026-09-01' }, today), 'closed-on-time');   // no close-out date: nothing to call late
    assert.equal(ncrOverdueState({ status: 'Void', dueDate: '2020-01-01' }, today), 'void');
});

test('the closed-late fact is never also "open-overdue" (the states are exclusive, so no count can double-count a closed NCR)', () => {
    for (const status of ['Closed', 'closed']) for (const closeout of ['2026-09-15', '2026-08-01', '']) {
        assert.notEqual(ncrOverdueState({ status, dueDate: '2026-09-01', closeoutDate: closeout }, '2026-09-21'), 'open-overdue');
    }
});

test('a refused change of the due date of a closed NCR reads as "<field>：<reason>", not as an unknown problem', () => {
    const t = (k: string) => ({ 'dateField.dueDate': '到期日', 'dateIssue.due_fixed_at_closure': '已結案（或正在結案）的 NCR 不能更改', 'dateIssue.unknown': '有問題', 'common.saveFailed': '儲存失敗' } as Record<string, string>)[k] ?? k;
    assert.equal(issueMessageKey('due_fixed_at_closure'), 'dateIssue.due_fixed_at_closure');
    const e = { isAxiosError: true, message: 'x', response: { status: 422, data: { detail: [{ loc: ['body', 'dueDate'], msg: 'm', code: 'due_fixed_at_closure' }] } } };
    assert.equal(describeSaveError(e, t), '到期日：已結案（或正在結案）的 NCR 不能更改');
});
