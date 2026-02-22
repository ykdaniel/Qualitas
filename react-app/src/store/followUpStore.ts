import { create } from 'zustand';
import api from '../services/api';

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

export const useFollowUpStore = create<FollowUpState>((set, get) => ({
    followUpList: [],
    loading: false,
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchFollowUps: async () => {
        set({ loading: true, error: null });
        try {
            const response = await api.get('/followup/');
            set({ followUpList: response.data || [], loading: false });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch Follow-up Issues', loading: false });
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
            const msg = error.response?.data?.detail || error.message || 'Failed to add Follow-up Issue';
            set({ error: msg });
            throw error;
        }
    },

    updateFollowUp: async (id, updates) => {
        try {
            const response = await api.put(`/followup/${id}/`, updates);
            set((state) => ({
                followUpList: state.followUpList.map(f => (f.id === id ? response.data : f)),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update Follow-up Issue';
            set({ error: msg });
            throw error;
        }
    },

    deleteFollowUp: async (id) => {
        try {
            await api.delete(`/followup/${id}/`);
            set((state) => ({
                followUpList: state.followUpList.filter(f => f.id !== id),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete Follow-up Issue';
            set({ error: msg });
            throw error;
        }
    },
}));
