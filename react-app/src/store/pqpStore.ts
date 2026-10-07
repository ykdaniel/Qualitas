import { create } from 'zustand';
import api from '../services/api';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

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

export interface PQPHistoryItem {
    id: string;
    pqp_id: string;
    version: string;
    version_no: number;
    title: string | null;
    description: string | null;
    status: string | null;
    change_summary: string | null;
    created_at: string;
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
    publishPQP: (id: string, changeSummary?: string) => Promise<PQPItem>;
    getHistory: (id: string) => Promise<PQPHistoryItem[]>;
    deletePQP: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;

    // Getters
    getPQPList: () => PQPItem[];
    getPQPByVendor: (vendor: string) => PQPItem[];
}

// Module-level, not store state: see itpStore.ts's itpFetchSeq for why — discards a fetch's
// response if a newer fetchPQPs has started since (BACKLOG #28/#37).
let pqpFetchSeq = 0;
// See itpStore.ts's itpDataScopeId for why — clears the list on a cross-scope failure instead of
// leaving the previous scope's rows visible to plain consumers of this store (BACKLOG #28/#37).
let pqpDataScopeId: string | null = null;

export const usePQPStore = create<PQPState>((set, get) => ({
    pqpList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchPQPs: async (params?: FilterParams) => {
        const seq = ++pqpFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/pqp/', { params: { ...getProjectFilterParams(), ...params } });
            if (seq !== pqpFetchSeq) return;
            pqpDataScopeId = requestedScopeId;
            set({ pqpList: response.data || [], loading: false });
        } catch (err: any) {
            if (seq !== pqpFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch PQPs');
            if (requestedScopeId !== pqpDataScopeId) {
                pqpDataScopeId = requestedScopeId;
                set({ pqpList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
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
            const msg = getErrorMessage(error, 'Failed to add PQP');
            set({ error: msg });
            throw error;
        }
    },

    updatePQP: async (id: string, updates: Partial<PQPItem>) => {
        try {
            const response = await api.put(`/pqp/${id}`, updates);
            set((state) => ({ pqpList: state.pqpList.map(p => (p.id === id ? response.data : p)) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update PQP');
            set({ error: msg });
            throw error;
        }
    },

    publishPQP: async (id: string, changeSummary?: string) => {
        try {
            const response = await api.post(`/pqp/${id}/publish`, { change_summary: changeSummary });
            const published = response.data;
            set((state) => ({ pqpList: state.pqpList.map(p => (p.id === id ? published : p)) }));
            return published;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to publish PQP');
            set({ error: msg });
            throw error;
        }
    },

    getHistory: async (id: string) => {
        try {
            const response = await api.get(`/pqp/${id}/history`);
            return response.data;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to get PQP history');
            set({ error: msg });
            throw error;
        }
    },

    deletePQP: async (id: string) => {
        try {
            await api.delete(`/pqp/${id}`);
            set((state) => ({ pqpList: state.pqpList.filter(p => p.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete PQP');
            set({ error: msg });
            throw error;
        }
    },

    getPQPList: () => get().pqpList,
    getPQPByVendor: (vendor: string) => get().pqpList.filter(pqp => pqp.vendor === vendor),
}));
