import React, { ReactNode, useEffect } from 'react';
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

interface AppProvidersProps {
    children: ReactNode;
}

// NOTE: 所有 Context Provider 已遷移至 Zustand Store
// 僅保留 ErrorBoundary 作為全域錯誤邊界，並處理全域基礎資料載入
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
    // Preload base datasets once to avoid empty Dashboard metrics on first entry.
    useEffect(() => {
        const preload = async () => {
            await Promise.allSettled([
                useContractorsStore.getState().fetchContractors(),
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
        void preload();
    }, []);

    return (
        <ErrorBoundary>
            {children}
        </ErrorBoundary>
    );
};
