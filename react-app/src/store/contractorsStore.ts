import { create } from 'zustand';
import {
    getContractors,
    getContractorOptions,
    createContractor,
    updateContractor as updateContractorApi,
    deleteContractor as apiDeleteContractor,
    Contractor as ApiContractor,
    CreateContractorPayload,
} from '../services/api';
import { getErrorMessage } from '../utils/errorUtils';

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
    row_version?: number | null;     // optimistic lock (utils/rowVersion.ts)
}

// What every module's pickers / filters / lists use (GET /contractors/options): no contact details, served to any
// signed-in user. The full Contractor (above) is only loaded by the Contractors management page.
export interface ContractorOption {
    id: string;
    name: string;
    abbreviation: string;
    scope: string;
    status: 'active' | 'inactive';
}

// 'Active', 'active', 'ACTIVE' all exist in stored data — compare case-insensitively (a strict === 'active' hid
// contractors created through the Contractors page, which saves 'Active').
const isActiveStatus = (status?: string | null) => (status || '').trim().toLowerCase() === 'active';

const mapOption = (data: { id: string; name: string; abbreviation?: string | null; scope?: string | null; status?: string | null }): ContractorOption => ({
    id: data.id,
    name: data.name,
    abbreviation: data.abbreviation || '',
    scope: data.scope || '',
    status: isActiveStatus(data.status) ? 'active' : 'inactive',
});

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
    status: isActiveStatus(data.status) ? 'active' : 'inactive',
    row_version: data.row_version ?? null,
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
    contractors: Contractor[];   // full records — Contractors management page only (contractors:view:all)
    error: string | null;
    options: ContractorOption[]; // every module's pickers / filters / lists
    optionsLoaded: boolean;
    optionsError: string | null;

    // Actions
    fetchContractors: () => Promise<void>;
    fetchOptions: () => Promise<void>;
    addContractor: (contractor: Omit<Contractor, 'id'>) => Promise<void>;
    updateContractor: (id: string, contractor: Partial<Contractor>, rowVersion?: number | null) => Promise<void>;
    deleteContractor: (id: string) => Promise<void>;
    getActiveContractors: () => ContractorOption[];
    clearError: () => void;
    setError: (err: string | null) => void;
}

export const useContractorsStore = create<ContractorsState>((set, get) => ({
    contractors: [],
    error: null,
    options: [],
    optionsLoaded: false,
    optionsError: null,

    clearError: () => set({ error: null }),
    setError: (error: string | null) => set({ error }),

    fetchContractors: async () => {
        try {
            const data = await getContractors();
            // a load that worked clears an earlier failure (a "failed" check read it as failed for ever — B3b)
            set({ contractors: data.map(mapApiToInternal), error: null });
        } catch (err: any) {
            set({ error: getErrorMessage(err, 'Failed to fetch contractors') });
        }
    },

    fetchOptions: async () => {
        try {
            const data = await getContractorOptions();
            set({ options: data.map(mapOption), optionsLoaded: true, optionsError: null });
        } catch (err: any) {
            // keep any list already loaded; the pickers stay usable with it
            set({ optionsError: getErrorMessage(err, 'Failed to fetch contractors') });
        }
    },

    // A refused or failed save goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-003); `error` is for list loads only.
    addContractor: async (contractor) => {
        const payload = mapInternalToApi(contractor);
        const newContractor = await createContractor(payload);
        set((state) => ({ contractors: [...state.contractors, mapApiToInternal(newContractor)] }));
        void get().fetchOptions();  // keep every module's pickers in step with the management page
    },

    updateContractor: async (id, updates, rowVersion) => {
        const { contractors } = get();
        const current = contractors.find(c => c.id === id);
        if (!current) return;

        const merged = { ...current, ...updates };
        const payload = mapInternalToApi(merged);
        const updated = await updateContractorApi(id, payload, rowVersion);
        set((state) => ({
            contractors: state.contractors.map(c => (c.id === id ? mapApiToInternal(updated) : c)),
        }));
        void get().fetchOptions();
    },

    deleteContractor: async (id) => {
        // A refused or failed delete goes to the caller, which shows it in the refusal dialog (REFUSAL-DIALOG-2026-001).
        await apiDeleteContractor(id);
        set((state) => ({ contractors: state.contractors.filter(c => c.id !== id) }));
        void get().fetchOptions();
    },

    getActiveContractors: () => get().options.filter(c => c.status === 'active'),
}));
