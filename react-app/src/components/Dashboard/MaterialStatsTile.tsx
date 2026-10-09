/**
 * Dashboard tile for the approved-material register (MATERIAL-SUBMITTAL M6): total approved materials and how many were registered
 * this month. Same tile look as the NCR / OBS / NOI key-stats tiles; its own loading / error state, so it never changes the other
 * dashboard figures. Scope = the header project, or — with "All projects" — EVERY project the user can see, counted by the server
 * (R2: no longer added up over the client's project list, which holds only the first page of projects), plus the dashboard's
 * contractor filter. A figure is shown only from a successful answer: loading, failure (with retry) and a real 0 look different.
 * A click opens the material page.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { materialStats } from '../../services/materialApi';
import { useProjectStore } from '../../store/projectStore';
import { useContractorsStore } from '../../store/contractorsStore';
import { useMaterialText } from '../MaterialSubmittal/materialText';
import styles from './Dashboard.module.css';

const firstOfMonth = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

type TileState = { status: 'loading' } | { status: 'error' } | { status: 'ok'; total: number; month: number };

const MaterialStatsTile: React.FC<{ selectedVendor: string; onOpen: () => void; loadingText: string; errorText: string; retryText: string }>
    = ({ selectedVendor, onOpen, loadingText, errorText, retryText }) => {
    const mt = useMaterialText();
    const projectId = useProjectStore((s) => s.currentProject?.id);
    const contractors = useContractorsStore((s) => s.contractors);
    const contractorsError = useContractorsStore((s) => s.error);
    const fetchContractors = useContractorsStore((s) => s.fetchContractors);
    const [token, setToken] = useState(0);
    /** the last answer, with the request it answers; any other request still shows "loading" */
    const [answer, setAnswer] = useState<{ key: string; state: TileState } | null>(null);

    // the dashboard filters contractors by NAME; the material API takes the contractor id. Until the contractor list is known
    // the figure is not computed (never a premature 0).
    const needVendor = selectedVendor !== 'all';
    const vendorReady = !needVendor || contractors.length > 0;
    const vendorId = !needVendor ? undefined : contractors.find((c) => c.name === selectedVendor)?.id ?? '__none__';
    const key = `${projectId ?? '*'}|${vendorId ?? '*'}|${token}`;

    useEffect(() => { if (needVendor && contractors.length === 0) void fetchContractors(); }, [needVendor, contractors.length, fetchContractors, token]);

    useEffect(() => {
        if (!vendorReady) return undefined;
        let alive = true;
        materialStats({ projectId, vendorId, registeredFrom: firstOfMonth() })
            .then((s) => { if (alive) setAnswer({ key, state: { status: 'ok', total: s.total, month: s.registeredSince } }); })
            .catch(() => { if (alive) setAnswer({ key, state: { status: 'error' } }); });
        return () => { alive = false; };
    }, [key, projectId, vendorId, vendorReady]);

    const state: TileState = !vendorReady
        ? (contractorsError ? { status: 'error' } : { status: 'loading' })
        : answer?.key === key ? answer.state : { status: 'loading' };

    const retry = useCallback(() => setToken((n) => n + 1), []);
    return (
        <div className={styles.keyStatsTile} onClick={onOpen} data-testid="dashboard-material-tile" data-state={state.status}>
            <div className={styles.keyStatsTileLabel}>{mt('dashboardTotal')}</div>
            {state.status === 'loading' ? (
                <div role="status" aria-live="polite">
                    <div className={styles.keyStatsTileSkeleton} />
                    <span className={styles.moduleStatusText}>{loadingText}</span>
                </div>
            ) : state.status === 'error' ? (
                <>
                    <div className={styles.moduleStatusErrorText}>{errorText}</div>
                    <button className={styles.moduleStatusRetryButton} data-testid="dashboard-material-retry"
                            onClick={(e) => { e.stopPropagation(); retry(); }}>{retryText}</button>
                </>
            ) : (
                <>
                    <div className={styles.keyStatsTileValue}>{state.total}</div>
                    <div className={styles.keyStatsTileSub}>{mt('dashboardThisMonth', { n: state.month })}</div>
                </>
            )}
        </div>
    );
};

export default MaterialStatsTile;
