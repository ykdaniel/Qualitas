import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

import type { DateIssue } from '../utils/dateIssues';

export interface OBSItem {
    id: string;
    /** Read-only: what is wrong with the stored dates (from the API; never sent back, never written). */
    date_issues?: DateIssue[];
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
    dueDate?: string;
    verified?: string;        // superseded — see engineer approvals below
    verifiedDate?: string;
    qualityEngineerApproval?: string;       // Pending / Approved / Rejected
    qualityEngineerApprovalBy?: string;
    qualityEngineerApprovalDate?: string;
    constructionEngineerApproval?: string;  // Pending / Approved / Rejected
    constructionEngineerApprovalBy?: string;
    constructionEngineerApprovalDate?: string;
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

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let obsFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let obsDataScopeId: string | null = null;

export const useOBSStore = create<OBSState>((set, get) => ({
    obsList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchOBSs: async (params?: FilterParams) => {
        const seq = ++obsFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/obs/', { params: { ...getProjectFilterParams(), ...params } });
            if (seq !== obsFetchSeq) return;
            obsDataScopeId = requestedScopeId;
            set({ obsList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            if (seq !== obsFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch OBSs');
            if (requestedScopeId !== obsDataScopeId) {
                obsDataScopeId = requestedScopeId;
                set({ obsList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchOBSs(params);
    },

    addOBS: async (obs: Omit<OBSItem, 'id'>) => {
        // A failed add/update is not written to the list-level `error`: the record modal reports it itself, once. Writing it here
        // showed the same failure again as a page banner and made a failed save look like a failed list load.
        const response = await api.post('/obs/', obs);
        const newOBS = normalizeItem(response.data);
        set((state) => ({ obsList: [...state.obsList, newOBS] }));
        return newOBS;
    },

    updateOBS: async (id: string, updates: Partial<OBSItem>) => {
        // A failed add/update is not written to the list-level `error`: the record modal reports it itself, once. Writing it here
        // showed the same failure again as a page banner and made a failed save look like a failed list load.
        const response = await api.put(`/obs/${id}`, updates);
        const updated = normalizeItem(response.data);
        set((state) => ({ obsList: state.obsList.map(o => o.id === id ? updated : o) }));
    },

    deleteOBS: async (id: string) => {
        try {
            await api.delete(`/obs/${id}`);
            set((state) => ({ obsList: state.obsList.filter(o => o.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete OBS');
            set({ error: msg });
            throw error;
        }
    }
}));
