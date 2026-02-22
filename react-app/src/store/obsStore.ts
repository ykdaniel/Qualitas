import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';

export interface OBSItem {
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
    attachments?: string[];
    noiNumber?: string;
    itrNumber?: string;
}

function normalizeItem(item: unknown): OBSItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
    return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as OBSItem;
}

interface OBSState {
    obsList: OBSItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchOBSs: (params?: FilterParams) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    addOBS: (obs: Omit<OBSItem, 'id'>) => Promise<OBSItem>;
    updateOBS: (id: string, obs: Partial<OBSItem>) => Promise<void>;
    deleteOBS: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useOBSStore = create<OBSState>((set, get) => ({
    obsList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchOBSs: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/obs/', { params });
            set({ obsList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch OBSs', loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchOBSs(params);
    },

    addOBS: async (obs: Omit<OBSItem, 'id'>) => {
        try {
            const response = await api.post('/obs/', obs);
            const newOBS = normalizeItem(response.data);
            set((state) => ({ obsList: [...state.obsList, newOBS] }));
            return newOBS;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add OBS';
            set({ error: msg });
            throw error;
        }
    },

    updateOBS: async (id: string, updates: Partial<OBSItem>) => {
        try {
            const response = await api.put(`/obs/${id}/`, updates);
            const updated = normalizeItem(response.data);
            set((state) => ({ obsList: state.obsList.map(o => o.id === id ? updated : o) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update OBS';
            set({ error: msg });
            throw error;
        }
    },

    deleteOBS: async (id: string) => {
        try {
            await api.delete(`/obs/${id}/`);
            set((state) => ({ obsList: state.obsList.filter(o => o.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete OBS';
            set({ error: msg });
            throw error;
        }
    }
}));
