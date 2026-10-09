// Pure helpers for the read-only ITR approval-history view (2026-09-20).
//
// Everything shown there comes from the STORED event — the actor's id / username / full name as they
// were at the time, the server's UTC timestamp, and the snapshots. These helpers only format what the
// event already says; they never look anything up in the current user or checklist data and never
// invent a value that is missing. No imports on purpose, so they can be unit-tested with plain `node --test`.

export interface ApprovalEventSummary {
    id: number;
    itr_id: string;
    document_number?: string | null;
    sequence: number;
    event_type: 'APPROVED' | 'REVOKED' | string;
    occurred_at: string;
    actor_user_id?: number | null;
    actor_username?: string | null;
    actor_full_name?: string | null;
    status_before?: string | null;
    status_after?: string | null;
    reason?: string | null;
    approval_event_id?: number | null;
    approval_event_sequence?: number | null;
    has_snapshot: boolean;
}

export interface ApprovalEventDetail extends ApprovalEventSummary {
    itr_snapshot?: Record<string, any> | null;
    checklists_snapshot?: Array<Record<string, any>> | null;
    snapshot_sha256?: string | null;
    snapshot_sha256_matches?: boolean | null;
}

export interface ApprovalEventPage {
    items: ApprovalEventSummary[];
    total: number;
    skip: number;
    limit: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-09-20 03:22:09 UTC` — the stored server time, always labelled with its zone. Unparseable input is
 *  returned as-is (never replaced by "now" or a guess). */
export const formatUtc = (iso: string | null | undefined): string => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} `
        + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
};

/** The same instant in the viewer's own zone, with the zone NAME included (e.g. "2026/9/20 11:22:09 [GMT+8]"). */
export const formatLocalWithZone = (iso: string | null | undefined, locale?: string): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(locale, { hour12: false, timeZoneName: 'short' });
};

/** Who did it, AS RECORDED: full name (when one was stored) and the account name at that time.
 *  Missing parts stay missing — `name` is null rather than borrowed from the current user. */
export const actorOf = (e: Pick<ApprovalEventSummary, 'actor_full_name' | 'actor_username' | 'actor_user_id'>) => ({
    name: e.actor_full_name && e.actor_full_name.trim() ? e.actor_full_name : null,
    username: e.actor_username && e.actor_username.trim() ? e.actor_username : null,
    userId: e.actor_user_id ?? null,
});

/** For a REVOKED event: which approval it ended. `unknown` when the approval predates event recording. */
export const revokedTarget = (e: Pick<ApprovalEventSummary, 'event_type' | 'approval_event_id' | 'approval_event_sequence'>):
    { kind: 'na' } | { kind: 'known'; sequence: number | null; id: number } | { kind: 'unknown' } => {
    if (e.event_type !== 'REVOKED') return { kind: 'na' };
    if (e.approval_event_id === null || e.approval_event_id === undefined) return { kind: 'unknown' };
    return { kind: 'known', sequence: e.approval_event_sequence ?? null, id: e.approval_event_id };
};

export const isApproval = (e: Pick<ApprovalEventSummary, 'event_type'>) => e.event_type === 'APPROVED';

/** Pager arithmetic: 1-based "from–to of total", and whether earlier / later pages exist. */
export const pageWindow = (p: Pick<ApprovalEventPage, 'skip' | 'limit' | 'total'> & { count: number }) => ({
    from: p.count === 0 ? 0 : p.skip + 1,
    to: p.skip + p.count,
    total: p.total,
    hasPrev: p.skip > 0,
    hasNext: p.skip + p.count < p.total,
});

/** Snapshot ITR fields worth showing, in a fixed order. Values are copied verbatim (null stays null). */
export const ITR_SNAPSHOT_FIELDS: Array<[string, string]> = [
    ['documentNumber', 'itr.history.field.documentNumber'],
    ['status', 'itr.history.field.status'],
    ['type', 'itr.history.field.revision'],
    ['inspectionResult', 'itr.history.field.inspectionResult'],
    ['noiNumber', 'itr.history.field.noiNumber'],
    ['subject', 'itr.history.field.subject'],
    ['closeoutDate', 'itr.history.field.closeoutDate'],
    ['approvedBy', 'itr.history.field.approvedById'],
    ['approvedAt', 'itr.history.field.approvedAt'],
];

export const snapshotItems = (checklist: Record<string, any> | null | undefined): Array<Record<string, any>> =>
    Array.isArray(checklist?.items) ? (checklist as Record<string, any>).items.filter((i: unknown) => i && typeof i === 'object') : [];
