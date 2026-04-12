/**
 * <RelatedDocuments /> — shared panel that shows the upstream/downstream
 * documents linked to an ITP / NOI / ITR / NCR via the existing FK graph
 * (`backend/workflows/relationships.py`). Mounted at the bottom of each
 * module's detail modal so users can jump across the chain without
 * re-querying other tables manually.
 *
 * Phase 1 PR1 of the cross-module workflow initiative — see
 * docs/workflow/phase1-pr1-related-documents.md for the plan and the
 * locked-down design decisions (max_depth = 2, no cache, navigate-on-click
 * as the default with an `onOpen` escape hatch).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { fetchRelated } from '../../services/relatedService';
import type {
    RelatedEntity,
    RelatedEntityType,
    RelatedEntitiesResponse,
} from '../../types/related';
import styles from './RelatedDocuments.module.css';

export interface RelatedDocumentsProps {
    entityType: RelatedEntityType;
    entityId: string | null | undefined;
    /**
     * Override click-through behaviour. Default: navigate to the matching
     * module page (the host modal should close itself on unmount).
     */
    onOpen?: (entityType: RelatedEntityType, entityId: string) => void;
    /** Max BFS depth — defaults to 2 (see PR1 plan, Q1). */
    maxDepth?: number;
}

const ENTITY_TYPE_LABELS: Record<RelatedEntityType, string> = {
    itp: 'ITP',
    noi: 'NOI',
    itr: 'ITR',
    ncr: 'NCR',
};

const ENTITY_BADGE_CLASS: Record<RelatedEntityType, string> = {
    itp: styles.badgeItp,
    noi: styles.badgeNoi,
    itr: styles.badgeItr,
    ncr: styles.badgeNcr,
};

// Map each entity type to its list route. Kept here rather than in a
// shared routing helper because this is the only place that needs it.
const ENTITY_ROUTE: Record<RelatedEntityType, string> = {
    itp: '/itp',
    noi: '/noi',
    itr: '/itr',
    ncr: '/ncr',
};

export const RelatedDocuments: React.FC<RelatedDocumentsProps> = ({
    entityType,
    entityId,
    onOpen,
    maxDepth = 2,
}) => {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [data, setData] = useState<RelatedEntitiesResponse>({
        upstream: [],
        downstream: [],
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!entityId) {
            setData({ upstream: [], downstream: [] });
            return;
        }
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchRelated(entityType, entityId, maxDepth)
            .then((res) => {
                if (cancelled) return;
                setData(res);
            })
            .catch((err) => {
                if (cancelled) return;
                console.error('fetchRelated failed', err);
                setError(t('related.error') || 'Failed to load related documents.');
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [entityType, entityId, maxDepth, t]);

    const handleOpen = useCallback(
        (target: RelatedEntity) => {
            if (onOpen) {
                onOpen(target.entityType, target.id);
                return;
            }
            navigate(ENTITY_ROUTE[target.entityType]);
        },
        [onOpen, navigate],
    );

    // Don't render at all when there's no source id (e.g. "create" modals
    // before save). There's nothing meaningful to show and rendering an
    // empty panel would just clutter the form.
    if (!entityId) return null;

    const isEmpty =
        !loading && !error && data.upstream.length === 0 && data.downstream.length === 0;

    return (
        <div className={styles.wrapper}>
            <h3 className={styles.title}>{t('related.title') || 'Related Documents'}</h3>

            {loading && (
                <div className={styles.loading}>
                    {t('common.loading') || 'Loading...'}
                </div>
            )}

            {error && <div className={styles.errorMsg}>{error}</div>}

            {isEmpty && (
                <div className={styles.empty}>
                    {t('related.empty') || 'No related documents yet.'}
                </div>
            )}

            {!loading && !error && data.upstream.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionArrow}>▲</span>
                        {t('related.upstream') || 'Upstream'}
                        <span>({data.upstream.length})</span>
                    </div>
                    <RelatedList entries={data.upstream} onOpen={handleOpen} />
                </div>
            )}

            {!loading && !error && data.downstream.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <span className={styles.sectionArrow}>▼</span>
                        {t('related.downstream') || 'Downstream'}
                        <span>({data.downstream.length})</span>
                    </div>
                    <RelatedList entries={data.downstream} onOpen={handleOpen} />
                </div>
            )}
        </div>
    );
};

interface RelatedListProps {
    entries: RelatedEntity[];
    onOpen: (target: RelatedEntity) => void;
}

const RelatedList: React.FC<RelatedListProps> = ({ entries, onOpen }) => (
    <div className={styles.list}>
        {entries.map((entry) => (
            <button
                type="button"
                key={`${entry.entityType}:${entry.id}`}
                className={styles.item}
                onClick={() => onOpen(entry)}
            >
                <span className={`${styles.badge} ${ENTITY_BADGE_CLASS[entry.entityType]}`}>
                    {ENTITY_TYPE_LABELS[entry.entityType]}
                </span>
                <div className={styles.body}>
                    <div className={styles.refLine}>
                        {entry.referenceNo || '—'}
                    </div>
                    {entry.title && (
                        <div className={styles.titleLine}>{entry.title}</div>
                    )}
                </div>
                <div className={styles.meta}>
                    {entry.status && (
                        <>
                            <span className={styles.statusDot} />
                            <span>{entry.status}</span>
                        </>
                    )}
                    {entry.primaryDate && <span>· {entry.primaryDate}</span>}
                </div>
            </button>
        ))}
    </div>
);

export default RelatedDocuments;
