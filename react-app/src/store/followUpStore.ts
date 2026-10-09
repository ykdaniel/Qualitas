import { create } from 'zustand';
import api from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';
import { getProjectFilterParams, getCurrentProjectScopeId } from '../utils/projectFilter';

export interface FollowUpIssueItem {
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
    updateFollowUp: (id: string, item: Partial<FollowUpIssueItem>) => Promise<void>;
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

    addFollowUp: async (item) => {
        try {
            const response = await api.post('/followup/', item);
            const newItem = response.data;
            set((state) => ({ followUpList: [...state.followUpList, newItem] }));
            return newItem;
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to add Follow-up Issue');
            set({ error: msg });
            throw error;
        }
    },

    updateFollowUp: async (id, updates) => {
        try {
            const response = await api.put(`/followup/${id}`, updates);
            set((state) => ({
                followUpList: state.followUpList.map(f => (f.id === id ? response.data : f)),
            }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to update Follow-up Issue');
            set({ error: msg });
            throw error;
        }
    },

    deleteFollowUp: async (id) => {
        try {
            await api.delete(`/followup/${id}`);
            set((state) => ({
                followUpList: state.followUpList.filter(f => f.id !== id),
            }));
        } catch (error: any) {
            const msg = getErrorMessage(error, 'Failed to delete Follow-up Issue');
            set({ error: msg });
            throw error;
        }
    },
}));
