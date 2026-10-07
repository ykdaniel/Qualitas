import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyData, lastMonthKeys, monthKeyOf, TREND_MONTHS } from '../src/utils/trendMonths';

// Node re-reads process.env.TZ when it is assigned, so ONE test run can exercise several user time zones.
const ZONES = ['Asia/Taipei', 'UTC', 'America/Los_Angeles'] as const;
const inZone = (tz: string, fn: () => void) => {
    const before = process.env.TZ;
    process.env.TZ = tz;
    try { fn(); } finally { if (before === undefined) delete process.env.TZ; else process.env.TZ = before; }
};
const labels = (data: { month: string }[]) => data.map(d => d.month);
const counts = (data: { count: number }[]) => data.map(d => d.count);
const on = (...dates: string[]) => dates.map(d => ({ d, vendor: 'V1' }));
const build = (rows: any[], now: Date, vendor = 'all') => buildMonthlyData(rows, r => r.d, vendor, now);

// The algorithm this replaces (kept only to document the defect): a LOCAL first-of-month Date, then its UTC year-month.
const oldWindow = (now: Date) => {
    const out: string[] = [];
    for (let i = 5; i >= 0; i--) out.push(new Date(now.getFullYear(), now.getMonth() - i, 1).toISOString().slice(0, 7));
    return out;
};

// A fixed instant that is mid-September in every zone under test.
const MID_SEP = new Date('2026-09-20T12:00:00Z');

