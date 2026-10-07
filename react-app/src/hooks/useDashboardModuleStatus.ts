import { useMemo, useRef } from 'react';
import { useITPStore } from '../store/itpStore';
import { usePQPStore } from '../store/pqpStore';
import { useNCRStore } from '../store/ncrStore';
import { useOBSStore } from '../store/obsStore';
import { useNOIStore } from '../store/noiStore';
import { useChecklistStore } from '../store/checklistStore';
import { useProjectStore } from '../store/projectStore';

// Every module store already exposes { loading, error, xxxList } (unchanged — this file adds no
// new store state). This just turns that existing shape into one explicit status per module, so
// every place that renders a "current total" or a trend can tell these four situations apart
// instead of inferring everything from `list.length === 0`:
//
//   'loading'      — no CONFIRMED-for-the-current-scope data yet: a first load, or a project scope
//                    switch whose new fetch hasn't landed (or, briefly, hasn't even STARTED — see
//                    `sawLoadingForScope` below) yet.
//   'error-empty'  — the fetch failed and there is nothing usable for the CURRENT scope to show.
//   'error-stale'  — the fetch failed but a previous SUCCESSFUL fetch for this SAME scope is still
//                    held; the caller should keep showing that data and flag it as not current.
//   'ok'           — no error; list.length may legitimately be 0 (a real "no records"), now
//                    distinguishable from both loading and error-empty.
export type ModuleStatus = 'loading' | 'error-empty' | 'error-stale' | 'ok';

const MODULES = ['itp', 'pqp', 'ncr', 'obs', 'noi', 'checklist'] as const;
type ModuleKey = typeof MODULES[number];

export interface ModuleStatusEntry {
    status: ModuleStatus;
    retry: () => void;
}

// The actual per-module decision, pulled out as a pure function so it has a home independent of
// React/zustand: unit-tested directly in tests-unit/dashboardModuleStatus.test.ts, including the
// 'error-stale' branch, which the CURRENT Dashboard UI has no manual "refresh a healthy module"
// affordance to reach live (a browser scenario for it would have to fake one) — this is the
// authoritative check for that branch instead. `useDashboardModuleStatus` below is a thin React
// wrapper: it tracks `sawLoadingForScope`/`confirmedScope` in refs and calls this each render.
export const deriveModuleStatus = (
    loading: boolean,
    error: string | null,
    hasData: boolean,
    sawLoadingThisScope: boolean,
    confirmedThisScope: boolean,
): ModuleStatus => {
    if (loading) return 'loading';
    if (!sawLoadingThisScope && !confirmedThisScope) {
        // This scope's fetch hasn't even started yet as far as the caller has observed — do not
        // trust loading/error/hasData, which still describe whatever scope was active before.
        return 'loading';
    }
    if (error) return (hasData && confirmedThisScope) ? 'error-stale' : 'error-empty';
    return 'ok';
};

