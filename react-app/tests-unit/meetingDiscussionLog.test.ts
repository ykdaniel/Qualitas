import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compareNo, normalizeDiscussionLog, nextNo, addEntry, removeEntry, removeEntryWithMap, renumber, displayNo, canRemove,
    addUpdate, removeUpdate, openItemCount, headingsOf, formatMinutesDate, updatesByDate, patchUpdate, progressProblem,
    firstProgressProblem, localToday,
    latestPerSeries, collectRegisterItems, registerSourcePerSeries,
} from '../src/components/MeetingMinutes/discussionLog.ts';

test('compareNo is tree order', () => {
    const nos = ['2', '1.2', '1.1.1', '1', '1.1', '1.10', '1.9'];
    assert.deepEqual([...nos].sort(compareNo), ['1', '1.1', '1.1.1', '1.2', '1.9', '1.10', '2']);
});

test('legacy two-level rows read as categories and items, legacy fields merged, order fixed', () => {
    const log = normalizeDiscussionLog([
        { no: '1.1', level: 1, content: 'rebar', owner: 'Mac', status: 'Closed' },
        { no: '1', level: 0, content: 'Technical' },
        { no: '2', topic: 'Old topic', discussion: 'talk', decision: 'agreed' },   // pre-merge flat row
        { no: '1.2', level: 1, content: 'formwork' },
    ]);
    assert.deepEqual(log.map(e => [e.no, e.kind, e.level]), [['1', 'category', 0], ['1.1', 'item', 1], ['1.2', 'item', 1], ['2', 'category', 0]]);
    assert.equal(log[3].content, 'Old topic / talk / agreed');
    assert.deepEqual([log[1].owner, log[1].status, log[1].targetDate, log[1].updates], ['Mac', 'Closed', '', []]);
    assert.equal(log[2].status, 'Open');                                          // missing status = Open
    assert.equal(log[0].owner, undefined);                                        // categories carry no item fields
    assert.deepEqual(normalizeDiscussionLog(null), []);
});

test('current three-level rows keep their kind; displayNo shows categories as n.0', () => {
    const log = normalizeDiscussionLog([
        { no: '1', kind: 'category', content: 'Technical Issues' },
        { no: '1.1', kind: 'subcategory', content: 'Civil OB' },
        { no: '1.1.1', kind: 'item', content: 'Safety lifeline', updates: [{ date: '2026-07-21', content: 'drawing added', carried: true }], carried: true },
    ]);
    assert.deepEqual(log.map(displayNo), ['1.0', '1.1', '1.1.1']);
    assert.equal(log[2].level, 2);
    assert.equal(log[2].carried, true);
    assert.deepEqual(headingsOf(log, '1.1.1'), ['Technical Issues', 'Civil OB']);
});

test('nextNo / addEntry number under the right parent and never reuse a present number', () => {
    let log = addEntry([], null, 'category', 'Technical');
    log = addEntry(log, '1', 'subcategory', 'Civil');
    log = addEntry(log, '1.1', 'item', 'lifeline', { owner: 'TECO' });
    log = addEntry(log, '1', 'item', 'direct item');
    log = addEntry(log, null, 'category', 'Safety');
    assert.deepEqual(log.map(e => e.no), ['1', '1.1', '1.1.1', '1.2', '2']);
    assert.equal(nextNo(log, '1.1'), '1.1.2');
    assert.deepEqual([log[2].owner, log[2].status], ['TECO', 'Open']);
});

test('removeEntry drops descendants and closes the numbering when nothing is carried', () => {
    let log = addEntry([], null, 'category', 'A');
    log = addEntry(log, '1', 'item', 'a1');
    log = addEntry(log, '1', 'item', 'a2');
    log = addEntry(log, null, 'category', 'B');
    log = addEntry(log, '2', 'item', 'b1');
    const out = removeEntry(log, '1');
    assert.deepEqual(out.map(e => [e.no, e.content]), [['1', 'B'], ['1.1', 'b1']]);
    assert.deepEqual(renumber(removeEntry(log, '1.1')).map(e => e.no), ['1', '1.1', '2', '2.1']);
});

test('carried rows keep their numbers and cannot be removed; new ones can', () => {
    const log = normalizeDiscussionLog([
        { no: '1', kind: 'category', content: 'A', carried: true },
        { no: '1.1', kind: 'item', content: 'old', carried: true },
        { no: '1.3', kind: 'item', content: 'new' },
        { no: '1.4', kind: 'item', content: 'newer' },
    ]);
    assert.equal(canRemove(log, '1'), false);
    assert.equal(canRemove(log, '1.1'), false);
    assert.equal(canRemove(log, '1.3'), true);
    assert.deepEqual(removeEntry(log, '1.3').map(e => e.no), ['1', '1.1', '1.4']);      // no renumbering around carried rows
});

