import { create } from 'zustand';
import api from '../services/api';
import { FilterParams } from '../types/api';

export interface PQPItem {
    id: string;
    pqpNo: string;
    title: string;
    description: string;
    vendor: string;
    status: string;
    version: string;
    createdAt: string;
    updatedAt: string;
    attachments?: string[];
    dueDate?: string;
}

interface PQPState {
    pqpList: PQPItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchPQPs: (params?: FilterParams) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    addPQP: (pqp: Omit<PQPItem, 'id'>) => Promise<PQPItem>;
    updatePQP: (id: string, pqp: Partial<PQPItem>) => Promise<void>;
    deletePQP: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;

    // Getters
    getPQPList: () => PQPItem[];
    getPQPByVendor: (vendor: string) => PQPItem[];
}

export const usePQPStore = create<PQPState>((set, get) => ({
    pqpList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchPQPs: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/pqp/', { params });
            set({ pqpList: response.data || [], loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch PQPs', loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchPQPs(params);
    },

    addPQP: async (pqp: Omit<PQPItem, 'id'>) => {
        try {
            const response = await api.post('/pqp/', pqp);
            const newPQP = response.data;
            set((state) => ({ pqpList: [...state.pqpList, newPQP] }));
            return newPQP;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add PQP';
            set({ error: msg });
            throw error;
        }
    },

    updatePQP: async (id: string, updates: Partial<PQPItem>) => {
        try {
            const response = await api.put(`/pqp/${id}/`, updates);
            set((state) => ({ pqpList: state.pqpList.map(p => (p.id === id ? response.data : p)) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update PQP';
            set({ error: msg });
            throw error;
        }
    },

    deletePQP: async (id: string) => {
        try {
            await api.delete(`/pqp/${id}/`);
            set((state) => ({ pqpList: state.pqpList.filter(p => p.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete PQP';
            set({ error: msg });
            throw error;
        }
    },

    getPQPList: () => get().pqpList,
    getPQPByVendor: (vendor: string) => get().pqpList.filter(pqp => pqp.vendor === vendor),
}));
