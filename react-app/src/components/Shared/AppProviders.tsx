import React, { ReactNode, useEffect, useRef } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { useContractorsStore } from '../../store/contractorsStore';
import { useITPStore } from '../../store/itpStore';
import { useNCRStore } from '../../store/ncrStore';
import { useNOIStore } from '../../store/noiStore';
import { useITRStore } from '../../store/itrStore';
import { usePQPStore } from '../../store/pqpStore';
import { useOBSStore } from '../../store/obsStore';
import { useChecklistStore } from '../../store/checklistStore';
import { useFollowUpStore } from '../../store/followUpStore';
import { useProjectStore } from '../../store/projectStore';
import { useOSDStore } from '../../store/osdStore';
import { useFATStore } from '../../store/fatStore';
import { useMeetingMinutesStore } from '../../store/meetingMinutesStore';

interface AppProvidersProps {
    children: ReactNode;
}

const preloadProjectScopedData = async () => {
    await Promise.allSettled([
        useITPStore.getState().fetchITPs(),
        useNCRStore.getState().fetchNCRs(),
        useNOIStore.getState().fetchNOIs(),
        useITRStore.getState().fetchITRs(),
        usePQPStore.getState().fetchPQPs(),
        useOBSStore.getState().fetchOBSs(),
        useChecklistStore.getState().fetchRecords(),
        useFollowUpStore.getState().fetchFollowUps(),
    ]);
};

// NOTE: 所有 Context Provider 已遷移至 Zustand Store
// 僅保留 ErrorBoundary 作為全域錯誤邊界，並處理全域基礎資料載入
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
    const currentProject = useProjectStore(s => s.currentProject);
    const initialLoadDone = useRef(false);

    // Preload base datasets, and re-fetch project-scoped data when project changes.
    useEffect(() => {
        const preload = async () => {
            await Promise.allSettled([
                // picker list for every module (any signed-in user); the full list is loaded by the Contractors page
                useContractorsStore.getState().fetchOptions(),
                useProjectStore.getState().fetchProjects(),
            ]);
            await preloadProjectScopedData();
            initialLoadDone.current = true;
        };
        void preload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-fetch all project-scoped stores when the selected project changes (skip initial mount). OSD, FAT and Meeting
    // Minutes are loaded by their own pages, so they only need re-fetching here — without it an admin switching
    // project on one of those pages kept seeing the previous project's list (REF-PROJECT-SEQ-2026-001 B1, G3).
    useEffect(() => {
        if (!initialLoadDone.current) return;
        void preloadProjectScopedData();
        void Promise.allSettled([
            useOSDStore.getState().refetch(),
            useFATStore.getState().refetch(),
            useMeetingMinutesStore.getState().refetch(),
        ]);
    }, [currentProject]);

    // An admin's project choice is kept in this browser: drop it if that project is no longer one they can see.
    const projectList = useProjectStore(s => s.projectList);
    useEffect(() => {
        const { currentProject: chosen, setCurrentProject } = useProjectStore.getState();
        if (chosen && projectList.length > 0 && !projectList.some(p => p.id === chosen.id)) setCurrentProject(null);
    }, [projectList]);

    return (
        <ErrorBoundary>
            {children}
        </ErrorBoundary>
    );
};
