// Dashboard card for Q-WorkFlow progress monitoring (v3, Q-WorkFlow
// as first-class entity 1:1 with NOI).
//
// Shows three things:
//   1. Total Q-WorkFlow count + 4-bucket completion distribution
//      (0-25 / 26-50 / 51-75 / 76-100 percent) so the user sees where
//      Q-WorkFlows are piling up at a glance
//   2. Top-3 lowest-completion Q-WorkFlows — the "needs attention" list
//   3. A "View all" button that navigates to /workflow
//
// Data comes from the backend WorkflowService (not a Zustand store like
// the other Dashboard cards) because completion is a *computed* value
// that depends on NOI/NCR/ITR field population — pulling into stores
// would duplicate the 9-checkpoint computation on the client. Clicking
// a row deep-links to the paired NOI (/noi?openId=<noi_id>), since a
// Q-WorkFlow has no standalone detail page — the NOI is the root of
// its 9-checkpoint journey.

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import {
    fetchNeedsAttention,
    fetchWorkflowStats,
} from '../../services/workflowService';
import {
    COMPLETION_BUCKETS,
    type CompletionBucket,
    type WorkflowStats,
    type WorkflowSummary,
} from '../../types/workflow';
import { getErrorMessage } from '../../utils/errorUtils';
import styles from './QWorkflowStatsCard.module.css';

const ATTENTION_LIMIT = 3;

const QWorkflowStatsCard: React.FC = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [stats, setStats] = useState<WorkflowStats | null>(null);
    const [attention, setAttention] = useState<WorkflowSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [statsData, attentionData] = await Promise.all([
                    fetchWorkflowStats(),
                    fetchNeedsAttention(ATTENTION_LIMIT),
                ]);
                if (cancelled) return;
                setStats(statsData);
                setAttention(attentionData);
            } catch (err) {
                if (cancelled) return;
                setError(
                    getErrorMessage(err) ||
                        t('workflow.loadError') ||
                        'Failed to load workflow data',
                );
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [t]);

    const bucketLabel = (key: CompletionBucket): string =>
        t(`workflow.bucket.${key}`) || key;

    const bucketPillClass = (key: CompletionBucket): string =>
        `${styles.stagePill} ${styles[key]}`;

    const handleItemClick = (workflow: WorkflowSummary) => {
        // Deep-link to the paired NOI detail modal. NOI.tsx consumes
        // ?openId= on mount and opens the matching detail modal. Guard
        // against orphan Q-WorkFlows (noi_id should always be set, but
        // a backfilled row with a broken FK shouldn't crash the card).
        if (!workflow.noi_id) return;
        navigate(`/noi?openId=${encodeURIComponent(workflow.noi_id)}`);
    };

    return (
        <div className={styles.card}>
            <div className={styles.header}>
                <h3 className={styles.title}>
                    {t('workflow.cardTitle') || 'Q-WorkFlow Progress'}
                </h3>
                {stats && (
                    <span className={styles.totalBadge}>
                        {t('workflow.totalCount', { count: stats.total }) ||
                            `${stats.total} Q-WorkFlows`}
                    </span>
                )}
            </div>

            {loading && (
                <div className={styles.loading}>
                    {t('common.loading') || 'Loading...'}
                </div>
            )}

            {error && !loading && <div className={styles.error}>{error}</div>}

            {!loading && !error && stats && (
                <>
                    <div className={styles.stageRow}>
                        {COMPLETION_BUCKETS.map(bucket => (
                            <div
                                key={bucket.key}
                                className={bucketPillClass(bucket.key)}
                            >
                                <div className={styles.stageCount}>
                                    {stats[bucket.key]}
                                </div>
                                <div className={styles.stageLabel}>
                                    {bucketLabel(bucket.key)}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className={styles.attentionHeader}>
                        <span className={styles.attentionIcon}>⚠</span>
                        {t('workflow.needsAttention') || 'Needs Attention'}
                    </div>

                    {attention.length === 0 ? (
                        <div className={styles.attentionEmpty}>
                            {t('workflow.emptyAttention') ||
                                'No Q-WorkFlows need attention right now'}
                        </div>
                    ) : (
                        <div className={styles.attentionList}>
                            {attention.map(w => {
                                const noiLabel =
                                    w.noi_reference_no || w.noi_package || '';
                                return (
                                    <div
                                        key={w.qworkflow_id}
                                        className={styles.attentionItem}
                                        onClick={() => handleItemClick(w)}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={e => {
                                            if (
                                                e.key === 'Enter' ||
                                                e.key === ' '
                                            ) {
                                                handleItemClick(w);
                                            }
                                        }}
                                    >
                                        <div className={styles.attentionTop}>
                                            <span className={styles.attentionRef}>
                                                {w.reference_no || w.qworkflow_id}
                                            </span>
                                            <span className={styles.attentionDwell}>
                                                {w.completion_percent}%
                                            </span>
                                        </div>
                                        <div className={styles.attentionMeta}>
                                            {noiLabel && (
                                                <span
                                                    className={styles.attentionSubject}
                                                    title={noiLabel}
                                                >
                                                    {noiLabel}
                                                </span>
                                            )}
                                            {w.vendor_name && (
                                                <span>{w.vendor_name}</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            <button
                className={styles.footerButton}
                onClick={() => navigate('/workflow')}
            >
                {t('workflow.viewAll') || 'View All →'}
            </button>
        </div>
    );
};

export default QWorkflowStatsCard;
