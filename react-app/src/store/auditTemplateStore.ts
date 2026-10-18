import { create } from 'zustand';
import api from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';
import { withRowVersion } from '../utils/rowVersion';

// The audit template library (AUDIT-TEMPLATES-2026-001). In the wizard a template is an audit type; its questions are
// COPIED into an audit when picked (each copy tagged templateId / templateItemId), so editing a template never changes
// an existing audit. Templates are never deleted: is_active=false hides one from the wizard. A failed save rethrows the
// axios error as is (409 DUPLICATE_NAME = duplicate name), for the refusal dialog.
export interface AuditTemplateItem {
    id?: string;  // stable key assigned by the server; a new item has none
    no: string;
    title?: string;   // the clause heading the wizard's clause dropdown shows (e.g. "Understanding the organization…")
    clause: string;
    task: string;
}

export interface AuditTemplate {
    id: number;
    name: string;
    description: string;
    version: string;
    is_active: boolean;
    items: AuditTemplateItem[];
    created_at?: string;
    updated_at?: string;
    row_version?: number | null;     // optimistic lock (utils/rowVersion.ts)
}

export type AuditTemplateInput = Pick<AuditTemplate, 'name' | 'description' | 'version' | 'is_active' | 'items'>;

interface AuditTemplateState {
    // every template, active or not (the wizard shows the active ones plus any the audit already uses)
    templates: AuditTemplate[];
    loading: boolean;
    loaded: boolean;
    error: string | null;
    fetchTemplates: () => Promise<void>;
    createTemplate: (data: AuditTemplateInput) => Promise<AuditTemplate>;
    updateTemplate: (id: number, data: Partial<AuditTemplateInput>, rowVersion?: number | null) => Promise<AuditTemplate>;   // rowVersion: sent only when given
}

let templateFetchSeq = 0;

const upsert = (list: AuditTemplate[], tpl: AuditTemplate) =>
    list.some(t => t.id === tpl.id) ? list.map(t => (t.id === tpl.id ? tpl : t)) : [...list, tpl];

export const useAuditTemplateStore = create<AuditTemplateState>((set) => ({
    templates: [],
    loading: false,
    loaded: false,
    error: null,

    fetchTemplates: async () => {
        const seq = ++templateFetchSeq;
        set({ loading: true, error: null });
        try {
            const response = await api.get('/audit/templates', { params: { include_inactive: true } });
            if (seq !== templateFetchSeq) return;
            set({ templates: Array.isArray(response.data) ? response.data : [], loading: false, loaded: true });
        } catch (err: any) {
            if (seq !== templateFetchSeq) return;
            console.error('Failed to fetch audit templates:', err);
            set({ loading: false, error: getErrorMessage(err, 'Failed to load audit templates') });
        }
    },

    createTemplate: async (data) => {
        try {
            const response = await api.post('/audit/templates', data);
            set(state => ({ templates: upsert(state.templates, response.data) }));
            return response.data;
        } catch (err: any) {
            console.error('Failed to create audit template:', err);
            throw err;      // as is, so the refusal dialog sees its status and code (DUPLICATE_NAME, 409) — REFUSAL-DIALOG-2026-003
        }
    },

    updateTemplate: async (id, data, rowVersion) => {
        try {
            const response = await api.put(`/audit/templates/${id}`, withRowVersion(data, rowVersion));
            set(state => ({ templates: upsert(state.templates, response.data) }));
            return response.data;
        } catch (err: any) {
            console.error('Failed to update audit template:', err);
            throw err;
        }
    },
}));