test('progress updates: added at the end; carried ones cannot be removed', () => {
    let log = normalizeDiscussionLog([{ no: '1.1', kind: 'item', content: 'x', updates: [{ date: '2026-07-21', content: 'old', carried: true }] }]);
    log = addUpdate(log, '1.1', { date: '2026-08-04', content: 'new' });
    assert.deepEqual(log[0].updates?.map(u => u.content), ['old', 'new']);
    assert.deepEqual(removeUpdate(log, '1.1', 0)[0].updates?.length, 2);
    assert.deepEqual(removeUpdate(log, '1.1', 1)[0].updates?.map(u => u.content), ['old']);
    assert.equal(openItemCount(log), 1);
});

test('flat rows saved with an owner / status (2026-08-29 … 08-31) are items, so a save keeps their owner and status', () => {
    const log = normalizeDiscussionLog([
        { no: '1', content: 'flat action', owner: 'HL', status: 'Closed' },
        { no: '2', content: 'flat heading' },
        { no: '3', level: null as unknown as undefined, content: 'null level', status: 'Open' },
    ]);
    assert.deepEqual(log.map(e => [e.no, e.kind, e.owner, e.status]), [['1', 'item', 'HL', 'Closed'], ['2', 'category', undefined, undefined], ['3', 'item', '', 'Open']]);
});

test('removeEntryWithMap says where every row went, so drafts kept by number can follow', () => {
    let log = addEntry([], null, 'category', 'A');
    log = addEntry(log, '1', 'item', 'a1');
    log = addEntry(log, '1', 'item', 'a2');
    log = addEntry(log, '1', 'item', 'a3');
    log = addEntry(log, null, 'category', 'B');
    const { log: out, map } = removeEntryWithMap(log, '1.2');
    assert.deepEqual(out.map(e => [e.no, e.content]), [['1', 'A'], ['1.1', 'a1'], ['1.2', 'a3'], ['2', 'B']]);
    assert.deepEqual(map, { '1': '1', '1.1': '1.1', '1.2': null, '1.3': '1.2', '2': '2' });
    assert.deepEqual(removeEntryWithMap(log, '1').map, { '1': null, '1.1': null, '1.2': null, '1.3': null, '2': '1' });
});

test('a register with an orphan row or a duplicate number is not renumbered (nothing dropped or doubled)', () => {
    const orphan = normalizeDiscussionLog([
        { no: '1', kind: 'category', content: 'A' }, { no: '1.1', kind: 'item', content: 'a1' },
        { no: '3.1', kind: 'item', content: 'orphan' },
    ]);
    assert.deepEqual(renumber(orphan).map(e => e.no), ['1', '1.1', '3.1']);
    assert.deepEqual(removeEntry(orphan, '1.1').map(e => e.no), ['1', '3.1']);
    const dup = normalizeDiscussionLog([
        { no: '4', kind: 'category', content: 'x' }, { no: '4', kind: 'category', content: 'y' }, { no: '4.1', kind: 'item', content: 'z' },
    ]);
    assert.equal(renumber(dup).length, 3);
});

test('several progress notes per item, in date order (a missed day filled in later lands on its day); carried ones untouched', () => {
    let log = normalizeDiscussionLog([{ no: '1.1', kind: 'item', content: 'x', raisedDate: '2026-07-14',
        updates: [{ date: '2026-07-21', content: 'old', carried: true }] }]);
    log = addUpdate(log, '1.1', { date: '2026-07-28', content: 'this week' });
    log = addUpdate(log, '1.1', { date: '2026-07-24', content: 'missed day' });
    log = addUpdate(log, '1.1', { date: '2026-07-28', content: 'same day, later' });
    assert.deepEqual(updatesByDate(log[0]).map(x => `${x.u.date} ${x.u.content} #${x.i}`),
        ['2026-07-21 old #0', '2026-07-24 missed day #2', '2026-07-28 this week #1', '2026-07-28 same day, later #3']);
    assert.equal(log[0].updates?.length, 4);                                                    // stored as written
    assert.equal(patchUpdate(log, '1.1', 0, { content: 'changed' })[0].updates?.[0].content, 'old');   // carried: unchanged
    assert.deepEqual(patchUpdate(log, '1.1', 2, { date: '2026-07-25' })[0].updates?.[2], { date: '2026-07-25', content: 'missed day' });
    assert.equal(removeUpdate(log, '1.1', 0)[0].updates?.length, 4);                             // carried: not removable
});

test('progress note days: not before the item was raised, not after today (or the meeting date if later); text required', () => {
    const latest = '2026-07-28';
    assert.equal(progressProblem({ date: '2026-07-20', content: 'a' }, '2026-07-14', latest), null);
    assert.equal(progressProblem({ date: '2026-07-14', content: 'a' }, '2026-07-14', latest), null);   // the raised day itself is fine
    assert.equal(progressProblem({ date: '2026-07-13', content: 'a' }, '2026-07-14', latest), 'beforeRaised');
    assert.equal(progressProblem({ date: '2026-07-29', content: 'a' }, '2026-07-14', latest), 'afterLatest');
    assert.equal(progressProblem({ date: '', content: 'a' }, '2026-07-14', latest), 'noDate');
    assert.equal(progressProblem({ date: '2026-07-20', content: '  ' }, '2026-07-14', latest), 'noText');
    assert.equal(progressProblem({ date: '2026-07-01', content: 'a' }, undefined, latest), null);      // no raised day: no lower bound
    const log = normalizeDiscussionLog([
        { no: '1', kind: 'category', content: 'C' },
        { no: '1.1', kind: 'item', content: 'x', raisedDate: '2026-07-14', updates: [{ date: '2026-07-01', content: 'old', carried: true }] },
        { no: '1.2', kind: 'item', content: 'y', raisedDate: '2026-07-20', updates: [{ date: '2026-07-19', content: 'too early' }] },
    ]);
    assert.deepEqual(firstProgressProblem(log, latest), { no: '1.2', problem: 'beforeRaised', raisedDate: '2026-07-20' });   // carried 1.1 not checked
    assert.equal(firstProgressProblem(log.slice(0, 2), latest), null);
    assert.equal(localToday(new Date(2026, 0, 5, 23, 30)), '2026-01-05');
});

