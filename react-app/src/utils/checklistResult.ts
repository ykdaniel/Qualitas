// Single frontend source of truth for a Checklist item's result (2026-09-19).
//
// Stored codes are UNCHANGED — this only interprets them:
//   ''  (or absent / null / whitespace / legacy '-')  -> unfilled
//   'O' -> pass     'X' -> fail     '/' -> N/A (needs a reason: `naReason`)
//   anything else -> unknown (shown as "Unknown value: <raw>", never
//   treated as N/A or Pass, never rewritten on read or unrelated saves).
//
// Mirrors backend/services/checklist_service.py (summarize_items,
// na_reason_problems) — keep the two in step. No imports on purpose, so it
// can be unit-tested with plain `node --test` (see tests-unit/).

export type ResultKind = 'unfilled' | 'pass' | 'fail' | 'na' | 'unknown';

export const RESULT_CODE: Record<Exclude<ResultKind, 'unknown'>, string> = {
    unfilled: '',
    pass: 'O',
    fail: 'X',
    na: '/',
};

export const classifyResult = (raw: unknown): ResultKind => {
    if (raw === null || raw === undefined) return 'unfilled';
    if (typeof raw !== 'string') return 'unknown';
    const v = raw.trim();
    if (v === '' || v === '-') return 'unfilled';
    if (raw === 'O') return 'pass';
    if (raw === 'X') return 'fail';
    if (raw === '/') return 'na';
    return 'unknown';
};

export interface ItemSummary {
    total: number;
    pass: number;
    fail: number;
    na: number;
    unfilled: number;
    unknown: number;
    /** judged = pass + fail + na. N/A is a deliberate decision so it counts
     *  as judged, but it is never a pass; unknown values are NOT judged. */
    judged: number;
}

export const summarizeItems = (items: unknown): ItemSummary => {
    const s: ItemSummary = { total: 0, pass: 0, fail: 0, na: 0, unfilled: 0, unknown: 0, judged: 0 };
    if (!Array.isArray(items)) return s;
    s.total = items.length;
    for (const it of items) {
        if (!it || typeof it !== 'object') { s.unknown += 1; continue; }
        s[classifyResult((it as any).result)] += 1;
    }
    s.judged = s.pass + s.fail + s.na;
    return s;
};

/** passCount/failCount as the backend requires them: exact O / X counts. */
export const itemCounts = (items: unknown) => {
    const s = summarizeItems(items);
    return { passCount: s.pass, failCount: s.fail };
};

/**
 * THE status rule (2026-09-20) — the one definition every screen uses; mirrors the backend's
 * derive_checklist_status (backend/services/checklist_service.py) — keep the two in step.
 *
 *  - no items, or any item unfilled, or any unknown value      -> Ongoing
 *  - otherwise (every item judged O / X / '/'):
 *      - at least one X                                        -> Fail
 *      - no X but at least one '/' (including all '/')         -> Ongoing  (N/A is judged, but is not a
 *                                                                 pass; such a checklist cannot be approved)
 *      - every item O                                          -> Pass
 * passCount / failCount stay exactly the number of O / X items. The backend re-validates every declared
 * Pass and Fail against the real items.
 */
export const deriveChecklistStatus = (items: unknown): 'Ongoing' | 'Pass' | 'Fail' => {
    const s = summarizeItems(items);
    if (s.total === 0 || s.unfilled > 0 || s.unknown > 0) return 'Ongoing';
    if (s.fail > 0) return 'Fail';
    if (s.na > 0) return 'Ongoing';
    return 'Pass';
};

const reasonOf = (item: any): string => String(item?.naReason ?? '').trim();

/** Historical N/A: a '/' with no recorded reason that this session has not touched. */
export const isLegacyNaWithoutReason = (item: any, original: any): boolean =>
    item?.result === '/' && !reasonOf(item) && original?.result === '/' && !reasonOf(original);

/** Indexes of items that are N/A but lack the required reason (same rule as
 *  the backend's na_reason_problems: an untouched historical '/' is exempt). */
export const itemsMissingNaReason = (items: any[], originals: any[]): number[] => {
    const missing: number[] = [];
    (items || []).forEach((it, idx) => {
        if (it?.result !== '/') return;
        if (reasonOf(it)) return;
        if (isLegacyNaWithoutReason(it, originals?.[idx])) return;
        missing.push(idx);
    });
    return missing;
};

/** Apply a user's choice to one item. Only the touched item changes; the
 *  reason is dropped when the result is no longer N/A (the audit trail keeps it). */
export const withResult = (item: any, code: string) => {
    const next = { ...item, result: code };
    if (code !== '/') delete next.naReason;
    return next;
};

/** Payload-ready items: identical to what was loaded except that an item
 *  that is not N/A carries no reason. Nothing else is normalised — a legacy
 *  '-', a missing result or an unknown code round-trips untouched. */
export const itemsForSave = (items: any[]) =>
    (items || []).map((it) => {
        if (it && typeof it === 'object' && it.result !== '/' && 'naReason' in it) {
            const rest = { ...it };
            delete rest.naReason;
            return rest;
        }
        return it;
    });

/** True when N/A is present — the checklist cannot support an ITR approval. */
export const hasApprovalLimitingNa = (s: ItemSummary) => s.na > 0;

/** "Contains N/A, pending, cannot be approved": every item judged, no X, at least one N/A -> derived status
 *  is Ongoing for THIS reason (the wording the user sees must say so, not "Fail" and not a bare "In Progress"). */
export const isNaPending = (s: ItemSummary) =>
    s.total > 0 && s.unfilled === 0 && s.unknown === 0 && s.fail === 0 && s.na > 0;

/** Already-found failures on a checklist that is still Ongoing (unfilled / unknown items remain): the count must
 *  be shown, never hidden behind a plain "In Progress". */
export const failuresSoFar = (s: ItemSummary): number =>
    s.fail > 0 && (s.unfilled > 0 || s.unknown > 0) ? s.fail : 0;

/** ONE description of an Ongoing checklist's progress, shared by the ITR snapshot panel and the ITR's checklist
 *  list, so the two can never disagree. `key` is an i18n key; `params` its placeholders. */
export const ongoingProgress = (s: ItemSummary): { key: string; params: Record<string, number> } => {
    const params = { judged: s.judged, total: s.total, fail: s.fail };
    if (failuresSoFar(s) > 0) return { key: 'checklist.progress.rowOngoingWithFail', params };
    if (isNaPending(s)) return { key: 'checklist.progress.rowNaPending', params };
    return { key: 'checklist.progress.rowOngoing', params };
};
