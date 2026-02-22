import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';

export interface ITRItem {
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
    ncrNumber?: string;  // 若檢驗失敗，連結到產生的 NCR
    raisedBy?: string;
    foundLocation?: string;
    noiNumber?: string;  // 連結到產生此 ITR 的 NOI（取代舊的 itpNo）
    eventNumber?: string;
    checkpoint?: string;
    defectPhotos?: string[];
    improvementPhotos?: string[];
    attachments?: string[];
    itpNo?: string;  // Related ITP Reference Number
    drawings?: string[]; // Latest Drawings
    certificates?: string[]; // Calibration Certificates
    linkedChecklists?: any[]; // Snapshot of linked checklists
    detail_data?: any; // Raw detail data from backend
}

function normalizeItem(item: unknown): ITRItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
    const parsedRecord = parseJsonFields(record, ['defectPhotos', 'improvementPhotos', 'attachments', 'drawings', 'certificates', 'detail_data']) as Record<string, unknown>;

    // Extract linkedChecklists from detail_data if exists
    if (parsedRecord.detail_data && typeof parsedRecord.detail_data === 'object') {
        const detailData = parsedRecord.detail_data as Record<string, any>;
        if (Array.isArray(detailData.linkedChecklists)) {
            parsedRecord.linkedChecklists = detailData.linkedChecklists;
        }
    }

    return parsedRecord as unknown as ITRItem;
}

interface ITRState {
    itrList: ITRItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchITRs: (params?: FilterParams) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    addITR: (itr: Omit<ITRItem, 'id'>) => Promise<ITRItem>;
    updateITR: (id: string, itr: Partial<ITRItem>) => Promise<void>;
    deleteITR: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;

    // Getters
    getITRList: () => ITRItem[];
    getITRByNOI: (noiNumber: string) => ITRItem[];
    getITRByNCR: (ncrNumber: string) => ITRItem[];
}

export const useITRStore = create<ITRState>((set, get) => ({
    itrList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchITRs: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/itr/', { params });
            set({ itrList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch ITRs', loading: false });
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchITRs(params);
    },

    addITR: async (itr: Omit<ITRItem, 'id'>) => {
        try {
            // Pack linkedChecklists into detail_data
            const payload = { ...itr } as any;

            let detailData: any = {};
            if (payload.detail_data) {
                try {
                    detailData = typeof payload.detail_data === 'string'
                        ? JSON.parse(payload.detail_data)
                        : payload.detail_data;
                } catch (e) {
                    console.error("Failed to parse payload.detail_data in addITR", e);
                }
            }

            if (payload.linkedChecklists) {
                detailData.linkedChecklists = payload.linkedChecklists;
                delete payload.linkedChecklists;
            }

            // Always stringify detail_data for backend
            payload.detail_data = JSON.stringify(detailData);

            const response = await api.post('/itr/', payload);
            const newITR = normalizeItem(response.data);
            set((state) => ({ itrList: [...state.itrList, newITR] }));
            return newITR;
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add ITR';
            set({ error: msg });
            throw error;
        }
    },

    updateITR: async (id: string, updates: Partial<ITRItem>) => {
        try {
            const payload = { ...updates } as any;
            const { itrList } = get();

            // Determine if we need to merge detail_data
            if (payload.linkedChecklists || payload.detail_data) {
                const existingItem = itrList.find(i => i.id === id);
                let existingDetail = {};

                if (existingItem?.detail_data) {
                    try {
                        existingDetail = typeof existingItem.detail_data === 'string'
                            ? JSON.parse(existingItem.detail_data)
                            : existingItem.detail_data;
                    } catch (e) {
                        console.error("Failed to parse existing detail_data", e);
                    }
                }

                let newDetail = {};
                if (payload.detail_data) {
                    try {
                        newDetail = typeof payload.detail_data === 'string'
                            ? JSON.parse(payload.detail_data)
                            : payload.detail_data;
                    } catch (e) {
                        console.error("Failed to parse payload detail_data", e);
                    }
                }

                const mergedDetail: any = {
                    ...existingDetail,
                    ...newDetail,
                };

                if (payload.linkedChecklists) {
                    mergedDetail.linkedChecklists = payload.linkedChecklists;
                }

                payload.detail_data = JSON.stringify(mergedDetail);
                delete payload.linkedChecklists;
            }

            const response = await api.put(`/itr/${id}/`, payload);
            const updated = normalizeItem(response.data);
            set((state) => ({ itrList: state.itrList.map(i => i.id === id ? updated : i) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update ITR';
            set({ error: msg });
            throw error;
        }
    },

    deleteITR: async (id: string) => {
        try {
            await api.delete(`/itr/${id}/`);
            set((state) => ({ itrList: state.itrList.filter(i => i.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete ITR';
            set({ error: msg });
            throw error;
        }
    },

    getITRList: () => get().itrList,

    getITRByNOI: (noiNumber: string) => {
        return get().itrList.filter(itr => itr.noiNumber === noiNumber);
    },

    getITRByNCR: (ncrNumber: string) => {
        return get().itrList.filter(itr => itr.ncrNumber === ncrNumber);
    }
}));
