import { create } from 'zustand';
import { kmService } from '../services/kmService';
import { KMArticle, KMArticleCreate, KMArticleUpdate } from '../types/km';

interface KMState {
    kmList: KMArticle[];
    loading: boolean;
    error: string | null;
    fetchKMs: (category?: string, search?: string) => Promise<void>;
    addKM: (data: KMArticleCreate) => Promise<void>;
    updateKM: (id: string, data: KMArticleUpdate) => Promise<void>;
    deleteKM: (id: string) => Promise<void>;
}

export const useKMStore = create<KMState>((set, get) => ({
    kmList: [],
    loading: false,
    error: null,

    fetchKMs: async (category?: string, search?: string) => {
        set({ loading: true, error: null });
        try {
            const data = await kmService.getAll({ category, search });
            set({ kmList: data, loading: false });
        } catch (err: any) {
            set({
                error: err.response?.data?.detail || err.message || 'Failed to fetch KM articles',
                loading: false,
            });
        }
    },

    addKM: async (data: KMArticleCreate) => {
        try {
            const newKM = await kmService.create(data);
            set((state) => ({ kmList: [newKM, ...state.kmList] }));
        } catch (err: any) {
            throw new Error(err.response?.data?.detail || err.message || 'Failed to add KM article');
        }
    },

    updateKM: async (id: string, data: KMArticleUpdate) => {
        try {
            const updatedKM = await kmService.update(id, data);
            set((state) => ({
                kmList: state.kmList.map((km) => (km.id === id ? updatedKM : km)),
            }));
        } catch (err: any) {
            throw new Error(err.response?.data?.detail || err.message || 'Failed to update KM article');
        }
    },

    deleteKM: async (id: string) => {
        try {
            await kmService.delete(id);
            set((state) => ({
                kmList: state.kmList.filter((km) => km.id !== id),
            }));
        } catch (err: any) {
            throw new Error(err.response?.data?.detail || err.message || 'Failed to delete KM article');
        }
    },
}));
