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
// .progressCell (see Workflow.module.css). The completion % column
// on the right rolls up done / 9. Clicking a row deep-links to
// /noi?openId=<noi_id>, which the NOI page consumes on mount to
// open that NOI's detail modal.
//
// See backend/services/workflow_service.py for the rules that
// compute each checkpoint's done state.

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, AlertCircle, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import {
    fetchWorkflows,
    fetchWorkflowStats,
} from '../../services/workflowService';
import {
    CHECKPOINT_ORDER,
    COMPLETION_BUCKETS,
    type CheckpointKey,
    type CompletionBucket,
    type WorkflowStats,
    type WorkflowSummary,
} from '../../types/workflow';
import { getErrorMessage } from '../../utils/errorUtils';
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

    const [stats, setStats] = useState<WorkflowStats | null>(null);
    const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all');

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                // Fire both in parallel — they're independent and both
                // small enough that this meaningfully cuts first paint.
                const [statsData, listData] = await Promise.all([
                    fetchWorkflowStats(),
                    fetchWorkflows({ limit: 200 }),
                ]);
                if (cancelled) return;
                setStats(statsData);
                setWorkflows(listData);
            } catch (err) {
                if (cancelled) return;
                setError(getErrorMessage(err) || t('workflow.loadError'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [t]);

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
            case 'itr':
                // Re-inspection ITR — jump directly at the specific
                // re-insp report resolved by the backend
                // (NCR.reInspectionNumber / ITR.originalItrId). Falls
                // back to any linked ITR if the re-insp set is empty.
                if (w.reinsp_itr_ids?.length) {
                    navigate(`/itr?openId=${encodeURIComponent(w.reinsp_itr_ids[0])}`);
                } else if (w.itr_ids?.length) {
                    navigate(`/itr?openId=${encodeURIComponent(w.itr_ids[w.itr_ids.length - 1])}`);
                }
                break;
            case 'ncr':
            case 'moc':
            case 'improvement':
            case 'reinspection':
            case 'close_ncr':
                // NCR-related checkpoints → open the first linked NCR
                if (w.ncr_ids?.length) {
                    navigate(`/ncr?openId=${encodeURIComponent(w.ncr_ids[0])}`);
                } else if (w.noi_id) {
                    // No NCRs — fall back to NOI
                    navigate(`/noi?openId=${encodeURIComponent(w.noi_id)}`);
                }
                break;
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
                        <span className={shellStyles.chipCount}>{stats?.total ?? 0}</span>
                    </button>
                    {COMPLETION_BUCKETS.map(bucket => (
                        <button
                            key={bucket.key}
                            type="button"
                            className={`${shellStyles.chip} ${bucketFilter === bucket.key ? shellStyles.chipActive : ''}`}
                            onClick={() => setBucketFilter(bucket.key)}
                        >
                            {bucketLabel(bucket.key)}
                            <span className={shellStyles.chipCount}>{stats?.[bucket.key] ?? 0}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Checkpoint tracker table */}
            <div className={styles.tableWrapper}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th className={styles.stickyCol}>
                                {t('workflow.col.reference') || 'Q-WorkFlow'}
                            </th>
                            <th className={styles.stickyCol2}>
                                {t('workflow.col.noi') || 'NOI'}
                            </th>
                            {CHECKPOINT_ORDER.map(key => (
                                <th key={key} className={styles.checkpointHead}>
                                    <span className={styles.checkpointHeadLabel}>
                                        {checkpointLabel(key)}
                                    </span>
                                </th>
                            ))}
                            <th className={styles.percentCol}>
                                {t('workflow.col.percent') || '%'}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td
                                    colSpan={CHECKPOINT_ORDER.length + 3}
                                    className={styles.empty}
                                >
                                    {t('common.loading') || 'Loading...'}
                                </td>
                            </tr>
                        )}
                        {!loading && filtered.length === 0 && (
                            <tr>
                                <td
                                    colSpan={CHECKPOINT_ORDER.length + 3}
                                    className={styles.empty}
                                >
                                    {t('workflow.empty') ||
                                        'No NCRs match the current filter.'}
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            filtered.map(w => (
                                <tr
                                    key={w.qworkflow_id}
                                    className={styles.row}
                                    onClick={() => handleRowClick(w)}
                                >
                                    <td
                                        className={`${styles.stickyCol} ${styles.ncrCell}`}
                                    >
                                        {w.reference_no || '—'}
                                    </td>
                                    <td
                                        className={`${styles.stickyCol2} ${styles.subjectCell}`}
                                        title={`${w.noi_reference_no || ''} · ${w.noi_package || ''}`}
                                    >
                                        {w.noi_reference_no || w.noi_package || '—'}
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
                                                title={`${checkpointLabel(cp.key as CheckpointKey)} · ${cp.state}`}
                                                onClick={(e) => handleCheckpointClick(e, w, cp.key as CheckpointKey)}
                                            >
                                                <div
                                                    className={styles.progressMarker}
                                                />
                                            </td>
                                        );
                                    })}
                                    <td className={styles.percentCell}>
                                        {w.completion_percent}%
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default Workflow;
