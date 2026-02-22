import { create } from 'zustand';
import * as api from '../services/api';
import { FilterParams } from '../types/api';

// NOTE: 重複使用 api.ts 中的 ChecklistRecordApi 介面避免重複定義
export type { ChecklistRecordApi } from '../services/api';

export interface ChecklistRecord {
    id: string;
    itpIndex: number;
    recordsNo: string;
    activity: string;
    date: string;
    status: 'Pass' | 'Fail' | 'Ongoing';
    packageName: string;
    contractor?: string;
    itpId?: string;
    itpVersion?: string;
    passCount?: number;
    failCount?: number;
    itrId?: string;
    itrNumber?: string;
    location: string;
    revision: number;
    noiNumber?: string;
    data: any;
}

// NOTE: 安全的 JSON 解析輔助函式，避免後端髒資料導致前端崩潰白屏
const safeJsonParse = (jsonString: string | null | undefined, fallback: any = {}): any => {
    if (!jsonString) return fallback;
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.warn('[checklistStore] Failed to parse JSON detail_data:', error);
        return fallback;
    }
};

// NOTE: 將後端 API 結構規範化為前端的 ChecklistRecord，集中管理轉換邏輯
const normalizeRecord = (r: api.ChecklistRecordApi): ChecklistRecord => ({
    id: r.id,
    itpIndex: r.itpIndex,
    recordsNo: r.recordsNo,
    activity: r.activity,
    date: r.date,
    status: r.status as ChecklistRecord['status'],
    packageName: r.packageName,
    contractor: r.contractor || '',
    itpId: r.itpId,
    itpVersion: r.itpVersion,
    passCount: r.passCount ?? 0,
    failCount: r.failCount ?? 0,
    itrId: r.itrId,
    itrNumber: r.itrNumber,
    location: r.location || '',
    revision: safeJsonParse(r.detail_data).revision || 0,
    noiNumber: (r as any).noiNumber,
    data: safeJsonParse(r.detail_data),
});

// HACK: [AUTO-GENERATE] 為與後端約定的編號自動產生標記，未來建議抽離為共用常數
const AUTO_GENERATE_RECORDS_NO = '[AUTO-GENERATE]';

interface ChecklistState {
    records: ChecklistRecord[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchRecords: (params?: FilterParams) => Promise<void>;
    refreshRecords: (params?: FilterParams) => Promise<void>;
    addRecord: (record: Omit<ChecklistRecord, 'id' | 'recordsNo'>) => Promise<void>;
    updateRecord: (id: string, updates: Partial<ChecklistRecord>) => Promise<void>;
    deleteRecord: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useChecklistStore = create<ChecklistState>((set, get) => ({
    records: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchRecords: async (params?: FilterParams) => {
        set({ loading: true, error: null });
        try {
            const data = await api.getChecklists(params);
            set({ records: data.map(normalizeRecord), loading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.detail || err.message || 'Failed to fetch checklist records',
                loading: false,
            });
        }
    },

    // NOTE: 提供 refreshRecords 讓外部元件可帶入過濾狀態重新整理
    refreshRecords: async (params?: FilterParams) => {
        await get().fetchRecords(params);
    },

    addRecord: async (record) => {
        try {
            const payload: api.CreateChecklistPayload = {
                recordsNo: AUTO_GENERATE_RECORDS_NO,
                activity: record.activity,
                date: record.date,
                status: record.status,
                packageName: record.packageName,
                contractor: record.contractor,
                itpId: record.itpId,
                itpVersion: record.itpVersion,
                passCount: record.passCount,
                failCount: record.failCount,
                itrId: record.itrId,
                itrNumber: record.itrNumber,
                location: record.location,
                itpIndex: record.itpIndex,
                detail_data: JSON.stringify(record.data),
            };

            const created = await api.createChecklist(payload);
            const newRecord = normalizeRecord(created);
            // NOTE: 本地直接附加新記錄，避免不必要的全量 refetch
            set((state) => ({ records: [...state.records, newRecord] }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add checklist record';
            set({ error: msg });
            throw error;
        }
    },

    updateRecord: async (id, updates) => {
        try {
            // NOTE: 優雅地過濾掉 undefined 屬性，取代冗長的 14 行 if 判斷
            const { data: recordData, revision, noiNumber, ...restUpdates } = updates;
            const payload: Record<string, any> = Object.fromEntries(
                Object.entries(restUpdates).filter(([_, v]) => v !== undefined)
            );

            // NOTE: data 需要特別序列化為 detail_data 字串傳給後端
            if (recordData !== undefined) {
                payload.detail_data = JSON.stringify(recordData);
            }

            const updatedApi = await api.updateChecklist(id, payload);
            const updatedRecord = normalizeRecord(updatedApi);
            // NOTE: 本地記憶體直接替換該筆記錄，不影響使用者目前的搜尋/過濾狀態
            set((state) => ({
                records: state.records.map((r) => (r.id === id ? updatedRecord : r)),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update checklist record';
            set({ error: msg });
            throw error;
        }
    },

    deleteRecord: async (id) => {
        try {
            await api.deleteChecklist(id);
            // NOTE: 本地記憶體直接移除該筆記錄，不觸發全量 refetch
            set((state) => ({
                records: state.records.filter((r) => r.id !== id),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete checklist record';
            set({ error: msg });
            throw error;
        }
    },
}));
