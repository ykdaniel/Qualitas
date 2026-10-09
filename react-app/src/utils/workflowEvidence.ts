// What the Q-WorkFlow "improvement" checkpoint rests on (2026-09-21) — turned into the lines the tracker shows.
// Pure functions of the server's answer (see backend/services/workflow_service.py): no rule lives here, only wording and counts.
import type { Checkpoint, PhotoReason, WorkflowSummary } from '../types/workflow';

type Translate = (key: string, params?: Record<string, string | number>) => string;

const REASONS: PhotoReason[] = ['missing', 'invalid', 'legacy_unverified'];

const reasonList = (reasons: Partial<Record<PhotoReason, number>> | undefined, t: Translate): string =>
    REASONS.filter(r => (reasons?.[r] ?? 0) > 0).map(r => t(`workflow.evidence.reason.${r}`, { count: reasons![r] as number })).join('；');

/** Lines for the improvement cell's tooltip: why it blocks, how many are verified NOW, how many pass only on Closed status (photos NOT verified). */
export function improvementNotes(cp: Checkpoint, t: Translate): string[] {
    const lines: string[] = [];
    if (cp.blocking_reason) lines.push(t(`workflow.evidence.blocking.${cp.blocking_reason}`));
    if ((cp.verified_count ?? 0) > 0) lines.push(t('workflow.evidence.verified', { count: cp.verified_count as number }));
    if ((cp.unverified_count ?? 0) > 0) {
        lines.push(t('workflow.evidence.closedUnverified', { count: cp.unverified_count as number }));
        const why = reasonList(cp.unverified_reasons, t);
        if (why) lines.push(why);
    }
    return lines;
}

/** True when this flow contains records that pass the improvement checkpoint without a verified photo — the cell and the percentage get a marker. */
export const hasUnverified = (w: Pick<WorkflowSummary, 'unverified_photo_count'>): boolean => (w.unverified_photo_count ?? 0) > 0;

/** The short note beside the percentage ("… 1 unverified"), or '' when every passing record is verified. */
export function summaryNote(w: WorkflowSummary, t: Translate): string {
    return hasUnverified(w) ? t('workflow.evidence.summary', { count: w.unverified_photo_count as number }) : '';
}

/** Tooltip for that note: the count, why, and the reminder that the percentage is not "all evidence verified". */
export function summaryTitle(w: WorkflowSummary, t: Translate): string {
    if (!hasUnverified(w)) return '';
    return [t('workflow.evidence.summaryTitle', { count: w.unverified_photo_count as number }), reasonList(w.unverified_photo_reasons, t)].filter(Boolean).join('\n');
}
