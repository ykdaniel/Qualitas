/**
 * Shared "outstanding vs closed vs void" bucketing for NCR and OBS (2026-09-29, Dashboard
 * statistics consistency batch). Both modules share the same status shape — see
 * `backend/core/utils.py::WorkflowEngine.TRANSITIONS["NCR"|"OBS"]`: Open / In Progress / Resolved /
 * Closed / Void, with Closed the only true completion and Void a SEPARATE terminal sink
 * (cancelled/not applicable) that must not be counted as either open or closed work.
 *
 * Before this batch, three places computed this independently and disagreed:
 *   - `hooks/useDashboardStats.ts`'s `ncrOpen` only matched the literal status "open"/"opening",
 *     undercounting "In Progress"/"Resolved" (both genuinely still outstanding) as not-open.
 *   - `hooks/useDashboardStats.ts`'s `obsOpen` matched "anything not Closed", overcounting Void as
 *     open.
 *   - `NCRStatsCard.tsx`/`NCRParetoChart.tsx` and `OBSStatsCard.tsx`/`OBSParetoChart.tsx` already
 *     independently agreed with EACH OTHER on "not Closed and not Void" (their own code comments
 *     record this pairwise alignment, done in an earlier batch) — that is the definition kept here;
 *     `useDashboardStats.ts` was the one out of step, in both directions.
 * Reproduced with isolated data covering Open/In Progress/Resolved/Closed/Void before concluding
 * this is genuinely ONE metric (not two intentionally different ones) — see the handoff for the
 * repro. Consistent with the established "exclude Void from Open" precedent from the KPI
 * Void-exclusion fix (2026-08-27) referenced in BACKLOG #24.4, which documents the SAME
 * card-vs-tab discrepancy on the NCR/OBS modules' own pages (not fixed here — out of this batch's
 * Dashboard-only scope).
 */
const normalize = (status: unknown): string => (typeof status === 'string' ? status.trim().toLowerCase() : '');

export const isClosedStatus = (status: unknown): boolean => normalize(status) === 'closed';
export const isVoidStatus = (status: unknown): boolean => normalize(status) === 'void';

/** Open, In Progress, Resolved, or any other non-standard value — anything that is neither a true
 * completion (Closed) nor a cancelled/inapplicable record (Void). */
export const isOutstandingStatus = (status: unknown): boolean => !isClosedStatus(status) && !isVoidStatus(status);

export interface ParetoRow {
    contractor: string;
    open: number;
    closed: number;
}

/**
 * Pareto cumulative-%: the running total of `open + closed` (Void deliberately excluded from the
 * denominator — 2026-09-29, user decision) as a percentage of the grand total of `open + closed`
 * across all rows. Extracted out of NCRParetoChart.tsx/OBSParetoChart.tsx (both call this, both
 * used to compute it inline and disagree with their own bars — see the handoff) so the rule has
 * one place to test and one place to change.
 *
 * Before this batch, the denominator was every row's RAW total (which included Void), while the
 * stacked bars only ever plotted open+closed — so the last bar's height fell short of the 100%
 * the cumulative line claimed. Excluding Void from the denominator here keeps the line's range
 * identical to what the bars actually show.
 */
export const buildParetoCumulative = <T extends ParetoRow>(rows: T[]): (T & { cumulativePercent: number })[] => {
    const grandTotal = rows.reduce((sum, row) => sum + row.open + row.closed, 0);
    let cumulative = 0;
    return rows.map(row => {
        cumulative += row.open + row.closed;
        const cumulativePercent = grandTotal > 0 ? Math.round((cumulative / grandTotal) * 100) : 0;
        return { ...row, cumulativePercent };
    });
};
