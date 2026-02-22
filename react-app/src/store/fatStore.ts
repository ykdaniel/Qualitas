import { create } from 'zustand';
import api from '../services/api';

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

interface FATState {
    fatList: FATItem[];
    fatDetails: { [key: string]: FATDetailItem[] };
    loading: boolean;
    error: string | null;

    // Actions
    fetchFATs: () => Promise<void>;
    refetch: () => Promise<void>;
    addFAT: (fat: Omit<FATItem, 'id'>) => Promise<FATItem>;
    updateFAT: (id: string, fat: Partial<FATItem>) => Promise<void>;
    deleteFAT: (id: string) => Promise<void>;
    saveFATDetails: (fatId: string, details: FATDetailItem[]) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useFATStore = create<FATState>((set, get) => ({
    fatList: [],
    fatDetails: {},
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchFATs: async () => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/fat/');
            const list = response.data || [];
            // NOTE: 從後端回應中解析 detail_data 並填入 fatDetails
            const detailsMap: { [key: string]: FATDetailItem[] } = {};
            list.forEach((item: any) => {
                if (item.detail_data) {
                    detailsMap[item.id] = item.detail_data;
                }
            });
            set({ fatList: list, fatDetails: detailsMap, loading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.detail || err.message || 'Failed to fetch FAT list',
                loading: false,
            });
        }
    },

    refetch: async () => {
        await get().fetchFATs();
    },

    addFAT: async (fat) => {
        try {
            const response = await api.post('/fat/', fat);
            const newFAT = response.data;
            set((state) => ({ fatList: [...state.fatList, newFAT] }));
            return newFAT;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add FAT';
            set({ error: msg });
            throw error;
        }
    },

    updateFAT: async (id, updates) => {
        try {
            const response = await api.put(`/fat/${id}/`, updates);
            set((state) => ({
                fatList: state.fatList.map(f => (f.id === id ? response.data : f)),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update FAT';
            set({ error: msg });
            throw error;
        }
    },

    deleteFAT: async (id) => {
        try {
            await api.delete(`/fat/${id}/`);
            set((state) => ({
                fatList: state.fatList.filter(f => f.id !== id),
                fatDetails: Object.fromEntries(
                    Object.entries(state.fatDetails).filter(([key]) => key !== id)
                ),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete FAT';
            set({ error: msg });
            throw error;
        }
    },

    saveFATDetails: async (fatId, details) => {
        try {
            await api.put(`/fat/${fatId}/details/`, details);
            set((state) => ({
                fatDetails: { ...state.fatDetails, [fatId]: details },
                fatList: state.fatList.map(f =>
                    f.id === fatId ? { ...f, hasDetails: details.length > 0 } : f
                ),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to save FAT details';
            set({ error: msg });
            throw error;
        }
    },
}));
