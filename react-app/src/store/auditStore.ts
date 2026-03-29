import { create } from 'zustand';
import api from '../services/api';

export interface AuditItem {
    id: string;
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
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || err.message || 'Failed to fetch audits';
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
            const errorMessage = err.response?.data?.detail || err.message || 'Failed to create audit';
            set({ error: errorMessage });
            console.error('Failed to create audit:', err);
            throw new Error(errorMessage);
        }
    },

    updateAudit: async (id, updates) => {
        try {
            set({ error: null });
            const response = await api.put(`/audit/${id}/`, updates);
            set((state) => ({
                auditList: state.auditList.map(a => (a.id === id ? response.data : a))
            }));
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || err.message || 'Failed to update audit';
            set({ error: errorMessage });
            console.error('Failed to update audit:', err);
            throw new Error(errorMessage);
        }
    },

    deleteAudit: async (id) => {
        try {
            set({ error: null });
            await api.delete(`/audit/${id}/`);
            set((state) => ({
                auditList: state.auditList.filter(a => a.id !== id)
            }));
        } catch (err: any) {
            const errorMessage = err.response?.data?.detail || err.message || 'Failed to delete audit';
            set({ error: errorMessage });
            console.error('Failed to delete audit:', err);
            throw new Error(errorMessage);
        }
    },
}));
