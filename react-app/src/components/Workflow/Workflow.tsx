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
import { useLanguage } from '../../context/LanguageContext';
import { BackButton } from '@/components/ui/BackButton';
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
                // Re-inspection ITR — for now open the first ITR; ideally
                // backend would return the specific re-inspection ITR id.
                if (w.itr_ids?.length) {
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

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <BackButton />
                    <h1 className={styles.title}>
                        {t('workflow.title') || 'Q-WorkFlow'}
                    </h1>
                </div>
            </div>
            <p className={styles.subtitle}>
                {t('workflow.subtitle') ||
                    'Every NOI becomes a Q-WorkFlow, tracked through 9 canonical checkpoints to final acceptance.'}
            </p>

            {error && <div className={styles.error}>{error}</div>}

            {/* Completion distribution tiles */}
            {stats && (
                <div className={styles.statRow}>
                    <div className={`${styles.statTile} ${styles.total}`}>
                        <div className={styles.statLabel}>
                            {t('workflow.total') || 'Total NCRs'}
                        </div>
                        <div className={styles.statValue}>{stats.total}</div>
                    </div>
                    {COMPLETION_BUCKETS.map(bucket => (
                        <div
                            key={bucket.key}
                            className={`${styles.statTile} ${styles[bucket.key]}`}
                        >
                            <div className={styles.statLabel}>
                                {bucketLabel(bucket.key)}
                            </div>
                            <div className={styles.statValue}>
                                {stats[bucket.key]}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter chips */}
            <div className={styles.chipBar}>
                <button
                    className={`${styles.chip} ${bucketFilter === 'all' ? styles.active : ''}`}
                    onClick={() => setBucketFilter('all')}
                >
                    {t('workflow.filterAll') || 'All'}
                </button>
                {COMPLETION_BUCKETS.map(bucket => (
                    <button
                        key={bucket.key}
                        className={`${styles.chip} ${bucketFilter === bucket.key ? styles.active : ''}`}
                        onClick={() => setBucketFilter(bucket.key)}
                    >
                        {bucketLabel(bucket.key)}
                    </button>
                ))}
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
