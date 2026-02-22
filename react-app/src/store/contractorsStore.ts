import { create } from 'zustand';
import {
    getContractors,
    createContractor,
    updateContractor as updateContractorApi,
    deleteContractor as apiDeleteContractor,
    Contractor as ApiContractor,
    CreateContractorPayload,
} from '../services/api';

export interface Contractor {
    id: string;
    package: string;
    name: string;
    abbreviation: string;
    scope: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    status: 'active' | 'inactive';
}

// NOTE: 將 API 回傳的結構規範化為前端 Contractor 介面
const mapApiToInternal = (data: ApiContractor): Contractor => ({
    id: data.id,
    package: data.package || '',
    name: data.name,
    abbreviation: data.abbreviation || '',
    scope: data.scope || '',
    contactPerson: data.contactPerson || '',
    email: data.email,
    phone: data.phone,
    address: data.address,
    status: (data.status?.toLowerCase() === 'active' || data.status === 'active') ? 'active' : 'inactive',
});

// NOTE: 將前端 Contractor 介面轉換為 API payload 結構
const mapInternalToApi = (data: Omit<Contractor, 'id'>): CreateContractorPayload => ({
    package: data.package,
    name: data.name,
    abbreviation: data.abbreviation,
    scope: data.scope,
    contactPerson: data.contactPerson,
    email: data.email,
    phone: data.phone,
    address: data.address,
    status: data.status === 'active' ? 'Active' : 'Inactive',
});

interface ContractorsState {
    contractors: Contractor[];
    error: string | null;

    // Actions
    fetchContractors: () => Promise<void>;
    addContractor: (contractor: Omit<Contractor, 'id'>) => Promise<void>;
    updateContractor: (id: string, contractor: Partial<Contractor>) => Promise<void>;
    deleteContractor: (id: string) => Promise<void>;
    getActiveContractors: () => Contractor[];
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useContractorsStore = create<ContractorsState>((set, get) => ({
    contractors: [],
    error: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchContractors: async () => {
        try {
            const data = await getContractors();
            set({ contractors: data.map(mapApiToInternal) });
        } catch (err: any) {
            set({ error: err.response?.data?.detail || err.message || 'Failed to fetch contractors' });
        }
    },

    addContractor: async (contractor) => {
        try {
            const payload = mapInternalToApi(contractor);
            const newContractor = await createContractor(payload);
            set((state) => ({ contractors: [...state.contractors, mapApiToInternal(newContractor)] }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to add contractor';
            set({ error: msg });
            throw error;
        }
    },

    updateContractor: async (id, updates) => {
        try {
            const { contractors } = get();
            const current = contractors.find(c => c.id === id);
            if (!current) return;

            const merged = { ...current, ...updates };
            const payload = mapInternalToApi(merged);
            const updated = await updateContractorApi(id, payload);
            set((state) => ({
                contractors: state.contractors.map(c => (c.id === id ? mapApiToInternal(updated) : c)),
            }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to update contractor';
            set({ error: msg });
            throw error;
        }
    },

    deleteContractor: async (id) => {
        try {
            await apiDeleteContractor(id);
            set((state) => ({ contractors: state.contractors.filter(c => c.id !== id) }));
        } catch (error: any) {
            const msg = error.response?.data?.detail || error.message || 'Failed to delete contractor';
            set({ error: msg });
            throw error;
        }
    },

    getActiveContractors: () => get().contractors.filter(c => c.status === 'active'),
}));
