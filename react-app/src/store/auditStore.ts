import { create } from 'zustand';
import api from '../services/api';

export interface AuditItem {
    id: string;
    auditNo: string;
    title: string;
    date: string;
    auditor: string;
    status: string;
    location: string;
    findings: string;
    contractor?: string;
}

// NOTE: 將廠商名稱轉換為縮寫（取前3個字母大寫），用於產生審計編號
const getVendorAbbrev = (contractor?: string): string => {
    if (!contractor) return 'XXX';
    return contractor.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'XXX';
};

// NOTE: 生成符合命名規則的審計編號
const generateAuditNo = (contractor: string | undefined, sequence: number): string => {
    const abbrev = getVendorAbbrev(contractor);
    return `QTS-RKS-${abbrev}-AUD-${String(sequence).padStart(6, '0')}`;
};

// HACK: 暫時使用 localStorage 作為後端 API 異常時的備用方案
const STORAGE_KEY = 'qualitas_audit_list';

const loadFromStorage = (): AuditItem[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw) as AuditItem[];
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
    } catch (_) { }
    return [{
        id: '1',
        auditNo: 'QTS-RKS-SAM-AUD-000001',
        title: 'Internal Quality Audit Q1',
        date: '2026-03-15',
        auditor: 'John Doe',
        status: 'Planned',
        location: 'Site Office',
        findings: '',
        contractor: 'Sample Contractor',
    }];
};

const saveToStorage = (list: AuditItem[]) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (_) { }
};

interface AuditState {
    auditList: AuditItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchAudits: () => Promise<void>;
    refetch: () => Promise<void>;
    addAudit: (audit: Omit<AuditItem, 'id'>) => Promise<AuditItem>;
    updateAudit: (id: string, audit: Partial<AuditItem>) => Promise<void>;
    deleteAudit: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useAuditStore = create<AuditState>((set, get) => ({
    auditList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchAudits: async () => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/audit/');
            const list = response.data || [];
            set({ auditList: list, loading: false });
            // NOTE: 同步到 localStorage 作為備用
            if (list.length > 0) saveToStorage(list);
        } catch (err: any) {
            // NOTE: API 不存在（404）或其他錯誤時，使用 localStorage 備援
            set({ auditList: loadFromStorage(), loading: false });
        }
    },

    refetch: async () => {
        await get().fetchAudits();
    },

    addAudit: async (audit) => {
        try {
            const response = await api.post('/audit/', audit);
            const newAudit = response.data;
            set((state) => {
                const updated = [...state.auditList, newAudit];
                saveToStorage(updated);
                return { auditList: updated };
            });
            return newAudit;
        } catch (err: any) {
            // NOTE: API 失敗時使用本地儲存
            const { auditList } = get();
            const newAudit: AuditItem = {
                ...audit,
                id: String(Date.now()),
                auditNo: audit.auditNo || generateAuditNo(audit.contractor, auditList.length + 1),
            };
            set((state) => {
                const updated = [...state.auditList, newAudit];
                saveToStorage(updated);
                return { auditList: updated };
            });
            return newAudit;
        }
    },

    updateAudit: async (id, updates) => {
        try {
            const response = await api.put(`/audit/${id}/`, updates);
            set((state) => {
                const updated = state.auditList.map(a => (a.id === id ? response.data : a));
                saveToStorage(updated);
                return { auditList: updated };
            });
        } catch (err: any) {
            // NOTE: API 失敗時使用本地更新
            set((state) => {
                const updated = state.auditList.map(a => (a.id === id ? { ...a, ...updates } : a));
                saveToStorage(updated);
                return { auditList: updated };
            });
        }
    },

    deleteAudit: async (id) => {
        try {
            await api.delete(`/audit/${id}/`);
        } catch (_) { }
        // NOTE: 無論 API 成功與否，都從本地移除
        set((state) => {
            const updated = state.auditList.filter(a => a.id !== id);
            saveToStorage(updated);
            return { auditList: updated };
        });
    },
}));
