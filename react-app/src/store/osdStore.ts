import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

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

    addOSD: async (osd: Omit<OSDItem, 'id'>) => {
        try {
            const response = await api.post('/osd/', osd);
            const newOSD = normalizeItem(response.data);
            set((state) => ({ osdList: [...state.osdList, newOSD] }));
            return newOSD;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to add OSD');
            set({ error: msg });
            throw error;
        }
    },

    updateOSD: async (id: string, updates: Partial<OSDItem>) => {
        try {
            const response = await api.put(`/osd/${id}`, updates);
            const updated = normalizeItem(response.data);
            set((state) => ({ osdList: state.osdList.map(o => o.id === id ? updated : o) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update OSD');
            set({ error: msg });
            throw error;
        }
    },

    deleteOSD: async (id: string) => {
        try {
            await api.delete(`/osd/${id}`);
            set((state) => ({ osdList: state.osdList.filter(o => o.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete OSD');
            set({ error: msg });
            throw error;
        }
    }
}));
