/**
 * "Overdue" for an NCR, kept apart on purpose from "closed":
 *   open-overdue   not Closed / Void, due date in the past      — still being chased (scheduler, upcoming tasks)
 *   closed-late    Closed, and the close-out date is after the due date — a fact about the closure, not an open item
 *   closed-on-time Closed, close-out date on or before the due date (or one of them unknown)
 * A late closure changes nothing about status: it is Closed for every count, filter and Q-Workflow checkpoint (2026-09-21).
 * Dates are plain YYYY-MM-DD strings compared as calendar days — never through `Date` parsing of a string, so no time zone or
 * "2026-02-30 becomes 2 March" effect.
 */

const DAY_MS = 86_400_000;

/** Days since 1970-01-01 for a strictly valid YYYY-MM-DD, otherwise null. */
export const dayNumber = (value: unknown): number | null => {
    if (typeof value !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const t = Date.UTC(y, mo - 1, d);
    const back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;   // non-existent day
    return Math.round(t / DAY_MS);
};

/** How many days AFTER the due date the NCR was closed; null when either date is missing / invalid or it was not late. */
export const lateClosureDays = (dueDate: unknown, closeoutDate: unknown): number | null => {
    const due = dayNumber(dueDate);
    const closed = dayNumber(closeoutDate);
    if (due === null || closed === null || closed <= due) return null;
    return closed - due;
};

export type NcrOverdueState = 'open' | 'open-overdue' | 'closed-on-time' | 'closed-late' | 'void';

export const ncrOverdueState = (item: { status?: string; dueDate?: string; closeoutDate?: string }, today: string): NcrOverdueState => {
    const status = (item.status || '').trim().toLowerCase();
    if (status === 'void') return 'void';
    if (status === 'closed') return lateClosureDays(item.dueDate, item.closeoutDate) !== null ? 'closed-late' : 'closed-on-time';
    const due = dayNumber(item.dueDate);
    const now = dayNumber(today);
    return due !== null && now !== null && due < now ? 'open-overdue' : 'open';
};
