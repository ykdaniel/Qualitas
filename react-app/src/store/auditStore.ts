import { create } from 'zustand';
import api from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, withCurrentProject } from '../utils/projectFilter';

// One row of the audit's daily schedule (AUDIT-AGENDA-2026-001); the backend validates and sorts them.
export interface AuditAgendaEntry {
    id: number | string;
    // '' = a session; 'lunch' = the 12:00-13:00 Lunch Time default added for each new day (AUDIT-BUTTONS-2026-001)
    kind?: '' | 'lunch';
    date: string;
    start: string;
    end: string;
    item: string;
    auditee: string;
    auditor: string;
    remarks: string;
}

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
    agenda?: AuditAgendaEntry[];
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

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let auditFetchSeq = 0;

export const useAuditStore = create<AuditState>((set, get) => ({
    auditList: [],
    loading: false,
    error: null,

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

    // A refused or failed save goes to the caller (the wizard), which shows it in the refusal dialog (REFUSAL-DIALOG-2026-002).
    // Not put in the page banner (it is for list loads only), and the axios error is rethrown as is (not wrapped in a new Error)
    // so the dialog still sees its status and refusal code.
    // A save never touches the list-load banner either way (REFUSAL-DIALOG-2026-003: it no longer clears it).
    addAudit: async (audit) => {
        const response = await api.post('/audit/', withCurrentProject(audit));
        const newAudit = response.data;
        set((state) => ({
            auditList: [...state.auditList, newAudit]
        }));
        return newAudit;
    },

    updateAudit: async (id, updates) => {
        const response = await api.put(`/audit/${id}`, updates);
        set((state) => ({
            auditList: state.auditList.map(a => (a.id === id ? response.data : a))
        }));
    },

    deleteAudit: async (id) => {
        // A refused or failed delete goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-001); the page's error banner is for list loads only.
        // The axios error is rethrown as is (not wrapped in a new Error) so the dialog still sees its status and refusal code.
        await api.delete(`/audit/${id}`);
        set((state) => ({
            auditList: state.auditList.filter(a => a.id !== id)
        }));
    },
}));
