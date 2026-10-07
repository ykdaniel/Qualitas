import { create } from 'zustand';
import api from '../services/api';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

import type { DateIssue } from '../utils/dateIssues';

export interface NOIItem {
    id: string;
    /** Read-only: what is wrong with the stored dates (from the API; never sent back, never written). */
    date_issues?: DateIssue[];
    package: string;
    referenceNo: string;
    issueDate: string;
    inspectionTime: string;
    itpNo: string | null;  // 連結到 ITP referenceNo
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
    attachments?: any[];
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

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let noiFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let noiDataScopeId: string | null = null;

export const useNOIStore = create<NOIState>((set, get) => ({
    noiList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchNOIs: async (params?: FilterParams) => {
        const seq = ++noiFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/noi/', { params: { ...getProjectFilterParams(), ...params } });
            if (seq !== noiFetchSeq) return;
            noiDataScopeId = requestedScopeId;
            set({ noiList: response.data || [], loading: false });
        } catch (err: any) {
            if (seq !== noiFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch NOIs');
            if (requestedScopeId !== noiDataScopeId) {
                noiDataScopeId = requestedScopeId;
                set({ noiList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchNOIs(params);
    },

    addNOI: async (noi: Omit<NOIItem, 'id'>, id?: string) => {
        // A failed add/update is not written to the list-level `error`: the record modal reports it itself, once. Writing it here
        // showed the same failure again as a page banner and made a failed save look like a failed list load.
        const response = await api.post('/noi/', id ? { ...noi, id } : noi);
        const newNOI = response.data;
        set((state) => ({ noiList: [...state.noiList, newNOI] }));
        return newNOI;
    },

    addBulkNOI: async (nois: Omit<NOIItem, 'id'>[]) => {
        try {
            const response = await api.post('/noi/bulk/', nois);
            const newNOIs = response.data;
            set((state) => ({ noiList: [...state.noiList, ...newNOIs] }));
            return newNOIs;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to add bulk NOI');
            set({ error: msg });
            throw error;
        }
    },

    updateNOI: async (id: string, updates: Partial<NOIItem>) => {
        // A failed add/update is not written to the list-level `error`: the record modal reports it itself, once. Writing it here
        // showed the same failure again as a page banner and made a failed save look like a failed list load.
        const response = await api.put(`/noi/${id}/`, updates);
        set((state) => ({ noiList: state.noiList.map(n => n.id === id ? response.data : n) }));
    },

    deleteNOI: async (id: string) => {
        try {
            await api.delete(`/noi/${id}/`);
            set((state) => ({ noiList: state.noiList.filter(n => n.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete NOI');
            set({ error: msg });
            throw error;
        }
    }
}));
