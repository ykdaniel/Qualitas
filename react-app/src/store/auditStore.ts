import { create } from 'zustand';
import api from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams } from '../utils/projectFilter';

export interface AuditItem {
    id: string;
    project_id?: string | null;
    auditNo: string;
    title: string;
    date: string;
    end_date?: string;
    auditor: string;
    status: string;
    location: string;
    findings: string;
    contractor?: string;
    vendor_id?: string;
    project_name?: string;
    project_director?: string;
    support_auditors?: string;
    tech_lead?: string;
    scope_description?: string;
    audit_criteria?: string;
    selected_templates?: string[];
    custom_check_items?: any[];
}

// GET /audit/contractors: names only, served with audit:view (the full /contractors list needs
// contractors:view:all, which audit-only roles don't have).
export interface AuditContractorOption {
    id: string;
    name: string;
    status?: string | null;
}

interface AuditState {
    auditList: AuditItem[];
    loading: boolean;
    error: string | null;
    contractorOptions: AuditContractorOption[];

    // Actions
    fetchAudits: () => Promise<void>;
    fetchContractorOptions: () => Promise<void>;
    refetch: () => Promise<void>;
    addAudit: (audit: Omit<AuditItem, 'id'>) => Promise<AuditItem>;
    updateAudit: (id: string, audit: Partial<AuditItem>) => Promise<void>;
    deleteAudit: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let auditFetchSeq = 0;

export const useAuditStore = create<AuditState>((set, get) => ({
    auditList: [],
    loading: false,
    error: null,
    contractorOptions: [],

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchAudits: async () => {
        const seq = ++auditFetchSeq;
        set({ loading: true, error: null });
        try {
            const response = await api.get('/audit/', { params: { ...getProjectFilterParams() } });
            if (seq !== auditFetchSeq) return;
            const list = response.data || [];
            set({ auditList: list, loading: false });
        } catch (err: any) {
            if (seq !== auditFetchSeq) return;
            const errorMessage = getErrorMessage(err, 'Failed to fetch audits');
            set({
                auditList: [],
                loading: false,
                error: errorMessage
            });
            console.error('Failed to fetch audits:', err);
        }
    },

    refetch: async () => {
        await get().fetchAudits();
    },

    fetchContractorOptions: async () => {
        try {
            const response = await api.get('/audit/contractors');
            set({ contractorOptions: response.data || [] });
        } catch (err: any) {
            // Not shown in the page banner: the audit list itself still works; only the contractor
            // panel / schedule rows / picker stay empty.
            console.error('Failed to fetch audit contractor options:', err);
        }
    },

    addAudit: async (audit) => {
        try {
            set({ error: null });
            const response = await api.post('/audit/', audit);
            const newAudit = response.data;
            set((state) => ({
                auditList: [...state.auditList, newAudit]
            }));
            return newAudit;
        } catch (err: any) {
            const errorMessage = getErrorMessage(err, 'Failed to create audit');
            set({ error: errorMessage });
            console.error('Failed to create audit:', err);
            throw new Error(errorMessage);
        }
    },

    updateAudit: async (id, updates) => {
        try {
            set({ error: null });
            const response = await api.put(`/audit/${id}`, updates);
            set((state) => ({
                auditList: state.auditList.map(a => (a.id === id ? response.data : a))
            }));
        } catch (err: any) {
            const errorMessage = getErrorMessage(err, 'Failed to update audit');
            set({ error: errorMessage });
            console.error('Failed to update audit:', err);
            throw new Error(errorMessage);
        }
    },

    deleteAudit: async (id) => {
        try {
            set({ error: null });
            await api.delete(`/audit/${id}`);
            set((state) => ({
                auditList: state.auditList.filter(a => a.id !== id)
            }));
        } catch (err: any) {
            const errorMessage = getErrorMessage(err, 'Failed to delete audit');
            set({ error: errorMessage });
            console.error('Failed to delete audit:', err);
            throw new Error(errorMessage);
        }
    },
}));