export const useDashboardModuleStatus = () => {
    // Primitive selectors only — NOT `s => ({...})` object literals. A zustand selector that
    // returns a fresh object every call has no stable identity for the store to compare against,
    // so the component re-subscribes/re-renders on every store tick regardless of whether the
    // actual values changed; combined with the scope-confirmation ref writes below, an earlier
    // version of this file built that way produced a real render loop ("Maximum update depth
    // exceeded", caught live while verifying this batch — see the handoff).
    const itpLoading = useITPStore(s => s.loading), itpError = useITPStore(s => s.error), itpHasData = useITPStore(s => s.itpList.length > 0);
    const pqpLoading = usePQPStore(s => s.loading), pqpError = usePQPStore(s => s.error), pqpHasData = usePQPStore(s => s.pqpList.length > 0);
    const ncrLoading = useNCRStore(s => s.loading), ncrError = useNCRStore(s => s.error), ncrHasData = useNCRStore(s => s.ncrList.length > 0);
    const obsLoading = useOBSStore(s => s.loading), obsError = useOBSStore(s => s.error), obsHasData = useOBSStore(s => s.obsList.length > 0);
    const noiLoading = useNOIStore(s => s.loading), noiError = useNOIStore(s => s.error), noiHasData = useNOIStore(s => s.noiList.length > 0);
    const checklistLoading = useChecklistStore(s => s.loading), checklistError = useChecklistStore(s => s.error), checklistHasData = useChecklistStore(s => s.records.length > 0);

    const fetchITPs = useITPStore(s => s.fetchITPs);
    const fetchPQPs = usePQPStore(s => s.fetchPQPs);
    const fetchNCRs = useNCRStore(s => s.fetchNCRs);
    const fetchOBSs = useOBSStore(s => s.fetchOBSs);
    const fetchNOIs = useNOIStore(s => s.fetchNOIs);
    const fetchRecords = useChecklistStore(s => s.fetchRecords);

    // A raw string, not a store-derived boolean: only used to tell "the scope the currently-held
    // list was confirmed good for" from "the scope we're in now". The actual re-fetch on a
    // project change is still entirely AppProviders.tsx's existing effect; this never calls fetch
    // on its own except via the caller-triggered `retry()`.
    const currentScopeId = useProjectStore(s => s.currentProject?.id ?? '__all__');

    // Per module: the scope id for which we last observed a clean, error-free load (`ok`).
    const confirmedScope = useRef<Record<ModuleKey, string | null>>({
        itp: null, pqp: null, ncr: null, obs: null, noi: null, checklist: null,
    });
    // Per module: the scope id for which we have observed `loading === true` at least once. This
    // closes a real race caught while verifying this batch: `currentProject` changes (and this
    // hook's `currentScopeId` with it) in the SAME render/commit that AppProviders.tsx's effect is
    // merely SCHEDULED, not yet run — for that one render, the store's `loading`/`error` still
    // reflect the OLD scope's already-finished fetch (loading:false, error:null, list still
    // holding the old scope's data). Without this guard, that render reads as a clean 'ok' for
    // the NEW scope and locks in `confirmedScope` against data that was never actually fetched
    // for it — so a subsequent real failure for the new scope would wrongly show the OLD scope's
    // numbers flagged merely as "stale" instead of correctly as "could not load". A scope only
    // becomes eligible to be marked `confirmedScope` once we have positively seen `loading` flip
    // true for it (proving AppProviders' effect actually started a fetch for THIS scope).
    const sawLoadingForScope = useRef<Record<ModuleKey, string | null>>({
        itp: null, pqp: null, ncr: null, obs: null, noi: null, checklist: null,
    });

    const raw: Record<ModuleKey, { loading: boolean; error: string | null; hasData: boolean; retry: () => Promise<void> }> = {
        itp: { loading: itpLoading, error: itpError, hasData: itpHasData, retry: fetchITPs },
        pqp: { loading: pqpLoading, error: pqpError, hasData: pqpHasData, retry: fetchPQPs },
        ncr: { loading: ncrLoading, error: ncrError, hasData: ncrHasData, retry: fetchNCRs },
        obs: { loading: obsLoading, error: obsError, hasData: obsHasData, retry: fetchOBSs },
        noi: { loading: noiLoading, error: noiError, hasData: noiHasData, retry: fetchNOIs },
        checklist: { loading: checklistLoading, error: checklistError, hasData: checklistHasData, retry: fetchRecords },
    };

    return useMemo<Record<ModuleKey, ModuleStatusEntry>>(() => {
        const result = {} as Record<ModuleKey, ModuleStatusEntry>;
        for (const key of MODULES) {
            const { loading, error, hasData, retry } = raw[key];
            if (loading) sawLoadingForScope.current[key] = currentScopeId;
            const status = deriveModuleStatus(
                loading, error, hasData,
                sawLoadingForScope.current[key] === currentScopeId,
                confirmedScope.current[key] === currentScopeId,
            );
            if (status === 'ok') confirmedScope.current[key] = currentScopeId;
            result[key] = { status, retry: () => { void retry(); } };
        }
        return result;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        itpLoading, itpError, itpHasData, fetchITPs,
        pqpLoading, pqpError, pqpHasData, fetchPQPs,
        ncrLoading, ncrError, ncrHasData, fetchNCRs,
        obsLoading, obsError, obsHasData, fetchOBSs,
        noiLoading, noiError, noiHasData, fetchNOIs,
        checklistLoading, checklistError, checklistHasData, fetchRecords,
        currentScopeId,
    ]);
};
