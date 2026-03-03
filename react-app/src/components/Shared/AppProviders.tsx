import React, { ReactNode, useEffect } from 'react';
import ErrorBoundary from './ErrorBoundary';
import { useContractorsStore } from '../../store/contractorsStore';

interface AppProvidersProps {
    children: ReactNode;
}

// NOTE: 所有 Context Provider 已遷移至 Zustand Store
// 僅保留 ErrorBoundary 作為全域錯誤邊界，並處理全域基礎資料載入
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
    
    // Fetch base data needed across multiple modules when logging in / opening the app
    useEffect(() => {
        useContractorsStore.getState().fetchContractors();
    }, []);

    return (
        <ErrorBoundary>
            {children}
        </ErrorBoundary>
    );
};
