import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';

export interface NCRItem {
    id: string;
    vendor: string;
    documentNumber: string;
    description: string;
    rev: string;
    submit: string;
    status: string;
    remark: string;
    hasDetails?: boolean;
    raiseDate?: string;
    closeoutDate?: string;
    aconex?: string;
    type?: string;
    subject?: string;
    foundBy?: string;
    raisedBy?: string;
    foundLocation?: string;
    productDisposition?: string;
    productIntegrityRelated?: string;
    permanentProductDeviation?: string;
    impactToOM?: string;
    defectPhotos?: string[];
    improvementPhotos?: string[];
    noiNumber?: string;
    itrNumber?: string;
    dueDate?: string;
    attachments?: string[];
}

function normalizeItem(item: unknown): NCRItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
    return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as NCRItem;
}

interface NCRState {
    ncrList: NCRItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchNCRs: (params?: FilterParams) => Promise<void>;
    addNCR: (ncr: Omit<NCRItem, 'id'>) => Promise<NCRItem>;
    updateNCR: (id: string, ncr: Partial<NCRItem>) => Promise<void>;
    deleteNCR: (id: string) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useNCRStore = create<NCRState>((set, get) => ({
    ncrList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchNCRs: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/ncr/', { params });
            set({ ncrList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch NCRs', loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchNCRs(params);
    },

    addNCR: async (ncr: Omit<NCRItem, 'id'>) => {
        try {
            const response = await api.post('/ncr/', ncr);
            const newNCR = normalizeItem(response.data);
            set((state) => ({ ncrList: [...state.ncrList, newNCR] }));
            return newNCR;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add NCR';
            set({ error: msg });
            throw error;
        }
    },

    updateNCR: async (id: string, updates: Partial<NCRItem>) => {
        try {
            const response = await api.put(`/ncr/${id}/`, updates);
            const updated = normalizeItem(response.data);
            set((state) => ({ ncrList: state.ncrList.map(n => n.id === id ? updated : n) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update NCR';
            set({ error: msg });
            throw error;
        }
    },

    deleteNCR: async (id: string) => {
        try {
            await api.delete(`/ncr/${id}/`);
            set((state) => ({ ncrList: state.ncrList.filter(n => n.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete NCR';
            set({ error: msg });
            throw error;
        }
    }
}));
