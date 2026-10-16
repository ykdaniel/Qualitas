import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId, withCurrentProject } from '../utils/projectFilter';

export interface OSDItem {
    id: string;
    vendor: string;
    documentNumber: string;
    status: string;
    remark?: string;
    raiseDate?: string;
    closeoutDate?: string;
    raisedBy?: string;
    deliveryNoteNo?: string;
    poNumber?: string;
    itemDescription?: string;
    expectedQty?: string;
    receivedQty?: string;
    unit?: string;
    damageDescription?: string;
    disposition?: string;
    correctiveAction?: string;
    correctiveActionOwner?: string;
    correctiveActionTargetDate?: string;
    resolvedBy?: string;
    resolvedDate?: string;
    defectPhotos?: string[];
    improvementPhotos?: string[];
    attachments?: string[];
    dueDate?: string;
}

function normalizeItem(item: unknown): OSDItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
    return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as OSDItem;
}

interface OSDState {
    osdList: OSDItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchOSDs: (params?: FilterParams) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    addOSD: (osd: Omit<OSDItem, 'id'>) => Promise<OSDItem>;
    updateOSD: (id: string, osd: Partial<OSDItem>) => Promise<void>;
    deleteOSD: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let osdFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let osdDataScopeId: string | null = null;

export const useOSDStore = create<OSDState>((set, get) => ({
    osdList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchOSDs: async (params?: FilterParams) => {
        const seq = ++osdFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/osd/', { params: { ...getProjectFilterParams(), ...params } });
            if (seq !== osdFetchSeq) return;
            osdDataScopeId = requestedScopeId;
            set({ osdList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            if (seq !== osdFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch OSDs');
            if (requestedScopeId !== osdDataScopeId) {
                osdDataScopeId = requestedScopeId;
                set({ osdList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchOSDs(params);
    },

    // A refused or failed save goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-002); the page's error banner is for list loads only.
    addOSD: async (osd: Omit<OSDItem, 'id'>) => {
        const response = await api.post('/osd/', withCurrentProject(osd));
        const newOSD = normalizeItem(response.data);
        set((state) => ({ osdList: [...state.osdList, newOSD] }));
        return newOSD;
    },

    updateOSD: async (id: string, updates: Partial<OSDItem>) => {
        const response = await api.put(`/osd/${id}`, updates);
        const updated = normalizeItem(response.data);
        set((state) => ({ osdList: state.osdList.map(o => o.id === id ? updated : o) }));
    },

    deleteOSD: async (id: string) => {
        // A refused or failed delete goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-001); the page's error banner is for list loads only.
        await api.delete(`/osd/${id}`);
        set((state) => ({ osdList: state.osdList.filter(o => o.id !== id) }));
    }
}));
