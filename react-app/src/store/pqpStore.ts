import { create } from 'zustand';
import api from '../services/api';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId, withCurrentProject } from '../utils/projectFilter';
import { withRowVersion } from '../utils/rowVersion';
import type { RowVersioned } from '../utils/rowVersion';

export interface PQPItem extends RowVersioned {
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
    updatePQP: (id: string, pqp: Partial<PQPItem>, rowVersion?: number | null) => Promise<void>;   // rowVersion: sent only when given (utils/rowVersion.ts)
    publishPQP: (id: string, changeSummary?: string, rowVersion?: number | null) => Promise<PQPItem>;
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

    // A refused or failed save / publish goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-002); the page's error banner is for list loads only.
    addPQP: async (pqp: Omit<PQPItem, 'id'>) => {
        const response = await api.post('/pqp/', withCurrentProject(pqp));
        const newPQP = response.data;
        set((state) => ({ pqpList: [...state.pqpList, newPQP] }));
        return newPQP;
    },

    updatePQP: async (id: string, updates: Partial<PQPItem>, rowVersion) => {
        const response = await api.put(`/pqp/${id}`, withRowVersion(updates, rowVersion));
        set((state) => ({ pqpList: state.pqpList.map(p => (p.id === id ? response.data : p)) }));
    },

    publishPQP: async (id: string, changeSummary?: string, rowVersion?: number | null) => {
        const response = await api.post(`/pqp/${id}/publish`, withRowVersion({ change_summary: changeSummary }, rowVersion));
        const published = response.data;
        set((state) => ({ pqpList: state.pqpList.map(p => (p.id === id ? published : p)) }));
        return published;
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
        // A refused or failed delete goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-001); the page's error banner is for list loads only.
        await api.delete(`/pqp/${id}`);
        set((state) => ({ pqpList: state.pqpList.filter(p => p.id !== id) }));
    },

    getPQPList: () => get().pqpList,
    getPQPByVendor: (vendor: string) => get().pqpList.filter(pqp => pqp.vendor === vendor),
}));
