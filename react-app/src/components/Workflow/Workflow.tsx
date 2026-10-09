// Q-WorkFlow page — progress-bar tracker (Phase 1 PR1b v4).
//
// Each row is one Q-WorkFlow (1:1 with an NOI, reference number
// Q-WorkFlow-000001...). The 9 checkpoint cells form a single
// horizontal progress bar across the row rather than a grid of
// tick marks:
//
//   green segment / green dot     — done (everything before the
//                                   progress front)
//   orange dot + green trail      — current (first un-done
//                                   checkpoint, i.e. "stuck here")
//   gray segment / gray dot       — pending (anything after the
//                                   progress front)
//
// The bar is painted by ::before/::after pseudo-elements on each
// .progressCell (see Workflow.module.css). Completion in the sticky summary
// rolls up done / 9. Clicking a row deep-links to
// /noi?openId=<noi_id>, which the NOI page consumes on mount to
// open that NOI's detail modal.
//
// See backend/services/workflow_service.py for the rules that
// compute each checkpoint's done state.

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, AlertCircle, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { improvementNotes, summaryNote, summaryTitle } from '../../utils/workflowEvidence';
import { useWorkflowData } from '../../hooks/useWorkflowData';
import {
    CHECKPOINT_ORDER,
    COMPLETION_BUCKETS,
    type CheckpointKey,
    type CompletionBucket,
    type WorkflowSummary,
} from '../../types/workflow';
import styles from './Workflow.module.css';
import shellStyles from '../Shared/ModuleShell.module.css';

const BUCKET_ACCENT: Record<CompletionBucket, string> = {
    bucket_0_25: '#b86060',
    bucket_26_50: '#c8753f',
    bucket_51_75: '#b8945a',
    bucket_76_100: '#7a8f5a',
};

const BUCKET_ICON: Record<CompletionBucket, React.ReactElement> = {
    bucket_0_25: <AlertCircle size={18} strokeWidth={1.8} />,
    bucket_26_50: <AlertTriangle size={18} strokeWidth={1.8} />,
    bucket_51_75: <Activity size={18} strokeWidth={1.8} />,
    bucket_76_100: <CheckCircle2 size={18} strokeWidth={1.8} />,
};

type BucketFilter = 'all' | CompletionBucket;

