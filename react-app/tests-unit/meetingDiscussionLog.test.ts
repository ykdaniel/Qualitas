import test from 'node:test';
import assert from 'node:assert/strict';
import {
    compareNo, normalizeDiscussionLog, nextNo, addEntry, removeEntry, removeEntryWithMap, renumber, displayNo, canRemove,
    addUpdate, removeUpdate, openItemCount, headingsOf,
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
