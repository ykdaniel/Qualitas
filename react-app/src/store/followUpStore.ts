import { create } from 'zustand';
import api from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId, withCurrentProject } from '../utils/projectFilter';
import { withRowVersion } from '../utils/rowVersion';
import type { RowVersioned } from '../utils/rowVersion';

export interface FollowUpIssueItem extends RowVersioned {
    id: string;
    issueNo: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    assignedTo: string;
    vendor?: string;
    dueDate: string;
    createdAt: string;
    updatedAt: string;
    action?: string;
    sourceModule?: string;  // 來源模組：NCR, OBS, NOI, ITR 等
    sourceReferenceNo?: string;  // 來源單號
}

interface FollowUpState {
    followUpList: FollowUpIssueItem[];
    loading: boolean;
    error: string | null;

    // Actions
    fetchFollowUps: () => Promise<void>;
    refetch: () => Promise<void>;
    addFollowUp: (item: Partial<FollowUpIssueItem>) => Promise<FollowUpIssueItem>;
    updateFollowUp: (id: string, item: Partial<FollowUpIssueItem>, rowVersion?: number | null) => Promise<void>;   // rowVersion: sent only when given (utils/rowVersion.ts)
    deleteFollowUp: (id: string) => Promise<void>;
    clearError: () => void;
    setError: (err: string | null) => void;
}

// See itpStore.ts's itpFetchSeq — discards a stale (superseded) response (BACKLOG #28/#37).
let followUpFetchSeq = 0;
// See itpStore.ts's itpDataScopeId — clears the list on a cross-scope failure (BACKLOG #28/#37).
let followUpDataScopeId: string | null = null;

export const useFollowUpStore = create<FollowUpState>((set, get) => ({
    followUpList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchFollowUps: async () => {
        const seq = ++followUpFetchSeq;
        const requestedScopeId = getCurrentProjectScopeId();
        set({ loading: true, error: null });
        try {
            const response = await api.get('/followup/', { params: { ...getProjectFilterParams() } });
            if (seq !== followUpFetchSeq) return;
            followUpDataScopeId = requestedScopeId;
            set({ followUpList: response.data || [], loading: false });
        } catch (err: any) {
            if (seq !== followUpFetchSeq) return;
            const message = getErrorMessage(err, 'Failed to fetch Follow-up Issues');
            if (requestedScopeId !== followUpDataScopeId) {
                followUpDataScopeId = requestedScopeId;
                set({ followUpList: [], error: message, loading: false });
            } else {
                set({ error: message, loading: false });
            }
        }
    },

    refetch: async () => {
        await get().fetchFollowUps();
    },

    // A refused or failed save goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-003); `error` is for list loads only.
    addFollowUp: async (item) => {
        const response = await api.post('/followup/', withCurrentProject(item));
        const newItem = response.data;
        set((state) => ({ followUpList: [...state.followUpList, newItem] }));
        return newItem;
    },

    updateFollowUp: async (id, updates, rowVersion) => {
        const response = await api.put(`/followup/${id}`, withRowVersion(updates, rowVersion));
        set((state) => ({
            followUpList: state.followUpList.map(f => (f.id === id ? response.data : f)),
        }));
    },

    deleteFollowUp: async (id) => {
        // A refused or failed delete goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-001).
        await api.delete(`/followup/${id}`);
        set((state) => ({
            followUpList: state.followUpList.filter(f => f.id !== id),
        }));
    },
}));
