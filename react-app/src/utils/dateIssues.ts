// Read-only date warnings for NCR / OBS / NOI (pure, no imports — unit-tested via `npm test`).
//
// The API returns every stored date UNTOUCHED (NULL included) plus `date_issues: [{field, value, code, related_field}]` describing
// what a NEW write would not be allowed to contain. Nothing here rewrites, trims, nulls or "fixes" a value: an invalid value is
// shown exactly as stored, next to a warning, and is only ever changed by an explicit edit of that field.

export interface DateIssue {
    field: string;
    value: string | null;
    code: string;
    related_field?: string | null;
}

/** Fields that are compared with each other (order rules); every other code names a single bad value. */
const ORDER_CODES = new Set(['raise_after_closeout', 'raise_after_due', 'closeout_after_due']);

export const issuesOf = (item: unknown): DateIssue[] => {
    const raw = (item as { date_issues?: unknown } | null | undefined)?.date_issues;
    return Array.isArray(raw) ? (raw as DateIssue[]) : [];
};

export const fieldIssues = (item: unknown, field: string): DateIssue[] => issuesOf(item).filter(i => i.field === field);

export const hasFieldIssue = (item: unknown, field: string): boolean => fieldIssues(item, field).length > 0;

/** True when `field` of this stored record holds an invalid VALUE (not merely an order problem between two valid dates). */
export const hasValueIssue = (item: unknown, field: string): boolean => fieldIssues(item, field).some(i => !ORDER_CODES.has(i.code));

/** True for a problem with the VALUE itself (as opposed to two valid dates being in the wrong order). */
export const isValueIssue = (issue: DateIssue): boolean => !ORDER_CODES.has(issue.code);

/**
 * 'YYYY/M/D' for a complete, calendar-valid 'YYYY-MM-DD'; null for anything else. Deliberately does NOT go through `Date`:
 * `new Date('2026-02-30')` rolls over to 2 March, and `toLocaleDateString` shifts a plain date by the user's UTC offset.
 */
export const formatStrictDate = (raw: unknown): string | null => {
    if (typeof raw !== 'string') return null;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return null;
    return `${y}/${mo}/${d}`;
};

/**
 * What a table cell shows for a stored date: the value exactly as stored (never '-' for a non-empty bad value, never a rolled-over
 * date), and whether it carries a warning. `format` is applied only to a value that has NO issue.
 */
export const dateCell = (
    item: unknown,
    field: string,
    format: (raw: string) => string = raw => raw,
): { text: string; warn: boolean } => {
    const raw = (item as Record<string, unknown> | null | undefined)?.[field];
    const warn = hasFieldIssue(item, field);
    if (raw === null || raw === undefined || raw === '') return { text: '-', warn };
    const s = String(raw);
    return { text: warn ? s : format(s), warn };
};

/**
 * Before saving an EXISTING record: a date field whose stored value has an issue and whose form value came back blank must not
 * silently erase the stored value (an <input type="date"> cannot display an invalid string, so it looks empty). Such a field is
 * sent back with the stored value — an unchanged resend, which the server does not treat as a new write. A field the user really
 * changed keeps the new value.
 */
export const preserveHistoricalDates = <T extends object>(payload: T, original: unknown, fields: readonly string[]): T => {
    const out: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
    const orig = (original ?? {}) as Record<string, unknown>;
    for (const f of fields) {
        if (!hasValueIssue(original, f)) continue;
        const v = out[f];
        if (v === undefined || v === null || v === '') out[f] = orig[f];
    }
    return out as T;
};

/** i18n key for an issue code (unknown codes fall back to the generic one). */
export const issueMessageKey = (code: string): string =>
    ['invalid_format', 'invalid_calendar', 'timestamp', 'trailing_characters', 'whitespace', 'whitespace_only', 'missing_required',
        'raise_after_closeout', 'raise_after_due', 'closeout_after_due', 'due_fixed_at_closure'].includes(code) ? `dateIssue.${code}` : 'dateIssue.unknown';

export const NCR_DATE_FIELDS = ['raiseDate', 'closeoutDate', 'dueDate', 'effectivenessVerifiedDate', 'correctiveActionTargetDate', 'preventiveActionTargetDate', 'ownerApprovalDate'] as const;
export const OBS_DATE_FIELDS = ['raiseDate', 'closeoutDate', 'dueDate', 'verifiedDate', 'qualityEngineerApprovalDate', 'constructionEngineerApprovalDate'] as const;
export const NOI_DATE_FIELDS = ['issueDate', 'inspectionDate', 'closeoutDate', 'dueDate'] as const;
