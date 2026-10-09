import { create } from 'zustand';
import * as api from '../services/api';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

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
    templateId?: string;
    // Read-only provenance — see api.ts's ChecklistRecordApi. Never sent on
    // create/update, only ever reflects what the backend last returned.
    version?: number | null;
    sourceTemplateVersion?: number | null;
    evidenceRecordedAt?: string | null;
    evidenceRecordedAtReliable?: boolean | null;
    evidenceHistoricalUnknown?: boolean | null;
    data: any;
}

// §17 hardening (2026-09-19, round 2): the backend evidence markers
// (evidenceHistoricalUnknown / evidenceRecordedAt) are only ever populated
// by a migration that scoped itself to ITR-linked INSTANCES (itrId set) —
// see backend/db_migrations.py's `_backfill_checklist_evidence_recorded_at`
// WHERE clause. A bare TEMPLATE that carries real historical results
// (BACKLOG "Checklist bare-template backend gap", e.g. QTS-RKS-HL-CHK-000001)
// was never touched by it and reads back with BOTH markers false/null —
// exactly like a genuinely clean template. Browser-verified 2026-09-19.
//
// This mirrors backend/services/checklist_service.py's
// `_touched_fields_carry_results` as a same-content fallback, so a
// template's CURRENT fields are checked too, not just the (incomplete)
// markers. One shared function — used by both the list badge and the
// editor's readOnly/banner logic — so the two can never disagree.
const RESULT_MARKERS = new Set(['O', 'X', '/']);

export const recordCarriesInspectionEvidence = (
    record: Pick<ChecklistRecord, 'status' | 'passCount' | 'failCount' | 'data'>
): boolean => {
    if (record.status === 'Pass' || record.status === 'Fail') return true;
    if ((record.passCount || 0) > 0 || (record.failCount || 0) > 0) return true;
    const items = record.data?.items;
    if (Array.isArray(items)) {
        for (const it of items) {
            if (!it) continue;
            if (RESULT_MARKERS.has(it.result)) return true;
            if (String(it.situation ?? '').trim()) return true;
            if (String(it.naReason ?? '').trim()) return true;   // N/A reason = recorded evidence (mirrors backend)
        }
    }
    return false;
};

// True if this TEMPLATE (itrId/templateId both falsy) must be treated as
// historically anomalous — either the backend already flagged it, or its
// own current content shows it was never actually clean. Always false for
// an ITR-linked instance (those are expected to carry results by design,
// and aren't edited on the Checklist module page at all).
export const isTemplateHistoricallyProtected = (record: ChecklistRecord): boolean => {
    if (record.itrId || record.templateId) return false;
    if (record.evidenceHistoricalUnknown || record.evidenceRecordedAt) return true;
    return recordCarriesInspectionEvidence(record);
};

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
    noiNumber: r.noiNumber,
    templateId: r.template_id,
    version: r.version ?? null,
    sourceTemplateVersion: r.source_template_version ?? null,
    evidenceRecordedAt: r.evidence_recorded_at ?? null,
    evidenceRecordedAtReliable: r.evidence_recorded_at_reliable ?? null,
    evidenceHistoricalUnknown: r.evidence_historical_unknown ?? null,
    // Fallback includes items: [] (not just {}) — ChecklistEditor reads
    // formData.items unconditionally (e.g. the tab label's .length), so a
    // record with NULL/corrupt detail_data would otherwise crash the editor
    // on open instead of just showing an empty checklist.
    data: safeJsonParse(r.detail_data, { items: [] }),
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
    addRecord: (record: Omit<ChecklistRecord, 'id' | 'recordsNo'>) => Promise<ChecklistRecord>;
    updateRecord: (id: string, updates: Partial<ChecklistRecord>) => Promise<ChecklistRecord>;
    deleteRecord: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let checklistFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let checklistDataScopeId: string | null = null;

export const useChecklistStore = create<ChecklistState>((set, get) => ({
    records: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchRecords: async (params?: FilterParams) => {
        const seq = ++checklistFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const data = await api.getChecklists({ ...getProjectFilterParams(), ...params });
            if (seq !== checklistFetchSeq) return;
            checklistDataScopeId = requestedScopeId;
            set({ records: data.map(normalizeRecord), loading: false });
        } catch (err: any) {
            if (seq !== checklistFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch checklist records');
            if (requestedScopeId !== checklistDataScopeId) {
                checklistDataScopeId = requestedScopeId;
                set({ records: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
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
            return newRecord;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to add checklist record');
            set({ error: msg });
            throw error;
        }
    },

    updateRecord: async (id, updates) => {
        try {
            // NOTE: 優雅地過濾掉 undefined 屬性，取代冗長的 14 行 if 判斷
            const { data: recordData, ...restUpdates } = updates;
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
            return updatedRecord;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update checklist record');
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
            const msg = getErrorMessage(error, 'Failed to delete checklist record');
            set({ error: msg });
            throw error;
        }
    },
}));
