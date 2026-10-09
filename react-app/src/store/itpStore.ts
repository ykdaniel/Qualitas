import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

export interface ITPInspectionItem {
    id: string;
    itemNo: string;
    activity: string;
    referenceDoc: string;
    acceptanceCriteria: string;
    verifyingDocuments: string;
    checkpointContractor: string;
    checkpointMainCon: string;
    checkpointClient: string;
}

export interface ITPItem {
    project_id?: string | null;
    id: string;
    vendor: string;
    referenceNo?: string | null;  // 由後端自動產生
    description: string;
    rev: string;
    submit: string;
    status: string;
    remark: string;
    submissionDate?: string;
    hasDetails?: boolean;
    detail_data?: ITPInspectionItem[];
    attachments?: any[];
    dueDate?: string;
}

function normalizeItem(item: unknown): ITPItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;

    // Ensure detail_data is an array
    if (record.detail_data && typeof record.detail_data === 'string') {
        try {
            record.detail_data = JSON.parse(record.detail_data);
        } catch {
            record.detail_data = [];
        }
    }

    return parseJsonFields(record, ['detail_data', 'attachments']) as unknown as ITPItem;
}

interface ITPState {
    itpList: ITPItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchITPs: (params?: FilterParams) => Promise<void>;
    addITP: (itp: Omit<ITPItem, 'id'>) => Promise<ITPItem>;
    updateITP: (id: string, itp: Partial<ITPItem>) => Promise<void>;
    updateITPDetail: (id: string, detail: any) => Promise<void>;
    deleteITP: (id: string) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// Module-level, not store state: a monotonically increasing id for the most recently STARTED
// fetchITPs call. A response only gets applied if it's still the latest call when it resolves —
// otherwise it is a late-arriving response for a project/filter switch the caller has since moved
// away from, and applying it would silently show the wrong scope's data (BACKLOG #28/#37).
let itpFetchSeq = 0;
// The scope id `itpList` currently reflects (null until the first fetch ever resolves). On a
// FAILED fetch for a DIFFERENT scope than this, `itpList` is cleared instead of left showing the
// previous scope's rows — plain consumers of this store (ITP.tsx, the list page) have no
// Dashboard-style status wrapper to hide stale-wrong-scope data with, so the store itself must not
// hand them any. A same-scope failure still preserves the list (existing behavior — BACKLOG #37's
// "keep old data, flag the error" only ever applied within one scope to begin with).
let itpDataScopeId: string | null = null;

export const useITPStore = create<ITPState>((set, get) => ({
    itpList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchITPs: async (params?: FilterParams) => {
        const seq = ++itpFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/itp/', { params: { limit: 500, ...getProjectFilterParams(), ...params } });
            if (seq !== itpFetchSeq) return; // superseded by a newer fetch; discard this stale response
            const data = response.data;
            itpDataScopeId = requestedScopeId;
            set({ itpList: data?.map(normalizeItem) || [], loading: false });
        } catch (err: any) {
            if (seq !== itpFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch ITPs');
            if (requestedScopeId !== itpDataScopeId) {
                itpDataScopeId = requestedScopeId;
                set({ itpList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchITPs(params);
    },

    addITP: async (itp: Omit<ITPItem, 'id'>) => {
        try {
            const payload = {
                project_id: itp.project_id || undefined,
                vendor: itp.vendor,
                description: itp.description,
                rev: itp.rev,
                submit: itp.submit,
                status: itp.status,
                remark: itp.remark,
                submissionDate: itp.submissionDate,
                attachments: itp.attachments || [],
                dueDate: itp.dueDate || null,
                // schemas.ITPCreate.detail_data is `Any` on the backend — stored as-is (JSON
                // serialized), same as updateITPDetail's PUT below. Passed through unchanged: the
                // caller (ITP.tsx) supplies the SAME phase-split {a,b,c,checklist,self_inspection}
                // shape used everywhere else in this module (ITPModals.tsx's
                // prepareDetailPayload), not the flat ITPInspectionItem[] this field's own TS type
                // suggests — a prior per-field remapping here assumed that flat shape and was
                // never actually exercised (no call site ever passed detail_data through addITP
                // before this), so it is removed rather than fixed to avoid re-introducing the
                // same shape mismatch.
                detail_data: itp.detail_data as unknown,
            };

            const response = await api.post('/itp/', payload);
            const newITP = normalizeItem(response.data);
            set((state) => ({ itpList: [...state.itpList, newITP] }));
            return newITP;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to add ITP');
            set({ error: msg });
            throw error;
        }
    },

    updateITP: async (id: string, updates: Partial<ITPItem>) => {
        try {
            const response = await api.put(`/itp/${id}/`, updates);
            const updated = normalizeItem(response.data);
            set((state) => ({ itpList: state.itpList.map(item => item.id === id ? updated : item) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update ITP');
            set({ error: msg });
            throw error;
        }
    },

    updateITPDetail: async (id: string, detail: any) => {
        try {
            await api.put(`/itp/${id}/detail`, detail);
            // Backend doesn't return the full ITP, so fetch again to keep state synced
            await get().fetchITPs();
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update ITP details');
            set({ error: msg });
            throw error;
        }
    },

    deleteITP: async (id: string) => {
        try {
            await api.delete(`/itp/${id}/`);
            set((state) => ({ itpList: state.itpList.filter((item) => item.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete ITP');
            set({ error: msg });
            throw error;
        }
    }
}));