const Workflow: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const { stats, workflows, loading, error, retry } = useWorkflowData();
    const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');

    const filtered = useMemo(() => {
        const list =
            bucketFilter === 'all'
                ? workflows
                : workflows.filter(w => {
                      const bucket = COMPLETION_BUCKETS.find(
                          b => b.key === bucketFilter,
                      );
                      if (!bucket) return false;
                      return (
                          w.completion_percent >= bucket.min &&
                          w.completion_percent <= bucket.max
                      );
                  });
        // Lowest completion first — "stuck" rows deserve the top of the
        // list on a page whose whole point is spotting stragglers.
        return [...list].sort(
            (a, b) => a.completion_percent - b.completion_percent,
        );
    }, [workflows, bucketFilter]);

    const handleRowClick = (workflow: WorkflowSummary) => {
        // Deep-link to the NOI detail modal. NOI page consumes
        // ?openId= on mount and opens the matching detail modal.
        if (!workflow.noi_id) return;
        navigate(`/noi?openId=${encodeURIComponent(workflow.noi_id)}`);
    };

    const checkpointLabel = (key: CheckpointKey): string => {
        return t(`workflow.checkpoint.${key}`) || key;
    };

    // QWORKFLOW-UX-2026-001: a one-line "current step" summary shown in the sticky NOI cell, so
    // it is visible without scrolling the 9-checkpoint strip horizontally. Built ENTIRELY from
    // the already-computed checkpoints[].state (no new calculation, no guessing) — see
    // backend/services/workflow_service.py's _evaluate_checkpoints: there is always exactly one
    // 'current' checkpoint, UNLESS every rule is satisfied, in which case there is none and every
    // checkpoint (including 'accepted') is 'done'. Those are the only two real shapes; the third
    // branch below is defensive only and never asserts a guess.
    const currentStepText = (w: WorkflowSummary): string | null => {
        const current = w.checkpoints.find(cp => cp.state === 'current');
        if (current) {
            return `${t('workflow.currentStep')}: ${checkpointLabel(current.key as CheckpointKey)}`;
        }
        const allDone = w.checkpoints.length > 0 && w.checkpoints.every(cp => cp.state === 'done');
        if (allDone) {
            // Stating the already-known fact ("Accepted"/"驗收合格"), not "current step: X" —
            // there is no current step left once everything is done.
            return checkpointLabel('accepted');
        }
        // Neither shape — not expected from the backend's own logic, but if it ever happens,
        // show nothing rather than guess (e.g. never render "等待檢驗"/"Inspected" here).
        return null;
    };

    /** The NCR actually holding this checkpoint back, per the backend's
     * per-NCR predicate (see workflow_service._NCR_RULE_PREDICATES) — not
     * meaningful for checkpoints that aren't NCR-derived (noi/wh_inspection/
     * ncr/accepted), which never carry a blocking_ncr_id. */
    const blockingNcrId = (w: WorkflowSummary, cpKey: CheckpointKey): string | null => {
        return w.checkpoints.find(c => c.key === cpKey)?.blocking_ncr_id ?? null;
    };

    /** Deep-link a checkpoint marker click to the relevant business form. */
    const handleCheckpointClick = (
        e: React.MouseEvent,
        w: WorkflowSummary,
        cpKey: CheckpointKey,
    ) => {
        e.stopPropagation(); // don't trigger the row-level NOI deep-link
        switch (cpKey) {
            case 'noi':
            case 'accepted':
                if (w.noi_id) navigate(`/noi?openId=${encodeURIComponent(w.noi_id)}`);
                break;
            case 'wh_inspection':
                // Jump to the first ITR linked to this NOI
                if (w.itr_ids?.length) {
                    navigate(`/itr?openId=${encodeURIComponent(w.itr_ids[0])}`);
                } else if (w.noi_id) {
                    navigate(`/noi?openId=${encodeURIComponent(w.noi_id)}`);
                }
                break;
            case 'itr': {
                // The blocking NCR (if any) is the one that still needs a
                // passed re-inspection linked — jump there so the user can
                // see/fix its reInspectionNumber, rather than guessing which
                // of possibly several NCRs' re-insp reports reinsp_itr_ids[0]
                // happens to belong to.
                const blockingId = blockingNcrId(w, cpKey);
                if (blockingId) {
                    navigate(`/ncr?openId=${encodeURIComponent(blockingId)}`);
                } else if (w.reinsp_itr_ids?.length) {
                    navigate(`/itr?openId=${encodeURIComponent(w.reinsp_itr_ids[0])}`);
                } else if (w.itr_ids?.length) {
                    navigate(`/itr?openId=${encodeURIComponent(w.itr_ids[w.itr_ids.length - 1])}`);
                }
                break;
            }
            case 'ncr':
            case 'moc':
            case 'improvement':
            case 'reinspection':
            case 'close_ncr': {
                // NCR-related checkpoints → open the specific NCR blocking
                // this checkpoint when known, else fall back to the first
                // linked NCR (matches old behaviour, and is what 'ncr' itself
                // always uses since that checkpoint has no per-NCR predicate).
                const blockingId = blockingNcrId(w, cpKey);
                if (blockingId) {
                    navigate(`/ncr?openId=${encodeURIComponent(blockingId)}`);
                } else if (w.ncr_ids?.length) {
                    navigate(`/ncr?openId=${encodeURIComponent(w.ncr_ids[0])}`);
                } else if (w.noi_id) {
                    // No NCRs — fall back to NOI
                    navigate(`/noi?openId=${encodeURIComponent(w.noi_id)}`);
                }
                break;
            }
        }
    };

    const bucketLabel = (key: CompletionBucket): string => {
        return t(`workflow.bucket.${key}`) || key;
    };

    const summaryCards = stats ? [
        {
            key: 'total',
            label: t('workflow.total') || 'Total NCRs',
            value: stats.total,
            icon: <BarChart3 size={18} strokeWidth={1.8} />,
            accent: '#8a6a3a',
        },
        ...COMPLETION_BUCKETS.map(bucket => ({
            key: bucket.key,
            label: bucketLabel(bucket.key),
            value: stats[bucket.key],
            icon: BUCKET_ICON[bucket.key],
            accent: BUCKET_ACCENT[bucket.key],
        })),
    ] : [];

    return (
        <div className={shellStyles.container}>
            <p className={styles.subtitle}>
                {t('workflow.subtitle') ||
                    'Every NOI becomes a Q-WorkFlow, tracked through 9 canonical checkpoints to final acceptance.'}
            </p>

            {error && (
                <div className={shellStyles.errorBanner}>
                    <span>{error}</span>
                    <button type="button" onClick={retry}>{t('common.retry')}</button>
                </div>
            )}

            {stats && (
                <section className={shellStyles.summaryGrid}>
                    {summaryCards.map(card => (
                        <div
                            key={card.key}
                            className={shellStyles.summaryCard}
                            style={{ '--accent': card.accent } as React.CSSProperties}
                        >
                            <div className={shellStyles.summaryIcon}>{card.icon}</div>
                            <div className={shellStyles.summaryBody}>
                                <div className={shellStyles.summaryLabel}>{card.label}</div>
                                <div className={shellStyles.summaryValue}>{card.value}</div>
                            </div>
                        </div>
                    ))}
                </section>
            )}

            <div className={shellStyles.toolbar}>
                <div className={shellStyles.chipGroup}>
                    <button
                        type="button"
                        className={`${shellStyles.chip} ${bucketFilter === 'all' ? shellStyles.chipActive : ''}`}
                        onClick={() => setBucketFilter('all')}
                    >
                        {t('workflow.filterAll') || 'All'}
                        <span className={shellStyles.chipCount}>{stats?.total ?? '—'}</span>
                    </button>
                    {COMPLETION_BUCKETS.map(bucket => (
                        <button
                            key={bucket.key}
                            type="button"
                            className={`${shellStyles.chip} ${bucketFilter === bucket.key ? shellStyles.chipActive : ''}`}
                            onClick={() => setBucketFilter(bucket.key)}
                        >
                            {bucketLabel(bucket.key)}
                            <span className={shellStyles.chipCount}>{stats?.[bucket.key] ?? '—'}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className={styles.legend} data-testid="workflow-legend">
                {(['done', 'current', 'pending'] as const).map(state => (
                    <span key={state} className={`${styles.legendItem} ${styles[state]}`}>
                        <span className={styles.progressMarker} aria-hidden="true" />
                        {t(`workflow.legend.${state}`)}
                    </span>
                ))}
            </div>
            {!loading && !error && (
                <div className={styles.rowCount} aria-live="polite">
                    {t('workflow.visibleCount', { count: filtered.length })}
                </div>
            )}
            {/* Checkpoint tracker table */}
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.indexCol} scope="col">#</th>
                            <th className={styles.stickyCol}>
                                {t('workflow.col.reference') || 'Q-WorkFlow'}
                            </th>
                            <th className={styles.noiCol}>{t('workflow.col.noi') || 'NOI'}</th>
                            <th className={styles.subjectCol}>
                                {t('workflow.col.subject') || 'Subject'}
                            </th>
                            <th className={styles.stepCol}>{t('workflow.currentStep')}</th>
                            <th className={styles.completionCol}>{t('workflow.processCompletion')}</th>
                            {CHECKPOINT_ORDER.map(key => (
                                <th key={key} className={styles.checkpointHead}>
                                    <span className={styles.checkpointHeadLabel}>
                                        {checkpointLabel(key)}
                                    </span>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td
                                    colSpan={CHECKPOINT_ORDER.length + 6}
                                    className={styles.empty}
                                >
                                    {t('common.loading') || 'Loading...'}
                                </td>
                            </tr>
                        )}
                        {!loading && !error && filtered.length === 0 && (
                            <tr>
                                <td
                                    colSpan={CHECKPOINT_ORDER.length + 6}
                                    className={styles.empty}
                                >
                                    {t('workflow.empty') ||
                                        'No NCRs match the current filter.'}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            filtered.map((w, index) => (
                                <tr
                                    key={w.qworkflow_id}
                                    className={styles.row}
                                    onClick={() => handleRowClick(w)}
                                >
                                    <td className={styles.indexCol}>{index + 1}</td>
                                    <td className={styles.stickyCol} title={w.reference_no || ''}>
                                        {w.reference_no || '—'}
                                    </td>
                                    <td className={styles.noiCol} title={w.noi_reference_no || ''}>
                                        {w.noi_reference_no || w.noi_package || '—'}
                                    </td>
                                    <td
                                        className={`${styles.subjectCol} ${styles.subjectCell}`}
                                        title={w.noi_package || ''}
                                    >
                                        {w.noi_package || '—'}
                                    </td>
                                    <td className={styles.stepCol} data-testid="current-step-line">
                                        {currentStepText(w)?.replace(`${t('workflow.currentStep')}: `, '') || '—'}
                                    </td>
                                    <td className={styles.completionCol} data-testid="workflow-completion">
                                        <strong>{w.completion_percent}%</strong>
                                        {summaryNote(w, t) && (
                                            <div className={styles.unverifiedNote} title={summaryTitle(w, t)} data-testid="unverified-note">
                                                {summaryNote(w, t)}
                                            </div>
                                        )}
                                    </td>
                                    {w.checkpoints.map((cp, i) => {
                                        const isFirst = i === 0;
                                        const isLast =
                                            i === w.checkpoints.length - 1;
                                        return (
                                            <td
                                                key={cp.key}
                                                className={[
                                                    styles.progressCell,
                                                    styles[cp.state],
                                                    isFirst ? styles.first : '',
                                                    isLast ? styles.last : '',
                                                    styles.clickable,
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ')}
                                                title={[`${checkpointLabel(cp.key as CheckpointKey)} · ${cp.state}`, ...(cp.key === 'improvement' ? improvementNotes(cp, t) : [])].join('\n')}
                                                data-checkpoint={cp.key}
                                                data-unverified={cp.key === 'improvement' && (cp.unverified_count ?? 0) > 0 ? cp.unverified_count : undefined}
                                                onClick={(e) => handleCheckpointClick(e, w, cp.key as CheckpointKey)}
                                            >
                                                <div
                                                    className={styles.progressMarker}
                                                />
                                                {cp.key === 'improvement' && (cp.unverified_count ?? 0) > 0 && (
                                                    <span className={styles.unverifiedMark} data-testid="unverified-mark">
                                                        {t('workflow.evidence.closedUnverified', { count: cp.unverified_count as number })}
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}

                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Workflow;
