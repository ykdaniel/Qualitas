import React, { ReactNode } from 'react';
import ErrorBoundary from './ErrorBoundary';

interface AppProvidersProps {
    children: ReactNode;
}

// NOTE: 所有 Context Provider 已遷移至 Zustand Store
// 僅保留 ErrorBoundary 作為全域錯誤邊界
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
    return (
        <ErrorBoundary>
            {children}
        </ErrorBoundary>
    );
};
