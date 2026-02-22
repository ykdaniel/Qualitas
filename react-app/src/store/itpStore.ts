import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';

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
    attachments?: string[];
    dueDate?: string;
}

function normalizeItem(item: unknown): ITPItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;

    // Ensure detail_data is an array
    if (record.detail_data && typeof record.detail_data === 'string') {
        try {
            record.detail_data = JSON.parse(record.detail_data);
        } catch (e) {
            record.detail_data = [];
        }
    }

    return parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments']) as unknown as ITPItem;
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

export const useITPStore = create<ITPState>((set, get) => ({
    itpList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchITPs: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/itp/', { params });
            const data = response.data;
            set({ itpList: data?.map(normalizeItem) || [], loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch ITPs', loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchITPs(params);
    },

    addITP: async (itp: Omit<ITPItem, 'id'>) => {
        try {
            const payload = {
                vendor: itp.vendor,
                description: itp.description,
                rev: itp.rev,
                submit: itp.submit,
                status: itp.status,
                remark: itp.remark,
                submissionDate: itp.submissionDate,
                attachments: itp.attachments || [],
                dueDate: itp.dueDate || null,
                // The backend `create_itp` expects nested details directly if provided:
                detail_data: itp.detail_data?.map(d => ({
                    ...d,
                    item_no: d.itemNo, // Map frontend naming back to backend expectations when creating
                    reference_doc: d.referenceDoc,
                    acceptance_criteria: d.acceptanceCriteria,
                    verifying_documents: d.verifyingDocuments,
                    checkpoint_contractor: d.checkpointContractor,
                    checkpoint_main_con: d.checkpointMainCon,
                    checkpoint_client: d.checkpointClient
                }))
            };

            const response = await api.post('/itp/', payload);
            const newITP = normalizeItem(response.data);
            set((state) => ({ itpList: [...state.itpList, newITP] }));
            return newITP;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add ITP';
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
            const msg = error.response?.data?.detail || error.message || 'Failed to update ITP';
            set({ error: msg });
            throw error;
        }
    },

    updateITPDetail: async (id: string, detail: any) => {
        try {
            await api.put(`/itp/${id}/details/`, detail);
            // Backend doesn't return the full ITP, so fetch again to keep state synced
            await get().fetchITPs();
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update ITP details';
            set({ error: msg });
            throw error;
        }
    },

    deleteITP: async (id: string) => {
        try {
            await api.delete(`/itp/${id}/`);
            set((state) => ({ itpList: state.itpList.filter((item) => item.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete ITP';
            set({ error: msg });
            throw error;
        }
    }
}));
