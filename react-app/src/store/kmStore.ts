import { create } from 'zustand';
import { kmService } from '../services/kmService';
import { KMArticle, KMArticleCreate, KMArticleUpdate } from '../types/km';

interface KMState {
    kmList: KMArticle[];
    loading: boolean;
    error: string | null;
    accessDenied: boolean;
    fetchKMs: (category?: string, search?: string) => Promise<void>;
    addKM: (data: KMArticleCreate) => Promise<void>;
    updateKM: (id: string, data: KMArticleUpdate) => Promise<void>;
    deleteKM: (id: string) => Promise<void>;
}

export const useKMStore = create<KMState>((set, _get) => ({
    kmList: [],
    loading: false,
    error: null,
    accessDenied: false,

    fetchKMs: async (category?: string, search?: string) => {
        set({ loading: true, error: null, accessDenied: false });
        try {
            const data = await kmService.getAll({ category, search, limit: 9999 });
            set({ kmList: data, loading: false });
        } catch (err: any) {
            set({
                accessDenied: err?.response?.status === 403,
                kmList: [],
                error: 'Failed to load articles. Please try again later.',
                loading: false,
            });
        }
    },

    addKM: async (data: KMArticleCreate) => {
        // a failed add / update goes to the caller as the axios error itself, so the refusal dialog sees its status and code
        // (a new Error kept only the text: a 409 VERSION_CONFLICT could not be recognised — OPTIMISTIC-LOCK-2026-001 B3b)
        const newKM = await kmService.create(data);
        set((state) => ({ kmList: [newKM, ...state.kmList] }));
    },

    updateKM: async (id: string, data: KMArticleUpdate) => {
        const updatedKM = await kmService.update(id, data);
        set((state) => ({
            kmList: state.kmList.map((km) => (km.id === id ? updatedKM : km)),
        }));
    },

    deleteKM: async (id: string) => {
        // A refused or failed delete goes to the caller as the axios error itself (so the refusal dialog sees its status and code).
        await kmService.delete(id);
        set((state) => ({
            kmList: state.kmList.filter((km) => km.id !== id),
        }));
    },
}));
