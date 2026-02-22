import React, { createContext, useContext, useState, useMemo, useEffect, useCallback, ReactNode } from 'react';
import api from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';

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

const FATContext = createContext<FATContextType | undefined>(undefined);

const STORAGE_KEY_LIST = 'qualitas_fat_list';
const STORAGE_KEY_DETAILS = 'qualitas_fat_details';

const defaultFatList: FATItem[] = [{
    id: '1',
    equipment: 'Equipment A',
    supplier: '廠商A',
    procedure: 'Procedure 1',
    location: 'Location A',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    deliveryFrom: 'Factory A',
    deliveryTo: 'Site A',
    siteReadiness: 'Ready',
    moveInDate: '2026-02-01',
    hasDetails: true,
}];

const defaultFatDetails: { [key: string]: FATDetailItem[] } = {
    '1': [{
        id: '1-1',
        sNo: '1',
        itemName: 'Item 1',
        specification: 'Spec 1',
        qty: '10',
        unit: 'pcs',
        acceptanceCriteria: 'Standard A',
        fatActualValue: '9.8',
        fatJudgment: 'Pass',
        remarks: 'Test passed',
    }],
};

const loadListFromStorage = (): FATItem[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_LIST);
        if (raw) {
            const parsed = JSON.parse(raw) as FATItem[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (_) { }
    return defaultFatList;
};

const loadDetailsFromStorage = (): { [key: string]: FATDetailItem[] } => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_DETAILS);
        if (raw) {
            const parsed = JSON.parse(raw) as { [key: string]: FATDetailItem[] };
            if (parsed && typeof parsed === 'object') return parsed;
        }
    } catch (_) { }
    return defaultFatDetails;
};

const saveListToStorage = (list: FATItem[]) => {
    try {
        localStorage.setItem(STORAGE_KEY_LIST, JSON.stringify(list));
    } catch (_) { }
};

const saveDetailsToStorage = (details: { [key: string]: FATDetailItem[] }) => {
    try {
        localStorage.setItem(STORAGE_KEY_DETAILS, JSON.stringify(details));
    } catch (_) { }
};

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
            setFatList(response.data || []);
            // 嘗試載入詳細資料
            try {
                const detailsResponse = await api.get('/fat/details/');
                setFatDetails(detailsResponse.data || {});
            } catch (_) {
                setFatDetails(loadDetailsFromStorage());
            }
        } catch (err: unknown) {
            // API 不存在時使用 localStorage 備援
            setFatList(loadListFromStorage());
            setFatDetails(loadDetailsFromStorage());
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchFATs();
    }, [fetchFATs]);

    // 同步到 localStorage
    useEffect(() => {
        if (!loading && fatList.length > 0) {
            saveListToStorage(fatList);
        }
    }, [fatList, loading]);

    useEffect(() => {
        if (!loading && Object.keys(fatDetails).length > 0) {
            saveDetailsToStorage(fatDetails);
        }
    }, [fatDetails, loading]);

    const addFAT = useCallback(async (fat: Omit<FATItem, 'id'>): Promise<FATItem> => {
        try {
            const response = await api.post('/fat/', fat);
            const newFAT = response.data;
            setFatList(prev => [...prev, newFAT]);
            return newFAT;
        } catch (err: unknown) {
            const newFAT: FATItem = {
                ...fat,
                id: String(Date.now()),
            };
            setFatList(prev => [...prev, newFAT]);
            setFatDetails(prev => ({ ...prev, [newFAT.id]: [] }));
            return newFAT;
        }
    }, []);

    const updateFAT = useCallback(async (id: string, updates: Partial<FATItem>) => {
        try {
            const response = await api.put(`/fat/${id}`, updates);
            setFatList(prev => prev.map(f => (f.id === id ? response.data : f)));
        } catch (err: unknown) {
            setFatList(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
        }
    }, []);

    const deleteFAT = useCallback(async (id: string) => {
        try {
            await api.delete(`/fat/${id}`);
            setFatList(prev => prev.filter(f => f.id !== id));
            setFatDetails(prev => {
                const newDetails = { ...prev };
                delete newDetails[id];
                return newDetails;
            });
        } catch (err: unknown) {
            setFatList(prev => prev.filter(f => f.id !== id));
            setFatDetails(prev => {
                const newDetails = { ...prev };
                delete newDetails[id];
                return newDetails;
            });
        }
    }, []);

    const saveFATDetails = useCallback(async (fatId: string, details: FATDetailItem[]) => {
        try {
            await api.put(`/fat/${fatId}/details`, details);
            setFatDetails(prev => ({ ...prev, [fatId]: details }));
            setFatList(prev => prev.map(f =>
                f.id === fatId ? { ...f, hasDetails: details.length > 0 } : f
            ));
        } catch (err: unknown) {
            // API 失敗時使用本地更新
            setFatDetails(prev => ({ ...prev, [fatId]: details }));
            setFatList(prev => prev.map(f =>
                f.id === fatId ? { ...f, hasDetails: details.length > 0 } : f
            ));
        }
    }, []);

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