test('formatMinutesDate gives the company format; anything else is returned as-is', () => {
    assert.equal(formatMinutesDate('2026-07-21'), '21 Jul 2026');
    assert.equal(formatMinutesDate('2026-12-01'), '1 Dec 2026');
    assert.equal(formatMinutesDate(''), '');
    assert.equal(formatMinutesDate(undefined), '');
    assert.equal(formatMinutesDate('2026-13-01'), '2026-13-01');
    assert.equal(formatMinutesDate('next week'), 'next week');
});

test('latestPerSeries: the newest occurrence of each series (highest rev, later update on a tie), Void left out', () => {
    const m = (id: string, doc: string, rev: string, status = 'Published', updatedAt = '') => ({ id, documentNumber: doc, rev, status, updatedAt });
    const out = latestPerSeries([m('a1', 'A', '1.0'), m('a2', 'A', '2.0'), m('a10', 'A', '10.0'), m('b1', 'B', '1.0'),
        m('b2', 'B', '2.0', 'Void'), m('c1', 'C', '1.0', 'Draft', '2026-10-01'), m('c1b', 'C', '1.0', 'Draft', '2026-10-02')]);
    assert.deepEqual(out.map(x => x.id).sort(), ['a10', 'b1', 'c1b']);
});

test('collectRegisterItems: open items from the newest occurrence only, overdue first; closed items from every non-Void meeting', () => {
    const item = (no: string, status: string, targetDate = '', owner = '') => ({ no, kind: 'item' as const, content: `item ${no}`, status, targetDate, owner });
    const meetings = [
        { id: 'a1', documentNumber: 'A', rev: '1.0', title: 'Weekly', status: 'Published', meetingDate: '2026-07-21',
          discussionLog: [{ no: '1', kind: 'category' as const, content: 'Tech' }, item('1.1', 'Open', '2026-08-01'), item('1.2', 'Closed')] },
        { id: 'a2', documentNumber: 'A', rev: '2.0', title: 'Weekly', status: 'Draft', meetingDate: '2026-07-28',
          discussionLog: [{ no: '1', kind: 'category' as const, content: 'Tech', carried: true }, item('1.1', 'Closed'), item('1.3', 'Open', '2026-07-01', 'TECO'), item('1.4', 'Open', '2026-12-01')] },
        { id: 'v', documentNumber: 'V', rev: '1.0', status: 'Void', discussionLog: [item('1', 'Open'), item('2', 'Closed')] },
    ];
    const open = collectRegisterItems(meetings, 'open', '2026-10-11');
    assert.deepEqual(open.map(r => [r.meetingId, r.itemNo, r.overdue]), [['a2', '1.3', true], ['a2', '1.4', false]]);
    assert.equal(open[0].topicTitle, 'Tech');
    assert.equal(open[0].owner, 'TECO');
    const closed = collectRegisterItems(meetings, 'closed', '2026-10-11');
    assert.deepEqual(closed.map(r => [r.meetingId, r.itemNo]), [['a2', '1.1'], ['a1', '1.2']]);   // newest meeting first, Void ignored
    assert.ok(closed.every(r => !r.overdue));
});

test('an occurrence created before open items were carried forward (empty register) does not hide the earlier open items', () => {
    const item = (no: string, status: string) => ({ no, kind: 'item' as const, content: `item ${no}`, status });
    const meetings = [
        { id: 'r1', documentNumber: 'S', rev: '1.0', status: 'Published', discussionLog: [item('1', 'Open'), item('2', 'Closed')] },
        { id: 'r2', documentNumber: 'S', rev: '2.0', status: 'Draft', discussionLog: null },
        { id: 't1', documentNumber: 'T', rev: '1.0', status: 'Published', discussionLog: [item('1', 'Closed')] },
        { id: 't2', documentNumber: 'T', rev: '2.0', status: 'Draft', discussionLog: [item('1', 'Open')] },
    ];
    assert.deepEqual(registerSourcePerSeries(meetings).map(m => m.id).sort(), ['r1', 't2']);
    assert.deepEqual(collectRegisterItems(meetings, 'open', '2026-10-11').map(r => `${r.meetingId}#${r.itemNo}`).sort(), ['r1#1', 't2#1']);
});
