import { create } from 'zustand';
import api from '../services/api';
import { FilterParams } from '../types/api';

export interface NOIItem {
    id: string;
    package: string;
    referenceNo: string;
    issueDate: string;
    inspectionTime: string;
    itpNo: string;  // 連結到 ITP referenceNo
    eventNumber?: string;
    checkpoint: string;
    inspectionDate: string;
    type: string;
    contractor: string;
    contacts?: string;
    phone?: string;
    email?: string;
    status: string;
    remark?: string;
    closeoutDate?: string;
    attachments?: string[];
    ncrNumber?: string;  // 若此 NOI 是針對 NCR 的重新檢驗
    dueDate?: string;
}

interface NOIState {
    noiList: NOIItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchNOIs: (params?: FilterParams) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    addNOI: (noi: Omit<NOIItem, 'id'>, id?: string) => Promise<NOIItem>;
    addBulkNOI: (nois: Omit<NOIItem, 'id'>[]) => Promise<NOIItem[]>;
    updateNOI: (id: string, noi: Partial<NOIItem>) => Promise<void>;
    deleteNOI: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useNOIStore = create<NOIState>((set, get) => ({
    noiList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchNOIs: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/noi/', { params });
            set({ noiList: response.data || [], loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch NOIs', loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchNOIs(params);
    },

    addNOI: async (noi: Omit<NOIItem, 'id'>, id?: string) => {
        try {
            const response = await api.post('/noi/', id ? { ...noi, id } : noi);
            const newNOI = response.data;
            set((state) => ({ noiList: [...state.noiList, newNOI] }));
            return newNOI;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add NOI';
            set({ error: msg });
            throw error;
        }
    },

    addBulkNOI: async (nois: Omit<NOIItem, 'id'>[]) => {
        try {
            const response = await api.post('/noi/bulk/', nois);
            const newNOIs = response.data;
            set((state) => ({ noiList: [...state.noiList, ...newNOIs] }));
            return newNOIs;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add bulk NOI';
            set({ error: msg });
            throw error;
        }
    },

    updateNOI: async (id: string, updates: Partial<NOIItem>) => {
        try {
            const response = await api.put(`/noi/${id}/`, updates);
            set((state) => ({ noiList: state.noiList.map(n => n.id === id ? response.data : n) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update NOI';
            set({ error: msg });
            throw error;
        }
    },

    deleteNOI: async (id: string) => {
        try {
            await api.delete(`/noi/${id}/`);
            set((state) => ({ noiList: state.noiList.filter(n => n.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete NOI';
            set({ error: msg });
            throw error;
        }
    }
}));
