// Monthly buckets for the dashboard's trend cards (pure, no imports — unit-tested via `npm test`).
//
// WINDOW: the last N calendar months ending with the user's LOCAL current month, built with integer arithmetic on
// (year, month) — never by creating a local first-of-month Date and reading its UTC year-month back (that shifted
// the whole window one month early in every zone ahead of UTC, so the current month was never shown).
//
// WHICH MONTH A RECORD BELONGS TO (one definition for every card):
//   * plain date            "2026-09-30"                 -> the month written in it. No zone conversion: a date is not an instant.
//   * timestamp WITHOUT zone "2026-09-30T23:30:00"       -> the wall-clock date as written (same as a plain date).
//   * timestamp WITH zone    "...Z", "...+08:00"         -> an instant: converted to the user's local time zone, then that local month.
//   * missing, non-string, malformed or impossible dates ("", "garbage", "2026-13-01", "2026-02-30") -> NOT counted anywhere
//     (never treated as "now" / the current month).

export interface TrendPoint { month: string; count: number }

export const TREND_MONTHS = 6;

const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
const monthKey = (year: number, monthIndex0: number) => `${year}-${pad2(monthIndex0 + 1)}`;

/** 'YYYY-MM' keys, oldest first, ending with `now`'s local month. */
export const lastMonthKeys = (now: Date, months: number = TREND_MONTHS): string[] => {
    const base = now.getFullYear() * 12 + now.getMonth();
    const keys: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
        const t = base - i;
        const year = Math.floor(t / 12);
        keys.push(monthKey(year, t - year * 12));
    }
    return keys;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** 'YYYY-MM' the value belongs to (see the rules at the top), or null when it is not a usable date. */
export const monthKeyOf = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const m = DATE_RE.exec(raw.trim());
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (year < 1000 || month < 1 || month > 12) return null;
    if (day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;      // real calendar day
    if (m[4] === undefined) return `${m[1]}-${m[2]}`;                                       // plain date: as written
    const hh = Number(m[4]);
    const mm = Number(m[5]);
    const ss = m[6] === undefined ? 0 : Number(m[6]);
    if (hh > 23 || mm > 59 || ss > 59) return null;
    const zone = m[7];
    if (zone === undefined) return `${m[1]}-${m[2]}`;                                       // timestamp without zone: wall-clock as written
    const offset = zone === 'Z' ? 'Z' : (() => {
        const digits = zone.slice(1).replace(':', '');
        return `${zone[0]}${digits.slice(0, 2)}:${digits.length > 2 ? digits.slice(2, 4) : '00'}`;
    })();
    const instant = new Date(`${m[1]}-${m[2]}-${m[3]}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}${offset}`);
    if (Number.isNaN(instant.getTime())) return null;
    return monthKey(instant.getFullYear(), instant.getMonth());                              // instant -> the user's local month
};

/** Monthly counts for the last `months` local months. `vendor === 'all'` keeps everything (unchanged filter). */
export function buildMonthlyData(
    list: any[],
    getDate: (item: any) => unknown,
    vendor: string,
    now: Date = new Date(),
    months: number = TREND_MONTHS,
): TrendPoint[] {
    const filtered = vendor === 'all' ? (list || []) : (list || []).filter(i => i.vendor === vendor);
    const keys = lastMonthKeys(now, months);
    const counts: Record<string, number> = {};
    keys.forEach(k => { counts[k] = 0; });
    filtered.forEach(item => {
        const key = monthKeyOf(getDate(item));
        if (key !== null && counts[key] !== undefined) counts[key]++;
    });
    return keys.map(key => {
        const [year, mon] = key.split('-');
        return { month: `${year}/${parseInt(mon, 10)}`, count: counts[key] };
    });
}
