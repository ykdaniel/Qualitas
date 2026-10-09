import { create } from 'zustand';
import api from '../services/api';
import { parseJsonFields } from '../utils/normalizeApiItem';
import { FilterParams } from '../types/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

import type { DateIssue } from '../utils/dateIssues';

export interface NCRItem {
    id: string;
    /** Read-only: what is wrong with the stored dates (from the API; never sent back, never written). */
    date_issues?: DateIssue[];
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
    foundBy?: string;
    raisedBy?: string;
    foundLocation?: string;
    productDisposition?: string;
    productIntegrityRelated?: string;
    permanentProductDeviation?: string;
    impactToOM?: string;
    defectPhotos?: string[];
    progressPhotos?: string[];
    improvementPhotos?: string[];
    noiNumber?: string;
    itrNumber?: string;
    dueDate?: string;
    attachments?: string[];
    referenceStandards?: string;
    serialNumbers?: string;
    repairMethodStatement?: string;
    repairMethodStatementStatus?: string; // '' | TBC | NA
    immediateCorrectionAction?: string;
    immediateCorrectionActionStatus?: string;
    rootCauseAnalysis?: string;
    rootCauseAnalysisStatus?: string;
    correctiveActions?: string;
    correctiveActionsStatus?: string;
    preventiveAction?: string;
    preventiveActionStatus?: string;
    finalProductIntegrityStatement?: string;
    reInspectionNumber?: string;
    projectQualityManager?: string;
    // NCR field-model improvements (BACKLOG #13)
    severity?: string;
    discipline?: string;
    assignedTo?: number | null;
    closedBy?: number | null;
    verifiedBy?: number | null;
    effectivenessVerified?: string;
    effectivenessVerifiedBy?: number | null;
    effectivenessVerifiedDate?: string;
    effectivenessNotes?: string;
    effectivenessNotesStatus?: string;
    // NCR formal-report fields (BACKLOG #15)
    drawingNo?: string;
    specNo?: string;
    poContract?: string;
    wbs?: string;
    lineNo?: string;
    weldJointNo?: string;
    heatBatchNo?: string;
    qtyAffected?: string;
    qtyAffectedUnit?: string;
    extent?: string;
    costScheduleImpact?: string;
    requirement?: string;
    asFound?: string;
    deviation?: string;
    concessionNo?: string;
    ownerApproval?: string;
    ownerApprovalBy?: string;
    ownerApprovalDate?: string;
    ownerApprovalNotes?: string;
    rcaMethod?: string;
    directCause?: string;
    directCauseStatus?: string;
    recurrence?: string;
    recurrenceRef?: string;
    correctiveActionOwner?: string;
    correctiveActionTargetDate?: string;
    preventiveActionOwner?: string;
    preventiveActionTargetDate?: string;
}

function normalizeItem(item: unknown): NCRItem {
    const record = (typeof item === 'object' && item !== null ? { ...item } : {}) as Record<string, unknown>;
    return parseJsonFields(record, ['defectPhotos', 'progressPhotos', 'improvementPhotos', 'attachments']) as unknown as NCRItem;
}

interface NCRState {
    ncrList: NCRItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchNCRs: (params?: FilterParams) => Promise<void>;
    addNCR: (ncr: Omit<NCRItem, 'id'>) => Promise<NCRItem>;
    updateNCR: (id: string, ncr: Partial<NCRItem>) => Promise<void>;
    deleteNCR: (id: string) => Promise<void>;
    refetch: (params?: FilterParams) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let ncrFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let ncrDataScopeId: string | null = null;

export const useNCRStore = create<NCRState>((set, get) => ({
    ncrList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchNCRs: async (params?: FilterParams) => {
        const seq = ++ncrFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/ncr/', { params: { ...getProjectFilterParams(), ...params } });
            if (seq !== ncrFetchSeq) return;
            ncrDataScopeId = requestedScopeId;
            set({ ncrList: (response.data || []).map(normalizeItem), loading: false });
        } catch (err: any) {
            if (seq !== ncrFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch NCRs');
            if (requestedScopeId !== ncrDataScopeId) {
                ncrDataScopeId = requestedScopeId;
                set({ ncrList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async (params?: FilterParams) => {
        await get().fetchNCRs(params);
    },

    addNCR: async (ncr: Omit<NCRItem, 'id'>) => {
        // A failed add/update is not written to the list-level `error`: the record modal reports it itself, once. Writing it here
        // showed the same failure again as a page banner and made a failed save look like a failed list load.
        const response = await api.post('/ncr/', ncr);
        const newNCR = normalizeItem(response.data);
        set((state) => ({ ncrList: [...state.ncrList, newNCR] }));
        return newNCR;
    },

    updateNCR: async (id: string, updates: Partial<NCRItem>) => {
        // A failed add/update is not written to the list-level `error`: the record modal reports it itself, once. Writing it here
        // showed the same failure again as a page banner and made a failed save look like a failed list load.
        const response = await api.put(`/ncr/${id}/`, updates);
        const updated = normalizeItem(response.data);
        set((state) => ({ ncrList: state.ncrList.map(n => n.id === id ? updated : n) }));
    },

    deleteNCR: async (id: string) => {
        try {
            await api.delete(`/ncr/${id}/`);
            set((state) => ({ ncrList: state.ncrList.filter(n => n.id !== id) }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete NCR');
            set({ error: msg });
            throw error;
        }
    }
}));
