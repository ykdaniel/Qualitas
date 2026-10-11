import { create } from 'zustand';
import api from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';

// The audit template library (AUDIT-TEMPLATES-2026-001). In the wizard a template is an audit type; its questions are
// COPIED into an audit when picked (each copy tagged templateId / templateItemId), so editing a template never changes
// an existing audit. Templates are never deleted: is_active=false hides one from the wizard. Errors carry the HTTP
// status (409 = duplicate name).
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
    updateTemplate: (id: number, data: Partial<AuditTemplateInput>) => Promise<AuditTemplate>;
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
            throw Object.assign(new Error(getErrorMessage(err, 'Failed to create the template')), { status: err?.response?.status });
        }
    },

    updateTemplate: async (id, data) => {
        try {
            const response = await api.put(`/audit/templates/${id}`, data);
            set(state => ({ templates: upsert(state.templates, response.data) }));
            return response.data;
        } catch (err: any) {
            console.error('Failed to update audit template:', err);
            throw Object.assign(new Error(getErrorMessage(err, 'Failed to save the template')), { status: err?.response?.status });
        }
    },
}));