test('reproduction: the old window loses the current month in zones ahead of UTC', () => {
    inZone('Asia/Taipei', () => {
        assert.deepEqual(oldWindow(MID_SEP), ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']);   // no 2026-09
    });
    inZone('UTC', () => assert.equal(oldWindow(MID_SEP).at(-1), '2026-09'));
    inZone('America/Los_Angeles', () => assert.equal(oldWindow(MID_SEP).at(-1), '2026-09'));
});

for (const tz of ZONES) {
    test(`[${tz}] window = local current month + previous five, oldest first`, () => {
        inZone(tz, () => {
            assert.deepEqual(lastMonthKeys(MID_SEP), ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
            assert.deepEqual(labels(build([], MID_SEP)), ['2026/4', '2026/5', '2026/6', '2026/7', '2026/8', '2026/9']);
            assert.equal(TREND_MONTHS, 6);
        });
    });

    test(`[${tz}] known counts per month, current month included`, () => {
        inZone(tz, () => {
            const rows = on(
                '2026-04-01',                                   // 1 in April (window start)
                '2026-05-10', '2026-05-31',                     // 2 in May (month end)
                '2026-06-15', '2026-06-16', '2026-06-30',       // 3
                '2026-07-01', '2026-07-02', '2026-07-03', '2026-07-31',   // 4
                '2026-08-01', '2026-08-05', '2026-08-15', '2026-08-25', '2026-08-31',   // 5
                '2026-09-01', '2026-09-02', '2026-09-10', '2026-09-20', '2026-09-30', '2026-09-30',   // 6 in the CURRENT month
            );
            assert.deepEqual(counts(build(rows, MID_SEP)), [1, 2, 3, 4, 5, 6]);
        });
    });

    test(`[${tz}] outside the window is not counted (before the first month, after the current month)`, () => {
        inZone(tz, () => {
            const rows = on('2026-03-31', '2025-09-15', '2026-10-01', '2027-01-01', '2026-09-15');
            assert.deepEqual(counts(build(rows, MID_SEP)), [0, 0, 0, 0, 0, 1]);          // only 2026-09-15 is inside
        });
    });

    test(`[${tz}] a window that crosses the year`, () => {
        inZone(tz, () => {
            const feb = new Date('2026-02-15T12:00:00Z');
            assert.deepEqual(labels(build([], feb)), ['2025/9', '2025/10', '2025/11', '2025/12', '2026/1', '2026/2']);
            assert.deepEqual(counts(build(on('2025-09-01', '2025-12-31', '2026-01-01', '2026-02-28', '2025-08-31', '2026-03-01'), feb)), [1, 0, 0, 1, 1, 1]);
            const jan = new Date('2026-01-15T12:00:00Z');
            assert.deepEqual(lastMonthKeys(jan), ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01']);
        });
    });

    test(`[${tz}] plain dates belong to the month written in them (no zone shift at month end / start)`, () => {
        inZone(tz, () => {
            for (const [d, key] of [['2026-08-31', '2026-08'], ['2026-09-01', '2026-09'], ['2026-09-30', '2026-09'], ['2026-01-01', '2026-01'], ['2026-12-31', '2026-12']]) {
                assert.equal(monthKeyOf(d), key, d);
            }
        });
    });

    test(`[${tz}] the current month follows the LOCAL clock at a month boundary`, () => {
        inZone(tz, () => {
            // 2026-09-30T16:30Z is 00:30 on 1 Oct in Taipei, still 30 Sep in UTC (and 09:30 in Los Angeles)
            const edge = new Date('2026-09-30T16:30:00Z');
            const expectedCurrent = tz === 'Asia/Taipei' ? '2026-10' : '2026-09';
            assert.equal(lastMonthKeys(edge).at(-1), expectedCurrent);
            assert.equal(lastMonthKeys(edge).length, 6);
            // a record written on 1 Oct (a plain date) is in the window exactly when local "now" is already October
            assert.equal(build(on('2026-10-01'), edge).at(-1)!.count, tz === 'Asia/Taipei' ? 1 : 0);
        });
    });

    test(`[${tz}] timestamps: zone-less as written, zone-qualified converted to the user's local month`, () => {
        inZone(tz, () => {
            assert.equal(monthKeyOf('2026-08-31T20:00:00'), '2026-08');                 // no zone: as written, in every zone
            assert.equal(monthKeyOf('2026-08-31 20:00'), '2026-08');
            const local = (utc: string) => monthKeyOf(utc);
            // 2026-08-31T20:00Z is 04:00 on 1 Sep in Taipei; 13:00 on 31 Aug in Los Angeles; 20:00 on 31 Aug in UTC
            assert.equal(local('2026-08-31T20:00:00Z'), tz === 'Asia/Taipei' ? '2026-09' : '2026-08');
            assert.equal(local('2026-08-31T20:00:00.000Z'), tz === 'Asia/Taipei' ? '2026-09' : '2026-08');
            assert.equal(local('2026-08-31T20:00:00+00:00'), tz === 'Asia/Taipei' ? '2026-09' : '2026-08');
            // the same instant written with its own offset lands in the same local month
            assert.equal(local('2026-09-01T04:00:00+08:00'), tz === 'Asia/Taipei' ? '2026-09' : '2026-08');
            assert.equal(local('2026-09-01T04:00:00+0800'), tz === 'Asia/Taipei' ? '2026-09' : '2026-08');
            // 2026-09-01T02:00Z is still 31 Aug evening in Los Angeles (19:00)
            assert.equal(local('2026-09-01T02:00:00Z'), tz === 'America/Los_Angeles' ? '2026-08' : '2026-09');
            const rows = [{ d: '2026-08-31T20:00:00Z', vendor: 'V1' }, { d: '2026-09-15', vendor: 'V1' }];
            const bySep = build(rows, MID_SEP).at(-1)!.count;
            const byAug = build(rows, MID_SEP).at(-2)!.count;
            assert.deepEqual([byAug, bySep], tz === 'Asia/Taipei' ? [0, 2] : [1, 1]);
        });
    });
}

test('missing, non-string and invalid dates are never counted (never treated as the current month)', () => {
    for (const tz of ZONES) inZone(tz, () => {
        const bad: any[] = [undefined, null, '', '   ', 'garbage', '2026-13-01', '2026-00-10', '2026-02-30', '2026-02-29', '2026-09-31', '2026-9-5',
            '2026/09/20', '20260920', 12345, {}, [], true, '2026-09-20T25:00:00Z', '2026-09-20T10:61:00', '0026-09-20', '2026-09-20T10:00:00+99'];
        const rows = bad.map(d => ({ d, vendor: 'V1' }));
        assert.deepEqual(counts(build(rows, MID_SEP)), [0, 0, 0, 0, 0, 0], tz);
        for (const v of bad) assert.equal(monthKeyOf(v), null, String(v));
    });
});

test('calendar rules: 29 February is valid only in a leap year', () => {
    assert.equal(monthKeyOf('2028-02-29'), '2028-02');
    assert.equal(monthKeyOf('2026-02-29'), null);
    assert.equal(monthKeyOf('2026-04-31'), null);
    assert.equal(monthKeyOf('2026-12-31'), '2026-12');
});

test('the vendor filter is unchanged: a named vendor keeps only its own rows, "all" keeps everything', () => {
    inZone('Asia/Taipei', () => {
        const rows = [{ d: '2026-09-02', vendor: 'A' }, { d: '2026-09-03', vendor: 'B' }, { d: '2026-08-03', vendor: 'A' }];
        assert.deepEqual(counts(build(rows, MID_SEP, 'all')), [0, 0, 0, 0, 1, 2]);
        assert.deepEqual(counts(build(rows, MID_SEP, 'A')), [0, 0, 0, 0, 1, 1]);
        assert.deepEqual(counts(build(rows, MID_SEP, 'nobody')), [0, 0, 0, 0, 0, 0]);
    });
});

test('each card keeps its own date source (NCR/OBS raiseDate, NOI issueDate, ITP submissionDate, Checklist date, PQP updatedAt then dueDate)', () => {
    inZone('Asia/Taipei', () => {
        const at = (rows: any[], pick: (i: any) => unknown) => buildMonthlyData(rows, pick, 'all', MID_SEP).at(-1)!.count;
        assert.equal(at([{ raiseDate: '2026-09-05' }], i => i.raiseDate), 1);
        assert.equal(at([{ issueDate: '2026-09-05' }], i => i.issueDate), 1);
        assert.equal(at([{ submissionDate: '2026-09-05' }], i => i.submissionDate), 1);
        assert.equal(at([{ date: '2026-09-05' }], i => i.date), 1);
        const pqp = (i: any) => i.updatedAt || i.dueDate;
        assert.equal(at([{ updatedAt: '2026-09-05', dueDate: '2026-01-01' }], pqp), 1);      // updatedAt wins
        assert.equal(at([{ updatedAt: '', dueDate: '2026-09-05' }], pqp), 1);                // empty updatedAt falls back to dueDate
        assert.equal(at([{ updatedAt: '', dueDate: '' }], pqp), 0);                          // neither: not counted
    });
});
