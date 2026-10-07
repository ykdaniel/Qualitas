import test from 'node:test';
import assert from 'node:assert/strict';
import { dateCell, fieldIssues, formatStrictDate, hasFieldIssue, issueMessageKey, issuesOf, isValueIssue, preserveHistoricalDates } from '../src/utils/dateIssues';
import { getErrorMessage } from '../src/utils/errorUtils';

const item = (extra: any = {}) => ({ raiseDate: '2026-02-30', dueDate: '2026-09-19', date_issues: [{ field: 'raiseDate', value: '2026-02-30', code: 'invalid_calendar' }], ...extra });

test('issuesOf / fieldIssues tolerate rows without the field (older API, normal rows)', () => {
    assert.deepEqual(issuesOf(undefined), []);
    assert.deepEqual(issuesOf({}), []);
    assert.deepEqual(issuesOf({ date_issues: 'x' }), []);
    assert.equal(hasFieldIssue({ date_issues: [] }, 'raiseDate'), false);
    assert.equal(fieldIssues(item(), 'raiseDate').length, 1);
    assert.equal(hasFieldIssue(item(), 'dueDate'), false);
});

test('formatStrictDate never rolls a non-existent day over and never shifts by the time zone', () => {
    assert.equal(formatStrictDate('2026-09-05'), '2026/9/5');
    assert.equal(formatStrictDate('2026-02-30'), null);           // new Date('2026-02-30') would be 2 March
    assert.equal(formatStrictDate('2026-13-01'), null);
    assert.equal(formatStrictDate('2026-02-29'), null);
    assert.equal(formatStrictDate('2028-02-29'), '2028/2/29');
    for (const bad of ['garbage', '2026-9-5', ' 2026-09-05', '2026-09-05T10:00:00Z', '2026-09-05abc', '', null, undefined, 20260905]) assert.equal(formatStrictDate(bad), null, String(bad));
    for (const tz of ['Asia/Taipei', 'UTC', 'America/Los_Angeles']) {
        const before = process.env.TZ; process.env.TZ = tz;
        try { assert.equal(formatStrictDate('2026-09-01'), '2026/9/1', tz); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
    }
});

test('dateCell shows the stored value as-is when it has an issue, formats only clean values, dash only for blanks', () => {
    const fmt = (r: string) => formatStrictDate(r) ?? r;
    assert.deepEqual(dateCell(item(), 'raiseDate', fmt), { text: '2026-02-30', warn: true });                 // NOT 2026/3/2
    assert.deepEqual(dateCell({ raiseDate: 'garbage', date_issues: [{ field: 'raiseDate', value: 'garbage', code: 'invalid_format' }] }, 'raiseDate', fmt), { text: 'garbage', warn: true });   // NOT '-'
    assert.deepEqual(dateCell(item(), 'dueDate', fmt), { text: '2026/9/19', warn: false });
    assert.deepEqual(dateCell({ raiseDate: null, date_issues: [] }, 'raiseDate', fmt), { text: '-', warn: false });
    assert.deepEqual(dateCell({ raiseDate: '', date_issues: [] }, 'raiseDate', fmt), { text: '-', warn: false });
    assert.deepEqual(dateCell({ issueDate: null, date_issues: [{ field: 'issueDate', value: null, code: 'missing_required' }] }, 'issueDate', fmt), { text: '-', warn: true });
});

test('preserveHistoricalDates: a blank form value cannot silently erase an invalid stored date; real edits are kept', () => {
    const original = item();
    assert.equal(preserveHistoricalDates({ raiseDate: '', remark: 'x' }, original, ['raiseDate', 'dueDate']).raiseDate, '2026-02-30');
    assert.equal(preserveHistoricalDates({ raiseDate: undefined }, original, ['raiseDate']).raiseDate, '2026-02-30');
    assert.equal(preserveHistoricalDates({ raiseDate: null }, original, ['raiseDate']).raiseDate, '2026-02-30');
    assert.equal(preserveHistoricalDates({ raiseDate: '2026-03-01' }, original, ['raiseDate']).raiseDate, '2026-03-01');       // the user typed a real date
    assert.equal(preserveHistoricalDates({ raiseDate: '2026-02-30' }, original, ['raiseDate']).raiseDate, '2026-02-30');       // unchanged resend
    assert.equal(preserveHistoricalDates({ dueDate: '' }, original, ['dueDate']).dueDate, '');                                     // no issue on that field: the user's blank stays
    const ordered = { closeoutDate: '2026-01-01', date_issues: [{ field: 'closeoutDate', value: '2026-01-01', code: 'raise_after_closeout', related_field: 'raiseDate' }] };
    assert.equal(preserveHistoricalDates({ closeoutDate: '' }, ordered, ['closeoutDate']).closeoutDate, '');                       // an order problem is not an invalid VALUE
    assert.equal(isValueIssue(ordered.date_issues[0]), false);
    const input = { raiseDate: '' }; preserveHistoricalDates(input, original, ['raiseDate']); assert.equal(input.raiseDate, '');    // input not mutated
});

test('issueMessageKey maps every stable code and falls back for unknown ones', () => {
    for (const c of ['invalid_format', 'invalid_calendar', 'timestamp', 'trailing_characters', 'whitespace', 'whitespace_only', 'missing_required', 'raise_after_closeout', 'raise_after_due', 'closeout_after_due']) assert.equal(issueMessageKey(c), `dateIssue.${c}`);
    assert.equal(issueMessageKey('something_new'), 'dateIssue.unknown');
});

const axiosErr = (status: number, data: any) => ({ isAxiosError: true, message: `Request failed with status code ${status}`, response: { status, data } });

test('getErrorMessage: a 500 never shows the server stack; a date 422 names the field; other messages are unchanged', () => {
    const m500 = getErrorMessage(axiosErr(500, { detail: "Internal Server Error: 1 validation errors:\n  {'type': 'value_error', 'loc': ('response', 2, 'raiseDate')}" }), 'fallback');
    assert.ok(!/validation errors|pydantic|loc/.test(m500) && /500|伺服器|server/i.test(m500), m500);
    assert.equal(getErrorMessage(axiosErr(500, { detail: 'Internal Server Error' })).includes('Internal Server Error:'), false);
    const m422 = getErrorMessage(axiosErr(422, { detail: [{ type: 'value_error.date', loc: ['body', 'raiseDate'], msg: 'date is not a real calendar date', input: '2026-02-30', code: 'invalid_calendar' }] }));
    assert.equal(m422, 'raiseDate: date is not a real calendar date');
    assert.equal(getErrorMessage(axiosErr(422, { detail: [{ msg: 'plain pydantic message' }] })), 'plain pydantic message');          // older shape untouched
    assert.equal(getErrorMessage(axiosErr(400, { detail: 'Cannot close NCR: missing fields' })), 'Cannot close NCR: missing fields');
    assert.equal(getErrorMessage(new Error('boom')), 'boom');
});
