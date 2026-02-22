import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useAuth } from './AuthContext';

export interface FATItem {
    id: string;
    equipment: string;
    supplier: string;
    procedure: string;
    location: string;
    startDate: string;
    endDate: string;
    deliveryFrom: string;
    deliveryTo: string;
    siteReadiness: string;
    moveInDate: string;
    hasDetails?: boolean;
}

export interface FATDetailItem {
    id: string;
    sNo: string;
    itemName: string;
    specification: string;
    qty: string;
    unit: string;
    acceptanceCriteria: string;
    fatActualValue: string;
    fatJudgment: string;
    remarks: string;
}

interface FATContextType {
    fatList: FATItem[];
    fatDetails: { [key: string]: FATDetailItem[] };
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
    addFAT: (fat: Omit<FATItem, 'id'>) => Promise<FATItem>;
    updateFAT: (id: string, fat: Partial<FATItem>) => Promise<void>;
    deleteFAT: (id: string) => Promise<void>;
    saveFATDetails: (fatId: string, details: FATDetailItem[]) => Promise<void>;
}

// 移除 Mock 資料與 localStorage 邏輯
const FATContext = createContext<FATContextType | undefined>(undefined);

export const FATProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [fatList, setFatList] = useState<FATItem[]>([]);
    const [fatDetails, setFatDetails] = useState<{ [key: string]: FATDetailItem[] }>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { handleError } = useErrorHandler();

    const fetchFATs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get('/fat/');
            const list = response.data;
            setFatList(list);

            // 從後端回應中解析 detail_data 並填入 fatDetails
            const detailsMap: { [key: string]: FATDetailItem[] } = {};
            list.forEach((item: any) => {
                if (item.detail_data) {
                    detailsMap[item.id] = item.detail_data;
                }
            });
            setFatDetails(detailsMap);
        } catch (err: unknown) {
            handleError(err, 'Failed to fetch FAT list');
            setError('Failed to fetch FAT list');
        } finally {
            setLoading(false);
        }
    }, [handleError]);

    const { isAuthenticated } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            fetchFATs();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated]);

    const addFAT = useCallback(async (fat: Omit<FATItem, 'id'>): Promise<FATItem> => {
        try {
            const response = await api.post('/fat/', fat);
            const newFAT = response.data;
            setFatList(prev => [...prev, newFAT]);
            return newFAT;
        } catch (err: unknown) {
            handleError(err, 'Failed to add FAT');
            throw err;
        }
    }, [handleError]);

    const updateFAT = useCallback(async (id: string, updates: Partial<FATItem>) => {
        try {
            const response = await api.put(`/fat/${id}/`, updates);
            setFatList(prev => prev.map(f => (f.id === id ? response.data : f)));
        } catch (err: unknown) {
            handleError(err, 'Failed to update FAT');
            throw err;
        }
    }, [handleError]);

    const deleteFAT = useCallback(async (id: string) => {
        try {
            await api.delete(`/fat/${id}/`);
            setFatList(prev => prev.filter(f => f.id !== id));
            setFatDetails(prev => {
                const newDetails = { ...prev };
                delete newDetails[id];
                return newDetails;
            });
        } catch (err: unknown) {
            handleError(err, 'Failed to delete FAT');
            throw err;
        }
    }, [handleError]);

    const saveFATDetails = useCallback(async (fatId: string, details: FATDetailItem[]) => {
        try {
            const response = await api.put(`/fat/${fatId}/details/`, details); // 注意：後端 API 接收 list body
            setFatDetails(prev => ({ ...prev, [fatId]: details }));
            // 更新 list 中的 hasDetails 狀態 (後端應該會回傳更新後的 FAT 物件)
            setFatList(prev => prev.map(f =>
                f.id === fatId ? { ...f, hasDetails: details.length > 0 } : f
            ));
        } catch (err: unknown) {
            handleError(err, 'Failed to save FAT details');
            throw err;
        }
    }, [handleError]);

    const value = useMemo(
        () => ({ fatList, fatDetails, loading, error, refetch: fetchFATs, addFAT, updateFAT, deleteFAT, saveFATDetails }),
        [fatList, fatDetails, loading, error, fetchFATs, addFAT, updateFAT, deleteFAT, saveFATDetails]
    );

    return (
        <FATContext.Provider value={value}>
            {children}
        </FATContext.Provider>
    );
};

export const useFAT = () => {
    const context = useContext(FATContext);
    if (context === undefined) {
        throw new Error('useFAT must be used within a FATProvider');
    }
    return context;
};
